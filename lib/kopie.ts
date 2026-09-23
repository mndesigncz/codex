// Kopie do podniku (kolo 64) — čistá část, bez databáze.
//
// Vedení podniku B si zkopíruje návody, postupy nebo menu z podniku A téže
// organizace. Je to jednorázová KOPIE, ne živé sdílení: návod ukazuje na
// surovinu ve skladu a postup na návod, a sklad i návody má každý podnik
// svoje. Řádek se tedy nepřenese i s id-čky, ale odkazy se PŘEMAPUJÍ podle
// názvu — a kde stejný název v cíli není, odkaz se odpojí a řekne se to
// v poznámce, místo aby v podniku B zůstal ukazatel do skladu podniku A.
//
// Databázová část je vedle v lib/kopieDoPodniku.ts (stejná dvojice jako
// navody.ts / navodyDb.ts), tohle jde testovat v `npm test`.

import type { GuideStep } from './guideSteps';
import type { Step } from './steps';
import { normName } from './menuPos.ts';

/** Co se dá kopírovat. Receptury jdou s návody (krok návodu = surovina). */
export type EntitaKopie = 'navody' | 'postupy' | 'menu';
export const ENTITY_KOPIE: EntitaKopie[] = ['navody', 'postupy', 'menu'];
export const jeEntitaKopie = (v: unknown): v is EntitaKopie => ENTITY_KOPIE.includes(v as EntitaKopie);

/** Nejvíc položek v jedné dávce — víc by v jednom požadavku běželo příliš dlouho. */
export const MAX_IDS_KOPIE = 50;

/** Nejvyšší id, které se vejde do sloupce INTEGER — větší by shodilo dotaz `id = ANY(...)` celé dávky. */
export const MAX_ID = 2147483647;

/**
 * Řádek cíle se stejným názvem (normName: bez diakritiky, velikosti písmen
 * a interpunkce), jinak null. Při víc shodách vyhraje nejnižší id — to je
 * ten, který v podniku existuje nejdéle, a hlavně je volba předvídatelná
 * bez ohledu na pořadí řádků z databáze.
 */
export function premapujPodleNazvu(nazev: string | null | undefined, cil: { id: number; name: string }[]): number | null {
  const k = normName(nazev);
  if (!k) return null;
  let nejlepsi: number | null = null;
  for (const c of cil) {
    if (normName(c.name) !== k) continue;
    if (nejlepsi == null || c.id < nejlepsi) nejlepsi = c.id;
  }
  return nejlepsi;
}

/** Krok v poznámce — zkrácený, ať poznámka nezabere celý řádek. */
const kratce = (text: string) => (text.length > 40 ? text.slice(0, 40).trimEnd() + '…' : text);

/**
 * Kroky návodu pro cílový podnik: surovina kroku se najde ve zdroji podle
 * id, v cíli podle názvu. Když v cíli není, krok zůstane jako text — bez
 * itemId, amount i unit, protože množství bez položky nemá k čemu být
 * a receptura by se tvářila úplná, i když jí surovina chybí.
 */
export function premapujKroky(
  kroky: GuideStep[], nazvyZdroje: Map<number, string>, cil: { id: number; name: string }[],
): { kroky: GuideStep[]; poznamky: string[] } {
  const poznamky: string[] = [];
  const out = kroky.map(k => {
    if (k.itemId == null) return { text: k.text };
    const nazev = nazvyZdroje.get(k.itemId);
    const noveId = premapujPodleNazvu(nazev, cil);
    if (noveId != null) return { text: k.text, itemId: noveId, amount: k.amount ?? null, unit: k.unit ?? null };
    // Položka zdroje mohla být mezitím smazaná — pak ani nevíme, jak se jmenovala.
    poznamky.push(nazev
      ? `Krok „${kratce(k.text)}": surovina „${nazev}" v tomhle podniku není — odpojeno.`
      : `Krok „${kratce(k.text)}": surovina ve zdroji už není — odpojeno.`);
    return { text: k.text };
  });
  return { kroky: out, poznamky };
}

/**
 * Odkazy kroků postupu na návody: nejdřív návod zkopírovaný v téže dávce
 * (má nové id), jinak návod cíle se stejným názvem, jinak odpojit. Odkaz na
 * cizí id by v podniku B otevřel návod podniku A — nebo nic.
 */
export function premapujGuideId(
  items: Step[], mapaDavky: Map<number, number>, navodyCile: { id: number; title: string }[], nazvyZdroje: Map<number, string>,
): { items: Step[]; poznamky: string[] } {
  const poznamky: string[] = [];
  const cil = navodyCile.map(n => ({ id: n.id, name: n.title }));
  const out = items.map(s => {
    if (s.guideId == null) return s;
    const zDavky = mapaDavky.get(s.guideId);
    if (zDavky != null) return { ...s, guideId: zDavky };
    const nazev = nazvyZdroje.get(s.guideId);
    const noveId = premapujPodleNazvu(nazev, cil);
    if (noveId != null) return { ...s, guideId: noveId };
    poznamky.push(nazev
      ? `Krok „${kratce(s.text)}": návod „${nazev}" tu není — odkaz odpojen.`
      : `Krok „${kratce(s.text)}": návod ve zdroji už není — odkaz odpojen.`);
    return { ...s, guideId: null };
  });
  return { items: out, poznamky };
}

/**
 * Volná veřejná adresa menu. Slug je jedinečný napříč všemi podniky
 * (unikátní index), takže kopie nemůže dostat adresu originálu; přidá se
 * pořadové číslo jako při zakládání menu. Očištění (cleanSlug z lib/menu)
 * dělá volající — lib/menu se kvůli vzhledu menu nedá načíst v `npm test`.
 * Prázdný slug dostane „menu".
 */
export function volnySlug(slug: string, obsazene: Set<string>): string {
  const zaklad = slug.trim() || 'menu';
  if (!obsazene.has(zaklad)) return zaklad;
  for (let i = 2; ; i++) {
    const kandidat = `${zaklad}-${i}`;
    if (!obsazene.has(kandidat)) return kandidat;
  }
}

/** Množina názvů cíle pro poznámku „Stejný název tu už je." */
export function nazvyNormovane(nazvy: (string | null | undefined)[]): Set<string> {
  return new Set(nazvy.map(normName).filter(Boolean));
}

/** Výsledek kopie jedné položky — tvar odpovědi POST. */
export interface VysledekKopie {
  id: number;
  noveId: number | null;
  nazev: string;
  poznamky: string[];
}
