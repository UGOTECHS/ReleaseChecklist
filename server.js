// Local server — no dependencies, run with: node server.js
// Serves public/ and the API from lib/api.js.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { handle, storeName } = require('./lib/api');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end('Not found');
  }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'api') return handle(req, res, parts.slice(1));
    return serveStatic(req, res, pathname);
  })
  .listen(PORT, HOST, () => {
    console.log(`Release checklist running at http://localhost:${PORT}`);
    console.log(`Storage: ${storeName}`);
  });
