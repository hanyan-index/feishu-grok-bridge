const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { AESCipher } = require('@larksuiteoapi/node-sdk');

const { createServer } = require('../scripts/server');
const { createMessageDispatcher } = require('../scripts/ws-client');
const { decryptEvent } = require('../lib/lark');
const { clearDedupe } = require('../lib/dedupe');
const messages = require('../lib/process-message');
const mailer = require('../lib/mailer');
const lark = require('../lib/lark');

const ENV_KEYS = [
  'FEISHU_ENCRYPT_KEY',
  'FEISHU_VERIFICATION_TOKEN',
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'TO_EMAIL',
  'SMTP_USER',
  'SMTP_PASS'
];

describe('feishu webhook', { concurrency: 1 }, () => {
  let server;
  let port;
  let envBackup;
  const originalProcess = messages.processMessageEvent;
  const originalSend = mailer.sendLinkEmail;
  const originalReply = lark.sendReply;

  beforeEach(async () => {
    envBackup = {};
    for (const key of ENV_KEYS) envBackup[key] = process.env[key];
    for (const key of ENV_KEYS) delete process.env[key];
    clearDedupe();
    messages.processMessageEvent = originalProcess;
    mailer.sendLinkEmail = originalSend;
    lark.sendReply = originalReply;

    server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });

  afterEach(async () => {
    messages.processMessageEvent = originalProcess;
    mailer.sendLinkEmail = originalSend;
    lark.sendReply = originalReply;
    for (const key of ENV_KEYS) {
      if (envBackup[key] === undefined) delete process.env[key];
      else process.env[key] = envBackup[key];
    }
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(() => resolve()));
  });

  test('plaintext url_verification returns the challenge quickly', async () => {
    const raw = JSON.stringify({
      type: 'url_verification',
      challenge: 'plain-challenge-你好',
      token: 'ignored-when-unset'
    });
    const result = await post(port, raw);
    assert.equal(result.status, 200);
    assert.equal(result.json.challenge, 'plain-challenge-你好');
    assert.ok(result.elapsed < 1000, `plaintext challenge took ${result.elapsed}ms`);
  });

  test('encrypted url_verification returns the inner challenge quickly', async () => {
    const encryptKey = 'test-encrypt-key';
    process.env.FEISHU_ENCRYPT_KEY = encryptKey;
    const inner = {
      type: 'url_verification',
      challenge: 'encrypted-challenge-飞书',
      token: 'verification-token'
    };
    const raw = `{"encrypt":"${encryptFeishu(JSON.stringify(inner), encryptKey)}"}\n`;
    const result = await post(port, raw, signHeaders(encryptKey, raw));

    assert.equal(result.status, 200);
    assert.equal(result.json.challenge, 'encrypted-challenge-飞书');
    assert.ok(result.elapsed < 1000, `encrypted challenge took ${result.elapsed}ms`);
  });

  test('decrypt matches the official SDK cipher', () => {
    const encryptKey = 'sdk-compat-key';
    const plain = '{"type":"url_verification","challenge":"sdk-挑战"}';
    const encrypt = encryptFeishu(plain, encryptKey);
    assert.equal(decryptEvent(encrypt, encryptKey), plain);
    assert.equal(new AESCipher(encryptKey).decrypt(encrypt), plain);
  });

  test('signature is computed on the raw body, not JSON.stringify(parsed)', async () => {
    const encryptKey = 'sign-key';
    process.env.FEISHU_ENCRYPT_KEY = encryptKey;
    const raw = '{ "type" : "url_verification" , "challenge" : "spaced-challenge" }\n';
    const parsed = JSON.parse(raw);
    const canonical = JSON.stringify(parsed);
    assert.notEqual(canonical, raw);

    const wrong = await post(port, raw, signHeaders(encryptKey, canonical));
    assert.equal(wrong.status, 403);
    assert.equal(wrong.json.error, 'Invalid signature');

    const right = await post(port, raw, signHeaders(encryptKey, raw));
    assert.equal(right.status, 200);
    assert.equal(right.json.challenge, 'spaced-challenge');
  });

  test('schema 2.0 url_verification reads challenge from event', async () => {
    const raw = JSON.stringify({
      schema: '2.0',
      header: { event_type: 'url_verification', token: 't' },
      event: { challenge: 'schema-challenge' }
    });
    const result = await post(port, raw);
    assert.equal(result.status, 200);
    assert.equal(result.json.challenge, 'schema-challenge');
  });

  test('verification token is checked after decrypt when configured', async () => {
    const encryptKey = 'token-key';
    process.env.FEISHU_ENCRYPT_KEY = encryptKey;
    process.env.FEISHU_VERIFICATION_TOKEN = 'expected-token';

    const badInner = JSON.stringify({
      type: 'url_verification',
      challenge: 'nope',
      token: 'other-token'
    });
    const badRaw = JSON.stringify({ encrypt: encryptFeishu(badInner, encryptKey) });
    const bad = await post(port, badRaw, signHeaders(encryptKey, badRaw));
    assert.equal(bad.status, 403);
    assert.equal(bad.json.error, 'Invalid verification token');

    const goodInner = JSON.stringify({
      schema: '2.0',
      header: { event_type: 'url_verification', token: 'expected-token' },
      event: { challenge: 'token-ok' }
    });
    const goodRaw = JSON.stringify({ encrypt: encryptFeishu(goodInner, encryptKey) });
    const good = await post(port, goodRaw, signHeaders(encryptKey, goodRaw));
    assert.equal(good.status, 200);
    assert.equal(good.json.challenge, 'token-ok');
  });

  test('encrypt key requires a signature, and a bad ciphertext is rejected quickly', async () => {
    process.env.FEISHU_ENCRYPT_KEY = 'required-key';
    const missing = await post(port, JSON.stringify({
      type: 'url_verification',
      challenge: 'x'
    }));
    assert.equal(missing.status, 403);
    assert.ok(missing.elapsed < 1000);

    const raw = JSON.stringify({ encrypt: 'not-valid-ciphertext' });
    const failed = await post(port, raw, signHeaders('required-key', raw));
    assert.equal(failed.status, 400);
    assert.equal(failed.json.error, 'Failed to decrypt payload');
    assert.ok(failed.elapsed < 1000);
  });

  test('message events are acknowledged before background work finishes', async () => {
    let calls = 0;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    messages.processMessageEvent = () => {
      calls += 1;
      return gate;
    };

    const raw = JSON.stringify(messageBody('evt-slow', 'om_slow'));
    const started = Date.now();
    const result = await post(port, raw);
    const elapsed = Date.now() - started;

    assert.equal(result.status, 200);
    assert.equal(result.json.status, 'ok');
    assert.equal(calls, 1);
    assert.ok(elapsed < 400, `ack took ${elapsed}ms`);
    release();
    await gate;
  });

  test('retries with the same event_id or message_id do not send another email', async () => {
    let calls = 0;
    messages.processMessageEvent = async () => {
      calls += 1;
    };

    const first = JSON.stringify(messageBody('evt-1', 'om_1'));
    const sameEvent = JSON.stringify(messageBody('evt-1', 'om_other'));
    const sameMessage = JSON.stringify(messageBody('evt-other', 'om_1'));

    const a = await post(port, first);
    const b = await post(port, sameEvent);
    const c = await post(port, sameMessage);

    assert.equal(a.json.duplicate, undefined);
    assert.equal(b.json.duplicate, true);
    assert.equal(c.json.duplicate, true);
    assert.equal(calls, 1);
  });

  test('v2 text messages extract urls and rich-text hrefs are emailed once', async () => {
    process.env.TO_EMAIL = 'inbox@example.com';
    const sent = [];
    mailer.sendLinkEmail = async (_to, url) => {
      sent.push(url);
      return { messageId: 'mail-1' };
    };

    const textRaw = JSON.stringify({
      schema: '2.0',
      header: { event_id: 'evt-text', event_type: 'im.message.receive_v1', token: '' },
      event: {
        sender: { sender_id: { open_id: 'ou_1' } },
        message: {
          message_id: 'om_text',
          chat_id: 'oc_1',
          message_type: 'text',
          content: JSON.stringify({ text: '看看 https://www.douyin.com/video/123456' })
        }
      }
    });
    const textRes = await post(port, textRaw);
    assert.equal(textRes.status, 200);
    await waitFor(() => sent.length === 1);
    assert.deepEqual(sent, ['https://www.douyin.com/video/123456']);

    const postRaw = JSON.stringify({
      schema: '2.0',
      header: { event_id: 'evt-post', event_type: 'im.message.receive_v1' },
      event: {
        message: {
          message_id: 'om_post',
          chat_id: 'oc_1',
          message_type: 'post',
          content: JSON.stringify({
            zh_cn: {
              title: '一篇文章',
              content: [[{ tag: 'a', text: '打开', href: 'https://mp.weixin.qq.com/s/abc' }]]
            }
          })
        }
      }
    });
    await post(port, postRaw);
    await waitFor(() => sent.length === 2);
    assert.ok(sent.includes('https://mp.weixin.qq.com/s/abc'));
  });

  test('one iesdouyin share link sends one email', async () => {
    process.env.TO_EMAIL = 'inbox@example.com';
    const sent = [];
    mailer.sendLinkEmail = async (_to, url) => {
      sent.push(url);
      return { messageId: 'mail-ies' };
    };

    const share = 'https://www.iesdouyin.com/share/video/7696944600073768230/?region=CN&mid=1';
    const raw = JSON.stringify({
      schema: '2.0',
      header: { event_id: 'evt-ies', event_type: 'im.message.receive_v1', token: '' },
      event: {
        sender: { sender_id: { open_id: 'ou_1' } },
        message: {
          message_id: 'om_ies',
          chat_id: 'oc_1',
          message_type: 'text',
          content: JSON.stringify({ text: `复制打开抖音 ${share}` })
        }
      }
    });

    const result = await post(port, raw);
    assert.equal(result.status, 200);
    await waitFor(() => sent.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(sent, [share]);
  });

  test('long-connection dispatcher accepts a message without blocking on email', async () => {
    let calls = 0;
    messages.processMessageEvent = async () => {
      calls += 1;
    };
    const dispatcher = createMessageDispatcher();
    await dispatcher.invoke({
      schema: '2.0',
      header: {
        event_id: 'evt-ws',
        event_type: 'im.message.receive_v1',
        token: ''
      },
      event: {
        message: {
          message_id: 'om_ws',
          chat_id: 'oc_ws',
          message_type: 'text',
          content: JSON.stringify({ text: 'https://example.com/a' })
        }
      }
    }, { needCheck: false });

    await waitFor(() => calls === 1);
    await dispatcher.invoke({
      schema: '2.0',
      header: { event_id: 'evt-ws', event_type: 'im.message.receive_v1' },
      event: {
        message: {
          message_id: 'om_ws',
          message_type: 'text',
          content: JSON.stringify({ text: 'https://example.com/a' })
        }
      }
    }, { needCheck: false });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(calls, 1);
  });
});

function messageBody(eventId, messageId) {
  return {
    schema: '2.0',
    header: {
      event_id: eventId,
      event_type: 'im.message.receive_v1',
      token: ''
    },
    event: {
      message: {
        message_id: messageId,
        chat_id: 'oc_1',
        message_type: 'text',
        content: JSON.stringify({ text: 'https://example.com' })
      }
    }
  };
}

function signHeaders(encryptKey, rawBody) {
  const timestamp = '1710000000';
  const nonce = 'nonce-1';
  const signature = crypto
    .createHash('sha256')
    .update(timestamp + nonce + encryptKey + rawBody)
    .digest('hex');
  return {
    'x-lark-request-timestamp': timestamp,
    'x-lark-request-nonce': nonce,
    'x-lark-signature': signature
  };
}

function encryptFeishu(plain, encryptKey) {
  const key = crypto.createHash('sha256').update(encryptKey, 'utf8').digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString('base64');
}

async function post(port, rawBody, headers = {}) {
  const started = Date.now();
  const response = await fetch(`http://127.0.0.1:${port}/api/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: rawBody
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    json = { raw: text };
  }
  return { status: response.status, json, elapsed: Date.now() - started };
}

async function waitFor(predicate) {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('timed out waiting for background work');
}
