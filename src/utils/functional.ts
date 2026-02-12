// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * 函数式编程工具
 *
 * 用于异步操作的通用函数组合模式。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PipelineFunction = (x: any) => any | Promise<any>;

/**
 * 异步管道，将结果通过一系列函数传递。
 * 比基于reduce的pipe更清晰，更易于调试。
 */
export async function asyncPipe<TResult>(
  initial: unknown,
  ...fns: PipelineFunction[]
): Promise<TResult> {
  let result = initial;
  for (const fn of fns) {
    result = await fn(result);
  }
  return result as TResult;
}