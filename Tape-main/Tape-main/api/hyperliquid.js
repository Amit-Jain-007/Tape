// /api/hyperliquid — pulls real trade history from Hyperliquid's public
// info API. Unlike Bitunix this needs no secret key: the info endpoint is
// read-only and public, you just give it a wallet address.
//
// Access to THIS function is still protected by your access key, so nobody
// else can use your deployment to read data.

const requireAccess = require('../lib/auth');
const { groupFills } = require('../lib/hl-group');

const WALLET = process.env.HYPERLIQUID_WALLET;
const DAY = 86400000;
const FILLS_PER_PAGE = 2000; // Hyperliquid's cap per response
const MAX_PAGES = 6; // Hyperliquid only keeps the 10,000 most recent fills anyway

async function hyperliquidInfo(body) {
  const res = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Hyperliquid: ${json?.error ?? res.status}`);
  return json;
}

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const optNum = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const round = (x) => (x === null || x === undefined ? x : Math.round(x * 1e8) / 1e8);

// Every response is capped at 2,000 fills, so keep reading forward until a page comes back short.
async function fetchAllFills(user, fromMs) {
  const byKey = new Map();
  let start = fromMs;
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await hyperliquidInfo({ type: 'userFillsByTime', user, startTime: start });
    if (!Array.isArray(batch) || batch.length === 0) break;
    let added = 0;
    for (const f of batch) {
      const k = String(f.tid ?? `${f.hash}-${f.time}-${f.oid}-${f.px}-${f.sz}`);
      if (!byKey.has(k)) {
        byKey.set(k, f);
        added++;
      }
    }
    if (batch.length < FILLS_PER_PAGE || added === 0) break;
    const lastTime = Math.max(...batch.map((f) => num(f.time)));
    if (lastTime <= start) break;
    start = lastTime; // fills sharing that millisecond are re-read and de-duplicated above
  }
  return [...byKey.values()];
}

function base(user, extra) {
  const ts = extra.ts;
  const iso = new Date(ts).toISOString();
  return {
    ts,
    date: iso.slice(0, 10), // UTC; the page recomputes these in your local time from `ts`
    time: iso.slice(11, 16),
    broker: 'Hyperliquid',
    account: user,
    asset_class: 'crypto',
    strategy: '',
    notes: null, // null = not reviewed yet
    chart: null,
    ...extra,
  };
}

module.exports = async (req, res) => {
  if (!requireAccess(req, res)) return;

  // A wallet address isn't a secret, so the page may send one directly.
  // Fall back to the server's own env var if the request didn't include one.
  const rawWallet = String(req.query.wallet || WALLET || '').trim().toLowerCase();
  if (!rawWallet) {
    return res.status(500).json({
      error: 'No wallet address provided. Connect one in the Accounts page, or set HYPERLIQUID_WALLET on the server.',
    });
  }
  if (!/^0x[0-9a-f]{40}$/.test(rawWallet)) {
    return res.status(500).json({
      error: 'That wallet address looks wrong — it should start with 0x and be 42 characters long.',
    });
  }
  const user = rawWallet;
  const w6 = user.slice(2, 8);

  try {
    const sinceMs = Number(req.query.since) > 0 ? Number(req.query.since) : 0;

    // Always read a full year of fills so whole positions can be rebuilt no matter how
    // recent `since` is. Only the positions that closed after `since` are sent back.
    const fills = await fetchAllFills(user, Date.now() - 365 * DAY);
    const { closed: closedGroups, open: openGroups } = groupFills(fills, `hl-${w6}`);

    const closed = closedGroups
      .filter((g) => g.closeTs >= sinceMs)
      .map((g) =>
        base(user, {
          id: g.id,
          ts: g.ts,
          closeTs: g.closeTs,
          symbol: g.coin,
          direction: g.dir,
          entry: round(g.entry) ?? 0,
          exit: round(g.exit),
          qty: round(g.qty),
          fees: round(g.fees),
          pnl_override: round(g.pnl), // closedPnl minus fees, so it matches how Bitunix is counted
          fillIds: g.fillIds,
        }),
      );

    // Currently open perp positions, plus total account value (balance).
    let open = [];
    let openOk = false;
    let balance = null;
    try {
      const state = await hyperliquidInfo({ type: 'clearinghouseState', user });
      balance = optNum(state?.marginSummary?.accountValue);
      const positions = (Array.isArray(state?.assetPositions) ? state.assetPositions : [])
        .map((p) => p?.position)
        .filter((p) => p && num(p.szi) !== 0);
      open = positions.map((p) => {
        const dir = num(p.szi) < 0 ? 'short' : 'long';
        const og = openGroups.get(String(p.coin));
        // Reuse the opening fill's id when we can see it, so this row is replaced
        // in place (not duplicated) when the position closes.
        const usable = og && og.dir === dir;
        return base(user, {
          id: usable ? og.id : `hl-${w6}-${p.coin}-open`,
          ts: usable ? og.ts : Date.now(),
          closeTs: null,
          symbol: String(p.coin ?? 'UNKNOWN'),
          direction: dir,
          entry: round(optNum(p.entryPx) ?? (usable ? og.entry : 0) ?? 0),
          exit: null,
          qty: Math.abs(num(p.szi)),
          fees: usable ? round(og.fees) : 0,
          fillIds: usable ? og.fillIds : [],
        });
      });
      openOk = true;
    } catch {
      // Keep the closed history even if the open-positions call fails.
    }

    // Spot balances live in a separate account on Hyperliquid, so perps accountValue
    // alone under-reports total capital. Add the spot USDC balance on top.
    // (Other spot tokens would need price conversion, which is skipped here.)
    try {
      const spot = await hyperliquidInfo({ type: 'spotClearinghouseState', user });
      const balances = Array.isArray(spot?.balances) ? spot.balances : [];
      const usdc = balances.find((b) => String(b.coin).toUpperCase() === 'USDC');
      balance = (balance ?? 0) + (usdc ? num(usdc.total) : 0);
    } catch {
      // If the spot call fails, the perps balance alone is still returned.
    }

    res.status(200).json({ trades: [...closed, ...open], balance, openOk });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Sync failed' });
  }
};
