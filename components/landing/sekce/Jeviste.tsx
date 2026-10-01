'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icons';
import Ukazka from '../ukazka/Ukazka';
import UkazVUkazce from '../UkazVUkazce';
import { SCENY_UKAZKY } from '../ukazka/scenare';
import { FUNKCE, FUNKCE_DALSI, HERO, TYPY_PODNIKU } from '../obsah';

// Živé jeviště: hero, „pro koho" a funkce jako jeden celek.
//
// Hlavní postava stránky je skutečná aplikace (živá ukázka), a ta se při
// scrollu neodsune pryč: od 1024 px se přilepí, couvne do pravého sloupce
// a funkce vlevo ji přepínají na svou scénu. Kdo čte o rozvrhu, má vedle
// sebe rozvrh, na který může kliknout. Je to jeden iframe po celou dobu,
// takže co si člověk v hero naklikal, nezmizí (stejná scéna se nenačítá znovu).
//
// Pohyb počítá skript jen jako dvě čísla v CSS: postup --p (0 v hero, 1 když
// dorazí „pro koho") a cíl --ld-tx / --ld-s změřený z pravého sloupce. Rám se
// hýbe jen transformací, takže iframe se nepřeměřuje ani nepřekresluje.
// Pod 1024 px a s omezeným pohybem se nic nepřilepuje: ukázka stojí v hero
// a funkce mají tlačítko „Ukaž v ukázce", které k ní doroluje.

const POPIS_SCENY = Object.fromEntries(SCENY_UKAZKY.map(s => [s.id, s.label]));

export default function Jeviste() {
  const koren = useRef<HTMLDivElement>(null);
  const dok = useRef<HTMLDivElement>(null);
  const levy = useRef<HTMLDivElement>(null);
  const cil = useRef<HTMLDivElement>(null);
  const [pohyb, setPohyb] = useState(false);
  const [aktivni, setAktivni] = useState(-1);
  const [svetla, setSvetla] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px) and (prefers-reduced-motion: no-preference)');
    const nastav = () => setPohyb(mq.matches);
    nastav();
    mq.addEventListener('change', nastav);
    return () => mq.removeEventListener('change', nastav);
  }, []);

  // Pro koho: slova se rozsvítí, jakmile projdou spodní třetinou okna (i bez pohybu
  // rozsvícená, viz CSS). Funkce: aktivní je ta, kterou prochází střed okna.
  useEffect(() => {
    const el = koren.current;
    if (!el) return;
    let snimek = 0;
    let posledniScena: string | null = null;
    const pocitej = () => {
      snimek = 0;
      const vh = window.innerHeight;
      const slova = el.querySelectorAll<HTMLElement>('[data-typ]');
      let n = 0;
      slova.forEach(s => { if (s.getBoundingClientRect().top < vh * 0.66) n++; });
      setSvetla(n);

      const polozky = el.querySelectorAll<HTMLElement>('[data-funkce]');
      let akt = -1;
      polozky.forEach((f, i) => { const r = f.getBoundingClientRect(); if (r.top <= vh * 0.5 && r.bottom > vh * 0.5) akt = i; });
      setAktivni(akt);

      if (!pohyb) { el.style.removeProperty('--p'); return; }
      // Postup se počítá od posunu stránky, ne jen od polohy sloupce: na vysokém
      // okně je „pro koho" vidět už nahoře a jeviště má v klidu stát uprostřed.
      const top = levy.current?.getBoundingClientRect().top ?? vh;
      const zacatek = Math.max(0, top + window.scrollY - vh * 0.98);
      const p = Math.min(1, Math.max(0, (window.scrollY - zacatek) / (vh * 0.34)));
      el.style.setProperty('--p', p.toFixed(4));

      // Scénu přepíná jen funkce, která na ni má příběh, a jen když už jeviště stojí ve sloupci.
      const scena = akt >= 0 ? FUNKCE[akt].scena : undefined;
      if (p >= 1 && scena && scena !== posledniScena) {
        posledniScena = scena;
        window.dispatchEvent(new CustomEvent('managero:ukazka', { detail: { scena, tichy: true } }));
      }
    };
    const naScroll = () => { if (!snimek) snimek = requestAnimationFrame(pocitej); };

    // Cíl rámu: pravý sloupec. Měří se při změně velikosti, ne při každém posunu.
    const zmer = () => {
      const d = dok.current;
      const c = cil.current;
      if (!pohyb || !d || !c) return;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const cr = c.getBoundingClientRect();
      const s = Math.min(cr.width / d.offsetWidth, (vh - 120) / d.offsetHeight, 1);
      const tx = cr.left + cr.width / 2 - vw / 2;
      const top = Math.max(84, (vh - d.offsetHeight * s) / 2 + 24);
      el.style.setProperty('--ld-s', s.toFixed(4));
      el.style.setProperty('--ld-tx', `${tx.toFixed(1)}px`);
      el.style.setProperty('--ld-dok-top', `${top.toFixed(0)}px`);
      pocitej();
    };

    zmer();
    pocitej();
    window.addEventListener('scroll', naScroll, { passive: true });
    window.addEventListener('resize', zmer);
    const ro = typeof ResizeObserver !== 'undefined' && dok.current ? new ResizeObserver(zmer) : null;
    if (ro && dok.current) ro.observe(dok.current);
    return () => {
      window.removeEventListener('scroll', naScroll);
      window.removeEventListener('resize', zmer);
      ro?.disconnect();
      if (snimek) cancelAnimationFrame(snimek);
    };
  }, [pohyb]);

  return (
    <div ref={koren} className="ld-jev" data-pohyb={pohyb ? 'true' : 'false'}>
      <section id="ukazka" className="relative" aria-labelledby="nadpis-hero">
        <div className="ld-obsah pt-8 sm:pt-[1.9rem] text-center">
          {/* LCP: obyčejné HTML bez animace vstupu. */}
          <h1 id="nadpis-hero" className="ld-h1 mx-auto max-w-[14.5em]">{HERO.h1}</h1>
          <p className="ld-perex mx-auto mt-4 max-w-[40ch]">{HERO.podtitulek}</p>
        </div>
      </section>

      <div ref={dok} className="ld-dok mt-6 px-[var(--ld-okraj)] md:px-0">
        <Ukazka />
      </div>

      <div className="ld-obsah ld-jev-sloupce">
        <div ref={levy} className="min-w-0">
          {/* Pro koho: dřív pás fotek, teď slova. Říká totéž rychleji a nic nepředstírá. */}
          <section className="ld-sekce" aria-labelledby="pas-nadpis">
            <h2 id="pas-nadpis" className="ld-h3 text-[color:var(--ld-text-2)]">Pro koho je Managero</h2>
            <ul className="ld-typy mt-6 sm:mt-8">
              {TYPY_PODNIKU.map((t, i) => (
                <li key={t} data-typ className="ld-typ" data-svetlo={i < svetla ? 'true' : 'false'}>{t}</li>
              ))}
            </ul>
            <p className="ld-text mt-8 max-w-[44ch]">Pro každý podnik, kde se točí směny, počítá kasa a dochází mléko. Jeden podnik nebo víc poboček.</p>
          </section>

          <section id="funkce" className="ld-sekce" aria-labelledby="nadpis-funkce">
            <h2 id="nadpis-funkce" className="ld-h2">Všechno, co provoz potřebuje</h2>
            <p className="ld-perex mt-5 max-w-[34ch]">Věci, které jinak děláte ve třech aplikacích, dvou sešitech a jedné hlavě.</p>
            <ol className="mt-12 list-none">
              {FUNKCE.map((f, i) => (
                <li key={f.title} data-funkce className="ld-funkce-polozka py-8" data-aktivni={aktivni === i ? 'true' : 'false'}>
                  <h3 className="ld-h3">{f.title}</h3>
                  <p className="ld-text mt-3 max-w-[44ch]">{f.text}</p>
                  {f.scena && (
                    <>
                      <p className="ld-ve-ukazce mt-5 items-center gap-2.5 text-sm font-medium text-[color:var(--ld-text-2)]">
                        <span className="ld-tecka" aria-hidden />V ukázce vpravo: {POPIS_SCENY[f.scena]}
                      </p>
                      <UkazVUkazce scena={f.scena} className="ld-ukaz-tlacitko mt-5 ld-btn ld-btn-sm ld-btn-obrys">
                        Ukaž v ukázce <Icon name="chevron" size={14} className="ld-sipka -rotate-90" aria-hidden />
                      </UkazVUkazce>
                    </>
                  )}
                </li>
              ))}
            </ol>
            <p className="ld-meta mt-10 max-w-[48ch] border-t border-[color:var(--ld-linka)] pt-8">{FUNKCE_DALSI}</p>
          </section>
        </div>
        {/* Cíl, kam jeviště couvne: jen se z něj měří šířka a poloha. */}
        <div ref={cil} className="ld-jev-pravy hidden lg:block" aria-hidden />
      </div>
    </div>
  );
}
