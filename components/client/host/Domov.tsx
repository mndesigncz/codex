'use client';

// Karta (domov hosta, koncept B 1 + audit C §6): pozdrav a avatar (→ Profil), MOJE KARTA s QR vždy
// po ruce (jeden kód pro všechny podniky, „Zvětšit“ otevře U kasy), pod ní karta za každý podnik
// v jeho barvě s jedním číslem a stavem „Připraveno“, a pod tím jen to, co je dnes: rezervace,
// odměna, které končí platnost, rozpracovaná objednávka. Nic dalšího — účet, souhlasy a data
// jsou v Profilu, historie v Odměnách, novinky v Aktivitě.

import Link from 'next/link';
import { useMemo } from 'react';
import { Icon } from '../../Icons';
import { Skeleton, ErrorState } from '../../ui';
import KartaPodniku from '../karta/KartaPodniku';
import { useHostMe, useKartaHosta, useTed } from './data';
import { kartaZClenstvi, pripraveneOdmeny, pozdrav, krestni, dniDo } from './model';
import { useUKasy } from './UKasy';
import { useCesta } from './cesty';
import { AvatarHosta, useHostShell } from '../ClientShell';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { RES_STATUS } from '@/lib/clientSlots';
import { pragueHM } from '@/lib/pragueTime';

export default function Domov() {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const cesta = useCesta();
  const me = useHostMe();
  const karta = useKartaHosta();
  const { otevri } = useUKasy();
  const { otevriNajit } = useHostShell();
  const ted = useTed();
  const d = me.data;
  const odmeny = useMemo(() => pripraveneOdmeny(d), [d]);
  const hodina = Number(pragueHM(ted).slice(0, 2));
  const jmeno = krestni(d?.me?.name);

  if (me.chyba && !d) return <ErrorState title={t('Karta se nenačetla')} hint={t('Zkontroluj připojení a zkus to znovu. Kód karty máš i bez signálu na offline stránce.')} onRetry={() => { void me.obnov(); }} />;

  const clenstvi: any[] = d?.memberships ?? [];
  const dnes: string = d?.today ?? '';
  const rez = (d?.reservations ?? []).filter((r: any) => r.date >= dnes && ['requested', 'confirmed'].includes(r.status))
    .sort((a: any, b: any) => (a.date + a.time).localeCompare(b.date + b.time));
  const nejblizsi = rez.find((r: any) => (dniDo(r.date, dnes) ?? 99) <= 7) ?? null;
  const konci = odmeny.filter(o => { const n = dniDo(o.validUntil, dnes); return n != null && n >= 0 && n <= 7; }).sort((a, b) => String(a.validUntil).localeCompare(String(b.validUntil)))[0] ?? null;
  const objednavka = (d?.orders ?? []).find((o: any) => ['new', 'confirmed'].includes(o.status) && String(o.created_at ?? '').slice(0, 10) === dnes) ?? null;
  const kdy = (den: string) => (den === dnes ? t('Dnes') : dniDo(den, dnes) === 1 ? t('Zítra') : fmtDatum(den, { jazyk, styl: 'denKratce' }));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex items-center gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="t-meta">{pozdrav(hodina, t)}</p>
          <h1 className="t-page !text-[28px] sm:!text-[32px] truncate">{jmeno || (d ? t('Karta') : ' ')}</h1>
        </div>
        <Link href={cesta('/client/me/profil')} className="md:hidden tap-target rounded-full shrink-0" aria-label={t('Moje')}>
          <AvatarHosta name={d?.me?.name ?? ''} size={40} />
        </Link>
      </header>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-6 md:gap-10 items-start">
        <div className="space-y-5 md:sticky md:top-24">
          {/* Moje karta: jeden kód pro všechny podniky. QR je vidět hned; „Zvětšit“ = U kasy přes celou výšku. */}
          <section aria-label={t('Moje karta')} className="h-moje p-4 sm:p-5 flex items-center gap-4">
            <button type="button" onClick={() => otevri()} className="h-qr-pole shrink-0 w-24 h-24 p-2" aria-label={t('Zvětšit QR kód karty')}>
              {karta.data?.svg ? <span dangerouslySetInnerHTML={{ __html: karta.data.svg }} className="block w-full h-full" aria-hidden />
                : <span className="block w-full h-full rounded-lg bg-black/[0.06]" aria-hidden />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="h-moje-tlume text-[13px] leading-snug">{t('Moje karta · všechny podniky')}</p>
              <p className="h-kod text-[17px] mt-1 truncate">{karta.data?.code ?? (karta.chyba ? t('Nenačetla se') : '')}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => otevri()} className="h-pilulka-sklo tap-target-sm min-w-0"><Icon name="expand" size={15} /><span className="truncate">{t('Zvětšit')}</span></button>
                <Link href={cesta('/client/me/profil#karta')} className="h-pilulka-sklo tap-target-sm min-w-0"><Icon name="card" size={15} /><span className="truncate">{t('Wallet')}</span></Link>
              </div>
            </div>
          </section>

          {(nejblizsi || konci || objednavka) && (
            <section aria-labelledby="h-dnes">
              <h2 id="h-dnes" className="sr-only">{t('Co tě čeká')}</h2>
              <ul className="card list px-4 sm:px-5">
                {nejblizsi && (() => {
                  const st = RES_STATUS[nejblizsi.status] ?? RES_STATUS.requested;
                  return (
                    <li>
                      <Link href={cesta(`/client/${nejblizsi.slug}?tab=reserve&rezervace=${nejblizsi.id}`)} className="flex items-center gap-3 py-3.5 min-h-[64px]">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#C8F542] on-accent" aria-hidden><Icon name="calendar" size={18} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold leading-tight cz-sentence">{kdy(nejblizsi.date)} {nejblizsi.time} · {t('{n, plural, one {# osoba} few {# osoby} other {# osob}}', { n: nejblizsi.party })}</span>
                          <span className="block t-meta truncate mt-0.5">{[nejblizsi.business, nejblizsi.note, t(st.label).toLowerCase()].filter(Boolean).join(' · ')}</span>
                        </span>
                        <Icon name="chevronRight" size={18} className="text-black/40 shrink-0" />
                      </Link>
                    </li>
                  );
                })()}
                {konci && (
                  <li>
                    <Link href={cesta('/client/me/odmeny')} className="flex items-center gap-3 py-3.5 min-h-[64px]">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/[0.05]" aria-hidden><Icon name="gift" size={18} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold leading-tight truncate">{konci.title}</span>
                        <span className="block t-meta truncate mt-0.5">{konci.business} · <span className="text-wait-ink font-medium">{(() => { const n = dniDo(konci.validUntil, dnes) ?? 0; return n === 0 ? t('platí jen dnes') : t('ještě {n, plural, one {# den} few {# dny} other {# dní}}', { n }); })()}</span></span>
                      </span>
                      <Icon name="chevronRight" size={18} className="text-black/40 shrink-0" />
                    </Link>
                  </li>
                )}
                {objednavka && (
                  <li>
                    <Link href={cesta(`/client/${objednavka.slug}?tab=order`)} className="flex items-center gap-3 py-3.5 min-h-[64px]">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/[0.05]" aria-hidden><Icon name="cup" size={18} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold leading-tight">{objednavka.status === 'new' ? t('Objednávka čeká na obsluhu') : t('Objednávka se připravuje')}</span>
                        <span className="block t-meta truncate mt-0.5">{objednavka.business}</span>
                      </span>
                      <Icon name="chevronRight" size={18} className="text-black/40 shrink-0" />
                    </Link>
                  </li>
                )}
              </ul>
            </section>
          )}
        </div>

        <section aria-labelledby="h-podniky" className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 id="h-podniky" className="t-section">{t('Moje podniky')}</h2>
            <Link href={cesta('/client')} className="tap-target-sm text-sm font-medium text-black/60 hover:text-black inline-flex items-center gap-0.5 shrink-0">{t('Najít podnik')}<Icon name="chevronRight" size={15} /></Link>
          </div>
          {!d ? (
            <div className="space-y-3"><Skeleton className="h-40 rounded-[20px]" /><Skeleton className="h-40 rounded-[20px]" /></div>
          ) : clenstvi.length ? (
            <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {clenstvi.map(m => {
                const vm = kartaZClenstvi(m, odmeny, t);
                return (
                  <li key={m.slug} className="min-w-0">
                    {/* Dvě karty vedle sebe (lg) mají stejnou výšku — razítka vedle bodů s lištou byla nižší. */}
                    <KartaPodniku {...vm} className="h-full" href={cesta(`/client/${m.slug}`)}
                      ariaLabel={[m.name, `${vm.cislo} ${vm.jednotka ?? ''}`, vm.pripraveno ? t('Odměna připravena') : '', vm.veta ?? ''].filter(Boolean).join(', ')} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="card p-5 sm:p-6">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-black/[0.05]" aria-hidden><Icon name="location" size={22} /></span>
              <h3 className="mt-4 t-card !text-[17px]">{t('Přidej první podnik')}</h3>
              <p className="mt-1 t-meta text-pretty max-w-[34ch]">{t('Naskenuj QR kód na stojánku nebo podnik najdi. Uvítací body dostaneš hned.')}</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button type="button" onClick={otevriNajit} className="btn btn-accent !h-[52px] min-w-0"><Icon name="camera" size={17} />{t('Naskenovat')}</button>
                <Link href={cesta('/client')} className="btn btn-secondary !h-[52px] min-w-0">{t('Najít podnik')}</Link>
              </div>
            </div>
          )}
          {odmeny.length > 0 && (
            <p className="mt-4 t-meta text-pretty">
              {t('{n, plural, one {# odměna čeká} few {# odměny čekají} other {# odměn čeká}} na uplatnění. U kasy si ji přibalíš jedním přepínačem.', { n: odmeny.length })}{' '}
              <Link href={cesta('/client/me/odmeny')} className="font-semibold text-black/80 underline underline-offset-2 tap-target-sm">{t('Odměny')}</Link>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
