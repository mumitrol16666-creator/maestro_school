// Local QA only: serves the CRM frontend and proxies /api and /socket.io to the CRM QA API, like nginx.
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2];
const PORT = Number(process.argv[3] || 8091);
const API = { host: '127.0.0.1', port: Number(process.argv[4] || 5002) };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/socket.io')) {
    const upstream = http.request({ ...API, method: req.method, path: req.url, headers: req.headers }, (up) => {
      res.writeHead(up.statusCode, up.headers);
      up.pipe(res);
    });
    upstream.on('error', () => { res.writeHead(502); res.end('CRM API unavailable'); });
    req.pipe(upstream);
    return;
  }
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/' ) urlPath = '/login.html';
  let file = path.join(ROOT, 'public', urlPath);
  if (!path.extname(file)) file += '.html';
  if (!file.startsWith(path.join(ROOT, 'public'))) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
server.on('upgrade', (req, socket) => {
  const upstream = require('net').connect(API.port, API.host, () => {
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
});
server.listen(PORT, '127.0.0.1', () => console.log(`CRM frontend on http://127.0.0.1:${PORT}`));
