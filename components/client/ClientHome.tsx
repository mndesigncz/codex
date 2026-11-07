'use client';

// Úvod pro nepřihlášeného hosta ve směru A „Peněženka“ (předloha 06): stejný balíček karet jako na
// přihlášení (BalicekVstup, přední karta Managero client),
// nadpis „Všechny tvoje karty na jednom místě“, věta, Založit účet a Přihlásit se, pak hledání
// a seznam podniků na skle s monogramem. Barva značky podniku tu není: tvář je textura a monogram.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../Icons';
import { Skeleton } from '../ui';
import { hoursLabel } from '@/lib/clientSlots';
import { pragueToday } from '@/lib/pragueTime';
import { okJson } from '@/lib/api';
import { useT } from '@/lib/i18n/client';
import { NadpisSekce, Seznam, Radek, Monogram, PrazdnyStav } from './penezenka';
import BalicekVstup from './host/ucet/BalicekVstup';
import { useHostShell } from './ClientShell';
import './host/podnik/podnik.css';

interface Biz { slug: string; name: string; tagline: string; address: string; coverUrl: string; logoUrl?: string; hours: any; member: boolean; members: number; reservationsOn: boolean; orderingOn: boolean; loyaltyOn: boolean }

export default function ClientHome() {
  const t = useT('klient-host');
  const { otevriNajit } = useHostShell();
  const [q, setQ] = useState('');
  const [list, setList] = useState<Biz[] | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [err, setErr] = useState('');
  const today = pragueToday();

  useEffect(() => {
    const casovac = setTimeout(() => {
      fetch(`/api/client/businesses?q=${encodeURIComponent(q)}`).then(okJson)
        .then(d => { setList(d.businesses ?? []); setSignedIn(!!d.signedIn); })
        .catch(() => setErr(t('Seznam podniků se nenačetl. Zkus to za chvíli.')));
    }, q ? 250 : 0);
    return () => clearTimeout(casovac);
  }, [q]);

  const mine = (list ?? []).filter(b => b.member);
  const others = (list ?? []).filter(b => !b.member);

  return (
    <div className="mx-auto max-w-5xl">
      <section className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:gap-14 md:items-center md:pt-6">
        <div className="min-w-0">
          <BalicekVstup className="md:max-w-[440px]" />
        </div>
        <div className="min-w-0">
          <h1 className="hp-titulek">{t('Všechny tvoje karty na jednom místě')}</h1>
          <p className="hp-text text-[var(--hp-muted)] mt-3 max-w-[40ch] text-pretty">{t('Razítka, body, odměny a rezervace z kaváren a restaurací, kam chodíš.')}</p>
          {!signedIn && (
            <>
              <div className="mt-6 grid grid-cols-1 min-[360px]:grid-cols-2 gap-2">
                <Link href="/client/register" className="hp-btn hp-btn-limetka tap-target min-w-0"><Icon name="plus" size={16} strokeWidth={1.8} />{t('Založit účet')}</Link>
                <Link href="/client/login" className="hp-btn lgx hp-btn-sklo tap-target min-w-0">{t('Přihlásit se')}</Link>
              </div>
              <p className="mt-4 hp-meta">
                {t('Chceš to nejdřív vidět?')}{' '}
                <Link href="/client/demo" className="tap-target font-semibold text-[var(--hp-fg)] underline underline-offset-2">{t('Projdi si ukázku bez účtu')}</Link>
              </p>
            </>
          )}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="h-podniky">
        <NadpisSekce id="h-podniky" titulek={t('Podniky')} />
        <label htmlFor="biz-q" className="hp-pole-popis sr-only">{t('Najít podnik')}</label>
        <div className="hp-pole">
          <Icon name="search" size={18} strokeWidth={1.6} className="shrink-0 text-[var(--hp-muted)]" />
          <input id="biz-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('Název nebo ulice')} />
        </div>

        {err && <p role="alert" className="mt-3 note note-danger">{err}</p>}

        {list === null ? (
          <div className="mt-4 space-y-3" aria-busy="true"><Skeleton className="h-[66px] rounded-[22px]" /><Skeleton className="h-[66px] rounded-[22px]" /><Skeleton className="h-[66px] rounded-[22px]" /></div>
        ) : (
          <>
            {mine.length > 0 && <BizList title={t('Moje podniky')} items={mine} today={today} />}
            {others.length > 0
              ? <BizList title={mine.length ? t('Další podniky') : null} items={others} today={today} />
              : mine.length === 0 && (
                <div className="pt-6">
                  <PrazdnyStav bezIlustrace titulek={q ? t('Nic takového tu není') : t('Zatím tu není žádný podnik')}
                    text={q ? t('Zkus jiný název nebo ulici.') : t('Podniky se objeví, jakmile si Managero client zapnou.')}
                    akce={q ? undefined : <button type="button" onClick={otevriNajit} className="hp-btn lgx hp-btn-sklo hp-btn-stredni tap-target"><Icon name="tag" size={17} aria-hidden />{t('Zadat kód podniku')}</button>} />
                </div>
              )}
          </>
        )}
      </section>
    </div>
  );
}

function BizList({ title, items, today }: { title: string | null; items: Biz[]; today: string }) {
  const t = useT('klient-host');
  return (
    <div className="mt-4">
      {title && <p className="hp-meta mb-2">{title}</p>}
      <Seznam>
        {items.map(b => (
          <Radek key={b.slug} href={`/client/${b.slug}`} vlevo={<Monogram nazev={b.name} klic={b.slug} logoUrl={b.logoUrl} velikost={36} />}
            titulek={b.name}
            popis={[t('Dnes {hodiny}', { hodiny: hoursLabel(b.hours, today, cs => t(cs)) }), b.address || b.tagline].filter(Boolean).join(' · ')}
            vpravo={b.member ? <span className="hp-meta">{t('Člen')}</span> : undefined} />
        ))}
      </Seznam>
    </div>
  );
}
