'use client';

// Podniky (přihlášený host) ve směru A: hlavička obrazovky se skenem QR vpravo, hledání v poli,
// filtry jako čipy (Otevřeno teď / Rezervace / Od stolu), „Moje podniky“ jako zasunuté inkoustové
// karty se stavem karty vpravo a ostatní podniky jako seznam na skle s monogramem. Sken QR stojánku
// nebo stolu je tady v hlavičce (prostřední místo doku patří U kasy). Barva značky podniku nikde.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../Icons';
import { Skeleton } from '../../ui';
import { HlavickaObrazovky, NadpisSekce, Seznam, Radek, Monogram, InkoustovaKarta, PrazdnyStav } from '../penezenka';
import { useCesta } from './cesty';
import { useHostShell } from '../ClientShell';
import { useHostMe, useTed } from './data';
import { hlavniKampan, stavOtevreni, popisOtevreni } from './model';
import { useT } from '@/lib/i18n/client';
import { okJson } from '@/lib/api';
import { pragueToday, pragueHM } from '@/lib/pragueTime';
import { obsahujeNekde } from '@/lib/hledani';
import './podnik/podnik.css';

type Filtr = 'otevreno' | 'rezervace' | 'odstolu';

export default function Podniky() {
  const t = useT('klient-host');
  const cesta = useCesta();
  const { otevriNajit, skenPopis, skenIkona } = useHostShell();
  const me = useHostMe();
  const ted = useTed();
  const [seznam, setSeznam] = useState<any[] | null>(null);
  const [chyba, setChyba] = useState('');
  const [q, setQ] = useState('');
  const [filtry, setFiltry] = useState<Set<Filtr>>(new Set());
  const nacti = () => { setChyba(''); fetch('/api/client/businesses', { cache: 'no-store' }).then(okJson).then(x => setSeznam(Array.isArray(x?.businesses) ? x.businesses : [])).catch(() => setChyba(t('Seznam podniků se nenačetl.'))); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(nacti, []);
  const dnes = pragueToday(); const hm = pragueHM(ted);
  const clenstvi = useMemo(() => new Map<string, any>((me.data?.memberships ?? []).map((m: any) => [String(m.slug), m])), [me.data]);
  const prepni = (f: Filtr) => setFiltry(s => { const n = new Set(s); if (n.has(f)) n.delete(f); else n.add(f); return n; });
  const vyhovuje = (b: any) => {
    if (q.trim() && !obsahujeNekde(q, b.name, b.tagline, b.address, b.slug)) return false;
    if (filtry.has('otevreno') && !stavOtevreni(b.hours, dnes, hm).otevreno) return false;
    if (filtry.has('rezervace') && !b.reservationsOn) return false;
    if (filtry.has('odstolu') && !b.orderingOn) return false;
    return true;
  };
  const vse = (seznam ?? []).filter(vyhovuje);
  const moje = vse.filter(b => b.member || clenstvi.has(b.slug));
  const dalsi = vse.filter(b => !(b.member || clenstvi.has(b.slug)));

  const pocetMych = (seznam ?? []).filter(b => b.member || clenstvi.has(b.slug)).length;
  return (
    <div>
      <HlavickaObrazovky
        nadtitulek={pocetMych > 0 ? t('{n, plural, one {# tvůj podnik} few {# tvoje podniky} other {# tvých podniků}}', { n: pocetMych }) : undefined}
        titulek={t('Podniky')}
        vpravo={
          <button type="button" onClick={otevriNajit} className="hp-btn lgx hp-btn-sklo hp-btn-stredni hpp-sken tap-target" aria-label={skenIkona === 'camera' ? t('Naskenovat QR kód nebo zadat kód podniku') : t('Zadat kód podniku')}>
            <Icon name={skenIkona} size={18} strokeWidth={1.6} /><span className="max-[359px]:sr-only">{skenPopis}</span>
          </button>
        } />
      <div className="max-w-2xl">
      <div className="hp-pole">
        <Icon name="search" size={18} strokeWidth={1.6} className="shrink-0 text-[var(--hp-muted)]" />
        <input value={q} onChange={e => setQ(e.target.value)} type="search" placeholder={t('Název, ulice nebo kód podniku')} aria-label={t('Hledat podnik')} data-transient />
      </div>
      <div className="hpp-filtry overflow-x-auto scroll-fade-x" role="group" aria-label={t('Filtry')}>
        {([['otevreno', t('Otevřeno teď')], ['rezervace', t('Rezervace')], ['odstolu', t('Od stolu')]] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filtry.has(id)} onClick={() => prepni(id)} className="hp-cip">{label}</button>
        ))}
      </div>
      </div>

      <div className="mt-2">
        {chyba && !seznam ? (
          <div className="pt-6"><PrazdnyStav titulek={t('Podniky se nenačetly')} text={chyba} akce={<button type="button" onClick={nacti} className="hp-btn hp-btn-inkoust hp-btn-stredni tap-target">{t('Zkusit znovu')}</button>} /></div>
        ) : !seznam ? (
          <div className="mt-6 space-y-3" aria-busy="true"><Skeleton className="h-[76px] rounded-[22px]" /><Skeleton className="h-[76px] rounded-[22px]" /><Skeleton className="h-40 rounded-[22px]" /></div>
        ) : !vse.length ? (
          <div className="pt-6"><PrazdnyStav titulek={t('Nic takového tu není')} text={t('Zkus jiné slovo, nebo vypni filtry.')} /></div>
        ) : <div className={moje.length && dalsi.length ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-16' : 'max-w-2xl'}>
          {moje.length > 0 && (
            <section aria-labelledby="h-moje">
              <NadpisSekce id="h-moje" titulek={t('Moje podniky')} />
              <ul className="hpp-moje-karty">
                {moje.map(b => <li key={b.slug}><MojeKartaPodniku b={b} m={clenstvi.get(b.slug)} href={cesta(`/client/${b.slug}`)} dnes={dnes} hm={hm} /></li>)}
              </ul>
            </section>
          )}
          {dalsi.length > 0 && (
            <section aria-labelledby="h-dalsi">
              <NadpisSekce id="h-dalsi" titulek={moje.length ? t('Další podniky') : t('Podniky')} />
              <Seznam>{dalsi.map(b => <RadekPodniku key={b.slug} b={b} href={cesta(`/client/${b.slug}`)} dnes={dnes} hm={hm} />)}</Seznam>
            </section>
          )}
        </div>}
      </div>
    </div>
  );
}

/** Můj podnik: zasunutá inkoustová karta (hlavička s monogramem), vpravo stav karty. */
function MojeKartaPodniku({ b, m, href, dnes, hm }: { b: any; m?: any; href: string; dnes: string; hm: string }) {
  const t = useT('klient-host');
  const o = stavOtevreni(b.hours, dnes, hm);
  const kamp = m ? hlavniKampan(m) : null;
  const hodnota = m ? (kamp ? `${Math.min(kamp.stamps, kamp.required)} / ${kamp.required}` : t('{n} b.', { n: m.points ?? 0 })) : null;
  return (
    <InkoustovaKarta varianta="zasunuta" nazev={b.name} klic={b.slug} logoUrl={b.logoUrl} href={href}
      popis={[popisOtevreni(o, t), b.address || b.tagline].filter(Boolean).join(' · ')} hodnota={hodnota} />
  );
}

/** Další podnik: řádek seznamu s monogramem, stav otevření a adresa. */
function RadekPodniku({ b, href, dnes, hm }: { b: any; href: string; dnes: string; hm: string }) {
  const t = useT('klient-host');
  const o = stavOtevreni(b.hours, dnes, hm);
  return (
    <Radek href={href} vlevo={<Monogram nazev={b.name} klic={b.slug} logoUrl={b.logoUrl} velikost={36} />}
      titulek={b.name}
      popis={<>{popisOtevreni(o, t)}{b.address ? ` · ${b.address}` : b.tagline ? ` · ${b.tagline}` : ''}</>} />
  );
}
