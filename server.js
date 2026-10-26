// Release checklist server — no dependencies, run with: node server.js
// Each release is stored as data/releases/<YYYY-MM-DD>.json (one release per day).

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data', 'releases');
const PUBLIC_DIR = path.join(__dirname, 'public');

fs.mkdirSync(DATA_DIR, { recursive: true });

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fileFor(id) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(id)) return null;
  return path.join(DATA_DIR, `${id}.json`);
}

function readRelease(id) {
  const file = fileFor(id);
  if (!file || !fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeRelease(release) {
  release.version = (release.version || 0) + 1;
  release.updatedAt = new Date().toISOString();
  const file = fileFor(release.id);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(release, null, 2));
  fs.renameSync(tmp, file);
  return release;
}

function listReleases() {
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => readRelease(f.slice(0, -5)))
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => ({
      id: r.id,
      name: r.name,
      date: r.date,
      version: r.version,
      total: r.items.length,
      done: r.items.filter((i) => i.done).length,
    }));
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

async function handleApi(req, res, parts) {
  // parts: ['api', 'releases', id?, 'items'?, itemId?]
  const [, resource, id, sub, itemId] = parts;
  if (resource !== 'releases') return send(res, 404, { error: 'Not found' });

  // GET /api/releases
  if (!id && req.method === 'GET') {
    return send(res, 200, { today: today(), releases: listReleases() });
  }

  // POST /api/releases  { name }
  if (!id && req.method === 'POST') {
    const { name } = await readBody(req);
    const cleanName = cleanText(name, 120);
    if (!cleanName) return send(res, 400, { error: 'Release name is required' });
    const date = today();
    if (readRelease(date)) {
      return send(res, 409, { error: `A release already exists for ${date}. Only one release can be created per day.` });
    }
    const previous = listReleases()[0];
    const prevItems = previous ? readRelease(previous.id).items : [];
    const release = {
      id: date,
      name: cleanName,
      date,
      createdAt: new Date().toISOString(),
      copiedFrom: previous ? previous.id : null,
      version: 0,
      items: prevItems.map((i) => ({ id: crypto.randomUUID(), text: i.text, done: false, doneBy: null, doneAt: null })),
    };
    return send(res, 201, writeRelease(release));
  }

  const release = readRelease(id);
  if (!release) return send(res, 404, { error: 'Release not found' });

  // GET /api/releases/:id
  if (!sub && req.method === 'GET') return send(res, 200, release);

  // PATCH /api/releases/:id  { name }
  if (!sub && req.method === 'PATCH') {
    const { name } = await readBody(req);
    const cleanName = cleanText(name, 120);
    if (!cleanName) return send(res, 400, { error: 'Release name is required' });
    release.name = cleanName;
    return send(res, 200, writeRelease(release));
  }

  if (sub !== 'items') return send(res, 404, { error: 'Not found' });

  // POST /api/releases/:id/items  { text }
  if (!itemId && req.method === 'POST') {
    const { text } = await readBody(req);
    const cleanTask = cleanText(text);
    if (!cleanTask) return send(res, 400, { error: 'Task text is required' });
    release.items.push({ id: crypto.randomUUID(), text: cleanTask, done: false, doneBy: null, doneAt: null });
    return send(res, 201, writeRelease(release));
  }

  const index = release.items.findIndex((i) => i.id === itemId);
  if (index === -1) return send(res, 404, { error: 'Item not found' });
  const item = release.items[index];

  // PATCH /api/releases/:id/items/:itemId  { text?, done?, by?, move? }
  if (req.method === 'PATCH') {
    const body = await readBody(req);
    if (body.text !== undefined) {
      const cleanTask = cleanText(body.text);
      if (!cleanTask) return send(res, 400, { error: 'Task text is required' });
      item.text = cleanTask;
    }
    if (body.done !== undefined) {
      item.done = Boolean(body.done);
      item.doneBy = item.done ? cleanText(body.by, 60) || null : null;
      item.doneAt = item.done ? new Date().toISOString() : null;
    }
    if (body.move === 'up' || body.move === 'down') {
      const target = body.move === 'up' ? index - 1 : index + 1;
      if (target >= 0 && target < release.items.length) {
        [release.items[index], release.items[target]] = [release.items[target], release.items[index]];
      }
    }
    return send(res, 200, writeRelease(release));
  }

  // DELETE /api/releases/:id/items/:itemId
  if (req.method === 'DELETE') {
    release.items.splice(index, 1);
    return send(res, 200, writeRelease(release));
  }

  return send(res, 405, { error: 'Method not allowed' });
}

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
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
    try {
      if (parts[0] === 'api') return await handleApi(req, res, parts);
      return serveStatic(req, res, pathname);
    } catch (err) {
      console.error(err);
      return send(res, 500, { error: 'Server error' });
    }
  })
  .listen(PORT, HOST, () => {
    console.log(`Release checklist running at http://localhost:${PORT}`);
    console.log(`Data stored in ${DATA_DIR}`);
  });
