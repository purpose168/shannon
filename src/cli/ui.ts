// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import chalk from 'chalk';
import { displaySplashScreen } from '../splash-screen.js';

// 辅助函数：显示帮助信息
export function showHelp(): void {
  console.log(chalk.cyan.bold('AI 渗透测试智能体'));
  console.log(chalk.gray('自动化安全评估工具\n'));

  console.log(chalk.yellow.bold('使用方法:'));
  console.log('  shannon <WEB_URL> <REPO_PATH> [--config config.yaml] [--output /path/to/reports]\n');

  console.log(chalk.yellow.bold('选项:'));
  console.log(
    '  --config <file>      用于身份验证和测试参数的 YAML 配置文件'
  );
  console.log(
    '  --output <path>      会话文件夹的自定义输出目录（默认：./audit-logs/）'
  );
  console.log(
    '  --pipeline-testing   使用最小提示进行快速管道测试（创建最小可交付成果）'
  );
  console.log(
    '  --disable-loader     禁用动画进度加载器（当日志干扰旋转器时有用）'
  );
  console.log('  --help               显示此帮助消息\n');

  console.log(chalk.yellow.bold('示例:'));
  console.log('  shannon "https://example.com" "/path/to/local/repo"');
  console.log('  shannon "https://example.com" "/path/to/local/repo" --config auth.yaml');
  console.log('  shannon "https://example.com" "/path/to/local/repo" --output /path/to/reports');
  console.log('  shannon "https://example.com" "/path/to/local/repo" --pipeline-testing\n');

  console.log(chalk.yellow.bold('要求:'));
  console.log('  • WEB_URL 必须以 http:// 或 https:// 开头');
  console.log('  • REPO_PATH 必须是可访问的本地目录');
  console.log('  • 只能测试您拥有或有权测试的系统\n');

  console.log(chalk.yellow.bold('环境变量:'));
  console.log('  PENTEST_MAX_RETRIES    AI 智能体的重试次数（默认：3）');
}

// 导出启动屏幕函数以供主程序使用
export { displaySplashScreen };