'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { Icon } from '@/components/Icons';
import { useT } from '@/lib/i18n/client';
import { TYPY, type TypPodniku } from '@/lib/pruvodce/typy';
import { FOTKY } from '../foto';
import type { KrokProps } from './spolecne';

// Typ podniku: jedna volba z dlaždic s fotkou. Je to skupina přepínačů
// (role="radiogroup"): šipky přesouvají výběr, mezerník a Enter vybírají,
// tab vstoupí do skupiny jednou (na vybranou, jinak na první dlaždici).
// Vybraná dlaždice má inkoustový obrys a fajfku, ne limetku — na obrazovce
// je jediná limetka, tlačítko „Pokračovat". „Jiný podnik" nemá fotku a je
// jako jediný na celou šířku řady, ať v mřížce nezůstane osamocená dlaždice.

export default function Typ({ odp, zmen, chybaPole }: KrokProps) {
  const t = useT('pruvodce');
  const vybrany = odp.typ;
  const refy = useRef<(HTMLButtonElement | null)[]>([]);
  const vybrat = (typ: TypPodniku) => zmen({ typ });
  const aktivniIndex = Math.max(0, TYPY.findIndex(x => x.id === vybrany));

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
      <div role="radiogroup" aria-label={t('Typ podniku')} aria-describedby={chybaPole?.pole === 'typ' ? 'pv-typ-chyba' : undefined}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TYPY.map((d, i) => {
          const on = vybrany === d.id;
          const foto = d.foto ? FOTKY[d.foto] : null;
          return (
            <button
              key={d.id}
              ref={el => { refy.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={i === aktivniIndex ? 0 : -1}
              data-typ={d.id}
              data-tlumit={vybrany && !on ? 'true' : undefined}
              onClick={() => vybrat(d.id)}
              onKeyDown={e => naKlavesu(e, i)}
              className={`pv-dlazdice tap-target ${foto ? '' : 'col-span-2 flex items-center gap-3 p-3 sm:col-span-3'}`}
            >
              {foto ? (
                <span className="relative block aspect-[4/3] overflow-hidden bg-black/[0.05]">
                  <Image
                    src={foto.src}
                    alt=""
                    width={foto.w}
                    height={foto.h}
                    sizes="(min-width: 1024px) 200px, 45vw"
                    placeholder="blur"
                    blurDataURL={foto.blur}
                    className="pv-dlazdice-foto h-full w-full object-cover"
                  />
                </span>
              ) : (
                <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/[0.05] text-[#16181A]"><Icon name="sparkle" size={20} /></span>
              )}
              <span className={`block min-w-0 ${foto ? 'px-3 pb-3 pt-2.5' : 'flex-1'}`}>
                <span className="t-card block">{t(d.nazev)}</span>
                <span className="t-meta mt-0.5 block text-pretty">{t(d.veta)}</span>
              </span>
              {on && <span className="pv-fajfka" aria-hidden><Icon name="check" size={14} strokeWidth={2.6} /></span>}
            </button>
          );
        })}
      </div>
      {chybaPole?.pole === 'typ' && <p id="pv-typ-chyba" role="alert" className="mt-2 text-xs text-[var(--bad-ink)]">{chybaPole.text}</p>}
    </div>
  );
}
