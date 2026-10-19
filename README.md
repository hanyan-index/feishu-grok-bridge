# Feishu Grok Bridge

飞书机器人接收消息 → 提取链接 → SMTP 发送邮件到 QQ 邮箱 → 回复飞书确认。

这个仓库的主线跑在国内云服务器上，用一个常驻的 Node 进程收飞书事件。以前的 Vercel 版本在 `archive/vercel` 分支，不再更新。

飞书保存请求地址时要在 3 秒内拿到 `{"challenge":"..."}`。消息事件会先返回 200，再在同一进程里发邮件和回复，所以 SMTP 慢不会挡住这次应答。飞书重推同一条事件时，按 `event_id` / `message_id` 丢掉，避免重复发信。

---

## Part 1: 飞书应用创建

### 1.1 登录飞书开放平台

打开 [https://open.feishu.cn/](https://open.feishu.cn/)，用飞书账号登录。

### 1.2 创建企业自建应用

1. 进入 **开发者后台**
2. 点击 **创建企业自建应用**
3. 填写应用信息：
   - **应用名称**：`LinkToGrok`（或你喜欢的名字）
   - **应用描述**：`自动收集群聊链接并发送到邮箱等待 Grok 总结`
4. 点击 **确定创建**

### 1.3 记录应用凭证

1. 左侧点击 **凭证与基础信息**
2. 记下 **App ID** 和 **App Secret**，写进服务器上的 `.env`

### 1.4 开启机器人能力

1. 左侧点击 **机器人**
2. 打开 **启用机器人**
3. 填写机器人名称和描述，保存

### 1.5 配置权限

在 **权限管理** 里添加：

- `im:chat:readonly` — 读取会话信息
- `im:message` — 读取和发送消息
- `im:message.group_msg` — 读取群消息

添加后如需申请，按页面提示申请发布。

### 1.6 配置事件与回调

先把服务器和 HTTPS 地址准备好（见 Part 2），再回来填请求地址。加密可以现在就打开：

1. 左侧点击 **事件与回调**，打开 **启用事件**
2. **Encrypt Key**：重新生成后复制到 `FEISHU_ENCRYPT_KEY`。配置后请求体是 `{"encrypt":"..."}`，服务会先解密，并用原始报文校验 `X-Lark-Signature`
3. **Verification Token**：复制到 `FEISHU_VERIFICATION_TOKEN`（可选，填了就会校验事件里的 token）
4. 订阅方式先选 **将事件发送至开发者服务器**。不打算暴露公网地址时，改用 Part 5 的长连接
5. 添加事件 `im.message.receive_v1`
6. 请求地址先留空，等 Part 2 的 HTTPS 地址可用后再保存

### 1.7 发布应用并加进群

1. **版本管理与发布** → **创建版本** → 保存为可用版本
2. 打开目标群 → 设置 → 机器人 → 添加这个应用

---

## Part 2: 部署到国内云服务器

需要一台能从飞书访问的 Linux 服务器，Node.js 20 或更高版本。下面以目录 `/opt/feishu-grok-bridge` 为例。

### 2.1 安装代码

```bash
sudo mkdir -p /opt/feishu-grok-bridge
sudo chown "$USER" /opt/feishu-grok-bridge
git clone https://github.com/hanyan-index/feishu-grok-bridge.git /opt/feishu-grok-bridge
cd /opt/feishu-grok-bridge
npm install
cp .env.example .env
```

编辑 `.env`。`FEISHU_ENCRYPT_KEY` 留空时不解密、不验签；一旦填写，每个请求都必须带正确签名。

| 变量名 | 说明 |
|--------|------|
| `FEISHU_APP_ID` | 飞书 App ID |
| `FEISHU_APP_SECRET` | 飞书 App Secret |
| `FEISHU_ENCRYPT_KEY` | 事件加密密钥。留空则不解密、不验签 |
| `FEISHU_VERIFICATION_TOKEN` | Verification Token。留空则不校验 |
| `FEISHU_DOMAIN` | 留空或 `feishu` 表示飞书；国际版 Lark 填 `lark`。只在长连接时用到 |
| `HOST` | 监听地址。前面有反向代理时用 `127.0.0.1` |
| `PORT` | 监听端口，默认 `3000` |
| `SMTP_HOST` | 例如 `smtp.qq.com` |
| `SMTP_PORT` | QQ 邮箱用 `587` |
| `SMTP_USER` | 发件邮箱 |
| `SMTP_PASS` | 邮箱授权码，不是登录密码 |
| `TO_EMAIL` | 收件邮箱 |

QQ 邮箱授权码：网页版邮箱 → 设置 → 账户 → 开启 SMTP → 生成授权码。

先在服务器上确认进程能应答：

```bash
npm start
```

另一个终端：

```bash
curl -s http://127.0.0.1:3000/api/webhook
curl -s -X POST http://127.0.0.1:3000/api/webhook \
  -H 'Content-Type: application/json' \
  -d '{"type":"url_verification","challenge":"test-challenge"}'
```

第一条应返回 `{"ok":true,"service":"feishu-grok-bridge"}`。第二条应马上返回 `{"challenge":"test-challenge"}`。`.env` 里如果已经写了 Encrypt Key，这条明文请求会 403，这是预期行为。

### 2.2 用 systemd 常驻

`/etc/systemd/system/feishu-grok-bridge.service`：

```ini
[Unit]
Description=Feishu Grok Bridge
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/feishu-grok-bridge
EnvironmentFile=/opt/feishu-grok-bridge/.env
ExecStart=/usr/bin/node scripts/server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

`User` 改成实际运行账号，并保证它能读 `.env`。`node` 不在 `/usr/bin/node` 时，把 `ExecStart` 改成 `which node` 的结果。

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now feishu-grok-bridge
sudo systemctl status feishu-grok-bridge
journalctl -u feishu-grok-bridge -f
```

改了代码或 `.env` 之后执行 `sudo systemctl restart feishu-grok-bridge`。

### 2.3 用 pm2 常驻

已经在用 pm2 的机器可以不建 systemd：

```bash
cd /opt/feishu-grok-bridge
pm2 start npm --name feishu-grok-bridge -- start
pm2 save
pm2 startup
pm2 logs feishu-grok-bridge
```

pm2 不会自动加载 `.env`。可以在启动前 `set -a && source .env && set +a`，或使用 pm2 的 `--env` 配置。systemd 的 `EnvironmentFile` 更直接，二选一即可。

### 2.4 反向代理和 HTTPS

飞书的请求地址必须是公网 HTTPS。进程只监听 `127.0.0.1:3000`，由 Nginx 对外提供证书。

```nginx
server {
    listen 443 ssl;
    server_name bot.example.com;

    ssl_certificate     /etc/nginx/ssl/bot.example.com.pem;
    ssl_certificate_key /etc/nginx/ssl/bot.example.com.key;

    location /api/webhook {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

证书可以用云厂商的免费证书，或在这台机器上用 acme.sh / certbot 签发。域名的 A 记录指向这台服务器。安全组只放行 443（以及你自己用的 SSH），不要把 3000 端口暴露到公网。

改完执行 `sudo nginx -t && sudo systemctl reload nginx`。

---

## Part 3: 配置飞书回调地址

1. 回到飞书应用的 **事件与回调**
2. 请求地址填 `https://bot.example.com/api/webhook`（换成你的域名，路径保持 `/api/webhook`）
3. 保存。飞书会立刻发送 `url_verification`
4. 页面显示校验通过即可

校验失败时看 `journalctl -u feishu-grok-bridge` 或 `pm2 logs`：

- 没有「URL 验证已应答」：请求没到这台机器，查域名、证书、Nginx 和安全组
- 「解密失败」：`FEISHU_ENCRYPT_KEY` 和飞书后台不一致
- 「签名验证失败」：签名用的是 HTTP 原始报文。密钥不对，或多了空格，都会失败
- 「Verification Token 不匹配」：token 和环境变量不一致

消息事件即使邮件还在发，也会先返回 200。同一条消息的重试不会再发一封邮件。

---

## Part 4: 测试

在群里 @机器人并发送一个链接，例如：

```
@LinkToGrok 看看这个 https://www.douyin.com/video/123456
```

机器人应回复已收到链接并成功发信。QQ 邮箱里应有主题为 **[待总结] 来自飞书的链接** 的邮件。

支持提取的链接：

- 普通 http/https 链接
- 抖音（`www.iesdouyin.com`、`v.douyin.com`、`www.douyin.com`）。同一个视频只发一封
- 微信公众号（`mp.weixin.qq.com`）
- B 站（`bilibili.com`、`b23.tv`）
- 知乎（`zhihu.com`、`zhuanlan.zhihu.com`）
- 小红书（`xiaohongshu.com`、`xhs.link`）

| 场景 | 预期结果 |
|------|----------|
| 包含链接的消息 | 回复确认，发送邮件 |
| 不含链接的消息 | 回复「未检测到链接」 |
| 一次多条不同链接 | 每个链接一封邮件 |
| 飞书重推同一条消息 | 不再发第二封 |

---

## Part 5: 长连接（可选）

长连接由这台服务器主动连到飞书，不需要公网 URL，也不经过 Nginx。适合不想开放入站，或只在内网机器上收消息。进程关掉就收不到事件。

Webhook 和长连接是两种订阅方式，同一个应用只开一种。

`.env` 里要有 `FEISHU_APP_ID`、`FEISHU_APP_SECRET` 和 SMTP 配置，然后：

```bash
npm run dev:ws
```

保持进程在线，到飞书后台把订阅方式改成 **使用长连接接收事件**，再保存，并确认已经订阅 `im.message.receive_v1`。国际版 Lark 把 `FEISHU_DOMAIN` 设为 `lark`。

要用 systemd 托管长连接时，把服务里的 `ExecStart` 换成 `node scripts/ws-client.js`，单独建一个服务，不要和 Webhook 进程同时对同一个应用收事件。

---

## 常见问题

### 保存请求地址超时或校验失败

飞书只等 3 秒。本服务的校验只做解密和验签，不发邮件。仍然失败时：

1. 地址是 `https://域名/api/webhook`
2. 浏览器或 `curl` 访问 `https://域名/api/webhook` 能看到 `{"ok":true,...}`
3. Encrypt Key、Verification Token 和后台一致，没有多余空格
4. 看本机日志，而不是去别的平台查

### 邮件没收到

确认 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`（授权码）和 `TO_EMAIL`。也看一下垃圾箱。日志里搜索 `[Mailer]`。

### 机器人不回复

确认权限已发布、应用有可用版本、机器人在群里，并且日志里有这条消息。`FEISHU_APP_ID` 或 `FEISHU_APP_SECRET` 为空时，邮件仍可能发出，但回复会跳过。

### 更新代码

```bash
cd /opt/feishu-grok-bridge
git pull
npm install
sudo systemctl restart feishu-grok-bridge
```

用 pm2 时把最后一行换成 `pm2 restart feishu-grok-bridge`。

---

## 项目结构

```
feishu-grok-bridge/
├── scripts/
│   ├── server.js           # npm start，常驻 HTTP
│   ├── ws-client.js        # npm run dev:ws，长连接
│   └── load-env.js
├── lib/
│   ├── dispatch.js         # 解密、验签、立刻应答
│   ├── accept.js           # 去重后后台发信
│   ├── process-message.js  # 提取链接、发邮件、回复
│   ├── lark.js             # 解密、验签、回复消息
│   ├── mailer.js
│   ├── extractor.js
│   ├── dedupe.js
│   └── background.js
├── test/
├── package.json
├── .env.example
└── README.md
```

## 技术栈

- Node.js 20+ 常驻进程
- 飞书事件解密（AES-256-CBC）和原始报文验签
- 长连接使用 `@larksuiteoapi/node-sdk` 的 `WSClient`
- nodemailer SMTP

去重表在进程内存里。用 systemd 或 pm2 保持一个进程时，飞书重试不会重复发信。开了多个进程时，每个进程各有一份表。

## 安全

不要把 `.env` 提交到 Git。授权码和 App Secret 泄露后，到对应后台重置。

## 更新日志

### v1.2.0

- 主线改为国内云服务器上的常驻 Node 进程
- 去掉 Vercel 配置和 `@vercel/functions`。先返回 200，再在本进程里发信
- Vercel 版本保留在 `archive/vercel`

### v1.1.0

- Encrypt Key 解密、Verification Token、原始报文验签
- 按 `event_id` / `message_id` 去重
- 识别 `message_type`，并提取富文本里的链接
- 同一条抖音作品只发一封邮件
