// Small signed GET helper for Bitunix (read-only). Mirrors the signing in api/trades.js.
const crypto = require('crypto');

function configured() {
  return Boolean(process.env.BITUNIX_API_KEY && process.env.BITUNIX_API_SECRET);
}

async function bitunixGet(path, query = new URLSearchParams(), timeoutMs = 7000) {
  const key = process.env.BITUNIX_API_KEY;
  const secret = process.env.BITUNIX_API_SECRET;
  const sortedQuery = [...query.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}${v}`).join('');
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const timestamp = String(Date.now());
  const digest = crypto.createHash('sha256').update(`${nonce}${timestamp}${key}${sortedQuery}`).digest('hex');
  const sign = crypto.createHash('sha256').update(`${digest}${secret}`).digest('hex');
  const qs = query.toString();
  const res = await fetch(`https://fapi.bitunix.com${path}${qs ? `?${qs}` : ''}`, {
    headers: { 'api-key': key, sign, nonce, timestamp, language: 'en-US', 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.json();
  if (body?.code !== undefined && String(body.code) !== '0') throw new Error(`Bitunix: ${body.msg ?? body.message ?? body.code}`);
  return body;
}

module.exports = { bitunixGet, configured };
