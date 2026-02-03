import Stripe from 'stripe';
import { getProduct } from '../lib/products';

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key?.startsWith('sk_')) {
      throw new Error('Missing or invalid STRIPE_SECRET_KEY in .env');
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
