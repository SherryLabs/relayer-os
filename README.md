# Relayer OS

**Agentic operating system for LATAM OTC stablecoin operators.**

Built for the [Tether WDK Hackathon Galactica: Edition 1](https://dorahacks.io).

---

## What is Relayer OS?

Relayer OS is the infrastructure layer that lets a small OTC (over-the-counter) stablecoin desk in LATAM operate at 2x capacity without hiring more people. It replaces WhatsApp + Excel with an autonomous agent that manages escrow, coordinates pickup, and settles transactions end-to-end.

**The operator gets two Telegram bots and a chat interface. Everything else is automated.**

---

## How it works

```
Client (Telegram)          Agent (MCP)              Operator (Telegram)
─────────────────          ───────────              ───────────────────
"I want to buy             parse_intent()           "New order: $500 USDT
 $500 USDT"                get_quote()               Pickup: Condesa, CDMX
                           check_treasury()          Before 7pm"
"Confirmed"                create_order()            [Confirm pickup] button
                           ↓
                     WDK wallet generated
                     (escrow address)
                           ↓
Client deposits USDT  ←── on-chain detection
                           ↓
Operator confirms     ──→ pickup_done = true
fiat delivered             fiat_sent = true
                           ↓
                      release_escrow()
                      USDT → OTC treasury
```

**The critical security rule:** USDT is only released when `pickup_done = true` AND `fiat_sent = true`. Both conditions required. No manual override without audit log.

---

## Architecture

```
relayer-os/
├── wdk-wallet/          # WDK by Tether — escrow wallet per order
├── mcp-server/          # MCP server — 8 agent tools
├── telegram-bots/
│   ├── client/          # Customer-facing bot
│   └── operator/        # OTC operator bot
└── docs/                # Architecture diagrams
```

**External services (pre-existing, referenced as APIs):**
- `sherry-api` — NestJS backend with Bridge.xyz integration for MXN/USD settlement
- `sherry-chat` — Next.js chat interface (Sherry Chat) for operator analytics

---

## Stack

| Layer | Technology |
|---|---|
| Agent tools | MCP Server (TypeScript) |
| Wallet infrastructure | **WDK by Tether** (escrow per order) |
| Bots | Telegram Bot API (telegraf) |
| Database | PostgreSQL via Supabase |
| Payment rails (MX) | Bridge.xyz via sherry-api |
| LLM | Google Gemini via sherry-chat |

---

## Prerequisites

```bash
node >= 18
npm >= 9
```

Accounts needed:
- Tether WDK (testnet)
- Telegram Bot tokens (2 bots: client + operator)
- Supabase project

---

## Setup

### 1. Clone

```bash
git clone https://github.com/relayerfi/relayer-os.git
cd relayer-os
```

### 2. Environment variables

```bash
cp .env.example .env
```

Fill in `.env`:

```env
# WDK
WDK_API_KEY=your_wdk_api_key
WDK_NETWORK=sepolia                    # testnet

# Telegram
TELEGRAM_CLIENT_BOT_TOKEN=...
TELEGRAM_OPERATOR_BOT_TOKEN=...

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=...

# sherry-api (external)
RELAYER_API_URL=https://your-sherry-api.com
RELAYER_API_KEY=...

# MCP Server
MCP_PORT=3001
```

### 3. Install dependencies

```bash
# MCP Server
cd mcp-server && npm install

# WDK Wallet layer
cd ../wdk-wallet && npm install

# Telegram bots
cd ../telegram-bots/client && npm install
cd ../operator && npm install
```

### 4. Database migrations

```bash
cd mcp-server
npm run db:migrate
```

This creates 4 tables: `otc_operators`, `otc_treasury`, `orders`, `escrow_ledger`.

### 5. Run

```bash
# Terminal 1 — MCP Server
cd mcp-server && npm run dev

# Terminal 2 — WDK wallet listener
cd wdk-wallet && npm run dev

# Terminal 3 — Telegram client bot
cd telegram-bots/client && npm run dev

# Terminal 4 — Telegram operator bot
cd telegram-bots/operator && npm run dev
```

---

## Order state machine

```
quoted → deposited → pickup_assigned → pickup_done → settling → settled
quoted → deposit_timeout         (30 min without deposit)
pickup_assigned → pickup_timeout (window expired → escalates to human)
settling → failed → refund
```

---

## MCP Tools (8)

| Tool | Trigger |
|---|---|
| `parse_intent` | First call on every client message |
| `get_quote` | Calls sherry-api /payments/quote + applies OTC spread |
| `check_treasury` | **Always before create_order** — verifies USDT balance AND physical inventory |
| `create_order` | Creates order, generates WDK wallet, locks `usdt_in_escrow` |
| `confirm_pickup` | Operator confirms courier collected cash |
| `execute_settlement` | Calls sherry-api /payments/execute |
| `release_escrow` | **Only when fiat_sent=true** — releases USDT to OTC |
| `get_treasury_summary` | Operator queries via Sherry Chat |

---

## Pre-existing code disclosure

Per hackathon rules, this project builds on:

- **sherry-api**: NestJS backend originally built for Sherry (interactive mini-apps on X). Reused for Bridge.xyz integration, KYB flow, and payment execution endpoints. **Not included in this repo.**
- **sherry-chat**: Next.js chat interface with Vercel AI SDK + MCP client. Connected to this repo's MCP server for operator analytics. **Not included in this repo.**
- Database schema (Supabase): `integrators`, `bridge_customers`, `beneficiaries`, `payments` tables from sherry-api. The 4 new tables (`otc_operators`, `otc_treasury`, `orders`, `escrow_ledger`) are new and included in this repo's migrations.

---

## Third-party services

- [WDK by Tether](https://wdk.tether.io) — wallet infrastructure (core integration)
- [Bridge.xyz](https://bridge.xyz) — MXN/USD stablecoin settlement rails
- [Supabase](https://supabase.com) — PostgreSQL database
- [Telegram Bot API](https://core.telegram.org/bots/api) — messaging layer
- [Telegraf](https://telegraf.js.org) — Telegram bot framework
- [Anthropic Claude / Google Gemini](https://anthropic.com) — LLM for agent reasoning

---

## Team

Built for the Tether WDK Hackathon Galactica: Edition 1 (March 2026).

| Name | Role |
|---|---|
| [Your name] | Founder / BD |
| [Dev name] | Engineering |
| [Mkt name] | Product / Marketing |

Location: Mexico City, Mexico

---

## License

Apache 2.0 — see [LICENSE](./LICENSE)
