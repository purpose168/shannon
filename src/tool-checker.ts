// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { $ } from 'zx';
import chalk from 'chalk';

type ToolName = 'nmap' | 'subfinder' | 'whatweb' | 'schemathesis';

export type ToolAvailability = Record<ToolName, boolean>;

// 检查所需工具的可用性
export const checkToolAvailability = async (): Promise<ToolAvailability> => {
  const tools: ToolName[] = ['nmap', 'subfinder', 'whatweb', 'schemathesis'];
  const availability: ToolAvailability = {
    nmap: false,
    subfinder: false,
    whatweb: false,
    schemathesis: false
  };

  console.log(chalk.blue('🔧 Checking tool availability...'));

  for (const tool of tools) {
    try {
      await $`command -v ${tool}`;
      availability[tool] = true;
      console.log(chalk.green(`  ✅ ${tool} - available`));
    } catch {
      availability[tool] = false;
      console.log(chalk.yellow(`  ⚠️ ${tool} - not found`));
    }
  }

  return availability;
};

// 处理缺少的工具，提供用户友好的消息
export const handleMissingTools = (toolAvailability: ToolAvailability): ToolName[] => {
  const missing = (Object.entries(toolAvailability) as Array<[ToolName, boolean]>)
    .filter(([, available]) => !available)
    .map(([tool]) => tool);

  if (missing.length > 0) {
    console.log(chalk.yellow(`\n⚠️ Missing tools: ${missing.join(', ')}`));
    console.log(chalk.gray('Some functionality will be limited. Install missing tools for full capability.'));

    // 提供安装提示
    const installHints: Record<ToolName, string> = {
      'nmap': 'brew install nmap (macOS) or apt install nmap (Ubuntu)',
      'subfinder': 'go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest',
      'whatweb': 'gem install whatweb',
      'schemathesis': 'pip install schemathesis'
    };

    console.log(chalk.gray('\nInstallation hints:'));
    missing.forEach(tool => {
      console.log(chalk.gray(`  ${tool}: ${installHints[tool]}`));
    });
    console.log('');
  }

  return missing;
};
