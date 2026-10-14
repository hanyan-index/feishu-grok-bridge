/**
 * 飞书相关工具模块
 * 包含验签和发送回复消息功能
 */

const crypto = require('crypto');

/**
 * 验证飞书请求签名
 * 签名算法：sha1(encrypt_key + timestamp + nonce + body)
 * @param {string} encryptKey - 飞书加密密钥
 * @param {string} timestamp - 请求头中的时间戳
 * @param {string} nonce - 请求头中的随机数
 * @param {string} body - 请求体原始字符串
 * @param {string} signature - 请求头中的签名
 * @returns {boolean} - 验证是否通过
 */
function verifySign(encryptKey, timestamp, nonce, body, signature) {
  if (!encryptKey || !signature) {
    console.log('[Lark] 跳过验签：加密密钥或签名为空');
    return true; // 如果没有配置密钥，跳过验签
  }

  // 按照用户指定的算法拼接字符串：encrypt_key + timestamp + nonce + body
  const signString = encryptKey + timestamp + nonce + body;

  // 计算 SHA1 签名
  const sha1Sign = crypto
    .createHash('sha1')
    .update(signString)
    .digest('hex');

  // 同时兼容飞书标准 HMAC-SHA256 算法（timestamp + "\n" + nonce + "\n" + body + "\n"）
  const standardSignString = `${timestamp}\n${nonce}\n${body}\n`;
  const hmacSha256Sign = crypto
    .createHmac('sha256', encryptKey)
    .update(standardSignString)
    .digest('hex');

  // 兼容多种算法
  const isValid = signature === sha1Sign || signature === hmacSha256Sign;

  if (!isValid) {
    console.log(`[Lark] 验签失败: sha1=${sha1Sign}, hmac256=${hmacSha256Sign}, got=${signature}`);
  } else {
    console.log('[Lark] 验签通过');
  }

  return isValid;
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
  getTenantAccessToken,
  sendReply
};
