// Storno poslední akce u kasy: čistá část (bez databáze, jde testovat v `npm test`).
//
// Obsluha se přepíše (částka s nulou navíc, špatný host) a potřebuje akci vrátit hned, ne přes správce.
// Vrátit jde to, co se dá vrátit přesně: body z částky (včetně cashbacku a zapsané útraty) a platba kreditem.
// Razítka mají vlastní storno v detailu člena, účtenka se z pokladny vrátit nedá. Storno platí krátce
// (STORNO_MINUT) a jen pro poslední akci hosta, ať se nedá zpětně přepisovat historie.

import { czCount, type CzNoun } from './czech.ts';

export const STORNO_MINUT = 15;
/** Akce, které jde u kasy stornovat. */
export const STORNOVATELNE = ['points', 'credit'] as const;

const BOD: CzNoun = { one: 'bod', few: 'body', many: 'bodů' };

/** Které oprávnění potřebuje storno dané akce: stejné jako akce sama (kdo smí body připsat, smí je vrátit). */
export const OPRAVNENI_STORNA: Record<string, string> = { points: 'vernost.body_z_castky', credit: 'vernost.platba_kreditem' };

/** Částka z otisku akce (`points|1250||`); bez čísla nebo se zápornou hodnotou 0. */
export function castkaZOtisku(otisk: unknown): number {
  const n = Math.round(Number(String(otisk ?? '').split('|')[1]));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export type DuvodNeniStorna = 'zadna' | 'jina_akce' | 'nic_k_vraceni';

/** Co obsluze říct, když stornovat nejde. */
export function vetaNeniStorna(duvod: DuvodNeniStorna, akce?: string): string {
  switch (duvod) {
    case 'zadna': return `Není co stornovat: za posledních ${STORNO_MINUT} minut tu s hostem nic neproběhlo.`;
    case 'jina_akce': return akce === 'stamp' || akce === 'bill'
      ? 'Poslední akce byla razítko nebo účtenka. Razítka vrátíš v detailu člena (Věrnost → Členové), účtenka se vrátit nedá.'
      : 'Tuhle akci nejde stornovat.';
    case 'nic_k_vraceni': return 'Tahle akce nepřipsala body ani kredit, není co vracet.';
  }
}

/** Věta o výsledku. `vraceno` je skutečná změna (host mohl body mezitím utratit), `puvodne` to, co akce připsala. */
export function vetaStorna(jmeno: string, v: { bodyVraceno: number; bodyPuvodne: number; kreditVraceno: number; kreditPuvodne: number; utrata: number }, money: (n: number) => string): string {
  const casti: string[] = [];
  if (v.bodyPuvodne > 0) {
    casti.push(v.bodyVraceno === v.bodyPuvodne ? `−${czCount(v.bodyVraceno, BOD)}` : `vráceno ${v.bodyVraceno} z ${czCount(v.bodyPuvodne, BOD)} (zbytek host už utratil)`);
  }
  if (v.kreditPuvodne !== 0) {
    const zpet = v.kreditPuvodne < 0;
    casti.push(zpet ? `kredit vrácen: +${money(Math.abs(v.kreditVraceno))}` : v.kreditVraceno === v.kreditPuvodne ? `kredit −${money(v.kreditVraceno)}` : `kredit vrácen ${money(v.kreditVraceno)} z ${money(v.kreditPuvodne)}`);
  }
  if (v.utrata > 0) casti.push(`útrata snížena o ${money(v.utrata)}`);
  return `${jmeno}: storno poslední akce${casti.length ? `, ${casti.join(', ')}` : ''}.`;
}

/** Číslo účtenky zadané ručně (bez pokladny): písmena, číslice, tečka, pomlčka, lomítko; 1 až 40 znaků. Prázdné = null (nepovinné). */
export function cisloUctenky(raw: unknown): { ok: true; cislo: string | null } | { ok: false; chyba: string } {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: true, cislo: null };
  if (!/^[A-Za-z0-9._/-]{1,40}$/.test(s)) return { ok: false, chyba: 'Číslo účtenky smí mít jen písmena, číslice, tečku, pomlčku a lomítko (nejvýš 40 znaků).' };
  return { ok: true, cislo: s.toUpperCase() };
}

/** Klíč strážce účtenky: ručně zadané číslo se nesmí srazit s ID účtu z pokladny, proto předpona. */
export const klicRucniUctenky = (cislo: string) => `manual:${cislo}`;
