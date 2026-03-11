/**
 * Relayer OS — MCP Server
 *
 * 8 tools for agentic OTC operation:
 *   1. parse_intent       — classify client message
 *   2. get_quote          — rate + fee calculation
 *   3. check_treasury     — ALWAYS before create_order
 *   4. create_order       — open order + generate WDK escrow wallet
 *   5. confirm_pickup     — operator confirms fiat collected
 *   6. execute_settlement — call sherry-api to settle fiat leg
 *   7. release_escrow     — release USDT when both conditions met
 *   8. get_treasury_summary — operator analytics via Sherry Chat
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'relayer-os',
  version: '0.1.0',
});

// ─────────────────────────────────────────────────────────────────
// Tool 1: parse_intent
// ─────────────────────────────────────────────────────────────────
server.tool(
  'parse_intent',
  'Classify a client Telegram message into an intent: quote | buy | sell | status | cancel | unknown',
  {
    message: z.string().describe('Raw client message text'),
    clientId: z.string().describe('Telegram user ID'),
  },
  async ({ message, clientId }) => {
    // TODO: Use LLM or rule-based classification
    // Intents: quote, buy, sell, status, cancel, unknown
    return {
      content: [{ type: 'text', text: JSON.stringify({ intent: 'quote', confidence: 0.9 }) }],
    };
  }
);

// ─────────────────────────────────────────────────────────────────
// Tool 2: get_quote
// ─────────────────────────────────────────────────────────────────
server.tool(
  'get_quote',
  'Get exchange rate and fees for a USDT/MXN transaction. Calls sherry-api and applies OTC spread.',
  {
    amountUsdt: z.number().describe('Amount in USDT'),
    direction: z.enum(['usdt_to_mxn', 'mxn_to_usdt']),
    otcId: z.string().describe('OTC operator ID — used to fetch their configured spread'),
  },
  async ({ amountUsdt, direction, otcId }) => {
    // TODO: Call sherry-api /payments/quote
    // Apply OTC spread on top
    const mockQuote = {
      amountUsdt,
      amountMxn: amountUsdt * 19.15,
      exchangeRate: 19.15,
      relayerFeePercent: 0.25,
      otcSpreadPercent: 1.0,
      totalFeePercent: 1.25,
      estimatedArrival: 'same day',
      expiresIn: 60, // seconds
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(mockQuote) }],
    };
  }
);

// ─────────────────────────────────────────────────────────────────
// Tool 3: check_treasury
// CRITICAL: Always called before create_order
// ─────────────────────────────────────────────────────────────────
server.tool(
  'check_treasury',
  'Verify OTC has sufficient USDT balance AND physical fiat inventory before accepting an order. ALWAYS call this before create_order.',
  {
    otcId: z.string(),
    requiredUsdt: z.number().describe('USDT needed for this order'),
    requiredFiatMxn: z.number().describe('MXN cash needed to deliver to client'),
  },
  async ({ otcId, requiredUsdt, requiredFiatMxn }) => {
    // TODO: Query otc_treasury table
    // Check: usdt_available >= requiredUsdt
    // Check: mxn_cash >= requiredFiatMxn
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            canAccept: true,
            usdtAvailable: 10000,
            mxnCashAvailable: 150000,
            reason: null,
          }),
        },
      ],
    };
  }
);

// ─────────────────────────────────────────────────────────────────
// Tool 4: create_order
// ─────────────────────────────────────────────────────────────────
server.tool(
  'create_order',
  'Create an order and generate a WDK escrow wallet. Only call after check_treasury returns canAccept=true.',
  {
    otcId: z.string(),
    clientTelegramId: z.string(),
    amountUsdt: z.number(),
    amountMxn: z.number(),
    exchangeRate: z.number(),
    pickupAddress: z.string().describe('Physical address where courier picks up fiat'),
    pickupWindow: z.string().describe('Time window e.g. "before 7pm"'),
    pickupNotes: z.string().optional(),
  },
  async (params) => {
    // TODO:
    // 1. Insert into orders table (status: 'quoted')
    // 2. Call wdk-wallet createEscrowWallet(orderId)
    // 3. Update order with escrow_address
    // 4. Update otc_treasury: usdt_in_escrow += amountUsdt
    // 5. Return escrow wallet address for client to deposit
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            orderId: 'uuid-placeholder',
            escrowAddress: '0x...placeholder',
            status: 'quoted',
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          }),
        },
      ],
    };
  }
);

// ─────────────────────────────────────────────────────────────────
// Tool 5: confirm_pickup
// ─────────────────────────────────────────────────────────────────
server.tool(
  'confirm_pickup',
  'Operator confirms that courier has physically collected the fiat cash. Triggers settlement flow.',
  {
    orderId: z.string(),
    operatorTelegramId: z.string(),
  },
  async ({ orderId, operatorTelegramId }) => {
    // TODO:
    // 1. Update orders: pickup_done = true, pickup_done_at = now()
    // 2. If fiat_sent also true → trigger execute_settlement
    return {
      content: [{ type: 'text', text: JSON.stringify({ orderId, pickupDone: true }) }],
    };
  }
);

// ─────────────────────────────────────────────────────────────────
// Tool 6: execute_settlement
// ─────────────────────────────────────────────────────────────────
server.tool(
  'execute_settlement',
  'Execute the fiat settlement leg via sherry-api (MXN corridor) or OTC rails (AR).',
  {
    orderId: z.string(),
    corridor: z.enum(['mx', 'ar']).describe('mx = Bridge via sherry-api, ar = OTC own rails'),
  },
  async ({ orderId, corridor }) => {
    // TODO:
    // If corridor === 'mx': POST sherry-api /payments/execute
    // If corridor === 'ar': use OTC's own settlement rails
    // Update orders: status = 'settling'
    return {
      content: [{ type: 'text', text: JSON.stringify({ orderId, status: 'settling' }) }],
    };
  }
);

// ─────────────────────────────────────────────────────────────────
// Tool 7: release_escrow
// CRITICAL: Only when fiat_sent = true
// ─────────────────────────────────────────────────────────────────
server.tool(
  'release_escrow',
  'Release USDT from WDK escrow wallet to OTC treasury. Only callable when fiat_sent=true. Logs to escrow_ledger.',
  {
    orderId: z.string(),
    fiatSentConfirmed: z.literal(true).describe('Must be explicitly true — safety check'),
  },
  async ({ orderId, fiatSentConfirmed }) => {
    // TODO:
    // 1. Verify orders.pickup_done = true AND orders.fiat_sent = true
    // 2. Call wdk-wallet releaseEscrow(walletId, otcTreasuryAddress, amount, orderId)
    // 3. Insert into escrow_ledger: { order_id, action: 'release', tx_hash, triggered_by: 'agent' }
    // 4. Update orders: status = 'settled', completed_at = now()
    // 5. Update otc_treasury: usdt_in_escrow -= amount, usdt_balance += amount
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ orderId, status: 'settled', txHash: '0x...placeholder' }),
        },
      ],
    };
  }
);

// ─────────────────────────────────────────────────────────────────
// Tool 8: get_treasury_summary
// ─────────────────────────────────────────────────────────────────
server.tool(
  'get_treasury_summary',
  'Return treasury balances and operational summary for the OTC operator. Used by Sherry Chat.',
  {
    otcId: z.string(),
    period: z.enum(['today', 'week', 'month']).optional().default('today'),
  },
  async ({ otcId, period }) => {
    // TODO: Query otc_treasury + orders for the period
    const summary = {
      digital: {
        usdtBalance: 45200,
        usdtInEscrow: 1500,
        usdtAvailable: 43700,
        mxnInBank: 280000,
      },
      physical: {
        usdCash: 3000,
        mxnCash: 45000,
        lastUpdated: new Date().toISOString(),
      },
      operations: {
        ordersCompleted: 8,
        volumeUsdt: 12500,
        estimatedEarningsMxn: 1250,
        ordersFailed: 0,
        period,
      },
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(summary) }],
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
