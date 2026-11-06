'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon, LogoMark } from '@/components/Icons';
import { useT } from '@/lib/i18n/client';
import { COOKIE_ROZCESTNIK, ROZCESTNIK } from './obsah';

// Rozcestník: samostatná první obrazovka přes celé okno, rozdělená napůl. Vlevo
// podnik (inkoust, limetka), vpravo zákazník (papír), každá polovina s fotkou,
// která se prolíná do barvy poloviny. Dolů se z něj sjet nedá: stránka pod ním
// stojí (overflow v landing.css) a je inert, dokud si návštěvník nevybere.
//
// Volba se chová jako přechod na jinou stránku:
// - Zákazník: polovina se roztáhne přes celé okno a odejde se na /client/login.
// - Podnik: poloviny odjedou do stran jako dveře, adresa se změní na /?pro=podnik
//   (záznam v historii), takže tlačítko Zpět vrátí rozcestník. Volba platí do
//   zavření prohlížeče (cookie bez max-age), app/page.tsx pak rozcestník nevykreslí.
// Odkaz s kotvou (#cenik…) rozcestník skryje už před vykreslením (skript
// v components/Landing.tsx).
type Odchod = 'podnik' | 'host' | null;

export default function Rozcestnik() {
  const t = useT('landing');
  const router = useRouter();
  const ref = useRef<HTMLElement>(null);
  const [odchod, setOdchod] = useState<Odchod>(null);
  const [pryc, setPryc] = useState(false);

  const klidne = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Podnik: dveře se otevřou a pod nimi už čeká prodejní stránka.
  function doPodniku(zapsat: boolean) {
    document.cookie = `${COOKIE_ROZCESTNIK}=podnik; path=/; samesite=lax`;
    if (zapsat) window.history.pushState(null, '', '/?pro=podnik');
    window.scrollTo(0, 0);
    setOdchod('podnik');
    window.setTimeout(() => {
      setPryc(true);
      document.getElementById('nadpis-hero')?.focus({ preventScroll: true });
    }, klidne() ? 160 : 760);
  }

  function zpetNaRozcestnik() {
    document.cookie = `${COOKIE_ROZCESTNIK}=; path=/; max-age=0; samesite=lax`;
    window.scrollTo(0, 0);
    setOdchod(null);
    setPryc(false);
  }

  // Zákazník: polovina zabere celé okno, pak se přejde na jeho přihlášení.
  // Klik s modifikátorem (nová karta) nechá prohlížeči.
  function doKaret(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (odchod) return;
    setOdchod('host');
    window.setTimeout(() => router.push('/client/login'), klidne() ? 0 : 560);
  }

  // Zpět / Vpřed mezi rozcestníkem (/) a stránkou pro podniky (/?pro=podnik).
  useEffect(() => {
    const naHistorii = () => {
      if (new URLSearchParams(window.location.search).has('pro')) doPodniku(false);
      else zpetNaRozcestnik();
    };
    window.addEventListener('popstate', naHistorii);
    return () => window.removeEventListener('popstate', naHistorii);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Přišel odkazem s kotvou: rozcestník je skrytý, stránka pod ním musí žít.
  useEffect(() => {
    if (document.documentElement.dataset.bezRozcestniku !== undefined) setPryc(true);
  }, []);

  // Dokud rozcestník stojí, stránka pod ním je inert: Tab ani čtečka do ní nespadnou.
  useEffect(() => {
    const el = ref.current;
    if (pryc || !el?.parentElement) return;
    const sousede = Array.from(el.parentElement.children).filter((s): s is HTMLElement => s !== el && s instanceof HTMLElement && s.tagName !== 'SCRIPT');
    sousede.forEach((s) => (s.inert = true));
    return () => sousede.forEach((s) => (s.inert = false));
  }, [pryc]);

  if (pryc) return null;

  return (
    <section ref={ref} className="ld-rozc" data-odchazi={odchod ?? undefined} aria-labelledby="rozc-nadpis">
      <h2 id="rozc-nadpis" className="sr-only">{t(ROZCESTNIK.skupina)}</h2>

      <div className="ld-rozc-pul ld-rozc-podnik">
        <Foto src="/brand/landing/v2/majitel.webp" />
        <div className="ld-rozc-hlava">
          <span className="flex items-center gap-2.5">
            <LogoMark size={32} />
            <span className="text-lg font-bold tracking-tight">Managero</span>
          </span>
        </div>
        <SmenyNahled />
        <div className="ld-rozc-obsah">
          <p className="ld-rozc-stitek"><span className="ld-tecka" aria-hidden />{t(ROZCESTNIK.podnik.stitek)}</p>
          <h3 className="ld-rozc-nadpis">{t(ROZCESTNIK.podnik.nadpis)}</h3>
          <p className="ld-rozc-text">{t(ROZCESTNIK.podnik.text)}</p>
          <div className="ld-rozc-akce">
            <button type="button" onClick={() => !odchod && doPodniku(true)} className="ld-btn ld-rozc-hlavni ld-rozc-roztazeny">
              {t(ROZCESTNIK.podnik.hlavni)} <Icon name="chevron" size={15} className="ld-sipka -rotate-90" aria-hidden />
            </button>
            <Link href="/login" className="ld-btn ld-btn-obrys ld-rozc-nad">{t(ROZCESTNIK.podnik.vedlejsi)}</Link>
          </div>
        </div>
      </div>

      <div className="ld-rozc-pul ld-rozc-host">
        <Foto src="/brand/hero-counter.webp" />
        {/* Prázdná hlava, aby obě ilustrace začínaly ve stejné výšce. */}
        <div className="ld-rozc-hlava" aria-hidden />
        <KartaNahled />
        <div className="ld-rozc-obsah">
          <p className="ld-rozc-stitek"><span className="ld-tecka" aria-hidden />{t(ROZCESTNIK.host.stitek)}</p>
          <h3 className="ld-rozc-nadpis">{t(ROZCESTNIK.host.nadpis)}</h3>
          <p className="ld-rozc-text">{t(ROZCESTNIK.host.text)}</p>
          <div className="ld-rozc-akce">
            <Link href="/client/login" onClick={doKaret} className="ld-btn ld-rozc-hlavni ld-rozc-roztazeny">
              {t(ROZCESTNIK.host.hlavni)} <Icon name="chevron" size={15} className="ld-sipka -rotate-90" aria-hidden />
            </Link>
            <Link href="/client/register" className="ld-btn ld-btn-obrys ld-rozc-nad">{t(ROZCESTNIK.host.vedlejsi)}</Link>
          </div>
        </div>
      </div>

      <p className="ld-rozc-pozn">{t(ROZCESTNIK.jedenUcet)}</p>
    </section>
  );
}

// Fotka pozadí poloviny a závoj, který ji prolne do barvy poloviny. Obojí leží
// přímo v .ld-rozc-pul pod obsahem (z-index v landing.css); mezi tlačítkem
// a polovinou tak nepřibude nic s position, co by sebralo roztažený odkaz.
function Foto({ src }: { src: string }) {
  return (
    <>
      <Image src={src} alt="" fill priority sizes="(min-width: 768px) 60vw, 100vw" className="ld-rozc-foto" />
      <span className="ld-rozc-zavoj" aria-hidden />
    </>
  );
}

// Týden směn: sedm dní, tři lidé, jedna směna svítí. Jen obrázek, čtečka ho přeskočí.
const SMENY = [
  [1, 1, 0, 1, 1, 0, 0],
  [0, 1, 1, 2, 0, 1, 1],
  [1, 0, 1, 1, 1, 1, 0],
];
function SmenyNahled() {
  return (
    <div className="ld-rozc-vizual ld-rozc-smeny" aria-hidden>
      {SMENY.flatMap((radek, r) => radek.map((s, d) => <span key={`${r}-${d}`} data-s={s || undefined} style={{ ['--i' as string]: r * 7 + d }} />))}
    </div>
  );
}

// Věrnostní karta: osm razítek z deseti, poslední políčko je odměna.
function KartaNahled() {
  return (
    <div className="ld-rozc-vizual ld-rozc-karta" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} data-ano={i < 8 || undefined} data-odmena={i === 9 || undefined} style={{ ['--i' as string]: i }}>
          {i === 9 && <Icon name="gift" size={16} />}
        </span>
      ))}
    </div>
  );
}
