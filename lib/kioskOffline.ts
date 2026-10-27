// Tablet píchá i bez internetu (kolo 8, R8-2) — čistá část fronty, bez Reactu, bez fetch a bez localStorage.
//
// Jak to funguje (components/kiosk/KioskShiftGate.tsx kreslí a ukládá, app/api/attendance/sync zapisuje):
//  - dokud je tablet online, ukládá si při každém načtení rozpisu i otisky PINů (bcrypt hash z users.pin_hash,
//    jen pro účet tabletu) — PIN samotný se nikdy neukládá;
//  - bez internetu se příchod / odchod ověří proti uloženému otisku a zapíše do fronty s časem tabletu
//    a idempotenčním klíčem (lib/idempotenceKlic.novyKlic); rozpis na obrazovce se podle fronty hned přepíše;
//  - po připojení jde fronta dávkou na POST /api/attendance/sync; server každý kus zapíše nejvýš jednou
//    (lib/idempotence), odmítne starší než 24 h a označí záznamy `offline`.
//
// Relativní importy s příponou: `npm test` pouští .ts přímo v Node.

import { ocistiKlic } from './idempotenceKlic.ts';
import { parseDbTime } from './pragueTime.ts';

export type AkceFronty = 'in' | 'out';

export interface PolozkaFronty {
  /** Idempotenční klíč — stejný kus se po opakovaném odeslání nezapíše dvakrát. */
  klic: string;
  employeeId: number;
  /** Jméno jen pro hlášky na tabletu; server ho nečte. */
  jmeno: string;
  action: AkceFronty;
  /** Čas tabletu (ISO) — server ho použije jako příchod / odchod. */
  cas: string;
  /** PIN se ověřil proti uloženému otisku (člověk bez PINu: false, server to nechce). */
  pinOvereno: boolean;
}

/** Starší píchnutí server odmítne — po dnu bez internetu se docházka opravuje ručně, ne dávkou naslepo. */
export const MAX_STARI_FRONTY_MS = 24 * 3600_000;
/** Víc než tolik kusů ve frontě tablet nedrží (den provozu je ~40 píchnutí). */
export const MAX_FRONTA = 50;
/** Rezerva na rozladěné hodiny tabletu: čas v budoucnosti nad tohle server odmítne. */
export const REZERVA_BUDOUCNOST_MS = 10 * 60_000;

/** Přidá kus do fronty; stejný klíč podruhé se nepřidá, nad strop se nejstarší zahodí. */
export function pridejDoFronty(fronta: readonly PolozkaFronty[], p: PolozkaFronty): PolozkaFronty[] {
  if (fronta.some(x => x.klic === p.klic)) return [...fronta];
  const out = [...fronta, p].sort((a, b) => a.cas.localeCompare(b.cas));
  return out.length > MAX_FRONTA ? out.slice(out.length - MAX_FRONTA) : out;
}

/** Rozpis tak, jak bude vypadat po doručení fronty: příchod otevře, odchod zavře (v pořadí podle času). */
export function rosterSFrontou<T extends { id: number; openSince: string | null; breakSince?: string | null; shiftSince?: string | null; breakMs?: number | null }>(roster: readonly T[], fronta: readonly PolozkaFronty[]): T[] {
  if (!fronta.length) return [...roster];
  const serazena = [...fronta].sort((a, b) => a.cas.localeCompare(b.cas));
  return roster.map(m => {
    let x: T = m;
    for (const p of serazena) {
      if (p.employeeId !== m.id) continue;
      const naPauze = !!x.breakSince && !x.openSince;
      if (p.action === 'in' && naPauze) {
        // Příchod během pauzy pauzu ukončí (server totéž) — směna pokračuje, pauza se přičte k pauzám.
        const od = parseDbTime(x.breakSince ?? null)?.getTime(), doP = Date.parse(p.cas);
        const pauza = od != null && doP > od ? doP - od : 0;
        x = { ...x, openSince: p.cas, breakSince: null, breakMs: (Number(x.breakMs) || 0) + pauza };
      } else if (p.action === 'in') {
        x = { ...x, openSince: p.cas, breakSince: null, shiftSince: null, breakMs: 0 };
      } else {
        // Odchod — i rovnou z pauzy — směnu ukončí.
        x = { ...x, openSince: null, breakSince: null, shiftSince: null, breakMs: 0 };
      }
    }
    return x.openSince === m.openSince && x.breakSince === m.breakSince ? m : x;
  });
}

/** Rozdělí frontu na to, co ještě má smysl poslat, a co už je starší než den (server by to odmítl). */
export function zastaraleVeFronte(fronta: readonly PolozkaFronty[], ted: number): { platne: PolozkaFronty[]; zastarale: PolozkaFronty[] } {
  const platne: PolozkaFronty[] = [], zastarale: PolozkaFronty[] = [];
  for (const p of fronta) (ted - Date.parse(p.cas) > MAX_STARI_FRONTY_MS ? zastarale : platne).push(p);
  return { platne, zastarale };
}

export interface VysledekSync { klic: string; ok: boolean; error?: string | null }

/**
 * Po odpovědi serveru: doručené i definitivně odmítnuté kusy z fronty zmizí (odmítnutí se vypíše),
 * kusy, o kterých server nic neřekl, zůstanou na další pokus.
 */
export function poSynchronizaci(fronta: readonly PolozkaFronty[], vysledky: readonly VysledekSync[]): { zbyva: PolozkaFronty[]; doruceno: number; odmitnuto: { jmeno: string; action: AkceFronty; error: string }[] } {
  const podle = new Map(vysledky.map(v => [v.klic, v]));
  const zbyva: PolozkaFronty[] = []; let doruceno = 0; const odmitnuto: { jmeno: string; action: AkceFronty; error: string }[] = [];
  for (const p of fronta) {
    const v = podle.get(p.klic);
    if (!v) { zbyva.push(p); continue; }
    if (v.ok) doruceno++;
    else odmitnuto.push({ jmeno: p.jmeno, action: p.action, error: String(v.error ?? '') });
  }
  return { zbyva, doruceno, odmitnuto };
}

/**
 * Jde člověka odpíchnout bez internetu? Kdo má PIN, potřebuje uložený otisk (tablet ho má z posledního
 * připojení); bez něj se PIN nemá proti čemu ověřit a píchnutí počká na síť. Vrací důvod, nebo null = jde.
 */
export function duvodProcNeOffline(member: { hasPin: boolean }, maOtisk: boolean): 'bez_otisku' | null {
  return member.hasPin && !maOtisk ? 'bez_otisku' : null;
}

// ---------------------------------------------------------------------------
// Server: ověření kusu z těla POST /api/attendance/sync
// ---------------------------------------------------------------------------

export interface PolozkaSync { klic: string; employeeId: number; action: AkceFronty; cas: Date; pinOvereno: boolean }

/** Jeden kus z těla požadavku: klíč, člověk, akce, čas (ne starší než den, ne v budoucnosti). */
export function overPolozkuSync(raw: unknown, ted: number): { ok: true; p: PolozkaSync } | { ok: false; klic: string | null; chyba: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const klic = ocistiKlic(r.klic);
  if (!klic) return { ok: false, klic: null, chyba: 'Chybí klíč píchnutí.' };
  const employeeId = Number(r.employeeId);
  if (!Number.isInteger(employeeId) || employeeId <= 0) return { ok: false, klic, chyba: 'Chybí zaměstnanec.' };
  const action = r.action === 'out' ? 'out' : r.action === 'in' ? 'in' : null;
  if (!action) return { ok: false, klic, chyba: 'Neznámá akce.' };
  const cas = new Date(String(r.cas ?? ''));
  if (Number.isNaN(cas.getTime())) return { ok: false, klic, chyba: 'Nečitelný čas píchnutí.' };
  if (ted - cas.getTime() > MAX_STARI_FRONTY_MS) return { ok: false, klic, chyba: 'Píchnutí je starší než den — doplň ho ručně v Docházce.' };
  if (cas.getTime() - ted > REZERVA_BUDOUCNOST_MS) return { ok: false, klic, chyba: 'Čas píchnutí je v budoucnosti — zkontroluj hodiny tabletu.' };
  return { ok: true, p: { klic, employeeId, action, cas, pinOvereno: r.pinOvereno === true } };
}
