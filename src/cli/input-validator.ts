// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';

interface ValidationResult {
  valid: boolean;
  error?: string;
  path?: string;
}

// 辅助函数：验证 web URL
export function validateWebUrl(url: string): ValidationResult {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Web URL 必须使用 HTTP 或 HTTPS 协议' };
    }
    if (!parsed.hostname) {
      return { valid: false, error: 'Web URL 必须有有效的主机名' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: '无效的 web URL 格式' };
  }
}

// 辅助函数：验证本地仓库路径
export async function validateRepoPath(repoPath: string): Promise<ValidationResult> {
  try {
    // 检查路径是否存在
    if (!(await fs.pathExists(repoPath))) {
      return { valid: false, error: '仓库路径不存在' };
    }

    // 检查是否为目录
    const stats = await fs.stat(repoPath);
    if (!stats.isDirectory()) {
      return { valid: false, error: '仓库路径必须是目录' };
    }

    // 检查是否可读
    try {
      await fs.access(repoPath, fs.constants.R_OK);
    } catch {
      return { valid: false, error: '仓库路径不可读' };
    }

    // 转换为绝对路径
    const absolutePath = path.resolve(repoPath);
    return { valid: true, path: absolutePath };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return { valid: false, error: `无效的仓库路径: ${errMsg}` };
  }
}