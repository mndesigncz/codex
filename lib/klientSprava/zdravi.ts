// Přehled správy Managero client (kolo 92): průvodce nastavením, zdraví programu a „před směnou".
// Čistá logika bez databáze (testy: scripts/testy/k92-sprava.ts).

/** Posledních `n` pražských dní končících dneškem (YYYY-MM-DD), nejstarší první. */
export function dnyZpet(dnes: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(dnes + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Krok průvodce nastavením: id, česká věta, záložka správy, kde se nastaví, a klíč, který to smí. */
export interface KrokPruvodce { id: string; hotovo: boolean; zalozka: string; klic: string }

/**
 * Sedm kroků k fungujícímu Managero client (Square „nastaveno z 55 %", Toast průvodce): stránka
 * zapnutá, vzhled (logo nebo barva), menu, stoly, věrnost, pokladna, poloha. Data ze souhrnu
 * /api/client/admin/summary (setup). Pořadí je pořadí, ve kterém to dává smysl dělat.
 */
export function krokyPruvodce(setup: any): KrokPruvodce[] {
  const s = setup ?? {};
  return [
    { id: 'zapnuto', hotovo: !!s.enabled, zalozka: 'settings', klic: 'klient.nastaveni' },
    { id: 'vzhled', hotovo: !!s.brand, zalozka: 'brand', klic: 'klient.vzhled' },
    { id: 'menu', hotovo: !!s.menu, zalozka: 'menu', klic: 'menu.zobrazit' },
    { id: 'stoly', hotovo: Number(s.tables) > 0, zalozka: 'tables', klic: 'stoly.upravit' },
    { id: 'vernost', hotovo: !!s.loyaltyOn, zalozka: 'loyalty', klic: 'vernost.pravidla' },
    { id: 'pokladna', hotovo: !!s.pos, zalozka: 'tables', klic: 'stoly.upravit' },
    { id: 'poloha', hotovo: !!s.location, zalozka: 'settings', klic: 'klient.nastaveni' },
  ];
}

/** Procento s jednou dělitelností: 38 z 100 → 38; bez základu null (žádné vymyšlené číslo). */
export function procento(cast: number, celek: number): number | null {
  return celek > 0 ? Math.round((cast / celek) * 100) : null;
}

/** Je narozeniny v okně kolem dne (±dni)? `birthday` YYYY-MM-DD (rok se ignoruje), `den` YYYY-MM-DD. */
export function narozeninyBlizko(birthday: string | null | undefined, den: string, dni = 3): boolean {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(birthday ?? ''));
  if (!m) return false;
  const rok = Number(den.slice(0, 4));
  const cil = Date.UTC(rok, Number(den.slice(5, 7)) - 1, Number(den.slice(8, 10)));
  for (const r of [rok - 1, rok, rok + 1]) {
    const b = Date.UTC(r, Number(m[1]) - 1, Number(m[2]));
    if (Math.abs(b - cil) <= dni * 86400000) return true;
  }
  return false;
}
