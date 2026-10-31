# Tape — Bitunix + Hyperliquid trading journal

This is a much smaller setup than the Lovable version: one static HTML page
(`public/index.html`) and one serverless function (`api/trades.js`) that
holds your Bitunix API key and signs requests on your behalf. No framework,
no build step, no auth layer to fight with.

## How it works

- `public/index.html` — the whole app (UI, logic, localStorage). This is
  what you open in your browser.
- `api/trades.js` — runs on Vercel's servers, not in your browser. It reads
  `BITUNIX_API_KEY` / `BITUNIX_API_SECRET` from environment variables, signs
  a request to Bitunix's real API, and returns clean trade data as JSON.
  Your keys never appear in any file you commit, and never reach the browser.

## Deploy steps

1. Push this folder to a new GitHub repo (same flow as before):
   ```
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin https://github.com/<you>/tape-server.git
   git push -u origin main
   ```
2. Go to https://vercel.com → **Add New → Project** → import that repo.
3. Vercel will auto-detect the `api/` folder — no framework preset needed,
   leave build settings as-is.
4. Before deploying, open **Environment Variables** and add `BITUNIX_API_KEY` and `BITUNIX_API_SECRET`
   (optionally `HYPERLIQUID_WALLET`)
      (values from your Bitunix account → API Management)
5. Click **Deploy**.

## Using it

Open your deployed URL, go to **Connections**, click **Sync now**. It calls
`/api/trades`, which fetches your real closed + open positions from Bitunix
and merges them into your local trade log.

## Files

- `public/index.html`, `public/app.js` (app, sync, storage), `public/charts.js` (analytics + charts)
- `public/tailwind.css` — prebuilt styles. After adding new Tailwind classes run `npm run build:css` and commit it.
- `api/trades.js` (Bitunix), `api/hyperliquid.js` (Hyperliquid), `lib/` shared helpers.

## Security notes

- There is **no access key**: anyone with your URL can read your trades and balance. Keep the URL private or turn on Vercel password protection.
- Give the Bitunix API key **read-only** permissions — this app never places trades.
- Never commit a real `.env` file. `.gitignore` already excludes it.
