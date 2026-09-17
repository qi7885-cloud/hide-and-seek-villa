// server.js — 零依赖静态服务器（Node 内置模块，无 npm install）
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
};

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400); return res.end('Bad Request');
  }
  if (urlPath === '/') urlPath = '/index.html';

  // ---- 联机函数本地联调：直接挂载 netlify/functions/room.mjs（同一份代码上线上跑） ----
  // 该函数用标准 Request/Response（Node 18+ 全局），这里做一次薄适配。
  // Blobs 在裸 node 无环境 → 函数内自动降级进程内存（重启清空，仅联调用）。
  if (urlPath === '/api/room') {
    (async () => {
      try {
        const chunks = [];
        for await (const ch of req) chunks.push(ch);
        const body = Buffer.concat(chunks).toString('utf8');
        const req2 = new Request('http://127.0.0.1/api/room', {
          method: req.method,
          headers: { 'content-type': req.headers['content-type'] || 'application/json' },
          body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? body : undefined,
        });
        const mod = await import('./netlify/functions/room.mjs');
        const resp = await mod.default(req2, { ip: req.socket.remoteAddress || '0.0.0.0' });
        res.writeHead(resp.status, {
          'Content-Type': resp.headers.get('content-type') || 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(await resp.text());
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('function error: ' + (e && e.message ? e.message : e));
      }
    })();
    return;
  }
  const filePath = path.join(ROOT, path.normalize(urlPath));

  // 防目录穿越：解析后的真实路径必须仍在项目根目录内（用 relative 防兄弟目录前缀绕过）
  const rel = path.relative(ROOT, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403); return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found: ' + urlPath);
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',   // 模型/脚本更新即时生效
    });
    res.end(data);
  });
}).listen(PORT, HOST, () => {
  console.log(`[HideSeek] http://${HOST}:${PORT}  (Ctrl+C 停止)`);
});
