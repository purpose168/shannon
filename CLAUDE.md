# CLAUDE.md

AI 驱动的渗透测试智能体，用于防御性安全分析。通过结合侦察工具和 AI 驱动的代码分析来自动化漏洞评估。

## 命令

**前提条件：** Docker，`.env` 文件中的 Anthropic API 密钥

```bash
# 设置
cp .env.example .env && edit .env  # 设置 ANTHROPIC_API_KEY

# 准备仓库（REPO 是 ./repos/ 内的文件夹名称，不是绝对路径）
git clone https://github.com/org/repo.git ./repos/my-repo
# 或创建符号链接：ln -s /path/to/existing/repo ./repos/my-repo

# 运行
./shannon start URL=<url> REPO=my-repo
./shannon start URL=<url> REPO=my-repo CONFIG=./configs/my-config.yaml

# 监控
./shannon logs                      # 实时工作日志
./shannon query ID=<workflow-id>    # 查询工作流进度
# Temporal Web UI: http://localhost:8233

# 停止
./shannon stop                      # 保留工作流数据
./shannon stop CLEAN=true           # 完全清理，包括卷

# 构建
npm run build
```

**选项：** `CONFIG=<file>`（YAML 配置），`OUTPUT=<path>`（默认：`./audit-logs/`），`PIPELINE_TESTING=true`（最小提示，10秒重试），`REBUILD=true`（强制 Docker 重建），`ROUTER=true`（通过 [claude-code-router](https://github.com/musistudio/claude-code-router) 进行多模型路由）

## 架构

### 核心模块
- `src/session-manager.ts` — 智能体定义、执行顺序、并行组
- `src/ai/claude-executor.ts` — Claude Agent SDK 集成，带有重试逻辑和 git 检查点
- `src/config-parser.ts` — 带有 JSON Schema 验证的 YAML 配置解析
- `src/error-handling.ts` — 分类错误类型（PentestError、ConfigError、NetworkError），带有重试逻辑
- `src/tool-checker.ts` — 在执行前验证外部安全工具的可用性
- `src/queue-validation.ts` — 可交付成果验证和智能体前提条件

### Temporal 编排

具有崩溃恢复、可查询进度、智能重试和并行执行（漏洞/利用阶段的 5 个并发智能体）的持久工作流编排。

- `src/temporal/workflows.ts` — 主工作流（`pentestPipelineWorkflow`）
- `src/temporal/activities.ts` — 带有心跳的活动实现
- `src/temporal/worker.ts` — 工作节点入口点
- `src/temporal/client.ts` — 用于启动工作流的 CLI 客户端
- `src/temporal/shared.ts` — 类型、接口、查询定义
- `src/temporal/query.ts` — 用于进度检查的查询工具

### 五阶段管道

1. **预侦察**（`pre-recon`）— 外部扫描（nmap、subfinder、whatweb）+ 源代码分析
2. **侦察**（`recon`）— 根据初始发现映射攻击面
3. **漏洞分析**（5 个并行智能体）— 注入、xss、认证、授权、ssrf
4. **利用**（5 个并行智能体，条件性）— 利用已确认的漏洞
5. **报告**（`report`）— 执行级安全报告

### 支持系统
- **配置** — `configs/` 中的 YAML 配置，带有 JSON Schema 验证（`config-schema.json`）。支持认证设置、MFA/TOTP 和每应用测试参数
- **提示** — `prompts/` 中的每阶段模板，带有变量替换（`{{TARGET_URL}}`、`{{CONFIG_CONTEXT}}`）。通过 `prompt-manager.ts` 在 `prompts/shared/` 中共享部分内容
- **SDK 集成** — 使用 `@anthropic-ai/claude-agent-sdk`，设置 `maxTurns: 10_000` 和 `bypassPermissions` 模式。Playwright MCP 用于浏览器自动化，通过 MCP 工具生成 TOTP。`prompts/shared/login-instructions.txt` 中的登录流程模板支持表单、SSO、API 和基本认证
- **审计系统** — 在 `audit-logs/{hostname}_{sessionId}/` 中进行崩溃安全的仅追加日志记录。跟踪会话指标、每智能体日志、提示和可交付成果
- **可交付成果** — 通过 `save_deliverable` MCP 工具保存到目标仓库的 `deliverables/` 中

## 开发说明

### 添加新智能体
1. 在 `src/session-manager.ts` 中定义智能体（添加到 `AGENT_QUEUE` 和并行组）
2. 在 `prompts/` 中创建提示模板（例如 `vuln-newtype.txt`）
3. 在 `src/temporal/activities.ts` 中添加活动函数
4. 在 `src/temporal/workflows.ts` 的相应阶段中注册活动

### 修改提示
- 变量替换：`{{TARGET_URL}}`、`{{CONFIG_CONTEXT}}`、`{{LOGIN_INSTRUCTIONS}}`
- 通过 `prompt-manager.ts` 包含 `prompts/shared/` 中的共享部分
- 使用 `PIPELINE_TESTING=true` 进行快速迭代测试

### 关键设计模式
- **配置驱动** — 带有 JSON Schema 验证的 YAML 配置
- **渐进式分析** — 每个阶段都建立在先前结果的基础上
- **SDK 优先** — Claude Agent SDK 处理自主分析
- **模块化错误处理** — 分类错误，自动重试（每个智能体 3 次尝试）

## 代码风格指南

### 清晰优于简洁
- 优化可读性，而非行数 — 三行清晰的代码优于一行密集的表达式
- 使用传达意图的描述性名称
- 优先使用明确的逻辑，而非巧妙的单行代码

### 结构
- 保持函数专注于单一职责
- 使用早期返回和保护子句，而非深层嵌套
- 永远不要使用嵌套的三元运算符 — 使用 if/else 或 switch
- 将复杂条件提取到命名良好的布尔变量中

### TypeScript 约定
- 对顶级函数使用 `function` 关键字（而非箭头函数）
- 对导出/顶级函数使用显式返回类型注解
- 对不应被修改的数据优先使用 `readonly`

### 避免
- 将多个关注点组合到单个函数中以"节省行数"
- 当顺序逻辑更清晰时使用密集的回调链
- 为了 DRY 而牺牲可读性 — 如果更清晰，一些重复是可以接受的
- 为一次性操作创建抽象

## 关键文件

**入口点：** `src/temporal/workflows.ts`、`src/temporal/activities.ts`、`src/temporal/worker.ts`、`src/temporal/client.ts`

**核心逻辑：** `src/session-manager.ts`、`src/ai/claude-executor.ts`、`src/config-parser.ts`、`src/audit/`

**配置：** `shannon`（CLI）、`docker-compose.yml`、`configs/`、`prompts/`

## 故障排除

- **"Repository not found"** — `REPO` 必须是 `./repos/` 内的文件夹名称，不是绝对路径。请先在那里克隆或创建符号链接：`ln -s /path/to/repo ./repos/my-repo`
- **"Temporal not ready"** — 等待健康检查或查看 `docker compose logs temporal`
- **Worker not processing** — 检查 `docker compose ps`
- **重置状态** — `./shannon stop CLEAN=true`
- **本地应用无法访问** — 使用 `host.docker.internal` 而非 `localhost`
- **缺少工具** — 使用 `PIPELINE_TESTING=true` 跳过 nmap/subfinder/whatweb（优雅降级）
- **容器权限** — 在 Linux 上，可能需要 `sudo` 来执行 docker 命令