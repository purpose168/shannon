// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * 并发控制工具
 *
 * 提供互斥锁实现，用于防止并发会话操作期间的竞争条件。
 */

type UnlockFunction = () => void;

/**
 * SessionMutex - 基于Promise的会话文件操作互斥锁
 *
 * 当多个智能体或操作尝试同时修改相同的会话数据时，防止竞争条件。
 * 这在漏洞分析和利用阶段的并行执行期间尤为重要。
 *
 * 使用方法：
 * ```ts
 * const mutex = new SessionMutex();
 * const unlock = await mutex.lock(sessionId);
 * try {
 *   // 临界区 - 修改会话数据
 * } finally {
 *   unlock(); // 始终释放锁
 * }
 * ```
 */
// 基于Promise的互斥锁，带有队列语义 - 对同一会话上的并行智能体安全
export class SessionMutex {
  // sessionId -> Promise 的映射（代表活动锁）
  private locks: Map<string, Promise<void>> = new Map();

  // 等待现有锁，然后获取。队列确保FIFO顺序。
  async lock(sessionId: string): Promise<UnlockFunction> {
    if (this.locks.has(sessionId)) {
      // 等待现有锁被释放
      await this.locks.get(sessionId);
    }

    // 创建新的锁promise
    let resolve: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    this.locks.set(sessionId, promise);

    // 返回解锁函数
    return () => {
      this.locks.delete(sessionId);
      resolve!();
    };
  }
}