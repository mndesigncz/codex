// Automatizace zpráv členům: uvítací série, po první návštěvě, po dokončení
// karty, narozeninový kupon a „Chybíš nám“. Čistá logika bez databáze
// (testy: scripts/testy/k81-automatizace.ts); SQL je v lib/automatizaceDb.ts.
//
// Zásady:
//  * Každá automatizace se zapíná a vypíná zvlášť a má svůj text s náhledem.
//  * Odeslání je idempotentní: v deníku (client_automatizace_log) je jeden řádek
//    na člena a „důvod“ (ref), takže opakovaný cron ani dvojí spuštění nepošle
//    totéž dvakrát.
//  * Nová pravidla se týkají jen členů, kteří se přidali (nebo přišli) po zapnutí:
//    zapnutí uvítací série nezasype zprávou členy z minulého roku.
//  * Zprávy jdou jako oznámení a e-mail těm, kdo souhlasili s novinkami; kupon
//    se připíše vždy (je to dárek, ne reklama).

import { czCount } from './czech.ts';
import { pragueDayOf, dayPlus } from './pragueTime.ts';
import { casZDb } from './segmenty.ts';

export type DruhAutomatizace = 'uvitani' | 'prvni_navsteva' | 'dokoncena_karta' | 'narozeniny_kupon' | 'chybis_nam';

export const DRUHY_AUTOMATIZACE: DruhAutomatizace[] = ['uvitani', 'prvni_navsteva', 'dokoncena_karta', 'narozeniny_kupon', 'chybis_nam'];

export const jeDruhAutomatizace = (v: unknown): v is DruhAutomatizace => DRUHY_AUTOMATIZACE.includes(v as DruhAutomatizace);

export const MAX_NADPIS = 80;
export const MAX_TEXT = 300;
export const MAX_KROKU_UVITANI = 3;
export const MAX_DEN_UVITANI = 60;
/** Kolik dní po termínu se krok uvítací série ještě pošle (zmeškaný cron nesmí poslat zprávu o měsíc později). */
export const OKNO_UVITANI_DNI = 3;

export interface KrokUvitani { dny: number; title: string; body: string }

export interface KonfiguraceZpravy {
  title: string;
  body: string;
  /** Kupon (nabídka), který člen dostane s touto zprávou; null = bez kuponu. */
  kuponId: number | null;
}

export interface KonfiguraceUvitani { kroky: (KrokUvitani & { kuponId: number | null })[] }

export interface KonfiguraceChybisNam extends KonfiguraceZpravy {
  /** Po kolika dnech bez návštěvy se posílá (zapamatované i při vypnutí). */
  dny: number;
  /** Dárkové body navíc. */
  body_bodu: number;
}

export interface KonfiguraceNarozeniny extends KonfiguraceZpravy {
  /** Dárkové body (profile.birthday_points) — nastavují se tady, žijí v profilu podniku. */
  body_bodu: number;
}

export interface DefinicePravidla {
  id: DruhAutomatizace;
  nazev: string;
  kdy: string;
  /** Co host dostane, jednou větou do hlavičky karty. */
  popis: string;
}

export const DEFINICE: DefinicePravidla[] = [
  { id: 'uvitani', nazev: 'Uvítací série', kdy: 'Po přidání do klubu', popis: 'Až tři zprávy po vstupu: hned, po pár dnech a po týdnu. Každá může nést kupon.' },
  { id: 'prvni_navsteva', nazev: 'Po první návštěvě', kdy: 'Když člen poprvé přijde ke kase', popis: 'Poděkování za první návštěvu a důvod přijít podruhé.' },
  { id: 'dokoncena_karta', nazev: 'Po dokončení karty', kdy: 'Když člen vysbírá celou razítkovou kartu', popis: 'Gratulace s odměnou. Kupon k tomu je volitelný.' },
  { id: 'narozeniny_kupon', nazev: 'Narozeninový kupon', kdy: 'V den narozenin člena', popis: 'Kupon a dárkové body v den narozenin. Jednou za rok.' },
  { id: 'chybis_nam', nazev: 'Chybíš nám', kdy: 'Když člen přestane chodit', popis: 'Připomenutí hostovi, který dlouho nebyl. Jednou za každou odmlku.' },
];

export const DEFINICE_PODLE_ID: Record<DruhAutomatizace, DefinicePravidla> = Object.fromEntries(DEFINICE.map(d => [d.id, d])) as Record<DruhAutomatizace, DefinicePravidla>;

/** Zástupné značky, které se v textu dosadí. */
export const ZASTUPNE_ZNACKY = [
  { znacka: '{jmeno}', popis: 'křestní jméno člena' },
  { znacka: '{podnik}', popis: 'název podniku' },
];

/** Značky navíc u pravidel, kde dávají smysl. */
export const ZNACKY_PRAVIDLA: Partial<Record<DruhAutomatizace, { znacka: string; popis: string }[]>> = {
  chybis_nam: [{ znacka: '{dny}', popis: 'kolik dní člen nebyl, např. „30 dní“' }, { znacka: '{body}', popis: 'dárkové body, např. „50 bodů“' }],
  narozeniny_kupon: [{ znacka: '{body}', popis: 'dárkové body, např. „50 bodů“' }],
};

// ---- Výchozí texty -----------------------------------------------------------------

export function vychoziKonfigurace(druh: DruhAutomatizace): any {
  switch (druh) {
    case 'uvitani': return {
      kroky: [
        { dny: 0, title: 'Vítej v {podnik}, {jmeno}', body: 'Jsme rádi, že jsi s námi. Ukaž kartičku u kasy a sbírej body i razítka.', kuponId: null },
        { dny: 3, title: 'Máš už první odměnu?', body: 'Podívej se, co si můžeš dát za body. První kupon je blíž, než si myslíš.', kuponId: null },
      ],
    } satisfies KonfiguraceUvitani;
    case 'prvni_navsteva': return {
      title: 'Díky za první návštěvu, {jmeno}', body: 'Hezky jsme tě poznali. Příště se k nám vrať, na kartičce na tebe čekají body a razítka.', kuponId: null,
    } satisfies KonfiguraceZpravy;
    case 'dokoncena_karta': return {
      title: 'Hotovo, {jmeno}! Karta je plná', body: 'Odměna za plnou kartu na tebe čeká mezi kupony. Ukaž ji u kasy.', kuponId: null,
    } satisfies KonfiguraceZpravy;
    case 'narozeniny_kupon': return {
      title: 'Všechno nejlepší, {jmeno}!', body: 'K narozeninám od nás máš dárek. Najdeš ho na kartičce.', kuponId: null, body_bodu: 0,
    } satisfies KonfiguraceNarozeniny;
    case 'chybis_nam': return {
      title: 'Chybíš nám, {jmeno}', body: 'Už je to {dny}. Přijď se podívat, rádi tě zase uvidíme.', kuponId: null, dny: 30, body_bodu: 0,
    } satisfies KonfiguraceChybisNam;
  }
}

// ---- Šablona -----------------------------------------------------------------------

/** Křestní jméno z celého jména; prázdné jméno dá „hosto“-neutrální náhradu. */
export function kratkeJmeno(cele: unknown): string {
  const j = String(cele ?? '').trim().split(/\s+/)[0] ?? '';
  return j || 'hoste';
}

/** Dosadí {jmeno} a {podnik}. Neznámé značky nechá, jak jsou (překlep je vidět v náhledu). */
export interface KontextSablony { jmeno?: string; podnik?: string; dny?: number; body?: number }

const BOD_TVARY = { one: 'bod', few: 'body', many: 'bodů' };
const DEN_TVARY = { one: 'den', few: 'dny', many: 'dní' };

export function vyplnSablonu(text: string, ctx: KontextSablony): string {
  return String(text ?? '')
    .replace(/\{jmeno\}/g, ctx.jmeno ? kratkeJmeno(ctx.jmeno) : 'hoste')
    .replace(/\{podnik\}/g, ctx.podnik || 'u nás')
    .replace(/\{dny\}/g, ctx.dny ? czCount(ctx.dny, DEN_TVARY) : 'dlouho')
    .replace(/\{body\}/g, ctx.body && ctx.body > 0 ? czCount(ctx.body, BOD_TVARY) : '');
}

/** Zprávy, které jdou z konfigurace jednoho pravidla (pro uvítací sérii vybere krok). */
export function zpravaAutomatizace(druh: DruhAutomatizace, cfg: any, ctx: KontextSablony, krok = 0): { title: string; body: string } | null {
  const zdroj = druh === 'uvitani' ? cfg?.kroky?.[krok] : cfg;
  if (!zdroj) return null;
  const title = vyplnSablonu(String(zdroj.title ?? ''), ctx).trim().slice(0, MAX_NADPIS);
  if (!title) return null;
  const sablona = String(zdroj.body ?? '');
  let body = vyplnSablonu(sablona, ctx).trim();
  // Dárkové body se k textu přidají samy, když je provozovatel nenapsal přes {body}: host se o nich musí dozvědět.
  if ((druh === 'chybis_nam' || druh === 'narozeniny_kupon') && (ctx.body ?? 0) > 0 && !sablona.includes('{body}')) {
    body = `${body}${body ? ' ' : ''}Na kartičce na tebe čeká ${czCount(ctx.body!, BOD_TVARY)} navíc.`;
  }
  return { title, body: body.slice(0, MAX_TEXT) };
}

// ---- Ověření -----------------------------------------------------------------------

const cel = (v: unknown, min: number, max: number, dflt: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : dflt;
};
const kupon = (v: unknown): number | null => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const nadpis = (v: unknown) => String(v ?? '').trim().slice(0, MAX_NADPIS);
const text = (v: unknown) => String(v ?? '').trim().slice(0, MAX_TEXT);

/**
 * Konfigurace z těla požadavku. Zapnuté pravidlo bez nadpisu je chyba (zpráva bez nadpisu nejde poslat);
 * vypnuté se uloží i rozepsané, ať o text nepřijdeš.
 */
export function overKonfiguraci(druh: DruhAutomatizace, raw: any, zapnuto: boolean): { ok: true; cfg: any } | { ok: false; error: string } {
  const b = raw && typeof raw === 'object' ? raw : {};
  if (druh === 'uvitani') {
    const vstup = Array.isArray(b.kroky) ? b.kroky.slice(0, MAX_KROKU_UVITANI) : [];
    const kroky = vstup.map((k: any) => ({ dny: cel(k?.dny, 0, MAX_DEN_UVITANI, 0), title: nadpis(k?.title), body: text(k?.body), kuponId: kupon(k?.kuponId) }));
    if (zapnuto && kroky.length === 0) return { ok: false, error: 'Uvítací série potřebuje aspoň jednu zprávu.' };
    if (zapnuto && kroky.some((k: KrokUvitani) => !k.title)) return { ok: false, error: 'Každá zpráva uvítací série potřebuje nadpis.' };
    const dny = kroky.map((k: KrokUvitani) => k.dny);
    if (new Set(dny).size !== dny.length) return { ok: false, error: 'Dvě zprávy série nemůžou jít ve stejný den. Změň počet dní u jedné z nich.' };
    return { ok: true, cfg: { kroky: [...kroky].sort((a, c) => a.dny - c.dny) } };
  }
  const zaklad: KonfiguraceZpravy = { title: nadpis(b.title), body: text(b.body), kuponId: kupon(b.kuponId) };
  if (zapnuto && !zaklad.title) return { ok: false, error: 'Zpráva potřebuje nadpis.' };
  if (druh === 'narozeniny_kupon') return { ok: true, cfg: { ...zaklad, body_bodu: cel(b.body_bodu, 0, 1000, 0) } };
  if (druh === 'chybis_nam') return { ok: true, cfg: { ...zaklad, dny: cel(b.dny, 1, 365, 30), body_bodu: cel(b.body_bodu, 0, 1000, 0) } };
  return { ok: true, cfg: zaklad };
}

// ---- Časování ----------------------------------------------------------------------

/** Kolik pražských kalendářních dní uplynulo od okamžiku (záporné = v budoucnu). Neplatný čas dává null. */
export function rozdilDniPraha(od: Date | string | null | undefined, now: Date): number | null {
  const d = casZDb(od);
  if (!d) return null;
  const a = pragueDayOf(d), b = pragueDayOf(now);
  const ms = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((ms(b) - ms(a)) / 86400000);
}

/**
 * Je krok uvítací série na řadě? Člen se přidal po zapnutí série, od přidání uplynul aspoň `dny` dní
 * (pražských) a ne víc než `dny + OKNO_UVITANI_DNI`. Krok s nulou jde hned, ostatní denní cron.
 */
export function jeKrokUvitaniNaRade(joinedAt: Date | string | null | undefined, dny: number, now: Date, zapnutoOd: Date | string | null | undefined): boolean {
  const d = rozdilDniPraha(joinedAt, now);
  if (d == null) return false;
  const od = casZDb(zapnutoOd);
  const prisel = casZDb(joinedAt);
  if (od && prisel && prisel.getTime() < od.getTime()) return false;
  return d >= dny && d <= dny + OKNO_UVITANI_DNI;
}

/** Přišla návštěva (nebo dokončená karta) po zapnutí pravidla? Starší události se nepřipomínají. */
export function jePoZapnuti(udalost: Date | string | null | undefined, zapnutoOd: Date | string | null | undefined): boolean {
  const u = casZDb(udalost);
  if (!u) return false;
  const od = casZDb(zapnutoOd);
  return !od || u.getTime() >= od.getTime();
}

// ---- Klíče deníku ------------------------------------------------------------------

export const refUvitani = (krok: number) => `krok:${krok}`;
export const refPrvniNavsteva = () => 'prvni';
export const refKarta = (kampanId: number, poradi: number) => `karta:${kampanId}:${poradi}`;
export const refNarozeniny = (rok: string | number) => `bday:${rok}`;

/** Má dnešní den narozeniny? `birthday` je RRRR-MM-DD; 29. 2. se v nepřestupném roce slaví 28. 2. */
export function maDnesNarozeniny(birthday: string | null | undefined, dnes: string): boolean {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(birthday ?? ''));
  if (!m) return false;
  const md = `${m[1]}-${m[2]}`;
  if (dnes.slice(5) === md) return true;
  const rok = Number(dnes.slice(0, 4));
  const prestupny = (rok % 4 === 0 && rok % 100 !== 0) || rok % 400 === 0;
  return md === '02-29' && !prestupny && dnes.slice(5) === '02-28';
}

// ---- Popisky do rozhraní --------------------------------------------------------------

export const STAVY_LOGU: Record<string, string> = {
  odeslano: 'Odesláno',
  bez_souhlasu: 'Bez souhlasu se zprávami',
  kupon_pripsan: 'Kupon připsán, zpráva nešla (bez souhlasu)',
  chyba: 'Nepodařilo se',
};

/** Věta o nastavení pravidla do hlavičky karty. */
export function shrnutiPravidla(druh: DruhAutomatizace, cfg: any, zapnuto: boolean): string {
  if (!zapnuto) return 'Vypnuto';
  if (druh === 'uvitani') {
    const k = (cfg?.kroky ?? []) as KrokUvitani[];
    return k.length ? `Zapnuto: ${czCount(k.length, { one: 'zpráva', few: 'zprávy', many: 'zpráv' })}` : 'Zapnuto';
  }
  if (druh === 'chybis_nam') return `Zapnuto: po ${czCount(Number(cfg?.dny) || 30, { one: 'dni', few: 'dnech', many: 'dnech' })} bez návštěvy`;
  return 'Zapnuto';
}

/** Další den, kdy cron ještě krok pošle (pro vysvětlení v náhledu). */
export function posledniDenKroku(joinedDay: string, dny: number): string {
  return dayPlus(joinedDay, dny + OKNO_UVITANI_DNI);
}
