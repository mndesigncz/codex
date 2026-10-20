// Osa textu v seznamu s úvodním prvkem (skladba v4, V4, P12) — sdílené pro widgety všech oblastí.
//
// ListRow na telefonu (≤ 640 px) odlomí ocas řádku (chip stavu, odměna, akce) na druhý řádek, který
// začíná na levé hraně řádku — tedy POD avatarem nebo zaškrtávátkem, ne pod textem. Stavový řádek pak
// nelícuje s titulkem a meta nad ním. Dokud to ListRow neumí sám (poznámka pro systém), drží to obal
// seznamu: ocas řádku s úvodním prvkem dostane levý okraj = šířka úvodního prvku + mezera řádku (14),
// a pár akcí v ocasu je ½ + ½ přes šířku textu.
//
// Použití: <ul className={`list ${OSA_TEXTU}`} style={osaTextu(OSA_AVATAR)}> nebo na obalu seznamu.

import type { CSSProperties } from 'react';

export const OSA_TEXTU = [
  'max-sm:[&_.list-row>.shrink-0:first-child~.list-tail]:ml-[var(--osa-textu,2.875rem)]',
  'max-sm:[&_.list-tail>.list-actions:has(>:nth-child(2))]:grid',
  'max-sm:[&_.list-tail>.list-actions:has(>:nth-child(2))]:grid-cols-2',
  'max-sm:[&_.list-tail>.list-actions:has(>:nth-child(2))]:basis-full',
  'max-sm:[&_.list-tail>.list-actions:has(>:nth-child(2))]:gap-2',
  // Pár rozhodovacích tlačítek pod textem řádku (TrestRadek: Trest platí dál / Zrušit trest): ½ + ½, ne dvě pilulky.
  '[&_.list-row_span.flex-wrap:has(>button:nth-child(2)):not(:has(>:nth-child(3)))]:grid',
  '[&_.list-row_span.flex-wrap:has(>button:nth-child(2)):not(:has(>:nth-child(3)))]:grid-cols-2',
].join(' ');

/** Avatar sm (32) + mezera řádku (14). */
export const OSA_AVATAR = '2.875rem';
/** Zaškrtávátko úkolu (24) + mezera řádku (14). */
export const OSA_ZASKRTNUTI = '2.375rem';
/** Jamka s ikonou (36) + mezera řádku (14). */
export const OSA_JAMKA = '3.125rem';

export const osaTextu = (sirka: string): CSSProperties => ({ ['--osa-textu' as string]: sirka });
