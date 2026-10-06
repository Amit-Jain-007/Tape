// /api/hyperliquid — pulls real trade history from Hyperliquid's public
// info API. Unlike Bitunix, this needs no secret key at all — Hyperliquid's
// info endpoint is read-only and public, you just give it a wallet address.

const WALLET = process.env.HYPERLIQUID_WALLET;

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // A wallet address isn't a secret, so the browser is allowed to send one
  // directly. Fall back to the server's own env var if the request didn't
  // include one.
  const rawWallet = (req.query.wallet || WALLET || '').trim().toLowerCase();
  if (!rawWallet) {
    return res.status(500).json({ error: 'No wallet address provided. Connect one in the Accounts page, or set HYPERLIQUID_WALLET on the server.' });
  }
  if (!/^0x[0-9a-f]{40}$/.test(rawWallet)) {
    return res.status(500).json({ error: 'That wallet address looks wrong — it should start with 0x and be 42 characters long.' });
  }
  const user = rawWallet;

  try {
    const sinceMs = req.query.since ? Number(req.query.since) : Date.now() - 90 * 86400000;

    // Closing fills carry the realized P&L for the position they close.
    const fills = await hyperliquidInfo({ type: 'userFillsByTime', user, startTime: sinceMs });
    const closed = (Array.isArray(fills) ? fills : [])
      .filter((f) => num(f.closedPnl) !== 0)
      .map((f) => {
        const atMs = num(f.time);
        const at = new Date(atMs).toISOString();
        return {
          id: String(f.tid ?? `${f.hash}-${f.time}`),
          symbol: String(f.coin ?? 'UNKNOWN'),
          // A closing "sell" ends a long; a closing "buy" ends a short.
          direction: String(f.dir ?? '').toLowerCase().includes('short')
            ? 'short'
            : String(f.side ?? '').toUpperCase() === 'A'
              ? 'long'
              : 'short',
          date: at.slice(0, 10),
          time: at.slice(11, 16),
          entry: 0,
          exit: optNum(f.px) ?? 0,
          qty: optNum(f.sz) ?? 0,
          fees: Math.abs(num(f.fee)),
          broker: 'Hyperliquid',
          asset_class: 'crypto',
          strategy: '',
          notes: null,
          chart: null,
          pnl_override: num(f.closedPnl),
        };
      });

    // Currently open perp positions.
    let open = [];
    try {
      const state = await hyperliquidInfo({ type: 'clearinghouseState', user });
      const positions = Array.isArray(state?.assetPositions) ? state.assetPositions : [];
      open = positions
        .map((p) => p?.position)
        .filter((p) => p && num(p.szi) !== 0)
        .map((p) => ({
          id: `${String(p.coin)}-open`,
          symbol: String(p.coin ?? 'UNKNOWN'),
          direction: num(p.szi) < 0 ? 'short' : 'long',
          date: new Date().toISOString().slice(0, 10),
          time: new Date().toISOString().slice(11, 16),
          entry: optNum(p.entryPx) ?? 0,
          exit: null,
          qty: Math.abs(num(p.szi)) || 0,
          fees: 0,
          broker: 'Hyperliquid',
          asset_class: 'crypto',
          strategy: '',
          notes: null,
          chart: null,
        }));
    } catch {
      // Keep the closed history even if the open-positions call fails.
    }

    res.status(200).json({ trades: [...closed, ...open] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Sync failed' });
  }
};
