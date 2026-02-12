// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

// 生产环境 Claude 智能体执行，包含重试、Git 检查点和审计日志

import { fs, path } from 'zx';
import chalk, { type ChalkInstance } from 'chalk';
import { query } from '@anthropic-ai/claude-agent-sdk';

import { isRetryableError, getRetryDelay, PentestError } from '../error-handling.js';
import { timingResults, Timer } from '../utils/metrics.js';
import { formatTimestamp } from '../utils/formatting.js';
import { createGitCheckpoint, commitGitSuccess, rollbackGitWorkspace, getGitCommitHash } from '../utils/git-manager.js';
import { AGENT_VALIDATORS, MCP_AGENT_MAPPING } from '../constants.js';
import { AuditSession } from '../audit/index.js';
import { createShannonHelperServer } from '../../mcp-server/dist/index.js';
import type { SessionMetadata } from '../audit/utils.js';
import { getPromptNameForAgent } from '../types/agents.js';
import type { AgentName } from '../types/index.js';

import { dispatchMessage } from './message-handlers.js';
import { detectExecutionContext, formatErrorOutput, formatCompletionMessage } from './output-formatters.js';
import { createProgressManager } from './progress-manager.js';
import { createAuditLogger } from './audit-logger.js';
import { getActualModelName } from './router-utils.js';

declare global {
  var SHANNON_DISABLE_LOADER: boolean | undefined;
}

export interface ClaudePromptResult {
  result?: string | null | undefined;
  success: boolean;
  duration: number;
  turns?: number | undefined;
  cost: number;
  model?: string | undefined;
  partialCost?: number | undefined;
  apiErrorDetected?: boolean | undefined;
  error?: string | undefined;
  errorType?: string | undefined;
  prompt?: string | undefined;
  retryable?: boolean | undefined;
}

interface StdioMcpServer {
  type: 'stdio';
  command: string;
  args: string[];
  env: Record<string, string>;
}

type McpServer = ReturnType<typeof createShannonHelperServer> | StdioMcpServer;

// 为智能体执行配置 MCP 服务器，包含 Docker 特定的 Chromium 处理
function buildMcpServers(
  sourceDir: string,
  agentName: string | null
): Record<string, McpServer> {
  const shannonHelperServer = createShannonHelperServer(sourceDir);

  const mcpServers: Record<string, McpServer> = {
    'shannon-helper': shannonHelperServer,
  };

  if (agentName) {
    const promptName = getPromptNameForAgent(agentName as AgentName);
    const playwrightMcpName = MCP_AGENT_MAPPING[promptName as keyof typeof MCP_AGENT_MAPPING] || null;

    if (playwrightMcpName) {
      console.log(chalk.gray(`    已分配 ${agentName} -> ${playwrightMcpName}`));

      const userDataDir = `/tmp/${playwrightMcpName}`;

      // Docker 使用系统 Chromium；本地开发使用 Playwright 的捆绑浏览器
      const isDocker = process.env.SHANNON_DOCKER === 'true';

      const mcpArgs: string[] = [
        '@playwright/mcp@latest',
        '--isolated',
        '--user-data-dir', userDataDir,
      ];

      // Docker: 使用系统 Chromium；本地: 使用 Playwright 的捆绑浏览器
      if (isDocker) {
        mcpArgs.push('--executable-path', '/usr/bin/chromium-browser');
        mcpArgs.push('--browser', 'chromium');
      }

      const envVars: Record<string, string> = Object.fromEntries(
        Object.entries({
          ...process.env,
          PLAYWRIGHT_HEADLESS: 'true',
          ...(isDocker && { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' }),
        }).filter((entry): entry is [string, string] => entry[1] !== undefined)
      );

      mcpServers[playwrightMcpName] = {
        type: 'stdio' as const,
        command: 'npx',
        args: mcpArgs,
        env: envVars,
      };
    }
  }

  return mcpServers;
}

function outputLines(lines: string[]): void {
  for (const line of lines) {
    console.log(line);
  }
}

async function writeErrorLog(
  err: Error & { code?: string; status?: number },
  sourceDir: string,
  fullPrompt: string,
  duration: number
): Promise<void> {
  try {
    const errorLog = {
      timestamp: formatTimestamp(),
      agent: 'claude-executor',
      error: {
        name: err.constructor.name,
        message: err.message,
        code: err.code,
        status: err.status,
        stack: err.stack
      },
      context: {
        sourceDir,
        prompt: fullPrompt.slice(0, 200) + '...',
        retryable: isRetryableError(err)
      },
      duration
    };
    const logPath = path.join(sourceDir, 'error.log');
    await fs.appendFile(logPath, JSON.stringify(errorLog) + '\n');
  } catch (logError) {
    const logErrMsg = logError instanceof Error ? logError.message : String(logError);
    console.log(chalk.gray(`    (无法写入错误日志: ${logErrMsg})`));
  }
}

export async function validateAgentOutput(
  result: ClaudePromptResult,
  agentName: string | null,
  sourceDir: string
): Promise<boolean> {
  console.log(chalk.blue(`    验证 ${agentName} 智能体输出`));

  try {
    // 检查智能体是否成功完成
    if (!result.success || !result.result) {
      console.log(chalk.red(`    验证失败: 智能体执行未成功`));
      return false;
    }

    // 获取此智能体的验证函数
    const validator = agentName ? AGENT_VALIDATORS[agentName as keyof typeof AGENT_VALIDATORS] : undefined;

    if (!validator) {
      console.log(chalk.yellow(`    未找到智能体 "${agentName}" 的验证器 - 假设成功`));
      console.log(chalk.green(`    验证通过: 未知智能体且结果成功`));
      return true;
    }

    console.log(chalk.blue(`    使用智能体验证器: ${agentName}`));
    console.log(chalk.blue(`    源目录: ${sourceDir}`));

    // 应用验证函数
    const validationResult = await validator(sourceDir);

    if (validationResult) {
      console.log(chalk.green(`    验证通过: 存在所需文件/结构`));
    } else {
      console.log(chalk.red(`    验证失败: 缺少所需的可交付文件`));
    }

    return validationResult;

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`    验证失败，错误: ${errMsg}`));
    return false;
  }
}

// 低级 SDK 执行。处理消息流、进度和审计日志。
// 导出供 Temporal 活动调用单次尝试执行。
export async function runClaudePrompt(
  prompt: string,
  sourceDir: string,
  context: string = '',
  description: string = 'Claude analysis',
  agentName: string | null = null,
  colorFn: ChalkInstance = chalk.cyan,
  sessionMetadata: SessionMetadata | null = null,
  auditSession: AuditSession | null = null,
  attemptNumber: number = 1
): Promise<ClaudePromptResult> {
  const timer = new Timer(`agent-${description.toLowerCase().replace(/\s+/g, '-')}`);
  const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;

  const execContext = detectExecutionContext(description);
  const progress = createProgressManager(
    { description, useCleanOutput: execContext.useCleanOutput },
    global.SHANNON_DISABLE_LOADER ?? false
  );
  const auditLogger = createAuditLogger(auditSession);

  console.log(chalk.blue(`  运行 Claude 代码: ${description}...`));

  const mcpServers = buildMcpServers(sourceDir, agentName);

  // 构建传递给 SDK 子进程的环境变量
  const sdkEnv: Record<string, string> = {};
  if (process.env.ANTHROPIC_API_KEY) {
    sdkEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    sdkEnv.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  }

  const options = {
    model: 'claude-sonnet-4-5-20250929',
    maxTurns: 10_000,
    cwd: sourceDir,
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
    mcpServers,
    env: sdkEnv,
  };

  if (!execContext.useCleanOutput) {
    console.log(chalk.gray(`    SDK 选项: maxTurns=${options.maxTurns}, cwd=${sourceDir}, permissions=BYPASS`));
  }

  let turnCount = 0;
  let result: string | null = null;
  let apiErrorDetected = false;
  let totalCost = 0;

  progress.start();

  try {
    const messageLoopResult = await processMessageStream(
      fullPrompt,
      options,
      { execContext, description, colorFn, progress, auditLogger },
      timer
    );

    turnCount = messageLoopResult.turnCount;
    result = messageLoopResult.result;
    apiErrorDetected = messageLoopResult.apiErrorDetected;
    totalCost = messageLoopResult.cost;
    const model = messageLoopResult.model;

    // === 支出上限保护 ===
    // 纵深防御: 检测通过 detectApiError() 漏掉的支出上限。
    // 当达到支出上限时，Claude 返回短消息，成本为 $0。
    // 合法的智能体工作绝不会在只有 1-2 轮的情况下成本为 $0。
    if (turnCount <= 2 && totalCost === 0) {
      const resultLower = (result || '').toLowerCase();
      const BILLING_KEYWORDS = ['spending', 'cap', 'limit', 'budget', 'resets'];
      const looksLikeBillingError = BILLING_KEYWORDS.some((kw) =>
        resultLower.includes(kw)
      );

      if (looksLikeBillingError) {
        throw new PentestError(
          `可能达到支出上限 (turns=${turnCount}, cost=$0): ${result?.slice(0, 100)}`,
          'billing',
          true // 可重试 - Temporal 将使用 5-30 分钟的退避
        );
      }
    }

    const duration = timer.stop();
    timingResults.agents[execContext.agentKey] = duration;

    if (apiErrorDetected) {
      console.log(chalk.yellow(`  在 ${description} 中检测到 API 错误 - 在失败前将验证可交付成果`));
    }

    progress.finish(formatCompletionMessage(execContext, description, turnCount, duration));

    return {
      result,
      success: true,
      duration,
      turns: turnCount,
      cost: totalCost,
      model,
      partialCost: totalCost,
      apiErrorDetected
    };

  } catch (error) {
    const duration = timer.stop();
    timingResults.agents[execContext.agentKey] = duration;

    const err = error as Error & { code?: string; status?: number };

    await auditLogger.logError(err, duration, turnCount);
    progress.stop();
    outputLines(formatErrorOutput(err, execContext, description, duration, sourceDir, isRetryableError(err)));
    await writeErrorLog(err, sourceDir, fullPrompt, duration);

    return {
      error: err.message,
      errorType: err.constructor.name,
      prompt: fullPrompt.slice(0, 100) + '...',
      success: false,
      duration,
      cost: totalCost,
      retryable: isRetryableError(err)
    };
  }
}


interface MessageLoopResult {
  turnCount: number;
  result: string | null;
  apiErrorDetected: boolean;
  cost: number;
  model?: string | undefined;
}

interface MessageLoopDeps {
  execContext: ReturnType<typeof detectExecutionContext>;
  description: string;
  colorFn: ChalkInstance;
  progress: ReturnType<typeof createProgressManager>;
  auditLogger: ReturnType<typeof createAuditLogger>;
}

async function processMessageStream(
  fullPrompt: string,
  options: NonNullable<Parameters<typeof query>[0]['options']>,
  deps: MessageLoopDeps,
  timer: Timer
): Promise<MessageLoopResult> {
  const { execContext, description, colorFn, progress, auditLogger } = deps;
  const HEARTBEAT_INTERVAL = 30000;

  let turnCount = 0;
  let result: string | null = null;
  let apiErrorDetected = false;
  let cost = 0;
  let model: string | undefined;
  let lastHeartbeat = Date.now();

  for await (const message of query({ prompt: fullPrompt, options })) {
    // 禁用加载器时的心跳日志
    const now = Date.now();
    if (global.SHANNON_DISABLE_LOADER && now - lastHeartbeat > HEARTBEAT_INTERVAL) {
      console.log(chalk.blue(`    [${Math.floor((now - timer.startTime) / 1000)}秒] ${description} 运行中... (第 ${turnCount} 轮)`));
      lastHeartbeat = now;
    }

    // 为助手消息增加轮数
    if (message.type === 'assistant') {
      turnCount++;
    }

    const dispatchResult = await dispatchMessage(
      message as { type: string; subtype?: string },
      turnCount,
      { execContext, description, colorFn, progress, auditLogger }
    );

    if (dispatchResult.type === 'throw') {
      throw dispatchResult.error;
    }

    if (dispatchResult.type === 'complete') {
      result = dispatchResult.result;
      cost = dispatchResult.cost;
      break;
    }

    if (dispatchResult.type === 'continue') {
      if (dispatchResult.apiErrorDetected) {
        apiErrorDetected = true;
      }
      // 从 SystemInitMessage 捕获模型，但如果适用则使用路由器模型覆盖
      if (dispatchResult.model) {
        model = getActualModelName(dispatchResult.model);
      }
    }
  }

  return { turnCount, result, apiErrorDetected, cost, model };
}

// 智能体执行的主入口点。处理重试、Git 检查点和验证。
export async function runClaudePromptWithRetry(
  prompt: string,
  sourceDir: string,
  _allowedTools: string = 'Read',
  context: string = '',
  description: string = 'Claude analysis',
  agentName: string | null = null,
  colorFn: ChalkInstance = chalk.cyan,
  sessionMetadata: SessionMetadata | null = null
): Promise<ClaudePromptResult> {
  const maxRetries = 3;
  let lastError: Error | undefined;
  let retryContext = context;

  console.log(chalk.cyan(`开始 ${description}，最多尝试 ${maxRetries} 次`));

  let auditSession: AuditSession | null = null;
  if (sessionMetadata && agentName) {
    auditSession = new AuditSession(sessionMetadata);
    await auditSession.initialize();
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await createGitCheckpoint(sourceDir, description, attempt);

    if (auditSession && agentName) {
      const fullPrompt = retryContext ? `${retryContext}\n\n${prompt}` : prompt;
      await auditSession.startAgent(agentName, fullPrompt, attempt);
    }

    try {
      const result = await runClaudePrompt(
        prompt, sourceDir, retryContext,
        description, agentName, colorFn, sessionMetadata, auditSession, attempt
      );

      if (result.success) {
        const validationPassed = await validateAgentOutput(result, agentName, sourceDir);

        if (validationPassed) {
          if (result.apiErrorDetected) {
            console.log(chalk.yellow(`验证: 尽管有 API 错误警告，但已准备好进行利用`));
          }

          if (auditSession && agentName) {
            const commitHash = await getGitCommitHash(sourceDir);
            const endResult: {
              attemptNumber: number;
              duration_ms: number;
              cost_usd: number;
              success: true;
              checkpoint?: string;
            } = {
              attemptNumber: attempt,
              duration_ms: result.duration,
              cost_usd: result.cost || 0,
              success: true,
            };
            if (commitHash) {
              endResult.checkpoint = commitHash;
            }
            await auditSession.endAgent(agentName, endResult);
          }

          await commitGitSuccess(sourceDir, description);
          console.log(chalk.green.bold(`${description} 在第 ${attempt}/${maxRetries} 次尝试时成功完成`));
          return result;
        // 验证失败是可重试的 - 智能体可能在重试时使用更干净的工作区成功
        } else {
          console.log(chalk.yellow(`${description} 完成但输出验证失败`));

          if (auditSession && agentName) {
            await auditSession.endAgent(agentName, {
              attemptNumber: attempt,
              duration_ms: result.duration,
              cost_usd: result.partialCost || result.cost || 0,
              success: false,
              error: '输出验证失败',
              isFinalAttempt: attempt === maxRetries
            });
          }

          if (result.apiErrorDetected) {
            console.log(chalk.yellow(`检测到 API 错误且验证失败 - 视为可重试`));
            lastError = new Error('API 错误: 因验证失败而终止');
          } else {
            lastError = new Error('输出验证失败');
          }

          if (attempt < maxRetries) {
            await rollbackGitWorkspace(sourceDir, '验证失败');
            continue;
          } else {
            throw new PentestError(
              `智能体 ${description} 在 ${maxRetries} 次尝试后失败了输出验证。未创建所需的可交付文件。`,
              'validation',
              false,
              { description, sourceDir, attemptsExhausted: maxRetries }
            );
          }
        }
      }

    } catch (error) {
      const err = error as Error & { duration?: number; cost?: number; partialResults?: unknown };
      lastError = err;

      if (auditSession && agentName) {
        await auditSession.endAgent(agentName, {
          attemptNumber: attempt,
          duration_ms: err.duration || 0,
          cost_usd: err.cost || 0,
          success: false,
          error: err.message,
          isFinalAttempt: attempt === maxRetries
        });
      }

      if (!isRetryableError(err)) {
        console.log(chalk.red(`${description} 因不可重试错误而失败: ${err.message}`));
        await rollbackGitWorkspace(sourceDir, '不可重试错误清理');
        throw err;
      }

      if (attempt < maxRetries) {
        await rollbackGitWorkspace(sourceDir, '可重试错误清理');

        const delay = getRetryDelay(err, attempt);
        const delaySeconds = (delay / 1000).toFixed(1);
        console.log(chalk.yellow(`${description} 失败 (尝试 ${attempt}/${maxRetries})`));
        console.log(chalk.gray(`    错误: ${err.message}`));
        console.log(chalk.gray(`    工作区已回滚，${delaySeconds}秒后重试...`));

        if (err.partialResults) {
          retryContext = `${context}\n\n之前的部分结果: ${JSON.stringify(err.partialResults)}`;
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        await rollbackGitWorkspace(sourceDir, '最终失败清理');
        console.log(chalk.red(`${description} 在 ${maxRetries} 次尝试后失败`));
        console.log(chalk.red(`    最终错误: ${err.message}`));
      }
    }
  }

  throw lastError;
}