/**
 * MCP server (stdio). Run: npm run mcp
 * Connect from Cursor or MCP Inspector with command: npx, args: ts-node, src/mcp-server.ts
 * Requires the HTTP API to be running (npm run dev) or set API_BASE_URL.
 */

import 'dotenv/config';
import { createYogaMcpServer } from './mcp-tools.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

async function main() {
  const server = createYogaMcpServer(API_BASE);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
