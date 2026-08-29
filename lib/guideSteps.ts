// Krok návodu, který může být zároveň surovinou.
//
// Návod „Jak udělat Blue Lagoon" a receptura téhož nápoje jsou dvě strany
// jedné věci: barman čte kroky, sklad potřebuje gramáž. Dokud to byly dvě
// oddělené obrazovky, psalo se to dvakrát — a po první změně se to rozešlo.
//
// Historicky byl checklist prosté pole řetězců. Ta podoba musí dál fungovat:
// v databázi jsou stovky starých návodů a přepisovat je migrací kvůli
// nepovinnému poli by bylo riskantnější než je při čtení normalizovat.

export interface GuideStep {
  text: string;
  /** Skladová položka, když je krok zároveň surovinou. */
  itemId?: number | null;
  /** Množství v jednotce, ve které je položka vedená. */
  amount?: number | null;
  /** Jednotka jen pro zobrazení — pravdu drží položka. */
  unit?: string | null;
}

/** Přijme starý řetězec i nový objekt a vrátí vždy stejný tvar. */
export function normalizeSteps(input: any): GuideStep[] {
  if (!Array.isArray(input)) return [];
  const out: GuideStep[] = [];
  for (const raw of input.slice(0, 60)) {
    if (typeof raw === 'string') {
      const text = raw.trim();
      if (text) out.push({ text: text.slice(0, 300) });
      continue;
    }
    if (!raw || typeof raw !== 'object') continue;
    const text = String(raw.text ?? '').trim();
    if (!text) continue;
    const step: GuideStep = { text: text.slice(0, 300) };
    const itemId = Number(raw.itemId);
    if (Number.isFinite(itemId) && itemId > 0) {
      step.itemId = itemId;
      const amount = Number(String(raw.amount ?? '').toString().replace(',', '.'));
      step.amount = Number.isFinite(amount) && amount > 0 ? Math.round(amount * 1e6) / 1e6 : null;
      const unit = raw.unit == null ? '' : String(raw.unit).trim().slice(0, 12);
      step.unit = unit || null;
    }
    out.push(step);
  }
  return out;
}

/** Jen kroky, které nesou surovinu s množstvím — z nich se dá udělat receptura. */
export function ingredientSteps(steps: GuideStep[]): Required<Pick<GuideStep, 'itemId' | 'amount'>>[] {
  return steps
    .filter(s => s.itemId != null && s.amount != null && s.amount > 0)
    .map(s => ({ itemId: s.itemId as number, amount: s.amount as number }));
}
