// Dárkové poukazy s unikátními kódy: čistá logika (bez databáze, jde testovat přímo).
//
// Poukaz je peněžní: má hodnotu a zůstatek v celých jednotkách měny podniku a dá se uplatnit na víckrát.
// (Kupon je výhoda, ne peníze; proto zvlášť.) Databázová část je v lib/poukazyDb.ts.
//
// Kód: `DP-XXXX-XXXX`, osm znaků z abecedy BEZ zaměnitelných znaků (0/O, 1/I/L), poslední je kontrolní.
// Kontrolní znak zachytí překlep při opisování ještě před dotazem do databáze. Hádání kódů brání 32^7 (přes
// 34 miliard) možností a omezení pokusů u hostů (hit); kód se nikdy nevolí ručně, vždy se losuje.

/** 32 znaků: písmena bez I a O + číslice 2–9 (0 a 1 chybí, takže se L ani O s ničím nepletou). */
export const ABECEDA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PREFIX = 'DP';
/** Nejvyšší hodnota jednoho poukazu a nejvíc kusů v jedné dávce. */
export const MAX_HODNOTA = 1_000_000;
export const MAX_DAVKA = 100;

export type StavPoukazu = 'active' | 'used' | 'void' | 'expired';
export type DruhPouziti = 'use' | 'refund' | 'void';

export interface PoukazVstup {
  value_amount: number;
  balance: number;
  currency?: string | null;
  /** Poslední platný den, `YYYY-MM-DD` (včetně), nebo prázdné = bez omezení. */
  valid_until: string | null;
  /** Uložený stav; `expired` se z něj neukládá, odvozuje se z data. */
  status?: string | null;
}

/**
 * Kontrolní znak: vážený součet pozic mod 32 s lichými váhami (1, 3, 5, …). Liché číslo je s 32 nesoudělné, takže
 * změna kteréhokoli jednoho znaku součet vždy změní (zachytí každý jednotlivý překlep) a většinu záměn sousedních znaků.
 */
export function kontrolniZnak(sedm: string): string {
  let s = 0;
  for (let i = 0; i < sedm.length; i++) {
    const p = ABECEDA.indexOf(sedm[i]);
    if (p < 0) return '';
    s += p * (2 * i + 1);
  }
  return ABECEDA[s % ABECEDA.length];
}

/** Zdroj náhody po bajtech; v testech se dosazuje pevný. */
export type ZdrojNahody = (n: number) => Uint8Array;
const nahodaSystemu: ZdrojNahody = n => { const b = new Uint8Array(n); globalThis.crypto.getRandomValues(b); return b; };

/** Nový kód `DP-XXXX-XXXX`. 256 je násobek 32, takže bajt mod 32 je rovnoměrný (bez zkreslení). */
export function generujKod(zdroj: ZdrojNahody = nahodaSystemu): string {
  const b = zdroj(7);
  let sedm = '';
  for (let i = 0; i < 7; i++) sedm += ABECEDA[b[i] % ABECEDA.length];
  const osm = sedm + kontrolniZnak(sedm);
  return `${PREFIX}-${osm.slice(0, 4)}-${osm.slice(4)}`;
}

/**
 * Z toho, co člověk opíše („dp-abcd 1234“, „DPABCD1234“, „abcd-1234“), udělá `DP-ABCD-1234`.
 * Vrací null, když to nemá osm znaků z abecedy; kontrolní znak se tu NEhlídá (to je `kodOk`).
 */
export function normalizujKod(vstup: unknown): string | null {
  let c = String(vstup ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length === 10 && c.startsWith(PREFIX)) c = c.slice(2);
  if (c.length !== 8) return null;
  for (const z of c) if (!ABECEDA.includes(z)) return null;
  return `${PREFIX}-${c.slice(0, 4)}-${c.slice(4)}`;
}

/** Je kontrolní znak správně? Kód z `normalizujKod`. */
export function kodOk(kod: string | null): boolean {
  if (!kod) return false;
  const c = kod.replace(/[^A-Z0-9]/g, '').slice(2);
  return c.length === 8 && kontrolniZnak(c.slice(0, 7)) === c[7];
}

/** Opsaný text → platný kód, nebo null (špatný formát i špatný kontrolní znak). */
export function overKod(vstup: unknown): string | null {
  const k = normalizujKod(vstup);
  return kodOk(k) ? k : null;
}

/**
 * Formát při psaní: osm znaků po čtveřicích („ABCD-2345“). Předpona DP se odřízne, až když je znaků víc než osm
 * (vložení celého kódu „DP-ABCD-2345“); do té doby se nic nehádá, ať jde psát i kód s předponou po jednom znaku.
 */
export function formatujPriPsani(raw: string): string {
  let c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.startsWith(PREFIX) && c.length > 8) c = c.slice(2);
  c = c.slice(0, 8);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** Celé nezáporné číslo v rozsahu, jinak null. Desetinná čísla, text, NaN a záporné hodnoty neprojdou. */
export function celaCastka(v: unknown, max = MAX_HODNOTA): number | null {
  if (typeof v === 'string' && !/^\s*\d{1,9}\s*$/.test(v)) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > max) return null;
  return n;
}

/** Stav poukazu k datu `dnes` (`YYYY-MM-DD`). Zrušený a vyčerpaný mají přednost před propadlým. */
export function stavPoukazu(p: PoukazVstup, dnes: string): StavPoukazu {
  if (p.status === 'void') return 'void';
  if (p.balance <= 0) return 'used';
  if (p.valid_until && p.valid_until < dnes) return 'expired';
  return 'active';
}

export const STAV_POPISEK: Record<StavPoukazu, string> = {
  active: 'Platný', used: 'Vyčerpaný', void: 'Zrušený', expired: 'Propadlý',
};

export type DuvodOdmitnuti =
  | 'nenalezen' | 'zaporna' | 'nulova' | 'necela' | 'mena' | 'zruseny' | 'vycerpany' | 'propadly' | 'vic_nez_zustatek' | 'vic_nez_hodnota';

export const DUVOD_TEXT: Record<DuvodOdmitnuti, string> = {
  nenalezen: 'Poukaz nenalezen.',
  zaporna: 'Částka nesmí být záporná.',
  nulova: 'Zadej částku větší než nula.',
  necela: 'Částka musí být celé číslo.',
  mena: 'Poukaz je v jiné měně.',
  zruseny: 'Poukaz je zrušený.',
  vycerpany: 'Poukaz je už vyčerpaný.',
  propadly: 'Platnost poukazu skončila.',
  vic_nez_zustatek: 'Na poukazu je méně, než chceš uplatnit.',
  vic_nez_hodnota: 'Vrátit se dá nejvýš to, co už bylo uplatněno.',
};

export type Posudek = { ok: true; novyZustatek: number; castka: number } | { ok: false; duvod: DuvodOdmitnuti };

function castkaChyba(castka: unknown): DuvodOdmitnuti | null {
  if (typeof castka !== 'number' || !Number.isFinite(castka)) return 'necela';
  if (castka < 0) return 'zaporna';
  if (castka === 0) return 'nulova';
  if (!Number.isInteger(castka)) return 'necela';
  return null;
}

/**
 * Smí se z poukazu uplatnit `castka`? Kontroluje měnu (když ji volající zná), stav, platnost a zůstatek.
 * Čistá obdoba podmínky v SQL (`balance >= amount AND status = 'active' AND valid_until >= dnes`): databáze
 * rozhoduje atomicky, tohle dává srozumitelný důvod pro obsluhu a testuje se bez databáze.
 */
export function posudUplatneni(p: PoukazVstup | null, castka: unknown, dnes: string, mena?: string | null): Posudek {
  if (!p) return { ok: false, duvod: 'nenalezen' };
  const chyba = castkaChyba(castka);
  if (chyba) return { ok: false, duvod: chyba };
  const c = castka as number;
  if (mena && p.currency && mena.toUpperCase() !== p.currency.toUpperCase()) return { ok: false, duvod: 'mena' };
  const stav = stavPoukazu(p, dnes);
  if (stav === 'void') return { ok: false, duvod: 'zruseny' };
  if (stav === 'used') return { ok: false, duvod: 'vycerpany' };
  if (stav === 'expired') return { ok: false, duvod: 'propadly' };
  if (c > p.balance) return { ok: false, duvod: 'vic_nez_zustatek' };
  return { ok: true, novyZustatek: p.balance - c, castka: c };
}

/** Vrácení části uplatněné částky (storno chybně zadaného uplatnění). Zrušený poukaz se nevrací; propadlý ano (chyba obsluhy). */
export function posudVraceni(p: PoukazVstup | null, castka: unknown): Posudek {
  if (!p) return { ok: false, duvod: 'nenalezen' };
  const chyba = castkaChyba(castka);
  if (chyba) return { ok: false, duvod: chyba };
  const c = castka as number;
  if (p.status === 'void') return { ok: false, duvod: 'zruseny' };
  if (p.balance + c > p.value_amount) return { ok: false, duvod: 'vic_nez_hodnota' };
  return { ok: true, novyZustatek: p.balance + c, castka: c };
}

/** Je `YYYY-MM-DD` skutečné datum? (31. 2. neprojde.) */
export function jeDatum(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Zůstatek podle historie: uplatnění ubírají, vrácení přidávají, zrušení vynuluje. Pro kontrolu konzistence. */
export function zustatekZHistorie(hodnota: number, historie: { kind: DruhPouziti; amount: number }[]): number {
  let z = hodnota;
  for (const h of historie) {
    if (h.kind === 'use') z -= h.amount;
    else if (h.kind === 'refund') z += h.amount;
    else if (h.kind === 'void') z -= h.amount;
  }
  return z;
}

// ---- Seznam a export --------------------------------------------------------------

/** Pole CSV v českém Excelu: uvozovky, zdvojené uvozovky, ochrana proti vzorcům (=, +, -, @ na začátku). */
export function csvPole(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface RadekPoukazu {
  code: string; value_amount: number; balance: number; currency: string; valid_until: string | null;
  status: string; recipient_name?: string | null; buyer_name?: string | null; note?: string | null; created_at?: string | null;
}

/** CSV se středníkem a BOM, ať Excel pozná češtinu. */
export function poukazyCsv(radky: RadekPoukazu[], dnes: string): string {
  const hlavicka = ['Kód', 'Stav', 'Hodnota', 'Zůstatek', 'Měna', 'Platí do', 'Obdarovaný', 'Kupující', 'Poznámka', 'Vytvořeno'];
  const r = radky.map(p => [
    p.code, STAV_POPISEK[stavPoukazu(p, dnes)], p.value_amount, p.balance, p.currency, p.valid_until ?? '',
    p.recipient_name ?? '', p.buyer_name ?? '', p.note ?? '', p.created_at ? String(p.created_at).slice(0, 10) : '',
  ].map(csvPole).join(';'));
  return '﻿' + [hlavicka.join(';'), ...r].join('\r\n') + '\r\n';
}

/** Hodnoty z dávky: jedna hodnota pro všechny kusy, nebo seznam hodnot (jedna na kus). Vrací null, když je něco špatně. */
export function hodnotyDavky(v: unknown, pocet: number): number[] | null {
  if (!Number.isInteger(pocet) || pocet < 1 || pocet > MAX_DAVKA) return null;
  if (Array.isArray(v)) {
    if (v.length !== pocet) return null;
    const out: number[] = [];
    for (const x of v) { const n = celaCastka(x); if (n == null || n < 1) return null; out.push(n); }
    return out;
  }
  const n = celaCastka(v);
  if (n == null || n < 1) return null;
  return Array<number>(pocet).fill(n);
}
