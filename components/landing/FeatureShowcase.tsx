'use client';

// Funkce se nevypisují, předvádějí se.
//
// Dřív tu byla bento mřížka dvanácti karet: ikona, nadpis, věta. Kdo na
// stránku přišel poprvé, dozvěděl se, že aplikace „umí sklad" — ne jak to
// vypadá, když ho používá. Tady si funkci vybere a vedle ní se přehraje
// scéna, která tu funkci provede od začátku do konce.
//
// Výběr je VODOROVNÝ pás pilulek nad panelem — stejný, jaký má aplikace
// nad seznamy (filtr stavů, měsíců, lidí). Svislý sloupec dvanácti tlačítek
// vedle panelu byl na monitoru dvakrát vyšší než panel sám: dole zbýval
// prázdný sloupec a nahoře prázdný panel. Pás se posouvá, aktivní pilulka
// se do něj sama přisune a pod ní běží tenká linka, která říká, za jak
// dlouho se přepne dál.
//
// Dokud návštěvník nesáhne na výběr, scény se střídají samy — první dojem
// má být pohyb, ne prázdný panel čekající na kliknutí. Jakmile si vybere,
// přepínání se zastaví a dál to řídí on: vzít člověku ovládání zpátky je
// horší než mu ho nedat.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icons';
import { type ScenaId } from './FeatureScenes';
import Zarizeni from './Zarizeni';

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
  const pas = useRef<HTMLDivElement>(null);
  const zalozky = useRef<(HTMLButtonElement | null)[]>([]);
  // Okraje pásu se ztrácejí jen tam, kde je co schované: vlevo po posunu,
  // vpravo dokud pás nedojel na konec. Stálé ztmavení první pilulky by
  // vypadalo jako chyba.
  const [okraje, setOkraje] = useState<{ l: boolean; r: boolean }>({ l: false, r: true });

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

  const zmerOkraje = useCallback(() => {
    const p = pas.current;
    if (!p) return;
    setOkraje({ l: p.scrollLeft > 4, r: p.scrollLeft + p.clientWidth < p.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    zmerOkraje();
    window.addEventListener('resize', zmerOkraje);
    return () => window.removeEventListener('resize', zmerOkraje);
  }, [zmerOkraje]);

  // Aktivní pilulka se přisune do středu pásu. Posouvá se JEN pás, ne
  // stránka — `scrollIntoView` by při automatickém střídání tahal stránku
  // pod čtenářem, co zrovna čte text vedle.
  useEffect(() => {
    const p = pas.current;
    const el = zalozky.current[aktivni];
    if (!p || !el) return;
    const cil = el.offsetLeft - p.clientWidth / 2 + el.offsetWidth / 2;
    const hladce = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    p.scrollTo({ left: Math.max(0, cil), behavior: hladce ? 'smooth' : 'auto' });
  }, [aktivni]);

  const vyber = useCallback((i: number) => { setRizeneRucne(true); setAktivni(i); }, []);

  // Šipky mezi záložkami — jinak se sem klávesnicí dá jen vstoupit, ne projít.
  const klavesa = (e: React.KeyboardEvent, i: number) => {
    const kam = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1
        : e.key === 'Home' ? -i
          : e.key === 'End' ? funkce.length - 1 - i : 0;
    if (!kam) return;
    e.preventDefault();
    const dalsi = (i + kam + funkce.length) % funkce.length;
    vyber(dalsi);
    zalozky.current[dalsi]?.focus();
  };

  const f = funkce[aktivni];
  const posun = (o: number) => vyber((aktivni + o + funkce.length) % funkce.length);

  return (
    <div ref={obal} className="mt-8">
      {/* Pás pilulek. Přesahuje okraj obsahu, aby se dalo posouvat od kraje
          obrazovky, jak je člověk z telefonu zvyklý. */}
      <div className="-mx-5 sm:-mx-8 lg:mx-0">
        <div
          ref={pas}
          role="tablist"
          aria-label="Funkce Managera"
          data-l={okraje.l ? '1' : undefined}
          data-r={okraje.r ? '1' : undefined}
          onScroll={zmerOkraje}
          className="fn-pas px-5 sm:px-8 lg:px-1"
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
                className={`filter-pill relative !px-4 !py-2.5 !text-sm !font-semibold tap-target overflow-hidden ${on ? 'seg-on' : 'seg-off glass'}`}
              >
                <Icon name={x.icon} size={16} className={`shrink-0 ${on ? 'text-[#C8F542]' : 'text-[#5B7A08]'}`} />
                {x.title}
                {/* Linka průběhu: kolik zbývá, než se scéna přepne dál. Po
                    ručním výběru zmizí — pak se nic samo nepřepíná. */}
                {on && !rizeneRucne && <span key={aktivni} className="fn-prubeh" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel. `key` na scéně je tu ta podstatná věc: přepnutím funkce se
          scéna odmountuje a animace se rozjede od začátku. Bez toho by druhá
          funkce naskočila hotová a ukázka by nic neukázala. */}
      {/* `min-h` NENÍ kosmetika. Scény mají různou výšku a panel se sám
          přepíná po šesti vteřinách — bez pevné podlahy se stránka pod
          čtenářem každých šest vteřin zkrátí nebo prodlouží. Číslo je
          z měření nejvyšší scény v rámu tabletu, ne od oka. */}
      {/* Panel je jeden a má stálé `id`. Jeden panel, který ovládá víc
          záložek, je platný vzor; dvanáct panelů s jedenácti schovanými by
          znamenalo dvanáct scén najednou v paměti. */}
      <div
        role="tabpanel"
        id="fn-panel"
        aria-labelledby={`fn-tab-${f.id}`}
        tabIndex={0}
        className="mt-5 lgx rounded-[2rem] p-5 sm:p-8 grid grid-cols-1 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-8 md:gap-10 items-center min-h-[40rem] md:min-h-[27rem]"
      >
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#C8F542]/25 text-[#5B7A08]">
              <Icon name={f.icon} size={22} />
            </div>
            <p className="text-xs font-semibold tabular-nums text-black/40">{aktivni + 1} / {funkce.length}</p>
          </div>
          <h3 key={`h-${f.id}`} className="sc mt-4 text-xl sm:text-2xl font-bold tracking-tight text-[#16181A]">{f.title}</h3>
          <p key={`p-${f.id}`} className="sc mt-2.5 text-sm sm:text-base text-black/60 leading-relaxed text-pretty" style={{ animationDelay: '80ms' }}>
            {f.text}
          </p>
          <div className="mt-5 flex items-center gap-2">
            <button type="button" onClick={() => posun(-1)} className="btn-icon" aria-label="Předchozí funkce"><Icon name="chevron" size={16} className="rotate-90" /></button>
            <button type="button" onClick={() => posun(1)} className="btn-icon" aria-label="Další funkce"><Icon name="chevron" size={16} className="-rotate-90" /></button>
          </div>
        </div>
        {/* Scéna v tabletu v perspektivě — tentýž rám jako v hero. Produkt
            v prostoru, ne obrázek nalepený do karty. */}
        <div className="mx-auto w-full max-w-[26rem] md:max-w-none md:pr-4">
          <Zarizeni key={f.id} scena={f.id} />
        </div>
      </div>
    </div>
  );
}

export default FeatureShowcase;
