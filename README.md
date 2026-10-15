# Feishu Grok Bridge

飞书机器人接收消息 → 提取链接 → SMTP发送邮件到QQ邮箱 → 回复飞书确认的完整链路。

---

## Part 1: 飞书应用创建

### 1.1 登录飞书开放平台

打开浏览器，访问 [https://open.feishu.cn/](https://open.feishu.cn/)，使用你的飞书账号登录。

### 1.2 创建企业自建应用

1. 登录后，点击页面右上角的 **"开发者后台"**
2. 点击 **"创建企业自建应用"** 按钮
3. 填写应用信息：
   - **应用名称**：`LinkToGrok`（或你喜欢的名字）
   - **应用描述**：`自动收集群聊链接并发送到邮箱等待Grok总结`
   - **应用头像**：可以上传一个图标，也可以先跳过
4. 点击 **"确定创建"**

### 1.3 记录应用凭证

创建成功后，会自动进入应用详情页。

1. 在页面左侧，点击 **"凭证与基础信息"**
2. 在这里你会看到：
   - **App ID**（例如：`cli_xxxxxxxxxxxxxxxx`）
   - **App Secret**（点击"查看"按钮显示）
3. **把这两个值复制保存下来**，后面部署到 Vercel 时需要用到

### 1.4 开启机器人能力

1. 在左侧菜单中，点击 **"机器人"**
2. 找到 **"启用机器人"** 开关，点击开启
3. 填写机器人信息：
   - **机器人名称**：`LinkToGrok`
   - **机器人描述**：`自动收集链接发送到邮箱`
4. 点击 **"保存"**

### 1.5 配置权限

机器人需要特定权限才能读取消息和发送回复。

1. 在左侧菜单中，点击 **"权限管理"**
2. 点击 **"添加 API 权限"** 或 **"批量添加"**
3. 搜索并添加以下权限：
   - `im:chat:readonly` — 读取会话信息
   - `im:message` — 读取和发送消息
   - `im:message.group_msg` — 读取群消息
4. 添加完成后，点击 **"申请发布"**（如果提示需要申请）

### 1.6 配置事件与回调

这是最关键的一步，配置飞书如何通知我们的服务。

1. 在左侧菜单中，点击 **"事件与回调"**
2. 打开 **"启用事件"** 开关
3. **请求地址**：先留空（部署到 Vercel 后再回来填写）
4. **加密策略**（建议开启）：
   - **Encrypt Key**：点击 **"重新生成"**，复制保存。服务端会用它解密 `{"encrypt":"..."}` 请求，并校验 `X-Lark-Signature`
   - **Verification Token**：同一页可以看到，复制到环境变量 `FEISHU_VERIFICATION_TOKEN`（可选，配置后会校验事件里的 token）
5. **添加订阅事件**：
   - 点击 **"添加事件"**
   - 搜索并选择 `im.message.receive_v1`（接收消息事件）
   - 点击 **"确定"**
6. 点击 **"保存"**

### 1.7 发布应用（仅自己可用）

1. 在左侧菜单中，点击 **"版本管理与发布"**
2. 点击 **"创建版本"**
3. 填写版本信息：
   - **版本号**：`1.0.0`
   - **更新说明**：`初始版本，支持链接收集和邮件发送`
4. 点击 **"保存（仅自己可用）"**
5. 在弹出的确认框中点击 **"确认"**

### 1.8 将应用添加到群聊

1. 打开你想要使用的飞书群聊
2. 点击群聊右上角的 **"设置"**（齿轮图标）
3. 找到 **"机器人"** 选项
4. 点击 **"添加机器人"**
5. 搜索你创建的应用名称（如 `LinkToGrok`）
6. 点击 **"添加"**

---

## Part 2: 部署到 Vercel

### 2.1 准备代码仓库

#### 方式A：Fork 本项目（推荐）

如果你已经把代码上传到了 GitHub：

1. 访问你的 GitHub 仓库页面
2. 点击右上角的 **"Fork"** 按钮（如果这是别人的仓库）

#### 方式B：创建新仓库

1. 登录 [https://github.com](https://github.com)
2. 点击右上角 **"+"** → **"New repository"**
3. 仓库名称：`feishu-grok-bridge`
4. 选择 **"Public"**（公开仓库，Vercel 免费版需要）
5. 点击 **"Create repository"**
6. 上传代码：
   - 点击 **"uploading an existing file"**
   - 把本项目的所有文件拖进去
   - 点击 **"Commit changes"**

### 2.2 在 Vercel 创建项目

1. 访问 [https://vercel.com](https://vercel.com)，用 GitHub 账号登录
2. 点击仪表盘右上角的 **"Add New..."** → **"Project"**
3. 在 **"Import Git Repository"** 列表中找到你的 `feishu-grok-bridge` 仓库
4. 点击 **"Import"**

### 2.3 配置环境变量

在配置页面，找到 **"Environment Variables"** 区域，逐个添加以下变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `FEISHU_APP_ID` | `cli_xxxxxxxxxxxxxxxx` | 飞书应用的 App ID |
| `FEISHU_APP_SECRET` | `xxxxxxxxxxxxxxxx` | 飞书应用的 App Secret |
| `FEISHU_ENCRYPT_KEY` | `xxxxxxxx` | 飞书事件订阅的加密密钥。留空则不解密、不验签 |
| `FEISHU_VERIFICATION_TOKEN` | `xxxxxxxx` | 飞书 Verification Token。留空则不校验 |
| `SMTP_HOST` | `smtp.qq.com` | SMTP 服务器地址 |
| `SMTP_PORT` | `587` | SMTP 端口 |
| `SMTP_USER` | `your_qq@qq.com` | 发件人QQ邮箱 |
| `SMTP_PASS` | `xxxxxxxxxxxxxxxx` | QQ邮箱授权码 |
| `TO_EMAIL` | `your_qq@qq.com` | 收件人邮箱 |

> **如何获取 QQ 邮箱授权码？**
> 1. 登录 QQ 邮箱网页版
> 2. 点击顶部 **"设置"** → **"账户"**
> 3. 找到 **"POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV服务"**
> 4. 开启 **"SMTP服务"**
> 5. 点击 **"生成授权码"**，用手机短信验证
> 6. 把生成的16位授权码复制到 `SMTP_PASS`

### 2.4 部署

1. 确认所有环境变量都填写正确
2. 点击 **"Deploy"** 按钮
3. 等待部署完成（通常需要 1-2 分钟）
4. 部署成功后，你会看到 **"Congratulations!"** 页面

### 2.5 获取域名

1. 部署成功后，Vercel 会分配一个域名
2. 域名格式：`https://feishu-grok-bridge-xxx.vercel.app`
3. **复制这个域名**，下一步需要用到

---

## Part 3: 配置飞书回调地址

### 3.1 填写请求地址

1. 回到 [https://open.feishu.cn](https://open.feishu.cn) 的应用后台
2. 进入你的应用详情页
3. 左侧菜单点击 **"事件与回调"**
4. 找到 **"请求地址"** 输入框
5. 填写：`https://你的域名/api/webhook`
   - 例如：`https://feishu-grok-bridge-xxx.vercel.app/api/webhook`
6. 点击 **"保存"**

### 3.2 验证配置

1. 点击保存后，飞书会向你的地址发送验证请求
2. 如果显示 **"请求地址校验通过"**，说明配置成功！
3. 如果显示失败，请检查：
   - 域名是否填写正确
   - 路径是否为 `/api/webhook`
   - Vercel 部署是否成功

---

## Part 4: 测试

### 4.1 在飞书群里测试

1. 打开你添加机器人的飞书群聊
2. @机器人并发送一个链接，例如：
   ```
   @LinkToGrok 看看这个 https://www.douyin.com/video/123456
   ```
3. 观察机器人是否回复：
   > **已收到 1 个链接，已成功发送 1 封邮件到邮箱等待 Grok 总结 🚀**

### 4.2 检查邮件

1. 打开你的 QQ 邮箱
2. 查看收件箱（或垃圾邮件箱）
3. 应该收到一封主题为 **"[待总结] 来自飞书的链接"** 的邮件
4. 邮件内容包含：原始链接、来源文本、发送时间

### 4.3 支持的链接类型

机器人支持提取以下平台的链接：

- ✅ 普通网页链接（http/https）
- ✅ 抖音分享链接（`v.douyin.com`、`www.douyin.com`）
- ✅ 微信公众号文章（`mp.weixin.qq.com`）
- ✅ B站视频（`bilibili.com`、`b23.tv`）
- ✅ 知乎（`zhihu.com`、`zhuanlan.zhihu.com`）
- ✅ 小红书（`xiaohongshu.com`、`xhs.link`）

### 4.4 测试不同场景

| 场景 | 预期结果 |
|------|----------|
| 发送包含链接的消息 | 回复确认，发送邮件 |
| 发送不含链接的消息 | 回复"未检测到链接" |
| @机器人发送链接 | 正常处理 |
| 不@机器人发送链接 | 如果机器人在群里，也会收到 |
| 一次发送多个链接 | 每个链接单独发一封邮件 |

---

## Part 5: 本地测试

飞书保存请求地址时，会立刻发一条 `url_verification`，并要求 **3 秒内** 返回 `{"challenge":"..."}`。可以先在自己电脑上把同一套代码跑起来，再用隧道给飞书一个临时公网地址。

### 5.1 启动

```bash
cp .env.example .env
npm install
npm run dev
```

默认监听 `http://127.0.0.1:3000/api/webhook`。端口用环境变量 `PORT` 修改。

做明文校验时，`.env` 里的 `FEISHU_ENCRYPT_KEY` 先留空。这个值一旦写上，所有请求都必须带正确签名。

### 5.2 自己发一条 URL 校验

```bash
curl -s -X POST http://127.0.0.1:3000/api/webhook \
  -H 'Content-Type: application/json' \
  -d '{"type":"url_verification","challenge":"test-challenge"}'
```

正常会马上返回：

```json
{"challenge":"test-challenge"}
```

如果飞书后台已经生成了 Encrypt Key，真实的校验请求是加密的：外层只有 `{"encrypt":"..."}`，解密后才看得到 `challenge`。把同一个密钥写进 `FEISHU_ENCRYPT_KEY` 即可，本地服务和 Vercel 用的是同一段解密代码。

### 5.3 用隧道接到飞书

本机没有公网地址时，任选一个隧道，把 `3000` 端口暴露出去：

```bash
# Cloudflare
cloudflared tunnel --url http://127.0.0.1:3000

# ngrok
ngrok http 3000

# cpolar（国内网络常用）
cpolar http 3000
```

飞书「请求地址」填隧道给的 HTTPS 地址，路径仍然是 `/api/webhook`，例如 `https://xxxx.trycloudflare.com/api/webhook`。

---

## Part 6: 长连接模式（不需要公网地址）

飞书支持由你的程序主动连上去收事件（WebSocket）。这种方式没有请求地址，也不经过 `vercel.app`，大陆网络可以直接用。适合先在自己电脑上把收消息、发邮件跑通。进程关掉之后机器人就收不到消息，所以要一直开着，或者放到一台不关机的机器上。

### 6.1 启动

`.env` 里至少要有：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS`
- `TO_EMAIL`

然后：

```bash
npm install
npm run dev:ws
```

看到正在连接即可。国际版 Lark（`open.larksuite.com`）把 `FEISHU_DOMAIN` 设为 `lark`。

### 6.2 在飞书后台切换订阅方式

1. 打开应用的 **「事件与回调」**
2. 订阅方式选择 **「使用长连接接收事件」**（不要填请求网址）
3. **先保持上面的进程在运行**，再点保存。飞书会通过这条已经建立的连接做校验，进程不在线会保存失败
4. 添加事件 `im.message.receive_v1`
5. 按 Part 1 把应用发到可用版本，并加进群

长连接上的消息和 Webhook 走同一套提取链接、发邮件、回复飞书的逻辑。飞书若重推同一条消息，会按 `event_id` / `message_id` 丢掉重复邮件。

---

## Part 7: 绑定自定义域名（让大陆飞书访问 Vercel）

`*.vercel.app` 从大陆访问经常很慢或根本连不上。函数以前默认跑在美国 `iad1`，再叠加冷启动，飞书 3 秒超时很容易出现。本仓库的 `vercel.json` 已把函数区域设为香港 `hkg1`。区域只能缩短 Vercel 这一侧的距离，**不能**解决 `vercel.app` 这个域名在大陆的连通性问题。给项目绑一个自己的域名，必要时再套一层 Cloudflare，飞书才稳。

### 7.1 在 Vercel 添加域名

1. 打开 Vercel 项目 → **Settings** → **Domains**
2. 添加域名，例如 `bot.example.com`
3. 按页面提示增加一条 CNAME，目标一般是 `cname.vercel-dns.com`

### 7.2 用 Cloudflare 代理（大陆更稳）

1. 把域名的 DNS 接到 [Cloudflare](https://dash.cloudflare.com/)
2. 添加 CNAME：名称 `bot`，目标 `cname.vercel-dns.com`
3. 代理状态选 **已代理**（橙色云朵），不要选「仅 DNS」
4. SSL/TLS 模式设为 **Full (strict)**
5. 等证书生效后，在飞书请求地址填写 `https://bot.example.com/api/webhook`

这样飞书访问的是 Cloudflare，再由 Cloudflare 回源到香港的 Vercel 函数。

冷启动时第一次请求仍可能偏慢。校验失败就再保存一次，热实例通常就过了。不想依赖公网回调时，用 Part 6 的长连接。

---

## Part 8: 常见问题

### Q1: 飞书回调验证失败怎么办？

**错误表现**：保存请求地址时提示「请求3秒超时」或「请求地址校验失败」

「请求3秒超时」表示飞书在 3 秒内没有拿到 `{"challenge":"..."}`。常见原因是 `*.vercel.app` 从大陆访问不通、函数在美国（`iad1`）再加上冷启动。本仓库已把区域改为香港 `hkg1`，并保证校验请求只做解密和验签、不发邮件。大陆环境仍建议按 Part 7 绑自定义域名，或按 Part 5 / Part 6 在本机测试。

**排查步骤**：

1. **检查地址**
   - 确认是 `https://` 开头
   - 路径是 `/api/webhook`，不是 `/webhook`
   - 浏览器打开 `https://你的域名/api/webhook`，应返回 `{"ok":true,"service":"feishu-grok-bridge"}`

2. **Encrypt Key**
   - 飞书后台如果生成了 Encrypt Key，请求体是 `{"encrypt":"..."}`，必须把同一个值配到 `FEISHU_ENCRYPT_KEY`
   - 密钥为空时，飞书发的是明文，服务端不会尝试解密
   - 配了密钥却验签失败时，日志里会有「签名验证失败」。签名用的是原始报文，不能先转成对象再序列化

3. **Verification Token**
   - 只有配置了 `FEISHU_VERIFICATION_TOKEN` 才会校验
   - 值必须和飞书后台完全一致，多一个空格也会 403

4. **查看 Vercel 日志**
   - 项目 → **Deployments** → 最新部署 → **Functions** → `api/webhook`
   - 成功的校验日志是「URL 验证已应答」

5. **仍然超时**
   - 再点一次保存（避开冷启动）
   - 换成自定义域名，或改用长连接（Part 6）

### Q2: 邮件发送失败怎么排查？

**错误表现**：机器人回复确认，但邮箱没收到邮件

**排查步骤**：

1. **检查 SMTP 配置**
   - `SMTP_HOST` 应为 `smtp.qq.com`
   - `SMTP_PORT` 应为 `587`
   - `SMTP_USER` 是你的完整 QQ 邮箱地址
   - `SMTP_PASS` 是授权码，不是登录密码

2. **重新生成 QQ 邮箱授权码**
   - 进入 QQ 邮箱设置 → 账户
   - 关闭 SMTP 服务，再重新开启
   - 生成新的授权码，更新到 Vercel

3. **检查收件箱和垃圾邮件**
   - 邮件可能被归类到垃圾邮件
   - 在邮箱搜索 `"[待总结]"`

4. **查看 Vercel 日志**
   - 在日志中搜索 `[Mailer]` 相关日志
   - 查看具体的错误信息

### Q3: 机器人不回复消息？

**排查步骤**：

1. **检查权限配置**
   - 确认已添加 `im:message` 权限
   - 确认权限已申请发布

2. **检查应用发布状态**
   - 版本管理与发布 → 确认有已保存的版本
   - 如果没有，创建版本并保存

3. **检查机器人是否在群里**
   - 群设置 → 机器人 → 确认机器人在列表中

4. **查看 Vercel 日志**
   - 搜索 `[Webhook]` 相关日志
   - 查看是否有消息到达

### Q4: 如何查看 Vercel 日志？

**方法1：网页控制台**
1. 登录 [https://vercel.com](https://vercel.com)
2. 进入你的项目
3. 点击顶部 **"Deployments"**
4. 点击最新的部署条目
5. 点击 **"Functions"** 标签
6. 点击 `api/webhook`
7. 查看实时日志

**方法2：Vercel CLI**
```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 查看日志
vercel logs --json
```

### Q5: 修改配置后需要重新部署吗？

- **修改环境变量**：在 Vercel 保存后需要重新部署一次才会进到函数里
- **修改代码**：推送到 Git 后会自动部署

### Q6: 如何更新代码？

1. 修改本地代码
2. 提交到 GitHub：
   ```bash
   git add .
   git commit -m "更新说明"
   git push
   ```
3. Vercel 会自动检测到推送并重新部署

### Q7: 免费版 Vercel 有什么限制？

- Serverless Function 执行时间：最长 10 秒（Hobby 计划）
- 每月请求次数：100GB 带宽，125k 请求
- 对于个人使用完全足够

---

## 项目结构说明

```
feishu-grok-bridge/
├── api/
│   └── webhook.js          # Vercel 入口（Web Request）
├── lib/
│   ├── dispatch.js         # 解密、验签、立刻应答
│   ├── accept.js           # 按 event_id / message_id 去重并后台执行
│   ├── process-message.js  # 提取链接、发邮件、回复飞书
│   ├── lark.js             # 解密、验签、发送回复
│   ├── mailer.js           # nodemailer SMTP
│   ├── extractor.js        # 从文本中提取 URL
│   ├── dedupe.js           # 进程内去重
│   └── background.js       # Vercel waitUntil
├── scripts/
│   ├── dev-server.js       # npm run dev，本地 HTTP
│   ├── ws-client.js        # npm run dev:ws，长连接
│   └── load-env.js         # 读取 .env
├── test/webhook.test.js    # 明文 / 加密 URL 校验等
├── package.json
├── vercel.json             # 区域 hkg1
├── .env.example
└── README.md
```

## 技术栈

- **Runtime**: Node.js 20+（Vercel Functions，区域 `hkg1`）
- **飞书**: 事件解密与验签；长连接使用 `@larksuiteoapi/node-sdk` 的 `WSClient`
- **后台任务**: `@vercel/functions` 的 `waitUntil`（先返回 200，再发邮件和回复）
- **去重**: 按 `event_id` / `message_id` 记在进程内存里。本地服务和长连接可以稳定挡住飞书重试；Vercel 上只有落到同一个实例的重试会被丢掉
- **邮件**: nodemailer（SMTP）
- **部署**: Vercel

## 安全提示

1. **不要提交 .env 文件到 GitHub**
   - 本项目已包含 `.env.example`，但真实配置应在 Vercel 后台设置
   - 如果误提交，立即到飞书后台重置 App Secret 和 Encrypt Key

2. **保护 QQ 邮箱授权码**
   - 授权码等同于密码，不要泄露
   - 定期检查 QQ 邮箱登录记录

3. **飞书应用权限**
   - 只申请必要的权限
   - 不要在公开群聊中使用（除非你愿意让所有人使用）

## 更新日志

### v1.1.0
- 支持 Encrypt Key：AES-256-CBC 解密后再处理，包含 `url_verification`
- 可选校验 Verification Token
- 签名使用 HTTP 原始报文，而不是 `JSON.stringify(req.body)`
- 事件先返回 200，再用 `waitUntil` 发邮件和回复飞书
- 按 `event_id` / `message_id` 丢掉飞书重试，避免重复发信
- 函数区域改为香港 `hkg1`
- 增加 `npm run dev` 本地服务和 `npm run dev:ws` 长连接

### v1.0.0
- 初始版本
- 支持接收飞书消息
- 支持提取多种平台链接
- 支持 SMTP 邮件发送
- 支持飞书消息回复

---

如果还有问题，请检查 Vercel 日志，通常能找到具体原因。
