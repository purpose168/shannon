// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

// 用于格式化控制台输出的纯函数

import chalk from 'chalk';
import { extractAgentType, formatDuration } from '../utils/formatting.js';
import { getAgentPrefix } from '../utils/output-formatter.js';
import type { ExecutionContext, ResultData } from './types.js';

export function detectExecutionContext(description: string): ExecutionContext {
  const isParallelExecution =
    description.includes('vuln agent') || description.includes('exploit agent');

  const useCleanOutput =
    description.includes('Pre-recon agent') ||
    description.includes('Recon agent') ||
    description.includes('Executive Summary and Report Cleanup') ||
    description.includes('vuln agent') ||
    description.includes('exploit agent');

  const agentType = extractAgentType(description);

  const agentKey = description.toLowerCase().replace(/\s+/g, '-');

  return { isParallelExecution, useCleanOutput, agentType, agentKey };
}

export function formatAssistantOutput(
  cleanedContent: string,
  context: ExecutionContext,
  turnCount: number,
  description: string,
  colorFn: typeof chalk.cyan = chalk.cyan
): string[] {
  if (!cleanedContent.trim()) {
    return [];
  }

  const lines: string[] = [];

  if (context.isParallelExecution) {
    // 并行智能体的紧凑输出，带前缀
    const prefix = getAgentPrefix(description);
    lines.push(colorFn(`${prefix} ${cleanedContent}`));
  } else {
    // 顺序智能体的完整轮次输出
    lines.push(colorFn(`\n    轮次 ${turnCount} (${description}):`));
    lines.push(colorFn(`    ${cleanedContent}`));
  }

  return lines;
}

export function formatResultOutput(data: ResultData, showFullResult: boolean): string[] {
  const lines: string[] = [];

  lines.push(chalk.magenta(`\n    已完成:`));
  lines.push(
    chalk.gray(
      `    持续时间: ${(data.duration_ms / 1000).toFixed(1)}秒, 成本: $${data.cost.toFixed(4)}`
    )
  );

  if (data.subtype === 'error_max_turns') {
    lines.push(chalk.red(`    已停止: 达到最大轮次限制`));
  } else if (data.subtype === 'error_during_execution') {
    lines.push(chalk.red(`    已停止: 执行错误`));
  }

  if (data.permissionDenials > 0) {
    lines.push(chalk.yellow(`    ${data.permissionDenials} 权限拒绝`));
  }

  if (showFullResult && data.result && typeof data.result === 'string') {
    if (data.result.length > 1000) {
      lines.push(chalk.magenta(`    ${data.result.slice(0, 1000)}... [共 ${data.result.length} 字符]`));
    } else {
      lines.push(chalk.magenta(`    ${data.result}`));
    }
  }

  return lines;
}

export function formatErrorOutput(
  error: Error & { code?: string; status?: number },
  context: ExecutionContext,
  description: string,
  duration: number,
  sourceDir: string,
  isRetryable: boolean
): string[] {
  const lines: string[] = [];

  if (context.isParallelExecution) {
    const prefix = getAgentPrefix(description);
    lines.push(chalk.red(`${prefix} 失败 (${formatDuration(duration)})`));
  } else if (context.useCleanOutput) {
    lines.push(chalk.red(`${context.agentType} 失败 (${formatDuration(duration)})`));
  } else {
    lines.push(chalk.red(`  Claude 代码失败: ${description} (${formatDuration(duration)})`));
  }

  lines.push(chalk.red(`    错误类型: ${error.constructor.name}`));
  lines.push(chalk.red(`    消息: ${error.message}`));
  lines.push(chalk.gray(`    智能体: ${description}`));
  lines.push(chalk.gray(`    工作目录: ${sourceDir}`));
  lines.push(chalk.gray(`    可重试: ${isRetryable ? '是' : '否'}`));

  if (error.code) {
    lines.push(chalk.gray(`    错误代码: ${error.code}`));
  }
  if (error.status) {
    lines.push(chalk.gray(`    HTTP 状态: ${error.status}`));
  }

  return lines;
}

export function formatCompletionMessage(
  context: ExecutionContext,
  description: string,
  turnCount: number,
  duration: number
): string {
  if (context.isParallelExecution) {
    const prefix = getAgentPrefix(description);
    return chalk.green(`${prefix} 完成 (${turnCount} 轮次, ${formatDuration(duration)})`);
  }

  if (context.useCleanOutput) {
    return chalk.green(
      `${context.agentType.charAt(0).toUpperCase() + context.agentType.slice(1)} 完成! (${turnCount} 轮次, ${formatDuration(duration)})`
    );
  }

  return chalk.green(
    `  Claude 代码已完成: ${description} (${turnCount} 轮次)，耗时 ${formatDuration(duration)}`
  );
}

export function formatToolUseOutput(
  toolName: string,
  input: Record<string, unknown> | undefined
): string[] {
  const lines: string[] = [];

  lines.push(chalk.yellow(`\n    使用工具: ${toolName}`));
  if (input && Object.keys(input).length > 0) {
    lines.push(chalk.gray(`    输入: ${JSON.stringify(input, null, 2)}`));
  }

  return lines;
}

export function formatToolResultOutput(displayContent: string): string[] {
  const lines: string[] = [];

  lines.push(chalk.green(`    工具结果:`));
  if (displayContent) {
    lines.push(chalk.gray(`    ${displayContent}`));
  }

  return lines;
}