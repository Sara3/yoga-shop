import 'dotenv/config';
import express from 'express';
import { getPaywallHtml } from 'x402/paywall';
import { toJsonSafe } from 'x402/shared';
import { classes, getClass } from './lib/content';
import { products } from './lib/products';
import {
  verifyPayment,
  buildPaymentRequirements,
  paymentRequirementsToAccepts,
} from './handlers/x402';
import { createCheckoutSession } from './handlers/stripe';
import {
  createCheckout as acpCreateCheckout,
  updateCheckout as acpUpdateCheckout,
  completeCheckout as acpCompleteCheckout,
  cancelCheckout as acpCancelCheckout,
  getOrder as acpGetOrder,
} from './handlers/acp';

const app = express();
app.use(express.json());

const sellerWallet = process.env.SELLER_WALLET as `0x${string}`;
if (!sellerWallet) {
  console.error('Missing SELLER_WALLET in .env');
  process.exit(1);
}

// Home: links to classes (open in browser for paywall)
app.get('/', (_req, res) => {
  const list = classes
    .map(
      (c) =>
        `<li><a href="/class/${c.id}/full">${c.title}</a> — ${c.price} (full video)</li>`
    )
    .join('\n');
  res.set('Content-Type', 'text/html').send(`
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Yoga Commerce</title></head>
<body>
  <h1>Yoga classes</h1>
  <p>Click a class to pay with MetaMask (Base Sepolia, test USDC).</p>
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
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host') ?? 'http://localhost:3000'}`;
  const { productId, quantity = 1, successUrl, cancelUrl } = req.body as {
    productId?: string;
    quantity?: number;
    successUrl?: string;
    cancelUrl?: string;
  };
  if (!productId) {
    return res.status(400).json({ error: 'productId is required' });
  }
  try {
    const { url } = await createCheckoutSession({
      productId,
      quantity,
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
    return res.status(500).json({ error: message });
  }
});

// --- ACP (Agentic Commerce Protocol) — create/update/complete/cancel checkout ---
app.post('/acp/checkout', async (req, res) => {
  const { productId, quantity = 1 } = req.body as { productId?: string; quantity?: number };
  if (!productId) {
    return res.status(400).json({ error: 'productId is required' });
  }
  try {
    const result = await acpCreateCheckout(productId, quantity);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Create checkout failed';
    if (message.includes('not found')) return res.status(404).json({ error: message });
    return res.status(500).json({ error: message });
  }
});

app.patch('/acp/checkout/:sessionId', async (req, res) => {
  const { quantity, shipping_address } = req.body as { quantity?: number; shipping_address?: object };
  try {
    const result = await acpUpdateCheckout(req.params.sessionId, { quantity, shipping_address });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update checkout failed';
    if (message.includes('not found') || message.includes('not open')) return res.status(404).json({ error: message });
    return res.status(500).json({ error: message });
  }
});

app.post('/acp/checkout/:sessionId/complete', async (req, res) => {
  const { payment_token } = req.body as { payment_token?: string };
  if (!payment_token) {
    return res.status(400).json({ error: 'payment_token is required' });
  }
  try {
    const result = await acpCompleteCheckout(req.params.sessionId, payment_token);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Complete checkout failed';
    if (message.includes('not found') || message.includes('not open')) return res.status(404).json({ error: message });
    if (message.includes('STRIPE_SECRET_KEY')) return res.status(503).json({ error: message });
    return res.status(500).json({ error: message });
  }
});

app.post('/acp/checkout/:sessionId/cancel', async (req, res) => {
  try {
    const result = await acpCancelCheckout(req.params.sessionId);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cancel checkout failed';
    if (message.includes('not found')) return res.status(404).json({ error: message });
    return res.status(500).json({ error: message });
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

  const resourceUrl = `${req.protocol}://${req.get('host') ?? ''}${req.path}`;
  const paymentHeader = req.header('X-PAYMENT');

  if (!paymentHeader) {
    const paymentRequirements = buildPaymentRequirements({
      price: c.price,
      network: 'base-sepolia',
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
        testnet: true,
      });
      return res.status(402).set('Content-Type', 'text/html').send(html);
    }
    return res.status(402).json({
      x402Version: 1,
      error: 'X-PAYMENT header is required',
      accepts: paymentRequirementsToAccepts(paymentRequirements),
    });
  }

  const verification = await verifyPayment(
    paymentHeader,
    c.price_usdc * 1_000_000,
    sellerWallet,
    {
      resource: resourceUrl,
      price: c.price,
      network: 'base-sepolia',
      description: `${c.title} — full video`,
    }
  );

  if (!verification.valid) {
    return res.status(402).json({ error: 'Invalid payment' });
  }

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

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Running on http://localhost:${port}`));
