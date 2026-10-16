/**
 * 邮件发送模块
 * 使用 nodemailer 通过 SMTP 发送邮件
 */

const nodemailer = require('nodemailer');

/**
 * 发送包含链接的邮件
 * @param {string} toEmail - 收件人邮箱
 * @param {string} url - 提取到的链接
 * @param {string} sourceText - 原始消息文本
 * @returns {Promise<object>} - 发送结果
 */
async function sendLinkEmail(toEmail, url, sourceText) {
  // 从环境变量读取 SMTP 配置
  const smtpHost = process.env.SMTP_HOST || 'smtp.qq.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpUser || !smtpPass) {
    throw new Error('SMTP 配置不完整：请检查 SMTP_USER 和 SMTP_PASS 环境变量');
  }

  // 创建邮件传输器
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465, // 465端口使用SSL，587使用TLS
    tls: {
      rejectUnauthorized: false // QQ邮箱需要此配置
    },
    auth: {
      user: smtpUser,
      pass: smtpPass
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });

  // 验证连接
  await transporter.verify();

  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  // 发送邮件
  const info = await transporter.sendMail({
    from: `"飞书链接收集器" <${smtpUser}>`,
    to: toEmail,
    subject: `[待总结] 来自飞书的链接`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #3370ff; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f5f6f7; padding: 24px; border-radius: 0 0 8px 8px; }
    .link-box { background: white; padding: 16px; border-radius: 6px; margin: 16px 0; word-break: break-all; }
    .link-box a { color: #3370ff; text-decoration: none; }
    .meta { color: #8f959e; font-size: 13px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee0e3; }
  </style>
</head>
<body>
  <div class="header">
    <h2>🚀 新链接待总结</h2>
  </div>
  <div class="content">
    <p><strong>原始链接：</strong></p>
    <div class="link-box">
      <a href="${url}" target="_blank">${url}</a>
    </div>
    <p><strong>来源文本：</strong></p>
    <div class="link-box">${sourceText || '无'}</div>
    <div class="meta">
      <p>📨 发送时间：${now}</p>
      <p>🤖 由飞书机器人自动转发，等待 Grok 总结...</p>
    </div>
  </div>
</body>
</html>
    `,
    text: `新链接待总结\n\n原始链接：${url}\n来源文本：${sourceText || '无'}\n发送时间：${now}\n由飞书机器人自动转发，等待 Grok 总结...`
  });

  console.log(`[Mailer] 邮件已发送: ${info.messageId}`);
  return { success: true, messageId: info.messageId };
}

module.exports = { sendLinkEmail };
