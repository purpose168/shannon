// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * 审计会话 - 主要外观类
 *
 * 协调日志记录器、指标跟踪器和并发控制，实现全面的
 * 崩溃安全审计日志记录。
 */

import { AgentLogger } from './logger.js';
import { WorkflowLogger, type AgentLogDetails, type WorkflowSummary } from './workflow-logger.js';
import { MetricsTracker } from './metrics-tracker.js';
import { initializeAuditStructure, type SessionMetadata } from './utils.js';
import { formatTimestamp } from '../utils/formatting.js';
import { SessionMutex } from '../utils/concurrency.js';

// 全局互斥锁实例
const sessionMutex = new SessionMutex();

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

/**
 * AuditSession - 主要审计系统外观类
 */
export class AuditSession {
  private sessionMetadata: SessionMetadata;
  private sessionId: string;
  private metricsTracker: MetricsTracker;
  private workflowLogger: WorkflowLogger;
  private currentLogger: AgentLogger | null = null;
  private currentAgentName: string | null = null;
  private initialized: boolean = false;

  constructor(sessionMetadata: SessionMetadata) {
    this.sessionMetadata = sessionMetadata;
    this.sessionId = sessionMetadata.id;

    // 验证必需字段
    if (!this.sessionId) {
      throw new Error('sessionMetadata.id 是必需的');
    }
    if (!this.sessionMetadata.webUrl) {
      throw new Error('sessionMetadata.webUrl 是必需的');
    }

    // 组件
    this.metricsTracker = new MetricsTracker(sessionMetadata);
    this.workflowLogger = new WorkflowLogger(sessionMetadata);
  }

  /**
   * 初始化审计会话（创建目录，session.json）
   * 幂等且线程安全
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return; // 已经初始化
    }

    // 创建目录结构
    await initializeAuditStructure(this.sessionMetadata);

    // 初始化指标跟踪器（加载或创建 session.json）
    await this.metricsTracker.initialize();

    // 初始化工作流日志记录器
    await this.workflowLogger.initialize();

    this.initialized = true;
  }

  /**
   * 确保初始化（惰性初始化的辅助方法）
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 开始智能体执行
   */
  async startAgent(
    agentName: string,
    promptContent: string,
    attemptNumber: number = 1
  ): Promise<void> {
    await this.ensureInitialized();

    // 保存提示快照（仅在第一次尝试时）
    if (attemptNumber === 1) {
      await AgentLogger.savePrompt(this.sessionMetadata, agentName, promptContent);
    }

    // 跟踪当前智能体名称用于工作流日志
    this.currentAgentName = agentName;

    // 为此尝试创建并初始化日志记录器
    this.currentLogger = new AgentLogger(this.sessionMetadata, agentName, attemptNumber);
    await this.currentLogger.initialize();

    // 开始指标跟踪
    this.metricsTracker.startAgent(agentName, attemptNumber);

    // 记录开始事件
    await this.currentLogger.logEvent('agent_start', {
      agentName,
      attemptNumber,
      timestamp: formatTimestamp(),
    });

    // 记录到统一工作流日志
    await this.workflowLogger.logAgent(agentName, 'start', { attemptNumber });
  }

  /**
   * 在智能体执行期间记录事件
   */
  async logEvent(eventType: string, eventData: unknown): Promise<void> {
    if (!this.currentLogger) {
      throw new Error('没有活动的日志记录器。请先调用 startAgent()。');
    }

    // 记录到智能体特定的日志文件（JSON 格式）
    await this.currentLogger.logEvent(eventType, eventData);

    // 同时记录到统一工作流日志（人类可读格式）
    const data = eventData as Record<string, unknown>;
    const agentName = this.currentAgentName || 'unknown';
    switch (eventType) {
      case 'tool_start':
        await this.workflowLogger.logToolStart(
          agentName,
          String(data.toolName || ''),
          data.parameters
        );
        break;
      case 'llm_response':
        await this.workflowLogger.logLlmResponse(
          agentName,
          Number(data.turn || 0),
          String(data.content || '')
        );
        break;
      // tool_end 和 error 事件有意不记录到工作流日志
      // 以减少噪音 - 智能体完成消息捕获结果
    }
  }

  /**
   * 结束智能体执行（互斥锁保护）
   */
  async endAgent(agentName: string, result: AgentEndResult): Promise<void> {
    // 记录结束事件
    if (this.currentLogger) {
      await this.currentLogger.logEvent('agent_end', {
        agentName,
        success: result.success,
        duration_ms: result.duration_ms,
        cost_usd: result.cost_usd,
        timestamp: formatTimestamp(),
      });

      // 关闭日志记录器
      await this.currentLogger.close();
      this.currentLogger = null;
    }

    // 重置当前智能体名称
    this.currentAgentName = null;

    // 记录到统一工作流日志
    const agentLogDetails: AgentLogDetails = {
      attemptNumber: result.attemptNumber,
      duration_ms: result.duration_ms,
      cost_usd: result.cost_usd,
      success: result.success,
      ...(result.error !== undefined && { error: result.error }),
    };
    await this.workflowLogger.logAgent(agentName, 'end', agentLogDetails);

    // 互斥锁保护的 session.json 更新
    const unlock = await sessionMutex.lock(this.sessionId);
    try {
      // 在互斥锁内重新加载，以防止在并行利用阶段丢失更新
      await this.metricsTracker.reload();

      // 更新指标
      await this.metricsTracker.endAgent(agentName, result);
    } finally {
      unlock();
    }
  }

  /**
   * 更新会话状态
   */
  async updateSessionStatus(status: 'in-progress' | 'completed' | 'failed'): Promise<void> {
    await this.ensureInitialized();

    const unlock = await sessionMutex.lock(this.sessionId);
    try {
      await this.metricsTracker.reload();
      await this.metricsTracker.updateSessionStatus(status);
    } finally {
      unlock();
    }
  }

  /**
   * 获取当前指标（只读）
   */
  async getMetrics(): Promise<unknown> {
    await this.ensureInitialized();
    return this.metricsTracker.getMetrics();
  }

  /**
   * 记录阶段开始到统一工作流日志
   */
  async logPhaseStart(phase: string): Promise<void> {
    await this.ensureInitialized();
    await this.workflowLogger.logPhase(phase, 'start');
  }

  /**
   * 记录阶段完成到统一工作流日志
   */
  async logPhaseComplete(phase: string): Promise<void> {
    await this.ensureInitialized();
    await this.workflowLogger.logPhase(phase, 'complete');
  }

  /**
   * 记录工作流完成到统一工作流日志
   */
  async logWorkflowComplete(summary: WorkflowSummary): Promise<void> {
    await this.ensureInitialized();
    await this.workflowLogger.logWorkflowComplete(summary);
  }
}