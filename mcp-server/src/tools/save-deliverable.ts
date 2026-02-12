// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * save_deliverable MCP 工具
 *
 * 保存可交付成果文件并进行自动验证。
 * 替代 tools/save_deliverable.js bash 脚本。
 *
 * 使用工厂模式在闭包中捕获 targetDir，避免多个工作流并行运行时的竞争条件。
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { DeliverableType, DELIVERABLE_FILENAMES, isQueueType } from '../types/deliverables.js';
import { createToolResult, type ToolResult, type SaveDeliverableResponse } from '../types/tool-responses.js';
import { validateQueueJson } from '../validation/queue-validator.js';
import { saveDeliverableFile } from '../utils/file-operations.js';
import { createValidationError, createGenericError } from '../utils/error-formatter.js';

/**
 * save_deliverable 工具的输入模式
 */
export const SaveDeliverableInputSchema = z.object({
  deliverable_type: z.nativeEnum(DeliverableType).describe('要保存的可交付成果类型'),
  content: z.string().min(1).optional().describe('文件内容（分析/证据为 markdown，队列为 JSON）。如果提供了 file_path，则可选。'),
  file_path: z.string().optional().describe('其内容应用作可交付成果内容的文件路径。相对路径相对于 deliverables 目录解析。对于大型报告，使用此选项而不是内联 content 以避免输出令牌限制。'),
});

export type SaveDeliverableInput = z.infer<typeof SaveDeliverableInputSchema>;

/**
 * 检查路径是否包含在基础目录中。
 * 防止路径遍历攻击（例如，../../../etc/passwd）。
 */
function isPathContained(basePath: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep);
}

/**
 * 从内联内容或文件路径解析可交付成果内容。
 * 成功时返回内容字符串，失败时返回 ToolResult 错误。
 */
function resolveContent(
  args: SaveDeliverableInput,
  targetDir: string,
): string | ToolResult {
  if (args.content) {
    return args.content;
  }

  if (!args.file_path) {
    return createToolResult(createValidationError(
      '必须提供 "content" 或 "file_path"',
      true,
      { deliverableType: args.deliverable_type },
    ));
  }

  const resolvedPath = path.isAbsolute(args.file_path)
    ? args.file_path
    : path.resolve(targetDir, args.file_path);

  // 安全：防止目标目录外的路径遍历
  if (!isPathContained(targetDir, resolvedPath)) {
    return createToolResult(createValidationError(
      `路径 "${args.file_path}" 解析到允许的目录外`,
      false,
      { deliverableType: args.deliverable_type, allowedBase: targetDir },
    ));
  }

  try {
    return fs.readFileSync(resolvedPath, 'utf-8');
  } catch (readError) {
    return createToolResult(createValidationError(
      `无法读取 ${resolvedPath} 处的文件：${readError instanceof Error ? readError.message : String(readError)}`,
      true,
      { deliverableType: args.deliverable_type, filePath: resolvedPath },
    ));
  }
}

/**
 * 创建在闭包中捕获 targetDir 的 save_deliverable 处理程序。
 *
 * 此工厂模式确保每个 MCP 服务器实例都有自己的 targetDir，
 * 防止多个工作流并行运行时的竞争条件。
 */
function createSaveDeliverableHandler(targetDir: string) {
  return async function saveDeliverable(args: SaveDeliverableInput): Promise<ToolResult> {
    try {
      const { deliverable_type } = args;

      const contentOrError = resolveContent(args, targetDir);
      if (typeof contentOrError !== 'string') {
        return contentOrError;
      }
      const content = contentOrError;

      if (isQueueType(deliverable_type)) {
        const queueValidation = validateQueueJson(content);
        if (!queueValidation.valid) {
          return createToolResult(createValidationError(
            queueValidation.message ?? '无效的队列 JSON',
            true,
            { deliverableType: deliverable_type, expectedFormat: '{"vulnerabilities": [...]}' },
          ));
        }
      }

      const filename = DELIVERABLE_FILENAMES[deliverable_type];
      const filepath = saveDeliverableFile(targetDir, filename, content);

      const successResponse: SaveDeliverableResponse = {
        status: 'success',
        message: `可交付成果保存成功：${filename}`,
        filepath,
        deliverableType: deliverable_type,
        validated: isQueueType(deliverable_type),
      };

      return createToolResult(successResponse);
    } catch (error) {
      return createToolResult(createGenericError(
        error,
        false,
        { deliverableType: args.deliverable_type },
      ));
    }
  };
}

/**
 * 工厂函数，创建在闭包中包含 targetDir 的 save_deliverable 工具
 *
 * 每个 MCP 服务器实例都应使用自己的 targetDir 调用此函数，以确保
 * 可交付成果保存到正确的工作流目录。
 */
export function createSaveDeliverableTool(targetDir: string) {
  return tool(
    'save_deliverable',
    '保存可交付成果文件并进行自动验证。队列文件必须具有 {"vulnerabilities": [...]} 结构。对于大型报告，先将文件写入磁盘，然后传递 file_path 而不是内联 content 以避免输出令牌限制。',
    SaveDeliverableInputSchema.shape,
    createSaveDeliverableHandler(targetDir)
  );
}
