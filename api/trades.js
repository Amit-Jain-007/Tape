// /api/trades — the ONLY place your Bitunix API key/secret are ever used.
// They live in Vercel's environment variables, never in any file you commit
// and never sent to the browser. The frontend calls this endpoint; this
// endpoint calls Bitunix.

const crypto = require('crypto');

const API_KEY = process.env.BITUNIX_API_KEY;
const API_SECRET = process.env.BITUNIX_API_SECRET;

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

module.exports = async (req, res) => {
  // Lock this down to your own frontend once you know its URL.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!API_KEY || !API_SECRET) {
    return res
      .status(500)
      .json({ error: 'BITUNIX_API_KEY / BITUNIX_API_SECRET are not set on the server.' });
  }

  try {
    const sinceMs = req.query.since ? Number(req.query.since) : Date.now() - 90 * 86400000;

    const historyBody = await bitunixGet(
      '/api/v1/futures/position/get_history_positions',
      new URLSearchParams({ limit: '100', startTime: String(sinceMs) }),
    );
    const historyRows = Array.isArray(historyBody?.data?.positionList)
      ? historyBody.data.positionList
      : Array.isArray(historyBody?.data)
        ? historyBody.data
        : [];
    const closed = historyRows.map((r) => ({
      id: String(r.positionId ?? r.id ?? `${r.symbol}-${r.ctime}`),
      symbol: String(r.symbol ?? 'UNKNOWN'),
      direction: direction(r),
      date: new Date(num(r.ctime ?? r.createTime ?? Date.now())).toISOString().slice(0, 10),
      time: new Date(num(r.ctime ?? r.createTime ?? Date.now())).toISOString().slice(11, 16),
      entry: optNum(r.entryPrice ?? r.averagePrice) ?? 0,
      exit: optNum(r.closePrice ?? r.exitPrice),
      qty: optNum(r.maxQty ?? r.qty) ?? 0,
      fees: Math.abs(num(r.fee)) + Math.abs(num(r.funding ?? 0)),
      broker: 'Bitunix',
      strategy: '',
      notes: '',
      chart: null,
    }));

    let open = [];
    try {
      const pendingBody = await bitunixGet(
        '/api/v1/futures/position/get_pending_positions',
        new URLSearchParams(),
      );
      const pendingRows = Array.isArray(pendingBody?.data)
        ? pendingBody.data
        : Array.isArray(pendingBody?.data?.positionList)
          ? pendingBody.data.positionList
          : [];
      open = pendingRows.map((r) => ({
        id: String(r.positionId ?? r.id ?? `${r.symbol}-open-${r.ctime ?? r.createTime}`),
        symbol: String(r.symbol ?? 'UNKNOWN'),
        direction: direction(r),
        date: new Date(num(r.ctime ?? r.createTime ?? Date.now())).toISOString().slice(0, 10),
        time: new Date(num(r.ctime ?? r.createTime ?? Date.now())).toISOString().slice(11, 16),
        entry: optNum(r.entryPrice ?? r.averagePrice ?? r.openAvgPrice) ?? 0,
        exit: null,
        qty: optNum(r.qty ?? r.maxQty) ?? 0,
        fees: Math.abs(num(r.funding ?? 0)),
        broker: 'Bitunix',
        strategy: '',
        notes: '',
        chart: null,
      }));
    } catch {
      // history still returns even if the pending-positions call fails
    }

    res.status(200).json({ trades: [...closed, ...open] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Sync failed' });
  }
};
