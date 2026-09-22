'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LogoMark } from '@/components/Icons';

// Hlavička prodejní stránky.
//
// Dřív to byla skleněná pilulka `.lgx` přes celou šířku — a její bílý
// rámeček na limetkové skvrně hero svítil jako prstenec. Na screenshotu
// z telefonu to byl první prvek, kterého si oko všimlo, a nebyl to ani
// nadpis, ani tlačítko.
//
// Teď: nahoře na stránce lišta NEMÁ pozadí — sedí přímo na hero. Sklo
// dostane až po posunu, kdy pod ní začne projíždět obsah a je co
// rozmazávat. Rámeček je inkoustový a slabý, ne bílý.
//
// Navigace ví, kde na stránce člověk je: tmavá pilulka přejíždí na
// položku sekce, která je právě v obraze — stejný pohyb jako v přepínači
// pohledů v aplikaci. Není to hračka: na dlouhé stránce je to jediná
// odpověď na „kde jsem".

const ODKAZY: { id: string; label: string }[] = [
  { id: 'funkce', label: 'Funkce' },
  { id: 'den', label: 'Jeden den' },
  { id: 'zacatek', label: 'Jak začít' },
  { id: 'cenik', label: 'Ceník' },
  { id: 'otazky', label: 'Otázky' },
];

export default function LandingHeader() {
  const [posunuto, setPosunuto] = useState(false);
  const [aktivni, setAktivni] = useState<string | null>(null);
  const nav = useRef<HTMLElement>(null);
  const [pilulka, setPilulka] = useState<{ x: number; w: number } | null>(null);

  useEffect(() => {
    const na = () => setPosunuto(window.scrollY > 24);
    na();
    window.addEventListener('scroll', na, { passive: true });
    return () => window.removeEventListener('scroll', na);
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

  return (
    <header className="sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-3 sm:px-5 pt-3">
        <div className={`lg-bar rounded-full pl-3 pr-2 sm:pl-4 sm:pr-2.5 py-2 flex items-center justify-between gap-3 ${posunuto ? 'posunuto' : ''}`}>
          <Link href="/" className="flex items-center gap-2.5 min-w-0 rounded-full" aria-label="Managero — na začátek stránky">
            <LogoMark size={30} />
            <span className="text-lg font-bold tracking-tight text-[#16181A] truncate">Managero</span>
          </Link>

          <nav ref={nav} aria-label="Sekce stránky" className="relative hidden md:flex items-center gap-0.5">
            {pilulka && (
              <span aria-hidden
                className="absolute top-0 bottom-0 rounded-full bg-[#16181A] pointer-events-none motion-safe:transition-[transform,width] motion-safe:duration-300 motion-safe:ease-out"
                style={{ transform: `translateX(${pilulka.x}px)`, width: pilulka.w }} />
            )}
            {ODKAZY.map(o => {
              const on = aktivni === o.id;
              return (
                <a key={o.id} href={`#${o.id}`} data-on={on ? 'true' : undefined}
                  className={`relative z-[1] rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-300 ${on ? 'text-white' : 'text-black/60 hover:text-[#16181A]'}`}>
                  {o.label}
                </a>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 shrink-0">
            <Link href="/login" className="btn btn-ghost btn-sm !px-3 whitespace-nowrap">Přihlásit</Link>
            <Link href="/register" className="btn btn-primary btn-sm whitespace-nowrap">
              <span className="sm:hidden">Vyzkoušet</span>
              <span className="hidden sm:inline">Vyzkoušet zdarma</span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
