// Menu ↔ pokladna.
//
// Položka v menu je pro pokladnu jen text, dokud nemá `pos_product_id`. Bez
// něj objednávka od stolu do Storyous nedoletí a na terminálu se nevytiskne —
// pokladna netuší, co si má pod „Zelený čaj" představit. Tenhle soubor umí
// dvě věci, ze kterých se to párování skládá:
//
//   1. srovnat názvy tak, aby „Čaj zelený 0,5l" a „ČAJ ZELENÝ 0,5 L" byly
//      pro párování tentýž název,
//   2. z cest kategorií ve Storyous („Nápoje › Čaje › Zelené") udělat názvy
//      sekcí, které se dají číst.

export interface PosCatalogItem {
  productId: string;
  name: string;
  category: string | null;
  price: number | null;
}

/**
 * Název na tvar, ve kterém se dá porovnávat: bez diakritiky, malými písmeny,
 * interpunkce pryč, mezery srovnané. Desetinná čárka se mění na tečku, ať
 * „0,5 l" a „0.5 l" splynou — ve Storyous to podniky píšou obojím způsobem.
 */
export function normName(raw: any): string {
  return String(raw ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim();
}

/**
 * Názvy sekcí z cest kategorií. Zkracuje se na poslední článek cesty
 * („Nápoje › Čaje › Zelené" → „Zelené"), ale jen dokud je zkrácený název
 * jedinečný — když by dvě různé cesty splynuly, nechá se celá cesta, aby
 * v menu nevznikly dvě sekce se stejným nadpisem a jiným obsahem.
 */
export function sectionTitles(categories: string[]): Map<string, string> {
  const paths = Array.from(new Set(categories.map(c => String(c ?? '').trim()).filter(Boolean)));
  const lastOf = (p: string) => { const parts = p.split('›').map(s => s.trim()).filter(Boolean); return parts[parts.length - 1] || p; };
  const count = new Map<string, number>();
  for (const p of paths) { const l = lastOf(p); count.set(l, (count.get(l) ?? 0) + 1); }
  const out = new Map<string, string>();
  for (const p of paths) { const l = lastOf(p); out.set(p, (count.get(l) ?? 0) > 1 ? p : l); }
  return out;
}

/**
 * Ke každé nespárované položce nejvýš jeden produkt z pokladny. Když se na
 * jeden název hodí dva produkty, nepáruje se ani jeden — špatně spárovaná
 * položka je horší než nespárovaná, protože na terminálu vyjede něco jiného,
 * než si host objednal.
 */
export function matchByName<T extends { id: number; name: string }>(
  items: T[], catalog: PosCatalogItem[],
): { matched: { id: number; productId: string; name: string; posName: string }[]; ambiguous: string[] } {
  const byName = new Map<string, PosCatalogItem[]>();
  for (const p of catalog) {
    const k = normName(p.name);
    if (!k) continue;
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(p);
  }
  const matched: { id: number; productId: string; name: string; posName: string }[] = [];
  const ambiguous: string[] = [];
  for (const it of items) {
    const hits = byName.get(normName(it.name));
    if (!hits?.length) continue;
    // Víc produktů stejného jména může být jeden produkt vedený ve dvou
    // kategoriích — pak je to pořád jednoznačné.
    const ids = Array.from(new Set(hits.map(h => h.productId)));
    if (ids.length > 1) { ambiguous.push(it.name); continue; }
    matched.push({ id: it.id, productId: ids[0], name: it.name, posName: hits[0].name });
  }
  return { matched, ambiguous };
}
