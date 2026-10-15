/**
 * 飞书事件订阅入口。
 *
 * 导出 fetch，让 Vercel 按 Web Request 调用。request.text() 是 HTTP 原始报文，
 * 签名必须盖在这份原文上，不能先 JSON.parse 再 JSON.stringify。
 * GET/POST 也指向同一函数，兼容按方法名识别入口的运行时。
 */

const { handleRequest } = require('../lib/dispatch');

async function fetch(request) {
  try {
    return await handleRequest(request);
  } catch (error) {
    console.error('[Webhook] 处理请求时发生错误:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }
}

module.exports = {
  fetch,
  GET: fetch,
  POST: fetch
};
