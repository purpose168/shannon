#!/usr/bin/env node
// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Shannon 渗透测试管道的 Temporal 工作器。
 *
 * 轮询 'shannon-pipeline' 任务队列并执行活动。
 * 处理最多 25 个并发活动，以支持多个并行工作流。
 *
 * 使用方法：
 *   npm run temporal:worker
 *   # 或
 *   node dist/temporal/worker.js
 *
 * 环境变量：
 *   TEMPORAL_ADDRESS - Temporal 服务器地址（默认：localhost:7233）
 */

import { NativeConnection, Worker, bundleWorkflowCode } from '@temporalio/worker';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import chalk from 'chalk';
import * as activities from './activities.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runWorker(): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  console.log(chalk.cyan(`正在连接到 Temporal 服务器 ${address}...`));

  const connection = await NativeConnection.connect({ address });

  // 为 Temporal 的 V8 隔离环境打包工作流
  console.log(chalk.gray('正在打包工作流...'));
  const workflowBundle = await bundleWorkflowCode({
    workflowsPath: path.join(__dirname, 'workflows.js'),
  });

  const worker = await Worker.create({
    connection,
    namespace: 'default',
    workflowBundle,
    activities,
    taskQueue: 'shannon-pipeline',
    maxConcurrentActivityTaskExecutions: 25, // 支持多个并行工作流（5 个智能体 × ~5 个工作流）
  });

  // 优雅关闭处理
  const shutdown = async (): Promise<void> => {
    console.log(chalk.yellow('\n正在关闭工作器...'));
    worker.shutdown();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(chalk.green('Shannon 工作器已启动'));
  console.log(chalk.gray('任务队列: shannon-pipeline'));
  console.log(chalk.gray('按 Ctrl+C 停止\n'));

  try {
    await worker.run();
  } finally {
    await connection.close();
    console.log(chalk.gray('工作器已停止'));
  }
}

runWorker().catch((err) => {
  console.error(chalk.red('工作器失败:'), err);
  process.exit(1);
});