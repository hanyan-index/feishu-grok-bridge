/**
 * 从飞书消息里抽出链接，发邮件，再回复飞书。
 * Webhook 和长连接共用这一段，调用方负责先把 HTTP 响应发出去。
 */

const mailer = require('./mailer');
const lark = require('./lark');
const { extractUrls } = require('./extractor');

/**
 * 把 webhook 报文或 SDK 回调数据收成同一种形状。
 * SDK 会把 header 和 event 摊平到同一层。
 * @param {object} payload
 * @returns {object|null}
 */
function normalizeMessageBody(payload) {
  if (!payload || typeof payload !== 'object') return null;

  if (payload.event && payload.event.message) {
    return payload;
  }

  if (payload.message) {
    return {
      header: {
        event_id: payload.event_id || payload.header?.event_id || '',
        event_type: payload.event_type || payload.header?.event_type || 'im.message.receive_v1',
        token: payload.token || payload.header?.token || ''
      },
      event: {
        sender: payload.sender,
        message: payload.message
      }
    };
  }

  return null;
}

function messageTextFrom(message) {
  const raw = typeof message.content === 'string' ? message.content : '';
  let content;
  try {
    content = raw ? JSON.parse(raw) : {};
  } catch (error) {
    return raw;
  }

  const msgType = message.message_type || message.msg_type || '';
  if (msgType === 'text') {
    return content.text || raw;
  }
  if (msgType === 'post' || content.content || content.zh_cn || content.en_us) {
    return extractTextFromPost(content) || raw;
  }
  if (typeof content.text === 'string' && content.text) return content.text;
  return raw;
}

function extractTextFromPost(postContent) {
  const parts = [];
  for (const root of collectPostRoots(postContent)) {
    if (root.title) parts.push(String(root.title));
    for (const paragraph of root.content || []) {
      const line = [];
      for (const element of paragraph || []) {
        if (typeof element === 'string') {
          line.push(element);
          continue;
        }
        if (!element || typeof element !== 'object') continue;
        if (element.text) line.push(String(element.text));
        if (element.href) line.push(String(element.href));
      }
      if (line.length) parts.push(line.join(' '));
    }
  }
  return parts.join('\n').trim();
}

function collectPostRoots(postContent) {
  if (!postContent || typeof postContent !== 'object') return [];
  const roots = [];
  if (Array.isArray(postContent.content)) roots.push(postContent);
  for (const key of ['zh_cn', 'en_us', 'ja_jp']) {
    const localized = postContent[key];
    if (localized && Array.isArray(localized.content)) roots.push(localized);
  }
  return roots;
}

async function replyToFeishu(messageId, text) {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appId || !appSecret || !messageId) {
    console.error('[Webhook] 飞书应用配置不完整，无法回复');
    return;
  }

  try {
    await lark.sendReply(appId, appSecret, messageId, text);
  } catch (error) {
    console.error('[Webhook] 回复飞书消息失败:', error.message);
  }
}

/**
 * @param {object} payload webhook 报文或已规范化的消息体
 * @returns {Promise<object>}
 */
async function processMessageEvent(payload) {
  const body = normalizeMessageBody(payload) || payload;
  const event = body?.event;
  const message = event?.message;

  if (!message) {
    console.log('[Webhook] 消息体为空');
    return { status: 'empty' };
  }

  const messageId = message.message_id;
  const chatId = message.chat_id;
  const sender = event.sender?.sender_id?.open_id || 'unknown';
  console.log(`[Webhook] 收到消息: id=${messageId}, chat=${chatId}, sender=${sender}`);

  const messageText = messageTextFrom(message);
  console.log(`[Webhook] 消息文本: ${messageText.substring(0, 200)}`);

  const urls = extractUrls(messageText);
  console.log(`[Webhook] 提取到 ${urls.length} 个链接: ${urls.join(', ')}`);

  if (urls.length === 0) {
    await replyToFeishu(messageId, '未检测到链接，请发送包含链接的消息 🙏');
    return { status: 'no_url_found' };
  }

  const toEmail = process.env.TO_EMAIL;
  if (!toEmail) {
    console.error('[Webhook] 未配置收件人邮箱 (TO_EMAIL)');
    await replyToFeishu(messageId, '系统配置错误：未设置收件人邮箱 ⚠️');
    return { status: 'email_not_configured' };
  }

  const sendResults = [];
  for (const url of urls) {
    try {
      const result = await mailer.sendLinkEmail(toEmail, url, messageText);
      sendResults.push({ url, success: true, messageId: result.messageId });
      console.log(`[Webhook] 邮件发送成功: ${url}`);
    } catch (emailError) {
      sendResults.push({ url, success: false, error: emailError.message });
      console.error(`[Webhook] 邮件发送失败 (${url}):`, emailError.message);
    }
  }

  const successCount = sendResults.filter((item) => item.success).length;
  if (successCount > 0) {
    await replyToFeishu(
      messageId,
      `已收到 ${urls.length} 个链接，已成功发送 ${successCount} 封邮件到邮箱等待 Grok 总结 🚀`
    );
  } else {
    await replyToFeishu(messageId, '链接提取成功，但邮件发送失败，请检查配置 ⚠️');
  }

  return {
    status: 'ok',
    urls_found: urls.length,
    emails_sent: successCount
  };
}

module.exports = {
  normalizeMessageBody,
  messageTextFrom,
  processMessageEvent
};
