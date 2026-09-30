'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { Icon } from '@/components/Icons';
import { TYPY, type TypPodniku } from '@/lib/pruvodce/typy';
import { FOTKY } from '../foto';
import type { KrokProps } from './spolecne';

// Typ podniku: jedna volba z dlaždic s fotkou. Je to skupina přepínačů
// (role="radiogroup"): šipky přesouvají výběr, mezerník a Enter vybírají,
// tab vstoupí do skupiny jednou (na vybranou, jinak na první dlaždici).
// Vybraná dlaždice má inkoustový obrys a fajfku, ne limetku — na obrazovce
// je jediná limetka, tlačítko „Pokračovat".

export default function Typ({ odp, zmen, chybaPole }: KrokProps) {
  const vybrany = odp.typ;
  const refy = useRef<(HTMLButtonElement | null)[]>([]);
  const vybrat = (t: TypPodniku) => zmen({ typ: t });
  const aktivniIndex = Math.max(0, TYPY.findIndex(t => t.id === vybrany));

  const naKlavesu = (e: React.KeyboardEvent, i: number) => {
    let dalsi = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') dalsi = (i + 1) % TYPY.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') dalsi = (i - 1 + TYPY.length) % TYPY.length;
    else if (e.key === 'Home') dalsi = 0;
    else if (e.key === 'End') dalsi = TYPY.length - 1;
    else return;
    e.preventDefault();
    vybrat(TYPY[dalsi].id);
    refy.current[dalsi]?.focus();
  };

  return (
    <div>
      <div role="radiogroup" aria-label="Typ podniku" aria-describedby={chybaPole?.pole === 'typ' ? 'pv-typ-chyba' : undefined}
        className={`grid grid-cols-2 gap-3 sm:grid-cols-3`}>
        {TYPY.map((t, i) => {
          const on = vybrany === t.id;
          return (
            <button
              key={t.id}
              ref={el => { refy.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={i === aktivniIndex ? 0 : -1}
              data-typ={t.id}
              data-tlumit={vybrany && !on ? 'true' : undefined}
              onClick={() => vybrat(t.id)}
              onKeyDown={e => naKlavesu(e, i)}
              className="pv-dlazdice tap-target"
            >
              <span className="relative block aspect-[4/3] overflow-hidden bg-black/[0.05]">
                {t.foto ? (
                  <Image
                    src={FOTKY[t.foto].src}
                    alt=""
                    width={FOTKY[t.foto].w}
                    height={FOTKY[t.foto].h}
                    sizes="(min-width: 1024px) 200px, 45vw"
                    placeholder="blur"
                    blurDataURL={FOTKY[t.foto].blur}
                    className="pv-dlazdice-foto h-full w-full object-cover"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center text-black/45"><Icon name="sparkle" size={28} /></span>
                )}
                {on && <span className="pv-fajfka" aria-hidden><Icon name="check" size={14} strokeWidth={2.6} /></span>}
              </span>
              <span className="block px-3 pb-3 pt-2.5">
                <span className="t-card block">{t.nazev}</span>
                <span className="t-meta mt-0.5 block text-pretty">{t.veta}</span>
              </span>
            </button>
          );
        })}
      </div>
      {chybaPole?.pole === 'typ' && <p id="pv-typ-chyba" role="alert" className="mt-2 text-xs text-[var(--bad-ink)]">{chybaPole.text}</p>}
    </div>
  );
}
