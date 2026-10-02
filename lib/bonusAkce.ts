// Bonusové akce věrnostního programu („Happy hour", dvojnásobné body v úterý):
// čistá logika bez databáze. Pravidlo násobí body z útraty a případně přidá
// razítka navíc. Platí podle dne v týdnu, hodin (pražský čas) a data.
//
// Víc pravidel najednou se nesčítá: bere se nejvyšší násobič a nejvyšší bonus
// razítek, ať host nedostane nečekaně hodně. Bonus se uplatní uvnitř téhož
// připsání (jeden řádek deníku s poznámkou), nikdy jako druhé připsání navíc.

import { pragueDayOf, pragueHM } from './pragueTime.ts';
import { czCount, type CzNoun } from './czech.ts';

export const MAX_NASOBIC = 10;
export const MAX_BONUS_RAZITEK = 10;

export interface BonusPravidlo {
  id: number;
  name: string;
  multiplier: number;
  stampBonus: number;
  /** 1 = pondělí … 7 = neděle; prázdné = každý den. */
  days: number[];
  hourFrom: number;
  hourTill: number;
  validSince: string | null;
  validTill: string | null;
  active: boolean;
}

export type VstupPravidla = Omit<BonusPravidlo, 'id'>;

const DEN_RE = /^\d{4}-\d{2}-\d{2}$/;

function cele(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && Math.floor(n) === n ? n : null;
}

/** Zkontroluje vstup z formuláře. Nic nekončí NaN: neplatné číslo je chyba, ne nula. */
export function normalizujPravidlo(raw: any): { ok: true; value: VstupPravidla } | { ok: false; error: string } {
  const name = String(raw?.name ?? '').trim().slice(0, 80);
  if (!name) return { ok: false, error: 'Zadej název akce.' };

  const m = Number(String(raw?.multiplier ?? '1').replace(',', '.'));
  if (!Number.isFinite(m) || m < 1 || m > MAX_NASOBIC) return { ok: false, error: `Násobič bodů musí být mezi 1 a ${MAX_NASOBIC}.` };
  const multiplier = Math.round(m * 100) / 100;

  const sb = raw?.stampBonus === '' || raw?.stampBonus == null ? 0 : cele(raw.stampBonus);
  if (sb == null || sb < 0 || sb > MAX_BONUS_RAZITEK) return { ok: false, error: `Razítek navíc může být 0 až ${MAX_BONUS_RAZITEK}.` };
  if (multiplier <= 1 && sb <= 0) return { ok: false, error: 'Akce musí něco přidávat: násobič nad 1, nebo razítka navíc.' };

  const days: number[] = [];
  for (const d of Array.isArray(raw?.days) ? raw.days : []) {
    const n = cele(d);
    if (n == null || n < 1 || n > 7) return { ok: false, error: 'Neplatný den v týdnu.' };
    if (!days.includes(n)) days.push(n);
  }
  days.sort((a, b) => a - b);

  const hf = raw?.hourFrom === '' || raw?.hourFrom == null ? 0 : cele(raw.hourFrom);
  const ht = raw?.hourTill === '' || raw?.hourTill == null ? 24 : cele(raw.hourTill);
  if (hf == null || ht == null || hf < 0 || hf > 24 || ht < 0 || ht > 24) return { ok: false, error: 'Hodiny musí být celá čísla od 0 do 24.' };
  if (hf >= ht) return { ok: false, error: 'Konec akce musí být později než začátek. Celý den je 0 až 24.' };

  const vs = String(raw?.validSince ?? '').slice(0, 10);
  const vt = String(raw?.validTill ?? '').slice(0, 10);
  if ((vs && !DEN_RE.test(vs)) || (vt && !DEN_RE.test(vt))) return { ok: false, error: 'Neplatné datum.' };
  if (vs && vt && vs > vt) return { ok: false, error: 'Akce nemůže skončit dřív, než začne.' };

  return { ok: true, value: { name, multiplier, stampBonus: sb, days, hourFrom: hf, hourTill: ht, validSince: vs || null, validTill: vt || null, active: raw?.active !== false } };
}

/** Řádek z databáze → pravidlo. Poškozená hodnota nikdy nedá NaN. */
export function tvarPravidla(r: any): BonusPravidlo {
  const m = Number(r?.multiplier);
  const sb = Math.trunc(Number(r?.stamp_bonus));
  const hf = Math.trunc(Number(r?.hour_from));
  const ht = Math.trunc(Number(r?.hour_till));
  const days = (Array.isArray(r?.days_of_week) ? r.days_of_week : []).map((x: any) => Math.trunc(Number(x))).filter((x: number) => x >= 1 && x <= 7);
  return {
    id: Number(r?.id) || 0,
    name: String(r?.name ?? ''),
    multiplier: Number.isFinite(m) && m >= 1 ? Math.min(MAX_NASOBIC, m) : 1,
    stampBonus: Number.isFinite(sb) && sb > 0 ? Math.min(MAX_BONUS_RAZITEK, sb) : 0,
    days,
    hourFrom: Number.isFinite(hf) && hf >= 0 && hf <= 24 ? hf : 0,
    hourTill: Number.isFinite(ht) && ht >= 0 && ht <= 24 ? ht : 24,
    validSince: r?.valid_since ? String(r.valid_since).slice(0, 10) : null,
    validTill: r?.valid_till ? String(r.valid_till).slice(0, 10) : null,
    active: r?.active !== false,
  };
}

/** Pražské „teď": den, den v týdnu (1 = pondělí) a minuty od půlnoci. */
export interface PrazskeTed { day: string; dow: number; minuty: number }

export function prazskeTed(at: Date = new Date()): PrazskeTed {
  const day = pragueDayOf(at);
  const d = new Date(`${day}T12:00:00Z`);
  const [h, m] = pragueHM(at).split(':').map(Number);
  return { day, dow: ((d.getUTCDay() + 6) % 7) + 1, minuty: (h % 24) * 60 + (m || 0) };
}

/** Platí pravidlo právě teď? Konec hodiny je výlučný: akce do 18 už v 18:00 neplatí. */
export function platiTed(r: BonusPravidlo, ted: PrazskeTed): boolean {
  if (!r.active) return false;
  if (r.validSince && ted.day < r.validSince) return false;
  if (r.validTill && ted.day > r.validTill) return false;
  if (r.days.length && !r.days.includes(ted.dow)) return false;
  return ted.minuty >= r.hourFrom * 60 && ted.minuty < r.hourTill * 60;
}

export interface Bonus {
  nasobic: number;
  razitka: number;
  /** Pravidla, která teď platí (nejlepší první). */
  pravidla: BonusPravidlo[];
  /** Název vítězné akce do poznámky v deníku. */
  nazev: string;
}

export const ZADNY_BONUS: Bonus = { nasobic: 1, razitka: 0, pravidla: [], nazev: '' };

/** Z pravidel, která platí teď, složí bonus: nejvyšší násobič, nejvyšší razítka navíc. */
export function vyberBonus(pravidla: BonusPravidlo[], ted: PrazskeTed): Bonus {
  const plati = pravidla.filter(r => platiTed(r, ted))
    .sort((a, b) => b.multiplier - a.multiplier || b.stampBonus - a.stampBonus || a.id - b.id);
  if (!plati.length) return ZADNY_BONUS;
  return {
    nasobic: Math.max(...plati.map(r => r.multiplier)),
    razitka: Math.max(...plati.map(r => r.stampBonus)),
    pravidla: plati,
    nazev: plati[0].name,
  };
}

/** Do které celé hodiny dnes akce platí; null, když běží do půlnoci nebo žádná neběží. */
export function dokdyDnes(b: Bonus): number | null {
  if (!b.pravidla.length) return null;
  const konec = Math.max(...b.pravidla.map(r => r.hourTill));
  return konec >= 24 ? null : konec;
}

/** Násobič slovy do poznámky v deníku: „dvojnásobné body", „1,5× body". */
export function popisNasobice(m: number): string {
  if (m === 2) return 'dvojnásobné body';
  if (m === 3) return 'trojnásobné body';
  return `${String(Math.round(m * 100) / 100).replace('.', ',')}× body`;
}

const RAZITKO_NAVIC: CzNoun = { one: 'razítko navíc', few: 'razítka navíc', many: 'razítek navíc' };

/** Body po bonusu (zaokrouhleně, nikdy míň než základ) a poznámka do deníku. */
export function bodySBonusem(zaklad: number, b: Bonus): { body: number; poznamka: string } {
  const z = Math.max(0, Math.trunc(Number(zaklad)) || 0);
  if (z <= 0 || b.nasobic <= 1) return { body: z, poznamka: '' };
  return { body: Math.max(z, Math.round(z * b.nasobic)), poznamka: ` — ${popisNasobice(b.nasobic)} (${b.nazev})` };
}

/** Poznámka k razítkům navíc: prázdná, když bonus razítka nedává. */
export function poznamkaRazitek(b: Bonus): string {
  return b.razitka > 0 ? ` — ${czCount(b.razitka, RAZITKO_NAVIC)} (${b.nazev})` : '';
}
