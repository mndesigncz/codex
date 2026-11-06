'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon, LogoMark } from '@/components/Icons';
import { useT } from '@/lib/i18n/client';
import { COOKIE_ROZCESTNIK, ROZCESTNIK } from './obsah';

// Rozcestník: první obrazovka prodejní stránky, rozdělená napůl. Vlevo podnik
// (inkoust, limetka), vpravo zákazník (papír). Zákazník odchází rovnou na své
// karty; podnik „otevře dveře“: poloviny odjedou do stran a pod nimi je
// prodejní stránka. Volba podniku platí do zavření prohlížeče (cookie bez
// max-age), app/page.tsx pak rozcestník nevykreslí.
//
// V toku stránky, ne překryv: kdo místo volby sroluje dolů, prostě pokračuje
// na stránku pro podniky. Odkaz s kotvou (#cenik…) ho skryje už před
// vykreslením (skript v components/Landing.tsx).
export default function Rozcestnik() {
  const t = useT('landing');
  const [odchazi, setOdchazi] = useState(false);
  const [pryc, setPryc] = useState(false);

  function otevritPodnik() {
    if (odchazi) return;
    document.cookie = `${COOKIE_ROZCESTNIK}=podnik; path=/; samesite=lax`;
    const klidne = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Rozcestník se z toku vyjme (fixed na místě) a stránka skočí nahoru, takže
    // pod odjíždějícími polovinami už čeká hero.
    window.scrollTo(0, 0);
    setOdchazi(true);
    window.setTimeout(() => {
      setPryc(true);
      document.getElementById('nadpis-hero')?.focus({ preventScroll: true });
    }, klidne ? 160 : 760);
  }

  if (pryc) return null;

  return (
    <section className="ld-rozc" data-odchazi={odchazi ? 'true' : undefined} aria-labelledby="rozc-nadpis">
      <h2 id="rozc-nadpis" className="sr-only">{t(ROZCESTNIK.skupina)}</h2>

      <div className="ld-rozc-pul ld-rozc-podnik">
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
            <button type="button" onClick={otevritPodnik} className="ld-btn ld-rozc-hlavni ld-rozc-roztazeny">
              {t(ROZCESTNIK.podnik.hlavni)} <Icon name="chevron" size={15} className="ld-sipka -rotate-90" aria-hidden />
            </button>
            <Link href="/login" className="ld-btn ld-btn-obrys ld-rozc-nad">{t(ROZCESTNIK.podnik.vedlejsi)}</Link>
          </div>
        </div>
      </div>

      <div className="ld-rozc-pul ld-rozc-host">
        {/* Prázdná hlava, aby obě ilustrace začínaly ve stejné výšce. */}
        <div className="ld-rozc-hlava" aria-hidden />
        <KartaNahled />
        <div className="ld-rozc-obsah">
          <p className="ld-rozc-stitek"><span className="ld-tecka" aria-hidden />{t(ROZCESTNIK.host.stitek)}</p>
          <h3 className="ld-rozc-nadpis">{t(ROZCESTNIK.host.nadpis)}</h3>
          <p className="ld-rozc-text">{t(ROZCESTNIK.host.text)}</p>
          <div className="ld-rozc-akce">
            <Link href="/client/login" className="ld-btn ld-rozc-hlavni ld-rozc-roztazeny">
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
