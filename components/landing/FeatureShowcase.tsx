'use client';

// Funkce se nevypisují, předvádějí se.
//
// Dřív tu byla bento mřížka dvanácti karet: ikona, nadpis, věta. Kdo na
// stránku přišel poprvé, dozvěděl se, že aplikace „umí sklad" — ne jak to
// vypadá, když ho používá. Tady si funkci vybere a vedle ní se přehraje
// scéna, která tu funkci provede od začátku do konce.
//
// Dokud návštěvník nesáhne na výběr, scény se střídají samy — první dojem
// má být pohyb, ne prázdný panel čekající na kliknutí. Jakmile si vybere,
// přepínání se zastaví a dál to řídí on: vzít člověku ovládání zpátky je
// horší než mu ho nedat.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icons';
import { Scena, type ScenaId } from './FeatureScenes';

export interface Funkce {
  id: ScenaId;
  icon: string;
  title: string;
  text: string;
}

const STRIDANI = 6000;

export function FeatureShowcase({ funkce }: { funkce: Funkce[] }) {
  const [aktivni, setAktivni] = useState(0);
  const [rizeneRucne, setRizeneRucne] = useState(false);
  const [vidno, setVidno] = useState(false);
  const obal = useRef<HTMLDivElement>(null);
  const zalozky = useRef<(HTMLButtonElement | null)[]>([]);

  // Střídá se jen to, co je na obrazovce. Scéna běžící mimo výřez je
  // jen práce navíc pro telefon, který se má nabít na celý den.
  useEffect(() => {
    const el = obal.current;
    if (!el) return;
    const o = new IntersectionObserver(z => setVidno(z.some(x => x.isIntersecting)), { threshold: 0.25 });
    o.observe(el);
    return () => o.disconnect();
  }, []);

  useEffect(() => {
    if (rizeneRucne || !vidno) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => setAktivni(i => (i + 1) % funkce.length), STRIDANI);
    return () => clearTimeout(t);
  }, [aktivni, rizeneRucne, vidno, funkce.length]);

  const vyber = useCallback((i: number) => { setRizeneRucne(true); setAktivni(i); }, []);

  // Šipky mezi záložkami — jinak se sem klávesnicí dá jen vstoupit, ne projít.
  const klavesa = (e: React.KeyboardEvent, i: number) => {
    const kam = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1
      : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1
        : e.key === 'Home' ? -i
          : e.key === 'End' ? funkce.length - 1 - i : 0;
    if (!kam) return;
    e.preventDefault();
    const dalsi = (i + kam + funkce.length) % funkce.length;
    vyber(dalsi);
    zalozky.current[dalsi]?.focus();
  };

  const f = funkce[aktivni];

  return (
    <div ref={obal} className="mt-10 grid grid-cols-1 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] gap-5 lg:gap-8 items-start">
      {/* Výběr. Na telefonu vodorovný pás, na monitoru sloupec. */}
      <div
        role="tablist"
        aria-label="Funkce Managera"
        aria-orientation="vertical"
        className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible -mx-5 px-5 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0 pb-1 lg:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {funkce.map((x, i) => {
          const on = i === aktivni;
          return (
            <button
              key={x.id}
              ref={el => { zalozky.current[i] = el; }}
              role="tab"
              id={`fn-tab-${x.id}`}
              aria-selected={on}
              aria-controls="fn-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => vyber(i)}
              onKeyDown={e => klavesa(e, i)}
              className={`tap-target shrink-0 lg:shrink inline-flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left transition ${
                on ? 'bg-[#16181A] text-white shadow-[0_10px_26px_rgba(25,35,15,0.22)]' : 'lgx text-black/65 hover:text-[#16181A]'
              }`}
            >
              <Icon name={x.icon} size={17} className={`shrink-0 ${on ? 'text-[#C8F542]' : 'text-[#5B7A08]'}`} />
              <span className="text-sm font-semibold whitespace-nowrap lg:whitespace-normal">{x.title}</span>
            </button>
          );
        })}
      </div>

      {/* Panel. `key` je tu ta podstatná věc: přepnutím funkce se scéna
          odmountuje a animace se rozjede od začátku. Bez toho by druhá
          funkce naskočila hotová a ukázka by nic neukázala. */}
      {/* Panel je jeden a má stálé `id`. Vykreslovat dvanáct panelů a jedenáct
          z nich schovávat by znamenalo dvanáct scén najednou v paměti; mít
          `id` podle aktivní funkce zase nechá jedenáct záložek ukazovat
          `aria-controls` do prázdna — odečítač obrazovky pak řekne „ovládá
          nic". Jeden panel, který ovládá víc záložek, je platný vzor. */}
      <div
        role="tabpanel"
        id="fn-panel"
        aria-labelledby={`fn-tab-${f.id}`}
        tabIndex={0}
        className="lgx rounded-[2rem] p-5 sm:p-7 grid grid-cols-1 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6 items-center sm:min-h-[24rem]"
      >
        <div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#C8F542]/25 text-[#5B7A08]">
            <Icon name={f.icon} size={22} />
          </div>
          <h3 key={`h-${f.id}`} className="sc mt-4 text-xl sm:text-2xl font-bold tracking-tight text-[#16181A]">{f.title}</h3>
          <p key={`p-${f.id}`} className="sc mt-2.5 text-sm sm:text-base text-black/60 leading-relaxed text-pretty" style={{ animationDelay: '80ms' }}>
            {f.text}
          </p>
        </div>
        <div key={f.id}>
          <Scena id={f.id} />
        </div>
      </div>
    </div>
  );
}

export default FeatureShowcase;
