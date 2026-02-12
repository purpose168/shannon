// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * 格式化工具
 *
 * 用于持续时间、时间戳和百分比的通用格式化函数。
 */

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
 * 将时间戳格式化为ISO 8601字符串
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
 * 从描述字符串中提取智能体类型以用于显示目的
 */
export function extractAgentType(description: string): string {
  if (description.includes('Pre-recon')) {
    return 'pre-reconnaissance';
  }
  if (description.includes('Recon')) {
    return 'reconnaissance';
  }
  if (description.includes('Report')) {
    return 'report generation';
  }
  return 'analysis';
}