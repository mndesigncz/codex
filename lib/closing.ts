// Shared helpers for cash closings (uzávěrka).

export type ShiftPerson = { id: number; name: string; avatar?: string | null };

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
  // Whether cash tips physically stayed in the drawer. null/undefined ⇒ false
  // (legacy behaviour: tips were set aside, so they never counted).
  tips_in_drawer?: boolean | null;
  created_at?: string;
  author_name?: string | null;
  author_avatar?: string | null;
  // Everyone who worked the shift this closing covers — resolved by the API
  // from cash_closings.shift_employees. Empty on older rows.
  shiftEmployees?: ShiftPerson[];
}

export type ExpectedInput = {
  opening_cash: number;
  cash_revenue: number;
  expenses: number;
  cash_removed: number;
  self_payout: number;
  tips?: number;
  payout_from_register?: boolean | null;
  tips_in_drawer?: boolean | null;
};

/**
 * Expected cash physically left in the drawer at close.
 *
 * IN the drawer:
 *   • opening cash — what was there when the shift started
 *   • cash revenue — what customers paid in cash
 *   • cash tips — ONLY when the team leaves them in the register (tips_in_drawer)
 *
 * NOT in the drawer:
 *   • card revenue — never touches the register, it's evidence only
 *   • expenses paid out of the register during the shift
 *   • cash carried out (safe / deposit)
 *   • the self payout, but only when it was actually handed out FROM the
 *     register; teams that pay from money set aside never touch the drawer
 *
 * tips_in_drawer defaults to FALSE. Most teams keep tips in a separate jar, so
 * counting them would inflate the expectation. Teams that leave cash tips in
 * the register must switch it on — otherwise every closing shows a phantom
 * surplus (přebytek) exactly the size of the tips.
 */
export function expectedCash(c: ExpectedInput): number {
  const payout = c.payout_from_register === false ? 0 : c.self_payout;
  const tips = c.tips_in_drawer === true ? c.tips ?? 0 : 0;
  return c.opening_cash + c.cash_revenue + tips - c.expenses - c.cash_removed - payout;
}

// Difference between counted and expected cash.
//   > 0 přebytek (surplus), < 0 manko (shortage), 0 sedí (balanced).
export function cashDifference(c: ExpectedInput & { closing_cash: number }): number {
  return c.closing_cash - expectedCash(c);
}

export type ExpectedLine = { label: string; amount: number; sign: 1 | -1 };

// The expectedCash() arithmetic, line by line, in the order the money moves —
// so the person closing can see exactly where the number comes from. The two
// framing lines always show; the rest only when they actually moved money.
export function expectedCashLines(c: ExpectedInput, opts?: { payoutLabel?: string }): ExpectedLine[] {
  const payout = c.payout_from_register === false ? 0 : c.self_payout;
  const tips = c.tips_in_drawer === true ? c.tips ?? 0 : 0;
  const lines: ExpectedLine[] = [
    { label: 'Kasa na začátku', amount: c.opening_cash, sign: 1 },
    { label: 'Tržba hotově', amount: c.cash_revenue, sign: 1 },
    { label: 'Spropitné v kase', amount: tips, sign: 1 },
    { label: 'Výdaje z kasy', amount: c.expenses, sign: -1 },
    { label: 'Odloženo ven', amount: c.cash_removed, sign: -1 },
    { label: opts?.payoutLabel ?? 'Moje výplata', amount: payout, sign: -1 },
  ];
  return lines.filter((l, i) => i < 2 || l.amount !== 0);
}

export const czk = (n: number) => `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
