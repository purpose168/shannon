// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * TOTP 验证器
 *
 * 验证 TOTP 密钥并提供 base32 解码功能。
 * 从 tools/generate-totp-standalone.mjs（第 43-72 行）移植而来。
 */

/**
 * Base32 解码函数
 * 从 generate-totp-standalone.mjs 移植而来
 */
export function base32Decode(encoded: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleanInput = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');

  if (cleanInput.length === 0) {
    return Buffer.alloc(0);
  }

  const output: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of cleanInput) {
    const index = alphabet.indexOf(char);
    if (index === -1) {
      throw new Error(`无效的 base32 字符: ${char}`);
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/**
 * 验证 TOTP 密钥
 * 必须是 base32 编码的字符串
 *
 * @returns 如果有效返回 true，如果无效抛出错误
 */
export function validateTotpSecret(secret: string): boolean {
  if (!secret || secret.length === 0) {
    throw new Error('TOTP 密钥不能为空');
  }

  // 检查是否是有效的 base32（仅 A-Z 和 2-7，不区分大小写）
  const base32Regex = /^[A-Z2-7]+$/i;
  if (!base32Regex.test(secret.replace(/[^A-Z2-7]/gi, ''))) {
    throw new Error('TOTP 密钥必须是 base32 编码的（字符 A-Z 和 2-7）');
  }

  // 尝试解码以确保其有效
  try {
    base32Decode(secret);
  } catch (error) {
    throw new Error(`无效的 TOTP 密钥: ${error instanceof Error ? error.message : String(error)}`);
  }

  return true;
}
