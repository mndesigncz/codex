// Krok „Převzít pravidla věrnosti“ v průvodci přechodem z Kartičky (components/client/import/Pravidla.tsx).
// Čisté funkce bez React a databáze: předvyplnění formuláře ze současného profilu, kontrola čísel a sestavení
// těla pro PUT /api/client/admin/profile (jen změněná pole; server zbytek profilu nechá). Meze jsou stejné jako
// v app/api/client/admin/profile/route.ts, ať se chyba ukáže dřív, než ji server tiše ořízne.

export type KlicPravidla = 'stamp_target' | 'stamp_reward' | 'points_per_100' | 'cashback_pct' | 'birthday_points' | 'referral_points';

export interface DefPravidla {
  klic: KlicPravidla;
  popis: string;
  /** Číselné pole má meze, textové (odměna) ne. */
  min?: number;
  max?: number;
}

export const POLE_PRAVIDEL: DefPravidla[] = [
  { klic: 'stamp_target', popis: 'Razítek na kartě', min: 0, max: 50 },
  { klic: 'stamp_reward', popis: 'Odměna za plnou kartu' },
  { klic: 'points_per_100', popis: 'Bodů za 100 {m}', min: 0, max: 100 },
  { klic: 'cashback_pct', popis: 'Cashback v %', min: 0, max: 50 },
  { klic: 'birthday_points', popis: 'Bodů k narozeninám', min: 0, max: 1000 },
  { klic: 'referral_points', popis: 'Bodů za pozvání', min: 0, max: 1000 },
];

export const MAX_ODMENA = 80;

export type FormularPravidel = Record<KlicPravidla, string>;

/** Hodnoty formuláře z profilu; co v profilu chybí, zůstane prázdné (pole se pak nepošle, dokud ho člověk nevyplní). */
export function formularZProfilu(profil: Record<string, unknown> | null | undefined): FormularPravidel {
  const f = {} as FormularPravidel;
  for (const p of POLE_PRAVIDEL) {
    const v = profil?.[p.klic];
    f[p.klic] = v === undefined || v === null ? '' : String(v);
  }
  return f;
}

/** Chyba pole česky, nebo null. Prázdné číselné pole je v pořádku (nic se neodešle). */
export function chybaPravidla(f: FormularPravidel, p: DefPravidla): string | null {
  const t = f[p.klic].trim();
  if (p.klic === 'stamp_reward') {
    if (t.length > MAX_ODMENA) return `Nejvýš ${MAX_ODMENA} znaků.`;
    if (!t && Number(f.stamp_target.trim()) > 0 && /^\d+$/.test(f.stamp_target.trim())) return 'Napiš, co host za plnou kartu dostane.';
    return null;
  }
  if (t === '') return null;
  if (!/^\d+$/.test(t)) return 'Zadej celé číslo.';
  const n = Number(t);
  if (n < (p.min ?? 0) || n > (p.max ?? Infinity)) return `Povoleno ${p.min} až ${p.max}.`;
  return null;
}

export const maChybuPravidel = (f: FormularPravidel): boolean => POLE_PRAVIDEL.some(p => chybaPravidla(f, p));

/** Tělo PUT: jen pole, která se liší od profilu. Číselná pole jako čísla, odměna jako text. */
export function telaZmen(f: FormularPravidel, profil: Record<string, unknown> | null | undefined): Record<string, string | number> {
  const puvodni = formularZProfilu(profil);
  const telo: Record<string, string | number> = {};
  for (const p of POLE_PRAVIDEL) {
    const nova = f[p.klic].trim();
    if (nova === puvodni[p.klic].trim()) continue;
    if (p.klic === 'stamp_reward') { telo[p.klic] = nova; continue; }
    if (nova === '') continue;
    telo[p.klic] = Number(nova);
  }
  return telo;
}

/** Odkazy „Co přenést ručně“: kam v administraci co patří a jaké oprávnění to chce. */
export const RUCNI_PRENOS: { id: string; nazev: string; popis: string; pohled: string; cast?: string; klice: readonly string[] }[] = [
  { id: 'bannery', nazev: 'Bannery', popis: 'Obrázky a akce na stránce pro hosty.', pohled: 'klient:brand', klice: ['klient.vzhled'] },
  { id: 'kupony', nazev: 'Kupony a promo kódy', popis: 'Slevy, kódy na leták nebo účtenku.', pohled: 'klient:loyalty', cast: 'coupons', klice: ['kupony.spravovat'] },
  { id: 'poukazy', nazev: 'Dárkové poukazy', popis: 'Vydané poukazy a jejich zůstatky.', pohled: 'klient:loyalty', cast: 'vouchers', klice: ['poukazy.zobrazit'] },
  { id: 'razitka', nazev: 'Další razítkové karty', popis: 'Karty za vybrané položky nebo za útratu.', pohled: 'klient:loyalty', cast: 'stamps', klice: ['vernost.zobrazit'] },
  { id: 'urovne', nazev: 'Úrovně a slevy podle úrovně', popis: 'Stříbrná, zlatá, platinová a jejich výhody.', pohled: 'klient:loyalty', cast: 'points', klice: ['vernost.zobrazit'] },
];
