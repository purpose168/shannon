// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * 错误格式化工具
 *
 * 用于创建结构化错误响应的辅助函数。
 */

import type { ErrorResponse } from '../types/tool-responses.js';

/**
 * 创建验证错误响应
 */
export function createValidationError(
  message: string,
  retryable: boolean = true,
  context?: Record<string, unknown>
): ErrorResponse {
  return {
    status: 'error',
    message,
    errorType: 'ValidationError',
    retryable,
    ...(context !== undefined && { context }),
  };
}

/**
 * 创建加密错误响应
 */
export function createCryptoError(
  message: string,
  retryable: boolean = false,
  context?: Record<string, unknown>
): ErrorResponse {
  return {
    status: 'error',
    message,
    errorType: 'CryptoError',
    retryable,
    ...(context !== undefined && { context }),
  };
}

/**
 * 创建通用错误响应
 */
export function createGenericError(
  error: unknown,
  retryable: boolean = false,
  context?: Record<string, unknown>
): ErrorResponse {
  const message = error instanceof Error ? error.message : String(error);
  const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';

  return {
    status: 'error',
    message,
    errorType,
    retryable,
    ...(context !== undefined && { context }),
  };
}
