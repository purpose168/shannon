#!/usr/bin/env node
// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * 启动 Shannon 渗透测试管道工作流的 Temporal 客户端。
 *
 * 启动工作流并可选地等待完成，同时进行进度轮询。
 *
 * 使用方法：
 *   npm run temporal:start -- <webUrl> <repoPath> [options]
 *   # 或
 *   node dist/temporal/client.js <webUrl> <repoPath> [options]
 *
 * 选项：
 *   --config <path>       配置文件路径
 *   --output <path>       审计日志的输出目录
 *   --pipeline-testing    使用最小提示进行快速测试
 *   --workflow-id <id>    自定义工作流 ID（默认：shannon-<timestamp>）
 *   --wait                等待工作流完成并进行进度轮询
 *
 * 环境变量：
 *   TEMPORAL_ADDRESS - Temporal 服务器地址（默认：localhost:7233）
 */

import { Connection, Client } from '@temporalio/client';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { displaySplashScreen } from '../splash-screen.js';
import { sanitizeHostname } from '../audit/utils.js';
// 仅导入类型 - 这些不会引入工作流运行时代码
import type { PipelineInput, PipelineState, PipelineProgress } from './shared.js';

dotenv.config();

// 查询名称必须与 workflows.ts 中定义的一致
const PROGRESS_QUERY = 'getProgress';

function showUsage(): void {
  console.log(chalk.cyan.bold('\nShannon Temporal 客户端'));
  console.log(chalk.gray('启动渗透测试管道工作流\n'));
  console.log(chalk.yellow('使用方法:'));
  console.log(
    '  node dist/temporal/client.js <webUrl> <repoPath> [options]\n'
  );
  console.log(chalk.yellow('选项:'));
  console.log('  --config <path>       配置文件路径');
  console.log('  --output <path>       审计日志的输出目录');
  console.log('  --pipeline-testing    使用最小提示进行快速测试');
  console.log(
    '  --workflow-id <id>    自定义工作流 ID（默认：shannon-<timestamp>）'
  );
  console.log('  --wait                等待工作流完成并进行进度轮询\n');
  console.log(chalk.yellow('示例:'));
  console.log('  node dist/temporal/client.js https://example.com /path/to/repo');
  console.log(
    '  node dist/temporal/client.js https://example.com /path/to/repo --config config.yaml\n'
  );
}

async function startPipeline(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showUsage();
    process.exit(0);
  }

  // 解析参数
  let webUrl: string | undefined;
  let repoPath: string | undefined;
  let configPath: string | undefined;
  let outputPath: string | undefined;
  let displayOutputPath: string | undefined; // 用于显示目的的主机路径
  let pipelineTestingMode = false;
  let customWorkflowId: string | undefined;
  let waitForCompletion = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--config') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        configPath = nextArg;
        i++;
      }
    } else if (arg === '--output') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        outputPath = nextArg;
        i++;
      }
    } else if (arg === '--display-output') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        displayOutputPath = nextArg;
        i++;
      }
    } else if (arg === '--workflow-id') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        customWorkflowId = nextArg;
        i++;
      }
    } else if (arg === '--pipeline-testing') {
      pipelineTestingMode = true;
    } else if (arg === '--wait') {
      waitForCompletion = true;
    } else if (arg && !arg.startsWith('-')) {
      if (!webUrl) {
        webUrl = arg;
      } else if (!repoPath) {
        repoPath = arg;
      }
    }
  }

  if (!webUrl || !repoPath) {
    console.log(chalk.red('错误: webUrl 和 repoPath 是必需的'));
    showUsage();
    process.exit(1);
  }

  // 显示启动屏幕
  await displaySplashScreen();

  const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  console.log(chalk.gray(`正在连接到 Temporal 服务器 ${address}...`));

  const connection = await Connection.connect({ address });
  const client = new Client({ connection });

  try {
    const hostname = sanitizeHostname(webUrl);
    const workflowId = customWorkflowId || `${hostname}_shannon-${Date.now()}`;

    const input: PipelineInput = {
      webUrl,
      repoPath,
      ...(configPath && { configPath }),
      ...(outputPath && { outputPath }),
      ...(pipelineTestingMode && { pipelineTestingMode }),
    };

    // 确定用于显示的输出目录
    // 如果提供了 displayOutputPath（主机路径），则使用它，否则回退到 outputPath 或默认值
    const effectiveDisplayPath = displayOutputPath || outputPath || './audit-logs';
    const outputDir = `${effectiveDisplayPath}/${workflowId}`;

    console.log(chalk.green.bold(`✓ 工作流已启动: ${workflowId}`));
    console.log();
    console.log(chalk.white('  目标:     ') + chalk.cyan(webUrl));
    console.log(chalk.white('  仓库:     ') + chalk.cyan(repoPath));
    if (configPath) {
      console.log(chalk.white('  配置:     ') + chalk.cyan(configPath));
    }
    if (displayOutputPath) {
      console.log(chalk.white('  输出:     ') + chalk.cyan(displayOutputPath));
    }
    if (pipelineTestingMode) {
      console.log(chalk.white('  模式:     ') + chalk.yellow('管道测试'));
    }
    console.log();

    // 按名称启动工作流（不通过导入函数）
    const handle = await client.workflow.start<(input: PipelineInput) => Promise<PipelineState>>(
      'pentestPipelineWorkflow',
      {
        taskQueue: 'shannon-pipeline',
        workflowId,
        args: [input],
      }
    );

    if (!waitForCompletion) {
      console.log(chalk.bold('监控进度:'));
      console.log(chalk.white('  Web UI:  ') + chalk.blue(`http://localhost:8233/namespaces/default/workflows/${workflowId}`));
      console.log(chalk.white('  日志:    ') + chalk.gray(`./shannon logs ID=${workflowId}`));
      console.log(chalk.white('  查询:   ') + chalk.gray(`./shannon query ID=${workflowId}`));
      console.log();
      console.log(chalk.bold('输出:'));
      console.log(chalk.white('  报告: ') + chalk.cyan(outputDir));
      console.log();
      return;
    }

    // 每 30 秒轮询一次进度
    const progressInterval = setInterval(async () => {
      try {
        const progress = await handle.query<PipelineProgress>(PROGRESS_QUERY);
        const elapsed = Math.floor(progress.elapsedMs / 1000);
        console.log(
          chalk.gray(`[${elapsed}秒]`),
          chalk.cyan(`阶段: ${progress.currentPhase || '未知'}`),
          chalk.gray(`| 智能体: ${progress.currentAgent || '无'}`),
          chalk.gray(`| 已完成: ${progress.completedAgents.length}/13`)
        );
      } catch {
        // 工作流可能已完成
      }
    }, 30000);

    try {
      const result = await handle.result();
      clearInterval(progressInterval);

      console.log(chalk.green.bold('\n管道已成功完成!'));
      if (result.summary) {
        console.log(chalk.gray(`持续时间: ${Math.floor(result.summary.totalDurationMs / 1000)}秒`));
        console.log(chalk.gray(`已完成智能体: ${result.summary.agentCount}`));
        console.log(chalk.gray(`总轮数: ${result.summary.totalTurns}`));
        console.log(chalk.gray(`总成本: $${result.summary.totalCostUsd.toFixed(4)}`));
      }
    } catch (error) {
      clearInterval(progressInterval);
      console.error(chalk.red.bold('\n管道失败:'), error);
      process.exit(1);
    }
  } finally {
    await connection.close();
  }
}

startPipeline().catch((err) => {
  console.error(chalk.red('客户端错误:'), err);
  process.exit(1);
});