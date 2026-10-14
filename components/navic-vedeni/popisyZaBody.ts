'use client';

// Texty „Úkolů za body" pro vedení (kolo 11, balík V): opakování česky („Každý den",
// „Po, St, Pá", „Každé 3 dny"), obsazenost („1 z 2 volné", „Kdokoli") a věta náhledu
// v okně („Po, St · 1 člověk · +20 b · uzná se samo"). Překlad přes t() ze sekce widgety
// (soubor dostane překladovou funkci z komponenty), dny v týdnu z Intl podle jazyka.
// Sekce slovníku je stejná jako u oken navíc: useT('widgety') (check-i18n podle toho řadí klíče tohohle souboru).

import type { NabidkaNavic, UkolNavic } from '@/lib/navic';
import type { PrekladFn } from '@/lib/i18n/client';
import { fmtDatum, fmtDenVTydnu } from '@/lib/i18n/format';
import { volnaMista, type FormularZaBody } from './zaBody';

/** „Po" … „Ne" (1 = pondělí) v jazyce aplikace, s velkým písmenem. */
export function denKratce(t: PrekladFn, den: number): string {
  const s = fmtDenVTydnu(den - 1, { jazyk: t.jazyk, styl: 'kratky' }).replace(/\.$/, '');
  return s.charAt(0).toLocaleUpperCase() + s.slice(1);
}

/** Opakování pro lidi: „Kdykoli", „Jednorázově", „Každý den", „Po, St, Pá", „Jednou týdně", „Jednou měsíčně", „Každé 3 dny". */
export function textOpakovani(t: PrekladFn, n: Pick<NabidkaNavic, 'recurrence' | 'recDays' | 'recInterval'>): string {
  switch (n.recurrence) {
    case 'jednou': return t('Jednorázově');
    case 'denne': return t('Každý den');
    case 'tydne': return t('Jednou týdně');
    case 'mesicne': return t('Jednou měsíčně');
    case 'interval': return t('{n, plural, one {Každý # den} few {Každé # dny} other {Každých # dní}}', { n: n.recInterval ?? 0 });
    case 'dny': {
      const dny = [...n.recDays].sort((a, b) => a - b);
      if (dny.length === 7) return t('Každý den');
      if (dny.length === 0) return t('Vybrané dny');
      return dny.map(d => denKratce(t, d)).join(', ');
    }
    default: return t('Kdykoli');
  }
}

/** Kolik lidí v termínu: „1 člověk" / „3 lidé" / „Kdokoli". */
export function textKapacity(t: PrekladFn, kapacita: number | null): string {
  return kapacita == null ? t('Kdokoli') : t('{n, plural, one {# člověk} few {# lidé} other {# lidí}}', { n: kapacita });
}

/** Obsazenost dnes: „1 z 2 volné", „Obsazeno", „Kdokoli". */
export function textVolna(t: PrekladFn, u: UkolNavic): { text: string; plno: boolean } {
  const volno = volnaMista(u);
  if (volno == null) return { text: t('Kdokoli'), plno: false };
  if (volno === 0) return { text: t('Obsazeno'), plno: true };
  return { text: t('{volno} z {celkem} volné', { volno, celkem: u.nabidka.capacity ?? 0 }), plno: false };
}

/** Platnost „12. 10.–31. 12.", „od 12. 10.", „do 31. 12." — nebo null. */
export function textPlatnosti(t: PrekladFn, od: string | null, doDne: string | null): string | null {
  const f = (d: string) => fmtDatum(d, { jazyk: t.jazyk, styl: 'kratce' });
  if (od && doDne) return t('{od}–{do}', { od: f(od), do: f(doDne) });
  if (od) return t('od {od}', { od: f(od) });
  if (doDne) return t('do {do}', { do: f(doDne) });
  return null;
}

/** Meta řádku úkolu (jeden řádek, zkracuje se): „Každý den · +20 b · 150 Kč". */
export function metaUkolu(t: PrekladFn, n: NabidkaNavic, money: (x: number) => string): string {
  return [textOpakovani(t, n), `+${n.points} b`, n.bonusCzk ? money(n.bonusCzk) : null].filter(Boolean).join(' · ');
}

/** Podrobnosti úkolu (zalamují se): „1 člověk · každý až 2× · jen 2 lidem · uzná se samo · s fotkou · od 12. 10.". */
export function podrobnostiUkolu(t: PrekladFn, n: NabidkaNavic, jmena?: ReadonlyMap<number, string>): string {
  return [
    textKapacity(t, n.capacity),
    n.maxPerDay != null && n.maxPerDay > 1 ? t('každý až {n}×', { n: n.maxPerDay }) : null,
    n.targetUsers.length ? textKomu(t, n.targetUsers, jmena) : null,
    n.autoApprove ? t('uzná se samo') : null,
    n.requirePhoto ? t('s fotkou') : null,
    textPlatnosti(t, n.validFrom, n.validTo),
  ].filter(Boolean).join(' · ');
}

/** Komu je úkol určený: „jen Eva, Jakub" (do tří známých jmen), jinak „jen 5 lidem". */
export function textKomu(t: PrekladFn, komu: readonly number[], jmena?: ReadonlyMap<number, string>): string {
  const znama = jmena ? komu.map(id => jmena.get(id)).filter((x): x is string => !!x) : [];
  if (znama.length === komu.length && komu.length <= 3) return t('jen {komu}', { komu: znama.map(j => j.split(' ')[0]).join(', ') });
  return t('{n, plural, one {jen # člověku} few {jen # lidem} other {jen # lidem}}', { n: komu.length });
}

/** Věta náhledu dole v okně — z rozepsaného formuláře, ať je vidět, co lidé uvidí. */
export function vetaNahledu(t: PrekladFn, f: FormularZaBody, money: (x: number) => string): string {
  const interval = Number(f.interval);
  const kapacita = f.kapacita.trim() === '' ? null : Number(f.kapacita);
  const limit = f.limit.trim() === '' ? null : Number(f.limit);
  const body = Number(f.body) || 0;
  const premie = Number(f.premie) || 0;
  return [
    textOpakovani(t, { recurrence: f.opakovani, recDays: f.dny, recInterval: Number.isFinite(interval) ? interval : 0 }),
    textKapacity(t, kapacita != null && Number.isFinite(kapacita) ? kapacita : null),
    limit != null && limit > 1 ? t('každý až {n}×', { n: limit }) : null,
    `+${body} b`,
    premie > 0 ? money(premie) : null,
    f.jenVybranym && f.komu.length ? t('{n, plural, one {jen # člověku} few {jen # lidem} other {jen # lidem}}', { n: f.komu.length }) : null,
    f.fotka ? t('s fotkou') : null,
    f.auto ? t('uzná se samo') : null,
    textPlatnosti(t, f.od || null, f.do || null),
  ].filter(Boolean).join(' · ');
}
