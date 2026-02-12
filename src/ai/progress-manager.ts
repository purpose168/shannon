// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

// 进度指示器的空对象模式 - 调用者永远不需要检查 null

import { ProgressIndicator } from '../progress-indicator.js';
import { extractAgentType } from '../utils/formatting.js';

export interface ProgressContext {
  description: string;
  useCleanOutput: boolean;
}

export interface ProgressManager {
  start(): void;
  stop(): void;
  finish(message: string): void;
  isActive(): boolean;
}

class RealProgressManager implements ProgressManager {
  private indicator: ProgressIndicator;
  private active: boolean = false;

  constructor(message: string) {
    this.indicator = new ProgressIndicator(message);
  }

  start(): void {
    this.indicator.start();
    this.active = true;
  }

  stop(): void {
    this.indicator.stop();
    this.active = false;
  }

  finish(message: string): void {
    this.indicator.finish(message);
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }
}

/** 空对象实现 - 所有方法都是安全的空操作 */
class NullProgressManager implements ProgressManager {
  start(): void {}

  stop(): void {}

  finish(_message: string): void {}

  isActive(): boolean {
    return false;
  }
}

// 当禁用时返回空操作
export function createProgressManager(
  context: ProgressContext,
  disableLoader: boolean
): ProgressManager {
  if (!context.useCleanOutput || disableLoader) {
    return new NullProgressManager();
  }

  const agentType = extractAgentType(context.description);
  return new RealProgressManager(`运行 ${agentType}...`);
}