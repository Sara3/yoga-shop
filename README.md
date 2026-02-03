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

1. Push this repo to GitHub (e.g. [Sara3/yoga-shop](https://github.com/Sara3/yoga-shop)).
2. In [Render](https://render.com): **New** → **Blueprint** → connect the repo. Render will create two web services from `render.yaml`:
   - **yoga-api** — HTTP API (classes, products, checkout, ACP).
   - **yoga-mcp** — MCP over Streamable HTTP; `API_BASE_URL` is set from the API service URL.
3. In the **yoga-api** service, set env: `SELLER_WALLET`, `STRIPE_SECRET_KEY`.
4. Deploy. After deploy you get:
   - **API URL:** `https://yoga-api.onrender.com`
   - **MCP URL:** `https://yoga-mcp.onrender.com/mcp`

## MCP URL (Streamable HTTP)

Use the MCP URL in any client that supports Streamable HTTP (e.g. Cursor, MCP Inspector):

- **Local:** `http://localhost:3001/mcp`
- **Render:** `https://<yoga-mcp-service>.onrender.com/mcp`

In Cursor: add an MCP server with **URL** = that `/mcp` URL (Streamable HTTP). No command/args needed.

## Tools (MCP)

| Tool | Purpose |
|------|--------|
| `browse_classes` | List yoga classes (x402) |
| `get_class_preview` / `get_class_full` | Preview or full video (full requires payment) |
| `browse_products` | List products (mat, strap) |
| `acp_create_checkout`, `acp_update_checkout`, `acp_complete_checkout`, `acp_cancel_checkout`, `acp_get_order` | ACP cart flow |
| `create_checkout` | Legacy Stripe redirect URL |
| `health` | API health |

## Scripts

- `npm run build` — compile TypeScript
- `npm start` — run API (production)
- `npm run dev` — run API (dev)
- `npm run mcp` — run MCP over stdio
- `npm run start:mcp` — run MCP over HTTP
- `npm run test:e2e` — curl E2E tests
