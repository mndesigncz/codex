import React from 'react';

// Sloupky bez os — tvar týdne nebo měsíce na jeden pohled (TO GO, Věrnost,
// tržby po dnech). Tři obrazovky si je kreslily samy, každá jinou barvou
// a jinou minimální výškou; nula jednou zmizela, podruhé měla stejný pahýl
// jako malé číslo.
//
// Pravidla:
// - Sloupek roste z jedné základny, nahoře zaoblený 4 px, dole rovný, nejvýš
//   24 px široký — v širokém widgetu jinak slévá do plochy.
// - Kontext je tlumený, zvýrazněný sloupek (dnes) plný. Barvy jsou třídy
//   `.spark-sloupek*` v globals.css, protože potřebují vlastní tmavý režim.
// - Nula je dvoupixelová čárka na základně (den existuje, prodalo se nic),
//   kladné číslo má aspoň 4 px, ať se malá hodnota neztratí. `null` = den bez
//   dat (třeba budoucí) — místo zůstane prázdné.
// - Hodnoty čte odečítač ze skrytého seznamu; sloupky jsou jen obrázek.

export interface BarSparkPoint {
  /** `null` = bez dat (budoucí den) — místo zůstane prázdné. */
  value: number | null;
  /** Popisek pod sloupkem (Po, Út…), ukáže se s `showLabels`. */
  label?: string;
  /** Celá věta pro odečítač a tooltip, např. „Út 16. 9.: 12 400 Kč". */
  tip?: string;
}

/**
 * Malý sloupcový graf bez os pro řadu dní nebo hodin, kde jde o tvar, ne
 * o přesná čísla (ta ukáže `Stat` vedle nebo tooltip). `highlight` = index
 * zvýrazněného sloupku (dnešek). Na inkoustové ploše (DP §2.10) dej
 * `surface="ink"`. `label` je shrnutí pro odečítač („Tržby za 7 dní").
 */
export function BarSpark({ data, label, highlight, height = 48, surface = 'card', showLabels = false, className = '' }: {
  data: BarSparkPoint[];
  label: string;
  highlight?: number;
  /** Výška plochy sloupků v px (bez popisků). */
  height?: number;
  surface?: 'card' | 'ink';
  showLabels?: boolean;
  className?: string;
}) {
  const max = data.reduce((m, d) => Math.max(m, d.value ?? 0), 0);
  const ink = surface === 'ink';
  return (
    <div role="group" aria-label={label} className={`${ink ? 'spark-inkoust' : ''} ${className}`}>
      <ul className="sr-only">
        {data.map((d, i) => (
          <li key={i}>{d.tip ?? `${d.label ? `${d.label}: ` : ''}${d.value == null ? 'bez dat' : d.value.toLocaleString('cs-CZ')}`}</li>
        ))}
      </ul>
      <div aria-hidden className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((d, i) => {
          const v = Math.max(0, d.value ?? 0);
          const h = d.value == null ? 0 : v === 0 || max === 0 ? 2 : Math.max(4, Math.round((v / max) * height));
          return (
            // Sloupek zabírá celou výšku slotu, aby tooltip chytil i nízký
            // den — trefovat se myší do dvoupixelové čárky nejde.
            <div key={i} title={d.tip} className="flex-1 min-w-0 h-full flex items-end justify-center">
              {d.value != null && (
                <span className={`block w-full max-w-6 rounded-t ${i === highlight ? 'spark-sloupek-hl' : 'spark-sloupek'} ${v === 0 ? 'opacity-60' : ''}`}
                  style={{ height: h }} />
              )}
            </div>
          );
        })}
      </div>
      {showLabels && (
        <div aria-hidden className="mt-1 flex gap-[3px]">
          {data.map((d, i) => (
            // Řádkování ne pod 1,375: `truncate` ořezává přetečení a s těsným
            // řádkem uřízlo čárku a háček nad velkým písmenem — „Út" a „Čt"
            // se četly jako „Ut" a „Ct".
            <span key={i} className={`flex-1 min-w-0 text-center text-[11px] leading-snug tabular-nums truncate ${
              i === highlight
                ? `font-semibold ${ink ? 'text-white' : 'text-[#16181A]'}`
                : ink ? 'text-white/55' : 'text-black/55'}`}>
              {d.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default BarSpark;
