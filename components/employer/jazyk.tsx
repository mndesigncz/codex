'use client';

import type { ReactNode } from 'react';
import { useJazyk } from '@/lib/i18n/client';
import { LOCALE_PRO_JAZYK } from '@/lib/i18n/config';

/** Locale jazyka, kterým člověk čte (čísla a data v seznamech), místo natvrdo psaného 'cs-CZ'. */
export function useLocale(): string {
  const { jazyk } = useJazyk();
  return LOCALE_PRO_JAZYK[jazyk];
}

/** Zástupný znak, který se v přeložené větě nahradí uzlem (tučné jméno, částka): větu s jedním zástupným parametrem, např. „Role {x} zmizí.“ s `{ x: VLOZ }`. */
export const VLOZ = '\u0000';

/** Větu s jedním `VLOZ` rozdělí a doprostřed dá uzel; překlad přitom zůstává jedna věta, ne kousky. */
export function sUzlem(veta: string, uzel: ReactNode): ReactNode {
  const i = veta.indexOf(VLOZ);
  if (i < 0) return veta;
  return <>{veta.slice(0, i)}{uzel}{veta.slice(i + 1)}</>;
}
