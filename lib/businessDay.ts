// Ke kterému dni patří příchod?
//
// Zaměstnanec se sobotní směnou v baru chtěl udělat uzávěrku a v návrzích
// viděl jedinou možnost: neděli — den, kdy má podnik zavřeno. Směna, kterou
// mu aplikace založila sama, totiž dostala datum podle hodin na zdi ve chvíli
// klepnutí na „příchod". Klepl po půlnoci, a z jeho sobotního večera se stala
// nedělní směna, kterou nikdo neplánoval a která se nedá uzavřít.
//
// Odchod tohle pravidlo znal („směna patří dni, kdy začala"), příchod ne.
// Tady je to jednou, pro oba — a pro úklid zapomenutých odchodů taky.
//
// Pořadí je od faktu k domněnce, a posouvá se jen DOZADU:
//  1. Včerejší směna (plánovaná i automatická), jejíž okno s tolerancí
//     pokrývá okamžik příchodu → včera. To je přesné, nic se nehádá.
//  2. Podnik měl včera otevřeno přes půlnoc a v okamžiku příchodu ještě
//     nezavřel (s toleranci na úklid) → včera. Fakt z otevírací doby, ne
//     odhad. Právě tohle říká „v neděli máme zavřeno".
//  3. Jinak dnes.
//
// Proč ne prostě „před šestou ráno = včera" (jako u účtenek z pokladny):
// pekař, který přijde ve čtyři, by si tím psal směnu na předchozí den.
// Pravidlo 2 se u pekárny, která zavírá v šest večer, nikdy nespustí.

import { pragueDayOf, dayPlus, pragueMomentOf } from './pragueTime.ts';
import { windowOf, coveredBy, type ShiftRow, type ShiftWindow } from './shiftWindow.ts';
import type { OpeningDay } from './coverage.ts';

export interface DenPrichoduVstup {
  /** Okamžik příchodu (u odchodu: okamžik toho příchodu, který se uzavírá). */
  at: Date;
  /** Směny toho člověka datované včerejškem. */
  smenyVcera?: ShiftRow[];
  /** Otevírací doba podniku pro včerejší den v týdnu. */
  otevrenoVcera?: OpeningDay | null;
}

/** „YYYY-MM-DD" obchodního dne, ke kterému příchod patří. */
export function denPrichodu({ at, smenyVcera = [], otevrenoVcera = null }: DenPrichoduVstup): string {
  const dnes = pragueDayOf(at);
  const vcera = dayPlus(dnes, -1);

  // 1) Včerejší směna, která v tuhle chvíli ještě běží.
  for (const s of smenyVcera) {
    const w = windowOf({ ...s, date: vcera }, vcera);
    if (w && coveredBy(w, at)) return vcera;
  }

  // 2) Včera otevřeno přes půlnoc a teď ještě nezavřeno. Zavírací čas menší
  //    nebo rovný otevíracímu znamená „až zítra" — stejná konvence jako u směn.
  const oh = otevrenoVcera;
  if (oh && !oh.closed && oh.open && oh.close) {
    const start = pragueMomentOf(vcera, String(oh.open));
    const zaviraVcera = pragueMomentOf(vcera, String(oh.close));
    if (start && zaviraVcera && zaviraVcera.getTime() <= start.getTime()) {
      const end = pragueMomentOf(dnes, String(oh.close));
      if (end) {
        const w: ShiftWindow = { start, end, days: [vcera, dnes], overnight: true };
        if (coveredBy(w, at)) return vcera;
      }
    }
  }

  return dnes;
}
