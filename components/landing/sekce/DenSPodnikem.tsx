'use client';

import { useEffect, useRef, useState } from 'react';
import Foto from '../Foto';
import SmyckaVideo from '../SmyckaVideo';
import { DEN_MOMENTY } from '../obsah';
import { NAHRAVKY } from '../nahravky';

// Jeden den s podnikem: pět okamžiků od otevření po uzávěrku, každý s nahrávkou
// ovládání skutečné aplikace.
//
// Od 1024 px jedna sticky kompozice: vlevo pět kroků, vpravo jeden rám, ve kterém
// se podle kroku u středu obrazovky přepíná smyčka (ne cik-cak fotka/text, ne pět
// stejných karet). Aktivní krok určuje IntersectionObserver; neaktivní smyčky se
// nestahují. Pod 1024 px má každý okamžik vlastní smyčku pod textem.
// Fotka je tu jen malý doplněk: říká, kde se to děje, nahrávka, co se děje.
export default function DenSPodnikem() {
  const [aktivni, setAktivni] = useState(0);
  const koren = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = koren.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const kroky = Array.from(el.querySelectorAll<HTMLElement>('[data-krok]'));
    // Pás uprostřed okna: krok, který jím prochází, je aktivní.
    const io = new IntersectionObserver(zaznamy => {
      for (const z of zaznamy) if (z.isIntersecting) setAktivni(Number((z.target as HTMLElement).dataset.krok));
    }, { rootMargin: '-42% 0px -42% 0px' });
    kroky.forEach(k => io.observe(k));
    return () => io.disconnect();
  }, []);

  const zkus = (scena: string) => () => window.dispatchEvent(new CustomEvent('managero:ukazka', { detail: { scena } }));

  return (
    <section id="den" className="relative scroll-mt-24 pb-16 sm:pb-24" aria-labelledby="nadpis-den">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="max-w-xl">
          <h2 id="nadpis-den" className="text-2xl sm:text-4xl font-bold tracking-tight text-[#16181A]">Jeden den s Managerem</h2>
          <p className="mt-3 text-base text-black/60 text-pretty">Od otevření po uzávěrku. Nahrávky jsou ze skutečné aplikace, s vymyšlenými daty.</p>
        </div>

        <div ref={koren} className="ld-den mt-10 grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-x-14" data-aktivni={aktivni}>
          <ol className="list-none">
            {DEN_MOMENTY.map((m, i) => (
              <li key={m.cas} data-krok={i} className="py-8 lg:py-12 lg:min-h-[17rem] border-t border-black/[0.08] first:border-t-0 first:pt-0">
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="chip chip-ink tabular-nums">{m.cas}</span>
                      <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-[#16181A]">{m.title}</h3>
                    </div>
                    <p className="mt-3 text-sm sm:text-base text-black/60 leading-relaxed text-pretty max-w-[46ch]">{m.text}</p>
                  </div>
                  <Foto id={m.foto} pomer="aspect-[4/5]" className="hidden sm:block w-24 shrink-0" sizes="96px" paralax={false} />
                </div>
                {/* Telefon a tablet: smyčka přímo pod okamžikem. */}
                <div className="mt-6 lg:hidden">
                  <SmyckaVideo id={m.nahravka} onZkusit={zkus(NAHRAVKY[m.nahravka].scena)} />
                </div>
              </li>
            ))}
          </ol>

          <div className="hidden lg:block">
            <div className="sticky top-24 h-[36rem]">
              {DEN_MOMENTY.map((m, i) => (
                <div key={m.nahravka} data-scena={i} inert={aktivni !== i}
                  className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full">
                    <SmyckaVideo id={m.nahravka} velky povolit={aktivni === i} onZkusit={zkus(NAHRAVKY[m.nahravka].scena)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
