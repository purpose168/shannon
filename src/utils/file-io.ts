// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * 文件I/O工具
 *
 * 用于文件操作的核心工具函数，包括原子写入、
 * 目录创建和JSON文件处理。
 */

import fs from 'fs/promises';

/**
 * 确保目录存在（幂等，竞争安全）
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // 忽略EEXIST错误（竞争条件安全）
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * 使用临时文件+重命名模式的原子写入
 * 保证崩溃时不会有部分写入或损坏
 */
export async function atomicWrite(filePath: string, data: object | string): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  try {
    // 写入临时文件
    await fs.writeFile(tempPath, content, 'utf8');

    // 原子重命名（POSIX保证：在同一文件系统上是原子的）
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
 * 读取并解析JSON文件
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