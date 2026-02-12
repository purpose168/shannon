---
description: 使用上下文分析和结构化恢复系统调试错误
---

你正在调试一个问题。请遵循以下结构化方法，避免在原地打转。

## 步骤 1：捕获错误上下文
- 阅读完整的错误信息和堆栈跟踪
- 识别错误起源的层：
  - **CLI/参数** - 输入验证、路径解析
  - **配置解析** - YAML 解析、JSON Schema 验证
  - **会话管理** - 互斥锁、session.json、锁文件
  - **审计系统** - 日志记录、指标跟踪、原子写入
  - **Claude SDK** - 智能体执行、MCP 服务器、回合处理
  - **Git 操作** - 检查点、回滚、提交
  - **工具执行** - nmap、subfinder、whatweb
  - **验证** - 交付物检查、队列验证

## 步骤 2：检查相关日志

**会话审计日志：**
```bash
# 查找最近的会话
ls -lt audit-logs/ | head -5

# 检查会话指标和错误
cat audit-logs/<session>/session.json | jq '.errors, .agentMetrics'

# 检查智能体执行日志
ls -lt audit-logs/<session>/agents/
cat audit-logs/<session>/agents/<latest>.log
```

## 步骤 3：追踪调用路径

对于 Shannon，请通过以下层进行追踪：

1. **Temporal 客户端** → `src/temporal/client.ts` - 工作流启动
2. **工作流** → `src/temporal/workflows.ts` - 管道编排
3. **活动** → `src/temporal/activities.ts` - 带心跳的智能体执行
4. **配置** → `src/config-parser.ts` - YAML 加载、模式验证
5. **会话** → `src/session-manager.ts` - 智能体定义、执行顺序
6. **审计** → `src/audit/audit-session.ts` - 日志记录门面、指标跟踪
7. **执行器** → `src/ai/claude-executor.ts` - SDK 调用、MCP 设置、重试逻辑
8. **验证** → `src/queue-validation.ts` - 交付物检查

## 步骤 4：识别根本原因

**常见的 Shannon 特定问题：**

| 症状 | 可能的原因 | 修复方法 |
|------|------------|----------|
| 智能体无限挂起 | MCP 服务器崩溃、Playwright 超时 | 检查 `/tmp/playwright-*` 中的 Playwright 日志 |
| "验证失败：缺少交付物" | 智能体未创建预期文件 | 检查 `deliverables/` 目录，审查提示 |
| Git 检查点失败 | 未提交的更改、git 锁 | 运行 `git status`，移除 `.git/index.lock` |
| "会话限制已达到" | Claude API 计费限制 | 不可重试 - 检查 API 使用情况 |
| 并行智能体全部失败 | 共享资源争用 | 检查互斥锁使用，错开启动时间 |
| 成本/时间未跟踪 | 更新前未重新加载指标 | 在更新前添加 `metricsTracker.reload()` |
| session.json 损坏 | 崩溃期间的部分写入 | 删除并重启，或从备份恢复 |
| YAML 配置被拒绝 | 无效的模式或不安全的内容 | 手动通过 AJV 验证器运行 |
| 提示变量未替换 | 上下文中缺少 `{{VARIABLE}}` | 检查 `prompt-manager.ts` 插值 |

**MCP 服务器问题：**
```bash
# 检查 Playwright 浏览器是否安装
npx playwright install chromium

# 检查 MCP 服务器启动（查找连接错误）
grep -i "mcp\|playwright" audit-logs/<session>/agents/*.log
```

**Git 状态问题：**
```bash
# 检查未提交的更改
git status

# 检查 git 锁
ls -la .git/*.lock

# 查看 Shannon 最近的 git 操作
git reflog | head -10
```

## 步骤 5：应用修复并设置重试限制

- **关键**：跟踪连续失败的尝试
- 在同一问题上**连续失败 3 次**后，停止并：
  - 总结已尝试的内容
  - 解释阻碍进度的因素
  - 向用户请求指导或额外上下文
- 成功修复后，重置失败计数器

## 步骤 6：验证修复

**对于代码更改：**
```bash
# 编译 TypeScript
npx tsc --noEmit

# 快速验证运行
shannon <URL> <REPO> --pipeline-testing
```

**对于审计/会话问题：**
- 验证修复后 `session.json` 是有效的 JSON
- 检查原子写入完成无错误
- 确认 `finally` 块中的互斥锁释放

**对于智能体问题：**
- 验证交付物文件在正确位置创建
- 检查验证函数返回预期结果
- 确认重试逻辑在适当的错误上触发

## 应避免的反模式

- 不要在不检查会话是否活跃的情况下删除 `session.json`
- 不要在智能体运行时修改 git 状态
- 不要重试计费/配额错误（它们不可重试）
- 不要忽略 PentestError 类型 - 它指示错误类别
- 不要随机更改希望某些东西能工作
- 不要在不理解根本原因的情况下修复症状
- 不要为了"快速修复"而绕过互斥锁保护

## 快速参考：错误类型

| PentestError 类型 | 含义 | 可重试？ |
|------------------|------|----------|
| `config` | 配置文件问题 | 否 |
| `network` | 连接/超时问题 | 是 |
| `tool` | 外部工具（nmap 等）失败 | 是 |
| `prompt` | Claude SDK/API 问题 | 有时 |
| `filesystem` | 文件读/写错误 | 有时 |
| `validation` | 交付物验证失败 | 是（通过重试） |
| `billing` | API 配额/计费限制 | 否 |
| `unknown` | 意外错误 | 取决于情况 |

---

现在分析错误并开始系统地调试。