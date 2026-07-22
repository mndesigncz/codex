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
  // Whether the self payout was taken from the drawer. null/undefined ⇒ true
  // (legacy behaviour: payouts always came out of the register).
  payout_from_register?: boolean | null;
  created_at?: string;
  author_name?: string | null;
  author_avatar?: string | null;
}

// Expected cash physically left in the drawer at close:
//   opening + cash revenue − expenses paid from drawer − cash taken out − self payout.
// (Card revenue and tips don't sit in the drawer, so they're excluded here.)
// The self payout is only deducted when it was actually paid FROM the register;
// if the team pays it from money set aside, it never touches the drawer.
export function expectedCash(c: {
  opening_cash: number; cash_revenue: number; expenses: number; cash_removed: number; self_payout: number;
  payout_from_register?: boolean | null;
}): number {
  const payout = c.payout_from_register === false ? 0 : c.self_payout;
  return c.opening_cash + c.cash_revenue - c.expenses - c.cash_removed - payout;
}

// Difference between counted and expected cash.
//   > 0 přebytek (surplus), < 0 manko (shortage), 0 sedí (balanced).
export function cashDifference(c: {
  closing_cash: number; opening_cash: number; cash_revenue: number; expenses: number; cash_removed: number; self_payout: number;
  payout_from_register?: boolean | null;
}): number {
  return c.closing_cash - expectedCash(c);
}

export const czk = (n: number) => `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
