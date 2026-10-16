/**
 * 飞书相关工具模块
 * 包含验签和发送回复消息功能
 */

const crypto = require('crypto');

/**
 * 校验飞书签名。
 * 算法：sha256(timestamp + nonce + encryptKey + 原始请求体字节)。
 * rawBody 必须是 HTTP 报文原文，不能是 JSON.stringify(JSON.parse(body))。
 * @param {string} encryptKey
 * @param {string} timestamp
 * @param {string} nonce
 * @param {string} rawBody
 * @param {string} signature
 * @returns {boolean}
 */
function verifySign(encryptKey, timestamp, nonce, rawBody, signature) {
  if (!encryptKey || !signature || rawBody == null) {
    return false;
  }

  const expected = crypto
    .createHash('sha256')
    .update(String(timestamp), 'utf8')
    .update(String(nonce), 'utf8')
    .update(String(encryptKey), 'utf8')
    .update(String(rawBody), 'utf8')
    .digest('hex');

  const ok = safeEqual(String(signature).toLowerCase(), expected);
  if (ok) {
    console.log('[Lark] 验签通过');
  } else {
    console.log('[Lark] 验签失败');
  }
  return ok;
}

/**
 * 解密飞书 Encrypt Key 负载。
 * key = SHA256(encryptKey)，IV 为密文前 16 字节，其余为 AES-256-CBC。
 * @param {string} encrypt base64(iv + ciphertext)
 * @param {string} encryptKey
 * @returns {string} UTF-8 明文
 */
function decryptEvent(encrypt, encryptKey) {
  if (!encrypt || !encryptKey) {
    throw new Error('缺少密文或 Encrypt Key');
  }

  const key = crypto.createHash('sha256').update(String(encryptKey), 'utf8').digest();
  const encrypted = Buffer.from(encrypt, 'base64');
  if (encrypted.length <= 16) {
    throw new Error('密文长度不足');
  }

  const iv = encrypted.subarray(0, 16);
  const data = encrypted.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString('utf8');
}

/**
 * 读取事件里的 Verification Token（v1 在顶层，v2 在 header）。
 * @param {object} body
 * @returns {string}
 */
function readVerificationToken(body) {
  if (!body || typeof body !== 'object') return '';
  if (body.header && typeof body.header.token === 'string') return body.header.token;
  if (typeof body.token === 'string') return body.token;
  return '';
}

/**
 * 配置了 FEISHU_VERIFICATION_TOKEN 时校验请求来源。
 * @param {object} body 解密后的事件
 * @param {string} expected
 * @returns {boolean}
 */
function verifyToken(body, expected) {
  if (!expected) return true;
  return safeEqual(readVerificationToken(body), expected);
}

function safeEqual(actual, expected) {
  const left = Buffer.from(String(actual), 'utf8');
  const right = Buffer.from(String(expected), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * 获取飞书 tenant_access_token
 * @param {string} appId - 飞书应用ID
 * @param {string} appSecret - 飞书应用Secret
 * @returns {Promise<string>} - tenant_access_token
 */
async function getTenantAccessToken(appId, appSecret) {
  const url = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret
    })
  });

  const data = await response.json();
  
  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`获取 tenant_access_token 失败: ${JSON.stringify(data)}`);
  }

  console.log('[Lark] 获取 tenant_access_token 成功');
  return data.tenant_access_token;
}

/**
 * 发送回复消息
 * @param {string} appId - 飞书应用ID
 * @param {string} appSecret - 飞书应用Secret
 * @param {string} messageId - 要回复的消息ID
 * @param {string} content - 回复文本内容
 * @returns {Promise<object>} - 发送结果
 */
async function sendReply(appId, appSecret, messageId, content) {
  if (!appId || !appSecret) {
    throw new Error('飞书应用配置不完整：请检查 FEISHU_APP_ID 和 FEISHU_APP_SECRET 环境变量');
  }

  // 获取访问令牌
  const token = await getTenantAccessToken(appId, appSecret);

  // 构建回复接口URL
  const url = `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reply`;

  // 构建消息体（富文本格式）
  const messageBody = {
    content: JSON.stringify({
      text: content
    }),
    msg_type: 'text'
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(messageBody)
  });

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`发送回复消息失败: ${JSON.stringify(data)}`);
  }

  console.log(`[Lark] 回复消息发送成功: msg_id=${data.data?.message_id}`);
  return data.data;
}

module.exports = {
  verifySign,
  decryptEvent,
  verifyToken,
  readVerificationToken,
  getTenantAccessToken,
  sendReply
};
