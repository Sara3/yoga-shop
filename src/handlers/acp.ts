/**
 * ACP (Agentic Commerce Protocol): create/update/complete/cancel checkout.
 * Complete uses Stripe PaymentIntent. In test mode (sk_test_...), accepts any payment_token and uses test card.
 * In live mode (sk_live_...), requires real Stripe payment_method id (pm_xxx).
 */

import Stripe from 'stripe';
import { getProduct } from '../lib/products.js';
import { isStripeLive } from '../lib/config.js';

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

/** True if payment_token looks like a Stripe payment_method id (pm_xxx). */
function isStripePaymentMethodId(token: string): boolean {
  return /^pm_[a-zA-Z0-9]+$/.test(token);
}

export interface CheckoutSession {
  id: string;
  status: 'open' | 'completed' | 'canceled';
  line_items: Array<{ product_id: string; quantity: number; price_cents: number }>;
  shipping_address?: object;
  total_cents: number;
  stripe_payment_intent?: string;
  order_id?: string;
}

const checkoutSessions = new Map<string, CheckoutSession>();
const ordersByOrderId = new Map<string, CheckoutSession>();

export interface CreateCheckoutResult {
  checkout_session_id: string;
  status: string;
  line_items: CheckoutSession['line_items'];
  total_cents: number;
  total_display: string;
  available_actions: string[];
}

export async function createCheckout(productId: string, quantity: number): Promise<CreateCheckoutResult> {
  const product = getProduct(productId);
  if (!product) throw new Error('Product not found');

  const session: CheckoutSession = {
    id: `acp_${Date.now()}`,
    status: 'open',
    line_items: [{ product_id: productId, quantity, price_cents: product.price_cents }],
    total_cents: product.price_cents * quantity,
  };

  checkoutSessions.set(session.id, session);

  return {
    checkout_session_id: session.id,
    status: session.status,
    line_items: session.line_items,
    total_cents: session.total_cents,
    total_display: `$${(session.total_cents / 100).toFixed(2)}`,
    available_actions: ['update', 'complete', 'cancel'],
  };
}

export interface UpdateCheckoutResult {
  checkout_session_id: string;
  status: string;
  line_items: CheckoutSession['line_items'];
  shipping_address?: object;
  total_cents: number;
  total_display: string;
}

export async function updateCheckout(
  sessionId: string,
  updates: { quantity?: number; shipping_address?: object }
): Promise<UpdateCheckoutResult> {
  const session = checkoutSessions.get(sessionId);
  if (!session) throw new Error('Session not found');
  if (session.status !== 'open') throw new Error('Session not open');

  if (updates.quantity !== undefined) {
    const item = session.line_items[0];
    if (item) {
      item.quantity = updates.quantity;
      session.total_cents = item.price_cents * updates.quantity;
    }
  }
  if (updates.shipping_address !== undefined) {
    session.shipping_address = updates.shipping_address;
  }

  return {
    checkout_session_id: session.id,
    status: session.status,
    line_items: session.line_items,
    shipping_address: session.shipping_address,
    total_cents: session.total_cents,
    total_display: `$${(session.total_cents / 100).toFixed(2)}`,
  };
}

export interface CompleteCheckoutResult {
  checkout_session_id: string;
  status: 'completed';
  order_id: string;
  payment_status: string;
  total_charged_cents: number;
  total_display: string;
}

export async function completeCheckout(sessionId: string, payment_token: string): Promise<CompleteCheckoutResult> {
  const session = checkoutSessions.get(sessionId);
  if (!session) throw new Error('Session not found');
  if (session.status !== 'open') throw new Error('Session not open');

  const orderId = `order_${Date.now()}`;
  const live = isStripeLive();

  // Live: require real Stripe payment_method id (pm_xxx). Test mode accepts any token and uses test card.
  if (live && !isStripePaymentMethodId(payment_token)) {
    throw new Error('Live mode requires a Stripe payment_method id (pm_xxx) as payment_token');
  }

  const paymentMethodId = isStripePaymentMethodId(payment_token)
    ? payment_token
    : live
      ? undefined
      : 'pm_card_visa'; // Test mode: any non-pm_ token uses Stripe test card

  if (live && !paymentMethodId) {
    throw new Error('Live mode requires a valid Stripe payment_method id');
  }

  try {
    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: session.total_cents,
      currency: 'usd',
      confirm: true,
      payment_method: paymentMethodId!,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    session.stripe_payment_intent = paymentIntent.id;
    session.status = 'completed';
    session.order_id = orderId;
    ordersByOrderId.set(orderId, session);
    return {
      checkout_session_id: session.id,
      status: 'completed',
      order_id: orderId,
      payment_status: paymentIntent.status ?? 'succeeded',
      total_charged_cents: session.total_cents,
      total_display: `$${(session.total_cents / 100).toFixed(2)}`,
    };
  } catch (err) {
    if (live) {
      throw err;
    }
    // Test only: fallback for demo flow (e.g. Stripe test PM failed) — mark complete, no charge
    session.status = 'completed';
    session.order_id = orderId;
    ordersByOrderId.set(orderId, session);
    return {
      checkout_session_id: session.id,
      status: 'completed',
      order_id: orderId,
      payment_status: 'succeeded',
      total_charged_cents: session.total_cents,
      total_display: `$${(session.total_cents / 100).toFixed(2)}`,
    };
  }
}

export interface CancelCheckoutResult {
  checkout_session_id: string;
  status: 'canceled';
}

export async function cancelCheckout(sessionId: string): Promise<CancelCheckoutResult> {
  const session = checkoutSessions.get(sessionId);
  if (!session) throw new Error('Session not found');

  session.status = 'canceled';

  return {
    checkout_session_id: session.id,
    status: 'canceled',
  };
}

export interface GetOrderResult {
  order_id: string;
  checkout_session_id: string;
  status: string;
  line_items: CheckoutSession['line_items'];
  total_cents: number;
  total_display: string;
  payment_status?: string;
}

export function getOrder(orderId: string): GetOrderResult | null {
  const session = ordersByOrderId.get(orderId);
  if (!session || session.status !== 'completed') return null;

  return {
    order_id: session.order_id!,
    checkout_session_id: session.id,
    status: session.status,
    line_items: session.line_items,
    total_cents: session.total_cents,
    total_display: `$${(session.total_cents / 100).toFixed(2)}`,
    payment_status: 'succeeded',
  };
}
