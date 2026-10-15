/**
 * 本地 HTTP 入口。把同一套 webhook 处理函数跑在本机，再用隧道暴露给飞书。
 *
 *   npm run dev
 *   curl -X POST http://127.0.0.1:3000/api/webhook -H 'content-type: application/json' \
 *     -d '{"type":"url_verification","challenge":"demo"}'
 */

const http = require('http');
const { loadEnv } = require('./load-env');
const { fetch: handleRequest } = require('../api/webhook');

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
      console.error('[Dev] 请求处理失败:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    }
  });
}

function listen(server) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  server.listen(port, host, () => {
    console.log(`[Dev] 本地服务已启动: http://127.0.0.1:${port}/api/webhook`);
    console.log('[Dev] 用 cloudflared / ngrok / cpolar 把这个地址暴露给飞书做 URL 校验');
  });
}

if (require.main === module) {
  loadEnv();
  listen(createServer());
}

module.exports = { createServer };
