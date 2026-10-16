/**
 * 飞书事件入口的纯逻辑。
 * 只依赖原始请求体和头，方便 Webhook 与本地服务共用。
 */

const { verifySign, decryptEvent, verifyToken } = require('./lark');
const { acceptMessageEvent } = require('./accept');

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8'
    }
  });
}

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleRequest(request) {
  const method = request.method || 'GET';
  if (method === 'GET') {
    return json(200, { ok: true, service: 'feishu-grok-bridge' });
  }
  if (method !== 'POST') {
    console.log(`[Webhook] 拒绝非 POST 请求: ${method}`);
    return json(405, { error: 'Method Not Allowed' });
  }

  const rawBody = await request.text();
  let path = '';
  try {
    path = new URL(request.url).pathname;
  } catch (error) {
    path = '';
  }
  console.log(`[Webhook] 收到请求: POST ${path} bytes=${Buffer.byteLength(rawBody)}`);

  let body;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    return json(400, { error: 'Invalid JSON' });
  }

  const encryptKey = process.env.FEISHU_ENCRYPT_KEY || '';
  const verificationToken = process.env.FEISHU_VERIFICATION_TOKEN || '';
  const timestamp = request.headers.get('x-lark-request-timestamp') || '';
  const nonce = request.headers.get('x-lark-request-nonce') || '';
  const signature = request.headers.get('x-lark-signature') || '';

  if (encryptKey) {
    if (!signature) {
      console.error('[Webhook] 已配置 Encrypt Key，但请求缺少签名');
      return json(403, { error: 'Missing signature' });
    }
    if (!verifySign(encryptKey, timestamp, nonce, rawBody, signature)) {
      console.error('[Webhook] 签名验证失败');
      return json(403, { error: 'Invalid signature' });
    }
  }

  if (body && typeof body.encrypt === 'string') {
    if (!encryptKey) {
      console.error('[Webhook] 收到加密负载，但未配置 FEISHU_ENCRYPT_KEY');
      return json(400, { error: 'Encrypted payload but FEISHU_ENCRYPT_KEY is not set' });
    }
    try {
      const plain = decryptEvent(body.encrypt, encryptKey);
      body = JSON.parse(plain);
    } catch (error) {
      console.error('[Webhook] 解密失败:', error.message);
      return json(400, { error: 'Failed to decrypt payload' });
    }
  }

  if (verificationToken && !verifyToken(body, verificationToken)) {
    console.error('[Webhook] Verification Token 不匹配');
    return json(403, { error: 'Invalid verification token' });
  }

  const eventType = body?.header?.event_type || body?.type || '';
  console.log(`[Webhook] 事件类型: ${eventType || 'unknown'}`);

  if (eventType === 'url_verification') {
    const challenge = body.challenge ?? body.event?.challenge;
    if (challenge === undefined || challenge === null) {
      return json(400, { error: 'Missing challenge' });
    }
    console.log('[Webhook] URL 验证已应答');
    return json(200, { challenge });
  }

  if (eventType === 'im.message.receive_v1') {
    const result = acceptMessageEvent(body, 'Webhook');
    if (result.duplicate) {
      return json(200, { status: 'ok', duplicate: true });
    }
    return json(200, { status: 'ok' });
  }

  console.log(`[Webhook] 未处理的事件类型: ${eventType || 'unknown'}`);
  return json(200, { status: 'ok' });
}

module.exports = { handleRequest };
