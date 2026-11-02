const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { extractUrls, dedupeSameWorkUrls, extractDouyinShareCodes } = require('../lib/extractor');
const { processMessageEvent } = require('../lib/process-message');
const mailer = require('../lib/mailer');
const lark = require('../lib/lark');

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

const ARTICLE_SS = '1-E 12/14 e@B.tr :9pm 【折腾了整整1年，毫无保留地分享一下我这套Agent自动化系:/ 统】长按复制打开抖音，即可阅读文章 ŠŠ8eOLgPfUR3b9※※';
const ARTICLE_ANGLE = '8:/ h@O.kP 05/21 【生意场上，装逼就是节省沟通成本】长按复制打开抖音，即可阅读文章 ︽︽2QnCB9aIZZ29︽︽';
const VIDEO_HASH = '7- 02/16 a@n.DU 长按复制此条消息，打开抖音查看精彩:/ 内容##VC5fEvSQwI8##[抖音口令]';
const VIDEO_WITH_URL = '7.32 复制打开抖音，看看【杨大哥的作品】千问 3.8 预览版发布 https://v.douyin.com/G8Oggg_IXMA/ E@u.Ib 03/09 复制此链接，打开Dou音搜索，直接观看视频！';

describe('douyin share codes', { concurrency: 1 }, () => {
  const originalSend = mailer.sendLinkEmail;
  const originalReply = lark.sendReply;
  const envKeys = ['TO_EMAIL', 'FEISHU_APP_ID', 'FEISHU_APP_SECRET'];
  const envBackup = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

  afterEach(() => {
    mailer.sendLinkEmail = originalSend;
    lark.sendReply = originalReply;
    for (const key of envKeys) {
      if (envBackup[key] === undefined) delete process.env[key];
      else process.env[key] = envBackup[key];
    }
  });

  test('article codes in ŠŠ and ︽︽ yield a token and no url', () => {
    assert.deepEqual(extractUrls(ARTICLE_SS), []);
    assert.deepEqual(extractDouyinShareCodes(ARTICLE_SS), [
      { token: '8eOLgPfUR3b9', pseudoUrl: 'douyin-share://code/8eOLgPfUR3b9' }
    ]);
    assert.deepEqual(extractUrls(ARTICLE_ANGLE), []);
    assert.deepEqual(extractDouyinShareCodes(ARTICLE_ANGLE), [
      { token: '2QnCB9aIZZ29', pseudoUrl: 'douyin-share://code/2QnCB9aIZZ29' }
    ]);
  });

  test('a spaced cue, a zero-width token, and a hash video code still match', () => {
    const spaced = '长按复制打开抖 音，即可阅读文章 ŠŠ\u200b8eOLgPfUR3b9※※';
    assert.deepEqual(extractDouyinShareCodes(spaced), [
      { token: '8eOLgPfUR3b9', pseudoUrl: 'douyin-share://code/8eOLgPfUR3b9' }
    ]);
    assert.deepEqual(extractUrls(VIDEO_HASH), []);
    assert.deepEqual(extractDouyinShareCodes(VIDEO_HASH), [
      { token: 'VC5fEvSQwI8', pseudoUrl: 'douyin-share://code/VC5fEvSQwI8' }
    ]);
  });

  test('brackets without a douyin cue are ignored', () => {
    assert.deepEqual(extractDouyinShareCodes('ŠŠ8eOLgPfUR3b9※※'), []);
    assert.deepEqual(extractDouyinShareCodes('备注 ##ABCDEF##'), []);
    assert.deepEqual(extractDouyinShareCodes('长按复制打开抖音，即可阅读文章'), []);
  });

  test('the sample article code emails the original text and the pseudo link', async () => {
    const { sent, replies } = armShareMail();
    const result = await processMessageEvent(textMessage('evt-share-ss', 'om_share_ss', ARTICLE_SS));

    assert.equal(result.status, 'ok');
    assert.equal(result.share_codes_found, 1);
    assert.equal(result.emails_sent, 1);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'inbox@example.com');
    assert.equal(sent[0].url, 'douyin-share://code/8eOLgPfUR3b9');
    assert.equal(sent[0].sourceText, ARTICLE_SS);

    const parts = mailer.buildLinkEmailParts(sent[0].url, sent[0].sourceText, '2026-11-02 14:00:00');
    assert.equal(parts.subject, '[待总结] 来自飞书的链接');
    assert.match(parts.text, /^新链接待总结\n\n原始链接：douyin-share:\/\/code\/8eOLgPfUR3b9\n来源文本：/);
    assert.ok(parts.text.includes(ARTICLE_SS));
    assert.ok(parts.html.includes('href="douyin-share://code/8eOLgPfUR3b9"'));
    assert.ok(parts.html.includes(ARTICLE_SS));
    assert.equal(replies.length, 1);
    assert.match(replies[0], /^已收到 1 条口令，已成功发送 1 封邮件/);
  });

  test('the angle-bracket article code and a hash video code each send one pseudo link', async () => {
    const { sent, replies } = armShareMail();
    const angle = await processMessageEvent(textMessage('evt-share-angle', 'om_share_angle', ARTICLE_ANGLE));
    const hash = await processMessageEvent(textMessage('evt-share-hash', 'om_share_hash', VIDEO_HASH));

    assert.equal(angle.emails_sent, 1);
    assert.equal(hash.emails_sent, 1);
    assert.deepEqual(sent.map((item) => item.url), [
      'douyin-share://code/2QnCB9aIZZ29',
      'douyin-share://code/VC5fEvSQwI8'
    ]);
    assert.equal(sent[0].sourceText, ARTICLE_ANGLE);
    assert.equal(sent[1].sourceText, VIDEO_HASH);
    assert.match(replies[0], /已收到 1 条口令/);
    assert.match(replies[1], /已收到 1 条口令/);
  });

  test('a video paste that already has a short link still uses the url path', async () => {
    const { sent, replies } = armShareMail();
    const result = await processMessageEvent(textMessage(
      'evt-share-url',
      'om_share_url',
      `${VIDEO_WITH_URL} ŠŠ8eOLgPfUR3b9※※`
    ));

    assert.equal(result.urls_found, 1);
    assert.equal(result.emails_sent, 1);
    assert.equal(result.share_codes_found, undefined);
    assert.deepEqual(sent.map((item) => item.url), ['https://v.douyin.com/G8Oggg_IXMA/']);
    assert.match(replies[0], /^已收到 1 个链接，已成功发送 1 封邮件/);
  });

  test('text with neither a url nor a share code still says no link was found', async () => {
    const { sent, replies } = armShareMail();
    const result = await processMessageEvent(textMessage(
      'evt-share-none',
      'om_share_none',
      '今天开会，没有链接也没有口令'
    ));

    assert.equal(result.status, 'no_url_found');
    assert.equal(sent.length, 0);
    assert.deepEqual(replies, ['未检测到链接，请发送包含链接的消息 🙏']);
  });

  function armShareMail() {
    process.env.TO_EMAIL = 'inbox@example.com';
    process.env.FEISHU_APP_ID = 'cli_test';
    process.env.FEISHU_APP_SECRET = 'secret_test';
    const sent = [];
    const replies = [];
    mailer.sendLinkEmail = async (to, url, sourceText) => {
      sent.push({ to, url, sourceText });
      return { messageId: 'mail-share' };
    };
    lark.sendReply = async (_appId, _secret, _messageId, text) => {
      replies.push(text);
    };
    return { sent, replies };
  }
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
