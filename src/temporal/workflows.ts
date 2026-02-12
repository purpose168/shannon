// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Shannon 渗透测试管道的 Temporal 工作流。
 *
 * 编排渗透测试工作流：
 * 1. 预侦察（顺序）
 * 2. 侦察（顺序）
 * 3-4. 漏洞分析 + 利用（5个流水线对并行执行）
 *      每对：漏洞智能体 → 队列检查 → 条件利用
 *      无同步障碍 - 利用在其漏洞分析完成后立即开始
 * 5. 报告生成（顺序）
 *
 * 特性：
 * - 通过 getProgress 查询状态
 * - 对临时/计费错误的自动重试和退避
 * - 对永久错误的不可重试分类
 * - 通过 workflowId 进行审计关联
 * - 优雅的故障处理：一个管道失败时其他管道继续
 */

import {
  proxyActivities,
  setHandler,
  workflowInfo,
} from '@temporalio/workflow';
import type * as activities from './activities.js';
import type { ActivityInput } from './activities.js';
import {
  getProgress,
  type PipelineInput,
  type PipelineState,
  type PipelineProgress,
  type PipelineSummary,
  type VulnExploitPipelineResult,
  type AgentMetrics,
} from './shared.js';
import type { VulnType } from '../queue-validation.js';

// 生产环境的重试配置（长时间间隔用于计费恢复）
const PRODUCTION_RETRY = {
  initialInterval: '5 minutes',
  maximumInterval: '30 minutes',
  backoffCoefficient: 2,
  maximumAttempts: 50,
  nonRetryableErrorTypes: [
    'AuthenticationError',
    'PermissionError',
    'InvalidRequestError',
    'RequestTooLargeError',
    'ConfigurationError',
    'InvalidTargetError',
    'ExecutionLimitError',
  ],
};

// 管道测试的重试配置（快速迭代）
const TESTING_RETRY = {
  initialInterval: '10 seconds',
  maximumInterval: '30 seconds',
  backoffCoefficient: 2,
  maximumAttempts: 5,
  nonRetryableErrorTypes: PRODUCTION_RETRY.nonRetryableErrorTypes,
};

// 带有生产环境重试配置的活动智能体（默认）
const acts = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 hours',
  heartbeatTimeout: '60 minutes', // 为子智能体执行延长（SDK 在 Task 工具调用期间阻塞事件循环）
  retry: PRODUCTION_RETRY,
});

// 带有测试重试配置的活动智能体（快速）
const testActs = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
  heartbeatTimeout: '30 minutes', // 为测试中的子智能体执行延长
  retry: TESTING_RETRY,
});

/**
 * 从当前管道状态计算聚合指标。
 * 在成功和失败时都调用以提供部分指标。
 */
function computeSummary(state: PipelineState): PipelineSummary {
  const metrics = Object.values(state.agentMetrics);
  return {
    totalCostUsd: metrics.reduce((sum, m) => sum + (m.costUsd ?? 0), 0),
    totalDurationMs: Date.now() - state.startTime,
    totalTurns: metrics.reduce((sum, m) => sum + (m.numTurns ?? 0), 0),
    agentCount: state.completedAgents.length,
  };
}

export async function pentestPipelineWorkflow(
  input: PipelineInput
): Promise<PipelineState> {
  const { workflowId } = workflowInfo();

  // 根据测试模式选择活动智能体
  // 管道测试使用快速重试间隔（10秒）进行快速迭代
  const a = input.pipelineTestingMode ? testActs : acts;

  // 工作流状态（可查询）
  const state: PipelineState = {
    status: 'running',
    currentPhase: null,
    currentAgent: null,
    completedAgents: [],
    failedAgent: null,
    error: null,
    startTime: Date.now(),
    agentMetrics: {},
    summary: null,
  };

  // 注册用于实时进度检查的查询处理器
  setHandler(getProgress, (): PipelineProgress => ({
    ...state,
    workflowId,
    elapsedMs: Date.now() - state.startTime,
  }));

  // 构建带有审计关联所需 workflowId 的 ActivityInput
  // 活动需要 workflowId（非可选），PipelineInput 使其可选
  // 使用扩展语法有条件地包含可选属性（exactOptionalPropertyTypes）
  const activityInput: ActivityInput = {
    webUrl: input.webUrl,
    repoPath: input.repoPath,
    workflowId,
    ...(input.configPath !== undefined && { configPath: input.configPath }),
    ...(input.outputPath !== undefined && { outputPath: input.outputPath }),
    ...(input.pipelineTestingMode !== undefined && {
      pipelineTestingMode: input.pipelineTestingMode,
    }),
  };

  try {
    // === 阶段 1: 预侦察 ===
    state.currentPhase = 'pre-recon';
    state.currentAgent = 'pre-recon';
    await a.logPhaseTransition(activityInput, 'pre-recon', 'start');
    state.agentMetrics['pre-recon'] =
      await a.runPreReconAgent(activityInput);
    state.completedAgents.push('pre-recon');
    await a.logPhaseTransition(activityInput, 'pre-recon', 'complete');

    // === 阶段 2: 侦察 ===
    state.currentPhase = 'recon';
    state.currentAgent = 'recon';
    await a.logPhaseTransition(activityInput, 'recon', 'start');
    state.agentMetrics['recon'] = await a.runReconAgent(activityInput);
    state.completedAgents.push('recon');
    await a.logPhaseTransition(activityInput, 'recon', 'complete');

    // === 阶段 3-4: 漏洞分析 + 利用（流水线） ===
    // 每种漏洞类型作为独立管道运行：
    // 漏洞智能体 → 队列检查 → 条件利用智能体
    // 这消除了阶段之间的同步障碍 - 每个利用
    // 在其漏洞智能体完成后立即开始，不等待所有完成。
    state.currentPhase = 'vulnerability-exploitation';
    state.currentAgent = 'pipelines';
    await a.logPhaseTransition(activityInput, 'vulnerability-exploitation', 'start');

    // 辅助函数：运行单个漏洞→利用管道
    async function runVulnExploitPipeline(
      vulnType: VulnType,
      runVulnAgent: () => Promise<AgentMetrics>,
      runExploitAgent: () => Promise<AgentMetrics>
    ): Promise<VulnExploitPipelineResult> {
      // 步骤 1: 运行漏洞智能体
      const vulnMetrics = await runVulnAgent();

      // 步骤 2: 检查利用队列（漏洞分析后立即开始）
      const decision = await a.checkExploitationQueue(activityInput, vulnType);

      // 步骤 3: 有条件地运行利用智能体
      let exploitMetrics: AgentMetrics | null = null;
      if (decision.shouldExploit) {
        exploitMetrics = await runExploitAgent();
      }

      return {
        vulnType,
        vulnMetrics,
        exploitMetrics,
        exploitDecision: {
          shouldExploit: decision.shouldExploit,
          vulnerabilityCount: decision.vulnerabilityCount,
        },
        error: null,
      };
    }

    // 并行运行所有 5 个管道，带有优雅的故障处理
    // Promise.allSettled 确保一个管道失败时其他管道继续
    const pipelineResults = await Promise.allSettled([
      runVulnExploitPipeline(
        'injection',
        () => a.runInjectionVulnAgent(activityInput),
        () => a.runInjectionExploitAgent(activityInput)
      ),
      runVulnExploitPipeline(
        'xss',
        () => a.runXssVulnAgent(activityInput),
        () => a.runXssExploitAgent(activityInput)
      ),
      runVulnExploitPipeline(
        'auth',
        () => a.runAuthVulnAgent(activityInput),
        () => a.runAuthExploitAgent(activityInput)
      ),
      runVulnExploitPipeline(
        'ssrf',
        () => a.runSsrfVulnAgent(activityInput),
        () => a.runSsrfExploitAgent(activityInput)
      ),
      runVulnExploitPipeline(
        'authz',
        () => a.runAuthzVulnAgent(activityInput),
        () => a.runAuthzExploitAgent(activityInput)
      ),
    ]);

    // 聚合所有管道的结果
    const failedPipelines: string[] = [];
    for (const result of pipelineResults) {
      if (result.status === 'fulfilled') {
        const { vulnType, vulnMetrics, exploitMetrics } = result.value;

        // 记录漏洞智能体指标
        if (vulnMetrics) {
          state.agentMetrics[`${vulnType}-vuln`] = vulnMetrics;
          state.completedAgents.push(`${vulnType}-vuln`);
        }

        // 记录利用智能体指标（如果运行了）
        if (exploitMetrics) {
          state.agentMetrics[`${vulnType}-exploit`] = exploitMetrics;
          state.completedAgents.push(`${vulnType}-exploit`);
        }
      } else {
        // 管道失败 - 记录错误但继续其他管道
        const errorMsg =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        failedPipelines.push(errorMsg);
      }
    }

    // 记录任何管道失败（工作流尽管失败仍继续）
    if (failedPipelines.length > 0) {
      console.log(
        `⚠️ ${failedPipelines.length} 个管道失败:`,
        failedPipelines
      );
    }

    // 更新阶段标记
    state.currentPhase = 'exploitation';
    state.currentAgent = null;
    await a.logPhaseTransition(activityInput, 'vulnerability-exploitation', 'complete');

    // === 阶段 5: 报告生成 ===
    state.currentPhase = 'reporting';
    state.currentAgent = 'report';
    await a.logPhaseTransition(activityInput, 'reporting', 'start');

    // 首先，从利用证据文件组装连接的报告
    await a.assembleReportActivity(activityInput);

    // 然后运行报告智能体以添加执行摘要并清理
    state.agentMetrics['report'] = await a.runReportAgent(activityInput);
    state.completedAgents.push('report');

    // 将模型元数据注入最终报告
    await a.injectReportMetadataActivity(activityInput);

    await a.logPhaseTransition(activityInput, 'reporting', 'complete');

    // === 完成 ===
    state.status = 'completed';
    state.currentPhase = null;
    state.currentAgent = null;
    state.summary = computeSummary(state);

    // 记录工作流完成摘要
    await a.logWorkflowComplete(activityInput, {
      status: 'completed',
      totalDurationMs: state.summary.totalDurationMs,
      totalCostUsd: state.summary.totalCostUsd,
      completedAgents: state.completedAgents,
      agentMetrics: Object.fromEntries(
        Object.entries(state.agentMetrics).map(([name, m]) => [
          name,
          { durationMs: m.durationMs, costUsd: m.costUsd },
        ])
      ),
    });

    return state;
  } catch (error) {
    state.status = 'failed';
    state.failedAgent = state.currentAgent;
    state.error = error instanceof Error ? error.message : String(error);
    state.summary = computeSummary(state);

    // 记录工作流失败摘要
    await a.logWorkflowComplete(activityInput, {
      status: 'failed',
      totalDurationMs: state.summary.totalDurationMs,
      totalCostUsd: state.summary.totalCostUsd,
      completedAgents: state.completedAgents,
      agentMetrics: Object.fromEntries(
        Object.entries(state.agentMetrics).map(([name, m]) => [
          name,
          { durationMs: m.durationMs, costUsd: m.costUsd },
        ])
      ),
      error: state.error ?? undefined,
    });

    throw error;
  }
}