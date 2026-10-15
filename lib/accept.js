/**
 * 接收一条消息事件：去重后把发信和回复放到后台。
 */

const { isDuplicate } = require('./dedupe');
const { defer } = require('./background');
const messages = require('./process-message');

/**
 * @param {object} payload
 * @param {string} source 日志来源
 * @returns {{ accepted: boolean, duplicate: boolean, task: Promise<void>|null }}
 */
function acceptMessageEvent(payload, source) {
  const body = messages.normalizeMessageBody(payload);
  const eventId = body?.header?.event_id || payload?.uuid || '';
  const messageId = body?.event?.message?.message_id || '';

  if (!body?.event?.message) {
    console.log(`[${source}] 消息体为空`);
    return { accepted: false, duplicate: false, task: null };
  }

  if (isDuplicate(eventId, messageId)) {
    console.log(`[${source}] 重复事件，已忽略 event_id=${eventId} message_id=${messageId}`);
    return { accepted: false, duplicate: true, task: null };
  }

  const task = defer(() => messages.processMessageEvent(body));
  return { accepted: true, duplicate: false, task };
}

module.exports = { acceptMessageEvent };
