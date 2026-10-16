/**
 * 飞书长连接模式。由本机主动连到飞书，不需要公网回调地址。
 *
 *   npm run dev:ws
 *
 * 启动后到开放平台把订阅方式改成「使用长连接接收事件」，并保持这个进程在线再保存。
 */

const { loadEnv } = require('./load-env');
const { acceptMessageEvent } = require('../lib/accept');

function createMessageDispatcher(lark = require('@larksuiteoapi/node-sdk')) {
  return new lark.EventDispatcher({
    encryptKey: process.env.FEISHU_ENCRYPT_KEY || '',
    verificationToken: process.env.FEISHU_VERIFICATION_TOKEN || '',
    loggerLevel: lark.LoggerLevel.warn
  }).register({
    'im.message.receive_v1': async (data) => {
      acceptMessageEvent(data, 'WS');
    }
  });
}

function domainFor(lark) {
  return String(process.env.FEISHU_DOMAIN || '').toLowerCase() === 'lark'
    ? lark.Domain.Lark
    : lark.Domain.Feishu;
}

async function main() {
  loadEnv();
  const lark = require('@larksuiteoapi/node-sdk');
  const appId = process.env.FEISHU_APP_ID || '';
  const appSecret = process.env.FEISHU_APP_SECRET || '';

  if (!appId || !appSecret) {
    console.error('[WS] 请先在 .env 里配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
    process.exit(1);
  }
  if (!/^cli_[0-9a-fA-F]{16}$/.test(appId)) {
    console.error('[WS] FEISHU_APP_ID 格式应为 cli_ 加 16 位十六进制字符');
    process.exit(1);
  }

  const eventDispatcher = createMessageDispatcher(lark);
  const wsClient = new lark.WSClient({
    appId,
    appSecret,
    domain: domainFor(lark),
    loggerLevel: lark.LoggerLevel.info
  });

  const shutdown = () => {
    console.log('[WS] 正在关闭长连接');
    wsClient.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('[WS] 正在连接飞书长连接...');
  await wsClient.start({ eventDispatcher });
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[WS] 启动失败:', error);
    process.exit(1);
  });
}

module.exports = { createMessageDispatcher };
