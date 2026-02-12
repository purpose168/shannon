// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';
import { PentestError } from './error-handling.js';
import { asyncPipe } from './utils/functional.js';

export type VulnType = 'injection' | 'xss' | 'auth' | 'ssrf' | 'authz';

interface VulnTypeConfigItem {
  deliverable: string;
  queue: string;
}

type VulnTypeConfig = Record<VulnType, VulnTypeConfigItem>;

type ErrorMessageResolver = string | ((existence: FileExistence) => string);

interface ValidationRule {
  predicate: (existence: FileExistence) => boolean;
  errorMessage: ErrorMessageResolver;
  retryable: boolean;
}

interface FileExistence {
  deliverableExists: boolean;
  queueExists: boolean;
}

interface PathsBase {
  vulnType: VulnType;
  deliverable: string;
  queue: string;
  sourceDir: string;
}

interface PathsWithExistence extends PathsBase {
  existence: FileExistence;
}

interface PathsWithQueue extends PathsWithExistence {
  queueData: QueueData;
}

interface PathsWithError {
  error: PentestError;
}

interface QueueData {
  vulnerabilities: unknown[];
  [key: string]: unknown;
}

interface QueueValidationResult {
  valid: boolean;
  data: QueueData | null;
  error: string | null;
}

export interface ExploitationDecision {
  shouldExploit: boolean;
  shouldRetry: boolean;
  vulnerabilityCount: number;
  vulnType: VulnType;
}

export interface SafeValidationResult {
  success: boolean;
  data?: ExploitationDecision;
  error?: PentestError;
}

// 漏洞类型配置为不可变数据
const VULN_TYPE_CONFIG: VulnTypeConfig = Object.freeze({
  injection: Object.freeze({
    deliverable: 'injection_analysis_deliverable.md',
    queue: 'injection_exploitation_queue.json',
  }),
  xss: Object.freeze({
    deliverable: 'xss_analysis_deliverable.md',
    queue: 'xss_exploitation_queue.json',
  }),
  auth: Object.freeze({
    deliverable: 'auth_analysis_deliverable.md',
    queue: 'auth_exploitation_queue.json',
  }),
  ssrf: Object.freeze({
    deliverable: 'ssrf_analysis_deliverable.md',
    queue: 'ssrf_exploitation_queue.json',
  }),
  authz: Object.freeze({
    deliverable: 'authz_analysis_deliverable.md',
    queue: 'authz_exploitation_queue.json',
  }),
}) as VulnTypeConfig;

// 创建验证规则的纯函数
function createValidationRule(
  predicate: (existence: FileExistence) => boolean,
  errorMessage: ErrorMessageResolver,
  retryable: boolean = true
): ValidationRule {
  return Object.freeze({ predicate, errorMessage, retryable });
}

// 对称交付物规则：队列和交付物必须同时存在（防止部分分析触发利用）
const fileExistenceRules: readonly ValidationRule[] = Object.freeze([
  createValidationRule(
    ({ deliverableExists, queueExists }) => deliverableExists && queueExists,
    getExistenceErrorMessage
  ),
]);

// 根据缺失的文件生成适当的错误消息
function getExistenceErrorMessage(existence: FileExistence): string {
  const { deliverableExists, queueExists } = existence;

  if (!deliverableExists && !queueExists) {
    return 'Analysis failed: Neither deliverable nor queue file exists. Analysis agent must create both files.';
  }
  if (!queueExists) {
    return 'Analysis incomplete: Deliverable exists but queue file missing. Analysis agent must create both files.';
  }
  return 'Analysis incomplete: Queue exists but deliverable file missing. Analysis agent must create both files.';
}

// 创建文件路径的纯函数
const createPaths = (
  vulnType: VulnType,
  sourceDir: string
): PathsBase | PathsWithError => {
  const config = VULN_TYPE_CONFIG[vulnType];
  if (!config) {
    return {
      error: new PentestError(
        `Unknown vulnerability type: ${vulnType}`,
        'validation',
        false,
        { vulnType }
      ),
    };
  }

  return Object.freeze({
    vulnType,
    deliverable: path.join(sourceDir, 'deliverables', config.deliverable),
    queue: path.join(sourceDir, 'deliverables', config.queue),
    sourceDir,
  });
};

// 检查文件存在性的纯函数
const checkFileExistence = async (
  paths: PathsBase | PathsWithError
): Promise<PathsWithExistence | PathsWithError> => {
  if ('error' in paths) return paths;

  const [deliverableExists, queueExists] = await Promise.all([
    fs.pathExists(paths.deliverable),
    fs.pathExists(paths.queue),
  ]);

  return Object.freeze({
    ...paths,
    existence: Object.freeze({ deliverableExists, queueExists }),
  });
};

// 验证交付物/队列对称性 - 两者必须同时存在或同时不存在
const validateExistenceRules = (
  pathsWithExistence: PathsWithExistence | PathsWithError
): PathsWithExistence | PathsWithError => {
  if ('error' in pathsWithExistence) return pathsWithExistence;

  const { existence, vulnType } = pathsWithExistence;

  // 找到第一个失败的规则
  const failedRule = fileExistenceRules.find((rule) => !rule.predicate(existence));

  if (failedRule) {
    const message =
      typeof failedRule.errorMessage === 'function'
        ? failedRule.errorMessage(existence)
        : failedRule.errorMessage;

    return {
      error: new PentestError(
        `${message} (${vulnType})`,
        'validation',
        failedRule.retryable,
        {
          vulnType,
          deliverablePath: pathsWithExistence.deliverable,
          queuePath: pathsWithExistence.queue,
          existence,
        }
      ),
    };
  }

  return pathsWithExistence;
};

// 验证队列结构的纯函数
const validateQueueStructure = (content: string): QueueValidationResult => {
  try {
    const parsed = JSON.parse(content) as unknown;
    const isValid =
      typeof parsed === 'object' &&
      parsed !== null &&
      'vulnerabilities' in parsed &&
      Array.isArray((parsed as QueueData).vulnerabilities);

    return Object.freeze({
      valid: isValid,
      data: isValid ? (parsed as QueueData) : null,
      error: null,
    });
  } catch (parseError) {
    return Object.freeze({
      valid: false,
      data: null,
      error: parseError instanceof Error ? parseError.message : String(parseError),
    });
  }
};

// 队列解析失败是可重试的 - 智能体可以在重试时修复格式错误的 JSON
const validateQueueContent = async (
  pathsWithExistence: PathsWithExistence | PathsWithError
): Promise<PathsWithQueue | PathsWithError> => {
  if ('error' in pathsWithExistence) return pathsWithExistence;

  try {
    const queueContent = await fs.readFile(pathsWithExistence.queue, 'utf8');
    const queueValidation = validateQueueStructure(queueContent);

    if (!queueValidation.valid) {
      // 规则 6: 两者都存在，队列无效
      return {
        error: new PentestError(
          queueValidation.error
            ? `Queue validation failed for ${pathsWithExistence.vulnType}: Invalid JSON structure. Analysis agent must fix queue format.`
            : `Queue validation failed for ${pathsWithExistence.vulnType}: Missing or invalid 'vulnerabilities' array. Analysis agent must fix queue structure.`,
          'validation',
          true, // 可重试
          {
            vulnType: pathsWithExistence.vulnType,
            queuePath: pathsWithExistence.queue,
            originalError: queueValidation.error,
            queueStructure: queueValidation.data ? Object.keys(queueValidation.data) : [],
          }
        ),
      };
    }

    return Object.freeze({
      ...pathsWithExistence,
      queueData: queueValidation.data!,
    });
  } catch (readError) {
    return {
      error: new PentestError(
        `Failed to read queue file for ${pathsWithExistence.vulnType}: ${readError instanceof Error ? readError.message : String(readError)}`,
        'filesystem',
        false,
        {
          vulnType: pathsWithExistence.vulnType,
          queuePath: pathsWithExistence.queue,
          originalError: readError instanceof Error ? readError.message : String(readError),
        }
      ),
    };
  }
};

// 最终决策：如果队列为空则跳过，发现漏洞则继续，否则报错
const determineExploitationDecision = (
  validatedData: PathsWithQueue | PathsWithError
): ExploitationDecision => {
  if ('error' in validatedData) {
    throw validatedData.error;
  }

  const hasVulnerabilities = validatedData.queueData.vulnerabilities.length > 0;

  // 规则 4: 两者都存在，队列有效且有内容
  // 规则 5: 两者都存在，队列有效但为空
  return Object.freeze({
    shouldExploit: hasVulnerabilities,
    shouldRetry: false,
    vulnerabilityCount: validatedData.queueData.vulnerabilities.length,
    vulnType: validatedData.vulnType,
  });
};

// 主要功能验证管道
export async function validateQueueAndDeliverable(
  vulnType: VulnType,
  sourceDir: string
): Promise<ExploitationDecision> {
  return asyncPipe<ExploitationDecision>(
    createPaths(vulnType, sourceDir),
    checkFileExistence,
    validateExistenceRules,
    validateQueueContent,
    determineExploitationDecision
  );
}

// 安全验证的纯函数（返回结果而不是抛出错误）
export const safeValidateQueueAndDeliverable = async (
  vulnType: VulnType,
  sourceDir: string
): Promise<SafeValidationResult> => {
  try {
    const result = await validateQueueAndDeliverable(vulnType, sourceDir);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error as PentestError };
  }
};
