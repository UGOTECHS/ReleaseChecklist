// Vercel serverless entry point. vercel.json rewrites /api/<path> to /api?path=<path>.
const { handle } = require('../lib/api');

module.exports = (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const raw = url.searchParams.get('path') ?? url.pathname.replace(/^\/api\/?/, '');
  const parts = raw.split('/').filter(Boolean).map(decodeURIComponent);
  return handle(req, res, parts);
};
