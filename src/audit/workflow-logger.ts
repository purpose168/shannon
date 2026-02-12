// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * 工作流日志记录器
 *
 * 为每个工作流提供统一、人类可读的日志文件。
 * 针对并发工作流执行期间的 `tail -f` 查看进行了优化。
 */

import fs from 'fs';
import path from 'path';
import { generateWorkflowLogPath, ensureDirectory, type SessionMetadata } from './utils.js';
import { formatDuration, formatTimestamp } from '../utils/formatting.js';

export interface AgentLogDetails {
  attemptNumber?: number;
  duration_ms?: number;
  cost_usd?: number;
  success?: boolean;
  error?: string;
}

export interface AgentMetricsSummary {
  durationMs: number;
  costUsd: number | null;
}

export interface WorkflowSummary {
  status: 'completed' | 'failed';
  totalDurationMs: number;
  totalCostUsd: number;
  completedAgents: string[];
  agentMetrics: Record<string, AgentMetricsSummary>;
  error?: string;
}

/**
 * WorkflowLogger - 管理统一的工作流日志文件
 */
export class WorkflowLogger {
  private sessionMetadata: SessionMetadata;
  private logPath: string;
  private stream: fs.WriteStream | null = null;
  private initialized: boolean = false;

  constructor(sessionMetadata: SessionMetadata) {
    this.sessionMetadata = sessionMetadata;
    this.logPath = generateWorkflowLogPath(sessionMetadata);
  }

  /**
   * 初始化日志流（创建文件并写入头部）
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 确保目录存在
    await ensureDirectory(path.dirname(this.logPath));

    // 创建带有追加模式的写入流
    this.stream = fs.createWriteStream(this.logPath, {
      flags: 'a',
      encoding: 'utf8',
      autoClose: true,
    });

    this.initialized = true;

    // 仅在文件是新的（空）时写入头部
    const stats = await fs.promises.stat(this.logPath).catch(() => null);
    if (!stats || stats.size === 0) {
      await this.writeHeader();
    }
  }

  /**
   * 向日志文件写入头部
   */
  private async writeHeader(): Promise<void> {
    const header = [
      `================================================================================`,
      `Shannon 渗透测试 - 工作流日志`,
      `================================================================================`,
      `工作流 ID: ${this.sessionMetadata.id}`,
      `目标 URL:  ${this.sessionMetadata.webUrl}`,
      `开始时间:  ${formatTimestamp()}`,
      `================================================================================`,
      ``,
    ].join('\n');

    return this.writeRaw(header);
  }

  /**
   * 向日志文件写入原始文本并立即刷新
   */
  private writeRaw(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.initialized || !this.stream) {
        reject(new Error('WorkflowLogger 未初始化'));
        return;
      }

      const needsDrain = !this.stream.write(text, 'utf8', (error) => {
        if (error) reject(error);
      });

      if (needsDrain) {
        this.stream.once('drain', resolve);
      } else {
        resolve();
      }
    });
  }

  /**
   * 格式化日志行的时间戳（本地时间，人类可读）
   */
  private formatLogTime(): string {
    const now = new Date();
    return now.toISOString().replace('T', ' ').slice(0, 19);
  }

  /**
   * 记录阶段转换事件
   */
  async logPhase(phase: string, event: 'start' | 'complete'): Promise<void> {
    await this.ensureInitialized();

    const action = event === 'start' ? '开始' : '完成';
    const line = `[${this.formatLogTime()}] [阶段] ${action}: ${phase}\n`;

    // 为了可读性，在阶段开始前添加空行
    if (event === 'start') {
      await this.writeRaw('\n');
    }

    await this.writeRaw(line);
  }

  /**
   * 记录智能体事件
   */
  async logAgent(
    agentName: string,
    event: 'start' | 'end',
    details?: AgentLogDetails
  ): Promise<void> {
    await this.ensureInitialized();

    let message: string;

    if (event === 'start') {
      const attempt = details?.attemptNumber ?? 1;
      message = `${agentName}: 开始（尝试 ${attempt}）`;
    } else {
      const parts: string[] = [agentName + ':'];

      if (details?.success === false) {
        parts.push('失败');
        if (details?.error) {
          parts.push(`- ${details.error}`);
        }
      } else {
        parts.push('完成');
      }

      if (details?.duration_ms !== undefined) {
        parts.push(`(${formatDuration(details.duration_ms)}`);
        if (details?.cost_usd !== undefined) {
          parts.push(`$${details.cost_usd.toFixed(2)})`);
        } else {
          parts.push(')');
        }
      }

      message = parts.join(' ');
    }

    const line = `[${this.formatLogTime()}] [智能体] ${message}\n`;
    await this.writeRaw(line);
  }

  /**
   * 记录一般事件
   */
  async logEvent(eventType: string, message: string): Promise<void> {
    await this.ensureInitialized();

    const line = `[${this.formatLogTime()}] [${eventType.toUpperCase()}] ${message}\n`;
    await this.writeRaw(line);
  }

  /**
   * 记录错误
   */
  async logError(error: Error, context?: string): Promise<void> {
    await this.ensureInitialized();

    const contextStr = context ? ` (${context})` : '';
    const line = `[${this.formatLogTime()}] [错误] ${error.message}${contextStr}\n`;
    await this.writeRaw(line);
  }

  /**
   * 将字符串截断到最大长度并添加省略号
   */
  private truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + '...';
  }

  /**
   * 格式化工具参数以供人类可读显示
   */
  private formatToolParams(toolName: string, params: unknown): string {
    if (!params || typeof params !== 'object') {
      return '';
    }

    const p = params as Record<string, unknown>;

    // 常见工具的特定格式化
    switch (toolName) {
      case 'Bash':
        if (p.command) {
          return this.truncate(String(p.command).replace(/\n/g, ' '), 100);
        }
        break;
      case 'Read':
        if (p.file_path) {
          return String(p.file_path);
        }
        break;
      case 'Write':
        if (p.file_path) {
          return String(p.file_path);
        }
        break;
      case 'Edit':
        if (p.file_path) {
          return String(p.file_path);
        }
        break;
      case 'Glob':
        if (p.pattern) {
          return String(p.pattern);
        }
        break;
      case 'Grep':
        if (p.pattern) {
          const path = p.path ? ` in ${p.path}` : '';
          return `"${this.truncate(String(p.pattern), 50)}"${path}`;
        }
        break;
      case 'WebFetch':
        if (p.url) {
          return String(p.url);
        }
        break;
      case 'mcp__playwright__browser_navigate':
        if (p.url) {
          return String(p.url);
        }
        break;
      case 'mcp__playwright__browser_click':
        if (p.selector) {
          return this.truncate(String(p.selector), 60);
        }
        break;
      case 'mcp__playwright__browser_type':
        if (p.selector) {
          const text = p.text ? `: "${this.truncate(String(p.text), 30)}"` : '';
          return `${this.truncate(String(p.selector), 40)}${text}`;
        }
        break;
    }

    // 默认：显示第一个字符串值参数并截断
    for (const [key, val] of Object.entries(p)) {
      if (typeof val === 'string' && val.length > 0) {
        return `${key}=${this.truncate(val, 60)}`;
      }
    }

    return '';
  }

  /**
   * 记录工具开始事件
   */
  async logToolStart(agentName: string, toolName: string, parameters: unknown): Promise<void> {
    await this.ensureInitialized();

    const params = this.formatToolParams(toolName, parameters);
    const paramStr = params ? `: ${params}` : '';
    const line = `[${this.formatLogTime()}] [${agentName}] [工具] ${toolName}${paramStr}\n`;
    await this.writeRaw(line);
  }

  /**
   * 记录 LLM 响应
   */
  async logLlmResponse(agentName: string, turn: number, content: string): Promise<void> {
    await this.ensureInitialized();

    // 显示完整内容，将换行符替换为转义版本以用于单行输出
    const escaped = content.replace(/\n/g, '\\n');
    const line = `[${this.formatLogTime()}] [${agentName}] [LLM] 轮次 ${turn}: ${escaped}\n`;
    await this.writeRaw(line);
  }

  /**
   * 记录工作流完成，包含完整摘要
   */
  async logWorkflowComplete(summary: WorkflowSummary): Promise<void> {
    await this.ensureInitialized();

    const status = summary.status === 'completed' ? '已完成' : '失败';

    await this.writeRaw('\n');
    await this.writeRaw(`================================================================================\n`);
    await this.writeRaw(`工作流 ${status}\n`);
    await this.writeRaw(`────────────────────────────────────────\n`);
    await this.writeRaw(`工作流 ID: ${this.sessionMetadata.id}\n`);
    await this.writeRaw(`状态:      ${summary.status}\n`);
    await this.writeRaw(`持续时间:    ${formatDuration(summary.totalDurationMs)}\n`);
    await this.writeRaw(`总成本:  $${summary.totalCostUsd.toFixed(4)}\n`);
    await this.writeRaw(`智能体:      ${summary.completedAgents.length} 已完成\n`);

    if (summary.error) {
      await this.writeRaw(`错误:       ${summary.error}\n`);
    }

    await this.writeRaw(`\n`);
    await this.writeRaw(`智能体明细:\n`);

    for (const agentName of summary.completedAgents) {
      const metrics = summary.agentMetrics[agentName];
      if (metrics) {
        const duration = formatDuration(metrics.durationMs);
        const cost = metrics.costUsd !== null ? `$${metrics.costUsd.toFixed(4)}` : 'N/A';
        await this.writeRaw(`  - ${agentName} (${duration}, ${cost})\n`);
      } else {
        await this.writeRaw(`  - ${agentName}\n`);
      }
    }

    await this.writeRaw(`================================================================================\n`);
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
   * 关闭日志流
   */
  async close(): Promise<void> {
    if (!this.initialized || !this.stream) {
      return;
    }

    return new Promise((resolve) => {
      this.stream!.end(() => {
        this.initialized = false;
        resolve();
      });
    });
  }
}