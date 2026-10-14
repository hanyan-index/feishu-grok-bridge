/**
 * 飞书机器人 Webhook 入口
 * 接收飞书事件推送，提取链接并发送邮件
 */

const { verifySign, sendReply } = require('./lib/lark');
const { sendLinkEmail } = require('./lib/mailer');
const { extractUrls } = require('./lib/extractor');

/**
 * Vercel Serverless Function 主处理函数
 */
module.exports = async function handler(req, res) {
  console.log(`[Webhook] 收到请求: ${req.method} ${req.url}`);

  // 只允许 POST 请求
  if (req.method !== 'POST') {
    console.log('[Webhook] 拒绝非POST请求');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 获取请求体原始字符串（用于验签）
    const rawBody = JSON.stringify(req.body);
    const body = req.body;

    console.log(`[Webhook] 请求体: ${rawBody.substring(0, 500)}`);

    // 1. 验签
    const encryptKey = process.env.FEISHU_ENCRYPT_KEY || '';
    const timestamp = req.headers['x-lark-request-timestamp'] || '';
    const nonce = req.headers['x-lark-request-nonce'] || '';
    const signature = req.headers['x-lark-signature'] || '';

    if (encryptKey && signature) {
      const isValid = verifySign(encryptKey, timestamp, nonce, rawBody, signature);
      if (!isValid) {
        console.error('[Webhook] 签名验证失败');
        return res.status(403).json({ error: 'Invalid signature' });
      }
    }

    // 2. 处理事件类型
    const eventType = body.header?.event_type || body.type;
    console.log(`[Webhook] 事件类型: ${eventType}`);

    // 2.1 URL 验证（飞书配置回调时的验证请求）
    if (eventType === 'url_verification') {
      console.log('[Webhook] 处理 URL 验证');
      const challenge = body.challenge || body.event?.challenge;
      return res.status(200).json({
        challenge
      });
    }

    // 2.2 消息接收事件
    if (eventType === 'im.message.receive_v1') {
      return await handleMessageEvent(body, res);
    }

    // 其他事件类型，直接返回成功
    console.log(`[Webhook] 未处理的事件类型: ${eventType}`);
    return res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('[Webhook] 处理请求时发生错误:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};

/**
 * 处理消息接收事件
 * @param {object} body - 请求体
 * @param {object} res - HTTP 响应对象
 */
async function handleMessageEvent(body, res) {
  try {
    // 提取消息信息
    const event = body.event;
    const message = event?.message;

    if (!message) {
      console.log('[Webhook] 消息体为空');
      return res.status(200).json({ status: 'ok' });
    }

    const messageId = message.message_id;
    const chatId = message.chat_id;
    const sender = event.sender?.sender_id?.open_id || 'unknown';

    console.log(`[Webhook] 收到消息: id=${messageId}, chat=${chatId}, sender=${sender}`);

    // 解析消息内容（content 是 JSON 字符串，需要二次解析）
    let content;
    try {
      content = JSON.parse(message.content || '{}');
    } catch (e) {
      console.log('[Webhook] 消息内容解析失败，使用原始内容');
      content = { text: message.content || '' };
    }

    // 获取消息文本
    let messageText = '';
    if (message.msg_type === 'text') {
      messageText = content.text || '';
    } else if (message.msg_type === 'post') {
      // 富文本消息，提取文本内容
      messageText = extractTextFromPost(content) || '';
    }

    console.log(`[Webhook] 消息文本: ${messageText.substring(0, 200)}`);

    // 3. 提取链接
    const urls = extractUrls(messageText);
    console.log(`[Webhook] 提取到 ${urls.length} 个链接: ${urls.join(', ')}`);

    // 4. 如果没有链接，回复提示
    if (urls.length === 0) {
      await replyToFeishu(messageId, '未检测到链接，请发送包含链接的消息 🙏');
      return res.status(200).json({ status: 'ok', message: 'no_url_found' });
    }

    // 5. 发送邮件
    const toEmail = process.env.TO_EMAIL;
    if (!toEmail) {
      console.error('[Webhook] 未配置收件人邮箱 (TO_EMAIL)');
      await replyToFeishu(messageId, '系统配置错误：未设置收件人邮箱 ⚠️');
      return res.status(200).json({ status: 'ok', message: 'email_not_configured' });
    }

    const sendResults = [];
    for (const url of urls) {
      try {
        const result = await sendLinkEmail(toEmail, url, messageText);
        sendResults.push({ url, success: true, messageId: result.messageId });
        console.log(`[Webhook] 邮件发送成功: ${url}`);
      } catch (emailError) {
        sendResults.push({ url, success: false, error: emailError.message });
        console.error(`[Webhook] 邮件发送失败 (${url}):`, emailError.message);
      }
    }

    // 6. 回复飞书确认
    const successCount = sendResults.filter(r => r.success).length;
    if (successCount > 0) {
      const replyText = `已收到 ${urls.length} 个链接，已成功发送 ${successCount} 封邮件到邮箱等待 Grok 总结 🚀`;
      await replyToFeishu(messageId, replyText);
    } else {
      await replyToFeishu(messageId, '链接提取成功，但邮件发送失败，请检查配置 ⚠️');
    }

    return res.status(200).json({
      status: 'ok',
      urls_found: urls.length,
      emails_sent: successCount
    });

  } catch (error) {
    console.error('[Webhook] 处理消息事件失败:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * 回复飞书消息
 * @param {string} messageId - 原消息ID
 * @param {string} text - 回复文本
 */
async function replyToFeishu(messageId, text) {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    console.error('[Webhook] 飞书应用配置不完整，无法回复');
    return;
  }

  try {
    await sendReply(appId, appSecret, messageId, text);
  } catch (error) {
    console.error('[Webhook] 回复飞书消息失败:', error.message);
  }
}

/**
 * 从富文本消息中提取纯文本
 * @param {object} postContent - 富文本内容
 * @returns {string} - 提取的文本
 */
function extractTextFromPost(postContent) {
  if (!postContent || !postContent.content) return '';
  
  let text = '';
  const content = postContent.content;
  
  // 遍历所有段落
  for (const paragraph of (content || [])) {
    for (const element of (paragraph || [])) {
      if (typeof element === 'string') {
        text += element;
      } else if (element.text) {
        text += element.text;
      } else if (element.tag === 'text' && element.text) {
        text += element.text;
      }
    }
    text += '\n';
  }
  
  return text.trim();
}
