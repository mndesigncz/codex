// Sloučení událostí živé odezvy u kasy (čisté, sdílí server lib/klient/odezva.ts i host UKasy).
//
// Jedna akce u kasy zapíše víc řádků za sebou: razítko ze čtečky (kind 'earn'), razítka navíc
// s důvodem (ruční úprava, kind 'manual') a uplatnění přibalené odměny. Řádky přijdou v jednom
// dotazu, nebo ve dvou po sobě (host se ptá každé 2,5 s). Host má vidět JEDEN list: „+2 · 6 / 8“
// a „Uplatněno: Káva“ — ne jen první razítko a pak ticho.

export interface UdalostOdezvy {
  id: string;
  typ: 'razitko' | 'body' | 'kredit' | 'odmena' | 'uplatneno';
  at: string;
  teamId: number;
  delta: number;
  karta?: { id: number; razitka: number; cil: number };
}

/**
 * Přidá nové události k už ukázaným: stejné id jen jednou, razítka jedné karty (podnik + kampaň)
 * se sčítají do jedné události (čas a id první, stav karty z poslední — ten je po všech zápisech).
 * Pořadí podle času.
 */
export function slucUdalosti<T extends UdalostOdezvy>(stare: readonly T[], nove: readonly T[]): T[] {
  const out: T[] = [];
  const videno = new Set<string>();
  const razitkaKarty = new Map<string, number>(); // klíč karty → index v out
  for (const u of [...stare, ...nove].sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
    if (videno.has(u.id)) continue;
    videno.add(u.id);
    if (u.typ === 'razitko') {
      const klic = `${u.teamId}:${u.karta?.id ?? 0}`;
      const i = razitkaKarty.get(klic);
      if (i != null) {
        const prvni = out[i];
        out[i] = { ...prvni, delta: Number(prvni.delta) + Number(u.delta), karta: u.karta ?? prvni.karta };
        continue;
      }
      razitkaKarty.set(klic, out.length);
    }
    out.push({ ...u });
  }
  return out;
}
