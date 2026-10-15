// Párování naskenované kartičky s účtem z pokladny: čistá logika (bez databáze, testuje se přímo).
//
// Obsluha načte kartičku hosta dřív, než host zaplatí (nebo hned potom). Vznikne čekající
// párování (client_bill_claims) s časem skenu, obsluhou a volitelně stolem. Až se ze Storyous
// stáhne zaplacený účet, napáruje se sem podle pravidel:
//
//  * okno: účet zaplacený od 15 minut před skenem do 3 hodin po něm;
//  * signál: když obsluha vybrala stůl, musí sedět stůl (číšník pak jen přidá jistotu);
//    bez stolu musí sedět číšník (kdo účet založil nebo zaplatil, podle jména v pokladně);
//    bez stolu i bez známého číšníka se samo nepáruje nic;
//  * jednoznačnost: samo se páruje jen tehdy, když má párování v nejlepší skupině právě
//    jeden účet a ten účet není kandidátem žádného jiného čekajícího párování. Jinak
//    zůstane čekat a obsluha vybere z nabídnutých účtů (seřazených podle blízkosti času);
//  * zrušený, vrácený, už připsaný nebo jinému hostovi přiřazený účet není kandidát.
//
// Stejné jádro poslouží i Storyous Loyalty API (varianta B): tam účet s hostem spáruje sama
// pokladna (reportBenefitUsage nese customerId i billId) a z tohohle souboru zbude jen
// `propadlo` a výběr; připsání dělá lib/vernostZUctu.ts.

/** Kolik minut před skenem smí být účet zaplacený (host zaplatil, pak ukázal kartičku). */
export const OKNO_PRED_MIN = 15;
/** Kolik minut po skenu se ještě čeká na zaplacení. */
export const OKNO_PO_MIN = 180;
/** Po kolika hodinách čekající párování propadne. */
export const PROPADNE_PO_H = 6;
/** Nejkratší rozestup vynucené synchronizace pokladny po skenu (sekundy). */
export const SYNC_PO_SKENU_S = 30;

export type StavParovani = 'ceka' | 'paruji' | 'sparovano' | 'propadlo' | 'zruseno';

export interface CekajiciParovani {
  id: number;
  customerId: number;
  /** Čas skenu (ISO nebo čas z databáze bez zóny = UTC). */
  scannedAt: string;
  /** Stůl v pokladně (storyous desk id), když ho obsluha vybrala. */
  deskId: string | null;
  /** Jméno obsluhy, jak by ho mohla znát pokladna. */
  waiter: string | null;
}

export interface UcetZPokladny {
  billId: string;
  paidAt: string | null;
  finalPrice: number;
  deskId: string | null;
  createdByName: string | null;
  paidByName: string | null;
  refunded?: boolean;
  deleted?: boolean;
  /** Účet už věrnost připsal, nebo je přiřazený jinému hostovi. */
  obsazeny?: boolean;
}

export interface Kandidat { billId: string; skore: number; odchylkaMs: number; finalPrice: number; paidAt: string | null }

/** Čas z databáze (bez zóny = UTC) nebo ISO na milisekundy; nesmysl = null. */
export function casMs(v: string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const raw = String(v).trim();
  const zona = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(raw);
  const t = new Date(zona ? raw : raw.replace(' ', 'T') + 'Z').getTime();
  return Number.isNaN(t) ? null : t;
}

/** Jméno pro porovnání: bez diakritiky, malými písmeny, slova seřazená (Nováková Eva = Eva Nováková). */
export function normJmeno(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/).filter(Boolean).sort().join(' ');
}

/** Sedí obsluha s účtem? Stačí, když účet založila, nebo zaplatila. */
export function sediCisnik(waiter: string | null | undefined, ucet: Pick<UcetZPokladny, 'createdByName' | 'paidByName'>): boolean {
  const w = normJmeno(waiter);
  if (!w) return false;
  return normJmeno(ucet.createdByName) === w || normJmeno(ucet.paidByName) === w;
}

/** Je zaplacení účtu v okně párování? */
export function vOkne(scannedAt: string, paidAt: string | null): boolean {
  const s = casMs(scannedAt); const p = casMs(paidAt);
  if (s == null || p == null) return false;
  return p >= s - OKNO_PRED_MIN * 60_000 && p <= s + OKNO_PO_MIN * 60_000;
}

/** Propadlo čekající párování (déle než 6 h od skenu)? */
export function propadlo(scannedAt: string, nyniMs: number): boolean {
  const s = casMs(scannedAt);
  return s != null && nyniMs - s > PROPADNE_PO_H * 3600_000;
}

/**
 * Kandidáti jednoho párování, nejlepší první: vyšší skóre (stůl 2, číšník 1), pak blíž k času skenu.
 * Prázdné pole = nic se nehodí (nebo chybí stůl i číšník).
 */
export function kandidatiPro(c: CekajiciParovani, ucty: UcetZPokladny[]): Kandidat[] {
  const out: Kandidat[] = [];
  const s = casMs(c.scannedAt);
  if (s == null) return out;
  const maStul = !!c.deskId;
  const maCisnika = !!normJmeno(c.waiter);
  if (!maStul && !maCisnika) return out;
  for (const u of ucty) {
    if (u.refunded || u.deleted || u.obsazeny || !(Number(u.finalPrice) > 0)) continue;
    if (!vOkne(c.scannedAt, u.paidAt)) continue;
    const stul = maStul && u.deskId != null && String(u.deskId) === String(c.deskId);
    const cisnik = maCisnika && sediCisnik(c.waiter, u);
    if (maStul ? !stul : !cisnik) continue;
    out.push({ billId: u.billId, skore: (stul ? 2 : 0) + (cisnik ? 1 : 0), odchylkaMs: Math.abs((casMs(u.paidAt) ?? s) - s), finalPrice: Number(u.finalPrice), paidAt: u.paidAt });
  }
  return out.sort((a, b) => b.skore - a.skore || a.odchylkaMs - b.odchylkaMs);
}

export interface VysledekParovani {
  /** Jednoznačná dvojice: připíše se sama. */
  pary: { claimId: number; billId: string }[];
  /** Víc možností: obsluha vybere (účty seřazené podle jistoty a času). */
  nejasne: { claimId: number; billIds: string[] }[];
}

/** Napáruje čekající párování na účty. Nikdy nespáruje jeden účet dvěma hostům. */
export function naparuj(cekajici: CekajiciParovani[], ucty: UcetZPokladny[]): VysledekParovani {
  const kand = new Map<number, Kandidat[]>();
  const kolikrat = new Map<string, number>();
  for (const c of cekajici) {
    const k = kandidatiPro(c, ucty);
    kand.set(c.id, k);
    for (const x of k) kolikrat.set(x.billId, (kolikrat.get(x.billId) ?? 0) + 1);
  }
  const out: VysledekParovani = { pary: [], nejasne: [] };
  for (const c of cekajici) {
    const k = kand.get(c.id) ?? [];
    if (!k.length) continue;
    const nejlepsi = k.filter(x => x.skore === k[0].skore);
    if (nejlepsi.length === 1 && (kolikrat.get(nejlepsi[0].billId) ?? 0) === 1) out.pary.push({ claimId: c.id, billId: nejlepsi[0].billId });
    else out.nejasne.push({ claimId: c.id, billIds: k.map(x => x.billId) });
  }
  return out;
}

/** Krátká věta výsledku pro obsluhu: „Spárováno s účtem 412 Kč · +41 b". */
export function vetaSparovano(total: number, body: number, kredit: number, money: (n: number) => string): string {
  const casti = [`Spárováno s účtem ${money(Math.round(total))}`];
  if (body > 0) casti.push(`+${body} b`);
  if (kredit > 0) casti.push(`+${money(kredit)} kreditu`);
  return casti.join(' · ');
}
