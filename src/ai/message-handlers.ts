// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

// 用于处理 SDK 消息类型的纯函数

import { PentestError } from '../error-handling.js';
import { filterJsonToolCalls } from '../utils/output-formatter.js';
import { formatTimestamp } from '../utils/formatting.js';
import chalk from 'chalk';
import { getActualModelName } from './router-utils.js';
import {
  formatAssistantOutput,
  formatResultOutput,
  formatToolUseOutput,
  formatToolResultOutput,
} from './output-formatters.js';
import { costResults } from '../utils/metrics.js';
import type { AuditLogger } from './audit-logger.js';
import type { ProgressManager } from './progress-manager.js';
import type {
  AssistantMessage,
  SDKAssistantMessageError,
  ResultMessage,
  ToolUseMessage,
  ToolResultMessage,
  AssistantResult,
  ResultData,
  ToolUseData,
  ToolResultData,
  ApiErrorDetection,
  ContentBlock,
  SystemInitMessage,
  ExecutionContext,
} from './types.js';
import type { ChalkInstance } from 'chalk';

// 处理 SDK 的数组和字符串内容格式
export function extractMessageContent(message: AssistantMessage): string {
  const messageContent = message.message;

  if (Array.isArray(messageContent.content)) {
    return messageContent.content
      .map((c: ContentBlock) => c.text || JSON.stringify(c))
      .join('\n');
  }

  return String(messageContent.content);
}

// 仅提取文本内容（无 tool_use JSON），以避免错误检测中的误报
export function extractTextOnlyContent(message: AssistantMessage): string {
  const messageContent = message.message;

  if (Array.isArray(messageContent.content)) {
    return messageContent.content
      .filter((c: ContentBlock) => c.type === 'text' || c.text)
      .map((c: ContentBlock) => c.text || '')
      .join('\n');
  }

  return String(messageContent.content);
}

export function detectApiError(content: string): ApiErrorDetection {
  if (!content || typeof content !== 'string') {
    return { detected: false };
  }

  const lowerContent = content.toLowerCase();

  // === 计费/支出上限错误（可重试，长时间退避）===
  // 当 Claude Code 达到支出上限时，它会返回简短消息，如
  // "Spending cap reached resets 8am" 而不是抛出错误。
  // 这些应该以 5-30 分钟的退避时间重试，以便工作流可以在上限重置时恢复。
  const BILLING_PATTERNS = [
    'spending cap',
    'spending limit',
    'cap reached',
    'budget exceeded',
    'usage limit',
  ];

  const isBillingError = BILLING_PATTERNS.some((pattern) =>
    lowerContent.includes(pattern)
  );

  if (isBillingError) {
    return {
      detected: true,
      shouldThrow: new PentestError(
        `达到计费限制: ${content.slice(0, 100)}`,
        'billing',
        true // 可重试 - Temporal 将使用 5-30 分钟的退避
      ),
    };
  }

  // === 会话限制（不可重试）===
  // 与支出上限不同 - 通常意味着存在根本性问题
  if (lowerContent.includes('session limit reached')) {
    return {
      detected: true,
      shouldThrow: new PentestError('达到会话限制', 'billing', false),
    };
  }

  // 非致命 API 错误 - 检测到但继续
  if (lowerContent.includes('api error') || lowerContent.includes('terminated')) {
    return { detected: true };
  }

  return { detected: false };
}

// 将 SDK 结构化错误类型映射到我们的错误处理
function handleStructuredError(
  errorType: SDKAssistantMessageError,
  content: string
): ApiErrorDetection {
  switch (errorType) {
    case 'billing_error':
      return {
        detected: true,
        shouldThrow: new PentestError(
          `计费错误 (结构化): ${content.slice(0, 100)}`,
          'billing',
          true // 可重试，带退避
        ),
      };
    case 'rate_limit':
      return {
        detected: true,
        shouldThrow: new PentestError(
          `达到速率限制 (结构化): ${content.slice(0, 100)}`,
          'network',
          true // 可重试，带退避
        ),
      };
    case 'authentication_failed':
      return {
        detected: true,
        shouldThrow: new PentestError(
          `认证失败: ${content.slice(0, 100)}`,
          'config',
          false // 不可重试 - 需要 API 密钥修复
        ),
      };
    case 'server_error':
      return {
        detected: true,
        shouldThrow: new PentestError(
          `服务器错误 (结构化): ${content.slice(0, 100)}`,
          'network',
          true // 可重试
        ),
      };
    case 'invalid_request':
      return {
        detected: true,
        shouldThrow: new PentestError(
          `无效请求: ${content.slice(0, 100)}`,
          'config',
          false // 不可重试 - 需要代码修复
        ),
      };
    case 'max_output_tokens':
      return {
        detected: true,
        shouldThrow: new PentestError(
          `达到最大输出令牌: ${content.slice(0, 100)}`,
          'billing',
          true // 可重试 - 可能以不同内容成功
        ),
      };
    case 'unknown':
    default:
      return { detected: true };
  }
}

export function handleAssistantMessage(
  message: AssistantMessage,
  turnCount: number
): AssistantResult {
  const content = extractMessageContent(message);
  const cleanedContent = filterJsonToolCalls(content);

  // 优先使用 SDK 的结构化错误字段，回退到文本嗅探
  // 使用纯文本内容进行错误检测，以避免来自 tool_use JSON 的误报
  // （例如，包含 "usage limit" 的安全报告）
  let errorDetection: ApiErrorDetection;
  if (message.error) {
    errorDetection = handleStructuredError(message.error, content);
  } else {
    const textOnlyContent = extractTextOnlyContent(message);
    errorDetection = detectApiError(textOnlyContent);
  }

  const result: AssistantResult = {
    content,
    cleanedContent,
    apiErrorDetected: errorDetection.detected,
    logData: {
      turn: turnCount,
      content,
      timestamp: formatTimestamp(),
    },
  };

  // 仅在存在时添加 shouldThrow（符合 exactOptionalPropertyTypes）
  if (errorDetection.shouldThrow) {
    result.shouldThrow = errorDetection.shouldThrow;
  }

  return result;
}

// 查询的最终消息，包含成本/持续时间信息
export function handleResultMessage(message: ResultMessage): ResultData {
  const result: ResultData = {
    result: message.result || null,
    cost: message.total_cost_usd || 0,
    duration_ms: message.duration_ms || 0,
    permissionDenials: message.permission_denials?.length || 0,
  };

  // 仅在存在时添加 subtype（符合 exactOptionalPropertyTypes）
  if (message.subtype) {
    result.subtype = message.subtype;
  }

  // 捕获 stop_reason 用于诊断（有助于调试过早停止、预算超出等）
  if (message.stop_reason !== undefined) {
    result.stop_reason = message.stop_reason;
    if (message.stop_reason && message.stop_reason !== 'end_turn') {
      console.log(chalk.yellow(`    停止原因: ${message.stop_reason}`));
    }
  }

  return result;
}

export function handleToolUseMessage(message: ToolUseMessage): ToolUseData {
  return {
    toolName: message.name,
    parameters: message.input || {},
    timestamp: formatTimestamp(),
  };
}

// 截断长结果用于显示（500 字符限制），保留完整内容用于日志记录
export function handleToolResultMessage(message: ToolResultMessage): ToolResultData {
  const content = message.content;
  const contentStr =
    typeof content === 'string' ? content : JSON.stringify(content, null, 2);

  const displayContent =
    contentStr.length > 500
      ? `${contentStr.slice(0, 500)}...\n[结果已截断 - 共 ${contentStr.length} 字符]`
      : contentStr;

  return {
    content,
    displayContent,
    timestamp: formatTimestamp(),
  };
}

// 控制台日志的输出辅助函数
function outputLines(lines: string[]): void {
  for (const line of lines) {
    console.log(line);
  }
}

// 消息分发结果类型
export type MessageDispatchAction =
  | { type: 'continue'; apiErrorDetected?: boolean | undefined; model?: string | undefined }
  | { type: 'complete'; result: string | null; cost: number }
  | { type: 'throw'; error: Error };

export interface MessageDispatchDeps {
  execContext: ExecutionContext;
  description: string;
  colorFn: ChalkInstance;
  progress: ProgressManager;
  auditLogger: AuditLogger;
}

// 将 SDK 消息分发到适当的处理程序和格式化程序
export async function dispatchMessage(
  message: { type: string; subtype?: string },
  turnCount: number,
  deps: MessageDispatchDeps
): Promise<MessageDispatchAction> {
  const { execContext, description, colorFn, progress, auditLogger } = deps;

  switch (message.type) {
    case 'assistant': {
      const assistantResult = handleAssistantMessage(message as AssistantMessage, turnCount);

      if (assistantResult.shouldThrow) {
        return { type: 'throw', error: assistantResult.shouldThrow };
      }

      if (assistantResult.cleanedContent.trim()) {
        progress.stop();
        outputLines(formatAssistantOutput(
          assistantResult.cleanedContent,
          execContext,
          turnCount,
          description,
          colorFn
        ));
        progress.start();
      }

      await auditLogger.logLlmResponse(turnCount, assistantResult.content);

      if (assistantResult.apiErrorDetected) {
        console.log(chalk.red(`    在助手响应中检测到 API 错误`));
        return { type: 'continue', apiErrorDetected: true };
      }

      return { type: 'continue' };
    }

    case 'system': {
      if (message.subtype === 'init') {
        const initMsg = message as SystemInitMessage;
        const actualModel = getActualModelName(initMsg.model);
        if (!execContext.useCleanOutput) {
          console.log(chalk.blue(`    模型: ${actualModel}, 权限: ${initMsg.permissionMode}`));
          if (initMsg.mcp_servers && initMsg.mcp_servers.length > 0) {
            const mcpStatus = initMsg.mcp_servers.map(s => `${s.name}(${s.status})`).join(', ');
            console.log(chalk.blue(`    MCP: ${mcpStatus}`));
          }
        }
        // 返回实际模型用于审计日志中的跟踪
        return { type: 'continue', model: actualModel };
      }
      return { type: 'continue' };
    }

    case 'user':
    case 'tool_progress':
    case 'tool_use_summary':
    case 'auth_status':
      return { type: 'continue' };

    case 'tool_use': {
      const toolData = handleToolUseMessage(message as unknown as ToolUseMessage);
      outputLines(formatToolUseOutput(toolData.toolName, toolData.parameters));
      await auditLogger.logToolStart(toolData.toolName, toolData.parameters);
      return { type: 'continue' };
    }

    case 'tool_result': {
      const toolResultData = handleToolResultMessage(message as unknown as ToolResultMessage);
      outputLines(formatToolResultOutput(toolResultData.displayContent));
      await auditLogger.logToolEnd(toolResultData.content);
      return { type: 'continue' };
    }

    case 'result': {
      const resultData = handleResultMessage(message as ResultMessage);
      outputLines(formatResultOutput(resultData, !execContext.useCleanOutput));
      costResults.agents[execContext.agentKey] = resultData.cost;
      costResults.total += resultData.cost;
      return { type: 'complete', result: resultData.result, cost: resultData.cost };
    }

    default:
      console.log(chalk.gray(`    ${message.type}: ${JSON.stringify(message, null, 2)}`));
      return { type: 'continue' };
  }
}