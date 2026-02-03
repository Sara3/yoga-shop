/**
 * App config from env. Use this everywhere instead of process.env for test vs live.
 */

const raw = process.env;

export const NODE_ENV = raw.NODE_ENV || 'development';
export const isProduction = NODE_ENV === 'production';

/** Stripe live key (sk_live_...) = real money. Test key (sk_test_...) = test mode. */
export function isStripeLive(): boolean {
  const key = raw.STRIPE_SECRET_KEY;
  return !!key?.startsWith('sk_live_');
}

/** Base URL for success/cancel redirects and paywall. Set in production. */
export const BASE_URL = raw.BASE_URL || '';

/** x402 network: base-sepolia (testnet) or base (mainnet, real USDC). */
export const X402_NETWORK = (raw.X402_NETWORK || 'base-sepolia') as 'base-sepolia' | 'base';
export const isX402Testnet = X402_NETWORK === 'base-sepolia';

/** Facilitator URL. Default public facilitator; override for custom. */
export const FACILITATOR_URL = raw.FACILITATOR_URL || 'https://x402.org/facilitator';

/** x402 demo mode: if true, allows demo token "demo" to bypass payment verification (testing only). */
export const X402_DEMO_MODE = raw.X402_DEMO_MODE === 'true' || raw.X402_DEMO_MODE === '1';

/** CORS origin. Empty = same-origin only; * = allow all; or comma-separated list. */
export const CORS_ORIGIN = raw.CORS_ORIGIN ?? '*';

/** Rate limit: max requests per window (default 100). Set to 0 to disable. */
export const RATE_LIMIT_MAX = parseInt(raw.RATE_LIMIT_MAX || '100', 10);
export const RATE_LIMIT_WINDOW_MS = parseInt(raw.RATE_LIMIT_WINDOW_MS || '60000', 10);
