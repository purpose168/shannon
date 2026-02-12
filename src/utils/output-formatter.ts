// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { AGENTS } from '../session-manager.js';

interface ToolCallInput {
  url?: string;
  element?: string;
  key?: string;
  fields?: unknown[];
  text?: string;
  action?: string;
  description?: string;
  todos?: Array<{
    status: string;
    content: string;
  }>;
  [key: string]: unknown;
}

interface ToolCall {
  name: string;
  input?: ToolCallInput;
}

/**
 * 从URL中提取域名用于显示
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname || url.slice(0, 30);
  } catch {
    return url.slice(0, 30);
  }
}

/**
 * 将TodoWrite更新总结为清晰的进度指示器
 */
function summarizeTodoUpdate(input: ToolCallInput | undefined): string | null {
  if (!input?.todos || !Array.isArray(input.todos)) {
    return null;
  }

  const todos = input.todos;
  const completed = todos.filter((t) => t.status === 'completed');
  const inProgress = todos.filter((t) => t.status === 'in_progress');

  // 显示最近完成的任务
  if (completed.length > 0) {
    const recent = completed[completed.length - 1];
    return `✅ ${recent.content}`;
  }

  // 显示当前进行中的任务
  if (inProgress.length > 0) {
    const current = inProgress[0];
    return `🔄 ${current.content}`;
  }

  return null;
}

/**
 * 获取并行执行的智能体前缀
 */
export function getAgentPrefix(description: string): string {
  // 将智能体名称映射到其前缀
  const agentPrefixes: Record<string, string> = {
    'injection-vuln': '[Injection]',
    'xss-vuln': '[XSS]',
    'auth-vuln': '[Auth]',
    'authz-vuln': '[Authz]',
    'ssrf-vuln': '[SSRF]',
    'injection-exploit': '[Injection]',
    'xss-exploit': '[XSS]',
    'auth-exploit': '[Auth]',
    'authz-exploit': '[Authz]',
    'ssrf-exploit': '[SSRF]',
  };

  // 首先尝试通过智能体名称直接匹配
  for (const [agentName, prefix] of Object.entries(agentPrefixes)) {
    const agent = AGENTS[agentName as keyof typeof AGENTS];
    if (agent && description.includes(agent.displayName)) {
      return prefix;
    }
  }

  // 回退到部分匹配以保持向后兼容性
  if (description.includes('injection')) return '[Injection]';
  if (description.includes('xss')) return '[XSS]';
  if (description.includes('authz')) return '[Authz]'; // 在auth之前检查authz
  if (description.includes('auth')) return '[Auth]';
  if (description.includes('ssrf')) return '[SSRF]';

  return '[Agent]';
}

/**
 * 将浏览器工具调用格式化为清晰的进度指示器
 */
function formatBrowserAction(toolCall: ToolCall): string {
  const toolName = toolCall.name;
  const input = toolCall.input || {};

  // 核心浏览器操作
  if (toolName === 'mcp__playwright__browser_navigate') {
    const url = input.url || '';
    const domain = extractDomain(url);
    return `🌐 导航到 ${domain}`;
  }

  if (toolName === 'mcp__playwright__browser_navigate_back') {
    return `⬅️ 返回上一页`;
  }

  // 页面交互
  if (toolName === 'mcp__playwright__browser_click') {
    const element = input.element || 'element';
    return `🖱️ 点击 ${element.slice(0, 25)}`;
  }

  if (toolName === 'mcp__playwright__browser_hover') {
    const element = input.element || 'element';
    return `👆 悬停在 ${element.slice(0, 20)}`;
  }

  if (toolName === 'mcp__playwright__browser_type') {
    const element = input.element || 'field';
    return `⌨️ 在 ${element.slice(0, 20)} 中输入`;
  }

  if (toolName === 'mcp__playwright__browser_press_key') {
    const key = input.key || 'key';
    return `⌨️ 按下 ${key}`;
  }

  // 表单处理
  if (toolName === 'mcp__playwright__browser_fill_form') {
    const fieldCount = input.fields?.length || 0;
    return `📝 填写 ${fieldCount} 个表单字段`;
  }

  if (toolName === 'mcp__playwright__browser_select_option') {
    return `📋 选择下拉选项`;
  }

  if (toolName === 'mcp__playwright__browser_file_upload') {
    return `📁 上传文件`;
  }

  // 页面分析
  if (toolName === 'mcp__playwright__browser_snapshot') {
    return `📸 拍摄页面快照`;
  }

  if (toolName === 'mcp__playwright__browser_take_screenshot') {
    return `📸 拍摄屏幕截图`;
  }

  if (toolName === 'mcp__playwright__browser_evaluate') {
    return `🔍 运行JavaScript分析`;
  }

  // 等待和监控
  if (toolName === 'mcp__playwright__browser_wait_for') {
    if (input.text) {
      return `⏳ 等待 "${input.text.slice(0, 20)}"`;
    }
    return `⏳ 等待页面响应`;
  }

  if (toolName === 'mcp__playwright__browser_console_messages') {
    return `📜 检查控制台日志`;
  }

  if (toolName === 'mcp__playwright__browser_network_requests') {
    return `🌐 分析网络流量`;
  }

  // 标签管理
  if (toolName === 'mcp__playwright__browser_tabs') {
    const action = input.action || 'managing';
    return `🗂️ ${action} 浏览器标签页`;
  }

  // 对话框处理
  if (toolName === 'mcp__playwright__browser_handle_dialog') {
    return `💬 处理浏览器对话框`;
  }

  // 对任何遗漏工具的回退
  const actionType = toolName.split('_').pop();
  return `🌐 浏览器: ${actionType}`;
}

/**
 * 从内容中过滤出JSON工具调用，对Task调用进行特殊处理
 */
export function filterJsonToolCalls(content: string | null | undefined): string {
  if (!content || typeof content !== 'string') {
    return content || '';
  }

  const lines = content.split('\n');
  const processedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // 跳过空行
    if (trimmed === '') {
      continue;
    }

    // 检查这是否是JSON工具调用
    if (trimmed.startsWith('{"type":"tool_use"')) {
      try {
        const toolCall = JSON.parse(trimmed) as ToolCall;

        // 对Task工具调用的特殊处理
        if (toolCall.name === 'Task') {
          const description = toolCall.input?.description || 'analysis agent';
          processedLines.push(`🚀 启动 ${description}`);
          continue;
        }

        // 对TodoWrite工具调用的特殊处理
        if (toolCall.name === 'TodoWrite') {
          const summary = summarizeTodoUpdate(toolCall.input);
          if (summary) {
            processedLines.push(summary);
          }
          continue;
        }

        // 对浏览器工具调用的特殊处理
        if (toolCall.name.startsWith('mcp__playwright__browser_')) {
          const browserAction = formatBrowserAction(toolCall);
          if (browserAction) {
            processedLines.push(browserAction);
          }
          continue;
        }

        // 隐藏所有其他工具调用（Read、Write、Grep等）
        continue;
      } catch {
        // 如果JSON解析失败，将其视为常规文本
        processedLines.push(line);
      }
    } else {
      // 保留非JSON行（助手文本）
      processedLines.push(line);
    }
  }

  return processedLines.join('\n');
}