# Yoga Commerce

x402 (on-chain payments) + Stripe + ACP (Agentic Commerce Protocol) demo for yoga classes and products. Exposes an HTTP API and an MCP server so AI agents can browse classes, products, and run checkout flows.

## Setup

```bash
cp .env.example .env
# Edit .env: SELLER_WALLET (Base Sepolia), STRIPE_SECRET_KEY (sk_test_...)
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

**If deploy fails with "Missing SELLER_WALLET in .env"** — Set the env vars in Render. Open the **yoga-api** service → **Environment** → add `SELLER_WALLET` (your Base Sepolia payout address, e.g. `0x...`) and `STRIPE_SECRET_KEY` (e.g. `sk_test_...`). Save; Render will redeploy.

---

1. Push this repo to GitHub (e.g. [Sara3/yoga-shop](https://github.com/Sara3/yoga-shop)).
2. In [Render](https://render.com): **New** → **Blueprint** → connect the repo. Render will create two web services from `render.yaml`:
   - **yoga-api** — HTTP API (classes, products, checkout, ACP).
   - **yoga-mcp** — MCP over Streamable HTTP; `API_BASE_URL` is set from the API service URL.
3. **Set environment variables** (required for app to start):
   - Open the **yoga-api** service in Render dashboard
   - Go to **Environment** (left sidebar)
   - Click **Add Environment Variable** and add:
     - **Key:** `SELLER_WALLET` → **Value:** Your Base Sepolia address (e.g. `0xc0f4fF27A67f2238eD0DbD3Fdcc6Ffc10F95698c`)
     - **Key:** `STRIPE_SECRET_KEY` → **Value:** Your Stripe test key (e.g. `sk_test_51...`)
   - Click **Save Changes** (Render will auto-redeploy)
4. **(Optional)** For automated testing: add `X402_DEMO_MODE` → `true` to enable demo mode for x402 payments.
5. Ensure **Build Command** is `npm install && npm run build` for both services (Blueprint sets this; if you created services manually, set it in Settings).
6. Deploy. After deploy you get:
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

## Automated testing / demo mode

Both payment flows support automated testing without real payments:

### Stripe (ACP) — already automated in test mode

When using a **test key** (`sk_test_...`), Stripe payments are automatically handled:
- Pass any non-`pm_xxx` token (e.g. `"demo"`, `"test"`, `"auto"`) to `acp_complete_checkout` → automatically uses Stripe test card `pm_card_visa`
- No real charges; works for automated testing and demos

**Example:**
```bash
# Create checkout
curl -X POST https://your-api.com/acp/checkout -d '{"productId":"mat","quantity":1}'
# → {"checkout_session_id":"acp_...", ...}

# Complete with demo token (test mode only)
curl -X POST https://your-api.com/acp/checkout/acp_.../complete \
  -d '{"payment_token":"demo"}'
# → Automatically uses test card, completes successfully
```

### x402 (crypto) — enable demo mode

Set `X402_DEMO_MODE=true` in your `.env` or Render env vars. Then:
- Pass `"demo"` as the `X-PAYMENT` header → bypasses blockchain verification
- Returns success with a demo transaction hash
- **Only works when `X402_DEMO_MODE=true`** (disabled by default for security)

**Example:**
```bash
# Get class (requires payment)
curl https://your-api.com/class/1/full
# → 402 with payment requirements

# Access with demo token (when X402_DEMO_MODE=true)
curl https://your-api.com/class/1/full \
  -H 'X-PAYMENT: demo'
# → {"content_url":"...", "tx_hash":"0x0000..."}
```

**⚠️ Security:** Never enable `X402_DEMO_MODE` in production. It's for testing/demos only.

## Going live (real money)

1. **Stripe:** Use live key `sk_live_...` and set `STRIPE_WEBHOOK_SECRET` (whsec_...) from Dashboard → Webhooks. Add endpoint `https://your-api.com/webhook` (POST, raw body). ACP complete-checkout in live mode requires a real Stripe `payment_method` id (pm_xxx) as `payment_token` — no demo token.
2. **x402:** Set `X402_NETWORK=base` for Base mainnet (real USDC). Use a mainnet facilitator if required; default is `https://x402.org/facilitator`. Set `SELLER_WALLET` to your mainnet payout address.
3. **BASE_URL:** Set to your API base (e.g. `https://yoga-api.onrender.com`) so success/cancel and paywall URLs are correct.
4. **Content:** Set `CLASS_1_PREVIEW_URL`, `CLASS_1_FULL_URL`, etc. to real video URLs.
5. **CORS / rate limit:** Tighten `CORS_ORIGIN` and `RATE_LIMIT_MAX` as needed.

## Scripts

- `npm run build` — compile TypeScript
- `npm start` — run API (production)
- `npm run dev` — run API (dev)
- `npm run mcp` — run MCP over stdio
- `npm run start:mcp` — run MCP over HTTP
- `npm run test:e2e` — curl E2E tests
