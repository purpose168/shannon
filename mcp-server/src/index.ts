// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Shannon Helper MCP 服务器
 *
 * 进程内 MCP 服务器，为 Shannon 渗透测试智能体提供 save_deliverable 和 generate_totp 工具。
 *
 * 使用原生工具访问替换 bash 脚本调用。
 *
 * 使用工厂模式创建工具，将 targetDir 捕获在闭包中，
 * 确保多个工作流并行运行时的线程安全性。
 */

import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { createSaveDeliverableTool } from './tools/save-deliverable.js';
import { generateTotpTool } from './tools/generate-totp.js';

/**
 * 创建带有目标目录上下文的 Shannon Helper MCP 服务器
 *
 * 每个工作流都应使用其 targetDir 创建自己的 MCP 服务器实例。
 * save_deliverable 工具将 targetDir 捕获在闭包中，防止多个工作流并行运行时出现竞争条件。
 */
export function createShannonHelperServer(targetDir: string): ReturnType<typeof createSdkMcpServer> {
  // 创建带有 targetDir 的 save_deliverable 工具（无全局变量）
  const saveDeliverableTool = createSaveDeliverableTool(targetDir);

  return createSdkMcpServer({
    name: 'shannon-helper',
    version: '1.0.0',
    tools: [saveDeliverableTool, generateTotpTool],
  });
}

// 导出工厂以供直接使用（如需）
export { createSaveDeliverableTool } from './tools/save-deliverable.js';
export { generateTotpTool } from './tools/generate-totp.js';

// 导出类型以供外部使用
export * from './types/index.js';
