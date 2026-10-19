/**
 * 常驻 HTTP 入口。飞书把事件推到 /api/webhook。
 * 校验请求在本进程里直接应答；消息事件先回 200，再后台发信和回复。
 *
 *   npm start
 */

const http = require('http');
const { loadEnv } = require('./load-env');
const { handleRequest } = require('../lib/dispatch');

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length'
]);

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks);
      const host = req.headers.host || '127.0.0.1';
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined || HOP_BY_HOP.has(key.toLowerCase())) continue;
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) headers.append(key, item);
      }

      const method = req.method || 'GET';
      const request = new Request(`http://${host}${req.url}`, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : raw
      });
      const response = await handleRequest(request);
      const out = Buffer.from(await response.arrayBuffer());
      const outHeaders = {};
      response.headers.forEach((value, key) => {
        outHeaders[key] = value;
      });
      res.writeHead(response.status, outHeaders);
      res.end(out);
    } catch (error) {
      console.error('[Server] 请求处理失败:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    }
  });
}

function listen(server) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => {
    console.log(`[Server] 正在监听 http://${host}:${port}/api/webhook`);
  });
}

if (require.main === module) {
  loadEnv();
  listen(createServer());
}

module.exports = { createServer };
