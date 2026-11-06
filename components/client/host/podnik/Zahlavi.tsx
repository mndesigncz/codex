'use client';

// Záhlaví stránky podniku (směr A, předloha 04): inkoustová obálka přes celou šířku telefonu
// s velkým lehkým názvem (krátká podoba jména), nahoře Zpět · Sdílet · Uložit; pod ní v listu
// monogram 56, název, adresa, stav otevření a řada akcí Rezervovat · Menu · Navigovat · Zavolat.
// Žádná barva značky podniku: tvář dělá textura a monogram na krému.

import { useEffect, useState } from 'react';
import { Icon } from '../../../Icons';
import { useT } from '@/lib/i18n/client';
import { pragueHM } from '@/lib/pragueTime';
import { ObalkaPodniku, KruhoveTlacitko, Monogram } from '../../penezenka';
import { useCesta } from '../cesty';
import { stavOtevreni, popisOtevreni } from '../model';
import { kratkyNazev, mestoZAdresy, mapaOdkaz, telOdkaz, ulozenePodniky, nastavUlozeny } from './util';

export function ObalkaStranky({ b }: { b: any }) {
  const t = useT('klient-host');
  const cesta = useCesta();
  const [ulozeno, setUlozeno] = useState(false);
  useEffect(() => { setUlozeno(ulozenePodniky().includes(String(b.slug))); }, [b.slug]);
  const sdilet = () => {
    const url = typeof window === 'undefined' ? '' : window.location.href.split('?')[0];
    if (navigator.share) navigator.share({ title: b.name, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).catch(() => {});
  };
  const prepniUlozeni = () => { const n = !ulozeno; setUlozeno(n); nastavUlozeny(String(b.slug), n); };
  return (
    <ObalkaPodniku
      nazev={kratkyNazev(b.name)}
      nadpis={b.tagline || mestoZAdresy(b.address) || undefined}
      vlevo={<KruhoveTlacitko varianta="obalka" ikona="chevronLeft" popis={t('Zpět na podniky')} href={cesta('/client')} />}
      vpravo={<>
        <KruhoveTlacitko varianta="obalka" ikona="share" popis={t('Sdílet podnik')} onClick={sdilet} />
        <KruhoveTlacitko varianta="obalka" ikona="star" popis={t('Uložit podnik')} pressed={ulozeno} onClick={prepniUlozeni} className={ulozeno ? '!bg-white/25' : ''} />
      </>}
    />
  );
}

export function HlavickaPodniku({ b, today, bonus, onRezervovat, onMenu }: {
  b: any; today: string; bonus?: { name: string } | null; onRezervovat: (() => void) | null; onMenu: () => void;
}) {
  const t = useT('klient-host');
  const o = stavOtevreni(b.hours, today, pragueHM());
  const mapa = mapaOdkaz(b.name, b.address);
  const tel = telOdkaz(b.phone);
  return (
    <div>
      <div className="hpp-hlava">
        <Monogram nazev={b.name} klic={b.slug} logoUrl={b.logoUrl} velikost={56} />
        <div className="min-w-0">
          <h1 className="hp-titulek hpp-nazev">{b.name}</h1>
          {b.address && <p className="hp-meta mt-1 break-words">{b.address}</p>}
        </div>
      </div>
      <p className={`hpp-stav ${o.otevreno ? 'hpp-otevreno' : ''}`}>
        <i aria-hidden />
        {o.otevreno
          ? <><b>{t('Otevřeno')}</b><span className="hp-meta hp-num">{t('do {cas}', { cas: o.doKdy ?? '' })}{bonus?.name ? ` · ${bonus.name}` : ''}</span></>
          : <><b>{popisOtevreni(o, t)}</b>{bonus?.name ? <span className="hp-meta">· {bonus.name}</span> : null}</>}
      </p>
      <nav aria-label={t('Akce podniku')} className="hpp-akce">
        {onRezervovat && (
          <button type="button" onClick={onRezervovat} className="hp-btn hp-btn-inkoust hp-btn-stredni">
            <Icon name="calendar" size={18} strokeWidth={1.6} /><span>{t('Rezervovat')}</span>
          </button>
        )}
        <button type="button" onClick={onMenu} className="hp-btn lgx hp-btn-sklo hp-btn-stredni">
          <Icon name="book" size={18} strokeWidth={1.6} /><span>{t('Menu')}</span>
        </button>
        {mapa && <a href={mapa} target="_blank" rel="noopener noreferrer" className="hp-kruh lgx hp-btn-sklo tap-target" aria-label={t('Navigovat')} title={t('Navigovat')}><Icon name="navigate" size={18} strokeWidth={1.6} /></a>}
        {tel && <a href={tel} className="hp-kruh lgx hp-btn-sklo tap-target" aria-label={t('Zavolat')} title={t('Zavolat')}><Icon name="phone" size={18} strokeWidth={1.6} /></a>}
      </nav>
    </div>
  );
}
