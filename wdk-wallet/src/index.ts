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

import WDK from '@tetherto/wdk';
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';

// ─────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────

const SEED_PHRASE = process.env.WDK_SEED_PHRASE!;
const RPC_URL = process.env.WDK_RPC_URL || 'https://sepolia.gateway.tenderly.co';
const USDT_CONTRACT = process.env.WDK_USDT_CONTRACT!;
const DEPOSIT_POLL_INTERVAL_MS = Number(process.env.WDK_POLL_INTERVAL_MS) || 10_000;

let _wdk: InstanceType<typeof WDK> | null = null;

/**
 * Lazily initialize and return the shared WDK instance.
 * Uses a single HD seed — each order gets a unique account index.
 */
function getWDK(): InstanceType<typeof WDK> {
  if (!_wdk) {
    if (!SEED_PHRASE) {
      throw new Error('WDK_SEED_PHRASE env var is required');
    }
    if (!USDT_CONTRACT) {
      throw new Error('WDK_USDT_CONTRACT env var is required');
    }
    _wdk = new WDK(SEED_PHRASE).registerWallet('ethereum', WalletManagerEvm, {
      provider: RPC_URL,
    });
  }
  return _wdk;
}

// ─────────────────────────────────────────────────────────────────
// Account index tracking
// ─────────────────────────────────────────────────────────────────

// Maps orderId → HD account index so each order gets a deterministic wallet.
// In production this mapping should be persisted to the database.
const orderIndexMap = new Map<string, number>();
let nextIndex = 1; // index 0 is reserved for the treasury/operator wallet

function getOrAssignIndex(orderId: string): number {
  const existing = orderIndexMap.get(orderId);
  if (existing !== undefined) return existing;
  const idx = nextIndex++;
  orderIndexMap.set(orderId, idx);
  return idx;
}

// ─────────────────────────────────────────────────────────────────
// 1. createEscrowWallet
// ─────────────────────────────────────────────────────────────────

/**
 * Creates a new WDK escrow wallet for a specific order.
 * Derives a unique address from the HD seed using account index.
 *
 * Called by mcp-server create_order tool.
 *
 * @param orderId - UUID of the order in Relayer OS DB
 * @returns escrow wallet address and the account index (used as walletId)
 */
export async function createEscrowWallet(orderId: string): Promise<{
  address: string;
  walletId: string;
}> {
  const wdk = getWDK();
  const accountIndex = getOrAssignIndex(orderId);
  const account = await wdk.getAccount('ethereum', accountIndex);
  const address = await account.getAddress();

  return {
    address,
    walletId: String(accountIndex),
  };
}

// ─────────────────────────────────────────────────────────────────
// 2. watchForDeposit
// ─────────────────────────────────────────────────────────────────

/**
 * Polls an escrow wallet for incoming USDT deposits.
 * Calls onDeposit callback once the token balance meets expectedAmount.
 *
 * Returns an abort function to stop polling.
 *
 * @param walletAddress - escrow wallet to monitor
 * @param expectedAmount - USDT amount expected (in token base units, e.g. 6 decimals)
 * @param onDeposit - callback fired when deposit is confirmed
 * @returns stop function to cancel polling
 */
export async function watchForDeposit(
  walletAddress: string,
  expectedAmount: bigint,
  onDeposit: (amount: bigint) => void
): Promise<() => void> {
  const wdk = getWDK();

  // We need a read-only account to check balance.
  // Find the account index that owns this address by scanning known mappings.
  let accountIndex: number | null = null;
  for (const [, idx] of orderIndexMap) {
    const acct = await wdk.getAccount('ethereum', idx);
    const addr = await acct.getAddress();
    if (addr.toLowerCase() === walletAddress.toLowerCase()) {
      accountIndex = idx;
      break;
    }
  }

  if (accountIndex === null) {
    throw new Error(`No known account for address ${walletAddress}`);
  }

  const account = await wdk.getAccount('ethereum', accountIndex);
  let stopped = false;

  const poll = async () => {
    while (!stopped) {
      try {
        const balance: bigint = await account.getTokenBalance(USDT_CONTRACT);
        if (balance >= expectedAmount) {
          onDeposit(balance);
          return;
        }
      } catch (err) {
        console.error('[wdk-wallet] deposit poll error:', err);
      }
      await sleep(DEPOSIT_POLL_INTERVAL_MS);
    }
  };

  poll();

  return () => {
    stopped = true;
  };
}

// ─────────────────────────────────────────────────────────────────
// 3. releaseEscrow
// ─────────────────────────────────────────────────────────────────

/**
 * Releases USDT from an escrow wallet to the OTC treasury address.
 *
 * Called by mcp-server release_escrow tool ONLY after both conditions:
 *   - pickup_done = true
 *   - fiat_sent = true
 *
 * @param walletId - account index string from createEscrowWallet
 * @param destinationAddress - OTC treasury wallet address
 * @param amount - USDT amount in token base units (6 decimals)
 * @param orderId - for audit logging
 * @returns transaction hash
 */
export async function releaseEscrow(
  walletId: string,
  destinationAddress: string,
  amount: bigint,
  orderId: string
): Promise<{ txHash: string }> {
  const wdk = getWDK();
  const accountIndex = Number(walletId);

  if (isNaN(accountIndex)) {
    throw new Error(`Invalid walletId: ${walletId}`);
  }

  const account = await wdk.getAccount('ethereum', accountIndex);

  const { hash } = await account.transfer({
    token: USDT_CONTRACT,
    recipient: destinationAddress,
    amount,
  });

  console.error(
    `[wdk-wallet] escrow released | order=${orderId} tx=${hash} amount=${amount}`
  );

  return { txHash: hash };
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get the USDT balance of an escrow wallet.
 * Utility for the MCP server to check escrow state.
 */
export async function getEscrowBalance(walletId: string): Promise<bigint> {
  const wdk = getWDK();
  const account = await wdk.getAccount('ethereum', Number(walletId));
  return account.getTokenBalance(USDT_CONTRACT);
}

/**
 * Clean up the WDK instance. Call on process exit.
 */
export function dispose(): void {
  if (_wdk) {
    _wdk.dispose();
    _wdk = null;
  }
}
