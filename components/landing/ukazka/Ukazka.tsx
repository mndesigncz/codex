'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Prepinac from '../Prepinac';
import { useT } from '@/lib/i18n/client';
import {
  jeIdSceny, krokyPro, LOGICKY_ROZMER, REAKCE_NA_AKCI, ROLE_UKAZKY, SCENY_UKAZKY, ZARIZENI_UKAZKY,
  type IdSceny, type RoleUkazky, type ZarizeniUkazky,
} from './scenare';

// Živá ukázka v hero: skutečná aplikace (/demo) v rámu zařízení.
//
// /demo je aplikace nad mock serverem v prohlížeči, takže do balíku prodejní
// stránky nepřibude nic z aplikace, jen tenhle <iframe>; styly i skripty ukázky
// jsou izolované. Co stránka dělá navíc:
//  - plakát (skutečný snímek) je v HTML hned: LCP i bez skriptu. Samotná ukázka
//    se načte až když je rám vidět a prohlížeč je v klidu, nebo hned při prvním
//    dotyku. Při vypnutém pohybu a na úsporném přenosu se nenačítá sama,
//    čeká na tlačítko „Spustit živou ukázku".
//  - scény, role a zařízení se přepínají zprávami (`demo-scena`), ne načítáním
//    stránky; „Začít znovu" posílá `demo-reset`.
//  - coach marks: kurzor a bublina „klikni sem" vedou prvním krokem a po každém
//    kliknutí ukážou další. Polohu berou z prvku uvnitř ukázky (stejný původ).
//  - `demo-akce` z ukázky stránka překládá na větu („Uzávěrka se odemkla"),
//    kterou řekne nahlas i odečítači obrazovky.
//
// Zprávy se přijímají jen ze vlastního původu A jen z okna toho iframe.

type Faze = 'plakat' | 'nacita' | 'pripraveno' | 'selhalo';

const LIMIT_NACTENI_MS = 18000;

function uspornyRezim(): boolean {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (c?.saveData) return true;
    if (c?.effectiveType && /(^|-)2g$/.test(c.effectiveType)) return true;
  } catch { /* starý prohlížeč: bez omezení */ }
  return false;
}

interface PoziceCoach { x: number; y: number; bx: number; by: number; text: string }

export default function Ukazka({ pocatecniScena = 'prehled' }: { pocatecniScena?: IdSceny }) {
  const t = useT('landing');
  // Posluchač zpráv z ukázky se registruje jednou; věty překládá přes aktuální `t`.
  const tRef = useRef(t);
  tRef.current = t;
  const uvod = SCENY_UKAZKY.find(s => s.id === pocatecniScena) ?? SCENY_UKAZKY[0];
  const [mounted, setMounted] = useState(false);
  const [mobil, setMobil] = useState(false);
  const [rucni, setRucni] = useState(false);
  const [faze, setFaze] = useState<Faze>('plakat');
  const [videt, setVidet] = useState(false);          // iframe už aspoň jednou odpověděl
  const [scena, setScena] = useState<IdSceny>(uvod.id);
  const [role, setRole] = useState<RoleUkazky>(uvod.vychoziRole);
  const [zar, setZar] = useState<ZarizeniUkazky | 'auto'>('auto');
  const [src, setSrc] = useState<string | null>(null);
  const [klic, setKlic] = useState(0);
  const [krok, setKrok] = useState(0);
  const [nacteni, setNacteni] = useState(0);          // kolikrát ukázka řekla „pripraveno"
  const [coach, setCoach] = useState<PoziceCoach | null>(null);
  const [skala, setSkala] = useState(1);
  const [reakce, setReakce] = useState<string | null>(null);

  const korenRef = useRef<HTMLDivElement>(null);
  const obrazovka = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const poslednireakce = useRef({ text: '', t: 0 });
  const aktualni = useRef({ scena, role });
  aktualni.current = { scena, role };
  const pripravenaScena = useRef<{ scena: IdSceny; role: RoleUkazky } | null>(null);

  const ucinne: ZarizeniUkazky = mobil ? 'telefon' : zar === 'auto' ? 'pocitac' : zar;
  const logicky = LOGICKY_ROZMER[ucinne];
  const popisScena = SCENY_UKAZKY.find(s => s.id === scena) ?? SCENY_UKAZKY[0];
  const kroky = krokyPro(scena, role, t);
  const hotovo = faze === 'pripraveno' && kroky.length > 0 && krok >= kroky.length;

  const sestavAdresu = (s: IdSceny, r: RoleUkazky) => `/demo?scena=${s}&role=${r}&rezim=okno`;

  const posli = useCallback((z: Record<string, unknown>) => {
    iframe.current?.contentWindow?.postMessage(z, window.location.origin);
  }, []);

  /** Spustí načítání ukázky (jednou); opakované volání nic nedělá. */
  const aktivuj = useCallback((s?: IdSceny, r?: RoleUkazky) => {
    setSrc(a => a ?? sestavAdresu(s ?? aktualni.current.scena, r ?? aktualni.current.role));
    setFaze(f => (f === 'plakat' ? 'nacita' : f));
  }, []);

  // ——— Mount: prostředí, načítání v klidu ————————————————————————
  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia('(max-width: 767px)');
    const nastav = () => setMobil(mq.matches);
    nastav();
    mq.addEventListener('change', nastav);
    const u = uspornyRezim();
    setRucni(u);
    const el = korenRef.current;
    let zrusit = false;
    let viditelny = false;
    let idle = false;
    const zkus = () => { if (!zrusit && viditelny && idle && !u) aktivuj(); };
    const io = el && 'IntersectionObserver' in window
      ? new IntersectionObserver(([z]) => { viditelny = z.isIntersecting; zkus(); }, { rootMargin: '200px 0px' })
      : null;
    if (el && io) io.observe(el); else viditelny = true;
    // Po klidu: requestIdleCallback, kde není, krátká prodleva po načtení stránky.
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const cekej = () => { idle = true; zkus(); };
    const t = ric ? ric(cekej, { timeout: 2500 }) : window.setTimeout(cekej, 1500);
    return () => {
      zrusit = true;
      io?.disconnect();
      mq.removeEventListener('change', nastav);
      if (ric) (window as unknown as { cancelIdleCallback?: (n: number) => void }).cancelIdleCallback?.(t);
      else window.clearTimeout(t);
    };
  }, [aktivuj]);

  // ——— Měřítko: iframe má logický rozměr zařízení a zmenšuje se ————————
  useEffect(() => {
    const el = obrazovka.current;
    if (!el) return;
    const mer = () => setSkala(el.clientWidth / logicky.w);
    mer();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(mer) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [logicky.w, mounted]);

  // ——— Zprávy z ukázky —————————————————————————————————————————
  useEffect(() => {
    let ticho: number | undefined;
    const naZpravu = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (!iframe.current || e.source !== iframe.current.contentWindow) return;
      const d = e.data as { typ?: unknown; akce?: unknown; scena?: unknown; role?: unknown } | null;
      if (!d || typeof d !== 'object') return;
      if (d.typ === 'demo-pripraveno') {
        pripravenaScena.current = { scena: d.scena as IdSceny, role: d.role as RoleUkazky };
        setFaze('pripraveno');
        setVidet(true);
        setNacteni(n => n + 1);
        // Člověk přepnul scénu, než se ukázka načetla: dohnat.
        const a = aktualni.current;
        if (d.scena !== a.scena || d.role !== a.role) posli({ typ: 'demo-scena', scena: a.scena, role: a.role });
      } else if (d.typ === 'demo-akce' && typeof d.akce === 'string') {
        const veta = REAKCE_NA_AKCI[d.akce] ? tRef.current(REAKCE_NA_AKCI[d.akce]) : undefined;
        if (!veta) return;
        const ted = Date.now();
        // Jedna akce přijde víckrát (čtyři objednávky): jedna věta, ne čtyři.
        if (poslednireakce.current.text === veta && ted - poslednireakce.current.t < 1500) return;
        poslednireakce.current = { text: veta, t: ted };
        setReakce(veta);
        window.clearTimeout(ticho);
        ticho = window.setTimeout(() => setReakce(null), 6000);
      }
    };
    window.addEventListener('message', naZpravu);
    return () => { window.removeEventListener('message', naZpravu); window.clearTimeout(ticho); };
  }, [posli]);

  // ——— Ukázka se nenačetla: poctivě to říct ————————————————————————
  useEffect(() => {
    if (faze !== 'nacita') return;
    const t = window.setTimeout(() => setFaze(f => (f === 'nacita' ? 'selhalo' : f)), LIMIT_NACTENI_MS);
    return () => window.clearTimeout(t);
  }, [faze, klic]);

  // ——— Coach marks ——————————————————————————————————————————
  useEffect(() => {
    const k = kroky[krok];
    if (faze !== 'pripraveno' || !k) { setCoach(null); return; }
    const okno = iframe.current?.contentWindow;
    const doc = iframe.current?.contentDocument;
    if (!okno || !doc) { setCoach(null); return; }
    let prvek: HTMLElement | null = null;
    let poposunuto = false;
    let dalsi: number | undefined;

    const tik = () => {
      const obr = obrazovka.current;
      if (!obr) return;
      if (!prvek || !prvek.isConnected) prvek = k.najdi(doc);
      if (!prvek) { setCoach(null); return; }
      const r = prvek.getBoundingClientRect();
      const vyska = okno.innerHeight;
      // Prvek mimo záběr ukázky: jednou ho do záběru posuň (jen uvnitř iframe, ne celou stránku).
      if (!poposunuto && (r.top < 40 || r.bottom > vyska - 40)) {
        poposunuto = true;
        okno.scrollBy({ top: r.top - vyska * 0.35, behavior: 'smooth' });
        return;
      }
      if (r.bottom < 0 || r.top > vyska) { setCoach(null); return; }
      const W = obr.clientWidth;
      const H = obr.clientHeight;
      const x = (r.left + r.width / 2) * skala;
      const y = (r.top + r.height / 2) * skala;
      const bw = Math.min(W * 0.7, 240, k.text.length * 7 + 28);
      // Bublina radši nad prvkem: kurzor pod ní pak na prvek ukazuje zhora a nepřekrývá ho.
      const nadNim = y - (r.height / 2) * skala - 14 - 44 > 8;
      const by = nadNim ? y - (r.height / 2) * skala - 14 - 36 : y + (r.height / 2) * skala + 14;
      const bx = Math.min(Math.max(8, x - bw / 2), W - bw - 8);
      setCoach(p => (p && Math.abs(p.x - x) < 0.5 && Math.abs(p.y - y) < 0.5 && p.text === k.text && Math.abs(p.bx - bx) < 0.5 ? p : { x, y, bx, by, text: k.text }));
    };

    // Kliknutí do prvku kroku = krok splněn; další se najde, až se stránka po kliknutí usadí.
    const naKlik = (e: Event) => {
      // Bez `instanceof Node`: cíl události patří do okna iframe, jiného světa tříd než toto okno.
      const cil = e.target as Node | null;
      if (prvek && cil && prvek.contains(cil)) {
        window.clearTimeout(dalsi);
        dalsi = window.setTimeout(() => setKrok(n => n + 1), 500);
      }
    };
    doc.addEventListener('click', naKlik, true);
    tik();
    const t = window.setInterval(tik, 250);
    return () => { window.clearInterval(t); window.clearTimeout(dalsi); doc.removeEventListener('click', naKlik, true); };
    // `kroky` se mění jen s dvojicí scéna/role; `nacteni` obnoví hlídání po každém novém načtení ukázky.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faze, scena, role, krok, skala, nacteni]);

  // ——— Ovládání ———————————————————————————————————————————————
  const zvolScenu = (id: IdSceny) => {
    const s = SCENY_UKAZKY.find(x => x.id === id);
    if (!s) return;
    setScena(id); setRole(s.vychoziRole); setKrok(0); setReakce(null);
    setZar(s.vychoziZarizeni);
    aktivuj(id, s.vychoziRole);
    if (faze === 'pripraveno') posli({ typ: 'demo-scena', scena: id, role: s.vychoziRole });
  };
  const zvolRoli = (r: RoleUkazky) => {
    setRole(r); setKrok(0); setReakce(null);
    aktivuj(scena, r);
    if (faze === 'pripraveno') posli({ typ: 'demo-scena', scena, role: r });
  };
  const zacitZnovu = () => {
    setKrok(0); setReakce(null);
    if (faze === 'pripraveno') posli({ typ: 'demo-reset' });
    else aktivuj();
  };
  const nactiZnovu = () => { setKlic(k => k + 1); setFaze('nacita'); setSrc(a => a ?? sestavAdresu(scena, role)); };

  // Jiné části stránky („Ukaž v ukázce", „Zkus to sám") přepínají scénu událostí,
  // ať se s ukázkou nemusí sdílet stav ani importovat komponenta.
  const zvolRef = useRef(zvolScenu);
  zvolRef.current = zvolScenu;
  // Jeviště, které jede se stránkou, přepíná scénu potichu (`tichy`): ukázka
  // je v tu chvíli vidět, takže se nikam neroluje, a stejná scéna se znovu
  // nenačítá, ať člověku nezahodí, co si v ní právě naklikal.
  const scenaRef = useRef(scena);
  scenaRef.current = scena;
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ scena?: unknown; tichy?: unknown }>).detail;
      const id = d?.scena;
      if (!jeIdSceny(id)) return;
      if (d?.tichy) {
        if (id !== scenaRef.current) zvolRef.current(id);
        return;
      }
      zvolRef.current(id);
      const bezPohybu = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      korenRef.current?.scrollIntoView({ behavior: bezPohybu ? 'auto' : 'smooth', block: 'start' });
    };
    window.addEventListener('managero:ukazka', h);
    return () => window.removeEventListener('managero:ukazka', h);
  }, []);

  const scenaVeZvoleneRoli = scena === 'kiosk' ? 'kiosk' : role;
  const vetaDole = reakce ?? (hotovo
    ? t('Tohle všechno je celá aplikace. Projdi si ji klidně dál, nebo začni znovu.')
    : t(popisScena.zkus));

  return (
    <div ref={korenRef} id="ukazka-okno" className="relative scroll-mt-20"
      onPointerDownCapture={() => aktivuj()} onFocusCapture={() => aktivuj()}>
      {/* Přepínač scén nad rámem. Do mountu neviditelný (visibility drží místo,
          po hydrataci se nic neposune), bez skriptu by nic nedělal. */}
      <div className={`flex justify-center ${mounted ? '' : 'invisible'}`} aria-hidden={!mounted}>
        <Prepinac popis={t('Scéna ukázky')} hodnota={scena} onZmena={zvolScenu}
          moznosti={SCENY_UKAZKY.map(s => ({ id: s.id, label: t(s.label) }))} />
      </div>

      <a href="#funkce" className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:mt-2 ld-btn ld-btn-sm ld-btn-svetle">{t('Přeskočit ukázku')}</a>

      <section aria-label={t('Ukázka aplikace s vymyšlenými daty')} aria-busy={faze === 'nacita'} className="relative mt-4 ld-okno">
        <div className="ld-svetlo" aria-hidden />
        <div className="ld-stage">
        {/* Na telefonu vždy `auto` (= rám telefonu z CSS): scéna, která chce
            počítač, by jinak rozbalila široký rám do úzkého okna. */}
        <div className="ld-ram" data-zar={mobil || zar === 'auto' ? 'auto' : zar}>
          <div ref={obrazovka} className="ld-obrazovka">
            {/* Plakát: skutečný snímek první scény, v HTML hned (LCP). Pod iframem zůstává. */}
            <picture>
              <source media="(max-width: 767px)" srcSet="/brand/landing/rec/hero-prehled-telefon.webp" />
              <img src="/brand/landing/rec/hero-prehled-pocitac.webp" alt="" width={2420} height={1518}
                fetchPriority="high" decoding="async" draggable={false} />
            </picture>

            {src && faze !== 'selhalo' && (
              <iframe key={klic} ref={iframe} src={src} title={t('Živá ukázka aplikace Managero s vymyšlenými daty')}
                className="ld-iframe" data-hotovo={videt ? 'true' : 'false'}
                style={{ width: logicky.w, height: logicky.h, ['--ld-skala' as string]: skala }}
                referrerPolicy="same-origin"
                onLoad={() => posli({ typ: 'demo-ping' })} />
            )}

            {/* Coach marks. aria-hidden: pro odečítač je to dekorace, věta pod rámem říká totéž. */}
            <div className="ld-coach" aria-hidden>
              <div className="ld-coach-kurzor" data-skryt={coach ? 'false' : 'true'}
                style={coach ? { ['--x' as string]: `${coach.x}px`, ['--y' as string]: `${coach.y}px` } : undefined}>
                <span className="ld-coach-kruh" />
                <svg width="26" height="26" viewBox="0 0 28 28" className="relative">
                  <path d="M5 3l16 9.2-7 1.9-3.6 6.6z" fill="#16181A" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="ld-coach-bublina" data-skryt={coach ? 'false' : 'true'}
                style={coach ? { ['--bx' as string]: `${coach.bx}px`, ['--by' as string]: `${coach.by}px` } : undefined}>
                {coach?.text}
              </div>
              {reakce && (
                <div className="absolute left-1/2 top-3 -translate-x-1/2 max-w-[88%] rounded-full bg-[#16181A] px-3.5 py-2 text-[0.8125rem] font-semibold text-white shadow-[0_10px_28px_-8px_rgba(0,0,0,0.5)] text-center">
                  {reakce}
                </div>
              )}
            </div>

            {/* Ukázka se sama nespouští (vypnutý pohyb, úsporný přenos): tlačítko. */}
            {faze === 'plakat' && mounted && rucni && (
              <div className="absolute inset-0 z-[4] grid place-items-center bg-[#16181A]/35">
                <button type="button" onClick={() => aktivuj()} className="ld-btn ld-btn-svetle">{t('Spustit živou ukázku')}</button>
              </div>
            )}
            {faze === 'nacita' && !videt && (
              <p className="absolute bottom-3 left-1/2 z-[4] -translate-x-1/2 rounded-full bg-[#16181A] px-3 py-1.5 text-xs font-semibold text-white">{t('Načítám ukázku')}</p>
            )}
            {faze === 'selhalo' && (
              <div className="absolute inset-0 z-[4] grid place-items-center bg-[#F3F4F0]/80 p-4 text-center">
                <div>
                  <p className="text-sm font-semibold text-[#16181A]">{t('Ukázka se nenačetla.')}</p>
                  <p className="mt-1 text-sm text-black/60">{t('Podívej se na nahrávky níž, nebo to zkus znovu.')}</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <button type="button" onClick={nactiZnovu} className="btn btn-primary btn-sm">{t('Načíst znovu')}</button>
                    <a href="#den" className="btn btn-secondary btn-sm">{t('Nahrávky')}</a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Pod rámem: co si tu zkusit (a co se právě stalo), vpravo role,
            zařízení a začít znovu. Výška na dva (na telefonu čtyři) řádky:
            věty se liší délkou a přepnutí by jinak posunulo stránku. */}
        <div className="ld-dok-utlum mt-5 flex flex-col gap-4 lg:min-h-[8rem] lg:flex-row lg:items-start lg:justify-between lg:gap-8">
          <div className="min-w-0">
            <p role="status" aria-live="polite" className="max-w-[58ch] min-h-[5rem] sm:min-h-[5rem] text-[0.9375rem] leading-snug text-[color:var(--ld-text-2)] text-pretty">{vetaDole}</p>
            <p className="mt-1.5 text-xs text-[color:var(--ld-text-3)]">{t('Ukázková data, nic se neukládá ani neodesílá')}</p>
          </div>
          <div className={`flex flex-wrap items-center gap-2 shrink-0 ${mounted ? '' : 'invisible'}`} aria-hidden={!mounted}>
            {scena !== 'kiosk' && (
              <Prepinac ton="tichy" velikost="sm" popis={t('Role v ukázce')} hodnota={scenaVeZvoleneRoli as RoleUkazky} onZmena={zvolRoli}
                moznosti={ROLE_UKAZKY.map(r => ({ id: r.id, label: t(r.label) }))} />
            )}
            <div className="hidden md:block">
              <Prepinac ton="tichy" velikost="sm" popis={t('Zařízení')} hodnota={ucinne} onZmena={(v) => { setZar(v as ZarizeniUkazky); aktivuj(); }}
                moznosti={ZARIZENI_UKAZKY.map(z => ({ id: z.id, label: t(z.label) }))} />
            </div>
            <button type="button" onClick={zacitZnovu} className="ld-btn ld-btn-sm ld-btn-obrys">{t('Začít znovu')}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
