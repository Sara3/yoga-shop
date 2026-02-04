# Yoga Commerce

x402 (on-chain payments) + Stripe + ACP (Agentic Commerce Protocol) demo for yoga classes and products. Exposes an HTTP API and an MCP server so AI agents can browse classes, products, and run checkout flows.

## Setup

```bash
cp .env.example .env
# Edit .env: SELLER_WALLET (Base mainnet address), STRIPE_SECRET_KEY (sk_test_... or sk_live_...)
npm install
npm run build
```

## Run locally

- **API:** `npm run dev` → http://localhost:3000  
- **MCP (stdio):** In another terminal, `npm run mcp`. Connect from Cursor/Inspector with command `npx`, args `ts-node`, `src/mcp-server.ts`, cwd project root.  
- **MCP (HTTP):** `npm run start:mcp` → MCP at http://localhost:3001/mcp (set `API_BASE_URL=http://localhost:3000` if API runs elsewhere).

## Deploy on Render

**If deploy fails with "Cannot find module ... dist/index.js"** — Render is not compiling TypeScript. In the Render dashboard, open the failing service → **Settings** → **Build & Deploy** → set **Build Command** to exactly:

```bash
npm install && npm run build
```

Save and trigger **Manual Deploy**. (Or use **Blueprint** → **Sync** to apply `render.yaml` so both services get this build command.)

**If deploy fails with "Missing SELLER_WALLET in .env"** — Set the env vars in Render. Open the **yoga-api** service → **Environment** → add `SELLER_WALLET` (your Base mainnet address that will receive USDC payments, e.g. `0x...`) and `STRIPE_SECRET_KEY` (e.g. `sk_test_...` or `sk_live_...`). Save; Render will redeploy.

---

1. Push this repo to GitHub (e.g. [Sara3/yoga-shop](https://github.com/Sara3/yoga-shop)).
2. In [Render](https://render.com): **New** → **Blueprint** → connect the repo. Render will create two web services from `render.yaml`:
   - **yoga-api** — HTTP API (classes, products, checkout, ACP).
   - **yoga-mcp** — MCP over Streamable HTTP; `API_BASE_URL` is set from the API service URL.
3. **Set environment variables** (required for app to start):
   - Open the **yoga-api** service in Render dashboard
   - Go to **Environment** (left sidebar)
   - Click **Add Environment Variable** and add:
     - **Key:** `SELLER_WALLET` → **Value:** Your Base mainnet address (your MetaMask address that will receive USDC payments, e.g. `0xc0f4fF27A67f2238eD0DbD3Fdcc6Ffc10F95698c`)
     - **Key:** `STRIPE_SECRET_KEY` → **Value:** Your Stripe key (e.g. `sk_test_51...` for testing or `sk_live_...` for real money)
   - Click **Save Changes** (Render will auto-redeploy)
4. Ensure **Build Command** is `npm install && npm run build` for both services (Blueprint sets this; if you created services manually, set it in Settings).
5. Deploy. After deploy you get:
   - **API URL:** `https://yoga-api.onrender.com`
   - **MCP URL:** `https://yoga-mcp.onrender.com/mcp`

## MCP URL (Streamable HTTP)

Use the MCP URL in any client that supports Streamable HTTP (e.g. Cursor, MCP Inspector):

- **Local:** `http://localhost:3001/mcp` (standalone MCP) or `http://localhost:3000/mcp` (same server as API)
- **Render:** `https://yoga-api.onrender.com/mcp` **or** `https://yoga-mcp.onrender.com/mcp` — the API server now exposes `/mcp` too, so either URL works.

In Cursor: add an MCP server with **URL** = that `/mcp` URL (Streamable HTTP). No command/args needed.

**If you get "Connection failed: 503"** — Try in order: (1) **Wait 30–60 seconds and retry** — on Render’s free tier the service sleeps after ~15 min inactivity; the first request wakes it and often returns 503 until it’s up. (2) **Wake it first** — open `https://<your-api>.onrender.com/health` in a browser, wait for it to load, then run the connection check again. (3) **Confirm deploy** — in the Render dashboard the service should show **Live** and the last deploy **succeeded** (no “Cannot find module dist/index.js”). For always-on, use a paid instance or a ping service (e.g. UptimeRobot) hitting `/health` every few minutes.

**If you get "SSE error: Non-200 status code (404)"** — Use **`https://yoga-api.onrender.com/mcp`** (the API URL + `/mcp`). The API server now serves MCP at `/mcp`, so this works even with a single Render service. Redeploy, then try the connection again.

## Tools (MCP)

| Tool | Purpose |
|------|--------|
| `browse_classes` | List yoga classes (x402) |
| `get_class_preview` / `get_class_full` | Preview or full video (full requires payment) |
| `browse_products` | List products (mat, strap) |
| `acp_create_checkout`, `acp_update_checkout`, `acp_complete_checkout`, `acp_cancel_checkout`, `acp_get_order` | ACP cart flow |
| `create_checkout` | Legacy Stripe redirect URL |
| `health` | API health |

## Configuration (Real Money Setup)

**Default setup uses real money:**
- **x402:** Uses `base` mainnet (real USDC) — real money payments
- **Stripe:** Use `sk_live_...` for real charges, or `sk_test_...` for testing

**Important Configuration:**

1. **SELLER_WALLET:** Set this to your MetaMask Base mainnet address (the address that will receive USDC payments). This is your "Buyer" account address from MetaMask when connected to Base network.

2. **x402 (Crypto payments for classes):**
   - Default network is `base` (mainnet, real USDC)
   - Default facilitator is `https://x402.org/facilitator` (works with Base mainnet)
   - Payments will be sent to your `SELLER_WALLET` address on Base mainnet
   - Make sure your wallet has some ETH for gas fees (even though payments are in USDC)

3. **Stripe (for products and ACP):**
   - Use `sk_live_...` for real money (production)
   - Use `sk_test_...` for testing
   - Set `STRIPE_WEBHOOK_SECRET` (whsec_...) from Dashboard → Webhooks
   - Add webhook endpoint `https://your-api.com/webhook` (POST, raw body)
   - ACP `complete_checkout` requires a real Stripe `payment_method` id (pm_xxx) as `payment_token`

4. **BASE_URL:** Set to your API base (e.g. `https://yoga-api.onrender.com`) so success/cancel and paywall URLs are correct.

5. **Content:** Set `CLASS_1_PREVIEW_URL`, `CLASS_1_FULL_URL`, etc. to real video URLs.

6. **CORS / rate limit:** Tighten `CORS_ORIGIN` and `RATE_LIMIT_MAX` as needed.

**For testing with testnet:**
- Set `X402_NETWORK=base-sepolia` to use Base Sepolia testnet (test USDC)
- Use `sk_test_...` Stripe keys for test mode

## Scripts

- `npm run build` — compile TypeScript
- `npm start` — run API (production)
- `npm run dev` — run API (dev)
- `npm run mcp` — run MCP over stdio
- `npm run start:mcp` — run MCP over HTTP
- `npm run test:e2e` — curl E2E tests
