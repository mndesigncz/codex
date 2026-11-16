// Peníze v trestech a výplatě — čistá logika bez React a bez databáze.
//
// Proč to je: vedení chce u prohřešku sáhnout i na peníze, ne jen na body, a zákoník práce
// peněžní pokuty zaměstnancům zakazuje (§ 346b odst. 4; NS 21 Cdo 3471/2024). Legální cesty,
// které aplikace staví (rozhodnutí v lib/tresty.ts platí dál):
//
//  A) KRÁCENÍ NENÁROKOVÉ SLOŽKY. U člena jde nastavit, jaká část výplaty je nenároková prémie
//     (team_members.nenarokova_*): % ze mzdy za období, Kč za hodinu, nebo Kč za měsíc; buď je
//     součástí dnešní sazby (vSazbe — výplata se nezmění, jen se rozdělí na nárokovou a nenárokovou
//     část), nebo se platí navíc. Strop krácení = nenároková složka za měsíc + nenárokové prémie
//     (wage_adjustments source 'premie' a přijatý záskok 'zaskok') − co už tresty ten měsíc
//     krátily. Ve výplatě je složka vlastní řádek a krácení nad skutečnou složku se nikdy
//     nestrhne (ucinneKraceni) — nároková mzda zůstane celá.
//  B) NÁHRADA ŠKODY (§ 250 a násl. ZP): záznam škody (částka, druh, zavinění, dohoda o odpovědnosti
//     u schodku). Zaviněná škoda z nedbalosti má strop 4,5násobek průměrného měsíčního výdělku
//     (§ 257 odst. 2); průměr se bere z výplat v aplikaci za poslední 3 měsíce, a když data chybí,
//     strop se jen připomene, nevynucuje. Strhnout ze mzdy jde jen na základě DOHODY O SRÁŽKÁCH
//     ZE MZDY (§ 146 písm. b) — zaměstnanec ji v aplikaci potvrdí, nebo nesouhlasí.
//  C) PŘÍMÁ SRÁŽKA („prostě srazit"): u pracovněprávních vztahů (HPP, DPP, DPČ a neznámý typ)
//     se uplatní AŽ po souhlasu zaměstnance; do té doby „čeká na souhlas" a ve výplatě se nestrhne.
//     U OSVČ (mimo zákoník práce) se uplatní hned.
//
// Záskok: stržené peníze (krácení + uplatněné srážky) jdou tomu, kdo to napravil (rovným dílem
// nebo vlastními částkami), celé osádce směny, nebo zůstanou podniku. Příjemce dostane kladnou
// úpravu mzdy (wage_adjustments source 'zaskok'); peníze ze srážky čekající na souhlas přejdou až
// se srážkou (rozpisPrevoduNaKusy).
//
// Uzavřené období (payroll_locks) se nemění: srovnejSZamky nechá řádky v zamčeném období, jak
// jsou, a rozdíl pošle opravným řádkem do prvního otevřeného dne.
//
// Testy: scripts/testy/k96-tresty-penize.ts. Databáze: lib/trestyPenizeDb.ts. Kontrakt pro UI:
// docs/TRESTY-PENIZE.md.

import type { UpravaMzdy, ZamekObdobi } from './dochazkaPrehled.ts';

// ---------------------------------------------------------------------------
// Konstanty
// ---------------------------------------------------------------------------

/** Zdroje úprav mzdy (wage_adjustments.source), které peníze trestů zakládají. */
export const ZDROJ_KRACENI = 'trest';
export const ZDROJ_NAHRADA = 'nahrada';
export const ZDROJ_SRAZKA = 'srazka';
export const ZDROJ_ZASKOK = 'zaskok';
/** Nenároková prémie (stejná hodnota jako lib/tresty ZDROJ_NENAROKOVE_PREMIE). */
export const ZDROJ_PREMIE = 'premie';

/** Nejvyšší srážka / náhrada jedním záznamem (měna podniku). */
export const MAX_CASTKA_SRAZKY = 200_000;
/** Nejvyšší škoda jedním záznamem. */
export const MAX_SKODA = 5_000_000;
/** Nejvýš tolik splátek (výplat). */
export const MAX_SPLATEK = 12;
/** Nejvýš tolik lidí v jedné dávce (hromadný trest / odměna). */
export const MAX_LIDI_DAVKY = 50;
/** Nejvyšší odměna jednomu člověku v dávce. */
export const MAX_ODMENA = 100_000;
/** Strop náhrady škody z nedbalosti: násobek průměrného měsíčního výdělku (§ 257 odst. 2 ZP). */
export const NASOBEK_STROPU_NAHRADY = 4.5;
/** Průměrný výdělek se bere z tolika posledních celých měsíců. */
export const MESICU_PRUMERU = 3;
/** Nenároková složka: nejvýš 100 %, 10 000 / h, 1 000 000 / měsíc. */
export const MAX_SLOZKA = { pct: 100, kc_hod: 10_000, kc_mesic: 1_000_000 } as const;

/** Souhlas se srážkou se ukládá do tabulky `consents` jako ostatní souhlasy (typ, verze, znění, čas). */
export const TYP_SOUHLASU_SRAZKY = 'srazka_mzdy';
export const KANAL_SOUHLASU_SRAZKY = 'tresty';
/** Verze znění dohody o srážce; s věcnou změnou textu (zneniDohodyOSrazce) zvednout. */
export const VERZE_DOHODY_O_SRAZCE = '2026-11-16';

/** Věty pro vedení (klíče k překladu v UI). */
export const VETA_SOUHLAS_ZP = 'U HPP, DPP i DPČ se srážka strhne až po souhlasu zaměstnance (dohoda o srážkách ze mzdy, § 146 písm. b) zákoníku práce).';
export const VETA_SOUHLAS_NEZNAMY = 'Typ smlouvy není vyplněný — bereme ho jako pracovní poměr, srážka počká na souhlas zaměstnance.';
export const VETA_OSVC = 'OSVČ není v pracovním poměru — srážka se uplatní hned.';
export const VETA_BEZ_PRUMERU = 'Výplaty za poslední 3 měsíce v aplikaci nejsou — strop 4,5násobku průměrného výdělku nejde spočítat. Částku zkontroluj sám.';
export const VETA_SCHODEK = 'Schodek a ztrátu svěřených věcí jde vymáhat jen s podepsanou dohodou o odpovědnosti — zaškrtni ji a doplň datum.';
export const VETA_UZAVRENO = 'Období je uzavřené — změna se promítne do dalšího otevřeného období.';
export const VETA_BEZ_PRAV_PENIZE = 'Peníze z výplaty smí měnit jen ten, kdo vidí mzdy.';

// ---------------------------------------------------------------------------
// Pomocníci
// ---------------------------------------------------------------------------

const JE_DEN = /^\d{4}-\d{2}-\d{2}$/;
const cele = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && Math.round(n) === n ? n : null;
};
/** Celé číslo v mezích; null = nezadáno; false = nesmysl. */
function celeVMezich(v: unknown, min: number, max: number): number | null | false {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || Math.round(n) !== n || n < min || n > max) return false;
  return n;
}

/** Posun dne o N dní (čistě na textu RRRR-MM-DD, UTC). */
export function plusDni(d: string, n: number): string {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
/** První den následujícího měsíce. */
export function dalsiMesic(mesic: string): string {
  const r = Number(mesic.slice(0, 4)), m = Number(mesic.slice(5, 7));
  return m === 12 ? `${r + 1}-01` : `${r}-${String(m + 1).padStart(2, '0')}`;
}
export function predchoziMesic(mesic: string): string {
  const r = Number(mesic.slice(0, 4)), m = Number(mesic.slice(5, 7));
  return m === 1 ? `${r - 1}-12` : `${r}-${String(m - 1).padStart(2, '0')}`;
}
export function dniVMesici(mesic: string): number {
  return new Date(Date.UTC(Number(mesic.slice(0, 4)), Number(mesic.slice(5, 7)), 0)).getUTCDate();
}
export const posledniDenMesice = (mesic: string): string => `${mesic}-${String(dniVMesici(mesic)).padStart(2, '0')}`;

/**
 * Rozdělí celé číslo na `n` dílů co nejrovněji; zbytek dostanou první díly (500 / 3 = 167, 167, 166).
 * Součet sedí vždy. Záporná částka se dělí stejně (−500 / 3 = −167, −167, −166).
 */
export function rozpocitej(celkem: number, n: number): number[] {
  if (!(n > 0)) return [];
  const c = Math.round(celkem);
  const znamenko = c < 0 ? -1 : 1;
  const abs = Math.abs(c);
  const zaklad = Math.floor(abs / n);
  const zbytek = abs - zaklad * n;
  return Array.from({ length: n }, (_, i) => znamenko * (zaklad + (i < zbytek ? 1 : 0)));
}

// ---------------------------------------------------------------------------
// A) Nenároková složka výplaty
// ---------------------------------------------------------------------------

export type TypSlozky = 'pct' | 'kc_hod' | 'kc_mesic';
export const TYPY_SLOZKY: readonly TypSlozky[] = ['pct', 'kc_hod', 'kc_mesic'];
export const jeTypSlozky = (v: unknown): v is TypSlozky => typeof v === 'string' && (TYPY_SLOZKY as readonly string[]).includes(v);

/** Nastavení nenárokové složky člena. */
export interface NastaveniSlozky {
  typ: TypSlozky;
  /** % ze mzdy (0–100, na desetiny), Kč za hodinu, nebo Kč za měsíc. */
  hodnota: number;
  /**
   * true = složka je SOUČÁSTÍ dnešní sazby (výplata se nezmění, jen se rozdělí na nárokovou mzdu
   * a nenárokovou složku); false = platí se NAVÍC ke mzdě.
   */
  vSazbe: boolean;
}

/** Tělo PUT /api/payroll/slozka → nastavení (null = složku zrušit) nebo chyba. */
export function normalizujSlozku(raw: unknown): { ok: true; slozka: NastaveniSlozky | null } | { ok: false; chyba: string } {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (b.typ == null || b.typ === '' || b.typ === 'zadna') return { ok: true, slozka: null };
  if (!jeTypSlozky(b.typ)) return { ok: false, chyba: 'Neznámý typ nenárokové složky.' };
  const n = Number(b.hodnota);
  const max = MAX_SLOZKA[b.typ];
  if (!Number.isFinite(n) || n <= 0 || n > max) {
    return { ok: false, chyba: b.typ === 'pct' ? 'Procento musí být větší než 0 a nejvýš 100.' : 'Částka nenárokové složky musí být kladná.' };
  }
  const hodnota = b.typ === 'pct' ? Math.round(n * 10) / 10 : Math.round(n);
  if (hodnota <= 0) return { ok: false, chyba: 'Částka nenárokové složky musí být kladná.' };
  return { ok: true, slozka: { typ: b.typ, hodnota, vSazbe: b.vSazbe !== false } };
}

/** Řádek team_members → nastavení (null = složka není). */
export function slozkaZeSloupcu(typ: unknown, hodnota: unknown, vSazbe: unknown): NastaveniSlozky | null {
  const n = Number(hodnota);
  if (!jeTypSlozky(typ) || !Number.isFinite(n) || n <= 0) return null;
  return { typ, hodnota: n, vSazbe: vSazbe !== false };
}

/** Obranně z odpovědi API. */
export function vyberSlozku(raw: unknown): NastaveniSlozky | null {
  const o = (raw ?? null) as Record<string, unknown> | null;
  return o ? slozkaZeSloupcu(o.typ, o.hodnota, o.vSazbe) : null;
}

/** Popis do věty: „10 % ze mzdy", „30 Kč/h", „2 000 Kč/měsíc" (měna přes formátovač podniku). */
export function popisSlozky(n: NastaveniSlozky | null, kc: (n: number) => string): string {
  if (!n) return 'Bez nenárokové složky';
  const co = n.typ === 'pct' ? `${String(n.hodnota).replace('.', ',')} % ze mzdy` : n.typ === 'kc_hod' ? `${kc(n.hodnota)}/h` : `${kc(n.hodnota)}/měsíc`;
  return n.vSazbe ? `${co} (součást sazby)` : `${co} (navíc ke mzdě)`;
}

/**
 * Nenároková složka za období <od, do> z hrubé mzdy a odpracovaného času člověka v tom období.
 *  - pct: % z hrubé mzdy (bez sazby 0);
 *  - kc_hod: hodiny × částka;
 *  - kc_mesic: částka za každý zasažený měsíc poměrně podle dní období (celý měsíc = celá částka);
 *    bez odpracovaného času 0 (kdo nepracoval, nenárokovou složku nedostane).
 * Je-li složka součástí sazby (vSazbe), nikdy nepřesáhne hrubou mzdu (bez sazby je 0).
 */
export function slozkaZaObdobi(n: NastaveniSlozky | null, o: { mzda: number | null; ms: number; od: string; do: string }): number {
  if (!n || !(o.ms > 0)) return 0;
  const mzda = o.mzda == null ? null : Math.max(0, o.mzda);
  let s = 0;
  if (n.typ === 'pct') s = mzda == null ? 0 : (mzda * n.hodnota) / 100;
  else if (n.typ === 'kc_hod') s = (o.ms / 3_600_000) * n.hodnota;
  else {
    if (!JE_DEN.test(o.od) || !JE_DEN.test(o.do) || o.od > o.do) return 0;
    for (let m = o.od.slice(0, 7); m <= o.do.slice(0, 7); m = dalsiMesic(m)) {
      const zacatek = o.od > `${m}-01` ? o.od : `${m}-01`;
      const konec = o.do < posledniDenMesice(m) ? o.do : posledniDenMesice(m);
      const dni = Math.round((Date.parse(`${konec}T12:00:00Z`) - Date.parse(`${zacatek}T12:00:00Z`)) / 86_400_000) + 1;
      s += (n.hodnota * dni) / dniVMesici(m);
    }
  }
  s = Math.round(s);
  if (n.vSazbe) s = Math.min(s, mzda ?? 0);
  return Math.max(0, s);
}

/** Strop krácení za měsíc: nenároková složka + nenárokové prémie − už kráceno; nikdy záporně. */
export function stropKraceniMesice(o: { slozka: number; premie: number; uzKraceno: number }): number {
  return Math.max(0, Math.round((Number(o.slozka) || 0) + (Number(o.premie) || 0) - (Number(o.uzKraceno) || 0)));
}

/**
 * Kolik krácení se ve výplatě opravdu strhne: nejvýš nenároková složka + nenárokové prémie období.
 * Zbytek (nadStrop) se vrací — nároková mzda se krácením nikdy nezmenší (§ 346b ZP).
 */
export function ucinneKraceni(kraceni: number, slozka: number, premie: number): { uplatneno: number; nadStrop: number } {
  const k = Math.max(0, Math.round(kraceni));
  const z = Math.max(0, Math.round(slozka) + Math.round(premie));
  const uplatneno = Math.min(k, z);
  return { uplatneno, nadStrop: k - uplatneno };
}

// ---------------------------------------------------------------------------
// Smlouva a souhlas
// ---------------------------------------------------------------------------

/** Pracovněprávní vztah (zákoník práce platí): HPP, DPP, DPČ — a neznámý typ, to je bezpečnější. Jen výslovně OSVČ ne. */
export const jePracovnepravni = (smlouva: unknown): boolean => smlouva !== 'OSVC';
/** Potřebuje srážka souhlas zaměstnance (dohodu o srážkách ze mzdy)? */
export const potrebujeSouhlas = (smlouva: unknown): boolean => jePracovnepravni(smlouva);

/** Jedna věta pro vedení, proč se srážka strhne hned, nebo až po souhlasu. */
export function vetaSouhlasu(smlouva: unknown): string {
  if (smlouva === 'OSVC') return VETA_OSVC;
  if (smlouva === 'HPP' || smlouva === 'DPP' || smlouva === 'DPC') return VETA_SOUHLAS_ZP;
  return VETA_SOUHLAS_NEZNAMY;
}

// ---------------------------------------------------------------------------
// Srážky (B náhrada škody, C přímá srážka)
// ---------------------------------------------------------------------------

export type DruhSrazky = 'nahrada' | 'srazka';
export type StavSrazky = 'ceka' | 'uplatneno' | 'nesouhlas' | 'zruseno';
export const STAVY_SRAZKY: readonly StavSrazky[] = ['ceka', 'uplatneno', 'nesouhlas', 'zruseno'];
export const jeStavSrazky = (v: unknown): v is StavSrazky => typeof v === 'string' && (STAVY_SRAZKY as readonly string[]).includes(v);
export type DruhSkody = 'zavinena' | 'schodek' | 'ztrata';
export const DRUHY_SKODY: readonly DruhSkody[] = ['zavinena', 'schodek', 'ztrata'];
export type Zavineni = 'nedbalost' | 'umysl';

/** Chip stavu srážky (text je klíč k překladu). */
export function stavSrazky(s: StavSrazky): { tone: 'wait' | 'ok' | 'bad' | 'muted'; text: string } {
  if (s === 'ceka') return { tone: 'wait', text: 'Čeká na souhlas' };
  if (s === 'uplatneno') return { tone: 'ok', text: 'Uplatněno' };
  if (s === 'nesouhlas') return { tone: 'bad', text: 'Nesouhlasí' };
  return { tone: 'muted', text: 'Zrušeno' };
}

/** Výchozí stav nové srážky podle smlouvy. */
export const stavNoveSrazky = (smlouva: unknown): StavSrazky => (potrebujeSouhlas(smlouva) ? 'ceka' : 'uplatneno');

export interface VstupSrazky { castka: number; splatky: number }

/** Přímá srážka { castka, splatky? } → platná, nebo chyba; null = žádná srážka. */
export function validujSrazku(raw: unknown): { ok: true; srazka: VstupSrazky | null } | { ok: false; chyba: string } {
  if (raw == null || raw === false) return { ok: true, srazka: null };
  const b = raw as Record<string, unknown>;
  const castka = celeVMezich(b.castka, 0, MAX_CASTKA_SRAZKY);
  if (castka === false) return { ok: false, chyba: 'Srážka musí být celé kladné číslo (nejvýš 200 000).' };
  if (!castka) return { ok: true, srazka: null };
  const splatky = celeVMezich(b.splatky, 1, MAX_SPLATEK);
  if (splatky === false) return { ok: false, chyba: 'Splátek může být 1 až 12.' };
  return { ok: true, srazka: { castka, splatky: splatky ?? 1 } };
}

export interface VstupNahrady {
  /** Výše škody (celá). */
  skoda: number;
  /** Kolik se po člověku chce (≤ škoda, ≤ strop). */
  castka: number;
  druh: DruhSkody;
  zavineni: Zavineni;
  /** Podepsaná dohoda o odpovědnosti (schodek, ztráta svěřených věcí). */
  dohoda: boolean;
  dohodaDatum: string | null;
  splatky: number;
}

/** Náhrada škody → platná, nebo chyba; null = žádná. Strop 4,5× průměru hlídá až server (stropNahrady). */
export function validujNahradu(raw: unknown, dnes: string): { ok: true; nahrada: VstupNahrady | null } | { ok: false; chyba: string } {
  if (raw == null || raw === false) return { ok: true, nahrada: null };
  const b = raw as Record<string, unknown>;
  const skoda = celeVMezich(b.skoda, 0, MAX_SKODA);
  if (skoda === false) return { ok: false, chyba: 'Výše škody musí být celé kladné číslo.' };
  if (!skoda) return { ok: true, nahrada: null };
  const druh = (DRUHY_SKODY as readonly unknown[]).includes(b.druh) ? (b.druh as DruhSkody) : null;
  if (!druh) return { ok: false, chyba: 'Vyber druh škody.' };
  const castka = celeVMezich(b.castka ?? skoda, 1, MAX_CASTKA_SRAZKY);
  if (castka === false || castka === null) return { ok: false, chyba: 'Náhrada musí být celé kladné číslo (nejvýš 200 000).' };
  if (castka > skoda) return { ok: false, chyba: 'Náhrada nemůže být vyšší než škoda.' };
  const zavineni: Zavineni = b.zavineni === 'umysl' ? 'umysl' : 'nedbalost';
  const dohoda = b.dohoda === true;
  const dohodaDatum = typeof b.dohodaDatum === 'string' && JE_DEN.test(b.dohodaDatum) ? b.dohodaDatum : null;
  if (druh !== 'zavinena' && (!dohoda || !dohodaDatum)) return { ok: false, chyba: VETA_SCHODEK };
  if (dohodaDatum && dohodaDatum > dnes) return { ok: false, chyba: 'Datum dohody o odpovědnosti nemůže být v budoucnu.' };
  const splatky = celeVMezich(b.splatky, 1, MAX_SPLATEK);
  if (splatky === false) return { ok: false, chyba: 'Splátek může být 1 až 12.' };
  return { ok: true, nahrada: { skoda, castka, druh, zavineni, dohoda: druh === 'zavinena' ? dohoda : true, dohodaDatum, splatky: splatky ?? 1 } };
}

/** Poslední `MESICU_PRUMERU` celých měsíců před měsícem dne `dnes` (nejstarší první): pro průměrný výdělek. */
export function mesicePrumeru(dnes: string): string[] {
  const out: string[] = [];
  let m = dnes.slice(0, 7);
  for (let i = 0; i < MESICU_PRUMERU; i++) { m = predchoziMesic(m); out.unshift(m); }
  return out;
}

/**
 * Průměrný měsíční výdělek z výplat v aplikaci: průměr hrubé výplaty měsíců, ve kterých člověk
 * něco vydělal (měsíc bez výplaty se nepočítá, ať nový člověk nemá strop nula). Žádný = null.
 */
export function prumernyVydelek(mesice: readonly { mesic: string; hruba: number }[]): { prumer: number | null; mesicu: number } {
  const s = mesice.filter(m => Number(m.hruba) > 0);
  if (!s.length) return { prumer: null, mesicu: 0 };
  return { prumer: Math.round(s.reduce((a, m) => a + Number(m.hruba), 0) / s.length), mesicu: s.length };
}

export interface StropNahrady {
  /** Nejvyšší náhrada, kterou jde po člověku chtít. */
  strop: number;
  /** Je strop závazný (server odmítne víc)? Bez průměru výdělku jen varování. */
  tvrdy: boolean;
  varovani: string | null;
  /** 4,5× průměr (nebo null, když se neuplatní / chybí data). */
  stropPrumeru: number | null;
}

/**
 * Strop náhrady: u zaviněné škody z nedbalosti min(škoda, 4,5× průměrný měsíční výdělek)
 * (§ 257 odst. 2 ZP). Úmysl, schodek (§ 252) a ztráta svěřených věcí (§ 255) = celá škoda.
 * Bez průměru (žádné výplaty v aplikaci) strop nevynucovat, jen varovat.
 */
export function stropNahrady(o: { druh: DruhSkody; zavineni: Zavineni; skoda: number; prumer: number | null }): StropNahrady {
  const skoda = Math.max(0, Math.round(o.skoda));
  if (o.druh !== 'zavinena' || o.zavineni === 'umysl') return { strop: skoda, tvrdy: true, varovani: null, stropPrumeru: null };
  if (o.prumer == null || !(o.prumer > 0)) return { strop: skoda, tvrdy: false, varovani: VETA_BEZ_PRUMERU, stropPrumeru: null };
  const stropPrumeru = Math.floor(NASOBEK_STROPU_NAHRADY * o.prumer);
  return { strop: Math.min(skoda, stropPrumeru), tvrdy: true, varovani: null, stropPrumeru };
}

/** Rozloží částku do `n` splátek (zbytek na první): 1000 / 3 = 334, 333, 333. */
export function rozlozSplatky(castka: number, n: number): number[] {
  return rozpocitej(Math.max(0, Math.round(castka)), Math.max(1, Math.min(MAX_SPLATEK, Math.round(n) || 1)));
}

/**
 * Rozvrh splátek: první k `odDne`, další vždy k 1. dni následujících měsíců. Uzavřená období
 * neřeší (to dělá srovnejSZamky) — rozvrh je stabilní, ať přepočet po zamčení měsíce nic neposune.
 */
export function rozvrhSplatek(castka: number, n: number, odDne: string): { den: string; castka: number }[] {
  const dily = rozlozSplatky(castka, n);
  let mesic = odDne.slice(0, 7);
  return dily.map((c, i) => {
    const den = i === 0 ? odDne : `${(mesic = dalsiMesic(mesic))}-01`;
    return { den, castka: c };
  }).filter(x => x.castka > 0);
}

/** Je den v uzavřeném období? */
export const zamceno = (zamky: readonly ZamekObdobi[], den: string): ZamekObdobi | null => zamky.find(z => z.od <= den && z.do >= den) ?? null;

/** První den od `den` (včetně), který není v uzavřeném období. */
export function prvniOtevrenyDen(den: string, zamky: readonly ZamekObdobi[]): string {
  let d = den;
  for (let i = 0; i < 100; i++) {
    const z = zamceno(zamky, d);
    if (!z) return d;
    d = plusDni(z.do, 1);
  }
  return d;
}

/**
 * Odkdy se uplatní srážka: nejdřív den prohřešku, po souhlasu nejdřív den souhlasu (dohoda
 * o srážkách platí pro výplaty po ní), a ne v uzavřeném období.
 */
export function odKdySrazka(o: { denTrestu: string; denSouhlasu: string | null; zamky: readonly ZamekObdobi[] }): string {
  const zaklad = o.denSouhlasu && o.denSouhlasu > o.denTrestu ? o.denSouhlasu : o.denTrestu;
  return prvniOtevrenyDen(zaklad, o.zamky);
}

/** Znění dohody o srážce ze mzdy, se kterým zaměstnanec souhlasí (ukládá se do souhlasu). */
export function zneniDohodyOSrazce(o: { castka: number; splatky: number; duvod: string; podnik: string; odMesice: string; druh: DruhSrazky }, kc: (n: number) => string): string {
  const podnik = o.podnik.trim().slice(0, 80) || 'zaměstnavatel';
  const mesic = `${o.odMesice.slice(5, 7)}/${o.odMesice.slice(0, 4)}`;
  const co = o.druh === 'nahrada' ? 'jako náhradu škody' : 'ze mzdy';
  const rozlozeni = o.splatky > 1 ? `, rozloženou do ${o.splatky} výplat od výplaty za ${mesic}` : ` z výplaty za ${mesic}`;
  const duvod = o.duvod.trim().replace(/\s+/g, ' ').slice(0, 160);
  return `Souhlasím se srážkou ${kc(o.castka)} ${co}${rozlozeni} (důvod: ${duvod}). Jde o dohodu o srážkách ze mzdy podle § 146 písm. b) zákoníku práce s podnikem ${podnik}.`;
}

// ---------------------------------------------------------------------------
// Záskok — komu přejde stržená částka
// ---------------------------------------------------------------------------

export type KomuZaskok = 'podnik' | 'lide' | 'smena';
export type ZpusobZaskoku = 'rovne' | 'castky';

export interface VstupZaskoku {
  komu: KomuZaskok;
  zpusob: ZpusobZaskoku;
  /** Kdo to napravil (komu 'lide'); u 'castky' s vlastní částkou. U 'smena' doplní server osádku. */
  lide: { userId: number; castka: number | null }[];
}

/** Výchozí volba: vybral-li vedoucí, kdo to napravil, jemu; jinak podniku. */
export const vychoziKomu = (vybranoKdoNapravil: boolean): KomuZaskok => (vybranoKdoNapravil ? 'lide' : 'podnik');

export function validujZaskok(raw: unknown): { ok: true; zaskok: VstupZaskoku } | { ok: false; chyba: string } {
  if (raw == null) return { ok: true, zaskok: { komu: 'podnik', zpusob: 'rovne', lide: [] } };
  const b = raw as Record<string, unknown>;
  const k = b.komu ?? 'podnik';
  if (k !== 'podnik' && k !== 'lide' && k !== 'smena') return { ok: false, chyba: 'Nevím, komu má stržená částka přejít.' };
  const komu: KomuZaskok = k;
  const zpusob: ZpusobZaskoku = b.zpusob === 'castky' ? 'castky' : 'rovne';
  const lide: { userId: number; castka: number | null }[] = [];
  const videno = new Set<number>();
  for (const x of Array.isArray(b.lide) ? b.lide as Record<string, unknown>[] : []) {
    const id = cele(typeof x === 'object' && x ? x.userId : x);
    if (!id || id <= 0 || videno.has(id)) continue;
    videno.add(id);
    const castka = typeof x === 'object' && x ? celeVMezich(x.castka, 0, MAX_CASTKA_SRAZKY) : null;
    if (castka === false) return { ok: false, chyba: 'Částka pro kolegu musí být celé kladné číslo.' };
    lide.push({ userId: id, castka });
  }
  if (komu === 'lide' && !lide.length) return { ok: false, chyba: 'Vyber, kdo to napravil.' };
  if (lide.length > MAX_LIDI_DAVKY) return { ok: false, chyba: 'Moc lidí najednou (nejvýš 50).' };
  return { ok: true, zaskok: { komu, zpusob: komu === 'smena' ? 'rovne' : zpusob, lide: komu === 'podnik' ? [] : lide } };
}

/**
 * Rozdělí stržený základ mezi příjemce: rovným dílem, nebo vlastními částkami (součet ≤ základ,
 * zbytek zůstane podniku). Potrestaný sám sobě nic nepřevádí — vyřadí se.
 */
export function rozdelZaskok(o: { zaklad: number; zpusob: ZpusobZaskoku; prijemci: readonly { userId: number; castka?: number | null }[]; krome?: readonly number[] }):
  { ok: true; podily: { userId: number; castka: number }[]; podniku: number } | { ok: false; chyba: string } {
  const zaklad = Math.max(0, Math.round(o.zaklad));
  const krome = new Set(o.krome ?? []);
  const lide = o.prijemci.filter((p, i, a) => !krome.has(p.userId) && a.findIndex(x => x.userId === p.userId) === i);
  if (!lide.length || !zaklad) return { ok: true, podily: [], podniku: zaklad };
  if (o.zpusob === 'castky') {
    const podily = lide.map(p => ({ userId: p.userId, castka: Math.max(0, Math.round(Number(p.castka) || 0)) })).filter(p => p.castka > 0);
    const suma = podily.reduce((a, p) => a + p.castka, 0);
    if (!podily.length) return { ok: false, chyba: 'Zadej částku aspoň jednomu kolegovi.' };
    if (suma > zaklad) return { ok: false, chyba: 'Kolegům nejde převést víc, než se strhlo.' };
    return { ok: true, podily, podniku: zaklad - suma };
  }
  const dily = rozpocitej(zaklad, lide.length);
  return { ok: true, podily: lide.map((p, i) => ({ userId: p.userId, castka: dily[i] })).filter(p => p.castka > 0), podniku: 0 };
}

/**
 * Rozepíše převody na skutečně stržené kusy (krácení ke dni trestu, splátky srážek po uplatnění).
 * Každý příjemce dostane z každého kusu poměrný díl (podíl / plánovaný základ); kumulativní
 * zaokrouhlení drží součet přesně: když se strhne celý základ, dostane každý přesně svůj podíl.
 */
export function rozpisPrevoduNaKusy<K extends string | number>(podily: readonly { klic: K; castka: number }[], kusy: readonly { den: string; castka: number }[], zaklad: number): { klic: K; den: string; castka: number }[] {
  const out: { klic: K; den: string; castka: number }[] = [];
  if (!(zaklad > 0)) return out;
  for (const p of podily) {
    let kum = 0;
    let dano = 0;
    for (const k of kusy) {
      kum += k.castka;
      const ma = Math.round((p.castka * kum) / zaklad);
      const c = ma - dano;
      dano = ma;
      if (c !== 0) out.push({ klic: p.klic, den: k.den, castka: c });
    }
  }
  return out;
}

/**
 * Přepočet plánovaných podílů záskoku na nový základ (krácení snížené, srážka zrušená nebo
 * nesouhlas): podíly se změní poměrně, součet = podíl původního součtu na novém základu
 * (metoda největších zbytků, žádná koruna se neztratí ani nepřibude).
 */
export function preskalujPodily(castky: readonly number[], staryZaklad: number, novyZaklad: number): number[] {
  if (!(staryZaklad > 0) || !(novyZaklad > 0)) return castky.map(() => 0);
  const suma = castky.reduce((a, c) => a + Math.max(0, c), 0);
  const cil = Math.min(Math.round((suma * novyZaklad) / staryZaklad), Math.round(novyZaklad));
  if (!(suma > 0)) return castky.map(() => 0);
  const presne = castky.map(c => (Math.max(0, c) / suma) * cil);
  const out = presne.map(x => Math.floor(x));
  let zbyva = cil - out.reduce((a, x) => a + x, 0);
  const poradi = presne.map((x, i) => ({ i, z: x - Math.floor(x) })).sort((a, b) => b.z - a.z || a.i - b.i);
  for (let k = 0; zbyva > 0 && poradi.length; k++, zbyva--) out[poradi[k % poradi.length].i] += 1;
  return out;
}

// ---------------------------------------------------------------------------
// Uzavřená období: srovnat řádky úprav mzdy s cílem
// ---------------------------------------------------------------------------

export interface RadekUpravy { id: number; den: string; castka: number }
export interface NovyRadek { den: string; castka: number; /** Opravný řádek za uzavřené období. */ oprava: boolean }

/**
 * Srovná existující řádky úprav (wage_adjustments jednoho zdroje a vazby) s cílovým stavem:
 *  - řádky v uzavřeném období zůstanou, jak jsou (výplata je hotová);
 *  - řádky v otevřeném období, které cíl nechce, se smažou; shodné (den + částka) zůstanou;
 *  - cílové řádky v otevřeném období se vloží;
 *  - co cíl chce v uzavřeném období, a rozdíl proti tomu, co tam už je, jde opravným řádkem
 *    do prvního otevřeného dne po nejstarším dotčeném uzavřeném dni.
 * Součet po srovnání = součet cíle (pokud se nějaké otevřené období vůbec najde).
 */
export function srovnejSZamky(existujici: readonly RadekUpravy[], cil: readonly { den: string; castka: number }[], zamky: readonly ZamekObdobi[]): { smazat: number[]; vlozit: NovyRadek[] } {
  const zamcene = existujici.filter(r => zamceno(zamky, r.den));
  const otevrene = existujici.filter(r => !zamceno(zamky, r.den));
  const cilOtevreny = cil.filter(c => c.castka !== 0 && !zamceno(zamky, c.den));
  const cilZamceny = cil.filter(c => c.castka !== 0 && zamceno(zamky, c.den));
  const pouzite = new Set<number>();
  const vlozit: NovyRadek[] = [];
  for (const c of cilOtevreny) {
    const shoda = otevrene.find(r => !pouzite.has(r.id) && r.den === c.den && r.castka === c.castka);
    if (shoda) pouzite.add(shoda.id);
    else vlozit.push({ den: c.den, castka: c.castka, oprava: false });
  }
  const smazat = otevrene.filter(r => !pouzite.has(r.id)).map(r => r.id);
  const L = zamcene.reduce((a, r) => a + r.castka, 0);
  const chceZamceno = cilZamceny.reduce((a, c) => a + c.castka, 0);
  const oprava = chceZamceno - L;
  if (oprava !== 0) {
    const dny = [...zamcene.map(r => r.den), ...cilZamceny.map(c => c.den)].sort();
    const den = prvniOtevrenyDen(dny[0], zamky);
    // Opravu sloučit s cílovým řádkem téhož dne by zamlžilo, proč tam je — zůstane vlastní řádek.
    vlozit.push({ den, castka: oprava, oprava: true });
  }
  return { smazat, vlozit };
}

// ---------------------------------------------------------------------------
// Hromadně: dávka lidí
// ---------------------------------------------------------------------------

/** Seznam lidí dávky z těla (`userIds` nebo `userId`), bez duplicit; chyba při prázdném nebo moc velkém. */
export function lideDavky(b: Record<string, unknown>): { ok: true; ids: number[] } | { ok: false; chyba: string } {
  const raw = Array.isArray(b.userIds) ? b.userIds : b.userId != null ? [b.userId] : [];
  const ids: number[] = [];
  for (const x of raw) { const n = cele(x); if (n && n > 0 && !ids.includes(n)) ids.push(n); }
  if (!ids.length) return { ok: false, chyba: 'Vyber, koho se trest týká.' };
  if (ids.length > MAX_LIDI_DAVKY) return { ok: false, chyba: 'Moc lidí najednou (nejvýš 50).' };
  return { ok: true, ids };
}

/** Částka pro každého v dávce: „každý X" (rozpocitat false), nebo „rozpočítat X mezi všechny". */
export function castkyDavky(castka: number, n: number, rozpocitat: boolean): number[] {
  const c = Math.max(0, Math.round(castka));
  return rozpocitat ? rozpocitej(c, n) : Array.from({ length: n }, () => c);
}

export interface VstupOdmeny { ids: number[]; castky: number[]; den: string; text: string; nenarokova: boolean }

/** Hromadná odměna v Kč: { userIds, castka, rozpocitat?, day, text, nenarokova? } → platná, nebo chyba. */
export function validujOdmenu(b: Record<string, unknown>, dnes: string): { ok: true; odmena: VstupOdmeny } | { ok: false; chyba: string } {
  const l = lideDavky(b);
  if (!l.ok) return { ok: false, chyba: l.chyba === 'Vyber, koho se trest týká.' ? 'Vyber, komu odměna patří.' : l.chyba };
  const castka = celeVMezich(b.castka, 1, MAX_ODMENA * MAX_LIDI_DAVKY);
  if (!castka) return { ok: false, chyba: 'Odměna musí být celé kladné číslo.' };
  const castky = castkyDavky(castka, l.ids.length, b.rozpocitat === true);
  if (castky.some(c => c > MAX_ODMENA)) return { ok: false, chyba: 'Odměna jednomu člověku může být nejvýš 100 000.' };
  if (castky.some(c => c <= 0)) return { ok: false, chyba: 'Po rozpočítání by někdo dostal 0 — zvyš částku.' };
  const text = typeof b.text === 'string' ? b.text.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  if (text.length < 2) return { ok: false, chyba: 'Napiš, za co odměna je.' };
  const den = typeof b.day === 'string' && JE_DEN.test(b.day) ? b.day : dnes;
  if (den > dnes) return { ok: false, chyba: 'Den nesedí — ne do budoucna.' };
  return { ok: true, odmena: { ids: l.ids, castky, den, text, nenarokova: b.nenarokova !== false } };
}

// ---------------------------------------------------------------------------
// Výplata: rozpad úprav a dopad na období
// ---------------------------------------------------------------------------

export interface RozpadUprav {
  /** Nenárokové prémie (+). */
  premie: number;
  /** Přijatý záskok (+). */
  zaskok: number;
  /** Krácení trestem (kladné číslo = kolik se krátí). */
  kraceni: number;
  /** Náhrada škody (kladné číslo). */
  nahrada: number;
  /** Přímé srážky (kladné číslo). */
  srazky: number;
  /** Ostatní prémie a srážky (mzda / ostatní, odměny z katalogu, navíc) se znaménkem. */
  ostatni: number;
}

/** Rozpad úprav mzdy podle zdroje (wage_adjustments.source). */
export function rozpadUprav(upravy: readonly Pick<UpravaMzdy, 'amount' | 'source'>[]): RozpadUprav {
  const r: RozpadUprav = { premie: 0, zaskok: 0, kraceni: 0, nahrada: 0, srazky: 0, ostatni: 0 };
  for (const u of upravy) {
    const a = Math.round(Number(u.amount) || 0);
    const s = String(u.source ?? 'manual');
    if (s === ZDROJ_PREMIE && a > 0) r.premie += a;
    else if (s === ZDROJ_ZASKOK) r.zaskok += a;
    else if (s === ZDROJ_KRACENI) r.kraceni -= a;
    else if (s === ZDROJ_NAHRADA) r.nahrada -= a;
    else if (s === ZDROJ_SRAZKA) r.srazky -= a;
    else r.ostatni += a;
  }
  return r;
}

export interface RozpadVyplaty extends RozpadUprav {
  /** Hrubá mzda z hodin (jak ji počítá docházka); null bez sazby. */
  mzda: number | null;
  /** Nároková část mzdy (mzda − složka, když je složka součástí sazby); jinak = mzda. */
  zakladni: number | null;
  /** Nenároková složka za období. */
  slozka: number;
  /** Část složky, která se platí NAVÍC ke mzdě (jinak 0). */
  slozkaNavic: number;
  /** Krácení, které se opravdu strhne (≤ složka + nenárokové prémie). */
  kraceniUplatneno: number;
  /** Krácení nad strop — ve výplatě se vrací (nároková mzda zůstává celá). */
  kraceniNadStrop: number;
  /** Srážky, které čekají na souhlas zaměstnance — ve výplatě se NEstrhávají. */
  cekaNaSouhlas: number;
  /** Úpravy po opravě krácení nad strop (k mzdě; dřívější `upravy` + kraceniNadStrop). */
  upravyUcinne: number;
  /** Hrubá výplata bez příplatků a dýška: mzda + složka navíc + účinné úpravy. */
  hruba: number;
}

/**
 * Peníze jednoho člověka za období: mzda rozdělená na nárokovou a nenárokovou složku, prémie,
 * krácení (nejvýš do složky + nenárokových prémií), náhrada škody, srážky, záskok a srážky čekající
 * na souhlas (ty se nestrhávají). `upravy` jsou úpravy toho člověka v období.
 */
export function rozpadVyplaty(o: {
  mzda: number | null; ms: number; od: string; do: string;
  upravy: readonly Pick<UpravaMzdy, 'amount' | 'source'>[];
  slozka?: NastaveniSlozky | null; cekaNaSouhlas?: number;
}): RozpadVyplaty {
  const r = rozpadUprav(o.upravy);
  const slozka = slozkaZaObdobi(o.slozka ?? null, { mzda: o.mzda, ms: o.ms, od: o.od, do: o.do });
  const vSazbe = o.slozka?.vSazbe !== false;
  const slozkaNavic = o.slozka && !vSazbe ? slozka : 0;
  const zakladni = o.mzda == null ? null : vSazbe ? o.mzda - slozka : o.mzda;
  const k = ucinneKraceni(r.kraceni, slozka, r.premie + Math.max(0, r.zaskok));
  const soucet = o.upravy.reduce((a, u) => a + Math.round(Number(u.amount) || 0), 0);
  const upravyUcinne = soucet + k.nadStrop;
  return {
    ...r, mzda: o.mzda, zakladni, slozka, slozkaNavic,
    kraceniUplatneno: k.uplatneno, kraceniNadStrop: k.nadStrop,
    cekaNaSouhlas: Math.max(0, Math.round(o.cekaNaSouhlas ?? 0)),
    upravyUcinne,
    hruba: (o.mzda ?? 0) + slozkaNavic + upravyUcinne,
  };
}

// ---------------------------------------------------------------------------
// Tvar pro klienta (GET /api/tresty → item.penize)
// ---------------------------------------------------------------------------

export interface SkodaSrazky {
  castka: number;
  druh: DruhSkody;
  zavineni: Zavineni;
  dohoda: boolean;
  dohodaDatum: string | null;
  /** Průměrný měsíční výdělek, ze kterého se počítal strop (null = data chyběla). */
  prumer: number | null;
  strop: number | null;
  varovani: string | null;
}

export interface SrazkaTrestu {
  id: number;
  druh: DruhSrazky;
  castka: number;
  splatky: number;
  stav: StavSrazky;
  potrebujeSouhlas: boolean;
  /** Typ smlouvy v době zápisu (HPP / DPC / DPP / OSVC / null). */
  smlouva: string | null;
  /** Věta pro vedení, proč hned / až po souhlasu. */
  proc: string;
  /** Znění dohody o srážce (k souhlasu; po souhlasu to, co člověk odsouhlasil). */
  zneni: string | null;
  souhlasAt: string | null;
  nesouhlasAt: string | null;
  nesouhlasDuvod: string | null;
  /** Od kterého dne se strhává (po uplatnění). */
  odDne: string | null;
  /** Rozvrh splátek (po uplatnění). */
  rozvrh: { den: string; castka: number }[];
  skoda: SkodaSrazky | null;
  zrusenoAt: string | null;
}

export interface PrevodTrestu {
  id: number;
  /** Příjemce; zaměstnanec, kterého se trest týká, jména nevidí (null). */
  userId: number | null;
  userName: string | null;
  /** Plánovaný podíl (když se strhne všechno). */
  castka: number;
  /** Kolik už opravdu přešlo (úpravy mzdy příjemce). */
  preslo: number;
  stav: 'plati' | 'zruseno';
}

export interface PenizeTrestu {
  /** Krácení nenárokové složky (= bonusCut). */
  kraceni: number;
  srazky: SrazkaTrestu[];
  zaskok: { komu: KomuZaskok; zpusob: ZpusobZaskoku | null; prevody: PrevodTrestu[] };
  /** Součet srážek čekajících na souhlas. */
  cekaNaSouhlas: number;
  /** Kolik se opravdu strhlo (krácení + uplatněné srážky). */
  strzeno: number;
}

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const den = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/** Obranně z odpovědi API (widget nesmí spadnout na divném tvaru). */
export function vyberPenizeTrestu(raw: unknown): PenizeTrestu | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const srazky: SrazkaTrestu[] = [];
  for (const s of Array.isArray(o.srazky) ? o.srazky as Record<string, unknown>[] : []) {
    const id = cele(s?.id);
    const castka = Number(s?.castka);
    if (!id || !(castka > 0)) continue;
    const sk = (s.skoda ?? null) as Record<string, unknown> | null;
    srazky.push({
      id, druh: s.druh === 'nahrada' ? 'nahrada' : 'srazka', castka: Math.round(castka), splatky: Math.max(1, cele(s.splatky) ?? 1),
      stav: jeStavSrazky(s.stav) ? s.stav : 'ceka', potrebujeSouhlas: s.potrebujeSouhlas !== false, smlouva: txt(s.smlouva), proc: String(s.proc ?? ''),
      zneni: txt(s.zneni), souhlasAt: txt(s.souhlasAt), nesouhlasAt: txt(s.nesouhlasAt), nesouhlasDuvod: txt(s.nesouhlasDuvod), odDne: den(s.odDne),
      rozvrh: (Array.isArray(s.rozvrh) ? s.rozvrh as Record<string, unknown>[] : []).map(x => ({ den: den(x?.den) ?? '', castka: Math.round(Number(x?.castka) || 0) })).filter(x => x.den && x.castka),
      skoda: sk && typeof sk === 'object' && Number(sk.castka) > 0 ? {
        castka: Math.round(Number(sk.castka)), druh: (DRUHY_SKODY as readonly unknown[]).includes(sk.druh) ? sk.druh as DruhSkody : 'zavinena',
        zavineni: sk.zavineni === 'umysl' ? 'umysl' : 'nedbalost', dohoda: sk.dohoda === true, dohodaDatum: den(sk.dohodaDatum),
        prumer: cele(sk.prumer), strop: cele(sk.strop), varovani: txt(sk.varovani),
      } : null,
      zrusenoAt: txt(s.zrusenoAt),
    });
  }
  const z = (o.zaskok ?? {}) as Record<string, unknown>;
  const prevody: PrevodTrestu[] = [];
  for (const p of Array.isArray(z.prevody) ? z.prevody as Record<string, unknown>[] : []) {
    const id = cele(p?.id);
    if (!id) continue;
    prevody.push({ id, userId: cele(p.userId), userName: txt(p.userName), castka: Math.round(Number(p.castka) || 0), preslo: Math.round(Number(p.preslo) || 0), stav: p.stav === 'zruseno' ? 'zruseno' : 'plati' });
  }
  const komu: KomuZaskok = z.komu === 'lide' || z.komu === 'smena' ? z.komu : 'podnik';
  return {
    kraceni: Math.max(0, Math.round(Number(o.kraceni) || 0)),
    srazky,
    zaskok: { komu, zpusob: z.zpusob === 'castky' ? 'castky' : z.zpusob === 'rovne' ? 'rovne' : null, prevody },
    cekaNaSouhlas: Math.max(0, Math.round(Number(o.cekaNaSouhlas) || 0)),
    strzeno: Math.max(0, Math.round(Number(o.strzeno) || 0)),
  };
}

/** Peněžní část trestu do věty: „krácení 300 Kč · srážka 500 Kč (čeká na souhlas) · náhrada 2 000 Kč". */
export function penizeText(p: PenizeTrestu | null | undefined, kc: (n: number) => string): string {
  if (!p) return '';
  const casti: string[] = [];
  if (p.kraceni) casti.push(`krácení ${kc(p.kraceni)}`);
  for (const s of p.srazky) {
    if (s.stav === 'zruseno') continue;
    const co = s.druh === 'nahrada' ? 'náhrada' : 'srážka';
    casti.push(`${co} ${kc(s.castka)}${s.stav === 'ceka' ? ' (čeká na souhlas)' : s.stav === 'nesouhlas' ? ' (nesouhlasí)' : ''}`);
  }
  return casti.join(' · ');
}

/** Čeká něco z trestu na souhlas zaměstnance? */
export const cekaNaSouhlas = (p: PenizeTrestu | null | undefined): boolean => !!p?.srazky.some(s => s.stav === 'ceka');

// ---------------------------------------------------------------------------
// Oznámení
// ---------------------------------------------------------------------------

export function oznameniSrazkyKSouhlasu(o: { castka: number; druh: DruhSrazky; text: string }, kc: (n: number) => string): { title: string; body: string } {
  return { title: o.druh === 'nahrada' ? `Náhrada škody ${kc(o.castka)} čeká na tvůj souhlas` : `Srážka ${kc(o.castka)} čeká na tvůj souhlas`, body: o.text.slice(0, 140) };
}
export function oznameniNesouhlasuSrazky(jmeno: string, o: { castka: number; duvod: string | null }, kc: (n: number) => string): { title: string; body: string } {
  return { title: `${jmeno} nesouhlasí se srážkou ${kc(o.castka)}`, body: (o.duvod ?? 'Bez vyjádření.').slice(0, 140) };
}
export function oznameniSouhlasuSrazky(jmeno: string, castka: number, kc: (n: number) => string): { title: string; body: string } {
  return { title: `${jmeno} souhlasí se srážkou ${kc(castka)}`, body: 'Srážka se uplatní ve výplatě.' };
}
export function oznameniZaskoku(castka: number, text: string, kc: (n: number) => string): { title: string; body: string } {
  return { title: `Za záskok dostaneš ${kc(castka)}`, body: text.slice(0, 140) };
}
export function oznameniOdmeny(castka: number, text: string, kc: (n: number) => string): { title: string; body: string } {
  return { title: `Odměna ${kc(castka)} k výplatě`, body: text.slice(0, 140) };
}

// ---------------------------------------------------------------------------
// Adresy
// ---------------------------------------------------------------------------

export const URL_SRAZKY = '/api/tresty/srazky';
export const URL_VYBER_LIDI = '/api/tresty/vyber';
export const URL_SLOZKA = '/api/payroll/slozka';
export const URL_ODMENY_DAVKA = '/api/wage-adjustments/davka';
