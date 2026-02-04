import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { getPaywallHtml } from 'x402/paywall';
import { toJsonSafe } from 'x402/shared';
import {
  BASE_URL,
  X402_NETWORK,
  isX402Testnet,
  CORS_ORIGIN,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  isProduction,
} from './lib/config.js';
import { classes, getClass } from './lib/content.js';
import { products } from './lib/products.js';
import {
  verifyPayment,
  buildPaymentRequirements,
  paymentRequirementsToAccepts,
} from './handlers/x402.js';
import { createCheckoutSession, verifyWebhook, handleWebhookEvent } from './handlers/stripe.js';
import {
  createCheckout as acpCreateCheckout,
  updateCheckout as acpUpdateCheckout,
  completeCheckout as acpCompleteCheckout,
  cancelCheckout as acpCancelCheckout,
  getOrder as acpGetOrder,
} from './handlers/acp.js';
import { createYogaMcpServer } from './mcp-tools.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const app = express();

// Stripe webhook needs raw body for signature verification — register before json()
app.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  (req: express.Request, res: express.Response) => {
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') {
      res.status(400).json({ error: 'Missing Stripe-Signature' });
      return;
    }
    const payload = (req as express.Request & { body: Buffer }).body;
    if (!Buffer.isBuffer(payload)) {
      res.status(400).json({ error: 'Invalid body' });
      return;
    }
    try {
      const event = verifyWebhook(payload, signature);
      if (!event) {
        res.status(400).json({ error: 'Invalid signature' });
        return;
      }
      handleWebhookEvent(event);
      res.json({ received: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('STRIPE_')) {
        res.status(503).json({ error: 'Webhook not configured (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET)' });
        return;
      }
      res.status(500).json({ error: 'Webhook handler error' });
    }
  }
);

app.use(express.json());
app.use(cors({ origin: CORS_ORIGIN }));

if (RATE_LIMIT_MAX > 0) {
  app.use(
    rateLimit({
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );
}

const sellerWallet = process.env.SELLER_WALLET as `0x${string}`;
if (!sellerWallet) {
  console.error('Missing SELLER_WALLET environment variable.');
  console.error('Set it in Render: Dashboard → yoga-api → Environment → Add SELLER_WALLET');
  process.exit(1);
}

function resolveBaseUrl(req: express.Request): string {
  if (BASE_URL) return BASE_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host') ?? 'http://localhost:3000'}`;
}

// Home: links to classes (open in browser for paywall)
app.get('/', (_req, res) => {
  const list = classes
    .map(
      (c) =>
        `<li><a href="/class/${c.id}/full">${c.title}</a> — ${c.price} (full video)</li>`
    )
    .join('\n');
  const networkLabel = isX402Testnet ? 'Base Sepolia, test USDC' : 'Base mainnet, real USDC';
  res.set('Content-Type', 'text/html').send(`
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Yoga Commerce</title></head>
<body>
  <h1>Yoga classes</h1>
  <p>Click a class to pay with MetaMask (${networkLabel}).</p>
  <ul>${list}</ul>
  <p><a href="/classes">/classes</a> (JSON) · <a href="/products">/products</a> (JSON) · <a href="/health">/health</a></p>
</body>
</html>`);
});

// Free: list classes (id, title, price)
app.get('/classes', (_req, res) => {
  res.json({
    classes: classes.map((c) => ({ id: c.id, title: c.title, price: c.price })),
  });
});

// Stripe: list products (mat + strap)
app.get('/products', (_req, res) => {
  res.json({
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      price_display: p.price_display,
    })),
  });
});

// Stripe: create checkout session, return Stripe URL
app.post('/checkout', async (req, res) => {
  const baseUrl = resolveBaseUrl(req);
  const { productId, quantity = 1, successUrl, cancelUrl } = req.body as {
    productId?: string;
    quantity?: number;
    successUrl?: string;
    cancelUrl?: string;
  };
  if (!productId) {
    return res.status(400).json({ error: 'productId is required' });
  }
  const qty = Math.min(Math.max(1, Math.floor(Number(quantity)) || 1), 999);
  try {
    const { url } = await createCheckoutSession({
      productId,
      quantity: qty,
      successUrl: successUrl ?? `${baseUrl}/success`,
      cancelUrl: cancelUrl ?? `${baseUrl}/`,
    });
    res.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed';
    if (message.includes('STRIPE_SECRET_KEY')) {
      return res.status(503).json({ error: message });
    }
    if (message.includes('not found')) {
      return res.status(404).json({ error: message });
    }
    return res.status(500).json({ error: isProduction ? 'Checkout failed' : message });
  }
});

// --- ACP (Agentic Commerce Protocol) — create/update/complete/cancel checkout ---
app.post('/acp/checkout', async (req, res) => {
  const { productId, quantity = 1 } = req.body as { productId?: string; quantity?: number };
  if (!productId) {
    return res.status(400).json({ error: 'productId is required' });
  }
  const qty = Math.min(Math.max(1, Math.floor(Number(quantity)) || 1), 999);
  try {
    const result = await acpCreateCheckout(productId, qty);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Create checkout failed';
    if (message.includes('not found')) return res.status(404).json({ error: message });
    return res.status(500).json({ error: isProduction ? 'Create checkout failed' : message });
  }
});

app.patch('/acp/checkout/:sessionId', async (req, res) => {
  const { quantity, shipping_address } = req.body as { quantity?: number; shipping_address?: object };
  const qty = quantity !== undefined ? Math.min(Math.max(1, Math.floor(Number(quantity)) || 1), 999) : undefined;
  try {
    const result = await acpUpdateCheckout(req.params.sessionId, { quantity: qty, shipping_address });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update checkout failed';
    if (message.includes('not found') || message.includes('not open')) return res.status(404).json({ error: message });
    return res.status(500).json({ error: isProduction ? 'Update checkout failed' : message });
  }
});

app.post('/acp/checkout/:sessionId/complete', async (req, res) => {
  const { payment_token, customer } = req.body as { payment_token?: string; customer?: string };
  if (!payment_token) {
    return res.status(400).json({ error: 'payment_token is required' });
  }
  try {
    const result = await acpCompleteCheckout(req.params.sessionId, payment_token, customer);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Complete checkout failed';
    if (message.includes('not found') || message.includes('not open')) return res.status(404).json({ error: message });
    if (message.includes('STRIPE_SECRET_KEY')) return res.status(503).json({ error: message });
    if (message.includes('Live mode') || message.includes('payment_method')) return res.status(400).json({ error: message });
    return res.status(500).json({ error: isProduction ? 'Complete checkout failed' : message });
  }
});

app.post('/acp/checkout/:sessionId/cancel', async (req, res) => {
  try {
    const result = await acpCancelCheckout(req.params.sessionId);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cancel checkout failed';
    if (message.includes('not found')) return res.status(404).json({ error: message });
    return res.status(500).json({ error: isProduction ? 'Cancel checkout failed' : message });
  }
});

app.get('/acp/order/:orderId', (req, res) => {
  const order = acpGetOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

// Free: preview URL for a class
app.get('/class/:id/preview', (req, res) => {
  const c = getClass(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json({ preview_url: c.preview_url });
});

// Protected: full content — manual 402 + verification (returns tx_hash)
app.get('/class/:id/full', async (req, res) => {
  const c = getClass(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });

  const baseUrl = resolveBaseUrl(req);
  const resourceUrl = `${baseUrl}${req.path}`;
  const paymentHeader = req.header('X-PAYMENT');

  if (!paymentHeader) {
    const paymentRequirements = buildPaymentRequirements({
      price: c.price,
      network: X402_NETWORK,
      payTo: sellerWallet,
      resource: resourceUrl,
      description: `${c.title} — full video`,
      method: 'GET',
    });
    const acceptHeader = req.header('Accept') ?? '';
    const isBrowser = acceptHeader.includes('text/html');
    if (isBrowser) {
      const html = getPaywallHtml({
        amount: c.price_usdc,
        paymentRequirements: toJsonSafe(paymentRequirements) as typeof paymentRequirements,
        currentUrl: resourceUrl,
        testnet: isX402Testnet,
      });
      return res.status(402).set('Content-Type', 'text/html').send(html);
    }
    return res.status(402).json({
      x402Version: 1,
      error: 'X-PAYMENT header is required',
      accepts: paymentRequirementsToAccepts(paymentRequirements),
    });
  }

  console.log('[API] /class/:id/full - Payment header received');
  console.log('[API] Class ID:', req.params.id);
  console.log('[API] Class price:', c.price, '(', c.price_usdc, 'USDC)');
  console.log('[API] Expected amount (microUSDC):', c.price_usdc * 1_000_000);
  console.log('[API] Seller wallet:', sellerWallet);
  console.log('[API] Network:', X402_NETWORK);
  console.log('[API] Payment header length:', paymentHeader.length);
  console.log('[API] Payment header preview:', paymentHeader.substring(0, 100) + '...');

  const verification = await verifyPayment(
    paymentHeader,
    c.price_usdc * 1_000_000,
    sellerWallet,
    {
      resource: resourceUrl,
      price: c.price,
      network: X402_NETWORK,
      description: `${c.title} — full video`,
    }
  );

  if (!verification.valid) {
    console.error('[API] ✗ Payment verification failed for class:', req.params.id);
    return res.status(402).json({ error: 'Invalid payment' });
  }

  console.log('[API] ✓ Payment verified successfully for class:', req.params.id);
  console.log('[API] Transaction hash:', verification.txHash);

  res.json({
    content_url: c.full_url,
    tx_hash: verification.txHash,
  });
});

app.get('/success', (_req, res) => {
  res.set('Content-Type', 'text/html').send(`
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Payment successful</title></head>
<body>
  <h1>Payment successful</h1>
  <p>Thank you for your purchase. Check your Stripe Dashboard for the payment.</p>
  <p><a href="/">Back to home</a></p>
</body>
</html>`);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// MCP over Streamable HTTP at /mcp — so one URL serves both API and MCP (e.g. https://yoga-api.onrender.com/mcp)
app.all(/^\/mcp(\/.*)?$/, async (req: express.Request, res: express.Response) => {
  try {
    const apiBase = BASE_URL || resolveBaseUrl(req);
    const server = createYogaMcpServer(apiBase);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, (req as express.Request & { body?: unknown }).body);
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
  } catch (err) {
    console.error('MCP request error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

// Production: do not send stack traces to client
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (isProduction) {
    res.status(500).json({ error: 'Internal server error' });
  } else {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Running on http://localhost:${port}`));
