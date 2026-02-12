// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { $, fs, path } from 'zx';
import chalk from 'chalk';
import { PentestError } from '../error-handling.js';

// 纯函数：设置本地仓库用于测试
export async function setupLocalRepo(repoPath: string): Promise<string> {
  try {
    const sourceDir = path.resolve(repoPath);

    // MCP 服务器现在通过 claude-executor.js 中的 mcpServers 选项配置
    // 不需要使用 claude CLI 进行预设置

    // 如果尚未初始化，则初始化 git 仓库并创建检查点
    try {
      // 检查是否已经是 git 仓库
      const isGitRepo = await fs.pathExists(path.join(sourceDir, '.git'));

      if (!isGitRepo) {
        await $`cd ${sourceDir} && git init`;
        console.log(chalk.blue('✅ Git repository initialized'));
      }

      // 为渗透测试智能体配置 git
      await $`cd ${sourceDir} && git config user.name "Pentest Agent"`;
      await $`cd ${sourceDir} && git config user.email "agent@localhost"`;

      // 创建初始检查点
      await $`cd ${sourceDir} && git add -A && git commit -m "Initial checkpoint: Local repository setup" --allow-empty`;
      console.log(chalk.green('✅ Initial checkpoint created'));
    } catch (gitError) {
      const errMsg = gitError instanceof Error ? gitError.message : String(gitError);
      console.log(chalk.yellow(`⚠️ Git setup warning: ${errMsg}`));
      // 非致命错误 - 继续执行，不进行 Git 设置
    }

    // MCP 工具（save_deliverable, generate_totp）现在通过 shannon-helper MCP 服务器原生可用
    // 不需要将 bash 脚本复制到目标仓库

    return sourceDir;
  } catch (error) {
    if (error instanceof PentestError) {
      throw error;
    }
    const errMsg = error instanceof Error ? error.message : String(error);
    throw new PentestError(`Local repository setup failed: ${errMsg}`, 'filesystem', false, {
      repoPath,
      originalError: errMsg,
    });
  }
}
