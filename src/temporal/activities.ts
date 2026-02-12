// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Shannon 智能体执行的 Temporal 活动。
 *
 * 每个活动包装单个智能体执行，包含：
 * - 心跳循环（2秒间隔）以信号工作器活跃度
 * - 每次尝试的 Git 检查点/回滚/提交
 * - 用于 Temporal 重试行为的错误分类
 * - 审计会话日志记录
 *
 * Temporal 根据错误分类处理重试：
 * - 可重试：BillingError、TransientError（429、5xx、网络）
 * - 不可重试：AuthenticationError、PermissionError、ConfigurationError 等
 */

import { heartbeat, ApplicationFailure, Context } from '@temporalio/activity';
import chalk from 'chalk';

// 防止 Temporal protobuf 缓冲区溢出的最大长度
const MAX_ERROR_MESSAGE_LENGTH = 2000;
const MAX_STACK_TRACE_LENGTH = 1000;

// 输出验证错误的最大重试次数（智能体未保存交付物）
// 低于默认的 50，因为这不太可能自愈
const MAX_OUTPUT_VALIDATION_RETRIES = 3;

/**
 * 截断错误消息以防止 Temporal 序列化中的缓冲区溢出。
 */
function truncateErrorMessage(message: string): string {
  if (message.length <= MAX_ERROR_MESSAGE_LENGTH) {
    return message;
  }
  return message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 20) + '\n[truncated]';
}

/**
 * 截断 ApplicationFailure 上的堆栈跟踪以防止缓冲区溢出。
 */
function truncateStackTrace(failure: ApplicationFailure): void {
  if (failure.stack && failure.stack.length > MAX_STACK_TRACE_LENGTH) {
    failure.stack = failure.stack.slice(0, MAX_STACK_TRACE_LENGTH) + '\n[stack truncated]';
  }
}

import {
  runClaudePrompt,
  validateAgentOutput,
  type ClaudePromptResult,
} from '../ai/claude-executor.js';
import { loadPrompt } from '../prompts/prompt-manager.js';
import { parseConfig, distributeConfig } from '../config-parser.js';
import { classifyErrorForTemporal } from '../error-handling.js';
import {
  safeValidateQueueAndDeliverable,
  type VulnType,
  type ExploitationDecision,
} from '../queue-validation.js';
import {
  createGitCheckpoint,
  commitGitSuccess,
  rollbackGitWorkspace,
  getGitCommitHash,
} from '../utils/git-manager.js';
import { assembleFinalReport, injectModelIntoReport } from '../phases/reporting.js';
import { getPromptNameForAgent } from '../types/agents.js';
import { AuditSession } from '../audit/index.js';
import type { WorkflowSummary } from '../audit/workflow-logger.js';
import type { AgentName } from '../types/agents.js';
import type { AgentMetrics } from './shared.js';
import type { DistributedConfig } from '../types/config.js';
import type { SessionMetadata } from '../audit/utils.js';

const HEARTBEAT_INTERVAL_MS = 2000; // 必须小于 heartbeatTimeout（生产环境 10 分钟，测试环境 5 分钟）

/**
 * 所有智能体活动的输入。
 * 匹配 PipelineInput，但带有审计关联所需的必填 workflowId。
 */
export interface ActivityInput {
  webUrl: string;
  repoPath: string;
  configPath?: string;
  outputPath?: string;
  pipelineTestingMode?: boolean;
  workflowId: string;
}

/**
 * 核心活动实现。
 *
 * 执行单个智能体，包含：
 * 1. 心跳循环以保持工作器活跃
 * 2. 配置加载（如果提供了 configPath）
 * 3. 审计会话初始化
 * 4. 提示加载
 * 5. 执行前的 Git 检查点
 * 6. 智能体执行（单次尝试）
 * 7. 输出验证
 * 8. 成功时提交 Git，失败时回滚
 * 9. 用于 Temporal 重试的错误分类
 */
async function runAgentActivity(
  agentName: AgentName,
  input: ActivityInput
): Promise<AgentMetrics> {
  const {
    webUrl,
    repoPath,
    configPath,
    outputPath,
    pipelineTestingMode = false,
    workflowId,
  } = input;

  const startTime = Date.now();

  // 从 Temporal 上下文获取尝试次数（自动跟踪重试）
  const attemptNumber = Context.current().info.attempt;

  // 心跳循环 - 向 Temporal 服务器信号工作器存活
  const heartbeatInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    heartbeat({ agent: agentName, elapsedSeconds: elapsed, attempt: attemptNumber });
  }, HEARTBEAT_INTERVAL_MS);

  try {
    // 1. 加载配置（如果提供）
    let distributedConfig: DistributedConfig | null = null;
    if (configPath) {
      try {
        const config = await parseConfig(configPath);
        distributedConfig = distributeConfig(config);
      } catch (err) {
        throw new Error(`加载配置 ${configPath} 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 2. 构建审计会话元数据
    const sessionMetadata: SessionMetadata = {
      id: workflowId,
      webUrl,
      repoPath,
      ...(outputPath && { outputPath }),
    };

    // 3. 初始化审计会话（幂等，在重试中安全）
    const auditSession = new AuditSession(sessionMetadata);
    await auditSession.initialize();

    // 4. 加载提示
    const promptName = getPromptNameForAgent(agentName);
    const prompt = await loadPrompt(
      promptName,
      { webUrl, repoPath },
      distributedConfig,
      pipelineTestingMode
    );

    // 5. 执行前创建 git 检查点
    await createGitCheckpoint(repoPath, agentName, attemptNumber);
    await auditSession.startAgent(agentName, prompt, attemptNumber);

    // 6. 执行智能体（单次尝试 - Temporal 处理重试）
    const result: ClaudePromptResult = await runClaudePrompt(
      prompt,
      repoPath,
      '', // context
      agentName, // description
      agentName,
      chalk.cyan,
      sessionMetadata,
      auditSession,
      attemptNumber
    );

    // 6.5. 健全性检查：检测所有检测层都漏掉的支出上限
    // 纵深防御：成功的智能体执行不应出现 ≤2 轮且 $0 成本
    if (result.success && (result.turns ?? 0) <= 2 && (result.cost || 0) === 0) {
      const resultText = result.result || '';
      const looksLikeBillingError = /spending|cap|limit|budget|resets/i.test(resultText);

      if (looksLikeBillingError) {
        await rollbackGitWorkspace(repoPath, '检测到支出上限');
        await auditSession.endAgent(agentName, {
          attemptNumber,
          duration_ms: result.duration,
          cost_usd: 0,
          success: false,
          model: result.model,
          error: `可能达到支出上限: ${resultText.slice(0, 100)}`,
        });
        // 抛出账单错误，让 Temporal 用长退避重试
        throw new Error(`可能达到支出上限: ${resultText.slice(0, 100)}`);
      }
    }

    // 7. 处理执行失败
    if (!result.success) {
      await rollbackGitWorkspace(repoPath, '执行失败');
      await auditSession.endAgent(agentName, {
        attemptNumber,
        duration_ms: result.duration,
        cost_usd: result.cost || 0,
        success: false,
        model: result.model,
        error: result.error || '执行失败',
      });
      throw new Error(result.error || '智能体执行失败');
    }

    // 8. 验证输出
    const validationPassed = await validateAgentOutput(result, agentName, repoPath);
    if (!validationPassed) {
      await rollbackGitWorkspace(repoPath, '验证失败');
      await auditSession.endAgent(agentName, {
        attemptNumber,
        duration_ms: result.duration,
        cost_usd: result.cost || 0,
        success: false,
        model: result.model,
        error: '输出验证失败',
      });

      // 限制输出验证重试（不太可能自愈）
      if (attemptNumber >= MAX_OUTPUT_VALIDATION_RETRIES) {
        throw ApplicationFailure.nonRetryable(
          `智能体 ${agentName} 在 ${attemptNumber} 次尝试后输出验证失败`,
          'OutputValidationError',
          [{ agentName, attemptNumber, elapsed: Date.now() - startTime }]
        );
      }
      // 让 Temporal 重试（将被分类为 OutputValidationError）
      throw new Error(`智能体 ${agentName} 输出验证失败`);
    }

    // 9. 成功 - 提交并记录
    const commitHash = await getGitCommitHash(repoPath);
    await auditSession.endAgent(agentName, {
      attemptNumber,
      duration_ms: result.duration,
      cost_usd: result.cost || 0,
      success: true,
      model: result.model,
      ...(commitHash && { checkpoint: commitHash }),
    });
    await commitGitSuccess(repoPath, agentName);

    // 10. 返回指标
    return {
      durationMs: Date.now() - startTime,
      inputTokens: null, // 目前 SDK 包装器未暴露
      outputTokens: null,
      costUsd: result.cost ?? null,
      numTurns: result.turns ?? null,
      model: result.model,
    };
  } catch (error) {
    // Temporal 重试前回滚 git 工作区以确保干净状态
    try {
      await rollbackGitWorkspace(repoPath, '错误恢复');
    } catch (rollbackErr) {
      // 记录但不失败 - 回滚是尽力而为
      console.error(`为 ${agentName} 回滚 git 工作区失败:`, rollbackErr);
    }

    // 如果错误已经是 ApplicationFailure（例如，来自我们的重试限制逻辑），
    // 直接重新抛出，不重新分类
    if (error instanceof ApplicationFailure) {
      throw error;
    }

    // 为 Temporal 重试行为分类错误
    const classified = classifyErrorForTemporal(error);
    // 截断消息以防止 protobuf 缓冲区溢出
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = truncateErrorMessage(rawMessage);

    if (classified.retryable) {
      // Temporal 将使用配置的退避重试
      const failure = ApplicationFailure.create({
        message,
        type: classified.type,
        details: [{ agentName, attemptNumber, elapsed: Date.now() - startTime }],
      });
      truncateStackTrace(failure);
      throw failure;
    } else {
      // 立即失败 - 不重试
      const failure = ApplicationFailure.nonRetryable(message, classified.type, [
        { agentName, attemptNumber, elapsed: Date.now() - startTime },
      ]);
      truncateStackTrace(failure);
      throw failure;
    }
  } finally {
    clearInterval(heartbeatInterval);
  }
}

// === 各个智能体活动导出 ===
// 每个函数都是围绕 runAgentActivity 的薄包装器，带有智能体名称。

export async function runPreReconAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('pre-recon', input);
}

export async function runReconAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('recon', input);
}

export async function runInjectionVulnAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('injection-vuln', input);
}

export async function runXssVulnAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('xss-vuln', input);
}

export async function runAuthVulnAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('auth-vuln', input);
}

export async function runSsrfVulnAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('ssrf-vuln', input);
}

export async function runAuthzVulnAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('authz-vuln', input);
}

export async function runInjectionExploitAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('injection-exploit', input);
}

export async function runXssExploitAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('xss-exploit', input);
}

export async function runAuthExploitAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('auth-exploit', input);
}

export async function runSsrfExploitAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('ssrf-exploit', input);
}

export async function runAuthzExploitAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('authz-exploit', input);
}

export async function runReportAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('report', input);
}

/**
 * 通过连接利用证据文件组装最终报告。
 * 必须在 runReportAgent 之前调用，以创建报告智能体将修改的文件。
 */
export async function assembleReportActivity(input: ActivityInput): Promise<void> {
  const { repoPath } = input;
  console.log(chalk.blue('📝 从专业智能体组装交付物...'));
  try {
    await assembleFinalReport(repoPath);
  } catch (error) {
    const err = error as Error;
    console.log(chalk.yellow(`⚠️ 组装最终报告错误: ${err.message}`));
    // 不抛出 - 即使没有利用文件，报告智能体仍然可以创建内容
  }
}

/**
 * 将模型元数据注入最终报告。
 * 必须在 runReportAgent 之后调用，以将模型信息添加到执行摘要。
 */
export async function injectReportMetadataActivity(input: ActivityInput): Promise<void> {
  const { repoPath, outputPath } = input;
  if (!outputPath) {
    console.log(chalk.yellow('⚠️ 未提供输出路径，跳过模型注入'));
    return;
  }
  try {
    await injectModelIntoReport(repoPath, outputPath);
  } catch (error) {
    const err = error as Error;
    console.log(chalk.yellow(`⚠️ 将模型注入报告错误: ${err.message}`));
    // 不抛出 - 这是一个非关键增强
  }
}

/**
 * 检查是否应该为给定的漏洞类型运行利用。
 * 读取漏洞队列文件并返回决策。
 *
 * 此活动允许工作流在未发现漏洞时完全跳过利用智能体，
 * 节省 API 调用和时间。
 *
 * 错误处理：
 * - 可重试错误（缺少文件、无效 JSON）：重新抛出以让 Temporal 重试
 * - 不可重试错误：优雅地跳过利用
 */
export async function checkExploitationQueue(
  input: ActivityInput,
  vulnType: VulnType
): Promise<ExploitationDecision> {
  const { repoPath } = input;

  const result = await safeValidateQueueAndDeliverable(vulnType, repoPath);

  if (result.success && result.data) {
    const { shouldExploit, vulnerabilityCount } = result.data;
    console.log(
      chalk.blue(
        `🔍 ${vulnType}: ${shouldExploit ? `发现 ${vulnerabilityCount} 个漏洞` : '未发现漏洞，跳过利用'}`
      )
    );
    return result.data;
  }

  // 验证失败 - 检查我们是否应该重试或跳过
  const error = result.error;
  if (error?.retryable) {
    // 重新抛出可重试错误，让 Temporal 可以重试漏洞智能体
    console.log(chalk.yellow(`⚠️ ${vulnType}: ${error.message} (重试中)`));
    throw error;
  }

  // 不可重试错误 - 优雅地跳过利用
  console.log(
    chalk.yellow(`${vulnType}: ${error?.message ?? '未知错误'}, 跳过利用`)
  );
  return {
    shouldExploit: false,
    shouldRetry: false,
    vulnerabilityCount: 0,
    vulnType,
  };
}

/**
 * 将阶段转换记录到统一的工作流日志。
 * 在每个工作流的阶段边界调用。
 */
export async function logPhaseTransition(
  input: ActivityInput,
  phase: string,
  event: 'start' | 'complete'
): Promise<void> {
  const { webUrl, repoPath, outputPath, workflowId } = input;

  const sessionMetadata: SessionMetadata = {
    id: workflowId,
    webUrl,
    repoPath,
    ...(outputPath && { outputPath }),
  };

  const auditSession = new AuditSession(sessionMetadata);
  await auditSession.initialize();

  if (event === 'start') {
    await auditSession.logPhaseStart(phase);
  } else {
    await auditSession.logPhaseComplete(phase);
  }
}

/**
 * 将带有完整摘要的工作流完成记录到统一的工作流日志。
 * 在工作流结束时调用以写入摘要明细。
 */
export async function logWorkflowComplete(
  input: ActivityInput,
  summary: WorkflowSummary
): Promise<void> {
  const { webUrl, repoPath, outputPath, workflowId } = input;

  const sessionMetadata: SessionMetadata = {
    id: workflowId,
    webUrl,
    repoPath,
    ...(outputPath && { outputPath }),
  };

  const auditSession = new AuditSession(sessionMetadata);
  await auditSession.initialize();
  await auditSession.logWorkflowComplete(summary);
}