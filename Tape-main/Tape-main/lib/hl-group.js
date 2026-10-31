// Turns Hyperliquid's individual fills into whole positions.
//
// Hyperliquid reports every execution as a separate "fill". Closing one
// position in three pieces gives three fills, and counting each as a trade
// inflates the trade count and distorts win rate. Every fill carries
// `startPosition` (the signed size just before it), so a position is simply:
// from a fill that starts at 0, until a fill that leaves 0.

const EPS = 1e-8;
const r8 = (x) => Math.round(x * 1e8) / 1e8;
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

function groupFills(rawFills, idPrefix) {
  // Perp fills only: their `dir` names Long/Short. Spot fills just say Buy/Sell.
  const seen = new Set();
  const fills = [];
  for (const f of rawFills || []) {
    if (!/long|short/i.test(String(f.dir ?? ''))) continue;
    const key = String(f.tid ?? `${f.hash}-${f.time}-${f.oid}-${f.px}-${f.sz}`);
    if (seen.has(key)) continue;
    seen.add(key);
    fills.push({
      tid: key,
      coin: String(f.coin),
      side: f.side, // "B" buy, "A" sell
      t: num(f.time),
      px: num(f.px),
      sz: num(f.sz),
      fee: num(f.fee),
      pnl: num(f.closedPnl),
      start: r8(num(f.startPosition)),
    });
  }
  fills.sort((a, b) => a.t - b.t || Number(a.tid) - Number(b.tid) || 0);

  const byCoin = new Map();
  for (const f of fills) {
    if (!byCoin.has(f.coin)) byCoin.set(f.coin, []);
    byCoin.get(f.coin).push(f);
  }

  const closed = [];
  const open = new Map();

  function finalize(g) {
    const isOpening = (f) => (g.dir === 'long' ? f.side === 'B' : f.side === 'A');
    const opens = g.fills.filter(isOpening);
    const closes = g.fills.filter((f) => !isOpening(f));
    const sum = (arr, k) => arr.reduce((s, f) => s + f[k], 0);
    const vwap = (arr) => {
      const q = sum(arr, 'sz');
      return q > 0 ? arr.reduce((s, f) => s + f.px * f.sz, 0) / q : null;
    };
    const qtyOpened = sum(opens, 'sz');
    const qtyClosed = sum(closes, 'sz');
    const pnlGross = sum(g.fills, 'pnl'); // before fees
    const fees = sum(g.fills, 'fee');
    const exit = vwap(closes);
    let entry = vwap(opens);
    if (entry == null && qtyClosed > 0 && exit != null) {
      // The opening fills are older than what we read: back the entry out of the P&L.
      entry = g.dir === 'long' ? exit - pnlGross / qtyClosed : exit + pnlGross / qtyClosed;
    }
    const first = g.fills[0];
    const last = g.fills[g.fills.length - 1];
    return {
      id: `${idPrefix}-${g.coin}-${first.tid}`,
      coin: g.coin,
      dir: g.dir,
      ts: first.t,
      closeTs: last.t,
      entry,
      exit,
      qty: qtyOpened || qtyClosed,
      fees,
      pnlGross,
      pnl: pnlGross - fees, // net of fees, like the Bitunix numbers
      partial: g.partial,
      fillIds: [...new Set(g.fills.map((f) => f.tid.replace(/b$/, '')))],
    };
  }

  for (const [coin, list] of byCoin) {
    let g = null;

    const consume = (part) => {
      if (g && Math.abs(part.start) < EPS) {
        // The previous position never reported a flat fill: a gap in the data.
        g.partial = true;
        closed.push(finalize(g));
        g = null;
      }
      if (!g) {
        const startsFlat = Math.abs(part.start) < EPS;
        const dir = startsFlat ? (part.after > 0 ? 'long' : 'short') : part.start > 0 ? 'long' : 'short';
        // Not flat at the first fill we can see: the opening fills are older than our window.
        g = { coin, dir, fills: [], partial: !startsFlat };
      }
      g.fills.push(part);
      if (Math.abs(part.after) < EPS) {
        closed.push(finalize(g));
        g = null;
      }
    };

    for (const f of list) {
      const after = r8(f.start + (f.side === 'B' ? 1 : -1) * f.sz);
      const flips =
        Math.abs(f.start) >= EPS && Math.abs(after) >= EPS && Math.sign(f.start) !== Math.sign(after);
      if (flips) {
        // One fill that closes a position and opens the opposite one: split it in two.
        const closeSz = Math.abs(f.start);
        const openSz = Math.abs(after);
        const total = closeSz + openSz;
        consume({ ...f, sz: closeSz, fee: f.fee * (closeSz / total), after: 0 });
        consume({ ...f, tid: `${f.tid}b`, sz: openSz, fee: f.fee * (openSz / total), pnl: 0, start: 0, after });
      } else {
        consume({ ...f, after });
      }
    }
    if (g) open.set(coin, finalize(g));
  }

  closed.sort((a, b) => a.closeTs - b.closeTs);
  return { closed, open };
}

module.exports = { groupFills };
