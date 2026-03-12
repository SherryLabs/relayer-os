import { supabase } from '../lib/supabase.js';
import { createEscrowWallet, watchForDeposit } from '#wdk-wallet';

export interface CreateOrderInput {
  otc_id: string;
  client_telegram_id: string;
  amount_usdt: number;
  amount_fiat: number;
  exchange_rate: number;
  pickup_address: string;
  pickup_notes?: string;
  pickup_window: string;
}

export interface CreateOrderOutput {
  order_id: string;
  escrow_address: string;
  expires_at: string;
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderOutput> {
  const {
    otc_id,
    client_telegram_id,
    amount_usdt,
    amount_fiat,
    exchange_rate,
    pickup_address,
    pickup_notes,
    pickup_window,
  } = input;

  // 1. Generate escrow wallet via WDK
  const tempId = crypto.randomUUID();
  const { address: escrow_address } = await createEscrowWallet(tempId);

  // 2. Insert order into otc.orders
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      otc_id,
      client_telegram_id,
      amount_usdt,
      amount_fiat,
      exchange_rate,
      escrow_address,
      pickup_address,
      pickup_notes: pickup_notes ?? null,
      pickup_window,
      status: 'quoted',
      expires_at,
    })
    .select('id')
    .single();

  if (orderError || !order) {
    throw new Error(`Failed to create order: ${orderError?.message ?? 'unknown error'}`);
  }

  const order_id = order.id as string;

  // 3. Lock USDT in escrow on treasury
  //    Read current value then increment (Supabase JS has no atomic increment)
  const { data: treasury } = await supabase
    .from('treasury')
    .select('usdt_in_escrow')
    .eq('otc_id', otc_id)
    .single();

  if (treasury) {
    await supabase
      .from('treasury')
      .update({ usdt_in_escrow: Number(treasury.usdt_in_escrow) + amount_usdt })
      .eq('otc_id', otc_id);
  }

  // 4. Start deposit watcher (fire-and-forget)
  //    When deposit is detected, update order status to 'deposited'
  const amountBaseUnits = BigInt(Math.round(amount_usdt * 1e6));

  watchForDeposit(escrow_address, amountBaseUnits, async () => {
    await supabase
      .from('orders')
      .update({ status: 'deposited' })
      .eq('id', order_id);

    console.error(`[mcp-server] deposit detected for order ${order_id}`);
  }).catch((err: unknown) => {
    console.error(`[mcp-server] watchForDeposit failed for order ${order_id}:`, err);
  });

  return {
    order_id,
    escrow_address,
    expires_at,
  };
}
