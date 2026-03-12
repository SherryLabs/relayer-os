declare module '#wdk-wallet' {
  export function createEscrowWallet(orderId: string): Promise<{
    address: string;
    walletId: string;
  }>;

  export function watchForDeposit(
    walletAddress: string,
    expectedAmount: bigint,
    onDeposit: (amount: bigint) => void
  ): Promise<() => void>;

  export function releaseEscrow(
    walletId: string,
    destinationAddress: string,
    amount: bigint,
    orderId: string
  ): Promise<{ txHash: string }>;

  export function getEscrowBalance(walletId: string): Promise<bigint>;

  export function dispose(): void;
}
