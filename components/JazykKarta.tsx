'use client';

import { useState } from 'react';
import { Icon } from './Icons';
import { JAZYKY, JAZYK_NAZEV, STROJOVY_PREKLAD, type Jazyk } from '@/lib/i18n/config';
import { useJazyk, useT } from '@/lib/i18n/client';

// Seznam jazyků: karta v Nastavení → Vzhled a okno z účtového menu.
//
// Pět řádků s endonymem (Deutsch, Polski), vybraný nese inkoustové kolečko
// s fajfkou, žádná limetka: přepínač se ukládá hned a plnou limetku na
// obrazovce drží jiná akce. Radiová skupina (role="radio", aria-checked),
// aby odečítač řekl „jeden z pěti". Bez znovunačtení stránky: provider dotáhne
// slovníky a přepne stav.

export default function JazykKarta({ onZmena }: { onZmena?: (j: Jazyk) => void }) {
  const t = useT();
  const { jazyk, setJazyk } = useJazyk();
  const [zmeneno, setZmeneno] = useState(false);

  const vyber = async (j: Jazyk) => {
    if (j === jazyk) return;
    await setJazyk(j);
    setZmeneno(true);
    onZmena?.(j);
  };

  return (
    <div className="space-y-3">
      <ul className="list" role="radiogroup" aria-label={t('Jazyk')}>
        {JAZYKY.map(j => {
          const vybrany = j === jazyk;
          return (
            <li key={j} className="contents">
              <button
                type="button"
                role="radio"
                aria-checked={vybrany}
                lang={j}
                onClick={() => vyber(j)}
                className="list-row list-row-tap text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-[15px] leading-snug text-[#16181A] truncate">{JAZYK_NAZEV[j]}</span>
                  <span className="block text-[13px] text-black/55 leading-snug mt-0.5 truncate">
                    {j === 'cs' ? t('Výchozí jazyk aplikace') : STROJOVY_PREKLAD.includes(j) ? t('Strojový překlad') : ''}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`shrink-0 flex h-6 w-6 items-center justify-center rounded-full border ${
                    vybrany ? 'bg-[#16181A] border-[#16181A] text-white' : 'border-black/20 text-transparent'
                  }`}
                >
                  <Icon name="check" size={14} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {jazyk !== 'cs' && STROJOVY_PREKLAD.includes(jazyk) && (
        <p className="note note-info">{t('Tenhle překlad je zatím strojový a může obsahovat chyby.')}</p>
      )}
      <p role="status" aria-live="polite" className="t-meta min-h-[1.25rem]">{zmeneno ? t('Jazyk je nastaven.') : ''}</p>
    </div>
  );
}
