// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * 队列验证器
 *
 * 验证漏洞队列文件的 JSON 结构。
 * 从 tools/save_deliverable.js（第 56-75 行）移植而来。
 */

import type { VulnerabilityQueue } from '../types/deliverables.js';

export interface ValidationResult {
  valid: boolean;
  message?: string;
  data?: VulnerabilityQueue;
}

/**
 * 验证队列文件的 JSON 结构
 * 队列文件必须包含 'vulnerabilities' 数组
 */
export function validateQueueJson(content: string): ValidationResult {
  try {
    const parsed = JSON.parse(content) as unknown;

    // 解析结果的类型检查
    if (typeof parsed !== 'object' || parsed === null) {
      return {
        valid: false,
        message: `无效的队列结构：期望值为对象。得到：${typeof parsed}`,
      };
    }

    const obj = parsed as Record<string, unknown>;

    // 队列文件必须包含 'vulnerabilities' 数组
    if (!('vulnerabilities' in obj)) {
      return {
        valid: false,
        message: `无效的队列结构：缺少 'vulnerabilities' 属性。期望值：{"vulnerabilities": [...]}`,
      };
    }

    if (!Array.isArray(obj.vulnerabilities)) {
      return {
        valid: false,
        message: `无效的队列结构：'vulnerabilities' 必须是数组。期望值：{"vulnerabilities": [...]}`,
      };
    }

    return {
      valid: true,
      data: parsed as VulnerabilityQueue,
    };
  } catch (error) {
    return {
      valid: false,
      message: `无效的 JSON：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
