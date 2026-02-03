import Stripe from 'stripe';
import { getProduct } from '../lib/products.js';

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key?.startsWith('sk_test_') && !key?.startsWith('sk_live_')) {
      throw new Error('Missing or invalid STRIPE_SECRET_KEY (use sk_test_... or sk_live_...)');
    }
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

export interface CreateCheckoutParams {
  productId: string;
  quantity?: number;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Create a Stripe Checkout Session and return the checkout URL.
 */
export async function createCheckoutSession(params: CreateCheckoutParams): Promise<{ url: string }> {
  const { productId, quantity = 1, successUrl, cancelUrl } = params;
  const product = getProduct(productId);
  if (!product) {
    throw new Error(`Product not found: ${productId}`);
  }

  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: product.price_cents,
          product_data: {
            name: product.name,
          },
        },
        quantity,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  if (!session.url) {
    throw new Error('Stripe did not return a checkout URL');
  }

  return { url: session.url };
}

/** Verify webhook signature and return event, or null if invalid. */
export function verifyWebhook(payload: Buffer | string, signature: string): Stripe.Event | null {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret?.startsWith('whsec_')) {
    return null;
  }
  try {
    const stripe = getStripe();
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      secret
    ) as Stripe.Event;
  } catch {
    return null;
  }
}

/** Handle Stripe webhook (checkout.session.completed, payment_intent.succeeded). Call with raw body. */
export function handleWebhookEvent(event: Stripe.Event): void {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      // In production you might persist order completion here (e.g. by session.id or client_reference_id).
      console.log('[Stripe webhook] checkout.session.completed', session.id);
      break;
    }
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent;
      console.log('[Stripe webhook] payment_intent.succeeded', pi.id);
      break;
    }
    default:
      console.log('[Stripe webhook] unhandled', event.type);
  }
}
