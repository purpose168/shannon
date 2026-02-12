// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import chalk from 'chalk';
import { formatDuration } from './formatting.js';

// 计时工具

export class Timer {
  name: string;
  startTime: number;
  endTime: number | null = null;

  constructor(name: string) {
    this.name = name;
    this.startTime = Date.now();
  }

  stop(): number {
    this.endTime = Date.now();
    return this.duration();
  }

  duration(): number {
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }
}

interface TimingResultsAgents {
  [key: string]: number;
}

interface TimingResults {
  total: Timer | null;
  agents: TimingResultsAgents;
}

interface CostResultsAgents {
  [key: string]: number;
}

interface CostResults {
  agents: CostResultsAgents;
  total: number;
}

// 全局计时和成本跟踪器
export const timingResults: TimingResults = {
  total: null,
  agents: {},
};

export const costResults: CostResults = {
  agents: {},
  total: 0,
};

// 显示综合计时摘要的函数
export const displayTimingSummary = (): void => {
  if (!timingResults.total) {
    console.log(chalk.yellow('没有可用的计时数据'));
    return;
  }

  const totalDuration = timingResults.total.stop();

  console.log(chalk.cyan.bold('\n⏱️  计时摘要'));
  console.log(chalk.gray('─'.repeat(60)));

  // 总执行时间
  console.log(chalk.cyan(`📊 总执行时间: ${formatDuration(totalDuration)}`));
  console.log();

  // 智能体细分
  if (Object.keys(timingResults.agents).length > 0) {
    console.log(chalk.magenta.bold('🤖 智能体细分:'));
    let agentTotal = 0;
    for (const [agent, duration] of Object.entries(timingResults.agents)) {
      const percentage = ((duration / totalDuration) * 100).toFixed(1);
      const displayName = agent.replace(/-/g, ' ');
      console.log(
        chalk.magenta(
          `  ${displayName.padEnd(20)} ${formatDuration(duration).padStart(8)} (${percentage}%)`
        )
      );
      agentTotal += duration;
    }
    console.log(
      chalk.gray(
        `  ${'智能体总计'.padEnd(20)} ${formatDuration(agentTotal).padStart(8)} (${((agentTotal / totalDuration) * 100).toFixed(1)}%)`
      )
    );
  }

  // 成本细分
  if (Object.keys(costResults.agents).length > 0) {
    console.log(chalk.green.bold('\n💰 成本细分:'));
    for (const [agent, cost] of Object.entries(costResults.agents)) {
      const displayName = agent.replace(/-/g, ' ');
      console.log(chalk.green(`  ${displayName.padEnd(20)} $${cost.toFixed(4).padStart(8)}`));
    }
    console.log(chalk.gray(`  ${'总成本'.padEnd(20)} $${costResults.total.toFixed(4).padStart(8)}`));
  }

  console.log(chalk.gray('─'.repeat(60)));
};

