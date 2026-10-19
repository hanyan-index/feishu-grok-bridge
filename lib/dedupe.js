/**
 * 进程内事件去重。
 * 飞书在 3 秒内没收到成功响应时会重推同一条事件。
 * 这张表跟常驻进程走，同一进程里的重试不会再发一封邮件。
 */

const TTL_MS = 60 * 60 * 1000;
const MAX_KEYS = 5000;

/** @type {Map<string, number>} */
const seen = new Map();

function fresh(key) {
  const ts = seen.get(key);
  if (!ts) return false;
  if (Date.now() - ts > TTL_MS) {
    seen.delete(key);
    return false;
  }
  return true;
}

function prune() {
  if (seen.size <= MAX_KEYS) return;
  const now = Date.now();
  for (const [key, ts] of seen) {
    if (now - ts > TTL_MS || seen.size > MAX_KEYS) {
      seen.delete(key);
    }
    if (seen.size <= MAX_KEYS / 2) break;
  }
}

/**
 * 用 event_id 和 message_id 判断是不是重试。
 * 第一次见到时记下来并返回 false。
 * @param {string} eventId
 * @param {string} messageId
 * @returns {boolean}
 */
function isDuplicate(eventId, messageId) {
  prune();
  const eventKey = eventId ? `e:${eventId}` : '';
  const messageKey = messageId ? `m:${messageId}` : '';
  const duplicate = (eventKey && fresh(eventKey)) || (messageKey && fresh(messageKey));
  const now = Date.now();
  if (eventKey) seen.set(eventKey, now);
  if (messageKey) seen.set(messageKey, now);
  return Boolean(duplicate);
}

function clearDedupe() {
  seen.clear();
}

module.exports = {
  isDuplicate,
  clearDedupe
};
