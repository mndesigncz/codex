'use client';

import { useEffect, useRef, useState } from 'react';
import SmyckaVideo from '../SmyckaVideo';
import { useT } from '@/lib/i18n/client';
import { DEN_MOMENTY, DEN_NADPIS } from '../obsah';
import { NAHRAVKY } from '../nahravky';

// Jeden den s podnikem: pět okamžiků od otevření po uzávěrku, každý s nahrávkou
// ovládání skutečné aplikace.
//
// Vlevo osa dne: velké časy, které se rozsvítí, jakmile jimi den projde, a linka,
// která se při scrollu plní limetkou od 7:30 k právě čtenému okamžiku. Vpravo
// (od 1024 px) jeden přilepený rám, ve kterém se přepíná smyčka podle kroku
// u středu okna; neaktivní smyčky se nestahují. Pod 1024 px má každý okamžik
// vlastní smyčku pod textem.
export default function DenSPodnikem() {
  const t = useT('landing');
  const [aktivni, setAktivni] = useState(0);
  const [prosle, setProsle] = useState(0);
  const koren = useRef<HTMLDivElement>(null);
  const osa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = koren.current;
    const o = osa.current;
    if (!el || !o) return;
    let snimek = 0;
    const pocitej = () => {
      snimek = 0;
      const stred = window.innerHeight * 0.5;
      const kroky = Array.from(el.querySelectorAll<HTMLElement>('[data-krok]'));
      let akt = 0; let pr = 0;
      kroky.forEach((k, i) => {
        const r = k.getBoundingClientRect();
        if (r.top <= stred) { akt = i; pr = i + 1; }
      });
      setAktivni(akt);
      setProsle(pr);
      const r = o.getBoundingClientRect();
      const plneni = Math.min(1, Math.max(0, (stred - r.top) / r.height));
      o.style.setProperty('--plneni', plneni.toFixed(4));
    };
    const naScroll = () => { if (!snimek) snimek = requestAnimationFrame(pocitej); };
    pocitej();
    window.addEventListener('scroll', naScroll, { passive: true });
    window.addEventListener('resize', naScroll);
    return () => { window.removeEventListener('scroll', naScroll); window.removeEventListener('resize', naScroll); if (snimek) cancelAnimationFrame(snimek); };
  }, []);

  const zkus = (scena: string) => () => window.dispatchEvent(new CustomEvent('managero:ukazka', { detail: { scena } }));

  return (
    <section id="den" className="ld-sekce" aria-labelledby="nadpis-den">
      <div className="ld-obsah">
        <div className="max-w-[40rem]">
          <h2 id="nadpis-den" className="ld-h2">{t(DEN_NADPIS.nadpis)}</h2>
          <p className="ld-perex mt-5">{t(DEN_NADPIS.perex)}</p>
        </div>

        <div ref={koren} className="ld-den mt-14 sm:mt-20 grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-x-16" data-aktivni={aktivni}>
          <div ref={osa} className="ld-den-osa">
          <span className="ld-den-plneni" aria-hidden />
          <ol className="list-none">
            {DEN_MOMENTY.map((m, i) => (
              <li key={m.cas} data-krok={i} data-prosly={i < prosle ? 'true' : 'false'} className="ld-den-krok py-10 lg:py-0">
                <p className="ld-cas ld-cislo"><time>{m.cas}</time></p>
                <h3 className="ld-h3 mt-4">{t(m.title)}</h3>
                <p className="ld-text mt-3 max-w-[42ch]">{t(m.text)}</p>
                {/* Telefon a tablet: smyčka přímo pod okamžikem. */}
                <div className="mt-8 lg:hidden">
                  <SmyckaVideo id={m.nahravka} onZkusit={zkus(NAHRAVKY[m.nahravka].scena)} />
                </div>
              </li>
            ))}
          </ol>
          </div>

          <div className="hidden lg:block">
            <div className="sticky top-[calc(50vh-19rem)] h-[38rem]">
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
