# Tape — Bitunix-connected trading journal

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
4. Before deploying, open **Environment Variables** and add:
   - `BITUNIX_API_KEY`
   - `BITUNIX_API_SECRET`
   (values from your Bitunix account → API Management)
5. Click **Deploy**.

## Using it

Open your deployed URL, go to **Connections**, click **Sync now**. It calls
`/api/trades`, which fetches your real closed + open positions from Bitunix
and merges them into your local trade log.

## Security notes

- `api/trades.js` currently allows requests from any origin
  (`Access-Control-Allow-Origin: *`). Once your frontend has a fixed URL,
  tighten this to that exact URL in `api/trades.js`.
- Give the Bitunix API key **read-only** permissions if Bitunix offers that
  option — this app never needs to place trades, only read history.
- Never commit a real `.env` file. `.gitignore` already excludes it.
