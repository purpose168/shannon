// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * 仅追加智能体日志记录器
 *
 * 为智能体执行提供崩溃安全、仅追加的日志记录。
 * 使用带有立即刷新的文件流来防止数据丢失。
 */

import fs from 'fs';
import {
  generateLogPath,
  generatePromptPath,
  type SessionMetadata,
} from './utils.js';
import { atomicWrite } from '../utils/file-io.js';
import { formatTimestamp } from '../utils/formatting.js';

interface LogEvent {
  type: string;
  timestamp: string;
  data: unknown;
}

/**
 * AgentLogger - 管理单个智能体执行的仅追加日志记录
 */
export class AgentLogger {
  private sessionMetadata: SessionMetadata;
  private agentName: string;
  private attemptNumber: number;
  private timestamp: number;
  private logPath: string;
  private stream: fs.WriteStream | null = null;
  private isOpen: boolean = false;

  constructor(sessionMetadata: SessionMetadata, agentName: string, attemptNumber: number) {
    this.sessionMetadata = sessionMetadata;
    this.agentName = agentName;
    this.attemptNumber = attemptNumber;
    this.timestamp = Date.now();

    // 生成日志文件路径
    this.logPath = generateLogPath(sessionMetadata, agentName, this.timestamp, attemptNumber);
  }

  /**
   * 初始化日志流（创建文件并打开流）
   */
  async initialize(): Promise<void> {
    if (this.isOpen) {
      return; // 已经初始化
    }

    // 创建带有追加模式和自动刷新的写入流
    this.stream = fs.createWriteStream(this.logPath, {
      flags: 'a', // 追加模式
      encoding: 'utf8',
      autoClose: true,
    });

    this.isOpen = true;

    // 写入头部
    await this.writeHeader();
  }

  /**
   * 向日志文件写入头部
   */
  private async writeHeader(): Promise<void> {
    const header = [
      `========================================`,
      `智能体: ${this.agentName}`,
      `尝试: ${this.attemptNumber}`,
      `开始: ${formatTimestamp(this.timestamp)}`,
      `会话: ${this.sessionMetadata.id}`,
      `Web URL: ${this.sessionMetadata.webUrl}`,
      `========================================\n`,
    ].join('\n');

    return this.writeRaw(header);
  }

  /**
   * 向日志文件写入原始文本并立即刷新
   */
  private writeRaw(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isOpen || !this.stream) {
        reject(new Error('日志记录器未初始化'));
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
   * 记录事件（tool_start, tool_end, llm_response 等）
   * 事件以 JSON 格式记录以便解析
   */
  async logEvent(eventType: string, eventData: unknown): Promise<void> {
    const event: LogEvent = {
      type: eventType,
      timestamp: formatTimestamp(),
      data: eventData,
    };

    const eventLine = `${JSON.stringify(event)}\n`;
    return this.writeRaw(eventLine);
  }

  /**
   * 关闭日志流
   */
  async close(): Promise<void> {
    if (!this.isOpen || !this.stream) {
      return;
    }

    return new Promise((resolve) => {
      this.stream!.end(() => {
        this.isOpen = false;
        resolve();
      });
    });
  }

  /**
   * 保存提示快照到提示目录
   * 静态方法 - 不需要日志记录器实例
   */
  static async savePrompt(
    sessionMetadata: SessionMetadata,
    agentName: string,
    promptContent: string
  ): Promise<void> {
    const promptPath = generatePromptPath(sessionMetadata, agentName);

    // 创建带有元数据的头部
    const header = [
      `# 提示快照: ${agentName}`,
      ``,
      `**会话:** ${sessionMetadata.id}`,
      `**Web URL:** ${sessionMetadata.webUrl}`,
      `**保存:** ${formatTimestamp()}`,
      ``,
      `---`,
      ``,
    ].join('\n');

    const fullContent = header + promptContent;

    // 使用原子写入保证安全
    await atomicWrite(promptPath, fullContent);
  }
}