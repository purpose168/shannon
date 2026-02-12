# 覆盖范围和路线图

Web 安全测试（WST）清单是一份全面的指南，系统地概述了 Web 应用程序的安全测试，涵盖信息收集、身份验证、会话管理、输入验证和错误处理等领域，以识别和缓解漏洞。

下面的清单突出显示了我们的产品始终如一地可靠解决的特定 WST 类别和项目。虽然 Shannon 的动态检测通常会扩展到其他领域，但我们相信透明度，只标记了我们设计用来持续捕获的漏洞。**我们的覆盖范围战略性地集中在适用于当今 Web 应用技术栈的 WST 控制上。**

我们正在积极努力扩大这一覆盖范围，为现代 Web 应用程序提供更加全面的安全解决方案。

## 当前覆盖范围

Shannon 当前针对以下几类*可利用*的漏洞：
- 身份验证和授权缺陷（Broken Authentication & Authorization）
- SQL 注入（SQL Injection，SQLi）
- 命令注入（Command Injection）
- 跨站脚本攻击（Cross-Site Scripting，XSS）
- 服务器端请求伪造（Server-Side Request Forgery，SSRF）

## Shannon 不覆盖的内容

此列表并不详尽涵盖所有潜在的安全风险。例如，Shannon 不会报告它无法主动利用的问题，如使用易受攻击的第三方库、弱加密算法或不安全的配置。这些类型的静态分析发现是我们即将推出的 **Keygraph 代码安全（SAST）** 产品的重点。

## WST 测试清单

| 测试 ID | 测试名称 | 状态 |
| --- | --- | --- |
| **WSTG-INFO** | **信息收集** |  |
| WSTG-INFO-01 | 进行搜索引擎发现和信息泄露侦察 |  |
| WSTG-INFO-02 | 识别 Web 服务器指纹 | ✅ |
| WSTG-INFO-03 | 审查 Web 服务器元文件以查找信息泄露 |  |
| WSTG-INFO-04 | 枚举 Web 服务器上的应用程序 |  |
| WSTG-INFO-05 | 审查网页内容以查找信息泄露 |  |
| WSTG-INFO-06 | 识别应用程序入口点 | ✅ |
| WSTG-INFO-07 | 映射应用程序执行路径 | ✅ |
| WSTG-INFO-08 | 识别 Web 应用程序框架指纹 | ✅ |
| WSTG-INFO-09 | 识别 Web 应用程序指纹 | ✅ |
| WSTG-INFO-10 | 映射应用程序架构 | ✅ |
|  |  |  |
| **WSTG-CONF** | **配置和部署管理测试** |  |
| WSTG-CONF-01 | 测试网络基础设施配置 | ✅ |
| WSTG-CONF-02 | 测试应用程序平台配置 |  |
| WSTG-CONF-03 | 测试文件扩展名处理以查找敏感信息 |  |
| WSTG-CONF-04 | 审查旧备份和未引用文件以查找敏感信息 |  |
| WSTG-CONF-05 | 枚举基础设施和应用程序管理界面 |  |
| WSTG-CONF-06 | 测试 HTTP 方法 |  |
| WSTG-CONF-07 | 测试 HTTP 严格传输安全 |  |
| WSTG-CONF-08 | 测试 RIA 跨域策略 |  |
| WSTG-CONF-09 | 测试文件权限 |  |
| WSTG-CONF-10 | 测试子域名接管 | ✅ |
| WSTG-CONF-11 | 测试云存储 |  |
| WSTG-CONF-12 | 测试内容安全策略 |  |
| WSTG-CONF-13 | 测试路径混淆 |  |
| WSTG-CONF-14 | 测试其他 HTTP 安全头配置错误 |  |
|  |  |  |
| **WSTG-IDNT** | **身份管理测试** |  |
| WSTG-IDNT-01 | 测试角色定义 | ✅ |
| WSTG-IDNT-02 | 测试用户注册流程 | ✅ |
| WSTG-IDNT-03 | 测试账户配置流程 | ✅ |
| WSTG-IDNT-04 | 测试账户枚举和可猜测用户账户 | ✅ |
| WSTG-IDNT-05 | 测试弱或未强制执行的用户名策略 | ✅ |
|  |  |  |
| **WSTG-ATHN** | **身份验证测试** |  |
| WSTG-ATHN-01 | 测试通过加密通道传输的凭证 | ✅ |
| WSTG-ATHN-02 | 测试默认凭证 | ✅ |
| WSTG-ATHN-03 | 测试弱锁定机制 | ✅ |
| WSTG-ATHN-04 | 测试绕过身份验证方案 | ✅ |
| WSTG-ATHN-05 | 测试易受攻击的记住密码功能 |  |
| WSTG-ATHN-06 | 测试浏览器缓存弱点 |  |
| WSTG-ATHN-07 | 测试弱密码策略 | ✅ |
| WSTG-ATHN-08 | 测试弱安全问题答案 | ✅ |
| WSTG-ATHN-09 | 测试弱密码更改或重置功能 | ✅ |
| WSTG-ATHN-10 | 测试替代渠道中的弱身份验证 | ✅ |
| WSTG-ATHN-11 | 测试多因素身份验证（MFA） | ✅ |
|  |  |  |
| **WSTG-ATHZ** | **授权测试** |  |
| WSTG-ATHZ-01 | 测试目录遍历文件包含 | ✅ |
| WSTG-ATHZ-02 | 测试绕过授权方案 | ✅ |
| WSTG-ATHZ-03 | 测试权限提升 | ✅ |
| WSTG-ATHZ-04 | 测试不安全的直接对象引用 | ✅ |
| WSTG-ATHZ-05 | 测试 OAuth 弱点 | ✅ |
|  |  |  |
| **WSTG-SESS** | **会话管理测试** |  |
| WSTG-SESS-01 | 测试会话管理方案 | ✅ |
| WSTG-SESS-02 | 测试 Cookie 属性 | ✅ |
| WSTG-SESS-03 | 测试会话固定 | ✅ |
| WSTG-SESS-04 | 测试暴露的会话变量 |  |
| WSTG-SESS-05 | 测试跨站请求伪造 | ✅ |
| WSTG-SESS-06 | 测试注销功能 | ✅ |
| WSTG-SESS-07 | 测试会话超时 | ✅ |
| WSTG-SESS-08 | 测试会话困惑 |  |
| WSTG-SESS-09 | 测试会话劫持 |  |
| WSTG-SESS-10 | 测试 JSON Web 令牌 | ✅ |
| WSTG-SESS-11 | 测试并发会话 |  |
|  |  |  |
| **WSTG-INPV** | **输入验证测试** |  |
| WSTG-INPV-01 | 测试反射型跨站脚本 | ✅ |
| WSTG-INPV-02 | 测试存储型跨站脚本 | ✅ |
| WSTG-INPV-03 | 测试 HTTP 方法篡改 |  |
| WSTG-INPV-04 | 测试 HTTP 参数污染 |  |
| WSTG-INPV-05 | 测试 SQL 注入 | ✅ |
| WSTG-INPV-06 | 测试 LDAP 注入 |  |
| WSTG-INPV-07 | 测试 XML 注入 |  |
| WSTG-INPV-08 | 测试 SSI 注入 |  |
| WSTG-INPV-09 | 测试 XPath 注入 |  |
| WSTG-INPV-10 | 测试 IMAP SMTP 注入 |  |
| WSTG-INPV-11 | 测试代码注入 | ✅ |
| WSTG-INPV-12 | 测试命令注入 | ✅ |
| WSTG-INPV-13 | 测试格式字符串注入 |  |
| WSTG-INPV-14 | 测试孵化中的漏洞 |  |
| WSTG-INPV-15 | 测试 HTTP 分割走私 |  |
| WSTG-INPV-16 | 测试 HTTP 传入请求 |  |
| WSTG-INPV-17 | 测试主机头注入 |  |
| WSTG-INPV-18 | 测试服务器端模板注入 | ✅ |
| WSTG-INPV-19 | 测试服务器端请求伪造 | ✅ |
| WSTG-INPV-20 | 测试批量赋值 |  |
|  |  |  |
| **WSTG-ERRH** | **错误处理** |  |
| WSTG-ERRH-01 | 测试不当的错误处理 |  |
| WSTG-ERRH-02 | 测试堆栈跟踪 |  |
|  |  |  |
| **WSTG-CRYP** | **加密** |  |
| WSTG-CRYP-01 | 测试弱传输层安全 | ✅ |
| WSTG-CRYP-02 | 测试填充 oracle |  |
| WSTG-CRYP-03 | 测试通过未加密通道发送的敏感信息 | ✅ |
| WSTG-CRYP-04 | 测试弱加密 |  |
|  |  |  |
| **WSTG-BUSLOGIC** | **业务逻辑测试** |  |
| WSTG-BUSL-01 | 测试业务逻辑数据验证 |  |
| WSTG-BUSL-02 | 测试伪造请求的能力 |  |
| WSTG-BUSL-03 | 测试完整性检查 |  |
| WSTG-BUSL-04 | 测试过程计时 |  |
| WSTG-BUSL-05 | 测试函数使用次数限制 |  |
| WSTG-BUSL-06 | 测试工作流规避 |  |
| WSTG-BUSL-07 | 测试防止应用程序滥用的防御措施 |  |
| WSTG-BUSL-08 | 测试上传意外文件类型 |  |
| WSTG-BUSL-09 | 测试上传恶意文件 |  |
| WSTG-BUSL-10 | 测试支付功能 |  |
|  |  |  |
| **WSTG-CLIENT** | **客户端测试** |  |
| WSTG-CLNT-01 | 测试 DOM 型跨站脚本 | ✅ |
| WSTG-CLNT-02 | 测试 JavaScript 执行 | ✅ |
| WSTG-CLNT-03 | 测试 HTML 注入 | ✅ |
| WSTG-CLNT-04 | 测试客户端 URL 重定向 | ✅ |
| WSTG-CLNT-05 | 测试 CSS 注入 |  |
| WSTG-CLNT-06 | 测试客户端资源操纵 |  |
| WSTG-CLNT-07 | 测试跨源资源共享 |  |
| WSTG-CLNT-08 | 测试跨站闪烁 |  |
| WSTG-CLNT-09 | 测试点击劫持 |  |
| WSTG-CLNT-10 | 测试 WebSockets |  |
| WSTG-CLNT-11 | 测试 Web 消息传递 |  |
| WSTG-CLNT-12 | 测试浏览器存储 | ✅ |
| WSTG-CLNT-13 | 测试跨站脚本包含 | ✅ |
| WSTG-CLNT-14 | 测试反向标签页劫持 |  |
|  |  |  |
| **WSTG-APIT** | **API 测试** |  |
| WSTG-APIT-01 | API 侦察 | ✅ |
| WSTG-APIT-02 | API 损坏的对象级别授权 | ✅ |
| WSTG-APIT-99 | 测试 GraphQL | ✅ |
|  |  |  |