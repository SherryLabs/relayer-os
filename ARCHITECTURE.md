# Relayer OS — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        RELAYER OS                           │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Telegram   │    │  MCP Server  │    │  WDK Wallet  │  │
│  │  Client Bot  │◄──►│  (8 tools)   │◄──►│    Layer     │  │
│  └──────────────┘    └──────┬───────┘    └──────────────┘  │
│                             │                               │
│  ┌──────────────┐           │            ┌──────────────┐  │
│  │   Telegram   │◄──────────┤            │  PostgreSQL   │  │
│  │ Operator Bot │           │            │  (Supabase)  │  │
│  └──────────────┘           │            └──────────────┘  │
│                             │                               │
│  ┌──────────────┐           │                               │
│  │ Sherry Chat  │◄──────────┘                               │
│  │ (analytics)  │                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
┌─────────────────┐                ┌──────────────────────┐
│   sherry-api    │                │    WDK by Tether     │
│  (Bridge.xyz    │                │  (non-custodial      │
│   settlement)   │                │   escrow wallets)    │
└─────────────────┘                └──────────────────────┘
```

## Order State Machine

```
                    ┌─────────┐
                    │ quoted  │──── 30 min ────► deposit_timeout
                    └────┬────┘
                         │ client deposits USDT
                         ▼
                  ┌────────────┐
                  │ deposited  │
                  └─────┬──────┘
                        │ operator notified
                        ▼
             ┌──────────────────┐
             │ pickup_assigned  │──── window ────► pickup_timeout
             └────────┬─────────┘
                      │ operator confirms courier
                      ▼
              ┌──────────────┐
              │ pickup_done  │
              └──────┬───────┘
                     │ execute_settlement()
                     ▼
               ┌──────────┐
               │ settling │──── error ────► failed ────► refund
               └─────┬────┘
                     │ fiat_sent = true
                     ▼
               ┌──────────┐
               │ settled  │
               └──────────┘
```

## Security Model

```
ESCROW RELEASE CONDITIONS (both required):
┌─────────────────────────────────────────┐
│  pickup_done = true                     │
│     AND                                 │
│  fiat_sent = true                       │
│                                         │
│  → release_escrow() called              │
│  → WDK transfers USDT to OTC treasury  │
│  → escrow_ledger entry created         │
└─────────────────────────────────────────┘

NO SINGLE CONDITION IS SUFFICIENT.
No manual override without escrow_ledger entry.
```

## Treasury Model

```
DIGITAL (agent controls):
  usdt_balance       ← total USDT in WDK treasury wallet
  usdt_in_escrow     ← locked in active order escrows
  usdt_available     ← usdt_balance - usdt_in_escrow  (computed)
  mxn_in_bank        ← MXN in bank account for SPEI

PHYSICAL (operator declares manually):
  usd_cash           ← USD cash on hand
  mxn_cash           ← MXN cash on hand
  ars_cash           ← ARS cash on hand

Agent checks BOTH digital AND physical before accepting an order.
```

## Fee Stack

```
Interbank rate:     19.60
Bridge spread:     -0.10  → 19.50
Relayer fee:       -0.15  → 19.35  (0.25–0.50%)
OTC spread:        -0.20  → 19.15  (configurable per operator)
─────────────────────────────────
Client sees:        19.15
```
