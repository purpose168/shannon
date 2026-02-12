// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import chalk from 'chalk';
import { fs, path } from 'zx';
import type {
  PentestErrorType,
  PentestErrorContext,
  LogEntry,
  ToolErrorResult,
  PromptErrorResult,
} from './types/errors.js';

// Temporal 错误分类，用于 ApplicationFailure 包装
export interface TemporalErrorClassification {
  type: string;
  retryable: boolean;
}

// 渗透测试操作的自定义错误类
export class PentestError extends Error {
  name = 'PentestError' as const;
  type: PentestErrorType;
  retryable: boolean;
  context: PentestErrorContext;
  timestamp: string;

  constructor(
    message: string,
    type: PentestErrorType,
    retryable: boolean = false,
    context: PentestErrorContext = {}
  ) {
    super(message);
    this.type = type;
    this.retryable = retryable;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

// 集中式错误日志记录函数
export async function logError(
  error: Error & { type?: PentestErrorType; retryable?: boolean; context?: PentestErrorContext },
  contextMsg: string,
  sourceDir: string | null = null
): Promise<LogEntry> {
  const timestamp = new Date().toISOString();
  const logEntry: LogEntry = {
    timestamp,
    context: contextMsg,
    error: {
      name: error.name || error.constructor.name,
      message: error.message,
      type: error.type || 'unknown',
      retryable: error.retryable || false,
    },
  };
  // 仅在存在时添加堆栈
  if (error.stack) {
    logEntry.error.stack = error.stack;
  }

  // 带颜色的控制台日志
  const prefix = error.retryable ? '⚠️' : '❌';
  const color = error.retryable ? chalk.yellow : chalk.red;
  console.log(color(`${prefix} ${contextMsg}:`));
  console.log(color(`   ${error.message}`));

  if (error.context && Object.keys(error.context).length > 0) {
    console.log(chalk.gray(`   Context: ${JSON.stringify(error.context)}`));
  }

  // 文件日志记录（如果提供了源目录）
  if (sourceDir) {
    try {
      const logPath = path.join(sourceDir, 'error.log');
      await fs.appendFile(logPath, JSON.stringify(logEntry) + '\n');
    } catch (logErr) {
      const errMsg = logErr instanceof Error ? logErr.message : String(logErr);
      console.log(chalk.gray(`   (Failed to write error log: ${errMsg})`));
    }
  }

  return logEntry;
}

// 处理工具执行错误
export function handleToolError(
  toolName: string,
  error: Error & { code?: string }
): ToolErrorResult {
  const isRetryable =
    error.code === 'ECONNRESET' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ENOTFOUND';

  return {
    tool: toolName,
    output: `Error: ${error.message}`,
    status: 'error',
    duration: 0,
    success: false,
    error: new PentestError(
      `${toolName} execution failed: ${error.message}`,
      'tool',
      isRetryable,
      { toolName, originalError: error.message, errorCode: error.code }
    ),
  };
}

// 处理提示加载错误
export function handlePromptError(
  promptName: string,
  error: Error
): PromptErrorResult {
  return {
    success: false,
    error: new PentestError(
      `Failed to load prompt '${promptName}': ${error.message}`,
      'prompt',
      false,
      { promptName, originalError: error.message }
    ),
  };
}

// 指示可重试错误的模式
const RETRYABLE_PATTERNS = [
  // 网络和连接错误
  'network',
  'connection',
  'timeout',
  'econnreset',
  'enotfound',
  'econnrefused',
  // 速率限制
  'rate limit',
  '429',
  'too many requests',
  // 服务器错误
  'server error',
  '5xx',
  'internal server error',
  'service unavailable',
  'bad gateway',
  // Claude API 错误
  'mcp server',
  'model unavailable',
  'service temporarily unavailable',
  'api error',
  'terminated',
  // 最大轮次
  'max turns',
  'maximum turns',
];

// 指示不可重试错误的模式（在默认值之前检查）
const NON_RETRYABLE_PATTERNS = [
  'authentication',
  'invalid prompt',
  'out of memory',
  'permission denied',
  'session limit reached',
  'invalid api key',
];

// 保守的重试分类 - 未知错误不重试（故障安全默认值）
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // 首先检查显式不可重试模式
  if (NON_RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern))) {
    return false;
  }

  // 检查可重试模式
  return RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern));
}

// 速率限制错误获得更长的基础延迟（30秒），而标准指数退避（2秒）
export function getRetryDelay(error: Error, attempt: number): number {
  const message = error.message.toLowerCase();

  // 速率限制获得更长的延迟
  if (message.includes('rate limit') || message.includes('429')) {
    return Math.min(30000 + attempt * 10000, 120000); // 30秒, 40秒, 50秒, 最大2分钟
  }

  // 其他可重试错误的指数退避与抖动
  const baseDelay = Math.pow(2, attempt) * 1000; // 2秒, 4秒, 8秒
  const jitter = Math.random() * 1000; // 0-1秒随机
  return Math.min(baseDelay + jitter, 30000); // 最大30秒
}

/**
 * 为 Temporal 工作流重试行为分类错误。
 * 返回错误类型和 Temporal 是否应该重试。
 *
 * 由活动用于将错误包装在 ApplicationFailure 中：
 * - 可重试错误：Temporal 使用配置的退避策略重试
 * - 不可重试错误：Temporal 立即失败
 */
export function classifyErrorForTemporal(error: unknown): TemporalErrorClassification {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

  // === 账单错误（可重试）===
  // Anthropic 将账单错误返回为 400 invalid_request_error
  // 人类可以添加信用额度或等待支出上限重置（5-30分钟退避）
  if (
    message.includes('billing_error') ||
    message.includes('credit balance is too low') ||
    message.includes('insufficient credits') ||
    message.includes('usage is blocked due to insufficient credits') ||
    message.includes('please visit plans & billing') ||
    message.includes('please visit plans and billing') ||
    message.includes('usage limit reached') ||
    message.includes('quota exceeded') ||
    message.includes('daily rate limit') ||
    message.includes('limit will reset') ||
    // Claude Code 支出上限模式（返回短消息而不是错误）
    message.includes('spending cap') ||
    message.includes('spending limit') ||
    message.includes('cap reached') ||
    message.includes('budget exceeded') ||
    message.includes('billing limit reached')
  ) {
    return { type: 'BillingError', retryable: true };
  }

  // === 永久性错误（不可重试）===

  // 认证（401）- 错误的 API 密钥不会自行修复
  if (
    message.includes('authentication') ||
    message.includes('api key') ||
    message.includes('401') ||
    message.includes('authentication_error')
  ) {
    return { type: 'AuthenticationError', retryable: false };
  }

  // 权限（403）- 不会授予访问权限
  if (
    message.includes('permission') ||
    message.includes('forbidden') ||
    message.includes('403')
  ) {
    return { type: 'PermissionError', retryable: false };
  }

  // === 输出验证错误（可重试）===
  // 智能体未产生预期的交付物 - 重试可能成功
  // 重要：必须在下面的通用 'validation' 检查之前
  if (
    message.includes('failed output validation') ||
    message.includes('output validation failed')
  ) {
    return { type: 'OutputValidationError', retryable: true };
  }

  // 无效请求（400）- 格式错误的请求是永久性的
  // 注意：在账单和输出验证之后检查
  if (
    message.includes('invalid_request_error') ||
    message.includes('malformed') ||
    message.includes('validation')
  ) {
    return { type: 'InvalidRequestError', retryable: false };
  }

  // 请求太大（413）- 无论重试多少次都不会适合
  if (
    message.includes('request_too_large') ||
    message.includes('too large') ||
    message.includes('413')
  ) {
    return { type: 'RequestTooLargeError', retryable: false };
  }

  // 配置错误 - 缺少文件需要手动修复
  if (
    message.includes('enoent') ||
    message.includes('no such file') ||
    message.includes('cli not installed')
  ) {
    return { type: 'ConfigurationError', retryable: false };
  }

  // 执行限制 - 达到最大轮次/预算
  if (
    message.includes('max turns') ||
    message.includes('budget') ||
    message.includes('execution limit') ||
    message.includes('error_max_turns') ||
    message.includes('error_max_budget')
  ) {
    return { type: 'ExecutionLimitError', retryable: false };
  }

  // 无效目标 URL - 错误的 URL 格式不会自行修复
  if (
    message.includes('invalid url') ||
    message.includes('invalid target') ||
    message.includes('malformed url') ||
    message.includes('invalid uri')
  ) {
    return { type: 'InvalidTargetError', retryable: false };
  }

  // === 暂时性错误（可重试）===
  // 速率限制（429）、服务器错误（5xx）、网络问题
  // 让 Temporal 使用配置的退避策略重试
  return { type: 'TransientError', retryable: true };
}
