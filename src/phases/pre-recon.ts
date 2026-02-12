// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { $, fs, path } from 'zx';
import chalk from 'chalk';
import { Timer } from '../utils/metrics.js';
import { formatDuration } from '../utils/formatting.js';
import { handleToolError, PentestError } from '../error-handling.js';
import { AGENTS } from '../session-manager.js';
import { runClaudePromptWithRetry } from '../ai/claude-executor.js';
import { loadPrompt } from '../prompts/prompt-manager.js';
import type { ToolAvailability } from '../tool-checker.js';
import type { DistributedConfig } from '../types/config.js';

interface AgentResult {
  success: boolean;
  duration: number;
  cost?: number | undefined;
  error?: string | undefined;
  retryable?: boolean | undefined;
}

type ToolName = 'nmap' | 'subfinder' | 'whatweb' | 'schemathesis';
type ToolStatus = 'success' | 'skipped' | 'error';

interface TerminalScanResult {
  tool: ToolName;
  output: string;
  status: ToolStatus;
  duration: number;
  success?: boolean;
  error?: Error;
}

interface PromptVariables {
  webUrl: string;
  repoPath: string;
}

// Wave1 工具结果的判别联合类型 - 比松散联合类型更清晰
type Wave1ToolResult =
  | { kind: 'scan'; result: TerminalScanResult }
  | { kind: 'skipped'; message: string }
  | { kind: 'agent'; result: AgentResult };

interface Wave1Results {
  nmap: Wave1ToolResult;
  subfinder: Wave1ToolResult;
  whatweb: Wave1ToolResult;
  naabu?: Wave1ToolResult;
  codeAnalysis: AgentResult;
}

interface Wave2Results {
  schemathesis: TerminalScanResult;
}

interface PreReconResult {
  duration: number;
  report: string;
}

// 运行外部安全工具（nmap, whatweb 等）。Schemathesis 需要代码分析生成的 schema
async function runTerminalScan(tool: ToolName, target: string, sourceDir: string | null = null): Promise<TerminalScanResult> {
  const timer = new Timer(`command-${tool}`);
  try {
    let result;
    switch (tool) {
      case 'nmap': {
        console.log(chalk.blue(`    🔍 运行 ${tool} 扫描...`));
        const nmapHostname = new URL(target).hostname;
        result = await $({ silent: true, stdio: ['ignore', 'pipe', 'ignore'] })`nmap -sV -sC ${nmapHostname}`;
        const duration = timer.stop();
        console.log(chalk.green(`    ✅ ${tool} 已完成，用时 ${formatDuration(duration)}`));
        return { tool: 'nmap', output: result.stdout, status: 'success', duration };
      }
      case 'subfinder': {
        console.log(chalk.blue(`    🔍 运行 ${tool} 扫描...`));
        const hostname = new URL(target).hostname;
        result = await $({ silent: true, stdio: ['ignore', 'pipe', 'ignore'] })`subfinder -d ${hostname}`;
        const subfinderDuration = timer.stop();
        console.log(chalk.green(`    ✅ ${tool} 已完成，用时 ${formatDuration(subfinderDuration)}`));
        return { tool: 'subfinder', output: result.stdout, status: 'success', duration: subfinderDuration };
      }
      case 'whatweb': {
        console.log(chalk.blue(`    🔍 运行 ${tool} 扫描...`));
        const command = `whatweb --open-timeout 30 --read-timeout 60 ${target}`;
        console.log(chalk.gray(`    命令: ${command}`));
        result = await $({ silent: true, stdio: ['ignore', 'pipe', 'ignore'] })`whatweb --open-timeout 30 --read-timeout 60 ${target}`;
        const whatwebDuration = timer.stop();
        console.log(chalk.green(`    ✅ ${tool} 已完成，用时 ${formatDuration(whatwebDuration)}`));
        return { tool: 'whatweb', output: result.stdout, status: 'success', duration: whatwebDuration };
      }
      case 'schemathesis': {
        // Schemathesis 依赖于代码分析输出 - 如果没有找到 schema 则跳过
        const schemasDir = path.join(sourceDir || '.', 'outputs', 'schemas');
        if (await fs.pathExists(schemasDir)) {
          const schemaFiles = await fs.readdir(schemasDir) as string[];
          const apiSchemas = schemaFiles.filter((f: string) => f.endsWith('.json') || f.endsWith('.yml') || f.endsWith('.yaml'));
          if (apiSchemas.length > 0) {
            console.log(chalk.blue(`    🔍 运行 ${tool} 扫描...`));
            const allResults: string[] = [];

            // 对每个 schema 文件运行 schemathesis
            for (const schemaFile of apiSchemas) {
              const schemaPath = path.join(schemasDir, schemaFile);
              try {
                result = await $({ silent: true, stdio: ['ignore', 'pipe', 'ignore'] })`schemathesis run ${schemaPath} -u ${target} --max-failures=5`;
                allResults.push(`Schema: ${schemaFile}\n${result.stdout}`);
              } catch (schemaError) {
                const err = schemaError as { stdout?: string; message?: string };
                allResults.push(`Schema: ${schemaFile}\nError: ${err.stdout || err.message}`);
              }
            }

            const schemaDuration = timer.stop();
            console.log(chalk.green(`    ✅ ${tool} 已完成，用时 ${formatDuration(schemaDuration)}`));
            return { tool: 'schemathesis', output: allResults.join('\n\n'), status: 'success', duration: schemaDuration };
          } else {
            console.log(chalk.gray(`    ⏭️ ${tool} - 未找到 API schema`));
            return { tool: 'schemathesis', output: 'No API schemas found', status: 'skipped', duration: timer.stop() };
          }
        } else {
          console.log(chalk.gray(`    ⏭️ ${tool} - schema 目录未找到`));
          return { tool: 'schemathesis', output: 'Schemas directory not found', status: 'skipped', duration: timer.stop() };
        }
      }
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  } catch (error) {
    const duration = timer.stop();
    console.log(chalk.red(`    ❌ ${tool} 失败，用时 ${formatDuration(duration)}`));
    return handleToolError(tool, error as Error & { code?: string }) as TerminalScanResult;
  }
}

// Wave 1: 初始足迹分析 + 认证
async function runPreReconWave1(
  webUrl: string,
  sourceDir: string,
  variables: PromptVariables,
  config: DistributedConfig | null,
  pipelineTestingMode: boolean = false,
  sessionId: string | null = null,
  outputPath: string | null = null
): Promise<Wave1Results> {
  console.log(chalk.blue('    → 并行启动 Wave 1 操作...'));

  const operations: Promise<TerminalScanResult | AgentResult>[] = [];

  const skippedResult = (message: string): Wave1ToolResult => ({ kind: 'skipped', message });

  // 在管道测试模式下跳过外部命令
  if (pipelineTestingMode) {
    console.log(chalk.gray('    ⏭️ 跳过外部工具（管道测试模式）'));
    operations.push(
      runClaudePromptWithRetry(
        await loadPrompt('pre-recon-code', variables, null, pipelineTestingMode),
        sourceDir,
        '*',
        '',
        AGENTS['pre-recon'].displayName,
        'pre-recon',  // 用于创建快照的智能体名称
        chalk.cyan,
        { id: sessionId!, webUrl, repoPath: sourceDir, ...(outputPath && { outputPath }) }  // 用于审计日志的会话元数据（标准：使用 'id' 字段）
      )
    );
    const [codeAnalysis] = await Promise.all(operations);
    return {
      nmap: skippedResult('Skipped (pipeline testing mode)'),
      subfinder: skippedResult('Skipped (pipeline testing mode)'),
      whatweb: skippedResult('Skipped (pipeline testing mode)'),
      codeAnalysis: codeAnalysis as AgentResult
    };
  } else {
    operations.push(
      runTerminalScan('nmap', webUrl),
      runTerminalScan('subfinder', webUrl),
      runTerminalScan('whatweb', webUrl),
      runClaudePromptWithRetry(
        await loadPrompt('pre-recon-code', variables, null, pipelineTestingMode),
        sourceDir,
        '*',
        '',
        AGENTS['pre-recon'].displayName,
        'pre-recon',  // 用于创建快照的智能体名称
        chalk.cyan,
        { id: sessionId!, webUrl, repoPath: sourceDir, ...(outputPath && { outputPath }) }  // 用于审计日志的会话元数据（标准：使用 'id' 字段）
      )
    );
  }

  // 检查是否提供了认证配置以注入登录说明
  console.log(chalk.gray(`    → 配置检查: ${config ? 'present' : 'missing'}, Auth: ${config?.authentication ? 'present' : 'missing'}`));

  const [nmap, subfinder, whatweb, codeAnalysis] = await Promise.all(operations);

  return {
    nmap: { kind: 'scan', result: nmap as TerminalScanResult },
    subfinder: { kind: 'scan', result: subfinder as TerminalScanResult },
    whatweb: { kind: 'scan', result: whatweb as TerminalScanResult },
    codeAnalysis: codeAnalysis as AgentResult
  };
}

// Wave 2: 额外扫描
async function runPreReconWave2(
  webUrl: string,
  sourceDir: string,
  toolAvailability: ToolAvailability,
  pipelineTestingMode: boolean = false
): Promise<Wave2Results> {
  console.log(chalk.blue('    → 并行运行 Wave 2 额外扫描...'));

  // 在管道测试模式下跳过外部命令
  if (pipelineTestingMode) {
    console.log(chalk.gray('    ⏭️ 跳过外部工具（管道测试模式）'));
    return {
      schemathesis: { tool: 'schemathesis', output: 'Skipped (pipeline testing mode)', status: 'skipped', duration: 0 }
    };
  }

  const operations: Promise<TerminalScanResult>[] = [];

  // 并行额外扫描（仅在工具可用时运行）

  if (toolAvailability.schemathesis) {
    operations.push(runTerminalScan('schemathesis', webUrl, sourceDir));
  }

  // 如果没有工具可用，提前返回
  if (operations.length === 0) {
    console.log(chalk.gray('    ⏭️ 没有可用的 Wave 2 工具'));
    return {
      schemathesis: { tool: 'schemathesis', output: 'Tool not available', status: 'skipped', duration: 0 }
    };
  }

  // 并行运行所有操作
  const results = await Promise.all(operations);

  // 将结果映射回命名属性
  const response: Wave2Results = {
    schemathesis: { tool: 'schemathesis', output: 'Tool not available', status: 'skipped', duration: 0 }
  };
  let resultIndex = 0;

  if (toolAvailability.schemathesis) {
    response.schemathesis = results[resultIndex++]!;
  } else {
    console.log(chalk.gray('    ⏭️ schemathesis - 工具不可用'));
  }

  return response;
}

// 从 Wave1 工具结果中提取状态和输出
function extractResult(r: Wave1ToolResult | undefined): { status: string; output: string } {
  if (!r) return { status: 'Skipped', output: 'No output' };
  switch (r.kind) {
    case 'scan':
      return { status: r.result.status || 'Skipped', output: r.result.output || 'No output' };
    case 'skipped':
      return { status: 'Skipped', output: r.message };
    case 'agent':
      return { status: r.result.success ? 'success' : 'error', output: 'See agent output' };
  }
}

// 将工具输出合并为单个交付物。如果文件缺失则回退到引用。
async function stitchPreReconOutputs(wave1: Wave1Results, additionalScans: TerminalScanResult[], sourceDir: string): Promise<string> {
  // 尝试读取代码分析交付物文件
  let codeAnalysisContent = 'No analysis available';
  try {
    const codeAnalysisPath = path.join(sourceDir, 'deliverables', 'code_analysis_deliverable.md');
    codeAnalysisContent = await fs.readFile(codeAnalysisPath, 'utf8');
  } catch (error) {
    const err = error as Error;
    console.log(chalk.yellow(`⚠️ 无法读取代码分析交付物: ${err.message}`));
    codeAnalysisContent = 'Analysis located in deliverables/code_analysis_deliverable.md';
  }

  // 构建额外扫描部分
  let additionalSection = '';
  if (additionalScans.length > 0) {
    additionalSection = '\n## Authenticated Scans\n';
    for (const scan of additionalScans) {
      additionalSection += `
### ${scan.tool.toUpperCase()}
Status: ${scan.status}
${scan.output}
`;
    }
  }

  const nmap = extractResult(wave1.nmap);
  const subfinder = extractResult(wave1.subfinder);
  const whatweb = extractResult(wave1.whatweb);
  const naabu = extractResult(wave1.naabu);

  const report = `
# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: ${naabu.status}
${naabu.output}

## Network Scanning (nmap)
Status: ${nmap.status}
${nmap.output}

## Subdomain Discovery (subfinder)
Status: ${subfinder.status}
${subfinder.output}

## Technology Detection (whatweb)
Status: ${whatweb.status}
${whatweb.output}
## Code Analysis
${codeAnalysisContent}
${additionalSection}
---
Report generated at: ${new Date().toISOString()}
  `.trim();

  // 确保克隆的仓库中存在交付物目录
  try {
    const deliverablePath = path.join(sourceDir, 'deliverables', 'pre_recon_deliverable.md');
    await fs.ensureDir(path.join(sourceDir, 'deliverables'));

    // 写入克隆仓库中的文件
    await fs.writeFile(deliverablePath, report);
  } catch (error) {
    const err = error as Error;
    throw new PentestError(
      `Failed to write pre-recon report: ${err.message}`,
      'filesystem',
      false,
      { sourceDir, originalError: err.message }
    );
  }

  return report;
}

// 主要的预侦察阶段执行函数
export async function executePreReconPhase(
  webUrl: string,
  sourceDir: string,
  variables: PromptVariables,
  config: DistributedConfig | null,
  toolAvailability: ToolAvailability,
  pipelineTestingMode: boolean,
  sessionId: string | null = null,
  outputPath: string | null = null
): Promise<PreReconResult> {
  console.log(chalk.yellow.bold('\n🔍 PHASE 1: PRE-RECONNAISSANCE'));
  const timer = new Timer('phase-1-pre-recon');

  console.log(chalk.yellow('Wave 1: Initial footprinting...'));
  const wave1Results = await runPreReconWave1(webUrl, sourceDir, variables, config, pipelineTestingMode, sessionId, outputPath);
  console.log(chalk.green('  ✅ Wave 1 操作已完成'));

  console.log(chalk.yellow('Wave 2: Additional scanning...'));
  const wave2Results = await runPreReconWave2(webUrl, sourceDir, toolAvailability, pipelineTestingMode);
  console.log(chalk.green('  ✅ Wave 2 操作已完成'));

  console.log(chalk.blue('📝 合并预侦察输出...'));
  const additionalScans = wave2Results.schemathesis ? [wave2Results.schemathesis] : [];
  const preReconReport = await stitchPreReconOutputs(wave1Results, additionalScans, sourceDir);
  const duration = timer.stop();

  console.log(chalk.green(`✅ 预侦察阶段已完成，用时 ${formatDuration(duration)}`));
  console.log(chalk.green(`💾 已保存至 ${sourceDir}/deliverables/pre_recon_deliverable.md`));

  return { duration, report: preReconReport };
}
