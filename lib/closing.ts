// Shared helpers for cash closings (uzávěrka).

export interface Closing {
  id: number;
  team_id: number | null;
  created_by: number;
  date: string;
  shift_label: string | null;
  opening_cash: number;
  cash_revenue: number;
  card_revenue: number;
  tips: number;
  expenses: number;
  cash_removed: number;
  self_payout: number;
  closing_cash: number;
  customers: number;
  notes: string | null;
  created_at?: string;
  author_name?: string | null;
  author_avatar?: string | null;
}

// Expected cash physically left in the drawer at close:
//   opening + cash revenue − expenses paid from drawer − cash taken out − self payout.
// (Card revenue and tips don't sit in the drawer, so they're excluded here.)
export function expectedCash(c: {
  opening_cash: number; cash_revenue: number; expenses: number; cash_removed: number; self_payout: number;
}): number {
  return c.opening_cash + c.cash_revenue - c.expenses - c.cash_removed - c.self_payout;
}

// Difference between counted and expected cash.
//   > 0 přebytek (surplus), < 0 manko (shortage), 0 sedí (balanced).
export function cashDifference(c: {
  closing_cash: number; opening_cash: number; cash_revenue: number; expenses: number; cash_removed: number; self_payout: number;
}): number {
  return c.closing_cash - expectedCash(c);
}

export const czk = (n: number) => `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
