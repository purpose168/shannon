// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * 文件操作工具
 *
 * 处理可交付成果保存的文件系统操作。
 * 从 tools/save_deliverable.js（第 117-130 行）移植而来。
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * 将可交付成果文件保存到 deliverables/ 目录
 *
 * @param targetDir - 可交付成果的目标目录（显式传递以避免竞争条件）
 * @param filename - 可交付成果文件的名称
 * @param content - 要保存的文件内容
 */
export function saveDeliverableFile(targetDir: string, filename: string, content: string): string {
  const deliverablesDir = join(targetDir, 'deliverables');
  const filepath = join(deliverablesDir, filename);

  // 确保 deliverables 目录存在
  try {
    mkdirSync(deliverablesDir, { recursive: true });
  } catch {
    throw new Error(`无法在 ${deliverablesDir} 创建 deliverables 目录`);
  }

  // 写入文件（原子写入 - 单次操作）
  writeFileSync(filepath, content, 'utf8');

  return filepath;
}
