/**
 * Relayer OS — MCP Server
 *
 * Tools implemented:
 *   1. check_treasury  — verify OTC has funds before accepting order
 *   2. create_order    — open order + generate WDK escrow wallet
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { checkTreasury } from './tools/check_treasury.js';
import { createOrder } from './tools/create_order.js';

const server = new McpServer({
  name: 'relayer-os',
  version: '0.1.0',
});

// ─────────────────────────────────────────────────────────────────
// Tool 1: check_treasury
// ─────────────────────────────────────────────────────────────────
server.tool(
  'check_treasury',
  'Verify OTC has sufficient USDT balance AND physical fiat inventory before accepting an order. ALWAYS call this before create_order.',
  {
    otc_id: z.string().describe('OTC operator UUID'),
    amount_usdt: z.number().describe('USDT needed for this order'),
    fiat_required: z.number().describe('Fiat cash needed to deliver to client'),
    fiat_currency: z.enum(['mxn', 'ars']).describe('Fiat currency: mxn or ars'),
  },
  async (input) => {
    const result = await checkTreasury(input);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  }
);

// ─────────────────────────────────────────────────────────────────
// Tool 2: create_order
// ─────────────────────────────────────────────────────────────────
server.tool(
  'create_order',
  'Create an order and generate a WDK escrow wallet. Only call after check_treasury returns can_accept=true.',
  {
    otc_id: z.string().describe('OTC operator UUID'),
    client_telegram_id: z.string().describe('Telegram user ID of the client'),
    amount_usdt: z.number().describe('USDT amount for the order'),
    amount_fiat: z.number().describe('Fiat amount for the order'),
    exchange_rate: z.number().describe('Exchange rate applied'),
    pickup_address: z.string().describe('Physical address for fiat pickup'),
    pickup_notes: z.string().optional().describe('Additional pickup instructions'),
    pickup_window: z.string().describe('Time window for pickup, e.g. "before 7pm"'),
  },
  async (input) => {
    const result = await createOrder(input);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  }
);

// ─────────────────────────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Relayer OS MCP server running');
}

main().catch(console.error);
