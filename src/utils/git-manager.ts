// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { $ } from 'zx';
import chalk from 'chalk';

/**
 * 检查目录是否是git仓库。
 * 如果目录包含.git文件夹或位于git仓库内，则返回true。
 */
export async function isGitRepository(dir: string): Promise<boolean> {
  try {
    await $`cd ${dir} && git rev-parse --git-dir`.quiet();
    return true;
  } catch {
    return false;
  }
}

interface GitOperationResult {
  success: boolean;
  hadChanges?: boolean;
  error?: Error;
}

/**
 * 从git status --porcelain输出中获取更改文件列表
 */
async function getChangedFiles(
  sourceDir: string,
  operationDescription: string
): Promise<string[]> {
  const status = await executeGitCommandWithRetry(
    ['git', 'status', '--porcelain'],
    sourceDir,
    operationDescription
  );
  return status.stdout
    .trim()
    .split('\n')
    .filter((line) => line.length > 0);
}

/**
 * 记录更改文件的摘要，对长列表进行截断
 */
function logChangeSummary(
  changes: string[],
  messageWithChanges: string,
  messageWithoutChanges: string,
  color: typeof chalk.green,
  maxToShow: number = 5
): void {
  if (changes.length > 0) {
    console.log(color(messageWithChanges.replace('{count}', String(changes.length))));
    changes.slice(0, maxToShow).forEach((change) => console.log(chalk.gray(`       ${change}`)));
    if (changes.length > maxToShow) {
      console.log(chalk.gray(`       ... 以及 ${changes.length - maxToShow} 个更多文件`));
    }
  } else {
    console.log(color(messageWithoutChanges));
  }
}

/**
 * 将未知错误转换为GitOperationResult
 */
function toErrorResult(error: unknown): GitOperationResult {
  const errMsg = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    error: error instanceof Error ? error : new Error(errMsg),
  };
}

// 序列化git操作以防止并行智能体执行期间的index.lock冲突
class GitSemaphore {
  private queue: Array<() => void> = [];
  private running: boolean = false;

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.process();
    });
  }

  release(): void {
    this.running = false;
    this.process();
  }

  private process(): void {
    if (!this.running && this.queue.length > 0) {
      this.running = true;
      const resolve = this.queue.shift();
      resolve!();
    }
  }
}

const gitSemaphore = new GitSemaphore();

const GIT_LOCK_ERROR_PATTERNS = [
  'index.lock',
  'unable to lock',
  'Another git process',
  'fatal: Unable to create',
  'fatal: index file',
];

function isGitLockError(errorMessage: string): boolean {
  return GIT_LOCK_ERROR_PATTERNS.some((pattern) => errorMessage.includes(pattern));
}

// 在锁定冲突时使用指数退避重试git命令
export async function executeGitCommandWithRetry(
  commandArgs: string[],
  sourceDir: string,
  description: string,
  maxRetries: number = 5
): Promise<{ stdout: string; stderr: string }> {
  await gitSemaphore.acquire();

  try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const [cmd, ...args] = commandArgs;
        const result = await $`cd ${sourceDir} && ${cmd} ${args}`;
        return result;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);

        if (isGitLockError(errMsg) && attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.log(
            chalk.yellow(
              `    ⚠️ Git锁定冲突在 ${description} 期间（尝试 ${attempt}/${maxRetries}）。在 ${delay}ms 后重试...`
            )
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }
    throw new Error(`Git命令在 ${maxRetries} 次重试后失败`);
  } finally {
    gitSemaphore.release();
  }
}

// 两阶段重置：硬重置（跟踪文件）+ 清理（未跟踪文件）
export async function rollbackGitWorkspace(
  sourceDir: string,
  reason: string = 'retry preparation'
): Promise<GitOperationResult> {
  // 如果不是git仓库，则跳过git操作
  if (!(await isGitRepository(sourceDir))) {
    console.log(chalk.gray(`    ⏭️  跳过git回滚（不是git仓库）`));
    return { success: true };
  }

  console.log(chalk.yellow(`    🔄 为 ${reason} 回滚工作区`));
  try {
    const changes = await getChangedFiles(sourceDir, '回滚状态检查');

    await executeGitCommandWithRetry(
      ['git', 'reset', '--hard', 'HEAD'],
      sourceDir,
      '回滚硬重置'
    );
    await executeGitCommandWithRetry(
      ['git', 'clean', '-fd'],
      sourceDir,
      '回滚清理未跟踪文件'
    );

    logChangeSummary(
      changes,
      '    ✅ 回滚完成 - 移除了 {count} 个受污染的更改:',
      '    ✅ 回滚完成 - 无更改可移除',
      chalk.yellow,
      3
    );
    return { success: true };
  } catch (error) {
    const result = toErrorResult(error);
    console.log(chalk.red(`    ❌ 重试后回滚失败: ${result.error?.message}`));
    return result;
  }
}

// 在每次尝试前创建检查点。第一次尝试保留工作区；重试时清理工作区。
export async function createGitCheckpoint(
  sourceDir: string,
  description: string,
  attempt: number
): Promise<GitOperationResult> {
  // 如果不是git仓库，则跳过git操作
  if (!(await isGitRepository(sourceDir))) {
    console.log(chalk.gray(`    ⏭️  跳过git检查点（不是git仓库）`));
    return { success: true };
  }

  console.log(chalk.blue(`    📍 为 ${description} 创建检查点（尝试 ${attempt}）`));
  try {
    // 第一次尝试：保留现有交付物。重试：清理工作区以防止污染
    if (attempt > 1) {
      const cleanResult = await rollbackGitWorkspace(sourceDir, `${description}（重试清理）`);
      if (!cleanResult.success) {
        console.log(
          chalk.yellow(`    ⚠️ 工作区清理失败，继续执行: ${cleanResult.error?.message}`)
        );
      }
    }

    const changes = await getChangedFiles(sourceDir, '状态检查');
    const hasChanges = changes.length > 0;

    await executeGitCommandWithRetry(['git', 'add', '-A'], sourceDir, '暂存更改');
    await executeGitCommandWithRetry(
      ['git', 'commit', '-m', `📍 检查点: ${description}（尝试 ${attempt}）`, '--allow-empty'],
      sourceDir,
      '创建提交'
    );

    if (hasChanges) {
      console.log(chalk.blue(`    ✅ 检查点已创建，未提交的更改已暂存`));
    } else {
      console.log(chalk.blue(`    ✅ 创建了空检查点（无工作区更改）`));
    }
    return { success: true };
  } catch (error) {
    const result = toErrorResult(error);
    console.log(chalk.yellow(`    ⚠️ 重试后检查点创建失败: ${result.error?.message}`));
    return result;
  }
}

export async function commitGitSuccess(
  sourceDir: string,
  description: string
): Promise<GitOperationResult> {
  // 如果不是git仓库，则跳过git操作
  if (!(await isGitRepository(sourceDir))) {
    console.log(chalk.gray(`    ⏭️  跳过git提交（不是git仓库）`));
    return { success: true };
  }

  console.log(chalk.green(`    💾 为 ${description} 提交成功结果`));
  try {
    const changes = await getChangedFiles(sourceDir, '成功提交状态检查');

    await executeGitCommandWithRetry(
      ['git', 'add', '-A'],
      sourceDir,
      '暂存成功提交的更改'
    );
    await executeGitCommandWithRetry(
      ['git', 'commit', '-m', `✅ ${description}: 成功完成`, '--allow-empty'],
      sourceDir,
      '创建成功提交'
    );

    logChangeSummary(
      changes,
      '    ✅ 成功提交已创建，包含 {count} 个文件更改:',
      '    ✅ 创建了空成功提交（智能体未进行文件更改）',
      chalk.green,
      5
    );
    return { success: true };
  } catch (error) {
    const result = toErrorResult(error);
    console.log(chalk.yellow(`    ⚠️ 重试后成功提交失败: ${result.error?.message}`));
    return result;
  }
}

/**
 * 获取当前git提交哈希。
 * 如果不是git仓库，则返回null。
 */
export async function getGitCommitHash(sourceDir: string): Promise<string | null> {
  if (!(await isGitRepository(sourceDir))) {
    return null;
  }
  try {
    const result = await $`cd ${sourceDir} && git rev-parse HEAD`;
    return result.stdout.trim();
  } catch {
    return null;
  }
}