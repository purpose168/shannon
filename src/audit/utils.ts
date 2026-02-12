// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * 审计系统工具
 *
 * 用于路径生成、原子写入和格式化的核心实用函数。
 * 所有函数都是纯函数且崩溃安全。
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 获取 Shannon 仓库根目录
export const SHANNON_ROOT = path.resolve(__dirname, '..', '..');
export const AUDIT_LOGS_DIR = path.join(SHANNON_ROOT, 'audit-logs');

export interface SessionMetadata {
  id: string;
  webUrl: string;
  repoPath?: string;
  outputPath?: string;
  [key: string]: unknown;
}

/**
 * 从 URL 中提取并清理主机名，用于标识符
 */
export function sanitizeHostname(url: string): string {
  return new URL(url).hostname.replace(/[^a-zA-Z0-9-]/g, '-');
}

/**
 * 从工作流 ID 生成标准化会话标识符
 * 工作流 ID 已经包含主机名，所以我们直接使用它们
 */
export function generateSessionIdentifier(sessionMetadata: SessionMetadata): string {
  return sessionMetadata.id;
}

/**
 * 生成会话的审计日志目录路径
 * 如果提供了自定义 outputPath，则使用它，否则默认为 AUDIT_LOGS_DIR
 */
export function generateAuditPath(sessionMetadata: SessionMetadata): string {
  const sessionIdentifier = generateSessionIdentifier(sessionMetadata);
  const baseDir = sessionMetadata.outputPath || AUDIT_LOGS_DIR;
  return path.join(baseDir, sessionIdentifier);
}

/**
 * 生成智能体日志文件路径
 */
export function generateLogPath(
  sessionMetadata: SessionMetadata,
  agentName: string,
  timestamp: number,
  attemptNumber: number
): string {
  const auditPath = generateAuditPath(sessionMetadata);
  const filename = `${timestamp}_${agentName}_attempt-${attemptNumber}.log`;
  return path.join(auditPath, 'agents', filename);
}

/**
 * 生成提示快照文件路径
 */
export function generatePromptPath(sessionMetadata: SessionMetadata, agentName: string): string {
  const auditPath = generateAuditPath(sessionMetadata);
  return path.join(auditPath, 'prompts', `${agentName}.md`);
}

/**
 * 生成 session.json 文件路径
 */
export function generateSessionJsonPath(sessionMetadata: SessionMetadata): string {
  const auditPath = generateAuditPath(sessionMetadata);
  return path.join(auditPath, 'session.json');
}

/**
 * 生成 workflow.log 文件路径
 */
export function generateWorkflowLogPath(sessionMetadata: SessionMetadata): string {
  const auditPath = generateAuditPath(sessionMetadata);
  return path.join(auditPath, 'workflow.log');
}

/**
 * 确保目录存在（幂等，线程安全）
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // 忽略 EEXIST 错误（线程安全）
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * 使用临时文件 + 重命名模式的原子写入
 * 保证崩溃时不会出现部分写入或损坏
 */
export async function atomicWrite(filePath: string, data: object | string): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  try {
    // 写入临时文件
    await fs.writeFile(tempPath, content, 'utf8');

    // 原子重命名（POSIX 保证：在同一文件系统上是原子的）
    await fs.rename(tempPath, filePath);
  } catch (error) {
    // 失败时清理临时文件
    try {
      await fs.unlink(tempPath);
    } catch {
      // 忽略清理错误
    }
    throw error;
  }
}

/**
 * 将毫秒持续时间格式化为人类可读的字符串
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * 将时间戳格式化为 ISO 8601 字符串
 */
export function formatTimestamp(timestamp: number = Date.now()): string {
  return new Date(timestamp).toISOString();
}

/**
 * 计算百分比
 */
export function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return (part / total) * 100;
}

/**
 * 读取并解析 JSON 文件
 */
export async function readJson<T = unknown>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content) as T;
}

/**
 * 检查文件是否存在
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 初始化会话的审计目录结构
 * 创建：audit-logs/{sessionId}/, agents/, prompts/
 */
export async function initializeAuditStructure(sessionMetadata: SessionMetadata): Promise<void> {
  const auditPath = generateAuditPath(sessionMetadata);
  const agentsPath = path.join(auditPath, 'agents');
  const promptsPath = path.join(auditPath, 'prompts');

  await ensureDirectory(auditPath);
  await ensureDirectory(agentsPath);
  await ensureDirectory(promptsPath);
}