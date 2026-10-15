// Náhled pravidla jednou větou (kolo 91): „Za celý postup 10 b, za nedokončený krok −1 b,
// klíčový −3 b“ / „Za každý splněný krok +1 b, klíčový +2 b“. Věta se skládá tady, ať
// nastavení podniku, okno postupu i okno úkolu mluví stejně.

import type { PrekladFn } from '@/lib/i18n/client';
import type { DruhBodu, Rezim } from '@/lib/bodyRezim';

export interface PravidloKVete {
  rezim: Rezim;
  bonus: boolean;
  zaPolozku: number;
  srazka: number;
  zaklad: number;
}

export function nazevRezimu(t: PrekladFn, r: Rezim | 'podnik'): string {
  if (r === 'podnik') return t('Podle podniku');
  if (r === 'kroky') return t('Za každý krok');
  if (r === 'celek') return t('Za celek');
  return t('Kombinace');
}

export function nazevDruhu(t: PrekladFn, d: DruhBodu): string {
  return d === 'postupy' ? t('Postupy') : d === 'ukoly' ? t('Úkoly') : t('Uzávěrky');
}

export function vetaPravidla(t: PrekladFn, druh: DruhBodu, p: PravidloKVete): string {
  const z = p.zaklad;
  const bonus = p.rezim === 'kroky' && p.bonus ? ` ${t('Za dokončení celku navíc +{z} b.', { z })}` : '';
  if (druh === 'postupy') {
    if (p.rezim === 'kroky') return t('Za každý splněný krok +1 b, klíčový +2 b (vlastní body kroku mají přednost), nesplněný nic neubere.') + bonus;
    if (p.rezim === 'celek') return t('Za celý postup {z} b, za nedokončený krok −1 b, klíčový −3 b.', { z });
    return t('Za dokončený postup {z} b a za úplnost až dalších {z} b; za nedokončený krok −1 b, klíčový −3 b.', { z });
  }
  if (druh === 'ukoly') {
    if (p.rezim === 'kroky') return t('Za každou splněnou položku checklistu +{p} b, nesplněná nic neubere. Úkol bez checklistu: {z} b.', { p: p.zaPolozku, z }) + bonus;
    if (p.rezim === 'celek') return t('Za celý úkol {z} b, za nesplněnou položku checklistu −{s} b.', { z, s: p.srazka });
    return t('Za splněný úkol {z} b, položky checklistu se nepočítají.', { z });
  }
  if (p.rezim === 'kroky') return t('Za každou splněnou povinnou věc dne +{p} b, nesplněná nic neubere.', { p: p.zaPolozku }) + bonus;
  if (p.rezim === 'celek') return t('Za uzávěrku {z} b, za každou nesplněnou povinnou věc dne −{s} b.', { z, s: p.srazka });
  return t('Za uzávěrku {z} b, povinné věci dne se nepočítají.', { z });
}
