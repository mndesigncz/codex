'use client';

// Směny celého týmu (náhled bez sazeb, /api/shifts?team=1) pro „S kým mám směnu".
//
// Stejná URL jako widget Kdo má směnu → jedna sdílená mezipaměť, na stránku jeden dotaz.
// API vrací po měsících, proto nejvýš dva měsíce (směny přes přelom měsíce). Počet volání
// hooku je pevný (pravidla hooků), druhý jen dostane null URL, když se měsíce shodují.
import { useMemo } from 'react';
import { useDataWidgetu } from './useDataWidgetu';
import type { SmenaNahledu } from '@/lib/rozvrhPrehled';

function vyber(raw: any): { zapnuto: boolean; smeny: SmenaNahledu[] } {
  if (raw && typeof raw === 'object' && raw.enabled === false) return { zapnuto: false, smeny: [] };
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.shifts)) throw new Error('Rozvrh týmu přišel v nečekaném tvaru.'); // i18n-ok: technická hláška
  return { zapnuto: true, smeny: raw.shifts };
}

/**
 * @param povoleno má člověk `rozvrh.nahled`? Bez něj se nic neptá.
 * @param mesice   měsíce „RRRR-MM", ve kterých hledáme (duplicity a víc než dva se zahodí)
 */
export function useTymSmeny(povoleno: boolean, mesice: readonly string[]) {
  const jedinecne = [...new Set(mesice.filter(Boolean))].slice(0, 2);
  const [m1, m2] = jedinecne;
  const a = useDataWidgetu(povoleno && m1 ? `/api/shifts?team=1&month=${m1}` : null, vyber);
  const b = useDataWidgetu(povoleno && m2 ? `/api/shifts?team=1&month=${m2}` : null, vyber);
  const smeny = useMemo(() => [...(a.data?.smeny ?? []), ...(b.data?.smeny ?? [])], [a.data, b.data]);
  // „Vypnuto" jen když to server řekl; chyba nebo načítání není vypnuto (nic se neukáže, ale ani nelže).
  const zapnuto = povoleno && !!m1 && a.data?.zapnuto !== false;
  const hotovo = !!m1 && !a.loading && !a.error && (!m2 || (!b.loading && !b.error));
  return { smeny, zapnuto, hotovo };
}
