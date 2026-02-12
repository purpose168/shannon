// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * 工具响应类型定义
 *
 * 为 MCP 工具定义结构化响应格式，确保
 * 一致的错误处理和成功报告。
 */

export interface ErrorResponse {
  status: 'error';
  message: string;
  errorType: string; // ValidationError, FileSystemError, CryptoError, 等
  retryable: boolean;
  context?: Record<string, unknown>;
}

export interface SuccessResponse {
  status: 'success';
  message: string;
}

export interface SaveDeliverableResponse {
  status: 'success';
  message: string;
  filepath: string;
  deliverableType: string;
  validated: boolean; // 如果队列 JSON 已验证则为 true
}

export interface GenerateTotpResponse {
  status: 'success';
  message: string;
  totpCode: string;
  timestamp: string;
  expiresIn: number; // 到期前的秒数
}

export type ToolResponse =
  | ErrorResponse
  | SuccessResponse
  | SaveDeliverableResponse
  | GenerateTotpResponse;

export interface ToolResultContent {
  type: string;
  text: string;
}

export interface ToolResult {
  content: ToolResultContent[];
  isError: boolean;
}

/**
 * 从响应创建工具结果的辅助函数
 * MCP 工具应返回此格式
 */
export function createToolResult(response: ToolResponse): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response, null, 2),
      },
    ],
    isError: response.status === 'error',
  };
}
