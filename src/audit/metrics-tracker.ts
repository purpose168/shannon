// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * 指标跟踪器
 *
 * 管理 session.json，包含全面的计时、成本和验证指标。
 * 跟踪尝试级别的数据，提供完整的取证跟踪。
 */

import {
  generateSessionJsonPath,
  type SessionMetadata,
} from './utils.js';
import { atomicWrite, readJson, fileExists } from '../utils/file-io.js';
import { formatTimestamp, calculatePercentage } from '../utils/formatting.js';
import { AGENT_PHASE_MAP, type PhaseName } from '../session-manager.js';
import type { AgentName } from '../types/index.js';

interface AttemptData {
  attempt_number: number;
  duration_ms: number;
  cost_usd: number;
  success: boolean;
  timestamp: string;
  model?: string | undefined;
  error?: string | undefined;
}

interface AgentMetrics {
  status: 'in-progress' | 'success' | 'failed';
  attempts: AttemptData[];
  final_duration_ms: number;
  total_cost_usd: number;
  model?: string | undefined;
  checkpoint?: string | undefined;
}

interface PhaseMetrics {
  duration_ms: number;
  duration_percentage: number;
  cost_usd: number;
  agent_count: number;
}

interface SessionData {
  session: {
    id: string;
    webUrl: string;
    repoPath?: string;
    status: 'in-progress' | 'completed' | 'failed';
    createdAt: string;
    completedAt?: string;
  };
  metrics: {
    total_duration_ms: number;
    total_cost_usd: number;
    phases: Record<string, PhaseMetrics>;
    agents: Record<string, AgentMetrics>;
  };
}

interface AgentEndResult {
  attemptNumber: number;
  duration_ms: number;
  cost_usd: number;
  success: boolean;
  model?: string | undefined;
  error?: string | undefined;
  checkpoint?: string | undefined;
  isFinalAttempt?: boolean | undefined;
}

interface ActiveTimer {
  startTime: number;
  attemptNumber: number;
}

/**
 * MetricsTracker - 管理会话的指标
 */
export class MetricsTracker {
  private sessionMetadata: SessionMetadata;
  private sessionJsonPath: string;
  private data: SessionData | null = null;
  private activeTimers: Map<string, ActiveTimer> = new Map();

  constructor(sessionMetadata: SessionMetadata) {
    this.sessionMetadata = sessionMetadata;
    this.sessionJsonPath = generateSessionJsonPath(sessionMetadata);
  }

  /**
   * 初始化 session.json（幂等）
   */
  async initialize(): Promise<void> {
    // 检查 session.json 是否已存在
    const exists = await fileExists(this.sessionJsonPath);

    if (exists) {
      // 加载现有数据
      this.data = await readJson<SessionData>(this.sessionJsonPath);
    } else {
      // 创建新的 session.json
      this.data = this.createInitialData();
      await this.save();
    }
  }

  /**
   * 创建初始 session.json 结构
   */
  private createInitialData(): SessionData {
    const sessionData: SessionData = {
      session: {
        id: this.sessionMetadata.id,
        webUrl: this.sessionMetadata.webUrl,
        status: 'in-progress',
        createdAt: (this.sessionMetadata as { createdAt?: string }).createdAt || formatTimestamp(),
      },
      metrics: {
        total_duration_ms: 0,
        total_cost_usd: 0,
        phases: {}, // 阶段级聚合
        agents: {}, // 智能体级指标
      },
    };
    // 仅在存在时添加 repoPath
    if (this.sessionMetadata.repoPath) {
      sessionData.session.repoPath = this.sessionMetadata.repoPath;
    }
    return sessionData;
  }

  /**
   * 开始跟踪智能体执行
   */
  startAgent(agentName: string, attemptNumber: number): void {
    this.activeTimers.set(agentName, {
      startTime: Date.now(),
      attemptNumber,
    });
  }

  /**
   * 结束智能体执行并更新指标
   */
  async endAgent(agentName: string, result: AgentEndResult): Promise<void> {
    if (!this.data) {
      throw new Error('MetricsTracker 未初始化');
    }

    // 初始化智能体指标（如果不存在）
    const existingAgent = this.data.metrics.agents[agentName];
    const agent = existingAgent ?? {
      status: 'in-progress' as const,
      attempts: [],
      final_duration_ms: 0,
      total_cost_usd: 0,
    };
    this.data.metrics.agents[agentName] = agent;

    // 添加尝试数据
    const attempt: AttemptData = {
      attempt_number: result.attemptNumber,
      duration_ms: result.duration_ms,
      cost_usd: result.cost_usd,
      success: result.success,
      timestamp: formatTimestamp(),
    };

    if (result.model) {
      attempt.model = result.model;
    }

    if (result.error) {
      attempt.error = result.error;
    }

    agent.attempts.push(attempt);

    // 更新总成本（包括失败的尝试）
    agent.total_cost_usd = agent.attempts.reduce((sum, a) => sum + a.cost_usd, 0);

    // 如果成功，更新最终指标和状态
    if (result.success) {
      agent.status = 'success';
      agent.final_duration_ms = result.duration_ms;

      if (result.model) {
        agent.model = result.model;
      }

      if (result.checkpoint) {
        agent.checkpoint = result.checkpoint;
      }
    } else {
      // 如果这是最后一次尝试，标记为失败
      if (result.isFinalAttempt) {
        agent.status = 'failed';
      }
    }

    // 清除活动计时器
    this.activeTimers.delete(agentName);

    // 重新计算聚合数据
    this.recalculateAggregations();

    // 保存到磁盘
    await this.save();
  }

  /**
   * 更新会话状态
   */
  async updateSessionStatus(status: 'in-progress' | 'completed' | 'failed'): Promise<void> {
    if (!this.data) return;

    this.data.session.status = status;

    if (status === 'completed' || status === 'failed') {
      this.data.session.completedAt = formatTimestamp();
    }

    await this.save();
  }

  /**
   * 重新计算聚合数据（总持续时间、总成本、阶段）
   */
  private recalculateAggregations(): void {
    if (!this.data) return;

    const agents = this.data.metrics.agents;

    // 只计算成功的智能体
    const successfulAgents = Object.entries(agents).filter(
      ([, data]) => data.status === 'success'
    );

    // 计算总持续时间和成本
    const totalDuration = successfulAgents.reduce(
      (sum, [, data]) => sum + data.final_duration_ms,
      0
    );

    const totalCost = successfulAgents.reduce((sum, [, data]) => sum + data.total_cost_usd, 0);

    this.data.metrics.total_duration_ms = totalDuration;
    this.data.metrics.total_cost_usd = totalCost;

    // 计算阶段级指标
    this.data.metrics.phases = this.calculatePhaseMetrics(successfulAgents);
  }

  /**
   * 计算阶段级指标
   */
  private calculatePhaseMetrics(
    successfulAgents: Array<[string, AgentMetrics]>
  ): Record<string, PhaseMetrics> {
    const phases: Record<PhaseName, AgentMetrics[]> = {
      'pre-recon': [],
      'recon': [],
      'vulnerability-analysis': [],
      'exploitation': [],
      'reporting': [],
    };

    // 使用导入的 AGENT_PHASE_MAP 按阶段分组智能体
    for (const [agentName, agentData] of successfulAgents) {
      const phase = AGENT_PHASE_MAP[agentName as AgentName];
      if (phase) {
        phases[phase].push(agentData);
      }
    }

    // 计算每个阶段的指标
    const phaseMetrics: Record<string, PhaseMetrics> = {};
    const totalDuration = this.data!.metrics.total_duration_ms;

    for (const [phaseName, agentList] of Object.entries(phases)) {
      if (agentList.length === 0) continue;

      const phaseDuration = agentList.reduce((sum, agent) => sum + agent.final_duration_ms, 0);
      const phaseCost = agentList.reduce((sum, agent) => sum + agent.total_cost_usd, 0);

      phaseMetrics[phaseName] = {
        duration_ms: phaseDuration,
        duration_percentage: calculatePercentage(phaseDuration, totalDuration),
        cost_usd: phaseCost,
        agent_count: agentList.length,
      };
    }

    return phaseMetrics;
  }

  /**
   * 获取当前指标
   */
  getMetrics(): SessionData {
    return JSON.parse(JSON.stringify(this.data)) as SessionData;
  }

  /**
   * 保存指标到 session.json（原子写入）
   */
  private async save(): Promise<void> {
    if (!this.data) return;
    await atomicWrite(this.sessionJsonPath, this.data);
  }

  /**
   * 从磁盘重新加载指标
   */
  async reload(): Promise<void> {
    this.data = await readJson<SessionData>(this.sessionJsonPath);
  }
}