# Shannon Pro 对比 Shannon Lite

## 技术差异

**Shannon Pro** 基于先进的、由 LLM 驱动的数据流分析构建，其灵感来源于 [LLM-driven Data-Flow Analysis 论文](https://arxiv.org/abs/2402.10754)中的思想。它通过追踪数据流来高精度识别复杂的可利用漏洞。它基于云服务，支持原生 CI/CD 集成（GitHub Actions、GitLab CI、Jenkins），并支持自托管部署。

### 功能对比

| 功能 | Shannon Lite<br>(AGPL-3.0) | Shannon Pro<br>(商业版) |
|---------|:-------------------------:|:---------------------------:|
| **核心扫描** |
| 源-汇分析 | 基础 | 基于 LLM 的数据流分析，用于高精度的源到汇漏洞检测 |
| CVSS 评分 | ❌ | ✅ |
| 修复指导 | 基础 | 代码级修复 |
| **集成** |
| CI/CD 管道支持 | ❌ | ✅ |
| API 访问 | ❌ | ✅ |
| Jira/Linear/ServiceNow/Slack | ❌ | ✅ |
| **部署** |
| 托管方式 | 自托管 | 云托管或自托管 |
| **企业级** |
| 多用户与 RBAC | ❌ | ✅ |
| SSO/SAML | ❌ | ✅ |
| 审计日志 | ❌ | ✅ |
| 合规报告 | ❌ | ✅ (OWASP, PCI-DSS, SOC2) |
| **支持** |
| 支持 | 社区 | 专属支持 + SLA |
| **成本** | 免费 + API 费用 | 联系我们 |

## 如何选择？

**Shannon Lite**：适合个人研究人员、小型团队或测试个人项目  
**Shannon Pro**：专为希望"左移"并将安全性直接集成到开发生命周期中的组织设计。其 _先进的 LLM 驱动数据流分析引擎_ 非常适合在漏洞到达生产环境之前捕获深层漏洞，并辅以完整的 CI/CD 集成和企业级支持。

## 对 Shannon Pro 感兴趣？

Shannon Pro 为重视应用程序安全的组织提供企业级功能、专属支持和无缝的 CI/CD 集成。

<p align="center">
  <a href="https://docs.google.com/forms/d/e/1FAIpQLSf-cPZcWjlfBJ3TCT8AaWpf8ztsw3FaHzJE4urr55KdlQs6cQ/viewform?usp=header" target="_blank">
    <img src="https://img.shields.io/badge/📋%20Express%20Interest%20in%20Shannon%20Pro-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Express Interest">
  </a>
</p>

**或直接联系我们：**

📧 **邮箱**：[shannon@keygraph.io](mailto:shannon@keygraph.io)
