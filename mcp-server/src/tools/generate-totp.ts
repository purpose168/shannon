// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * generate_totp MCP 工具
 *
 * 生成 6 位 TOTP 验证码用于认证。
 * 替代 tools/generate-totp-standalone.mjs bash 脚本。
 * 基于 RFC 6238 (TOTP) 和 RFC 4226 (HOTP)。
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { createHmac } from 'crypto';
import { z } from 'zod';
import { createToolResult, type ToolResult, type GenerateTotpResponse } from '../types/tool-responses.js';
import { base32Decode, validateTotpSecret } from '../validation/totp-validator.js';
import { createCryptoError, createGenericError } from '../utils/error-formatter.js';

/**
 * generate_totp 工具的输入模式
 */
export const GenerateTotpInputSchema = z.object({
  secret: z
    .string()
    .min(1)
    .regex(/^[A-Z2-7]+$/i, '必须是 base32 编码')
    .describe('Base32 编码的 TOTP 密钥'),
});

export type GenerateTotpInput = z.infer<typeof GenerateTotpInputSchema>;

/**
 * 生成 HOTP 代码 (RFC 4226)
 * 从 generate-totp-standalone.mjs（第 74-99 行）移植而来
 */
function generateHOTP(secret: string, counter: number, digits: number = 6): string {
  const key = base32Decode(secret);

  // 将计数器转换为 8 字节缓冲区（大端序）
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  // 生成 HMAC-SHA1
  const hmac = createHmac('sha1', key);
  hmac.update(counterBuffer);
  const hash = hmac.digest();

  // 动态截断
  const offset = hash[hash.length - 1]! & 0x0f;
  const code =
    ((hash[offset]! & 0x7f) << 24) |
    ((hash[offset + 1]! & 0xff) << 16) |
    ((hash[offset + 2]! & 0xff) << 8) |
    (hash[offset + 3]! & 0xff);

  // 生成数字
  const otp = (code % Math.pow(10, digits)).toString().padStart(digits, '0');
  return otp;
}

/**
 * 生成 TOTP 代码 (RFC 6238)
 * 从 generate-totp-standalone.mjs（第 101-106 行）移植而来
 */
function generateTOTP(secret: string, timeStep: number = 30, digits: number = 6): string {
  const currentTime = Math.floor(Date.now() / 1000);
  const counter = Math.floor(currentTime / timeStep);
  return generateHOTP(secret, counter, digits);
}

/**
 * 获取 TOTP 代码过期前的秒数
 */
function getSecondsUntilExpiration(timeStep: number = 30): number {
  const currentTime = Math.floor(Date.now() / 1000);
  return timeStep - (currentTime % timeStep);
}

/**
 * generate_totp 工具实现
 */
export async function generateTotp(args: GenerateTotpInput): Promise<ToolResult> {
  try {
    const { secret } = args;

    // 验证密钥（出错时抛出异常）
    validateTotpSecret(secret);

    // 生成 TOTP 代码
    const totpCode = generateTOTP(secret);
    const expiresIn = getSecondsUntilExpiration();
    const timestamp = new Date().toISOString();

    // 成功响应
    const successResponse: GenerateTotpResponse = {
      status: 'success',
      message: 'TOTP 代码生成成功',
      totpCode,
      timestamp,
      expiresIn,
    };

    return createToolResult(successResponse);
  } catch (error) {
    // 检查是否为验证/加密错误
    if (error instanceof Error && (error.message.includes('base32') || error.message.includes('TOTP'))) {
      const errorResponse = createCryptoError(error.message, false);
      return createToolResult(errorResponse);
    }

    // 通用错误
    const errorResponse = createGenericError(error, false);
    return createToolResult(errorResponse);
  }
}

/**
 * MCP 服务器的工具定义 - 使用 SDK 的 tool() 函数创建
 */
export const generateTotpTool = tool(
  'generate_totp',
  '生成 6 位 TOTP 验证码用于认证。密钥必须是 base32 编码。',
  GenerateTotpInputSchema.shape,
  generateTotp
);
