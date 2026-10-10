'use client';

import React, { useMemo, useState } from 'react';
import type { Slot } from '@/lib/obdobi';

// Graf hodnoty v čase: sloupce nebo čára, osa Y s mřížkou, popisky osy X (řídnou podle šířky), tooltip při najetí i při
// fokusu, srovnání s předchozím obdobím (čárkovaně / světlejší sloupek), zvýrazněný slot (dnešek) a klepnutí na slot.
//
// BarSpark je „tvar týdne bez os" pro malé karty; tohle je graf, ze kterého se dají číst čísla — pro velké pohledy
// s volbou období (Finance, Uzávěrky, Docházka). Popisky a mřížka jsou HTML, ne SVG: SVG s `viewBox` se na telefonu
// zmenší a jedenáctipixelový text by měl šest pixelů. Čára je jediné SVG (s `vector-effect`, ať se tloušťka nemění).
// Hodnoty čte odečítač: každý slot je tlačítko (nebo prvek seznamu) s celou větou.

export interface CasovyGrafProps {
  sloty: Slot[];
  /** Předchozí období stejné délky; srovnává se podle pořadí slotů. */
  porovnani?: Slot[] | null;
  druh?: 'sloupce' | 'cara';
  /** Celá hodnota (tooltip, odečítač): „12 400 Kč". */
  format: (n: number) => string;
  /** Krátká hodnota pro osu Y: „12k". */
  kratce?: (n: number) => string;
  /** Název slotu (tooltip, odečítač): „Út 6. 10." / „týden od 5. 10." / „říjen 2026". */
  jmenoSlotu: (s: Slot) => string;
  /** Popisek pod sloupkem; vrátí '' pro slot, který se nemá popisovat. */
  popisekOsy: (s: Slot) => string;
  /** Souhrn pro odečítač („Tržba po dnech, 7. 9. – 6. 10."). */
  label: string;
  vyska?: number;
  /** Klíč slotu, který je zvýrazněný (dnešek). */
  zvyraznit?: string | null;
  /** Klíč vybraného slotu (třeba den, jehož detail je otevřený). */
  vybrany?: string | null;
  onVyber?: (s: Slot) => void;
  /** Text srovnání v tooltipu („minulé období"). */
  popisekPorovnani?: string;
  /** Počty kusů: osa jde po celých číslech (4, 8, 12 …), ne po 1,25. */
  celaCisla?: boolean;
  className?: string;
}

/** „Hezký" strop osy: 1, 2, 2,5, 5 × 10ⁿ. */
export function hezkyStrop(max: number): number {
  if (!(max > 0)) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / exp;
  const nasobek = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nasobek * exp;
}

export function CasovyGraf({
  sloty, porovnani = null, druh = 'sloupce', format, kratce, jmenoSlotu, popisekOsy, label, vyska = 180,
  zvyraznit = null, vybrany = null, onVyber, popisekPorovnani = '', celaCisla = false, className = '',
}: CasovyGrafProps) {
  const [najeto, setNajeto] = useState<number | null>(null);
  const n = sloty.length;
  const max = useMemo(() => Math.max(0, ...sloty.map(s => s.hodnota), ...(porovnani ?? []).map(s => s.hodnota)), [sloty, porovnani]);
  // U počtů je strop násobek čtyř, ať čtyři dílky osy dávají celá čísla (max 9 → 12: 12, 9, 6, 3, 0).
  const strop = celaCisla ? Math.max(4, Math.ceil(max / 4) * 4) : hezkyStrop(max);
  const ticky = [1, 0.75, 0.5, 0.25, 0].map(p => strop * p);
  const kratceF = kratce ?? ((v: number) => String(Math.round(v)));
  // Popisky osy X: nejvýš ~ jeden na 34 px; na telefonu se tak ze 30 dní stane každý třetí.
  const krok = Math.max(1, Math.ceil(n / 9));
  const x = (i: number) => (n <= 1 ? 50 : ((i + 0.5) / n) * 100);
  const y = (v: number) => 100 - (strop > 0 ? (v / strop) * 100 : 0);

  const cara = (s: Slot[]) => s.map((p, i) => `${x(i)},${y(p.hodnota)}`).join(' ');
  const ploha = (s: Slot[]) => (s.length ? `${x(0)},100 ${cara(s)} ${x(s.length - 1)},100` : '');

  const aktivni = najeto != null ? sloty[najeto] : null;
  const srov = najeto != null && porovnani ? porovnani[najeto] : null;

  return (
    <div role="group" aria-label={label} className={`relative ${className}`}>
      <div className="flex gap-2">
        {/* Osa Y */}
        <div aria-hidden className="relative w-9 shrink-0 text-right text-[11px] tabular-nums text-black/45" style={{ height: vyska }}>
          {ticky.map((t, i) => (
            <span key={i} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${(i / (ticky.length - 1)) * 100}%` }}>{kratceF(t)}</span>
          ))}
        </div>
        {/* Plocha */}
        <div className="relative flex-1 min-w-0" style={{ height: vyska }} onMouseLeave={() => setNajeto(null)}>
          {ticky.map((_, i) => (
            <div key={i} aria-hidden className="absolute inset-x-0 border-t border-black/[0.07]" style={{ top: `${(i / (ticky.length - 1)) * 100}%` }} />
          ))}
          {druh === 'cara' && n > 0 && (
            <svg aria-hidden className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polygon points={ploha(sloty)} fill="rgba(200,245,66,0.22)" />
              {porovnani && porovnani.length > 0 && (
                <polyline points={cara(porovnani)} fill="none" stroke="currentColor" className="text-black/35" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
              )}
              <polyline points={cara(sloty)} fill="none" stroke="currentColor" className="text-[#16181A]" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          <div className="absolute inset-0 flex">
            {sloty.map((s, i) => {
              const vb = vybrany === s.klic;
              const vetaSlotu = `${jmenoSlotu(s)}: ${format(s.hodnota)}`;
              const obsah = (
                <>
                  {druh === 'sloupce' && (
                    <>
                      {porovnani?.[i] && porovnani[i].hodnota > 0 && (
                        <span aria-hidden className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[70%] max-w-9 rounded-t border border-dashed border-black/30"
                          style={{ height: `${100 - y(porovnani[i].hodnota)}%` }} />
                      )}
                      <span aria-hidden className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-[62%] max-w-7 rounded-t ${zvyraznit === s.klic || vb ? 'spark-sloupek-hl' : 'spark-sloupek'} ${s.hodnota <= 0 ? 'opacity-60' : ''}`}
                        style={{ height: s.hodnota <= 0 ? 2 : `max(4px, ${100 - y(s.hodnota)}%)` }} />
                    </>
                  )}
                  {druh === 'cara' && (najeto === i || vb || zvyraznit === s.klic) && s.hodnota >= 0 && (
                    <span aria-hidden className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-[#16181A] ring-2 ring-white" style={{ top: `${y(s.hodnota)}%` }} />
                  )}
                </>
              );
              const spolecne = {
                key: s.klic, className: `relative flex-1 min-w-0 h-full ${najeto === i ? 'bg-black/[0.04]' : ''}`,
                onMouseEnter: () => setNajeto(i), onFocus: () => setNajeto(i), onBlur: () => setNajeto(v => (v === i ? null : v)),
              };
              return onVyber
                ? <button type="button" {...spolecne} aria-label={vetaSlotu} aria-pressed={vb} onClick={() => onVyber(s)}
                    className={`${spolecne.className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] rounded-sm`}>{obsah}</button>
                : <div {...spolecne} role="img" aria-label={vetaSlotu}>{obsah}</div>;
            })}
          </div>
          {aktivni && (
            <div role="status" className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl glass-strong border border-black/10 px-3 py-2 text-[12px] leading-snug shadow-lg whitespace-nowrap"
              style={{ left: `clamp(70px, ${x(najeto!)}%, calc(100% - 70px))`, top: -8, transform: 'translate(-50%, -100%)' }}>
              <p className="text-black/55 cz-sentence">{jmenoSlotu(aktivni)}</p>
              <p className="font-semibold tabular-nums text-[#16181A]">{format(aktivni.hodnota)}</p>
              {srov && <p className="text-black/45 tabular-nums">{popisekPorovnani ? `${popisekPorovnani}: ` : ''}{format(srov.hodnota)}</p>}
            </div>
          )}
        </div>
      </div>
      {/* Osa X */}
      <div aria-hidden className="flex gap-2 mt-1">
        <div className="w-9 shrink-0" />
        <div className="flex-1 min-w-0 flex">
          {sloty.map((s, i) => (
            <span key={s.klic} className={`flex-1 min-w-0 text-center text-[11px] leading-snug tabular-nums whitespace-nowrap overflow-visible ${zvyraznit === s.klic ? 'font-semibold text-[#16181A]' : 'text-black/50'}`}>
              {i % krok === 0 || zvyraznit === s.klic ? popisekOsy(s) : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CasovyGraf;
