// Sdílené mezi serverem a prohlížečem: kdy se dá rezervovat a jak se čte
// otevírací doba. Bez importů ze serveru, ať to jde i do klientské komponenty.

export interface OpeningDay { open?: string | null; close?: string | null; closed?: boolean }
export type OpeningHours = Record<string, OpeningDay>;

/** Klíč dne v teams.opening_hours: pondělí = "0". */
export function dayKey(dateStr: string): string {
  return String((new Date(dateStr + 'T12:00:00Z').getUTCDay() + 6) % 7);
}

export const DAY_NAMES = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'];

/**
 * „8:00–20:00", „zavřeno" nebo „neuvedeno". `t` je překladová funkce (česká věta
 * → text v jazyce hosta); bez ní česky, jako dřív.
 */
export function hoursLabel(hours: OpeningHours | null | undefined, dateStr: string, t: (cs: string) => string = cs => cs): string {
  const d = hours?.[dayKey(dateStr)];
  if (!d) return t('neuvedeno');
  if (d.closed || !d.open || !d.close) return t('zavřeno');
  return `${d.open}–${d.close}`;
}

const naMinuty = (t: string) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const naHM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const JE_HM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Kolik minut dopředu musí host rezervovat na dnešek. Pevně — podnik si to
 * zatím nenastavuje (OpenTable i Resy nabízejí pro dnešek jen časy s předstihem).
 */
export const PREDSTIH_REZERVACE_MIN = 30;

/**
 * Nejdřívější čas, na který jde dnes rezervovat: teď + předstih ve tvaru „HH:MM".
 * „Teď" dodává volající (server pragueHM(), prohlížeč své hodiny) — tenhle soubor
 * jde i do klientské komponenty, takže na server nesahá. Přes půlnoc „24:00":
 * dnes už nic.
 */
export function nejdriveDnes(tedHM: string, predstih: number = PREDSTIH_REZERVACE_MIN): string {
  if (!JE_HM.test(String(tedHM).slice(0, 5))) return '00:00';
  const m = naMinuty(String(tedHM).slice(0, 5)) + Math.max(0, Math.round(Number(predstih) || 0));
  return m >= 24 * 60 ? '24:00' : naHM(m);
}

/**
 * Časy, kdy se dá v daný den rezervovat: od otevření po zavření minus hodina, po krocích.
 * S `nejdrive` („HH:MM") jen časy od něj včetně — pro dnešek, ať host nerezervuje
 * na čas, který už minul (volající dá nejdriveDnes(teď)).
 */
export function slotsFor(hours: OpeningHours | null | undefined, dateStr: string, slotMinutes: number, nejdrive?: string): string[] {
  const day = hours?.[dayKey(dateStr)];
  if (!day || day.closed || !day.open || !day.close) return [];
  const start = naMinuty(day.open), end = naMinuty(day.close) - 60;
  const out: string[] = [];
  const step = Math.max(15, slotMinutes || 30);
  for (let t = Math.ceil(start / step) * step; t <= end; t += step) out.push(naHM(t));
  // „HH:MM" s nulami vpředu se dá porovnat jako text; „24:00" vyřadí všechno.
  return nejdrive && /^\d{2}:\d{2}$/.test(nejdrive) ? out.filter(s => s >= nejdrive) : out;
}

/**
 * Potvrdí se rezervace hosta sama? Podnik zapne `auto_confirm` a volitelně hranici
 * `auto_confirm_max_party`: skupiny do té velikosti se potvrdí hned, větší dál čekají
 * na vedení. 0 (nebo nic) = bez hranice, potvrdí se všechny.
 */
export function autoPotvrdit(profil: { auto_confirm?: unknown; auto_confirm_max_party?: unknown } | null | undefined, osob: number): boolean {
  if (profil?.auto_confirm !== true) return false;
  const max = Math.max(0, Math.round(Number(profil.auto_confirm_max_party) || 0));
  return max === 0 || Math.max(1, Number(osob) || 1) <= max;
}

/**
 * Oznámení hostovi o rozhodnutí o rezervaci. Jedno místo pro ruční potvrzení (PATCH),
 * automatické potvrzení (POST hosta) i ruční zápis s napojeným členem — ať se texty nerozjedou.
 */
export function zpravaHostoviORezervaci(stav: 'confirmed' | 'declined', datum: string, cas: string): { title: string; body: string; link: string; type: 'success' | 'info' } {
  const kdy = `${String(datum).split('-').reverse().join('. ')} ${String(cas).slice(0, 5)}`;
  return stav === 'confirmed'
    ? { title: 'Rezervace potvrzena', body: `Těšíme se ${kdy}.`, link: '/client/me', type: 'success' }
    : { title: 'Rezervaci se nepodařilo přijmout', body: `Na ${kdy} bohužel nemáme místo.`, link: '/client/me', type: 'info' };
}

// ---- Ruční zápis rezervace (telefon, u dveří) -------------------------------
//
// Obsluha zapíše rezervaci za hosta, který zavolal nebo stojí u dveří. Server
// i okno „Nová rezervace" kontrolují stejnou funkcí, ať okno neodmítne, co server
// vezme (a naopak). Čas smí být mimo nabízené sloty — obsluha ví víc — ale musí
// padnout do otevírací doby dne.

export const RUCNI_MAX_JMENO = 80;
export const RUCNI_MAX_TELEFON = 30;
export const RUCNI_MAX_POZNAMKA = 300;

export type PoleRucni = 'name' | 'phone' | 'date' | 'time' | 'party' | 'tableId' | 'note' | 'customerId';

export interface RucniRezervace {
  jmeno: string;
  /** Jak ho obsluha napsala (mezery srovnané), nebo null. */
  telefon: string | null;
  datum: string;
  cas: string;
  osob: number;
  stulId: number | null;
  poznamka: string | null;
  /** Napojení na člena podniku (příslušnost ověří server dotazem). */
  hostId: number | null;
}

/** Je „HH:MM" v otevírací době dne? Zavírání po půlnoci (18:00–02:00) se počítá přes půlnoc. */
export function vOteviraciDobe(hours: OpeningHours | null | undefined, dateStr: string, cas: string): boolean {
  const day = hours?.[dayKey(dateStr)];
  if (!day || day.closed || !day.open || !day.close || !JE_HM.test(cas)) return false;
  const t = naMinuty(cas), od = naMinuty(day.open), doo = naMinuty(day.close);
  return doo > od ? t >= od && t < doo : t >= od || t < doo;
}

const kladneCele = (v: unknown): number | null | 'chyba' => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 'chyba';
};

/**
 * Kontrola ručně zapisované rezervace. `nejpozdeji` = dnes + dní dopředu podniku
 * (počítá volající přes pragueTime), `maxOsob` = Nejvíc osob z nastavení.
 */
export function validujRucniRezervaci(
  v: Record<string, unknown> | null | undefined,
  k: { dnes: string; nejpozdeji: string; maxOsob: number; hodiny: OpeningHours | null | undefined },
): { ok: true; data: RucniRezervace } | { ok: false; pole: PoleRucni; chyba: string } {
  const b = v ?? {};
  const spatne = (pole: PoleRucni, chyba: string) => ({ ok: false as const, pole, chyba });
  const jmeno = String(b.name ?? '').replace(/\s+/g, ' ').trim();
  if (!jmeno) return spatne('name', 'Napiš jméno hosta.');
  if (jmeno.length > RUCNI_MAX_JMENO) return spatne('name', `Jméno je moc dlouhé (nejvýš ${RUCNI_MAX_JMENO} znaků).`);
  const tel = String(b.phone ?? '').replace(/\s+/g, ' ').trim();
  if (tel && (tel.length > RUCNI_MAX_TELEFON || !/^\+?[\d ]+$/.test(tel) || (tel.match(/\d/g) ?? []).length < 3)) {
    return spatne('phone', 'Telefon může mít jen číslice, mezery a + na začátku.');
  }
  const datum = String(b.date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || datum < k.dnes || datum > k.nejpozdeji) return spatne('date', 'Vyber den od dneška do posledního dne, na který podnik rezervuje.');
  const cas = String(b.time ?? '').slice(0, 5);
  if (!JE_HM.test(cas)) return spatne('time', 'Vyber čas.');
  const den = k.hodiny?.[dayKey(datum)];
  if (!den || den.closed || !den.open || !den.close) return spatne('time', 'V tento den má podnik zavřeno.');
  if (!vOteviraciDobe(k.hodiny, datum, cas)) return spatne('time', `Čas je mimo otevírací dobu (${den.open}–${den.close}).`);
  const maxOsob = Math.max(1, Math.round(Number(k.maxOsob) || 8));
  const osob = Number(b.party);
  if (!Number.isInteger(osob) || osob < 1 || osob > maxOsob) return spatne('party', `Počet osob od 1 do ${maxOsob}.`);
  const stulId = kladneCele(b.tableId);
  if (stulId === 'chyba') return spatne('tableId', 'Vyber stůl ze seznamu.');
  const poznamka = String(b.note ?? '').trim();
  if (poznamka.length > RUCNI_MAX_POZNAMKA) return spatne('note', `Poznámka je moc dlouhá (nejvýš ${RUCNI_MAX_POZNAMKA} znaků).`);
  const hostId = kladneCele(b.customerId);
  if (hostId === 'chyba') return spatne('customerId', 'Člen se nenašel.');
  return { ok: true, data: { jmeno, telefon: tel || null, datum, cas, osob, stulId, poznamka: poznamka || null, hostId } };
}

/** „pá 12. 9." pro seznamy, „pátek 12. září" pro nadpisy. */
export function czDay(dateStr: string, long = false): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('cs-CZ', long
    ? { weekday: 'long', day: 'numeric', month: 'long' }
    : { weekday: 'short', day: 'numeric', month: 'numeric' });
}

export const RES_STATUS: Record<string, { label: string; tone: 'wait' | 'ok' | 'off' | 'done' }> = {
  requested: { label: 'Čeká na potvrzení', tone: 'wait' },
  confirmed: { label: 'Potvrzeno', tone: 'ok' },
  seated:    { label: 'Usazeni', tone: 'ok' },
  done:      { label: 'Proběhlo', tone: 'done' },
  declined:  { label: 'Nepřijato', tone: 'off' },
  cancelled: { label: 'Zrušeno', tone: 'off' },
};


// ---- Úrovně hosta podle návštěv -------------------------------------------
//
// Jako v Kartičce: věrnost je vidět a něco přináší. Prahy i sleva si drží
// každý podnik vlastní; výchozí hodnoty odpovídají malému podniku, kde je
// pětadvacet návštěv opravdový štamgast.

export type TierBy = 'visits' | 'spend';

export interface TierRules {
  silverAt?: number; goldAt?: number; platinumAt?: number;
  memberDiscount?: number; silverDiscount?: number; goldDiscount?: number; platinumDiscount?: number;
  /** Podle čeho se úroveň počítá: 'visits' (výchozí, jako dřív) nebo 'spend' (kumulovaná útrata). */
  tierBy?: TierBy | string | null;
  /** Prahy v útratě (celé jednotky měny podniku); platí jen v režimu 'spend'. */
  silverSpend?: number; goldSpend?: number; platinumSpend?: number;
  /** Po kolika měsících bez návštěvy se úroveň snižuje o stupeň (0 nebo chybí = nikdy). */
  inactiveMonths?: number;
}

export type TierId = 'bronze' | 'silver' | 'gold' | 'platinum';

/** `unit` říká, v čem je `nextAt`: návštěvy, nebo měna podniku. */
export interface Tier { id: TierId; label: string; discount: number; nextAt: number | null; nextLabel: string | null; unit: TierBy; /** Úroveň je snížená o stupeň, protože host dlouho nepřišel. */ reduced?: boolean }

/** Režim úrovní podniku; cokoli jiného než 'spend' je 'visits'. */
export function tierBy(r?: TierRules | null): TierBy {
  return r?.tierBy === 'spend' ? 'spend' : 'visits';
}

/** Výchozí prahy útraty, když je podnik nemá nastavené (0 u stříbra a zlata = výchozí; u platiny = vypnuto). */
export const VYCHOZI_PRAHY_UTRATY = { silver: 5000, gold: 15000 };

/**
 * Prahy podle režimu, už srovnané: stříbro aspoň 1, zlato nad stříbrem, platina
 * nad zlatem (0 = platina vypnutá). Jedno místo pro tierFor i pro SQL publika zpráv.
 */
export function tierThresholds(r?: TierRules | null): { by: TierBy; silver: number; gold: number; platinum: number } {
  const by = tierBy(r);
  const spend = by === 'spend';
  const silver = Math.max(1, Number(spend ? r?.silverSpend : r?.silverAt) || (spend ? VYCHOZI_PRAHY_UTRATY.silver : 10));
  const gold = Math.max(silver + 1, Number(spend ? r?.goldSpend : r?.goldAt) || (spend ? VYCHOZI_PRAHY_UTRATY.gold : 25));
  const rawPlat = Number(spend ? r?.platinumSpend : r?.platinumAt);
  const platinum = rawPlat > 0 ? Math.max(gold + 1, rawPlat) : 0;
  return { by, silver, gold, platinum };
}

/**
 * Úroveň hosta i s tím, co z ní plyne — sleva a kolik chybí do další.
 * `hodnota` je počet návštěv, nebo kumulovaná útrata — podle r.tierBy (bez r a
 * s 'visits' je to dnešní chování). Platina běží jen tam, kde ji podnik zapnul.
 */
export function tierFor(hodnota: number, r?: TierRules | null): Tier {
  const v = Math.max(0, Number(hodnota) || 0);
  const { by, silver: silverAt, gold: goldAt, platinum: platinumAt } = tierThresholds(r);
  const base = Math.max(0, Math.min(90, Number(r?.memberDiscount) || 0));
  const sd = Math.max(base, Math.min(90, Number(r?.silverDiscount) || 0));
  const gd = Math.max(sd, Math.min(90, Number(r?.goldDiscount) || 0));
  const pd = Math.max(gd, Math.min(90, Number(r?.platinumDiscount) || 0));
  if (platinumAt > 0 && v >= platinumAt) return { id: 'platinum', label: 'Platinový host', discount: pd, nextAt: null, nextLabel: null, unit: by };
  if (v >= goldAt) return { id: 'gold', label: 'Zlatý host', discount: gd, nextAt: platinumAt > 0 ? platinumAt : null, nextLabel: platinumAt > 0 ? 'Platinový host' : null, unit: by };
  if (v >= silverAt) return { id: 'silver', label: 'Stříbrný host', discount: sd, nextAt: goldAt, nextLabel: 'Zlatý host', unit: by };
  return { id: 'bronze', label: 'Člen', discount: base, nextAt: silverAt, nextLabel: 'Stříbrný host', unit: by };
}

/** Okamžik poslední návštěvy z Date, ISO řetězce, nebo textu z databáze („2026-08-29 22:22:01", bez zóny = UTC). */
function casNavstevy(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  let s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) s = s.replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += 'Z';
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/**
 * Je host po `mesice` měsících bez návštěvy? Bez zapnuté neaktivity (0) a bez zaznamenané
 * návštěvy (nový člen, import) nikdy — úroveň se mu nesnižuje za něco, co nemáme zapsané.
 */
export function jeNeaktivni(posledniNavsteva: unknown, mesice: number, ted: number = Date.now()): boolean {
  const m = Math.floor(Number(mesice) || 0);
  if (m <= 0) return false;
  const t = casNavstevy(posledniNavsteva);
  if (t == null) return false;
  const hranice = new Date(ted);
  hranice.setUTCMonth(hranice.getUTCMonth() - m);
  return t < hranice.getTime();
}

/** O stupeň nižší úroveň (platina → zlato → stříbro → člen); člen zůstává. Návštěvy ani útrata se nemění. */
export function snizenaUroven(t: Tier, r?: TierRules | null): Tier {
  const th = tierThresholds(r);
  const nizsi = t.id === 'platinum' ? th.gold : t.id === 'gold' ? th.silver : t.id === 'silver' ? 0 : null;
  if (nizsi == null) return t;
  return { ...tierFor(nizsi, r), reduced: true };
}

/**
 * Úroveň člena s režimem podniku: z návštěv, nebo z útraty. Tohle volej všude, kde máš člena.
 * Když podnik snižuje úroveň po neaktivitě (`inactiveMonths`) a člen má `lastVisitAt`,
 * vyjde o stupeň nižší — s další návštěvou se vrátí sama.
 */
export function tierForMember(m: { visits?: number | string | null; spend?: number | string | null; lastVisitAt?: unknown }, r?: TierRules | null): Tier {
  const t = tierFor(tierBy(r) === 'spend' ? Number(m?.spend) || 0 : Number(m?.visits) || 0, r);
  return jeNeaktivni(m?.lastVisitAt, Number(r?.inactiveMonths) || 0) ? snizenaUroven(t, r) : t;
}

/** Řádek client_profiles (snake_case z databáze) → pravidla úrovní. */
export function tierRulesFromProfile(p: any): TierRules {
  return {
    silverAt: Number(p?.silver_at), goldAt: Number(p?.gold_at), platinumAt: Number(p?.platinum_at) || 0,
    memberDiscount: Number(p?.member_discount), silverDiscount: Number(p?.silver_discount), goldDiscount: Number(p?.gold_discount),
    platinumDiscount: Number(p?.platinum_discount) || 0,
    tierBy: p?.tier_by === 'spend' ? 'spend' : 'visits',
    silverSpend: Number(p?.silver_spend) || 0, goldSpend: Number(p?.gold_spend) || 0, platinumSpend: Number(p?.platinum_spend) || 0,
    inactiveMonths: Number(p?.tier_inactive_months) || 0,
  };
}

/** Zpětně kompatibilní zkratka pro místa, kde stačí jméno úrovně. */
export function levelFor(visits: number): { id: TierId; label: string } {
  const t = tierFor(visits);
  return { id: t.id, label: t.label };
}

/** Horní mez jedné útraty — překlep o tři nuly nesmí přetéct INTEGER ani rozhodit úrovně. */
export const MAX_UTRATA = 10_000_000;

/** Částka na celé nezáporné jednotky v rozumném rozsahu. */
export function celaUtrata(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_UTRATA, n)) : 0;
}
