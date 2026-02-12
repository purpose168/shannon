// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';
import chalk from 'chalk';
import { PentestError } from '../error-handling.js';

interface DeliverableFile {
  name: string;
  path: string;
  required: boolean;
}

// 纯函数：从专业交付物组装最终报告
export async function assembleFinalReport(sourceDir: string): Promise<string> {
  const deliverableFiles: DeliverableFile[] = [
    { name: 'Injection', path: 'injection_exploitation_evidence.md', required: false },
    { name: 'XSS', path: 'xss_exploitation_evidence.md', required: false },
    { name: 'Authentication', path: 'auth_exploitation_evidence.md', required: false },
    { name: 'SSRF', path: 'ssrf_exploitation_evidence.md', required: false },
    { name: 'Authorization', path: 'authz_exploitation_evidence.md', required: false }
  ];

  const sections: string[] = [];

  for (const file of deliverableFiles) {
    const filePath = path.join(sourceDir, 'deliverables', file.path);
    try {
      if (await fs.pathExists(filePath)) {
        const content = await fs.readFile(filePath, 'utf8');
        sections.push(content);
        console.log(chalk.green(`✅ Added ${file.name} findings`));
      } else if (file.required) {
        throw new Error(`Required file ${file.path} not found`);
      } else {
        console.log(chalk.gray(`⏭️  No ${file.name} deliverable found`));
      }
    } catch (error) {
      if (file.required) {
        throw error;
      }
      const err = error as Error;
      console.log(chalk.yellow(`⚠️ Could not read ${file.path}: ${err.message}`));
    }
  }

  const finalContent = sections.join('\n\n');
  const deliverablesDir = path.join(sourceDir, 'deliverables');
  const finalReportPath = path.join(deliverablesDir, 'comprehensive_security_assessment_report.md');

  try {
    // 确保交付物目录存在
    await fs.ensureDir(deliverablesDir);
    await fs.writeFile(finalReportPath, finalContent);
    console.log(chalk.green(`✅ Final report assembled at ${finalReportPath}`));
  } catch (error) {
    const err = error as Error;
    throw new PentestError(
      `Failed to write final report: ${err.message}`,
      'filesystem',
      false,
      { finalReportPath, originalError: err.message }
    );
  }

  return finalContent;
}

/**
 * 将模型信息注入到最终安全报告中。
 * 读取 session.json 获取使用的模型，然后在报告的执行摘要部分注入 "Model:" 行。
 */
export async function injectModelIntoReport(
  repoPath: string,
  outputPath: string
): Promise<void> {
  // 1. 读取 session.json 获取模型信息
  const sessionJsonPath = path.join(outputPath, 'session.json');

  if (!(await fs.pathExists(sessionJsonPath))) {
    console.log(chalk.yellow('⚠️ session.json not found, skipping model injection'));
    return;
  }

  interface SessionData {
    metrics: {
      agents: Record<string, { model?: string }>;
    };
  }

  const sessionData: SessionData = await fs.readJson(sessionJsonPath);

  // 2. 从所有智能体中提取唯一模型
  const models = new Set<string>();
  for (const agent of Object.values(sessionData.metrics.agents)) {
    if (agent.model) {
      models.add(agent.model);
    }
  }

  if (models.size === 0) {
    console.log(chalk.yellow('⚠️ No model information found in session.json'));
    return;
  }

  const modelStr = Array.from(models).join(', ');
  console.log(chalk.blue(`📝 Injecting model info into report: ${modelStr}`));

  // 3. 读取最终报告
  const reportPath = path.join(repoPath, 'deliverables', 'comprehensive_security_assessment_report.md');

  if (!(await fs.pathExists(reportPath))) {
    console.log(chalk.yellow('⚠️ Final report not found, skipping model injection'));
    return;
  }

  let reportContent = await fs.readFile(reportPath, 'utf8');

  // 4. 在执行摘要的 "Assessment Date" 后查找并注入模型行
  // 模式: "- Assessment Date: <date>" 后跟换行
  const assessmentDatePattern = /^(- Assessment Date: .+)$/m;
  const match = reportContent.match(assessmentDatePattern);

  if (match) {
    // 在 Assessment Date 后注入模型行
    const modelLine = `- Model: ${modelStr}`;
    reportContent = reportContent.replace(
      assessmentDatePattern,
      `$1\n${modelLine}`
    );
    console.log(chalk.green('✅ Model info injected into Executive Summary'));
  } else {
    // 如果未找到 Assessment Date 行，尝试在执行摘要标题后添加
    const execSummaryPattern = /^## Executive Summary$/m;
    if (reportContent.match(execSummaryPattern)) {
      // 将模型作为执行摘要的第一项添加
      reportContent = reportContent.replace(
        execSummaryPattern,
        `## Executive Summary\n- Model: ${modelStr}`
      );
      console.log(chalk.green('✅ Model info added to Executive Summary header'));
    } else {
      console.log(chalk.yellow('⚠️ Could not find Executive Summary section'));
      return;
    }
  }

  // 5. 将修改后的报告写回
  await fs.writeFile(reportPath, reportContent);
}
