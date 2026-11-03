// /api/positions — a LIGHTWEIGHT, read-only snapshot of your currently open positions.
// The page polls this every few seconds while a trade is open, so it only does a
// handful of fast calls (no trade history) and answers in well under a second.
//
//   GET /api/positions?hl=0xWallet1,0xWallet2
//
// Bitunix uses the BITUNIX_API_KEY / BITUNIX_API_SECRET environment variables.
// Hyperliquid only needs public wallet addresses, passed in the query string.

const requireAccess = require('../lib/auth');
const { bitunixGet, configured } = require('../lib/bitunix');

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const pos = (v) => { const n = num(v); return Number.isFinite(n) && n > 0 ? n : null; };
const round = (x, d = 8) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

// ---------- Bitunix ----------
const sideOf = (r) => {
  const s = String(r.side ?? r.positionSide ?? '').toUpperCase();
  return s === 'SELL' || s === 'SHORT' ? 'short' : 'long';
};

async function bitunixPositions() {
  const [posBody, slBody] = await Promise.allSettled([
    bitunixGet('/api/v1/futures/position/get_pending_positions'),
    bitunixGet('/api/v1/futures/tpsl/get_pending_orders', new URLSearchParams({ limit: '100' })),
  ]);
  if (posBody.status === 'rejected') throw posBody.reason;
  const rows = (b) => (Array.isArray(b?.data) ? b.data : Array.isArray(b?.data?.list) ? b.data.list : Array.isArray(b?.data?.rows) ? b.data.rows : []);

  // exchange-side stop-loss / take-profit, keyed by position
  const stops = new Map();
  if (slBody.status === 'fulfilled') {
    for (const o of rows(slBody.value)) {
      const cur = stops.get(String(o.positionId)) ?? { sl: null, tp: null };
      cur.sl = cur.sl ?? pos(o.slPrice);
      cur.tp = cur.tp ?? pos(o.tpPrice);
      stops.set(String(o.positionId), cur);
    }
  }

  return rows(posBody.value)
    .filter((r) => num(r.qty) > 0)
    .map((r) => {
      const side = sideOf(r);
      const qty = num(r.qty);
      const entry = pos(r.avgOpenPrice) ?? (num(r.entryValue) > 0 ? num(r.entryValue) / qty : null);
      const upnl = num(r.unrealizedPNL);
      // Bitunix doesn't return the live price here, so derive it from the unrealized P&L.
      const mark = entry === null ? null : entry + (side === 'long' ? 1 : -1) * (upnl / qty);
      const margin = num(r.margin);
      const st = stops.get(String(r.positionId)) ?? { sl: null, tp: null };
      return {
        id: `bitunix:${r.positionId}`,
        broker: 'Bitunix',
        account: null,
        symbol: String(r.symbol ?? 'UNKNOWN'),
        side,
        qty,
        entry: round(entry),
        mark: round(mark),
        upnl: round(upnl, 4),
        roe: margin > 0 ? round((upnl / margin) * 100, 2) : null,
        leverage: num(r.leverage) || null,
        margin: round(margin, 4),
        notional: round(num(r.entryValue) || (entry ?? 0) * qty, 4),
        liq: pos(r.liqPrice),
        openedAt: num(r.ctime) || null,
        fees: round(Math.abs(num(r.fee)) - num(r.funding), 4),
        sl: st.sl,
        tp: st.tp,
      };
    });
}

// ---------- Hyperliquid ----------
async function hlInfo(body) {
  const res = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(7000),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Hyperliquid: ${json?.error ?? res.status}`);
  return json;
}

async function hyperliquidPositions(wallets, midsPromise) {
  const out = [];
  const results = await Promise.all(
    wallets.map(async (user) => {
      const [state, orders, mids] = await Promise.all([
        hlInfo({ type: 'clearinghouseState', user }),
        hlInfo({ type: 'frontendOpenOrders', user }).catch(() => []),
        midsPromise,
      ]);
      return { user, state, orders, mids };
    }),
  );
  for (const { user, state, orders, mids } of results) {
    for (const ap of state?.assetPositions ?? []) {
      const p = ap.position ?? {};
      const szi = num(p.szi);
      if (!szi) continue;
      const side = szi > 0 ? 'long' : 'short';
      const qty = Math.abs(szi);
      const entry = pos(p.entryPx);
      const live = pos(mids?.[p.coin]) ?? (num(p.positionValue) > 0 ? num(p.positionValue) / qty : null);
      // reduce-only trigger orders on this coin are the position's stop / take-profit
      let sl = null;
      let tp = null;
      for (const o of orders) {
        if (o.coin !== p.coin || !o.isTrigger || !pos(o.triggerPx)) continue;
        const t = String(o.orderType ?? '');
        if (/^stop/i.test(t)) sl = sl ?? pos(o.triggerPx);
        else if (/take/i.test(t)) tp = tp ?? pos(o.triggerPx);
      }
      out.push({
        id: `hl:${user.toLowerCase()}:${p.coin}`,
        broker: 'Hyperliquid',
        account: `${user.slice(0, 6)}…${user.slice(-4)}`,
        symbol: String(p.coin),
        side,
        qty,
        entry: round(entry),
        mark: round(live),
        upnl: round(num(p.unrealizedPnl), 4),
        roe: p.returnOnEquity !== undefined ? round(num(p.returnOnEquity) * 100, 2) : null,
        leverage: num(p.leverage?.value) || null,
        margin: round(num(p.marginUsed), 4),
        notional: round(num(p.positionValue), 4),
        liq: pos(p.liquidationPx),
        openedAt: null, // the page remembers when it first saw the position
        fees: round(-num(p.cumFunding?.sinceOpen), 4),
        sl,
        tp,
      });
    }
  }
  return out;
}

module.exports = async (req, res) => {
  if (!requireAccess(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  const wallets = String(req.query.hl ?? '')
    .split(',')
    .map((w) => w.trim())
    .filter((w) => /^0x[0-9a-fA-F]{40}$/.test(w));

  const positions = [];
  const errors = {};
  const jobs = [];

  if (configured()) {
    jobs.push(bitunixPositions().then((p) => positions.push(...p)).catch((e) => { errors.Bitunix = e.message; }));
  }
  if (wallets.length) {
    const mids = hlInfo({ type: 'allMids' }).catch(() => ({}));
    jobs.push(hyperliquidPositions([...new Set(wallets.map((w) => w.toLowerCase()))], mids).then((p) => positions.push(...p)).catch((e) => { errors.Hyperliquid = e.message; }));
  }
  await Promise.all(jobs);

  res.status(200).json({ positions, errors, ts: Date.now() });
};
