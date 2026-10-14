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
4. **加密密钥**：
   - 点击 **"重新生成"** 按钮
   - 系统会生成一个 Encrypt Key
   - **复制保存这个密钥**，后面会用到
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
| `FEISHU_ENCRYPT_KEY` | `xxxxxxxx` | 飞书事件订阅的加密密钥 |
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

## Part 5: 常见问题

### Q1: 飞书回调验证失败怎么办？

**错误表现**：保存请求地址时提示"请求地址校验失败"

**排查步骤**：

1. **检查域名拼写**
   - 确认是 `https://` 开头，不是 `http://`
   - 确认路径是 `/api/webhook`，不是 `/webhook`

2. **检查 Vercel 部署状态**
   - 访问你的域名 `https://xxx.vercel.app`
   - 如果显示 404，说明部署有问题
   - 回到 Vercel 重新部署

3. **查看 Vercel 日志**
   - 登录 Vercel，进入项目
   - 点击顶部 **"Deployments"**
   - 点击最新的部署
   - 点击 **"Functions"** → **"api/webhook"**
   - 查看日志是否有错误

4. **检查环境变量**
   - 确认 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 已配置
   - 确认没有多余的空格

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

- **修改环境变量**：不需要重新部署，Vercel 会自动更新
- **修改代码**：需要重新部署（Git 推送后会自动部署）

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
│   ├── webhook.js          # 主入口：接收飞书消息推送
│   ├── lib/
│   │   ├── lark.js         # 飞书相关：验签、发送回复消息
│   │   ├── mailer.js       # 邮件发送：nodemailer SMTP
│   │   └── extractor.js    # 链接提取：从文本中提取URL
├── package.json            # 项目配置和依赖
├── vercel.json             # Vercel 部署配置
├── .env.example            # 环境变量示例
└── README.md               # 本文件
```

## 技术栈

- **Runtime**: Node.js 18+（Vercel Serverless Function）
- **邮件**: nodemailer（SMTP）
- **HTTP**: Node.js 原生 fetch
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

### v1.0.0
- 初始版本
- 支持接收飞书消息
- 支持提取多种平台链接
- 支持 SMTP 邮件发送
- 支持飞书消息回复

---

如果还有问题，请检查 Vercel 日志，通常能找到具体原因。
