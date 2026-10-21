'use client';

// Podniky (přihlášený host, audit C §6 8): hledání, filtry Otevřeno teď / Rezervace / Od stolu,
// „Moje“ s jedním číslem karty a „Další podniky“ s cestou dovnitř. Sken QR stojánku nebo stolu
// je tady v hlavičce (dřív prostřední tlačítko doku — to teď patří U kasy).

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../Icons';
import { Skeleton, EmptyState, ErrorState } from '../../ui';
import { LogoPodniku } from '../karta/KartaPodniku';
import { useCesta } from './cesty';
import { useHostShell } from '../ClientShell';
import { useHostMe, useTed } from './data';
import { hlavniKampan, stavOtevreni, popisOtevreni } from './model';
import { useT } from '@/lib/i18n/client';
import { okJson } from '@/lib/api';
import { pragueToday, pragueHM } from '@/lib/pragueTime';
import { obsahujeNekde } from '@/lib/hledani';

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

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-3">
        <h1 className="t-page flex-1 min-w-0">{t('Podniky')}</h1>
        <button type="button" onClick={otevriNajit} className="btn btn-secondary !h-11 shrink-0" aria-label={skenIkona === 'camera' ? t('Naskenovat QR kód nebo zadat kód podniku') : t('Zadat kód podniku')}>
          <Icon name={skenIkona} size={17} />{skenPopis}
        </button>
      </div>
      <div className="mt-4 relative">
        <Icon name="search" size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/45 pointer-events-none" />
        <input value={q} onChange={e => setQ(e.target.value)} type="search" placeholder={t('Název, ulice nebo kód podniku')} aria-label={t('Hledat podnik')} data-transient className="field !pl-10" />
      </div>
      <div className="mt-3 -mx-4 min-[360px]:-mx-5 sm:mx-0 px-4 min-[360px]:px-5 sm:px-0 flex gap-2 overflow-x-auto scroll-fade-x pb-1" aria-label={t('Filtry')}>
        {([['otevreno', t('Otevřeno teď')], ['rezervace', t('Rezervace')], ['odstolu', t('Od stolu')]] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filtry.has(id)} onClick={() => prepni(id)} className="h-cip shrink-0 tap-target-sm">{label}</button>
        ))}
      </div>

      <div className="mt-6 space-y-8">
        {chyba && !seznam ? <ErrorState title={t('Podniky se nenačetly')} hint={chyba} onRetry={nacti} />
          : !seznam ? <div className="space-y-3"><Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-16 rounded-2xl" /></div>
          : !vse.length ? <EmptyState icon="search" title={t('Nic takového tu není')} hint={t('Zkus jiné slovo, nebo vypni filtry.')} />
          : <>
            {moje.length > 0 && (
              <section aria-labelledby="h-moje">
                <h2 id="h-moje" className="t-label mb-2">{t('Moje')}</h2>
                <ul className="card list px-4 sm:px-5">{moje.map(b => <Radek key={b.slug} b={b} m={clenstvi.get(b.slug)} href={cesta(`/client/${b.slug}`)} dnes={dnes} hm={hm} />)}</ul>
              </section>
            )}
            {dalsi.length > 0 && (
              <section aria-labelledby="h-dalsi">
                <h2 id="h-dalsi" className="t-label mb-2">{t('Další podniky')}</h2>
                <ul className="card list px-4 sm:px-5">{dalsi.map(b => <Radek key={b.slug} b={b} href={cesta(`/client/${b.slug}`)} dnes={dnes} hm={hm} />)}</ul>
              </section>
            )}
          </>}
      </div>
    </div>
  );
}

function Radek({ b, m, href, dnes, hm }: { b: any; m?: any; href: string; dnes: string; hm: string }) {
  const t = useT('klient-host');
  const o = stavOtevreni(b.hours, dnes, hm);
  const kamp = m ? hlavniKampan(m) : null;
  const hodnota = m ? (kamp ? `${Math.min(kamp.stamps, kamp.required)}/${kamp.required}` : t('{n} b.', { n: m.points ?? 0 })) : null;
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 py-3 min-h-[64px]">
        <LogoPodniku nazev={b.name} logoUrl={b.logoUrl} barva={b.accent || null} velikost={40} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-tight truncate">{b.name}</span>
          <span className="block t-meta truncate mt-0.5">
            <span className={o.otevreno ? 'text-ok-ink font-medium' : ''}>{popisOtevreni(o, t)}</span>
            {b.address ? ` · ${b.address}` : b.tagline ? ` · ${b.tagline}` : ''}
          </span>
        </span>
        {hodnota ? <span className="text-[15px] font-semibold tabular-nums shrink-0">{hodnota}</span>
          : <span className="chip chip-sm chip-muted shrink-0">{t('Přidat se')}</span>}
        <Icon name="chevronRight" size={18} className="text-black/40 shrink-0" />
      </Link>
    </li>
  );
}
