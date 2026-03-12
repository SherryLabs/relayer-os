import { supabase } from '../lib/supabase.js';

export interface CheckTreasuryInput {
  otc_id: string;
  amount_usdt: number;
  fiat_required: number;
  fiat_currency: 'mxn' | 'ars';
}

export interface CheckTreasuryOutput {
  can_accept: boolean;
  reason: string;
  usdt_available: number;
  fiat_available: number;
}

export async function checkTreasury(input: CheckTreasuryInput): Promise<CheckTreasuryOutput> {
  const { otc_id, amount_usdt, fiat_required, fiat_currency } = input;

  const { data, error } = await supabase
    .from('treasury')
    .select('usdt_balance, usdt_in_escrow, mxn_cash, ars_cash')
    .eq('otc_id', otc_id)
    .single();

  if (error || !data) {
    return {
      can_accept: false,
      reason: `Treasury not found for otc_id ${otc_id}`,
      usdt_available: 0,
      fiat_available: 0,
    };
  }

  const usdt_available = Number(data.usdt_balance) - Number(data.usdt_in_escrow);
  const fiat_available = fiat_currency === 'mxn' ? Number(data.mxn_cash) : Number(data.ars_cash);

  const reasons: string[] = [];
  if (usdt_available < amount_usdt) {
    reasons.push(`Insufficient USDT: available ${usdt_available}, required ${amount_usdt}`);
  }
  if (fiat_available < fiat_required) {
    reasons.push(`Insufficient ${fiat_currency.toUpperCase()} cash: available ${fiat_available}, required ${fiat_required}`);
  }

  return {
    can_accept: reasons.length === 0,
    reason: reasons.length === 0 ? 'OK' : reasons.join('; '),
    usdt_available,
    fiat_available,
  };
}
