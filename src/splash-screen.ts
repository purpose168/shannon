// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import figlet from 'figlet';
import gradient from 'gradient-string';
import boxen from 'boxen';
import chalk from 'chalk';
import { fs, path } from 'zx';

export const displaySplashScreen = async (): Promise<void> => {
  try {
    // 从 package.json 获取版本信息
    const packagePath = path.join(import.meta.dirname, '..', 'package.json');
    const packageJson = (await fs.readJSON(packagePath)) as { version?: string };
    const version = packageJson.version || '1.0.0';

    // 创建主要的 SHANNON ASCII 艺术
    const shannonText = figlet.textSync('SHANNON', {
      font: 'ANSI Shadow',
      horizontalLayout: 'default',
      verticalLayout: 'default',
    });

    // 为 SHANNON 应用金色渐变
    const gradientShannon = gradient(['#F4C542', '#FFD700'])(shannonText);

    // 创建带有样式的简约标语
    const tagline = chalk.bold.white('AI Penetration Testing Framework');
    const versionInfo = chalk.gray(`v${version}`);

    // 构建完整的启动屏幕内容
    const content = [
      gradientShannon,
      '',
      chalk.bold.cyan('                 ╔════════════════════════════════════╗'),
      chalk.bold.cyan('                 ║') + '  ' + tagline + '  ' + chalk.bold.cyan('║'),
      chalk.bold.cyan('                 ╚════════════════════════════════════╝'),
      '',
      `                            ${versionInfo}`,
      '',
      chalk.bold.yellow('                      🔐 DEFENSIVE SECURITY ONLY 🔐'),
      '',
    ].join('\n');

    // 创建带有简约样式的框式输出
    const boxedContent = boxen(content, {
      padding: 1,
      margin: 1,
      borderStyle: 'double',
      borderColor: 'cyan',
      dimBorder: false,
    });

    // 清屏并显示启动屏幕
    console.clear();
    console.log(boxedContent);

    // 添加加载动画
    const loadingFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;

    return new Promise((resolve) => {
      const loadingInterval = setInterval(() => {
        process.stdout.write(
          `\r${chalk.cyan(loadingFrames[frameIndex])} ${chalk.dim('Initializing systems...')}`
        );
        frameIndex = (frameIndex + 1) % loadingFrames.length;
      }, 100);

      setTimeout(() => {
        clearInterval(loadingInterval);
        process.stdout.write(`\r${chalk.green('✓')} ${chalk.dim('Systems initialized.        ')}\n\n`);
        resolve();
      }, 2000);
    });
  } catch (error) {
    // 如果发生任何错误，回退到简单的启动屏幕
    const errMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.cyan.bold('\n🚀 SHANNON - AI Penetration Testing Framework\n'));
    console.log(chalk.yellow('⚠️  Could not load full splash screen:', errMsg));
    console.log('');
  }
};
