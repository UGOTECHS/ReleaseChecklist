// Storage for releases. Each release is one JSON document keyed by its date (YYYY-MM-DD).
// - On Vercel (or anywhere with Upstash Redis env vars set): stored in Redis.
// - Locally without those env vars: stored as data/releases/<date>.json files.

const fs = require('fs');
const path = require('path');

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function redisStore() {
  const KEY = (id) => `rc:release:${id}`;
  const INDEX = 'rc:releases';

  async function cmd(...args) {
    const res = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(`Redis error: ${data.error || res.status}`);
    return data.result;
  }

  return {
    name: 'redis',
    async get(id) {
      const raw = await cmd('GET', KEY(id));
      return raw ? JSON.parse(raw) : null;
    },
    async getAll() {
      const ids = await cmd('SMEMBERS', INDEX);
      if (!ids.length) return [];
      const raws = await cmd('MGET', ...ids.map(KEY));
      return raws.filter(Boolean).map((r) => JSON.parse(r));
    },
    // Returns false if a release already exists for that id (atomic: one release per day).
    async create(release) {
      const ok = await cmd('SET', KEY(release.id), JSON.stringify(release), 'NX');
      if (ok !== 'OK') return false;
      await cmd('SADD', INDEX, release.id);
      return true;
    },
    async save(release) {
      await cmd('SET', KEY(release.id), JSON.stringify(release));
    },
  };
}

function fileStore() {
  const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data', 'releases');
  const fileFor = (id) => path.join(dir, `${id}.json`);
  let ready = false;
  const ensureDir = () => {
    if (!ready) fs.mkdirSync(dir, { recursive: true });
    ready = true;
  };

  function write(release, flag) {
    ensureDir();
    const tmp = `${fileFor(release.id)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(release, null, 2));
    if (flag === 'create' && fs.existsSync(fileFor(release.id))) {
      fs.unlinkSync(tmp);
      return false;
    }
    fs.renameSync(tmp, fileFor(release.id));
    return true;
  }

  return {
    name: `files (${dir})`,
    async get(id) {
      const file = fileFor(id);
      return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    },
    async getAll() {
      ensureDir();
      return fs
        .readdirSync(dir)
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    },
    async create(release) {
      return write(release, 'create');
    },
    async save(release) {
      write(release);
    },
  };
}

if (process.env.VERCEL && !REDIS_URL) {
  console.error('Missing Redis env vars (KV_REST_API_URL / KV_REST_API_TOKEN). Add Upstash Redis to this Vercel project.');
}

module.exports = REDIS_URL && REDIS_TOKEN ? redisStore() : fileStore();
