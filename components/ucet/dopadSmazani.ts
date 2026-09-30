// Věta o dopadu smazání účtu vlastníka podniku. Server posílá českou větu s názvy podniků
// uvnitř; tady se složí znovu z názvů a přeloží, ať vlastník v cizím jazyce nečte češtinu.
// Bez seznamu podniků (starší odpověď) zůstane věta, jak přišla.
//
// Překlady jsou ve slovníku useT('spolecne') (stejně jako komponenty, které funkci volají);
// kontrola scripts/check-i18n.mjs podle toho řadí věty do sekce.

import type { PrekladFn } from '@/lib/i18n/client';

export interface VlastnenyPodnik { id?: number; nazev: string; dalsiClenove?: number }

export function vetaDopadu(t: PrekladFn, kod: string, vlastnene: VlastnenyPodnik[] | undefined, zpravaServeru: string): string {
  if (!Array.isArray(vlastnene) || vlastnene.length === 0) return zpravaServeru;
  const [o, z] = t.jazyk === 'en' ? ['\u201C', '\u201D'] : ['\u201E', '\u201C'];
  const jmena = (seznam: VlastnenyPodnik[]) => seznam.map(p => `${o}${p.nazev}${z}`).join(', ');
  if (kod === 'VLASTNIK_S_CLENY') {
    return t('V podniku {podniky} jsou další lidé. Nejdřív předejte vedení, nebo smažte celý podnik i s účtem.', { podniky: jmena(vlastnene.filter(p => (p.dalsiClenove ?? 0) > 0)) });
  }
  return t('Smazáním účtu zanikne i podnik {podniky} a všechna jeho data. Potvrďte, že ho chcete smazat.', { podniky: jmena(vlastnene) });
}
