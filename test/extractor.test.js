const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { extractUrls, dedupeSameWorkUrls } = require('../lib/extractor');
const { processMessageEvent } = require('../lib/process-message');
const mailer = require('../lib/mailer');

const IES = 'https://www.iesdouyin.com/share/video/7696944600073768230/?region=CN&mid=7530587953867934720&titleType=title';
const SHORT = 'https://v.douyin.com/share/video/7696944600073768230/';
const FAKE = 'https://douyin.com/share/video/7696944600073768230/?region=CN&mid=7530587953867934720&titleType=title';

describe('url extraction', () => {
  test('an iesdouyin share link is one url and never a fabricated douyin.com host', () => {
    const text = `7.64 复制打开抖音，看看【作品】${IES}`;
    const urls = extractUrls(text);

    assert.deepEqual(urls, [IES]);
    assert.equal(urls.some((url) => /^https?:\/\/douyin\.com\//i.test(url)), false);
  });

  test('a bare iesdouyin host is kept whole', () => {
    const urls = extractUrls('www.iesdouyin.com/share/video/7696944600073768230/?region=CN');
    assert.deepEqual(urls, [
      'https://www.iesdouyin.com/share/video/7696944600073768230/?region=CN'
    ]);
  });

  test('bare short links and ordinary site links still extract', () => {
    assert.deepEqual(extractUrls('看看 v.douyin.com/iJxxxxxx/ '), [
      'https://v.douyin.com/iJxxxxxx/'
    ]);
    assert.deepEqual(extractUrls('看看 https://www.douyin.com/video/123456'), [
      'https://www.douyin.com/video/123456'
    ]);
    assert.deepEqual(extractUrls('mp.weixin.qq.com/s/abc'), [
      'https://mp.weixin.qq.com/s/abc'
    ]);
    assert.deepEqual(extractUrls('zhuanlan.zhihu.com/p/123'), [
      'https://zhuanlan.zhihu.com/p/123'
    ]);
    assert.deepEqual(extractUrls('https://b23.tv/abcd'), [
      'https://b23.tv/abcd'
    ]);
  });

  test('host patterns do not match inside a longer label', () => {
    assert.deepEqual(extractUrls('notbilibili.com/video/BV1xx'), []);
    assert.deepEqual(extractUrls('evilzhihu.com/p/1'), []);
    assert.deepEqual(extractUrls('notxiaohongshu.com/explore/abc'), []);
    assert.deepEqual(extractUrls('https://www.bilibili.com/video/BV1xx'), [
      'https://www.bilibili.com/video/BV1xx'
    ]);
    assert.deepEqual(extractUrls('https://www.xiaohongshu.com/explore/abc'), [
      'https://www.xiaohongshu.com/explore/abc'
    ]);
  });
});

describe('same douyin work', { concurrency: 1 }, () => {
  const originalSend = mailer.sendLinkEmail;
  const envBackup = {};

  afterEach(() => {
    mailer.sendLinkEmail = originalSend;
    if (envBackup.TO_EMAIL === undefined) delete process.env.TO_EMAIL;
    else process.env.TO_EMAIL = envBackup.TO_EMAIL;
  });

  test('keeps the iesdouyin url when a short link and a bare host share the id', () => {
    const urls = dedupeSameWorkUrls([
      FAKE,
      SHORT,
      IES,
      'https://www.douyin.com/note/8888888888888888888',
      'https://www.iesdouyin.com/share/note/8888888888888888888',
      'https://v.douyin.com/share/slides/7777777777777777777/',
      'https://douyin.com/share/slides/7777777777777777777/'
    ]);

    assert.deepEqual(urls, [
      IES,
      'https://www.iesdouyin.com/share/note/8888888888888888888',
      'https://v.douyin.com/share/slides/7777777777777777777/'
    ]);
  });

  test('a short link and the expanded iesdouyin link send one email', async () => {
    envBackup.TO_EMAIL = process.env.TO_EMAIL;
    process.env.TO_EMAIL = 'inbox@example.com';
    const sent = [];
    mailer.sendLinkEmail = async (_to, url) => {
      sent.push(url);
      return { messageId: 'mail-same' };
    };

    const result = await processMessageEvent(textMessage(
      'evt-same-aweme',
      'om_same_aweme',
      `复制打开抖音 ${SHORT} ${IES}`
    ));

    assert.equal(result.emails_sent, 1);
    assert.equal(result.urls_found, 1);
    assert.deepEqual(sent, [IES]);
  });

  test('different aweme ids are still emailed separately', async () => {
    envBackup.TO_EMAIL = process.env.TO_EMAIL;
    process.env.TO_EMAIL = 'inbox@example.com';
    const sent = [];
    mailer.sendLinkEmail = async (_to, url) => {
      sent.push(url);
      return { messageId: 'mail-two' };
    };

    const other = 'https://www.douyin.com/video/1111111111111111111';
    const result = await processMessageEvent(textMessage(
      'evt-two-aweme',
      'om_two_aweme',
      `${IES} ${other}`
    ));

    assert.equal(result.emails_sent, 2);
    assert.deepEqual(sent, [IES, other]);
  });
});

function textMessage(eventId, messageId, text) {
  return {
    schema: '2.0',
    header: {
      event_id: eventId,
      event_type: 'im.message.receive_v1',
      token: ''
    },
    event: {
      sender: { sender_id: { open_id: 'ou_1' } },
      message: {
        message_id: messageId,
        chat_id: 'oc_1',
        message_type: 'text',
        content: JSON.stringify({ text })
      }
    }
  };
}
