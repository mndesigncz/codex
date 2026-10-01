// Krok návodu, který může být zároveň surovinou.
//
// Návod „Jak udělat Blue Lagoon" a receptura téhož nápoje jsou dvě strany
// jedné věci: barman čte kroky, sklad potřebuje gramáž. Dokud to byly dvě
// oddělené obrazovky, psalo se to dvakrát — a po první změně se to rozešlo.
//
// Historicky byl checklist prosté pole řetězců. Ta podoba musí dál fungovat:
// v databázi jsou stovky starých návodů a přepisovat je migrací kvůli
// nepovinnému poli by bylo riskantnější než je při čtení normalizovat.

import { prevedMnozstvi } from './jednotky.ts';

export interface GuideStep {
  text: string;
  /** Skladová položka, když je krok zároveň surovinou. */
  itemId?: number | null;
  /** Množství v jednotce, ve které je položka vedená (podle něj se odepisuje a počítá receptura). */
  amount?: number | null;
  /** Jednotka, v níž se množství zadávalo a zobrazuje (ml, cl, dl…). */
  unit?: string | null;
  /**
   * Množství tak, jak bylo zadáno, v jednotce `unit` (20 při „20 ml“).
   * Přítomnost pole říká, že `amount` už je převedené do jednotky položky.
   * Staré kroky ho nemají: tam je `amount` bráno beze změny jako množství
   * v jednotce položky (jak se to vždy odepisovalo) a `unit` je jen popisek.
   */
  zadano?: number | null;
}

/**
 * Hodnoty kroku po zadání množství: `amount` převedené do jednotky položky,
 * `zadano` a `unit` tak, jak je uživatel napsal. Bez položky (nevíme, do čeho
 * převádět) se nic nepřevádí.
 */
export function mnozstviKroku(zadano: number | null, unit: string | null, jednotkaPolozky: string | null): Pick<GuideStep, 'amount' | 'unit' | 'zadano'> {
  if (zadano == null || !(zadano > 0)) return { amount: null, unit, zadano: null };
  const amount = jednotkaPolozky && unit ? prevedMnozstvi(zadano, unit, jednotkaPolozky) : zadano;
  return { amount, unit, zadano };
}

/** Co ukázat v poli kroku: zadané číslo a jeho jednotka (u starých kroků uložené číslo a jednotka tak, jak jsou). */
export function zadaneMnozstvi(step: GuideStep, jednotkaPolozky: string | null): { hodnota: number | null; unit: string | null } {
  if (step.zadano != null) return { hodnota: step.zadano, unit: step.unit ?? jednotkaPolozky };
  return { hodnota: step.amount ?? null, unit: step.unit ?? jednotkaPolozky };
}

/** Text množství kroku („20 ml“) — z toho, co uživatel zadal; u starých kroků z uloženého čísla. */
export function popisMnozstviKroku(step: GuideStep): string {
  const n = step.zadano ?? step.amount;
  if (n == null) return '';
  return `${String(n).replace('.', ',')} ${step.unit ?? ''}`.trim();
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
      const zadano = Number(String(raw.zadano ?? '').replace(',', '.'));
      if (raw.zadano != null && raw.zadano !== '' && Number.isFinite(zadano) && zadano > 0 && step.amount != null) {
        step.zadano = Math.round(zadano * 1e6) / 1e6;
      }
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
