# Release Checklist

A shared checklist that the whole team uses for each release. Everyone who opens the page sees the same list, and changes sync every few seconds.

## How it works

- **+ Create release** asks for a name. The release date is set automatically to today and shown next to the name.
- **One release per day**: the button is disabled once today's release exists, and the server rejects a second one.
- A new release **copies the task list from the most recent release, with every checkbox cleared**.
- Each release is stored as one JSON document, keyed by its date (`YYYY-MM-DD`).
- Tasks: check or uncheck them (the page records who checked each one and when), click a task to edit it, and use ↑/↓ to reorder or ✕ to delete. Double-click the release title to rename it.

## Deploy to Vercel

Vercel functions can't write files to disk, so releases are stored in Upstash Redis there.

1. In the Vercel project, open **Storage → Create Database → Upstash for Redis** (the free plan is enough) and connect it to this project. This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`; `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` also work.
2. Optional: set `RELEASE_TIMEZONE` (default `Asia/Ho_Chi_Minh`) to control which day "today" is.
3. Redeploy.

## Run locally

```bash
node server.js            # http://localhost:3000  (Node 18+, no npm install needed)
```

Without Redis env vars, releases are saved as files in `data/releases/YYYY-MM-DD.json`. If the Redis env vars are set, the local server uses Redis too.

## Layout

- `public/index.html`: the page
- `api/index.js`: the Vercel function (all `/api/*` routes are rewritten to it in `vercel.json`)
- `lib/api.js`: API logic shared by Vercel and the local server
- `lib/store.js`: storage (Redis or local files)
- `server.js`: local server
