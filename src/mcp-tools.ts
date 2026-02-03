/**
 * Shared MCP server setup: creates an McpServer with all yoga-commerce tools.
 * Used by both stdio (mcp-server.ts) and HTTP (mcp-server-http.ts) entry points.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const API_BASE_DEFAULT = 'http://localhost:3000';

async function apiGet(apiBase: string, path: string, headers?: Record<string, string>): Promise<string> {
  const res = await fetch(`${apiBase}${path}`, { headers });
  const text = await res.text();
  if (!res.ok) {
    return JSON.stringify({ error: text, status: res.status });
  }
  return text;
}

async function apiPost(apiBase: string, path: string, body: object): Promise<string> {
  const res = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    return JSON.stringify({ error: text, status: res.status });
  }
  return text;
}

async function apiPatch(apiBase: string, path: string, body: object): Promise<string> {
  const res = await fetch(`${apiBase}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    return JSON.stringify({ error: text, status: res.status });
  }
  return text;
}

function toolResult(text: string, isError = false) {
  return {
    content: [{ type: 'text' as const, text }],
    isError,
  };
}

export function createYogaMcpServer(apiBase: string = API_BASE_DEFAULT): McpServer {
  const server = new McpServer(
    { name: 'yoga-commerce', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.registerTool(
    'browse_classes',
    { description: 'List available yoga classes (id, title, price).' },
    async () => toolResult(await apiGet(apiBase, '/classes'))
  );

  server.registerTool(
    'get_class_preview',
    {
      description: 'Get the free preview URL for a yoga class.',
      inputSchema: z.object({ classId: z.string().describe('Class id (e.g. "1", "2", "3")') }),
    },
    async ({ classId }: { classId: string }) =>
      toolResult(await apiGet(apiBase, `/class/${classId}/preview`))
  );

  server.registerTool(
    'get_class_full',
    {
      description:
        'Get full video URL for a class. Without xPayment returns 402 payment requirements; with valid xPayment returns content_url and tx_hash.',
      inputSchema: z.object({
        classId: z.string().describe('Class id (e.g. "1", "2", "3")'),
        xPayment: z.string().optional().describe('X-Payment header value after paying via x402'),
      }),
    },
    async ({ classId, xPayment }: { classId: string; xPayment?: string }) => {
      const headers = xPayment ? { 'X-Payment': xPayment } : undefined;
      return toolResult(await apiGet(apiBase, `/class/${classId}/full`, headers));
    }
  );

  server.registerTool(
    'browse_products',
    { description: 'List physical products (yoga mat, strap) with id and price.' },
    async () => toolResult(await apiGet(apiBase, '/products'))
  );

  server.registerTool(
    'acp_create_checkout',
    {
      description: 'Create an ACP checkout session (cart). Returns checkout_session_id and total.',
      inputSchema: z.object({
        product_id: z.enum(['mat', 'strap']).describe('Product id'),
        quantity: z.number().int().min(1).optional().default(1),
      }),
    },
    async ({ product_id, quantity }: { product_id: 'mat' | 'strap'; quantity?: number }) =>
      toolResult(await apiPost(apiBase, '/acp/checkout', { productId: product_id, quantity: quantity ?? 1 }))
  );

  server.registerTool(
    'acp_update_checkout',
    {
      description: 'Update an open ACP checkout (quantity or shipping_address).',
      inputSchema: z.object({
        checkout_session_id: z.string().describe('Session id from acp_create_checkout'),
        quantity: z.number().int().min(1).optional(),
        shipping_address: z.record(z.string(), z.unknown()).optional(),
      }),
    },
    async ({
      checkout_session_id,
      quantity,
      shipping_address,
    }: {
      checkout_session_id: string;
      quantity?: number;
      shipping_address?: object;
    }) =>
      toolResult(
        await apiPatch(apiBase, `/acp/checkout/${checkout_session_id}`, {
          quantity,
          shipping_address,
        })
      )
  );

  server.registerTool(
    'acp_complete_checkout',
    {
      description:
        'Complete ACP checkout with payment token. In test mode (sk_test_...), accepts Stripe test payment_method id (pm_xxx) or uses test card. In live mode (sk_live_...), requires real payment_method id.',
      inputSchema: z.object({
        checkout_session_id: z.string().describe('Session id from acp_create_checkout'),
        payment_token: z.string().describe('Payment token: Stripe payment_method id (pm_xxx) for live mode, or any token for test mode (uses test card)'),
      }),
    },
    async ({
      checkout_session_id,
      payment_token,
    }: {
      checkout_session_id: string;
      payment_token: string;
    }) =>
      toolResult(
        await apiPost(apiBase, `/acp/checkout/${checkout_session_id}/complete`, {
          payment_token,
        })
      )
  );

  server.registerTool(
    'acp_cancel_checkout',
    {
      description: 'Cancel an open ACP checkout session.',
      inputSchema: z.object({
        checkout_session_id: z.string().describe('Session id from acp_create_checkout'),
      }),
    },
    async ({ checkout_session_id }: { checkout_session_id: string }) =>
      toolResult(await apiPost(apiBase, `/acp/checkout/${checkout_session_id}/cancel`, {}))
  );

  server.registerTool(
    'acp_get_order',
    {
      description: 'Get order details by order_id (returned from acp_complete_checkout).',
      inputSchema: z.object({
        order_id: z.string().describe('Order id from acp_complete_checkout'),
      }),
    },
    async ({ order_id }: { order_id: string }) =>
      toolResult(await apiGet(apiBase, `/acp/order/${order_id}`))
  );

  server.registerTool(
    'create_checkout',
    {
      description: 'Create a Stripe Checkout session (redirect URL). Returns checkout URL.',
      inputSchema: z.object({
        productId: z.enum(['mat', 'strap']).describe('Product id'),
        quantity: z.number().int().min(1).optional().default(1),
      }),
    },
    async ({ productId, quantity }: { productId: 'mat' | 'strap'; quantity?: number }) =>
      toolResult(await apiPost(apiBase, '/checkout', { productId, quantity: quantity ?? 1 }))
  );

  server.registerTool(
    'health',
    { description: 'Check if the yoga-commerce API is up.' },
    async () => toolResult(await apiGet(apiBase, '/health'))
  );

  return server;
}
