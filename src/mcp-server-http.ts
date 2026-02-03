/**
 * MCP server over HTTP (Streamable HTTP). Run: npm run start:mcp
 * Exposes MCP at POST /mcp and GET /mcp for SSE. Use this URL as the MCP server URL in clients.
 * Set API_BASE_URL to the yoga-commerce API base (e.g. https://yoga-api.onrender.com).
 */

import 'dotenv/config';
import { createYogaMcpServer } from './mcp-tools.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';
const MCP_PORT = parseInt(process.env.PORT || process.env.MCP_PORT || '3001', 10);

const app = createMcpExpressApp({ host: '0.0.0.0' });

app.all('/mcp', async (req, res) => {
  try {
    const server = createYogaMcpServer(API_BASE);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, (req as { body?: unknown }).body);
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

app.listen(MCP_PORT, () => {
  console.log(`MCP Streamable HTTP server at http://0.0.0.0:${MCP_PORT}/mcp`);
});
