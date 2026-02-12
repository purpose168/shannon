// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { path, fs } from 'zx';
import chalk from 'chalk';
import { validateQueueAndDeliverable, type VulnType } from './queue-validation.js';
import type { AgentName, PromptName, PlaywrightAgent, AgentValidator } from './types/agents.js';

// 漏洞队列验证器的工厂函数
function createVulnValidator(vulnType: VulnType): AgentValidator {
  return async (sourceDir: string): Promise<boolean> => {
    try {
      await validateQueueAndDeliverable(vulnType, sourceDir);
      return true;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`   Queue validation failed for ${vulnType}: ${errMsg}`));
      return false;
    }
  };
}

// 利用交付物验证器的工厂函数
function createExploitValidator(vulnType: VulnType): AgentValidator {
  return async (sourceDir: string): Promise<boolean> => {
    const evidenceFile = path.join(sourceDir, 'deliverables', `${vulnType}_exploitation_evidence.md`);
    return await fs.pathExists(evidenceFile);
  };
}

// MCP 智能体映射 - 为每个智能体分配特定的 Playwright 实例以防止冲突
export const MCP_AGENT_MAPPING: Record<PromptName, PlaywrightAgent> = Object.freeze({
  // 阶段 1: 预侦察（实际提示名称为 'pre-recon-code'）
  // 注意: 预侦察是纯代码分析，不使用浏览器自动化，
  // 但为了一致性和未来扩展性，仍分配 MCP 服务器
  'pre-recon-code': 'playwright-agent1',

  // 阶段 2: 侦察（实际提示名称为 'recon'）
  recon: 'playwright-agent2',

  // 阶段 3: 漏洞分析（5 个并行智能体）
  'vuln-injection': 'playwright-agent1',
  'vuln-xss': 'playwright-agent2',
  'vuln-auth': 'playwright-agent3',
  'vuln-ssrf': 'playwright-agent4',
  'vuln-authz': 'playwright-agent5',

  // 阶段 4: 利用（5 个并行智能体 - 与漏洞对应智能体相同）
  'exploit-injection': 'playwright-agent1',
  'exploit-xss': 'playwright-agent2',
  'exploit-auth': 'playwright-agent3',
  'exploit-ssrf': 'playwright-agent4',
  'exploit-authz': 'playwright-agent5',

  // 阶段 5: 报告（实际提示名称为 'report-executive'）
  // 注意: 报告生成通常是基于文本的，不使用浏览器自动化，
  // 但为了潜在的截图包含或未来需求，仍分配 MCP 服务器
  'report-executive': 'playwright-agent3',
});

// 直接智能体到验证器映射 - 比模式匹配简单得多
export const AGENT_VALIDATORS: Record<AgentName, AgentValidator> = Object.freeze({
  // 预侦察智能体 - 验证智能体创建的代码分析交付物
  'pre-recon': async (sourceDir: string): Promise<boolean> => {
    const codeAnalysisFile = path.join(sourceDir, 'deliverables', 'code_analysis_deliverable.md');
    return await fs.pathExists(codeAnalysisFile);
  },

  // 侦察智能体
  recon: async (sourceDir: string): Promise<boolean> => {
    const reconFile = path.join(sourceDir, 'deliverables', 'recon_deliverable.md');
    return await fs.pathExists(reconFile);
  },

  // 漏洞分析智能体
  'injection-vuln': createVulnValidator('injection'),
  'xss-vuln': createVulnValidator('xss'),
  'auth-vuln': createVulnValidator('auth'),
  'ssrf-vuln': createVulnValidator('ssrf'),
  'authz-vuln': createVulnValidator('authz'),

  // 利用智能体
  'injection-exploit': createExploitValidator('injection'),
  'xss-exploit': createExploitValidator('xss'),
  'auth-exploit': createExploitValidator('auth'),
  'ssrf-exploit': createExploitValidator('ssrf'),
  'authz-exploit': createExploitValidator('authz'),

  // 执行报告智能体
  report: async (sourceDir: string): Promise<boolean> => {
    const reportFile = path.join(
      sourceDir,
      'deliverables',
      'comprehensive_security_assessment_report.md'
    );

    const reportExists = await fs.pathExists(reportFile);

    if (!reportExists) {
      console.log(
        chalk.red(`    ❌ Missing required deliverable: comprehensive_security_assessment_report.md`)
      );
    }

    return reportExists;
  },
});
