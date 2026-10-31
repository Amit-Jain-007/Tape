// /api/trades — the ONLY place your Bitunix API key/secret are ever used.
// They live in Vercel's environment variables, never in any file you commit
// and never sent to the browser. The page calls this endpoint; this endpoint
// calls Bitunix.
//
// Access is protected by your access key (see lib/auth.js), so nobody else
// can use your deployment to read your trades or balance.

const crypto = require('crypto');
const requireAccess = require('../lib/auth');

const API_KEY = process.env.BITUNIX_API_KEY;
const API_SECRET = process.env.BITUNIX_API_SECRET;

const DAY = 86400000;
const PAGE = 100; // Bitunix's maximum per request
const MAX_PAGES = 15; // safety cap: 1,500 positions per sync
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sign(query) {
  const sortedQuery = [...query.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}${v}`)
    .join('');
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const timestamp = String(Date.now());
  const digest = crypto
    .createHash('sha256')
    .update(`${nonce}${timestamp}${API_KEY}${sortedQuery}`)
    .digest('hex');
  const signature = crypto.createHash('sha256').update(`${digest}${API_SECRET}`).digest('hex');
  return { sign: signature, nonce, timestamp };
}

async function bitunixGet(path, query) {
  const { sign: signature, nonce, timestamp } = sign(query);
  const qs = query.toString();
  const res = await fetch(`https://fapi.bitunix.com${path}${qs ? `?${qs}` : ''}`, {
    headers: {
      'api-key': API_KEY,
      sign: signature,
      nonce,
      timestamp,
      language: 'en-US',
      'Content-Type': 'application/json',
    },
  });
  const body = await res.json();
  if (body?.code !== undefined && String(body.code) !== '0') {
    throw new Error(`Bitunix: ${body.msg ?? body.message ?? body.code}`);
  }
  return body;
}

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const optNum = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const direction = (r) => {
  const s = String(r.side ?? r.positionSide ?? '').toUpperCase();
  // Bitunix's docs say LONG/SHORT, but real accounts return BUY/SELL instead.
  // Handle both: BUY/LONG -> long, SELL/SHORT -> short.
  return s === 'SELL' || s.includes('SHORT') ? 'short' : 'long';
};
const rowsOf = (body) =>
  Array.isArray(body?.data?.positionList) ? body.data.positionList : Array.isArray(body?.data) ? body.data : [];
const idOf = (r) => String(r.positionId ?? r.id ?? `${r.symbol}-${r.ctime}`);

// One request returns at most 100 positions, so keep reading until a page comes back short.
async function fetchAllHistory(sinceMs) {
  const seen = new Set();
  const all = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await bitunixGet(
      '/api/v1/futures/position/get_history_positions',
      new URLSearchParams({ limit: String(PAGE), skip: String(page * PAGE), startTime: String(sinceMs) }),
    );
    const rows = rowsOf(body);
    let added = 0;
    for (const r of rows) {
      const id = idOf(r);
      if (!seen.has(id)) {
        seen.add(id);
        all.push(r);
        added++;
      }
    }
    // Short page = the last one. Nothing new = the server ignored `skip`; stop instead of looping.
    if (rows.length < PAGE || added === 0) break;
    await sleep(120); // stay under Bitunix's 10 requests/second limit
  }
  return all;
}

function toTrade(r, isOpen) {
  const ts = num(r.ctime ?? r.createTime) || Date.now();
  const iso = new Date(ts).toISOString();
  // Bitunix's realizedPNL EXCLUDES fees and funding, so subtract them ourselves.
  // `funding` is signed (negative = paid, positive = received); `fee` is a plain cost.
  const costs = Math.abs(num(r.fee)) - num(r.funding);
  const realized = isOpen ? null : optNum(r.realizedPNL);
  return {
    id: idOf(r),
    symbol: String(r.symbol ?? 'UNKNOWN'),
    direction: direction(r),
    ts, // when the position was opened (ms)
    closeTs: isOpen ? null : num(r.mtime) || null,
    date: iso.slice(0, 10), // UTC; the page recomputes these in your local time from `ts`
    time: iso.slice(11, 16),
    entry: optNum(r.entryPrice ?? r.averagePrice ?? (isOpen ? r.openAvgPrice : undefined)) ?? 0,
    exit: isOpen ? null : optNum(r.closePrice ?? r.exitPrice),
    qty: (isOpen ? optNum(r.qty ?? r.maxQty) : optNum(r.maxQty ?? r.qty)) ?? 0,
    fees: isOpen ? Math.abs(num(r.funding ?? 0)) : costs,
    // Net P&L straight from Bitunix (handles partial closes). Falls back to entry/exit math if absent.
    ...(realized !== null ? { pnl_override: realized - costs } : {}),
    broker: 'Bitunix',
    asset_class: 'crypto',
    strategy: '',
    notes: null, // null = not reviewed yet (this is what lets the review popup appear)
    chart: null,
  };
}

module.exports = async (req, res) => {
  if (!requireAccess(req, res)) return;

  if (!API_KEY || !API_SECRET) {
    return res
      .status(500)
      .json({ error: 'BITUNIX_API_KEY / BITUNIX_API_SECRET are not set on the server.' });
  }

  try {
    const sinceMs = Number(req.query.since) > 0 ? Number(req.query.since) : Date.now() - 730 * DAY;

    const closed = (await fetchAllHistory(sinceMs)).map((r) => toTrade(r, false));

    let open = [];
    let openOk = false;
    try {
      const pendingBody = await bitunixGet('/api/v1/futures/position/get_pending_positions', new URLSearchParams());
      open = rowsOf(pendingBody).map((r) => toTrade(r, true));
      openOk = true;
    } catch {
      // History still returns even if the open-positions call fails.
    }

    let balance = null;
    try {
      const acctBody = await bitunixGet('/api/v1/futures/account', new URLSearchParams({ marginCoin: 'USDT' }));
      // Docs show `data` as an array; handle an object too.
      const a = (Array.isArray(acctBody?.data) ? acctBody.data[0] : acctBody?.data) ?? {};
      // Wallet balance = free funds + funds locked in orders + funds locked in positions.
      // Unrealized PnL is deliberately left out.
      balance = num(a.available) + num(a.frozen) + num(a.margin);
    } catch {
      // Trades still sync fine even if the balance call fails.
    }

    // If a position ever appears in both lists, the closed record wins.
    const byId = new Map();
    [...open, ...closed].forEach((t) => byId.set(t.id, t));

    res.status(200).json({ trades: [...byId.values()], balance, openOk });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Sync failed' });
  }
};
