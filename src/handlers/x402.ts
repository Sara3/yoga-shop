/**
 * x402 payment verification using the facilitator (verify + settle).
 * Uses x402 package; CDP SDK is available for optional custom logic.
 */

import { getAddress } from 'viem';
import { exact } from 'x402/schemes';
import {
  processPriceToAtomicAmount,
  findMatchingPaymentRequirements,
  toJsonSafe,
} from 'x402/shared';
import { useFacilitator } from 'x402/verify';
import type { PaymentPayload, PaymentRequirements } from 'x402/types';

import { FACILITATOR_URL, X402_NETWORK } from '../lib/config.js';

const X402_VERSION = 1;

export interface VerifyPaymentResult {
  valid: boolean;
  txHash?: string;
}

export interface PaymentRequirementsInput {
  price: string;
  network: string;
  payTo: string;
  resource: string;
  description?: string;
  method?: string;
}

/**
 * Build payment requirements for EVM (base-sepolia) for 402 response and verification.
 */
export function buildPaymentRequirements(input: PaymentRequirementsInput): PaymentRequirements[] {
  const { price, network, payTo, resource, description = '', method = 'GET' } = input;
  console.log('[x402] Building payment requirements');
  console.log('[x402] Input price:', price);
  console.log('[x402] Input network:', network);
  console.log('[x402] Input payTo:', payTo);
  console.log('[x402] Input resource:', resource);
  
  const result = processPriceToAtomicAmount(price, network as 'base-sepolia' | 'base');
  if ('error' in result) {
    console.error('[x402] ✗ Failed to process price to atomic amount:', result.error);
    throw new Error(result.error);
  }
  const { maxAmountRequired, asset } = result;
  console.log('[x402] Processed amount (atomic):', maxAmountRequired);
  console.log('[x402] Asset address:', asset.address);
  console.log('[x402] Asset details:', JSON.stringify(asset, null, 2));
  
  if (!('eip712' in asset) || !asset.eip712) {
    console.error('[x402] ✗ Asset missing eip712 data');
    throw new Error('EVM asset with eip712 required');
  }
  
  const requirements = [
    {
      scheme: 'exact',
      network: network as 'base-sepolia' | 'base',
      maxAmountRequired,
      resource,
      description,
      mimeType: '',
      payTo: getAddress(payTo as `0x${string}`),
      maxTimeoutSeconds: 60,
      asset: getAddress(asset.address as `0x${string}`),
      outputSchema: {
        input: {
          type: 'http',
          method,
          discoverable: true,
        },
        output: undefined,
      },
      extra: asset.eip712,
    },
  ];
  
  console.log('[x402] ✓ Payment requirements built successfully');
  console.log('[x402] Requirements:', JSON.stringify(requirements, null, 2));
  
  return requirements;
}

/**
 * Verify and settle payment via facilitator. Returns valid + txHash on success.
 */
export async function verifyPayment(
  paymentProof: string,
  expectedAmount: number,
  expectedRecipient: string,
  options: { resource: string; price: string; network: string; description?: string }
): Promise<VerifyPaymentResult> {
  const { resource, price, network, description = '' } = options;
  const facilitator = { url: FACILITATOR_URL as `${string}://${string}` };
  const { verify, settle } = useFacilitator(facilitator);

  console.log('[x402] Payment verification started');
  console.log('[x402] Expected amount:', expectedAmount, 'microUSDC');
  console.log('[x402] Expected recipient:', expectedRecipient);
  console.log('[x402] Price:', price);
  console.log('[x402] Network:', network);
  console.log('[x402] Resource:', resource);
  console.log('[x402] Payment proof length:', paymentProof.length);
  console.log('[x402] Payment proof preview:', paymentProof.substring(0, 100) + '...');

  // Step 1: Decode payment proof
  let decodedPayment: PaymentPayload;
  try {
    decodedPayment = exact.evm.decodePayment(paymentProof) as PaymentPayload;
    (decodedPayment as PaymentPayload & { x402Version?: number }).x402Version = X402_VERSION;
    console.log('[x402] ✓ Payment decoded successfully');
    console.log('[x402] Decoded payment (full):', JSON.stringify(decodedPayment, null, 2));
    // Try to access properties safely
    const decodedAny = decodedPayment as any;
    if (decodedAny.network) console.log('[x402] Decoded payment network:', decodedAny.network);
    if (decodedAny.asset) console.log('[x402] Decoded payment asset:', decodedAny.asset);
    if (decodedAny.amount) console.log('[x402] Decoded payment amount:', decodedAny.amount);
    if (decodedAny.payTo) console.log('[x402] Decoded payment payTo:', decodedAny.payTo);
    if (decodedAny.payload) {
      console.log('[x402] Decoded payment payload:', JSON.stringify(decodedAny.payload, null, 2));
      if (decodedAny.payload.asset) console.log('[x402] Payload asset:', decodedAny.payload.asset);
      if (decodedAny.payload.amount) console.log('[x402] Payload amount:', decodedAny.payload.amount);
      if (decodedAny.payload.payTo) console.log('[x402] Payload payTo:', decodedAny.payload.payTo);
    }
  } catch (error) {
    console.error('[x402] ✗ Failed to decode payment proof:', error);
    if (error instanceof Error) {
      console.error('[x402] Error message:', error.message);
      console.error('[x402] Error stack:', error.stack);
    }
    return { valid: false };
  }

  // Step 2: Build payment requirements
  let paymentRequirements: PaymentRequirements[];
  try {
    paymentRequirements = buildPaymentRequirements({
      price,
      network,
      payTo: expectedRecipient,
      resource,
      description,
    });
    console.log('[x402] ✓ Payment requirements built');
    console.log('[x402] Required network:', paymentRequirements[0]?.network);
    console.log('[x402] Required asset:', paymentRequirements[0]?.asset);
    console.log('[x402] Required amount:', paymentRequirements[0]?.maxAmountRequired);
    console.log('[x402] Required payTo:', paymentRequirements[0]?.payTo);
  } catch (error) {
    console.error('[x402] ✗ Failed to build payment requirements:', error);
    if (error instanceof Error) {
      console.error('[x402] Error message:', error.message);
    }
    return { valid: false };
  }

  // Step 3: Match payment to requirements
  const selected = findMatchingPaymentRequirements(paymentRequirements, decodedPayment);
  if (!selected) {
    console.error('[x402] ✗ Payment does not match requirements');
    const decodedAny = decodedPayment as any;
    const req = paymentRequirements[0];
    console.error('[x402] Payment structure:', JSON.stringify(decodedPayment, null, 2));
    console.error('[x402] Required structure:', JSON.stringify(paymentRequirements, null, 2));
    if (decodedAny.network) console.error('[x402] Payment network:', decodedAny.network, 'vs required:', req?.network);
    if (decodedAny.asset || decodedAny.payload?.asset) {
      const paymentAsset = decodedAny.asset || decodedAny.payload?.asset;
      console.error('[x402] Payment asset:', paymentAsset, 'vs required:', req?.asset);
    }
    if (decodedAny.amount || decodedAny.payload?.amount) {
      const paymentAmount = decodedAny.amount || decodedAny.payload?.amount;
      console.error('[x402] Payment amount:', paymentAmount, 'vs required:', req?.maxAmountRequired);
    }
    if (decodedAny.payTo || decodedAny.payload?.payTo) {
      const paymentPayTo = decodedAny.payTo || decodedAny.payload?.payTo;
      console.error('[x402] Payment payTo:', paymentPayTo, 'vs required:', req?.payTo);
    }
    return { valid: false };
  }
  console.log('[x402] ✓ Payment matches requirements');
  const selectedAny = selected as any;
  console.log('[x402] Selected requirement network:', selectedAny?.network);
  console.log('[x402] Selected requirement asset:', selectedAny?.asset);
  console.log('[x402] Selected requirement amount:', selectedAny?.maxAmountRequired);

  // Step 4: Verify payment via facilitator
  try {
    console.log('[x402] Verifying payment with facilitator:', facilitator.url);
    const verifyResponse = await verify(decodedPayment, selected);
    console.log('[x402] Facilitator verify response:', JSON.stringify(verifyResponse, null, 2));
    if (!verifyResponse.isValid) {
      console.error('[x402] ✗ Payment verification failed - facilitator returned invalid');
      if ('error' in verifyResponse) {
        console.error('[x402] Verification error:', verifyResponse.error);
      }
      return { valid: false };
    }
    console.log('[x402] ✓ Payment verified by facilitator');
  } catch (error) {
    console.error('[x402] ✗ Payment verification exception:', error);
    if (error instanceof Error) {
      console.error('[x402] Error message:', error.message);
      console.error('[x402] Error stack:', error.stack);
    }
    return { valid: false };
  }

  // Step 5: Settle payment via facilitator
  try {
    console.log('[x402] Settling payment with facilitator:', facilitator.url);
    const settleResponse = await settle(decodedPayment, selected);
    console.log('[x402] Facilitator settle response:', JSON.stringify(settleResponse, null, 2));
    if (!settleResponse.success) {
      console.error('[x402] ✗ Payment settlement failed');
      if ('error' in settleResponse) {
        console.error('[x402] Settlement error:', settleResponse.error);
      }
      return { valid: false };
    }
    console.log('[x402] ✓ Payment settled successfully');
    console.log('[x402] Transaction hash:', settleResponse.transaction);
    return {
      valid: true,
      txHash: settleResponse.transaction,
    };
  } catch (error) {
    console.error('[x402] ✗ Payment settlement exception:', error);
    if (error instanceof Error) {
      console.error('[x402] Error message:', error.message);
      console.error('[x402] Error stack:', error.stack);
    }
    return { valid: false };
  }
}

/**
 * Serialize payment requirements for 402 response (accepts).
 */
export function paymentRequirementsToAccepts(requirements: PaymentRequirements[]): unknown {
  return toJsonSafe(requirements);
}
