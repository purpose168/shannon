// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * 获取实际使用的模型名称。
 * 当使用 claude-code-router 时，SDK 会报告其配置的模型（claude-sonnet）
 * 但实际模型由 ROUTER_DEFAULT 环境变量决定。
 */
export function getActualModelName(sdkReportedModel?: string): string | undefined {
  const routerBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const routerDefault = process.env.ROUTER_DEFAULT;

  // 如果路由模式激活且设置了 ROUTER_DEFAULT，则使用该值
  if (routerBaseUrl && routerDefault) {
    // ROUTER_DEFAULT 格式: "provider,model" (例如: "gemini,gemini-2.5-pro")
    const parts = routerDefault.split(',');
    if (parts.length >= 2) {
      return parts.slice(1).join(','); // 处理包含逗号的模型名称
    }
  }

  // 回退到 SDK 报告的模型
  return sdkReportedModel;
}

/**
 * 检查路由模式是否激活。
 */
export function isRouterMode(): boolean {
  return !!process.env.ANTHROPIC_BASE_URL && !!process.env.ROUTER_DEFAULT;
}
