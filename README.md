[!NOTE]
**[Shannon Lite 在无提示、源感知的 XBOW 基准测试中达到了 96.15% 的成功率。→](https://github.com/KeygraphHQ/shannon/tree/main/xben-benchmark-results/README.md)**


<div align="center">

<a href="https://trendshift.io/repositories/15604" target="_blank"><img src="https://trendshift.io/api/badge/repositories/15604" alt="KeygraphHQ%2Fshannon | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

<img src="./assets/shannon-screen.png?v=2" alt="Shannon Screen" width="100%">

# Shannon 是您的全自动 AI 渗透测试工具

Shannon 的工作很简单：在其他人之前破解您的 web 应用。<br />您的蓝队编码工作的红队搭档。<br />每个 Claude（编码器）都值得拥有他们的 Shannon。

---

[网站](https://keygraph.io) • [Discord](https://discord.gg/KAqzSHHpRt)

---
</div>

## 🎯 什么是 Shannon？

Shannon 是一款 AI 渗透测试工具，提供实际的漏洞利用，而不仅仅是警报。

Shannon 的目标是在其他人之前破解您的 web 应用。它自主地在您的代码中寻找攻击向量，然后使用内置浏览器执行真实的漏洞利用，例如注入攻击和认证绕过，以证明漏洞确实可以被利用。

**Shannon 解决了什么问题？**

借助 Claude Code 和 Cursor 等工具，您的团队可以不间断地交付代码。但您的渗透测试呢？每年只进行一次。这造成了*巨大的*安全缺口。在其他 364 天里，您可能在不知不觉中将漏洞部署到生产环境中。

Shannon 通过充当您的按需白盒渗透测试工具来填补这一缺口。它不仅仅是发现潜在问题。它执行真实的漏洞利用，提供漏洞的具体证明。这让您可以自信地交付代码，知道每个构建都可以得到安全保障。

> [!NOTE]
> **从自主渗透测试到自动化合规**
>
> Shannon 是 **Keygraph 安全与合规平台** 的核心组件。
>
> 虽然 Shannon 自动化了应用程序渗透测试的关键任务，但我们更广泛的平台自动化了您的整个合规之旅——从证据收集到审计准备。我们正在构建 "网络安全的 Rippling"，一个单一平台来管理您的安全状况并简化 SOC 2 和 HIPAA 等合规框架。
>
> ➡️ **[了解更多关于 Keygraph 平台的信息](https://keygraph.io)**

## 🎬 观看 Shannon 的实际应用

**真实结果**：Shannon 在 OWASP Juice Shop 中发现了 20+ 个关键漏洞，包括完整的认证绕过和数据库窃取。[查看完整报告 →](sample-reports/shannon-report-juice-shop.md)

![演示](assets/shannon-action.gif)

## ✨ 功能

- **完全自主操作**：使用单个命令启动渗透测试。AI 处理从高级 2FA/TOTP 登录（包括 Google 登录）和浏览器导航到最终报告的所有内容，无需任何干预。
- **具有可重现漏洞利用的渗透测试级报告**：提供专注于已验证、可利用发现的最终报告，包含可复制粘贴的概念验证，以消除误报并提供可操作的结果。
- **关键 OWASP 漏洞覆盖**：目前识别和验证以下关键漏洞：注入、XSS、SSRF 和认证/授权缺陷，更多类型正在开发中。
- **代码感知动态测试**：分析您的源代码以智能指导其攻击策略，然后对运行中的应用程序执行基于浏览器和命令行的实时漏洞利用，以确认实际风险。
- **由集成安全工具提供支持**：通过利用领先的侦察和测试工具（包括 **Nmap、Subfinder、WhatWeb 和 Schemathesis**）来增强其发现阶段，以深入分析目标环境。
- **并行处理以获得更快的结果**：更快地获得您的报告。系统并行化最耗时的阶段，同时运行所有漏洞类型的分析和利用。

## 📦 产品线

Shannon 有两个版本：

| 版本 | 许可证 | 最适合 |
|---------|---------|----------|
| **Shannon Lite** | AGPL-3.0 | 安全团队、独立研究人员、测试您自己的应用程序 |
| **Shannon Pro** | 商业 | 需要高级功能、CI/CD 集成和专门支持的企业 |

> **此存储库包含 Shannon Lite**，它利用我们的核心自主 AI 渗透测试框架。**Shannon Pro** 通过先进的、由 LLM 驱动的数据流分析引擎（灵感来自 [LLMDFA 论文](https://arxiv.org/abs/2402.10754)）增强了这一基础，用于企业级代码分析和更深入的漏洞检测。

> [!IMPORTANT]
> **仅白盒**。Shannon Lite 专为 **白盒（源代码可用）** 应用程序安全测试而设计。<br />
> 它需要访问您的应用程序的源代码和存储库布局。

[查看功能比较](./SHANNON-PRO.md)
## 📑 目录

- [什么是 Shannon？](#-什么是-shannon)
- [观看 Shannon 的实际应用](#-观看-shannon-的实际应用)
- [功能](#-功能)
- [产品线](#-产品线)
- [设置和使用说明](#-设置-和-使用说明)
  - [先决条件](#先决条件)
  - [快速开始](#快速开始)
  - [监控进度](#监控进度)
  - [停止 Shannon](#停止-shannon)
  - [使用示例](#使用示例)
  - [配置（可选）](#配置-可选)
  - [[实验性 - 不支持] 路由器模式（替代提供商）](#实验性---不支持-路由器模式-替代提供商)
  - [输出和结果](#输出和结果)
- [示例报告](#-示例报告)
- [架构](#️-架构)
- [覆盖范围和路线图](#-覆盖范围和路线图)
- [免责声明](#️-免责声明)
- [许可证](#-许可证)
- [社区和支持](#-社区-和-支持)
- [联系我们](#-联系我们)

---

## 🚀 设置和使用说明

### 先决条件

- **Docker** - 容器运行时 ([安装 Docker](https://docs.docker.com/get-docker/))
- **AI 提供商凭证**（选择一个）：
  - **Anthropic API 密钥**（推荐）- 从 [Anthropic Console](https://console.anthropic.com) 获取
  - **Claude Code OAuth 令牌**
  - **[实验性 - 不支持] 通过路由器模式的替代提供商** - 通过 OpenRouter 的 OpenAI 或 Google Gemini（见 [路由器模式](#实验性---不支持-路由器模式-替代提供商)）

### 快速开始

```bash
# 1. 克隆 Shannon
git clone https://github.com/KeygraphHQ/shannon.git
cd shannon

# 2. 配置凭证（选择一种方法）

# 选项 A：导出环境变量
export ANTHROPIC_API_KEY="your-api-key"              # 或 CLAUDE_CODE_OAUTH_TOKEN

# 选项 B：创建 .env 文件
cat > .env << 'EOF'
ANTHROPIC_API_KEY=your-api-key
EOF

# 3. 运行渗透测试
./shannon start URL=https://your-app.com REPO=your-repo
```

Shannon 将构建容器，启动工作流，并返回工作流 ID。渗透测试在后台运行。

### 监控进度

```bash
# 查看实时工作日志
./shannon logs

# 查询特定工作流的进度
./shannon query ID=shannon-1234567890

# 打开 Temporal Web UI 进行详细监控
open http://localhost:8233
```

### 停止 Shannon

```bash
# 停止所有容器（保留工作流数据）
./shannon stop

# 完全清理（删除所有数据）
./shannon stop CLEAN=true
```

### 使用示例

```bash
# 基本渗透测试
./shannon start URL=https://example.com REPO=repo-name

# 使用配置文件
./shannon start URL=https://example.com REPO=repo-name CONFIG=./configs/my-config.yaml

# 自定义输出目录
./shannon start URL=https://example.com REPO=repo-name OUTPUT=./my-reports
```

### 准备您的存储库

Shannon 期望目标存储库放置在项目根目录的 `./repos/` 目录下。`REPO` 标志指的是 `./repos/` 内的文件夹名称。将您要扫描的存储库复制到 `./repos/`，或直接克隆到那里：

```bash
git clone https://github.com/your-org/your-repo.git ./repos/your-repo
```

**对于单体存储库：**

```bash
git clone https://github.com/your-org/your-monorepo.git ./repos/your-monorepo
```

**对于多存储库应用程序**（例如，分离的前端/后端）：

```bash
mkdir ./repos/your-app
cd ./repos/your-app
git clone https://github.com/your-org/frontend.git
git clone https://github.com/your-org/backend.git
git clone https://github.com/your-org/api.git
```

### 平台特定说明

**对于 Linux（原生 Docker）：**

根据您的 Docker 设置，您可能需要使用 `sudo` 运行命令。如果您遇到输出文件的权限问题，请确保您的用户有权访问 Docker 套接字。

**对于 macOS：**

安装 Docker Desktop 后即可直接使用。

**测试本地应用程序：**

Docker 容器无法访问主机上的 `localhost`。使用 `host.docker.internal` 代替 `localhost`：

```bash
./shannon start URL=http://host.docker.internal:3000 REPO=repo-name
```

### 配置（可选）

虽然您可以在没有配置文件的情况下运行，但创建一个配置文件可以启用认证测试和自定义分析。将您的配置文件放在 `./configs/` 目录内 — 此文件夹会自动挂载到 Docker 容器中。

#### 创建配置文件

复制并修改示例配置：

```bash
cp configs/example-config.yaml configs/my-app-config.yaml
```

#### 基本配置结构

```yaml
authentication:
  login_type: form
  login_url: "https://your-app.com/login"
  credentials:
    username: "test@example.com"
    password: "yourpassword"
    totp_secret: "LB2E2RX7XFHSTGCK"  # 2FA 可选

  login_flow:
    - "Type $username into the email field"
    - "Type $password into the password field"
    - "Click the 'Sign In' button"

  success_condition:
    type: url_contains
    value: "/dashboard"

rules:
  avoid:
    - description: "AI should avoid testing logout functionality"
      type: path
      url_path: "/logout"

  focus:
    - description: "AI should emphasize testing API endpoints"
      type: path
      url_path: "/api"
```

#### 2FA 的 TOTP 设置

如果您的应用程序使用双因素认证，只需将 TOTP 密钥添加到您的配置文件中。AI 将在测试期间自动生成所需的代码。

### [实验性 - 不支持] 路由器模式（替代提供商）

Shannon 可以通过 claude-code-router 实验性地通过替代 AI 提供商路由请求。此模式不受官方支持，主要用于：

* **模型实验** — 尝试使用 GPT-5.2 或 Gemini 3 系列模型运行 Shannon

#### 快速设置

1. 将您的提供商 API 密钥添加到 `.env`：

```bash
# 选择一个提供商：
OPENAI_API_KEY=sk-...
# 或
OPENROUTER_API_KEY=sk-or-...

# 设置默认模型：
ROUTER_DEFAULT=openai,gpt-5.2  # provider,model 格式
```

2. 使用 `ROUTER=true` 运行：

```bash
./shannon start URL=https://example.com REPO=repo-name ROUTER=true
```

#### 实验性模型

| 提供商 | 模型 |
|----------|--------|
| OpenAI | gpt-5.2, gpt-5-mini |
| OpenRouter | google/gemini-3-flash-preview |

#### 免责声明

此功能是实验性的，不受支持。输出质量在很大程度上取决于模型。Shannon 构建在 Anthropic Agent SDK 之上，并针对 Anthropic Claude 模型进行了优化和主要测试。替代提供商可能会产生不一致的结果（包括在侦察等早期阶段失败），具体取决于模型和路由设置。

### 输出和结果

所有结果默认保存到 `./audit-logs/{hostname}_{sessionId}/`。使用 `--output <path>` 指定自定义目录。

输出结构：
```
audit-logs/{hostname}_{sessionId}/
├── session.json          # 指标和会话数据
├── agents/               # 每个智能体的执行日志
├── prompts/              # 可重现性的提示快照
└── deliverables/
    └── comprehensive_security_assessment_report.md   # 最终综合安全评估报告
```

---

## 📊 示例报告

> **寻找定量基准？** [查看完整的基准方法和结果 →](./xben-benchmark-results/README.md)

查看 Shannon 在行业标准易受攻击应用程序上的渗透测试结果：

#### 🧃 **OWASP Juice Shop** • [GitHub](https://github.com/juice-shop/juice-shop)

*由 OWASP 维护的臭名昭著的不安全 web 应用程序，旨在测试工具发现各种现代漏洞的能力。*

**性能**：在单次自动运行中识别了**超过 20 个高影响漏洞**，涵盖目标 OWASP 类别。

**关键成就**：

- **实现了完整的认证绕过**，并通过注入攻击窃取了整个用户数据库
- **通过注册工作流绕过创建新管理员账户**，执行了完整的权限提升
- **识别并利用了系统性授权缺陷 (IDOR)**，以访问和修改任何用户的私人数据和购物车
- **发现了服务器端请求伪造 (SSRF)** 漏洞，实现了内部网络侦察

📄 **[查看完整报告 →](sample-reports/shannon-report-juice-shop.md)**

---

#### 🔗 **c{api}tal API** • [GitHub](https://github.com/Checkmarx/capital)

*来自 Checkmarx 的故意易受攻击的 API，旨在测试工具发现 OWASP API 安全前 10 名的能力。*

**性能**：识别了**近 15 个关键和高严重性漏洞**，导致完全的应用程序妥协。

**关键成就**：

- **通过在隐藏调试端点中通过命令链接绕过黑名单**，执行了根级注入攻击
- **通过发现并针对未修补的旧版 v1 API 端点**，实现了完全的认证绕过
- **通过利用用户配置文件更新功能中的批量分配漏洞**，将普通用户升级为完整管理员权限
- **通过正确确认应用程序强大的 XSS 防御**，展示了高准确性，报告零误报

📄 **[查看完整报告 →](sample-reports/shannon-report-capital-api.md)**

---

#### 🚗 **OWASP crAPI** • [GitHub](https://github.com/OWASP/crAPI)

*来自 OWASP 的现代、故意易受攻击的 API，旨在基准测试工具对 OWASP API 安全前 10 名的有效性。*

**性能**：识别了**超过 15 个关键和高严重性漏洞**，实现了完全的应用程序妥协。

**关键成就**：

- **使用多种高级 JWT 攻击**（包括算法混淆、alg:none 和弱密钥 (kid) 注入）绕过认证
- **通过注入攻击实现完全的数据库妥协**，从 PostgreSQL 数据库中窃取用户凭证
- **执行了关键的服务器端请求伪造 (SSRF) 攻击**，成功将内部认证令牌转发到外部服务
- **通过正确识别应用程序强大的 XSS 防御**，展示了高准确性，报告零误报

📄 **[查看完整报告 →](sample-reports/shannon-report-crapi.md)**

---

*这些结果展示了 Shannon 超越简单扫描的能力，执行深度上下文漏洞利用，具有最少的误报和可操作的概念验证。*

---

## 🏗️ 架构

Shannon 使用复杂的多智能体架构模拟人类渗透测试人员的方法。它结合了白盒源代码分析和黑盒动态漏洞利用，分为四个不同的阶段：

```
                    ┌──────────────────────┐
                    │    Reconnaissance    │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────┴───────────┐
                    │          │           │
                    ▼          ▼           ▼
        ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
        │ Vuln Analysis   │ │ Vuln Analysis   │ │      ...        │
        │  (Injection)    │ │     (XSS)       │ │                 │
        └─────────┬───────┘ └─────────┬───────┘ └─────────┬───────┘
                  │                   │                   │
                  ▼                   ▼                   ▼
        ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
        │  Exploitation   │ │  Exploitation   │ │      ...        │
        │  (Injection)    │ │     (XSS)       │ │                 │
        └─────────┬───────┘ └─────────┬───────┘ └─────────┬───────┘
                  │                   │                   │
                  └─────────┬─────────┴───────────────────┘
                            │
                            ▼
                    ┌──────────────────────┐
                    │      Reporting       │
                    └──────────────────────┘
```

### 架构概述

Shannon 被设计为模拟人类渗透测试人员的方法。它利用 Anthropic 的 Claude Agent SDK 作为其核心推理引擎，但其真正的优势在于围绕它构建的复杂多智能体架构。此架构结合了 **白盒源代码分析** 的深度上下文和 **黑盒动态漏洞利用** 的实际验证，由协调器通过四个不同的阶段进行管理，以确保专注于最小化误报和智能上下文管理。

---

#### **阶段 1：侦察**

第一阶段构建应用程序攻击面的综合地图。Shannon 分析源代码并与 Nmap 和 Subfinder 等工具集成，以了解技术栈和基础设施。同时，它通过浏览器自动化执行实时应用程序探索，将代码级洞察与实际行为相关联，为下一阶段生成所有入口点、API 端点和认证机制的详细地图。

#### **阶段 2：漏洞分析**

为了最大化效率，此阶段并行运行。使用侦察数据，每个 OWASP 类别的专业智能体并行寻找潜在缺陷。对于注入和 SSRF 等漏洞，智能体执行结构化数据流分析，追踪用户输入到危险的接收器。此阶段产生一个关键成果：**假设的可利用路径** 列表，传递给验证阶段。

#### **阶段 3：漏洞利用**

继续并行工作流以保持速度，此阶段完全致力于将假设转化为证据。专用的漏洞利用智能体接收假设的路径，并尝试使用浏览器自动化、命令行工具和自定义脚本执行真实世界的攻击。此阶段强制执行严格的 **"无漏洞利用，无报告"** 策略：如果假设无法成功利用以证明影响，则将其作为误报丢弃。

#### **阶段 4：报告**

最后阶段将所有验证的发现编译成专业、可操作的报告。智能体整合侦察数据和成功的漏洞利用证据，清理任何噪声或幻觉产物。仅包含经过验证的漏洞，完整的 **可重现、可复制粘贴的概念验证**，交付专注于已验证风险的最终渗透测试级报告。


## 📋 覆盖范围和路线图

有关 Shannon 的安全测试覆盖范围和开发路线图的详细信息，请参阅我们的 [覆盖范围和路线图](./COVERAGE.md) 文档。

## ⚠️ 免责声明

### 重要使用指南和免责声明

在使用 Shannon (Lite) 之前，请仔细阅读以下指南。作为用户，您对自己的行为负责并承担所有责任。

#### **1. 潜在的突变效应和环境选择**

这不是一个被动扫描器。漏洞利用智能体旨在 **主动执行攻击** 以确认漏洞。此过程可能对目标应用程序及其数据产生突变效应。

> [!WARNING]
> **⚠️ 不要在生产环境中运行 Shannon。**
>
> - 它专门用于沙盒、暂存或本地开发环境，其中数据完整性不是问题。
> - 潜在的突变效应包括但不限于：创建新用户、修改或删除数据、损害测试账户以及触发注入攻击的意外副作用。

#### **2. 法律和道德使用**

Shannon 专为合法的安全审计目的而设计。

> [!CAUTION]
> **您必须获得目标系统所有者的明确书面授权** 才能运行 Shannon。
>
> 未经授权扫描和利用您不拥有的系统是非法的，并可能根据《计算机欺诈和滥用法案》(CFAA) 等法律被起诉。Keygraph 不对 Shannon 的任何滥用负责。

#### **3. LLM 和自动化注意事项**

- **验证是必需的**：虽然我们的 "通过漏洞利用证明" 方法已投入大量工程以消除误报，但底层 LLM 仍可能在最终报告中生成幻觉或支持不足的内容。**人工监督对于验证所有报告发现的合法性和严重性至关重要**。
- **全面性**：由于 LLM 上下文窗口的固有限制，Shannon Lite 的分析可能不是 exhaustive 的。对于整个代码库的更全面、基于图的分析，**Shannon Pro** 利用其先进的数据流分析引擎来确保更深入和更彻底的覆盖。

#### **4. 分析范围**

- **目标漏洞**：当前版本的 Shannon Lite 专门针对以下类别的 *可利用* 漏洞：
  - 认证和授权缺陷
  - 注入
  - 跨站脚本 (XSS)
  - 服务器端请求伪造 (SSRF)
- **Shannon Lite 不覆盖的内容**：此列表并非所有潜在安全风险的详尽列表。Shannon Lite 的 "通过漏洞利用证明" 模型意味着它不会报告它无法主动利用的问题，例如易受攻击的第三方库或不安全的配置。这些类型的深度静态分析发现在 **Shannon Pro** 的高级分析引擎中是核心焦点。

#### **5. 成本和性能**

- **时间**：截至当前版本，完整测试运行通常需要 **1 到 1.5 小时** 才能完成。
- **成本**：使用 Anthropic 的 Claude 4.5 Sonnet 模型运行完整测试可能会产生约 **50 美元** 的成本。成本因模型定价和应用程序复杂性而异。

#### **6. Windows 防病毒误报**

Windows Defender 可能会将 `xben-benchmark-results/` 或 `deliverables/` 中的文件标记为恶意软件。这些是由报告中的漏洞利用代码引起的误报。在 Windows Defender 中为 Shannon 目录添加排除，或使用 Docker/WSL2。


## 📜 许可证

Shannon Lite 在 [GNU Affero 通用公共许可证 v3.0 (AGPL-3.0)](LICENSE) 下发布。

Shannon 是开源的（AGPL v3）。此许可证允许您：
- 免费用于所有内部安全测试。
- 私下修改代码供内部使用，无需分享您的更改。

AGPL 的共享要求主要适用于将 Shannon 作为公共或托管服务（如 SaaS 平台）提供的组织。在这些特定情况下，对核心软件所做的任何修改都必须开源。


## 👥 社区和支持

### 社区资源

**贡献**：目前，我们不接受外部代码贡献（PR）。<br />欢迎通过问题报告错误和功能请求。

- 🐛 **报告错误** 通过 [GitHub Issues](https://github.com/KeygraphHQ/shannon/issues)
- 💡 **建议功能** 在 [Discussions](https://github.com/KeygraphHQ/shannon/discussions)
- 💬 **加入我们的 [Discord](https://discord.gg/KAqzSHHpRt)** 以获得实时社区支持

### 保持联系

- 🐦 **Twitter**：[@KeygraphHQ](https://twitter.com/KeygraphHQ)
- 💼 **LinkedIn**：[Keygraph](https://linkedin.com/company/keygraph)
- 🌐 **网站**：[keygraph.io](https://keygraph.io)



## 💬 联系我们

### 对 Shannon Pro 感兴趣？

Shannon Pro 专为认真对待应用程序安全的组织而设计。它提供企业级功能、专门支持和无缝 CI/CD 集成，全部由我们最先进的基于 LLM 的分析引擎提供支持。在复杂漏洞到达生产环境之前发现并修复它们。

有关功能、技术差异和企业用例的详细分解，请参阅我们的 [完整比较指南](./SHANNON-PRO.md)。

<p align="center">
  <a href="https://docs.google.com/forms/d/e/1FAIpQLSf-cPZcWjlfBJ3TCT8AaWpf8ztsw3FaHzJE4urr55KdlQs6cQ/viewform?usp=header" target="_blank">
    <img src="https://img.shields.io/badge/📋%20Express%20Interest%20in%20Shannon%20Pro-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Express Interest">
  </a>
</p>

**或直接联系我们：**

📧 **电子邮件**：[shannon@keygraph.io](mailto:shannon@keygraph.io)

---

<p align="center">
  <b>由 Keygraph 团队用心打造</b><br>
  <i>让应用程序安全对每个人都可访问</i>
</p>