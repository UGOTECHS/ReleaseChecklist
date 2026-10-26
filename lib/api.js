// API handler shared by the local server (server.js) and the Vercel function (api/index.js).

const crypto = require('crypto');
const store = require('./store');

// Release dates use this timezone (servers like Vercel run in UTC).
const TIME_ZONE = process.env.RELEASE_TIMEZONE || 'Asia/Ho_Chi_Minh';

function today() {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const isReleaseId = (id) => /^\d{4}-\d{2}-\d{2}$/.test(id);

function touch(release) {
  release.version = (release.version || 0) + 1;
  release.updatedAt = new Date().toISOString();
  return release;
}

function summarize(r) {
  return {
    id: r.id,
    name: r.name,
    date: r.date,
    version: r.version,
    total: r.items.length,
    done: r.items.filter((i) => i.done).length,
  };
}

async function allReleases() {
  return (await store.getAll()).sort((a, b) => b.date.localeCompare(a.date));
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  // Vercel pre-parses the body into req.body; plain Node does not.
  if (req.body !== undefined) {
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) return req.body.length ? JSON.parse(req.body) : {};
    return req.body || {};
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1e6) throw new Error('Body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

// parts: ['releases', id?, 'items'?, itemId?]
async function handleApi(req, res, parts) {
  const [resource, id, sub, itemId] = parts;
  if (resource !== 'releases') return send(res, 404, { error: 'Not found' });

  // GET /api/releases
  if (!id && req.method === 'GET') {
    return send(res, 200, { today: today(), releases: (await allReleases()).map(summarize) });
  }

  // POST /api/releases  { name }
  if (!id && req.method === 'POST') {
    const { name } = await readBody(req);
    const cleanName = cleanText(name, 120);
    if (!cleanName) return send(res, 400, { error: 'Release name is required' });
    const date = today();
    const previous = (await allReleases()).find((r) => r.date < date);
    const release = touch({
      id: date,
      name: cleanName,
      date,
      createdAt: new Date().toISOString(),
      copiedFrom: previous ? previous.id : null,
      version: 0,
      items: (previous ? previous.items : []).map((i) => ({
        id: crypto.randomUUID(),
        text: i.text,
        done: false,
        doneBy: null,
        doneAt: null,
      })),
    });
    if (!(await store.create(release))) {
      return send(res, 409, { error: `A release already exists for ${date}. Only one release can be created per day.` });
    }
    return send(res, 201, release);
  }

  if (!isReleaseId(id)) return send(res, 404, { error: 'Release not found' });
  const release = await store.get(id);
  if (!release) return send(res, 404, { error: 'Release not found' });

  // GET /api/releases/:id
  if (!sub && req.method === 'GET') return send(res, 200, release);

  // PATCH /api/releases/:id  { name }
  if (!sub && req.method === 'PATCH') {
    const { name } = await readBody(req);
    const cleanName = cleanText(name, 120);
    if (!cleanName) return send(res, 400, { error: 'Release name is required' });
    release.name = cleanName;
    await store.save(touch(release));
    return send(res, 200, release);
  }

  if (sub !== 'items') return send(res, 404, { error: 'Not found' });

  // POST /api/releases/:id/items  { text }
  if (!itemId && req.method === 'POST') {
    const { text } = await readBody(req);
    const cleanTask = cleanText(text);
    if (!cleanTask) return send(res, 400, { error: 'Task text is required' });
    release.items.push({ id: crypto.randomUUID(), text: cleanTask, done: false, doneBy: null, doneAt: null });
    await store.save(touch(release));
    return send(res, 201, release);
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
    await store.save(touch(release));
    return send(res, 200, release);
  }

  // DELETE /api/releases/:id/items/:itemId
  if (req.method === 'DELETE') {
    release.items.splice(index, 1);
    await store.save(touch(release));
    return send(res, 200, release);
  }

  return send(res, 405, { error: 'Method not allowed' });
}

async function handle(req, res, parts) {
  try {
    await handleApi(req, res, parts);
  } catch (err) {
    console.error(err);
    send(res, 500, { error: err instanceof SyntaxError ? 'Invalid JSON body' : err.message || 'Server error' });
  }
}

module.exports = { handle, storeName: store.name };
