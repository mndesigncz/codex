'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon, LogoMark } from '@/components/Icons';
import { TRIAL_DAYS } from '@/lib/plan';
import { useT } from '@/lib/i18n/client';
import { NAVIGACE, PRIHLASENI, ZKUSIT_ZDARMA } from './obsah';

// Hlavička prodejní stránky.
//
// Nahoře na stránce lišta nemá pozadí, sedí přímo na jevišti. Inkoustové
// sklo dostane až po posunu, kdy pod ní začne projíždět obsah (sklo patří
// plovoucímu chromu, DESIGN.md). Navigace ví, kde na stránce člověk je:
// tichá pilulka přejíždí na sekci, která je v obraze. Na dlouhé stránce je
// to jediná odpověď na „kde jsem".

const ODKAZY = NAVIGACE;

export default function LandingHeader() {
  const t = useT('landing');
  const [posunuto, setPosunuto] = useState(false);
  const [aktivni, setAktivni] = useState<string | null>(null);
  const nav = useRef<HTMLElement>(null);
  const [pilulka, setPilulka] = useState<{ x: number; w: number } | null>(null);

  // „Posunuto" hlídá neviditelná hlídka na začátku stránky: dokud je
  // v obraze, lišta je bez pozadí. Žádný posluchač scrollu, který by běžel
  // na každém snímku; IntersectionObserver se ozve jen při změně.
  const hlidka = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = hlidka.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([z]) => setPosunuto(!z.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Která sekce je v obraze. Práh 0,35: sekce se „ujme" navigace, jakmile
  // zabírá třetinu okna — dřív by pilulka přeskakovala při každém dotyku
  // hrany, později by na telefonu, kde jsou sekce delší než okno, nesvítilo
  // nic.
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const prvky = ODKAZY.map(o => document.getElementById(o.id)).filter((x): x is HTMLElement => !!x);
    if (!prvky.length) return;
    const videt = new Map<string, number>();
    const io = new IntersectionObserver(zaznamy => {
      for (const z of zaznamy) videt.set(z.target.id, z.isIntersecting ? z.intersectionRatio : 0);
      let nej: string | null = null; let max = 0;
      videt.forEach((r, id) => { if (r > max) { max = r; nej = id; } });
      setAktivni(max > 0 ? nej : null);
    }, { threshold: [0, 0.15, 0.35, 0.6] });
    prvky.forEach(p => io.observe(p));
    return () => io.disconnect();
  }, []);

  // Poloha pilulky se měří z DOM, stejně jako v <Segmented>.
  useLayoutEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('[data-on="true"]');
    if (!el) { setPilulka(null); return; }
    setPilulka({ x: el.offsetLeft, w: el.offsetWidth });
  }, [aktivni]);

  // Přihlášení: dvě místa (správa podniku, hostovská část), proto malá nabídka.
  // Escape ji zavře a vrátí fokus na tlačítko, klepnutí mimo ji zavře také.
  const [menuOtevreno, setMenuOtevreno] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const menuTlacitko = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOtevreno) return;
    const mimo = (e: PointerEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) setMenuOtevreno(false);
    };
    const klavesa = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuOtevreno(false); menuTlacitko.current?.focus(); }
    };
    const odchod = (e: FocusEvent) => {
      if (menu.current && e.relatedTarget && !menu.current.contains(e.relatedTarget as Node)) setMenuOtevreno(false);
    };
    document.addEventListener('pointerdown', mimo);
    document.addEventListener('keydown', klavesa);
    const el = menu.current;
    el?.addEventListener('focusout', odchod);
    return () => {
      document.removeEventListener('pointerdown', mimo);
      document.removeEventListener('keydown', klavesa);
      el?.removeEventListener('focusout', odchod);
    };
  }, [menuOtevreno]);

  return (
    <>
    <div ref={hlidka} className="h-6 -mb-6 pointer-events-none" aria-hidden />
    <header className="ld-lista sticky top-0 z-40" data-posunuto={posunuto ? 'true' : 'false'}>
      <div className="flex h-[4.25rem] items-center justify-between gap-4 px-[max(1.25rem,2.4vw)]">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 rounded-lg" aria-label={t('Managero, na začátek stránky')}>
          <LogoMark size={32} />
          <span className="text-lg font-bold tracking-tight text-[color:var(--ld-papir)]">Managero</span>
        </Link>

        <nav ref={nav} aria-label={t('Sekce stránky')} className="relative hidden lg:flex items-center gap-0.5">
          {pilulka && (
            <span aria-hidden
              className="absolute top-0 bottom-0 rounded-full bg-[rgb(var(--ld-fg)/0.1)] pointer-events-none motion-safe:transition-[transform,width] motion-safe:duration-300 motion-safe:ease-out"
              style={{ transform: `translateX(${pilulka.x}px)`, width: pilulka.w }} />
          )}
          {ODKAZY.map(o => {
            const on = aktivni === o.id;
            return (
              <a key={o.id} href={`#${o.id}`} data-on={on ? 'true' : undefined} aria-current={on ? 'true' : undefined}
                className={`relative z-[1] rounded-full px-2.5 xl:px-3.5 py-2 text-[0.9375rem] font-medium whitespace-nowrap transition-colors duration-300 ${on ? 'text-[color:var(--ld-papir)]' : 'text-[color:var(--ld-text-2)] hover:text-[color:var(--ld-papir)]'}`}>
                {t(o.label)}
              </a>
            );
          })}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <div ref={menu} className="ld-menu">
            <button ref={menuTlacitko} type="button" className="ld-menu-tlacitko"
              aria-expanded={menuOtevreno} aria-controls="menu-prihlaseni" aria-haspopup="true"
              onClick={() => setMenuOtevreno(o => !o)}>
              {t(PRIHLASENI.tlacitko)}
              <Icon name="chevron" size={14} className="ld-menu-sipka" aria-hidden />
            </button>
            <div id="menu-prihlaseni" className="ld-menu-panel" hidden={!menuOtevreno} role="group" aria-label={t(PRIHLASENI.skupina)}>
              <p className="ld-menu-skupina" aria-hidden>{t(PRIHLASENI.skupina)}</p>
              <Link href="/login" className="ld-menu-polozka" onClick={() => setMenuOtevreno(false)}>
                <span className="ld-menu-nazev">{t(PRIHLASENI.podnik.nazev)}</span>
                <span className="ld-menu-popis">{t(PRIHLASENI.podnik.popis)}</span>
              </Link>
              <Link href="/client/login" className="ld-menu-polozka" onClick={() => setMenuOtevreno(false)}>
                <span className="ld-menu-nazev">{t(PRIHLASENI.host.nazev)}</span>
                <span className="ld-menu-popis">{t(PRIHLASENI.host.popis)}</span>
              </Link>
            </div>
          </div>
          {/* Limetkové jen nahoře: po posunu přijdou další hlavní akce (karta Pro, závěr)
              a v jednom výřezu smí svítit jen jedna. */}
          <Link href="/register" className={`whitespace-nowrap ${posunuto ? 'ld-btn ld-btn-sm ld-btn-svetle !h-9' : 'btn btn-accent btn-sm'}`}>
            <span className="sm:hidden lg:inline xl:hidden">{t('Vyzkoušet')}</span>
            <span className="hidden sm:inline lg:hidden xl:inline">{t(ZKUSIT_ZDARMA, { n: TRIAL_DAYS })}</span>
          </Link>
        </div>
      </div>
    </header>
    </>
  );
}
