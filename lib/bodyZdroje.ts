// Za co host dostává body mimo kasu: objednávky od stolu a rezervace. Čisté funkce bez databáze.
//
// Dřív dostal host body za každou dokončenou objednávku a za rezervaci nic; podnik to nemohl změnit.
// Teď je to nastavení: objednávky se dají vypnout (body zůstanou jen u kasy) a za rezervaci, která
// proběhla (hosté byli usazeni a rezervace se uzavřela), se dá dát pevný počet bodů.

export const MAX_BODU_ZA_REZERVACI = 1000;

export interface ZdrojeBodu {
  /** Body z objednávek od stolu podle pravidel bodů (zaokrouhlení, minimum, strop). Výchozí zapnuto. */
  objednavky: boolean;
  /** Pevný počet bodů za rezervaci, která proběhla. 0 = žádné. */
  zaRezervaci: number;
}
export const VYCHOZI_ZDROJE: ZdrojeBodu = { objednavky: true, zaRezervaci: 0 };

/** Zdroje z formuláře: pravdivostní hodnota a celé číslo v mezích. Neplatné je chyba, ne tiché zaokrouhlení. */
export function normalizujZdroje(b: { orders?: unknown; perReservation?: unknown }): { ok: true; zdroje: ZdrojeBodu } | { ok: false; chyba: string } {
  if (typeof b?.orders !== 'boolean') return { ok: false, chyba: 'Zapni nebo vypni body za objednávky.' };
  const raw = b?.perReservation;
  const prazdne = raw == null || (typeof raw === 'string' && raw.trim() === '');
  let body = 0;
  if (!prazdne) {
    if (typeof raw === 'string' ? !/^\s*\d{1,5}\s*$/.test(raw) : typeof raw !== 'number' || !Number.isInteger(raw)) return { ok: false, chyba: `Bodů za rezervaci je celé číslo od 0 do ${MAX_BODU_ZA_REZERVACI}.` };
    body = Number(raw);
    if (body < 0 || body > MAX_BODU_ZA_REZERVACI) return { ok: false, chyba: `Bodů za rezervaci je celé číslo od 0 do ${MAX_BODU_ZA_REZERVACI}.` };
  }
  return { ok: true, zdroje: { objednavky: b.orders, zaRezervaci: body } };
}

/** Řádek client_profiles → zdroje. Chybějící sloupce (před migrací) = dosavadní chování (objednávky ano, rezervace ne). */
export function zdrojeZProfilu(p: { points_orders?: unknown; points_per_reservation?: unknown } | null | undefined): ZdrojeBodu {
  const n = Math.trunc(Number(p?.points_per_reservation));
  return { objednavky: p?.points_orders !== false, zaRezervaci: Number.isFinite(n) ? Math.max(0, Math.min(MAX_BODU_ZA_REZERVACI, n)) : 0 };
}

/** Kolik bodů se z dokončené objednávky smí připsat: vypnuté objednávky = nic, jinak to, co spočítala pravidla bodů. */
export function bodyZObjednavky(zdroje: Pick<ZdrojeBodu, 'objednavky'>, spocteno: number): number {
  return zdroje.objednavky ? Math.max(0, Math.trunc(Number(spocteno)) || 0) : 0;
}
