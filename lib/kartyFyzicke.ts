// Fyzické kartičky — plastové nebo papírové karty, které podnik rozdá hostům bez aplikace.
//
// Čisté: bez databáze a bez importů aplikace, aby se dalo testovat přímo
// (scripts/testy/k90-karty-*.ts). Databázi drží lib/kartyFyzickeDb.ts a hledání
// karty u kasy lib/client.ts (najdiKartu).
//
// Jak to funguje:
//  • Podnik si vytiskne dávku karet (10–500). Každá karta má vlastní kód ve stejném
//    tvaru jako kartička v aplikaci (osm znaků ABCD-EFGH, bez zaměnitelných písmen),
//    takže ji přečte každá čtečka, kamera i ruční pole, které dnes čte kartičku z aplikace.
//    Kód je jedinečný napříč celou platformou (client_card_aliases.kod UNIQUE) a nesmí
//    se potkat ani s kódem kartičky z aplikace (client_cards.code).
//  • Karta z dávky je „nová“, dokud ji obsluha u kasy nepřiřadí hostovi (existujícímu,
//    nebo hostovi bez aplikace). Pak je „aktivní“ a funguje jako kartička hosta.
//    Zablokovaná karta (ztracená, nahrazená) u kasy řekne „Karta je zablokovaná.“
//  • Čísla starých karet z Kartičky (import) jsou cizí čísla v libovolném tvaru. Aby
//    stará plastová karta fungovala dál a dvě kavárny s kartou „1001“ si nevadily,
//    ukládá se cizí číslo pod klíčem podniku (T<podnik>:<číslo>) a najde se jen v něm.

export const ABECEDA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Kolik karet jde vytisknout najednou. */
export const POCET_MIN = 10;
export const POCET_MAX = 500;

export type StavKarty = 'nova' | 'aktivni' | 'blokovana';
export const STAVY_KARTY: StavKarty[] = ['nova', 'aktivni', 'blokovana'];
export const POPIS_STAVU: Record<StavKarty, string> = { nova: 'Nepřiřazená', aktivni: 'Aktivní', blokovana: 'Zablokovaná' };

/** Odkud karta je: vytištěná dávka, náhrada za ztracenou, nebo číslo staré karty z importu. */
export type ZdrojKarty = 'davka' | 'nahrada' | 'import';

export const HLASKA_BLOKOVANA = 'Karta je zablokovaná.';
export const HLASKA_CIZI_NOVA = 'Tahle karta patří jinému podniku a ještě není přiřazená hostovi.';

/** Osm znaků z náhodných bajtů, zapsaných jako ABCD-EFGH (stejně jako cardCode v lib/client.ts). */
export function kodZBajtu(b: ArrayLike<number>): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += ABECEDA[(b[i] ?? 0) % ABECEDA.length];
  return s.slice(0, 4) + '-' + s.slice(4);
}

/** Kód v tvaru Managera (osm znaků A–Z, 0–9) → ABCD-EFGH; jinak null. */
export function managerovyKod(raw: unknown): string | null {
  const t = String(raw ?? '').trim();
  // Jen písmena, číslice, mezery a pomlčky: z adresy („https://x.cz“) se kód nevyrábí.
  if (!/^[A-Za-z0-9 -]+$/.test(t)) return null;
  const s = t.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 8 ? s.slice(0, 4) + '-' + s.slice(4) : null;
}

/**
 * Číslo cizí (staré) karty: velká písmena a číslice bez mezer a pomlček, 3 až 40 znaků.
 * Čtečka čárových kódů přidá někdy mezery nebo pomlčky — ty se zahodí. Jiné znaky
 * (lomítko, tečka, diakritika) číslo karty nemá, takový text kartou není.
 */
export function ciziCislo(raw: unknown): string | null {
  const t = String(raw ?? '').trim();
  if (!t || t.length > 60 || !/^[A-Za-z0-9 -]+$/.test(t)) return null;
  const s = t.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length >= 3 && s.length <= 40 ? s : null;
}

/** Klíč cizí karty v tabulce aliasů: číslo platí jen v podniku, který ho převzal. */
export function klicCiziKarty(teamId: number, cislo: string): string {
  return `T${teamId}:${cislo}`;
}

/** Je to kód, který vypadá jako karta (Managero nebo staré číslo)? Pro rozhodnutí 400 × 404. */
export function vypadaJakoKarta(raw: unknown): boolean {
  return managerovyKod(raw) != null || ciziCislo(raw) != null;
}

/**
 * Kandidáti na hledání ve sloupci `kod`: kód Managera (platí všude) a klíč starého čísla
 * v podniku, kde se karta čte. Osmimístné staré číslo dá oba — rozhodne, co v tabulce je.
 */
export function kodyKHledani(raw: unknown, teamId: number | null): string[] {
  const out: string[] = [];
  const m = managerovyKod(raw);
  if (m) out.push(m);
  const c = ciziCislo(raw);
  if (c && teamId != null && teamId > 0) out.push(klicCiziKarty(teamId, c));
  return out;
}

/** Jak se karta ukáže lidem: kód Managera, nebo původní číslo staré karty (bez klíče podniku). */
export function zobrazitelnyKod(kod: string): string {
  const m = /^T\d+:(.+)$/.exec(kod);
  return m ? m[1] : kod;
}

export function overPocet(raw: unknown): { ok: true; pocet: number } | { ok: false; chyba: string } {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, chyba: `Zadej počet karet (${POCET_MIN} až ${POCET_MAX}).` };
  if (n < POCET_MIN) return { ok: false, chyba: `Nejméně ${POCET_MIN} karet v dávce.` };
  if (n > POCET_MAX) return { ok: false, chyba: `Nejvýš ${POCET_MAX} karet v dávce.` };
  return { ok: true, pocet: n };
}

/** Název dávky: volný text do 60 znaků, jinak „Dávka <číslo>“ (číslo doplní databáze). */
export function nazevDavky(raw: unknown): string | null {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return s || null;
}

// ---- Host bez aplikace -----------------------------------------------------------------

/**
 * Host, kterého založila obsluha u kasy (jen jméno, telefon nepovinně). Účet nemá
 * e-mail ani heslo, které by kdo znal; e-mail je technický, v doméně `.invalid`,
 * která nikdy nikam nedoručí (RFC 2606). Host si účet převezme tak, že si v aplikaci
 * připojí kartu (Moje → Mám plastovou kartu) — body a razítka přejdou na jeho účet.
 * Když obsluha e-mail zná, účet dostane skutečný e-mail jako u importu z Kartičky
 * a host se do něj dostane přes „Zapomenuté heslo“.
 */
export const DOMENA_BEZ_APLIKACE = '@managero.invalid';
export const PREDPONA_BEZ_APLIKACE = 'bez-aplikace-';

export function emailBezAplikace(nahodne: string): string {
  return `${PREDPONA_BEZ_APLIKACE}${String(nahodne).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24)}${DOMENA_BEZ_APLIKACE}`;
}

export function jeBezAplikace(email: unknown): boolean {
  const e = String(email ?? '').toLowerCase();
  return e.startsWith(PREDPONA_BEZ_APLIKACE) && e.endsWith(DOMENA_BEZ_APLIKACE);
}

export interface NovyHost { jmeno: string; telefon: string | null; email: string | null }

/** Ověří, co obsluha o hostovi bez aplikace zapsala. Jméno povinné, telefon a e-mail ne. */
export function overNovehoHosta(raw: any): { ok: true; host: NovyHost } | { ok: false; chyba: string } {
  const jmeno = String(raw?.jmeno ?? '').replace(/\s+/g, ' ').trim();
  if (jmeno.length < 2) return { ok: false, chyba: 'Napiš jméno hosta (aspoň dva znaky).' };
  if (jmeno.length > 80) return { ok: false, chyba: 'Jméno je moc dlouhé (nejvýš 80 znaků).' };
  const telSurovy = String(raw?.telefon ?? '').trim();
  let telefon: string | null = null;
  if (telSurovy) {
    const cislice = telSurovy.replace(/\D/g, '');
    if (!/^\+?[\d\s()/-]+$/.test(telSurovy) || cislice.length < 6 || cislice.length > 15) return { ok: false, chyba: 'Telefon vypadá špatně. Napiš ho jen číslicemi, třeba +420 777 123 456.' };
    telefon = (telSurovy.startsWith('+') ? '+' : '') + cislice;
  }
  const emSurovy = String(raw?.email ?? '').trim().toLowerCase();
  let email: string | null = null;
  if (emSurovy) {
    if (emSurovy.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emSurovy)) return { ok: false, chyba: 'E-mail vypadá špatně.' };
    if (emSurovy.endsWith(DOMENA_BEZ_APLIKACE)) return { ok: false, chyba: 'E-mail vypadá špatně.' };
    email = emSurovy;
  }
  return { ok: true, host: { jmeno, telefon, email } };
}

/** Dotaz na hledání hosta u kasy: aspoň dva znaky; z telefonu se berou číslice. */
export function dotazHledani(raw: unknown): { text: string; cislice: string; email: boolean } | null {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (text.length < 2) return null;
  const cislice = text.replace(/\D/g, '');
  return { text, cislice: cislice.length >= 4 && /^[+\d\s()/-]+$/.test(text) ? cislice : '', email: text.includes('@') };
}

/** Telefon k zobrazení obsluze: jen poslední tři číslice (host u kasy stojí, číslo zná sám). */
export function maskaTelefonu(tel: unknown): string | null {
  const c = String(tel ?? '').replace(/\D/g, '');
  return c.length >= 6 ? `••• ${c.slice(-3)}` : null;
}

/** E-mail k zobrazení obsluze: první písmeno a doména (j•••@seznam.cz). Technický e-mail se neukazuje. */
export function maskaEmailu(email: unknown): string | null {
  const e = String(email ?? '');
  if (!e.includes('@') || jeBezAplikace(e) || e.endsWith('.invalid')) return null;
  const [jm, dom] = e.split('@');
  return `${jm.slice(0, 1)}•••@${dom}`;
}

// ---- Rozhodnutí nad kartou -----------------------------------------------------------

export interface KartaStav { stav: StavKarty; teamId: number; customerId: number | null }

type Rozhodnuti = { ok: true } | { ok: false; status: number; chyba: string };

/** Obsluha u kasy přiřazuje kartu hostovi: jen nová karta vlastního podniku. */
export function rozhodniAktivaci(k: KartaStav | null, teamId: number): Rozhodnuti {
  if (!k) return { ok: false, status: 404, chyba: 'Takovou kartu neznáme.' };
  if (k.stav === 'blokovana') return { ok: false, status: 410, chyba: HLASKA_BLOKOVANA };
  if (k.teamId !== teamId) return { ok: false, status: 403, chyba: 'Tahle karta patří jinému podniku.' };
  if (k.stav === 'aktivni' || k.customerId != null) return { ok: false, status: 409, chyba: 'Karta už je přiřazená hostovi.' };
  return { ok: true };
}

/** Zablokovat jde nová i aktivní karta (ztracená, ukradená, rozbitá). */
export function rozhodniBlokaci(k: KartaStav | null, teamId: number): Rozhodnuti {
  if (!k || k.teamId !== teamId) return { ok: false, status: 404, chyba: 'Karta nenalezena.' };
  if (k.stav === 'blokovana') return { ok: false, status: 409, chyba: 'Karta už je zablokovaná.' };
  return { ok: true };
}

/**
 * Nahradit = host dostane novou kartu, stará se zablokuje. Stará musí patřit hostovi;
 * nová (když ji obsluha opsala z krabice) musí být nová karta téhož podniku.
 */
export function rozhodniNahradu(stara: KartaStav | null, nova: KartaStav | null | undefined, teamId: number): Rozhodnuti {
  if (!stara || stara.teamId !== teamId) return { ok: false, status: 404, chyba: 'Karta nenalezena.' };
  if (stara.customerId == null) return { ok: false, status: 409, chyba: 'Nahradit jde jen kartu, která patří hostovi. Nepřiřazenou kartu stačí zablokovat.' };
  if (nova === undefined) return { ok: true };
  if (!nova) return { ok: false, status: 404, chyba: 'Novou kartu s tímhle kódem neznáme.' };
  if (nova.teamId !== teamId) return { ok: false, status: 403, chyba: 'Nová karta patří jinému podniku.' };
  if (nova.stav !== 'nova' || nova.customerId != null) return { ok: false, status: 409, chyba: nova.stav === 'blokovana' ? 'Nová karta je zablokovaná.' : 'Nová karta už patří hostovi.' };
  return { ok: true };
}

export type Pripojeni =
  | { akce: 'aktivovat' }
  | { akce: 'uz_tvoje' }
  | { akce: 'prevzit'; zId: number }
  | { akce: 'odmitnout'; status: number; chyba: string };

/**
 * Host s aplikací si připojuje plastovou kartu (opíše kód z karty). Fyzická karta v ruce
 * je důkaz: nová karta se mu přiřadí, karta hosta bez aplikace se převezme (body a razítka
 * přejdou na jeho účet). Karta jiného člověka s aplikací se nepřevezme nikdy.
 */
export function rozhodniPripojeni(k: KartaStav | null, meId: number, vlastnikBezAplikace: boolean): Pripojeni {
  if (!k) return { akce: 'odmitnout', status: 404, chyba: 'Takovou kartu neznáme. Zkontroluj kód.' };
  if (k.stav === 'blokovana') return { akce: 'odmitnout', status: 410, chyba: HLASKA_BLOKOVANA };
  if (k.customerId == null) return { akce: 'aktivovat' };
  if (k.customerId === meId) return { akce: 'uz_tvoje' };
  if (vlastnikBezAplikace) return { akce: 'prevzit', zId: k.customerId };
  return { akce: 'odmitnout', status: 409, chyba: 'Karta patří jinému účtu. Jestli je tvoje, ukaž ji u kasy.' };
}
