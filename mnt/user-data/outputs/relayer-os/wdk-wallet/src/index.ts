/**
 * wdk-wallet — Relayer OS
 *
 * Responsibilities:
 * 1. Generate a unique WDK wallet per order (escrow address)
 * 2. Detect USDT deposit on-chain
 * 3. Release USDT to OTC treasury wallet when escrow conditions are met
 *
 * Security rule:
 * USDT is only released when BOTH conditions are true:
 *   - pickup_done = true  (operator confirmed courier collected fiat)
 *   - fiat_sent = true    (agent confirmed fiat was sent to client)
 *
 * This module never reads or writes order state directly.
 * It emits events that the MCP server processes.
 */

import { WDK } from '@tether/wdk';

// TODO: Replace with actual WDK SDK import path once confirmed
// import { WDKClient } from '@tether/wdk';

const WDK_API_KEY = process.env.WDK_API_KEY!;
const WDK_NETWORK = process.env.WDK_NETWORK || 'sepolia';

// ─────────────────────────────────────────────────────────────────
// Wallet generation
// ─────────────────────────────────────────────────────────────────

/**
 * Creates a new WDK wallet for a specific order.
 * Called by mcp-server/tools/create_order when a client confirms.
 *
 * @param orderId - UUID of the order in Relayer OS DB
 * @returns wallet address to show to the client for deposit
 */
export async function createEscrowWallet(orderId: string): Promise<{
  address: string;
  walletId: string;
}> {
  // TODO: Initialize WDK client
  // const wdk = new WDKClient({ apiKey: WDK_API_KEY, network: WDK_NETWORK });
  // const wallet = await wdk.wallets.create({ label: `escrow-${orderId}` });
  // return { address: wallet.address, walletId: wallet.id };

  throw new Error('WDK wallet creation not yet implemented — waiting for WDK SDK docs');
}

// ─────────────────────────────────────────────────────────────────
// Deposit detection
// ─────────────────────────────────────────────────────────────────

/**
 * Monitors a WDK wallet for incoming USDT.
 * When deposit is detected, notifies MCP server to update order status
 * from 'quoted' → 'deposited'.
 *
 * @param walletAddress - escrow wallet to monitor
 * @param expectedAmount - USDT amount expected (for validation)
 * @param onDeposit - callback with tx hash when deposit is confirmed
 */
export async function watchForDeposit(
  walletAddress: string,
  expectedAmount: number,
  onDeposit: (txHash: string, amount: number) => void
): Promise<void> {
  // TODO: Set up WDK webhook or polling for deposit events
  // wdk.webhooks.register({ address: walletAddress, event: 'deposit' })
  throw new Error('Deposit detection not yet implemented');
}

// ─────────────────────────────────────────────────────────────────
// USDT release
// ─────────────────────────────────────────────────────────────────

/**
 * Releases USDT from escrow wallet to OTC treasury.
 * Called by mcp-server/tools/release_escrow ONLY after both conditions:
 *   - pickup_done = true
 *   - fiat_sent = true
 *
 * All releases are logged to escrow_ledger table.
 *
 * @param walletId - WDK wallet ID of escrow
 * @param destinationAddress - OTC treasury wallet address
 * @param amount - USDT amount to release
 * @param orderId - for audit log
 * @returns transaction hash
 */
export async function releaseEscrow(
  walletId: string,
  destinationAddress: string,
  amount: number,
  orderId: string
): Promise<{ txHash: string }> {
  // TODO: Implement WDK transfer
  // const wdk = new WDKClient({ apiKey: WDK_API_KEY, network: WDK_NETWORK });
  // const tx = await wdk.wallets.transfer({
  //   fromWalletId: walletId,
  //   to: destinationAddress,
  //   amount,
  //   currency: 'USDT',
  // });
  // return { txHash: tx.hash };

  throw new Error('Escrow release not yet implemented');
}
