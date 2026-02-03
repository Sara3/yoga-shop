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

const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://x402.org/facilitator';
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
  const result = processPriceToAtomicAmount(price, network as 'base-sepolia');
  if ('error' in result) {
    throw new Error(result.error);
  }
  const { maxAmountRequired, asset } = result;
  if (!('eip712' in asset) || !asset.eip712) {
    throw new Error('EVM asset with eip712 required');
  }
  return [
    {
      scheme: 'exact',
      network: network as 'base-sepolia',
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

  let decodedPayment: PaymentPayload;
  try {
    decodedPayment = exact.evm.decodePayment(paymentProof) as PaymentPayload;
    (decodedPayment as PaymentPayload & { x402Version?: number }).x402Version = X402_VERSION;
  } catch {
    return { valid: false };
  }

  const paymentRequirements = buildPaymentRequirements({
    price,
    network,
    payTo: expectedRecipient,
    resource,
    description,
  });

  const selected = findMatchingPaymentRequirements(paymentRequirements, decodedPayment);
  if (!selected) {
    return { valid: false };
  }

  try {
    const verifyResponse = await verify(decodedPayment, selected);
    if (!verifyResponse.isValid) {
      return { valid: false };
    }
  } catch {
    return { valid: false };
  }

  try {
    const settleResponse = await settle(decodedPayment, selected);
    if (!settleResponse.success) {
      return { valid: false };
    }
    return {
      valid: true,
      txHash: settleResponse.transaction,
    };
  } catch {
    return { valid: false };
  }
}

/**
 * Serialize payment requirements for 402 response (accepts).
 */
export function paymentRequirementsToAccepts(requirements: PaymentRequirements[]): unknown {
  return toJsonSafe(requirements);
}
