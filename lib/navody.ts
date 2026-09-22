// Vazba návodu na skladovou položku, kterou si vyrábíme sami.
//
// Postup výroby se do téhle chvíle psal jako holý text do
// `inventory_items.batch_steps`. Nebyl v žádné kategorii, nešel dát ke
// schválení, nikdo nepotvrdil, že ho četl, a ze záložky Návody nebyl vidět —
// takže vedle sebe v aplikaci žily dva nezávislé popisy téhož: „Postup“
// u položky a návod „Jak vyrobit domácí limonádu“ v Návodech. Po první změně
// receptury se rozešly a obsluha četla ten starší.
//
// Návod na to má všechno navíc: kategorie, schvalování, potvrzení přečtení,
// sdílení ven a hlavně kroky, které umí nést surovinu s množstvím
// (`lib/guideSteps.ts`). Z jednoho návodu tedy jde postavit i receptura.
//
// Vazba je JEDEN návod na JEDNU položku, uložená na straně návodu
// (`guides.item_id`) — stejně jako `guides.product_id` pro položku v kase.
// `product_id` říká „tohle se z toho prodává“, `item_id` říká „takhle se to
// vyrábí“. Držet to na návodu znamená, že smazání návodu vazbu odnese s sebou
// a položka nezůstane ukazovat do prázdna.

// Přípona `.ts` je tu schválně: `scripts/test-units.ts` běží přes node
// rovnou nad zdrojem, a bez ní modul nenajde. Stejně to má productionPlan.ts.
import { normalizeSteps, type GuideStep } from './guideSteps.ts';

/** Návod, jak se položka vyrábí — tolik, kolik potřebuje úkol i editor. */
export interface NavodKPolozce {
  id: number;
  title: string;
  /** Kroky návodu. Prázdné, když návod žádný checklist nemá. */
  steps: GuideStep[];
  /** Čeká na schválení vedením — do úkolu se takový návod nepouští. */
  approved: boolean;
}

/** Texty kroků návodu, připravené jako checklist úkolu. */
export function krokyNavodu(n: NavodKPolozce | null | undefined): string[] {
  if (!n) return [];
  return n.steps.map(s => s.text.trim()).filter(Boolean);
}

/** Řádek z databáze → `NavodKPolozce`. Snese i starý checklist jako pole řetězců. */
export function navodZRadku(r: any): NavodKPolozce | null {
  if (!r || r.id == null) return null;
  const raw = typeof r.checklist === 'string'
    ? (() => { try { return JSON.parse(r.checklist); } catch { return []; } })()
    : r.checklist;
  return {
    id: Number(r.id),
    title: String(r.title ?? ''),
    steps: normalizeSteps(raw),
    approved: r.approved !== false,
  };
}

/**
 * Návody pro položky, seskupené podle položky.
 *
 * Bere `rows` už načtené volajícím, aby tenhle soubor nesahal na databázi
 * a dal se testovat bez ní. Když na jednu položku ukazuje víc návodů (což
 * schválně nezakazujeme migrací, jen tímhle výběrem), vyhraje schválený
 * a mezi schválenými ten s nižším id — tedy ten, který tam byl dřív.
 */
export function navodyPodlePolozek(rows: any[]): Map<number, NavodKPolozce> {
  const out = new Map<number, NavodKPolozce>();
  for (const r of rows ?? []) {
    const itemId = Number(r?.item_id ?? r?.itemId);
    if (!Number.isFinite(itemId) || itemId <= 0) continue;
    const n = navodZRadku(r);
    if (!n) continue;
    const stavajici = out.get(itemId);
    if (!stavajici) { out.set(itemId, n); continue; }
    if (!stavajici.approved && n.approved) { out.set(itemId, n); continue; }
    if (stavajici.approved === n.approved && n.id < stavajici.id) out.set(itemId, n);
  }
  return out;
}
