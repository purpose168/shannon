// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';
import chalk from 'chalk';
import { PentestError, handlePromptError } from '../error-handling.js';
import { MCP_AGENT_MAPPING } from '../constants.js';
import type { Authentication, DistributedConfig } from '../types/config.js';

interface PromptVariables {
  webUrl: string;
  repoPath: string;
  MCP_SERVER?: string;
}

interface IncludeReplacement {
  placeholder: string;
  content: string;
}

// 纯函数：从配置构建完整的登录说明
async function buildLoginInstructions(authentication: Authentication): Promise<string> {
  try {
    // 加载登录说明模板
    const loginInstructionsPath = path.join(import.meta.dirname, '..', '..', 'prompts', 'shared', 'login-instructions.txt');

    if (!await fs.pathExists(loginInstructionsPath)) {
      throw new PentestError(
        'Login instructions template not found',
        'filesystem',
        false,
        { loginInstructionsPath }
      );
    }

    const fullTemplate = await fs.readFile(loginInstructionsPath, 'utf8');

    // 基于标记提取部分的辅助函数
    const getSection = (content: string, sectionName: string): string => {
      const regex = new RegExp(`<!-- BEGIN:${sectionName} -->([\\s\\S]*?)<!-- END:${sectionName} -->`, 'g');
      const match = regex.exec(content);
      return match ? match[1]!.trim() : '';
    };

    // 基于登录类型提取部分
    const loginType = authentication.login_type?.toUpperCase();
    let loginInstructions = '';

    // 使用只有相关部分的构建说明
    const commonSection = getSection(fullTemplate, 'COMMON');
    const authSection = loginType ? getSection(fullTemplate, loginType) : ''; // FORM 或 SSO
    const verificationSection = getSection(fullTemplate, 'VERIFICATION');

    // 如果标记缺失，回退到完整模板（向后兼容）
    if (!commonSection && !authSection && !verificationSection) {
      console.log(chalk.yellow('⚠️ Section markers not found, using full login instructions template'));
      loginInstructions = fullTemplate;
    } else {
      // 组合相关部分
      loginInstructions = [commonSection, authSection, verificationSection]
        .filter(section => section) // 移除空部分
        .join('\n\n');
    }

    // 用配置中的登录流程替换用户说明占位符
    let userInstructions = (authentication.login_flow ?? []).join('\n');

    // 在用户说明中替换凭证占位符
    if (authentication.credentials) {
      if (authentication.credentials.username) {
        userInstructions = userInstructions.replace(/\$username/g, authentication.credentials.username);
      }
      if (authentication.credentials.password) {
        userInstructions = userInstructions.replace(/\$password/g, authentication.credentials.password);
      }
      if (authentication.credentials.totp_secret) {
        userInstructions = userInstructions.replace(/\$totp/g, `generated TOTP code using secret "${authentication.credentials.totp_secret}"`);
      }
    }

    loginInstructions = loginInstructions.replace(/\{\{user_instructions\}\}/g, userInstructions);

    // 如果模板中存在 TOTP 密钥占位符，则替换
    if (authentication.credentials?.totp_secret) {
      loginInstructions = loginInstructions.replace(/\{\{totp_secret\}\}/g, authentication.credentials.totp_secret);
    }

    return loginInstructions;
  } catch (error) {
    if (error instanceof PentestError) {
      throw error;
    }
    const errMsg = error instanceof Error ? error.message : String(error);
    throw new PentestError(
      `Failed to build login instructions: ${errMsg}`,
      'config',
      false,
      { authentication, originalError: errMsg }
    );
  }
}

// 纯函数：处理 @include() 指令
async function processIncludes(content: string, baseDir: string): Promise<string> {
  const includeRegex = /@include\(([^)]+)\)/g;
  // 使用 Promise.all 并发处理所有包含
  const replacements: IncludeReplacement[] = await Promise.all(
    Array.from(content.matchAll(includeRegex)).map(async (match) => {
      const includePath = path.join(baseDir, match[1]!);
      const sharedContent = await fs.readFile(includePath, 'utf8');
      return {
        placeholder: match[0],
        content: sharedContent,
      };
    })
  );

  for (const replacement of replacements) {
    content = content.replace(replacement.placeholder, replacement.content);
  }
  return content;
}

// 纯函数：变量插值
async function interpolateVariables(
  template: string,
  variables: PromptVariables,
  config: DistributedConfig | null = null
): Promise<string> {
  try {
    if (!template || typeof template !== 'string') {
      throw new PentestError(
        'Template must be a non-empty string',
        'validation',
        false,
        { templateType: typeof template, templateLength: template?.length }
      );
    }

    if (!variables || !variables.webUrl || !variables.repoPath) {
      throw new PentestError(
        'Variables must include webUrl and repoPath',
        'validation',
        false,
        { variables: Object.keys(variables || {}) }
      );
    }

    let result = template
      .replace(/\{\{WEB_URL\}\}/g, variables.webUrl)
      .replace(/\{\{REPO_PATH\}\}/g, variables.repoPath)
      .replace(/\{\{MCP_SERVER\}\}/g, variables.MCP_SERVER || 'playwright-agent1');

    if (config) {
      // 处理规则部分 - 如果两者都为空，使用更简洁的消息
      const hasAvoidRules = config.avoid && config.avoid.length > 0;
      const hasFocusRules = config.focus && config.focus.length > 0;

      if (!hasAvoidRules && !hasFocusRules) {
        // 用简洁消息替换整个规则部分
        const cleanRulesSection = '<rules>\nNo specific rules or focus areas provided for this test.\n</rules>';
        result = result.replace(/<rules>[\s\S]*?<\/rules>/g, cleanRulesSection);
      } else {
        const avoidRules = hasAvoidRules ? config.avoid!.map(r => `- ${r.description}`).join('\n') : 'None';
        const focusRules = hasFocusRules ? config.focus!.map(r => `- ${r.description}`).join('\n') : 'None';

        result = result
          .replace(/\{\{RULES_AVOID\}\}/g, avoidRules)
          .replace(/\{\{RULES_FOCUS\}\}/g, focusRules);
      }

      // 从配置中提取并注入登录说明
      if (config.authentication?.login_flow) {
        const loginInstructions = await buildLoginInstructions(config.authentication);
        result = result.replace(/\{\{LOGIN_INSTRUCTIONS\}\}/g, loginInstructions);
      } else {
        result = result.replace(/\{\{LOGIN_INSTRUCTIONS\}\}/g, '');
      }
    } else {
      // 当没有提供配置时，用简洁消息替换整个规则部分
      const cleanRulesSection = '<rules>\nNo specific rules or focus areas provided for this test.\n</rules>';
      result = result.replace(/<rules>[\s\S]*?<\/rules>/g, cleanRulesSection);
      result = result.replace(/\{\{LOGIN_INSTRUCTIONS\}\}/g, '');
    }

    // 验证所有占位符都已被替换（不包括指导文本）
    const remainingPlaceholders = result.match(/\{\{[^}]+\}\}/g);
    if (remainingPlaceholders) {
      console.log(chalk.yellow(`⚠️ Warning: Found unresolved placeholders in prompt: ${remainingPlaceholders.join(', ')}`));
    }

    return result;
  } catch (error) {
    if (error instanceof PentestError) {
      throw error;
    }
    const errMsg = error instanceof Error ? error.message : String(error);
    throw new PentestError(
      `Variable interpolation failed: ${errMsg}`,
      'prompt',
      false,
      { originalError: errMsg }
    );
  }
}

// 纯函数：加载并插值提示模板
export async function loadPrompt(
  promptName: string,
  variables: PromptVariables,
  config: DistributedConfig | null = null,
  pipelineTestingMode: boolean = false
): Promise<string> {
  try {
    // 如果启用了管道测试模式，使用管道测试提示
    const baseDir = pipelineTestingMode ? 'prompts/pipeline-testing' : 'prompts';
    const promptsDir = path.join(import.meta.dirname, '..', '..', baseDir);
    const promptPath = path.join(promptsDir, `${promptName}.txt`);

    // 管道测试模式的调试消息
    if (pipelineTestingMode) {
      console.log(chalk.yellow(`⚡ Using pipeline testing prompt: ${promptPath}`));
    }

    // 首先检查文件是否存在
    if (!await fs.pathExists(promptPath)) {
      throw new PentestError(
        `Prompt file not found: ${promptPath}`,
        'prompt',
        false,
        { promptName, promptPath }
      );
    }

    // 向变量添加 MCP 服务器分配
    const enhancedVariables: PromptVariables = { ...variables };

    // 基于提示名称（智能体名称）分配 MCP 服务器
    const mcpServer = MCP_AGENT_MAPPING[promptName as keyof typeof MCP_AGENT_MAPPING];
    if (mcpServer) {
      enhancedVariables.MCP_SERVER = mcpServer;
      console.log(chalk.gray(`    🎭 Assigned ${promptName} → ${enhancedVariables.MCP_SERVER}`));
    } else {
      // 未知智能体的回退
      enhancedVariables.MCP_SERVER = 'playwright-agent1';
      console.log(chalk.yellow(`    🎭 Unknown agent ${promptName}, using fallback → ${enhancedVariables.MCP_SERVER}`));
    }

    let template = await fs.readFile(promptPath, 'utf8');

    // 预处理模板以处理 @include 指令
    template = await processIncludes(template, promptsDir);

    return await interpolateVariables(template, enhancedVariables, config);
  } catch (error) {
    if (error instanceof PentestError) {
      throw error;
    }
    const promptError = handlePromptError(promptName, error as Error);
    throw promptError.error;
  }
}
