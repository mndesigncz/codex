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
  // Itemisation behind expenses / cash_removed / self_payout. Empty on older rows.
  movements?: Movement[];
  // Why the counted cash didn't match, when it didn't.
  diff_reason?: string | null;
  diff_note?: string | null;
  // How the drawer was counted, when it was counted by denomination.
  denominations?: DenominationCounts | null;
  // Cash carried out AFTER the drawer was counted — the end-of-shift
  // "odlož přebytek do trezoru". Doesn't enter the expected/diff arithmetic
  // (the count happens first); it only changes what the next shift takes over.
  final_removal?: number | null;
}

/**
 * One movement of cash during the shift. The aggregate columns keep driving the
 * arithmetic; movements are the itemisation behind them, so the employer can see
 * *what* was taken out of the register instead of one lump sum.
 */
export type MovementKind = 'expense' | 'removal' | 'payout' | 'deposit';

export interface Movement {
  kind: MovementKind;
  amount: number;
  note?: string;
}

export const MOVEMENT_KINDS: { kind: MovementKind; label: string; hint: string; sign: 1 | -1 }[] = [
  { kind: 'expense', label: 'Výdaj z kasy', hint: 'Nákup, poplatek…', sign: -1 },
  { kind: 'removal', label: 'Odloženo ven', hint: 'Do trezoru, odvod', sign: -1 },
  { kind: 'payout', label: 'Výplata z kasy', hint: 'Vyplaceno komu', sign: -1 },
  { kind: 'deposit', label: 'Vklad do kasy', hint: 'Doplnění drobných', sign: 1 },
];

export function movementLabel(kind: MovementKind): string {
  return MOVEMENT_KINDS.find(k => k.kind === kind)?.label ?? kind;
}

export function normalizeMovements(raw: any): Movement[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m: any) => {
      const kind = MOVEMENT_KINDS.some(k => k.kind === m?.kind) ? (m.kind as MovementKind) : 'expense';
      const amount = Math.round(Number(m?.amount));
      if (!Number.isFinite(amount) || amount === 0) return null;
      const note = String(m?.note ?? '').trim().slice(0, 160);
      return { kind, amount: Math.abs(amount), note: note || undefined };
    })
    .filter(Boolean)
    .slice(0, 60) as Movement[];
}

export function sumMovements(movements: Movement[], kind: MovementKind): number {
  return movements.filter(m => m.kind === kind).reduce((s, m) => s + m.amount, 0);
}

// ---- Why the drawer doesn't match ------------------------------------------

export const DIFF_REASONS: { id: string; label: string; hint?: string }[] = [
  { id: 'miscount', label: 'Přepočítáno špatně', hint: 'Přepočítali jsme a bylo to jinak.' },
  { id: 'unrecorded_expense', label: 'Zapomenutý výdaj', hint: 'Něco se platilo z kasy a nezapsalo se.' },
  { id: 'wrong_revenue', label: 'Špatně zadaná tržba', hint: 'Hotovost/karta se někde přehodily.' },
  { id: 'tips', label: 'Spropitné', hint: 'Zůstalo v kase, nebo se z ní vzalo.' },
  { id: 'change', label: 'Rozměňování', hint: 'Rozměnili jsme si z kasy.' },
  { id: 'refund', label: 'Vráceno zákazníkovi', hint: 'Reklamace, storno.' },
  { id: 'opening_wrong', label: 'Jiný počáteční stav', hint: 'Kasa nezačínala tím, co je zapsané.' },
  { id: 'unknown', label: 'Nevíme', hint: 'Nepodařilo se dohledat.' },
];

export function diffReasonLabel(id?: string | null): string | null {
  if (!id) return null;
  return DIFF_REASONS.find(r => r.id === id)?.label ?? id;
}

/**
 * Cheap arithmetic hints for a mismatch: when the difference lands exactly on a
 * number already in the closing, that is nearly always what happened. Saves the
 * person closing from hunting for it.
 */
export function explainDifference(
  diff: number,
  c: ExpectedInput & { card_revenue?: number; final_removal?: number | null },
  movements: Movement[] = [],
): string[] {
  const out: string[] = [];
  const d = Math.round(diff);
  if (d === 0) return out;
  const abs = Math.abs(d);
  const hit = (v: number | undefined) => v != null && v !== 0 && Math.round(v) === abs;

  if (hit(c.tips)) {
    out.push(d > 0
      ? 'Přebytek přesně odpovídá spropitnému — nezůstalo omylem v kase? Pak zapni „Spropitné zůstává v kase".'
      : 'Manko přesně odpovídá spropitnému — nevzalo se z kasy, aniž by to bylo zapsané?');
  }
  if (hit(c.self_payout)) {
    out.push(d > 0
      ? 'Přebytek přesně odpovídá výplatě — nevyplácelo se nakonec z kasy?'
      : 'Manko přesně odpovídá výplatě — nevyplatilo se z kasy dvakrát?');
  }
  if (hit(c.opening_cash)) {
    out.push('Rozdíl přesně odpovídá počátečnímu stavu — nezačínala kasa jinou částkou?');
  }
  if (hit(c.card_revenue)) {
    out.push('Rozdíl přesně odpovídá tržbě kartou — nespletla se hotovost s kartou?');
  }
  if (d < 0 && hit(Number(c.final_removal) || 0)) {
    out.push('Manko přesně odpovídá odvodu na konci — nezadal se stav kasy až po odložení ven? Kasa se počítá před odvodem.');
  }
  movements.forEach(m => {
    if (hit(m.amount)) {
      out.push(`Rozdíl přesně odpovídá pohybu „${movementLabel(m.kind)}${m.note ? ` – ${m.note}` : ''}" — není započítaný dvakrát?`);
    }
  });
  if (out.length === 0 && abs % 100 === 0) {
    out.push('Rozdíl je celá stovka — často jde o rozměňování nebo přehlédnutou bankovku.');
  }
  return out.slice(0, 3);
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

/**
 * What physically stays in the drawer for the next shift: the counted cash
 * minus the end-of-shift removal. This — not closing_cash — is the number the
 * next closing should start from.
 */
export function cashLeft(c: { closing_cash: number; final_removal?: number | null }): number {
  const removed = Number(c.final_removal) || 0;
  return Math.max(0, Math.round((Number(c.closing_cash) || 0) - removed));
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

// ---- Counting the drawer by denomination ------------------------------------
// Typing one total means doing the arithmetic in your head, and a slip there
// shows up as a phantom manko. Counting "3× 500, 7× 100…" is how people
// actually count a drawer — the app does the adding.

export type DenominationCounts = Record<string, number>;

/** Denominations per currency, largest first. Currencies without a set fall
 *  back to typing the total. */
export const DENOMINATION_SETS: Record<string, number[]> = {
  CZK: [2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1],
  EUR: [100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1],
};

export function denominationsFor(currency: string | null | undefined): number[] {
  return DENOMINATION_SETS[(currency ?? 'CZK').toUpperCase()] ?? [];
}

export function normalizeDenominations(raw: any): DenominationCounts {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: DenominationCounts = {};
  for (const [k, v] of Object.entries(raw)) {
    const denom = Number(k);
    const count = Math.round(Number(v));
    if (Number.isFinite(denom) && denom > 0 && Number.isFinite(count) && count > 0 && count <= 10000) {
      out[String(denom)] = count;
    }
  }
  return out;
}

/** Total value of the counted drawer. Cent-safe for decimal denominations. */
export function sumDenominations(counts: DenominationCounts): number {
  const cents = Object.entries(counts).reduce(
    (n, [denom, count]) => n + Math.round(Number(denom) * 100) * count, 0);
  return cents / 100;
}

export function hasDenominations(counts: DenominationCounts | null | undefined): boolean {
  return !!counts && Object.keys(counts).length > 0;
}
