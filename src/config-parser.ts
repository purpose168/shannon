// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { createRequire } from 'module';
import { fs } from 'zx';
import yaml from 'js-yaml';
import { Ajv, type ValidateFunction } from 'ajv';
import type { FormatsPlugin } from 'ajv-formats';
import { PentestError } from './error-handling.js';
import type {
  Config,
  Rule,
  Rules,
  Authentication,
  DistributedConfig,
} from './types/config.js';

// 使用 require 处理 ESM/CJS 互操作
const require = createRequire(import.meta.url);
const addFormats: FormatsPlugin = require('ajv-formats');

// 初始化带有格式的 AJV
const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);

// 加载 JSON Schema
let configSchema: object;
let validateSchema: ValidateFunction;

try {
  const schemaPath = new URL('../configs/config-schema.json', import.meta.url);
  const schemaContent = await fs.readFile(schemaPath, 'utf8');
  configSchema = JSON.parse(schemaContent) as object;
  validateSchema = ajv.compile(configSchema);
} catch (error) {
  const errMsg = error instanceof Error ? error.message : String(error);
  throw new PentestError(
    `Failed to load configuration schema: ${errMsg}`,
    'config',
    false,
    { schemaPath: '../configs/config-schema.json', originalError: errMsg }
  );
}

// 要阻止的安全模式
const DANGEROUS_PATTERNS: RegExp[] = [
  /\.\.\//, // 路径遍历
  /[<>]/, // HTML/XML 注入
  /javascript:/i, // JavaScript URL
  /data:/i, // Data URL
  /file:/i, // File URL
];

// 解析并加载带有增强安全性的 YAML 配置文件
export const parseConfig = async (configPath: string): Promise<Config> => {
  try {
    // 文件存在检查
    if (!(await fs.pathExists(configPath))) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    // 文件大小检查（防止过大的文件）
    const stats = await fs.stat(configPath);
    const maxFileSize = 1024 * 1024; // 1MB
    if (stats.size > maxFileSize) {
      throw new Error(
        `Configuration file too large: ${stats.size} bytes (maximum: ${maxFileSize} bytes)`
      );
    }

    // 读取文件内容
    const configContent = await fs.readFile(configPath, 'utf8');

    // 基本内容验证
    if (!configContent.trim()) {
      throw new Error('Configuration file is empty');
    }

    // 使用安全选项解析 YAML
    let config: unknown;
    try {
      config = yaml.load(configContent, {
        schema: yaml.FAILSAFE_SCHEMA, // 仅基本 YAML 类型，无 JS 评估
        json: false, // 不允许 JSON 特定语法
        filename: configPath,
      });
    } catch (yamlError) {
      const errMsg = yamlError instanceof Error ? yamlError.message : String(yamlError);
      throw new Error(`YAML parsing failed: ${errMsg}`);
    }

    // 额外安全检查
    if (config === null || config === undefined) {
      throw new Error('Configuration file resulted in null/undefined after parsing');
    }

    // 验证配置结构和内容
    validateConfig(config as Config);

    return config as Config;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    // 增强错误消息上下文
    if (
      errMsg.startsWith('Configuration file not found') ||
      errMsg.startsWith('YAML parsing failed') ||
      errMsg.includes('must be') ||
      errMsg.includes('exceeds maximum')
    ) {
      // 这些已经是格式良好的错误，原样抛出
      throw error;
    } else {
      // 用上下文包装其他错误
      throw new Error(`Failed to parse configuration file '${configPath}': ${errMsg}`);
    }
  }
};

// 使用 JSON Schema 验证整体配置结构
const validateConfig = (config: Config): void => {
  // 基本结构验证
  if (!config || typeof config !== 'object') {
    throw new Error('Configuration must be a valid object');
  }

  if (Array.isArray(config)) {
    throw new Error('Configuration must be an object, not an array');
  }

  // JSON Schema 验证
  const isValid = validateSchema(config);
  if (!isValid) {
    const errors = validateSchema.errors || [];
    const errorMessages = errors.map((err) => {
      const path = err.instancePath || 'root';
      return `${path}: ${err.message}`;
    });
    throw new Error(`Configuration validation failed:\n  - ${errorMessages.join('\n  - ')}`);
  }

  // 额外安全验证
  performSecurityValidation(config);

  // 如果使用了已弃用的字段则发出警告
  if (config.login) {
    console.warn('⚠️  The "login" section is deprecated. Please use "authentication" instead.');
  }

  // 确保提供了至少一些配置
  if (!config.rules && !config.authentication) {
    console.warn(
      '⚠️  Configuration file contains no rules or authentication. The pentest will run without any scoping restrictions or login capabilities.'
    );
  } else if (config.rules && !config.rules.avoid && !config.rules.focus) {
    console.warn(
      '⚠️  Configuration file contains no rules. The pentest will run without any scoping restrictions.'
    );
  }
};

// 执行 JSON Schema 之外的额外安全验证
const performSecurityValidation = (config: Config): void => {
  // 验证身份验证部分的安全问题
  if (config.authentication) {
    const auth = config.authentication;

    // 检查凭证中的危险模式
    if (auth.credentials) {
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(auth.credentials.username)) {
          throw new Error(
            'authentication.credentials.username contains potentially dangerous pattern'
          );
        }
        if (pattern.test(auth.credentials.password)) {
          throw new Error(
            'authentication.credentials.password contains potentially dangerous pattern'
          );
        }
      }
    }

    // 检查登录流程中的危险模式
    if (auth.login_flow) {
      auth.login_flow.forEach((step, index) => {
        for (const pattern of DANGEROUS_PATTERNS) {
          if (pattern.test(step)) {
            throw new Error(
              `authentication.login_flow[${index}] contains potentially dangerous pattern: ${pattern.source}`
            );
          }
        }
      });
    }
  }

  // 验证规则部分的安全问题
  if (config.rules) {
    validateRulesSecurity(config.rules.avoid, 'avoid');
    validateRulesSecurity(config.rules.focus, 'focus');

    // 检查重复和冲突的规则
    checkForDuplicates(config.rules.avoid || [], 'avoid');
    checkForDuplicates(config.rules.focus || [], 'focus');
    checkForConflicts(config.rules.avoid || [], config.rules.focus || []);
  }
};

// 验证规则的安全问题
const validateRulesSecurity = (rules: Rule[] | undefined, ruleType: string): void => {
  if (!rules) return;

  rules.forEach((rule, index) => {
    // 安全验证
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(rule.url_path)) {
        throw new Error(
          `rules.${ruleType}[${index}].url_path contains potentially dangerous pattern: ${pattern.source}`
        );
      }
      if (pattern.test(rule.description)) {
        throw new Error(
          `rules.${ruleType}[${index}].description contains potentially dangerous pattern: ${pattern.source}`
        );
      }
    }

    // 类型特定验证
    validateRuleTypeSpecific(rule, ruleType, index);
  });
};

// 根据规则的特定类型进行验证
const validateRuleTypeSpecific = (rule: Rule, ruleType: string, index: number): void => {
  switch (rule.type) {
    case 'path':
      if (!rule.url_path.startsWith('/')) {
        throw new Error(`rules.${ruleType}[${index}].url_path for type 'path' must start with '/'`);
      }
      break;

    case 'subdomain':
    case 'domain':
      // 基本域名验证 - 不允许斜杠
      if (rule.url_path.includes('/')) {
        throw new Error(
          `rules.${ruleType}[${index}].url_path for type '${rule.type}' cannot contain '/' characters`
        );
      }
      // 域名必须至少包含一个点
      if (rule.type === 'domain' && !rule.url_path.includes('.')) {
        throw new Error(
          `rules.${ruleType}[${index}].url_path for type 'domain' must be a valid domain name`
        );
      }
      break;

    case 'method': {
      const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
      if (!allowedMethods.includes(rule.url_path.toUpperCase())) {
        throw new Error(
          `rules.${ruleType}[${index}].url_path for type 'method' must be one of: ${allowedMethods.join(', ')}`
        );
      }
      break;
    }

    case 'header':
      // 头部名称验证（基本）
      if (!rule.url_path.match(/^[a-zA-Z0-9\-_]+$/)) {
        throw new Error(
          `rules.${ruleType}[${index}].url_path for type 'header' must be a valid header name (alphanumeric, hyphens, underscores only)`
        );
      }
      break;

    case 'parameter':
      // 参数名称验证（基本）
      if (!rule.url_path.match(/^[a-zA-Z0-9\-_]+$/)) {
        throw new Error(
          `rules.${ruleType}[${index}].url_path for type 'parameter' must be a valid parameter name (alphanumeric, hyphens, underscores only)`
        );
      }
      break;
  }
};

// 检查重复规则
const checkForDuplicates = (rules: Rule[], ruleType: string): void => {
  const seen = new Set<string>();
  rules.forEach((rule, index) => {
    const key = `${rule.type}:${rule.url_path}`;
    if (seen.has(key)) {
      throw new Error(
        `Duplicate rule found in rules.${ruleType}[${index}]: ${rule.type} '${rule.url_path}'`
      );
    }
    seen.add(key);
  });
};

// 检查 avoid 和 focus 之间的冲突规则
const checkForConflicts = (avoidRules: Rule[] = [], focusRules: Rule[] = []): void => {
  const avoidSet = new Set(avoidRules.map((rule) => `${rule.type}:${rule.url_path}`));

  focusRules.forEach((rule, index) => {
    const key = `${rule.type}:${rule.url_path}`;
    if (avoidSet.has(key)) {
      throw new Error(
        `Conflicting rule found: rules.focus[${index}] '${rule.url_path}' also exists in rules.avoid`
      );
    }
  });
};

// 清理并标准化规则值
const sanitizeRule = (rule: Rule): Rule => {
  return {
    description: rule.description.trim(),
    type: rule.type.toLowerCase().trim() as Rule['type'],
    url_path: rule.url_path.trim(),
  };
};

// 将配置部分分发给不同的智能体，并进行清理
export const distributeConfig = (config: Config | null): DistributedConfig => {
  const avoid = config?.rules?.avoid || [];
  const focus = config?.rules?.focus || [];
  const authentication = config?.authentication || null;

  return {
    avoid: avoid.map(sanitizeRule),
    focus: focus.map(sanitizeRule),
    authentication: authentication ? sanitizeAuthentication(authentication) : null,
  };
};

// 清理并标准化身份验证值
const sanitizeAuthentication = (auth: Authentication): Authentication => {
  return {
    login_type: auth.login_type.toLowerCase().trim() as Authentication['login_type'],
    login_url: auth.login_url.trim(),
    credentials: {
      username: auth.credentials.username.trim(),
      password: auth.credentials.password,
      ...(auth.credentials.totp_secret && { totp_secret: auth.credentials.totp_secret.trim() }),
    },
    login_flow: auth.login_flow.map((step) => step.trim()),
    success_condition: {
      type: auth.success_condition.type.toLowerCase().trim() as Authentication['success_condition']['type'],
      value: auth.success_condition.value.trim(),
    },
  };
};
