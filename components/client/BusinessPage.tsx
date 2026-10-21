'use client';

// Stránka podniku jako jeho mini-web (koncept B 2, audit C §6 4). Hlavička v barvě podniku
// (logo, název, „Otevřeno do 20:00 · adresa“), pod ní řada čtyř akcí Rezervovat · Menu · Navigovat ·
// Zavolat (bez telefonu Sdílet), pak moje karta razítek s daty návštěv (nebo vstup do členství
// s tím, co host dostane hned), „Dnes“ (běžící bonus a bannery), žebříček odměn (co za razítka
// a body dostaneš), moje rezervace tady, akce, menu, novinky a informace. Žádné záložky pod
// ohybem: všechno je na jedné stránce a akce nahoře na ně skočí. Objednávka od stolu (QR na stole,
// ?tab=order) má vlastní pohled se šipkou zpět. Barva podniku jen v hlavičce a na kartě.

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Icon } from '../Icons';
import { Skeleton, EmptyState, ErrorState } from '../ui';
import TableMap, { placedTables } from './TableMap';
import { onAccent } from '@/lib/floorplan';
import { RES_STATUS } from '@/lib/clientSlots';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum, fmtDenVTydnu, fmtMesic } from '@/lib/i18n/format';
import { pragueHM } from '@/lib/pragueTime';
import { useModal } from '@/lib/useModal';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { formatMoney, formatPrice, currencySymbol } from '@/lib/money';
import { okJson, apiMessage } from '@/lib/api';
import { buildIcs, downloadIcs } from '@/lib/ics';
import { DiscardGuard } from '../ui/DiscardGuard';
import PromoBanners from './PromoBanners';
import { SkonceneKarticky } from './loyalty/KartaRazitek';
import HostHistorie from './loyalty/HostHistorie';
import HostPravidla from './loyalty/HostPravidla';
import { PlatnostKuponu } from './loyalty/HostPlatnost';
import { LogoPodniku, barvyKarty, stylKarty } from './karta/KartaPodniku';
import RazitkaMrizka from './karta/RazitkaMrizka';
import Rezervace from './host/Rezervace';
import { useCesta } from './host/cesty';
import { obnovHosta } from './host/data';
import { stavOtevreni, popisOtevreni } from './host/model';

export default function BusinessPage({ slug }: { slug: string }) {
  // Jazyk stránky je jazyk hosta (?lang=, cookie, jazyk prohlížeče; viz lib/i18n/client).
  // Texty podniku (název, popis, novinky) se nepřekládají, jsou to obsah podniku.
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const cesta = useCesta();
  const [d, setD] = useState<any | null>(null);
  const [notFound, setNotFound] = useState(false);
  /** Nepovedlo se načíst — na rozdíl od „podnik neexistuje" se dá zkusit znovu. */
  const [loadErr, setLoadErr] = useState('');
  const [dotaz] = useState(() => (typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)));
  // QR na stole vede rovnou na objednávku: /client/<podnik>?tab=order&table=3
  const [objednavka, setObjednavka] = useState(() => dotaz.get('tab') === 'order');
  const [rezervace, setRezervace] = useState(false);
  const [flash, setFlash] = useState('');
  const [joining, setJoining] = useState(false);
  // „Chci novinky od <podnik>“ při vstupu do členství (spuštění, balík G): výchozí NE.
  const [chciNovinky, setChciNovinky] = useState(false);
  // „Podnik tu není" smí zaznít **jen** na 404 — výpadek wifi není neexistující kavárna.
  const load = useCallback(() => {
    setLoadErr('');
    return fetch(`/api/client/b/${encodeURIComponent(slug)}?lang=${jazyk}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        return okJson(r);
      })
      .then(x => { if (x) { setD(x); setNotFound(false); } })
      .catch(e => setLoadErr(apiMessage(e, t('Stránku podniku se nepodařilo načíst.'))));
  }, [slug, jazyk, t]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (flash) { const i = setTimeout(() => setFlash(''), 4500); return () => clearTimeout(i); } }, [flash]);
  // ?tab=reserve: s ?rezervace=ID skok na moji rezervaci (připomínka), bez něj rovnou okno rezervace.
  // ?tab=loyalty: skok na kartu a odměny.
  const skocil = useRef(false);
  useEffect(() => {
    if (!d || skocil.current) return;
    skocil.current = true;
    const tab = dotaz.get('tab');
    const kam = tab === 'reserve' && dotaz.get('rezervace') ? `rezervace-${dotaz.get('rezervace')}` : tab === 'loyalty' ? 'vernost' : tab === 'menu' ? 'menu' : null;
    if (tab === 'reserve' && !dotaz.get('rezervace') && d.business?.reservationsOn) setRezervace(true);
    if (kam) setTimeout(() => document.getElementById(kam)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 200);
  }, [d, dotaz]);

  if (notFound) return <EmptyState icon="location" title={t('Podnik tu není')} hint={t('Buď má jinou adresu, nebo Managero client zatím nezapnul.')} action={<Link href={cesta('/client')} className="tap-target btn btn-secondary">{t('Zpět na podniky')}</Link>} />;
  if (loadErr && !d) return (
    <ErrorState
      title={t('Stránka podniku se nenačetla')}
      hint={`${/[.!?…]$/.test(loadErr) ? loadErr : loadErr + '.'} ${t('Podnik tu nejspíš je — jen se k němu teď nedovoláme.')}`}
      onRetry={() => { void load(); }}
    />
  );
  if (!d) return <div className="space-y-4"><Skeleton className="h-56 rounded-[28px]" /><Skeleton className="h-20 rounded-3xl" /><Skeleton className="h-64 rounded-3xl" /></div>;

  const b = d.business; const me = d.me; const today: string = d.today;
  const accent: string = b.accent || '#C8F542';
  const lzeObjednat = !!b.orderingOn && (d.tables?.length ?? 0) > 0;
  const join = async () => {
    if (joining) return;
    setJoining(true);
    try {
      const r = await fetch(`/api/client/b/${encodeURIComponent(slug)}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ novinky: chciNovinky }) });
      if (r.status === 401) { window.location.href = `/client/login?next=${encodeURIComponent('/client/' + slug)}`; return; }
      if (r.ok) { setFlash(chciNovinky ? t('Jsi členem. Novinky ti budou chodit, vypnout je jde v profilu.') : t('Jsi členem. Vítej.')); load(); void obnovHosta(); return; }
      const x = await r.json().catch(() => ({}));
      setFlash(x.error ? t(x.error) : t('Přidat se teď nepovedlo. Zkus to prosím znovu.'));
    } finally { setJoining(false); }
  };
  const skok = (id: string) => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });

  if (objednavka && lzeObjednat) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setObjednavka(false)} className="tap-target btn-icon shrink-0" aria-label={t('Zpět na stránku podniku')}><Icon name="arrowLeft" size={17} /></button>
          <div className="min-w-0">
            <p className="t-meta truncate">{b.name}</p>
            <h1 className="t-page !text-[26px]">{t('Objednat od stolu')}</h1>
          </div>
        </div>
        {flash && <p role="status" className="toast-in note note-ok">{flash}</p>}
        <OrderTab slug={slug} b={b} menu={d.menu} tables={d.tables ?? []} plan={d.plan} signedIn={d.signedIn} onDone={(m: string) => { setFlash(m); }} />
      </div>
    );
  }

  return (
    <div>
      <Hlavicka b={b} today={today} onRezervovat={b.reservationsOn ? () => setRezervace(true) : null} onMenu={() => skok('menu')} />

      <div className="mt-5 space-y-8 sm:space-y-10">
        {flash && <p role="status" className="toast-in note note-ok">{flash}</p>}

        {/* Členství: karta podniku s razítky a daty návštěv, nebo vstup s tím, co host dostane hned. */}
        <section id="vernost" aria-label={t('Věrnost')} className="scroll-mt-6 space-y-3">
          {me?.member ? <MojeKarta b={b} me={me} today={today} accent={b.accent} /> : b.loyaltyOn ? (
            <div className="card p-4 sm:p-5" data-vstup-clenstvi>
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/[0.05]" aria-hidden><Icon name="gift" size={18} /></span>
                <div className="min-w-0">
                  <p className="t-card !text-[17px]">{b.welcomePoints > 0 ? t('Přidej se a dostaneš hned {n} bodů', { n: b.welcomePoints }) : t('Přidej se a sbírej razítka a body')}</p>
                  <p className="t-meta mt-0.5 text-pretty">
                    {(d.stampCampaigns ?? [])[0] ? t('{n, plural, one {# razítko} few {# razítka} other {# razítek}} a {odmena} je tvoje. Kód ukážeš u kasy, nic dalšího.', { n: d.stampCampaigns[0].required, odmena: d.stampCampaigns[0].reward || t('odměna') })
                      : t('{body} bodů za každých {castka} útraty. Kód ukážeš u kasy, nic dalšího.', { body: b.pointsPer100, castka: formatMoney(100, b.currency) })}
                  </p>
                </div>
              </div>
              <button type="button" onClick={join} disabled={joining} className="mt-4 tap-target btn w-full !h-[52px] disabled:opacity-60"
                style={{ background: accent, color: onAccent(accent) }}><Icon name="plus" size={16} /> {t('Stát se členem')}</button>
              {/* Souhlas s novinkami je dobrovolný a po podnicích: výchozí NE, jde změnit v profilu. */}
              <label className="mt-1 min-h-[44px] flex items-center gap-2.5 text-sm cursor-pointer select-none text-black/70">
                <input type="checkbox" checked={chciNovinky} onChange={e => setChciNovinky(e.target.checked)} className="h-5 w-5 shrink-0 accent-[#16181A]" />
                <span className="min-w-0 break-words">{t('Chci novinky od {podnik}', { podnik: b.name })}</span>
              </label>
            </div>
          ) : null}
        </section>

        {/* Dnes: běžící bonus („Dnes dvojnásobné body do 18:00“) a bannery podniku (data podniku). */}
        {((d.bonus && b.loyaltyOn) || (d.banners?.length ?? 0) > 0) && (
          <section aria-label={t('Dnes')} className="space-y-3">
            {d.bonus && b.loyaltyOn && <BonusPruh bonus={d.bonus} accent={accent} />}
            {(d.banners?.length ?? 0) > 0 && <PromoBanners banners={d.banners} accent={accent} loyaltyOn={!!b.loyaltyOn} onGoTab={tab => skok(tab === 'loyalty' ? 'odmeny-podniku' : 'menu')} slug={slug} />}
          </section>
        )}

        {b.loyaltyOn && <Zebricek slug={slug} b={b} me={me} today={today} campaigns={d.stampCampaigns ?? []} coupons={d.coupons ?? []} signedIn={d.signedIn} onDone={(m: string) => { setFlash(m); load(); void obnovHosta(); }} />}

        {d.signedIn && b.reservationsOn && (me?.reservations?.length ?? 0) > 0 && <MojeRezervace slug={slug} me={me} onDone={(m: string) => { setFlash(m); load(); }} />}

        {(d.events?.length ?? 0) > 0 && <Akce events={d.events} b={b} slug={slug} signedIn={d.signedIn} />}

        <section id="menu" aria-labelledby="h-menu" className="scroll-mt-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 id="h-menu" className="t-section">{t('Menu')}</h2>
            {lzeObjednat && <button type="button" onClick={() => { setObjednavka(true); window.scrollTo({ top: 0 }); }} className="btn btn-secondary btn-sm !h-9 shrink-0"><Icon name="cup" size={15} />{t('Objednat od stolu')}</button>}
          </div>
          <Menu menu={d.menu} currency={b.currency} />
        </section>

        {(d.news?.length ?? 0) > 0 && (
          <section aria-labelledby="h-novinky">
            <h2 id="h-novinky" className="t-section mb-3">{t('Novinky')}</h2>
            <ul className="card list px-4 sm:px-5">
              {d.news.map((n: any) => (
                <li key={n.id} className="py-3.5">
                  <p className="text-[15px] font-semibold leading-snug">{n.title}</p>
                  {n.body && <p className="text-sm text-black/65 mt-0.5 text-pretty">{n.body}</p>}
                  <p className="t-meta mt-1 cz-sentence">{fmtDatum(String(n.sent_at).slice(0, 10), { jazyk, styl: 'denDlouze' })}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Info b={b} gallery={b.gallery} />

        {b.loyaltyOn && (
          <section aria-labelledby="h-pravidla" className="card p-4 sm:p-5">
            <h2 id="h-pravidla" className="sr-only">{t('Pravidla věrnosti')}</h2>
            <HostPravidla b={b} campaigns={d.stampCampaigns ?? []} />
            {me?.member && <SkonceneKarticky list={me.endedCampaigns ?? []} />}
            {d.signedIn && <HostHistorie slug={slug} className="mt-5 border-t border-black/[0.06] pt-4" />}
            <p className="mt-4 t-meta text-pretty">{t('Máš promo kód nebo dárkový poukaz?')} <Link href={cesta('/client/me/odmeny')} className="font-semibold text-black/80 underline underline-offset-2 tap-target-sm">{t('Zadej ho v Odměnách')}</Link></p>
          </section>
        )}
      </div>

      {rezervace && <Rezervace slug={slug} nazev={b.name} adresa={b.address} maxOsob={b.maxParty || 8} dnes={today} prihlasen={!!d.signedIn} onClose={() => setRezervace(false)} onHotovo={() => { load(); }} />}
    </div>
  );
}

/** Hlavička v barvě podniku + řada akcí. Na telefonu přes celou šířku až k hornímu okraji. */
function Hlavicka({ b, today, onRezervovat, onMenu }: { b: any; today: string; onRezervovat: (() => void) | null; onMenu: () => void }) {
  const t = useT('klient-host');
  const cesta = useCesta();
  const { bg, ink } = barvyKarty(b.accent);
  const o = stavOtevreni(b.hours, today, pragueHM());
  const mapa = b.address ? `https://mapy.cz/zakladni?q=${encodeURIComponent(`${b.name}, ${b.address}`)}` : null;
  const sdilet = () => {
    const url = typeof window === 'undefined' ? '' : window.location.href.split('?')[0];
    if (navigator.share) navigator.share({ title: b.name, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).catch(() => {});
  };
  const akce: { key: string; label: string; icon: string; onClick?: () => void; href?: string }[] = [
    ...(onRezervovat ? [{ key: 'r', label: t('Rezervovat'), icon: 'calendar', onClick: onRezervovat }] : []),
    { key: 'm', label: t('Menu'), icon: 'menu', onClick: onMenu },
    ...(mapa ? [{ key: 'n', label: t('Navigovat'), icon: 'navigate', href: mapa }] : []),
    b.phone ? { key: 'z', label: t('Zavolat'), icon: 'phone', href: `tel:${String(b.phone).replace(/\s/g, '')}` } : { key: 's', label: t('Sdílet'), icon: 'share', onClick: sdilet },
  ];
  return (
    <div>
      <section className="h-karta -mx-4 min-[360px]:-mx-5 sm:mx-0 -mt-[max(env(safe-area-inset-top),20px)] md:mt-0 !rounded-t-none sm:!rounded-t-[28px] !rounded-b-[28px] !px-5 sm:!px-7 pt-[calc(max(env(safe-area-inset-top),20px)+4px)] md:pt-6 pb-12"
        style={{ ['--k-bg' as any]: bg, ['--k-ink' as any]: ink }}>
        <div className="flex items-center justify-between">
          <Link href={cesta('/client')} className="tap-target grid h-10 w-10 place-items-center rounded-full" style={{ background: 'color-mix(in srgb, var(--k-ink) 16%, transparent)' }} aria-label={t('Zpět na podniky')}><Icon name="chevronLeft" size={18} /></Link>
          <button type="button" onClick={sdilet} className="tap-target grid h-10 w-10 place-items-center rounded-full" style={{ background: 'color-mix(in srgb, var(--k-ink) 16%, transparent)' }} aria-label={t('Sdílet podnik')}><Icon name="share" size={17} /></button>
        </div>
        <div className="mt-5 flex items-end gap-4">
          <LogoPodniku nazev={b.name} logoUrl={b.logoUrl} velikost={64} />
        </div>
        <h1 className="mt-4 text-[1.875rem] sm:text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.025em] text-balance break-words" style={{ color: 'var(--k-ink)' }}>{b.name}</h1>
        <p className="mt-2 text-[14px] flex flex-wrap items-center gap-x-1.5 gap-y-0.5 h-karta-tlume">
          <span className={`h-2 w-2 rounded-full shrink-0 ${o.otevreno ? 'bg-[#C8F542]' : 'h-karta-linka'}`} aria-hidden />
          <span>{popisOtevreni(o, t)}</span>
          {b.address && <span className="min-w-0 break-words">· {b.address}</span>}
        </p>
      </section>
      <nav aria-label={t('Akce podniku')} className="card -mt-8 mx-1 sm:mx-6 relative px-2 py-2 h-akce">
        {akce.map(a => a.href
          ? <a key={a.key} href={a.href} target={a.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"><span className="h-akce-kruh" aria-hidden><Icon name={a.icon} size={18} /></span>{a.label}</a>
          : <button key={a.key} type="button" onClick={a.onClick}><span className="h-akce-kruh" aria-hidden><Icon name={a.icon} size={18} /></span>{a.label}</button>)}
      </nav>
    </div>
  );
}

/** Moje karta v podniku: razítka s daty návštěv (kampaně), body, úroveň, kredit a co propadá. */
function MojeKarta({ b, me, today, accent }: { b: any; me: any; today: string; accent: string | null }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const datum = (x: string) => fmtDatum(x, { jazyk, styl: 'kratce' });
  const kampane: any[] = (me.campaigns ?? []).filter((c: any) => Number(c.required) > 0);
  const souhrn = (
    <p className="text-[13px] h-karta-tlume mt-3 flex flex-wrap gap-x-3 gap-y-1">
      <span className="tabular-nums">{t('{n} b.', { n: me.points })}</span>
      {me.levelLabel && <span>{t(me.levelLabel)}{me.discount > 0 ? ` · ${me.discountSource === 'skupina' && me.discountName ? t('sleva {n} % ({skupina})', { n: me.discount, skupina: me.discountName }) : t('sleva {n} %', { n: me.discount })}` : ''}</span>}
      {me.credit > 0 && <span className="tabular-nums">{t('{castka} kreditu', { castka: formatMoney(me.credit, b.currency) })}</span>}
    </p>
  );
  const upozorneni = (
    <>
      {me.expiring && <p className="mt-2 text-xs font-semibold text-wait-ink">{t('{n, plural, one {# bod propadne} few {# body propadnou} other {# bodů propadne}} do {kdy}', { n: me.expiring.points, kdy: denKratce(me.expiring.till) })}</p>}
      {me.creditExpiring && <p className="mt-1 text-xs font-semibold text-wait-ink">{t('Kredit {castka} propadne do {kdy}', { castka: formatMoney(me.creditExpiring.amount, b.currency), kdy: denKratce(me.creditExpiring.till) })}</p>}
      {me.levelDegraded && <p className="mt-1 t-meta">{t('Úroveň je dočasně snížená, dlouho jsme tě neviděli. Stačí přijít.')}</p>}
      {me.nextTierAt && <p className="mt-1 t-meta">{me.nextTierUnit === 'spend' ? t('do „{level}“ ještě {castka}', { level: t(me.nextTierLabel), castka: formatMoney(Math.max(0, me.nextTierAt - (me.spend ?? 0)), b.currency) }) : t('do „{level}“ ještě {n, plural, one {# návštěva} few {# návštěvy} other {# návštěv}}', { level: t(me.nextTierLabel), n: Math.max(0, me.nextTierAt - me.visits) })}</p>}
    </>
  );
  if (!kampane.length) {
    return (
      <div>
        <div className="h-karta" style={stylKarty(accent)}>
          <p className="text-[15px] font-semibold">{b.stampTarget > 0 && !(me.campaigns?.length) ? t('Moje razítka') : t('Moje body')}</p>
          {b.stampTarget > 0 && !(me.campaigns?.length) ? (
            <div className="mt-3">
              <RazitkaMrizka pocet={me.stamps} cil={b.stampTarget} popis={t('{stamps} z {target} razítek', { stamps: me.stamps, target: b.stampTarget })} />
              <p className="mt-3 text-[13px] h-karta-tlume">{t('Za {n, plural, one {# návštěvu} few {# návštěvy} other {# návštěv}}:', { n: b.stampTarget })} {b.stampReward || t('odměna')}</p>
            </div>
          ) : (
            <p className="mt-3 flex items-baseline gap-1.5"><span className="text-[2.125rem] font-semibold leading-none tabular-nums tracking-[-0.03em]">{me.points}</span><span className="h-karta-tlume">{t('b.')}</span></p>
          )}
          {souhrn}
        </div>
        {upozorneni}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {kampane.map(k => {
        const zbyva = Math.max(0, k.required - k.stamps);
        return (
          <div key={k.id} id={`karta-${k.id}`}>
            <div className="h-karta" style={stylKarty(k.color || accent)}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[15px] font-semibold min-w-0 truncate">{k.name || t('Moje razítka')}</p>
                <p className="text-[13px] font-semibold tabular-nums h-karta-tlume shrink-0">{k.stamps} / {k.required}</p>
              </div>
              <div className="mt-3"><RazitkaMrizka pocet={k.stamps} cil={k.required} data={me.razitkaData?.[String(k.id)] ?? []} popis={t('{name}: {stamps} z {required} razítek', { name: k.name, stamps: k.stamps, required: k.required })} /></div>
              <p className="mt-3 text-[13px] h-karta-tlume text-pretty">
                {zbyva > 0 ? t('Ještě {n, plural, one {# razítko} few {# razítka} other {# razítek}} do odměny {odmena}', { n: zbyva, odmena: k.reward || t('odměna') }) : t('Karta je plná — {odmena} je připravená', { odmena: k.reward || t('odměna') })}
                {k.validTill ? ` · ${t('Kartička platí do {datum}.', { datum: datum(k.validTill) })}` : ''}
              </p>
              {k.expired && <p role="status" className="mt-1.5 text-xs font-semibold">{t('Rozdělaná karta vypršela, {n, plural, one {# razítko propadlo} few {# razítka propadla} other {# razítek propadlo}}. Další razítko začne novou kartu.', { n: k.expiredStamps })}</p>}
              {!k.expired && k.finishBy && k.stamps > 0 && <p className="mt-1.5 text-xs font-semibold">{k.daysLeft === 0 ? t('Dosbírej kartu dnes, jinak razítka propadnou.') : t('Dosbírej kartu do {datum}, jinak razítka propadnou.', { datum: datum(k.finishBy) })}</p>}
              {k.nextCardFrom && <p className="mt-1.5 text-xs h-karta-tlume">{t('Další kartu jde sbírat od {datum}.', { datum: datum(k.nextCardFrom) })}</p>}
              {k.finishedForever && <p className="mt-1.5 text-xs h-karta-tlume">{k.limit > 1 ? t('Limit karet je splněný ({n}×).', { n: k.limit }) : t('Tuhle kartu už máš dokončenou, další se nesbírá.')}</p>}
              {k.okno && (k.okno.days?.length || k.okno.from) && <p className="mt-1.5 text-xs h-karta-tlume">{t('Razítko dává jen {kdy}.', { kdy: [k.okno.days?.length ? k.okno.days.map((x: number) => fmtDenVTydnu(x - 1, { jazyk })).join(', ') : '', k.okno.from && k.okno.till ? `${k.okno.from}–${k.okno.till}` : ''].filter(Boolean).join(', ') })}</p>}
              {k.conditions && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer font-semibold tap-target-sm">{t('Podmínky')}</summary>
                  <p className="mt-1 whitespace-pre-line text-pretty h-karta-tlume">{k.conditions}</p>
                </details>
              )}
              {souhrn}
            </div>
          </div>
        );
      })}
      {upozorneni}
    </div>
  );
}

/** Žebříček odměn: co za razítka (kampaně) a za body (kupony) dostaneš; připravené odměny s kódem. */
function Zebricek({ slug, b, me, today, campaigns, coupons, signedIn, onDone }: { slug: string; b: any; me: any; today: string; campaigns: any[]; coupons: any[]; signedIn: boolean; onDone: (m: string) => void }) {
  const t = useT('klient-host');
  const cesta = useCesta();
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const claim = async (id: number) => {
    if (!signedIn) { window.location.href = `/client/login?next=${encodeURIComponent('/client/' + slug)}`; return; }
    setBusy(id); setErr('');
    try {
      const r = await fetch(`/api/client/b/${encodeURIComponent(slug)}/coupons/${id}/claim`, { method: 'POST' });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(x.error ? t(x.error) : t('Kupon se nepodařilo vzít.')); return; }
      onDone(t('Kupon je tvůj. Kód {kod} ukaž u kasy.', { kod: x.code }));
    } catch {
      setErr(t('Kupon se nepodařilo vzít — vypadlo připojení. Zkus to znovu.'));
    } finally { setBusy(null); }
  };
  const mojeKampane = new Map<number, any>((me?.campaigns ?? []).map((c: any) => [Number(c.id), c]));
  const kampane = (campaigns ?? []).filter((c: any) => Number(c.required) > 0);
  const claims: any[] = me?.claims ?? [];
  if (!kampane.length && !(coupons ?? []).length && !claims.length) return null;
  return (
    <section id="odmeny-podniku" aria-labelledby="h-zebricek" className="scroll-mt-6 space-y-3">
      <h2 id="h-zebricek" className="t-section">{t('Co dostaneš')}</h2>
      {err && <p role="alert" className="note note-danger">{err}</p>}
      {claims.length > 0 && (
        <ul className="card list px-4 sm:px-5" aria-label={t('Připravené odměny')}>
          {claims.map((c: any) => (
            <li key={c.id} className="list-row !py-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#C8F542] text-[#16181A]" aria-hidden><Icon name="gift" size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-tight truncate">{c.title}</p>
                <PlatnostKuponu validUntil={c.valid_until} today={today} className="block t-meta mt-0.5" />
              </div>
              <Link href={cesta('/client/me/odmeny')} className="h-kod text-[14px] shrink-0 well px-2.5 py-1.5">{c.code}</Link>
            </li>
          ))}
        </ul>
      )}
      {(kampane.length > 0 || (coupons ?? []).length > 0) && (
        <ul className="card list px-4 sm:px-5">
          {kampane.map((k: any) => {
            const muj = mojeKampane.get(Number(k.id));
            const zbyva = muj ? Math.max(0, Number(k.required) - Number(muj.stamps)) : Number(k.required);
            return (
              <li key={`k${k.id}`} className="list-row !py-3.5">
                <span className="w-10 shrink-0 text-[17px] font-semibold tabular-nums">{k.required}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium leading-tight">{k.reward || k.name}</p>
                  <p className="t-meta mt-0.5">{t('{n, plural, one {# razítko} few {# razítka} other {# razítek}}', { n: k.required })}{k.rewardItems?.length ? ` · ${k.rewardItems.join(', ')}` : ''}</p>
                </div>
                <span className="text-[13px] text-black/55 shrink-0 tabular-nums">{muj ? (zbyva === 0 ? t('připraveno') : t('zbývá {n}', { n: zbyva })) : ''}</span>
              </li>
            );
          })}
          {(coupons ?? []).map((c: any) => {
            const cena = Number(c.cost_points) || 0;
            const can = me?.member && Number(me.points) >= cena && !c.blocked;
            const chybi = me?.member ? Math.max(0, cena - Number(me.points)) : 0;
            return (
              <li key={c.id} id={`kupon-${c.id}`} className={`list-row !py-3.5 !gap-3 ${c.blocked ? 'opacity-60' : ''}`}>
                <span className="w-10 shrink-0 text-[15px] font-semibold tabular-nums leading-tight">{cena === 0 ? t('zdarma') : t('{n} b.', { n: cena })}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium leading-snug">{c.title}{c.benefit && <span className="ml-2 chip chip-sm chip-ok align-middle">{c.benefit}</span>}</p>
                  {c.description && <p className="text-sm text-black/55 text-pretty">{c.description}</p>}
                  {(c.badges?.length > 0 || c.valid_until) && (
                    <p className="text-xs text-black/55 mt-0.5">
                      {(c.badges ?? []).join(' · ')}{c.badges?.length > 0 && c.valid_until ? ' · ' : ''}
                      <PlatnostKuponu validUntil={c.valid_until} today={today} />
                    </p>
                  )}
                  {c.blocked && <p className="text-xs text-wait-ink mt-0.5">{t(c.blocked)}</p>}
                  {!c.blocked && chybi > 0 && <p className="text-xs text-black/55 mt-0.5 tabular-nums">{t('chybí {n} b.', { n: chybi })}</p>}
                </div>
                <button type="button" onClick={() => claim(c.id)} disabled={busy === c.id || (signedIn && me?.member && !can)}
                  className="tap-target btn btn-secondary btn-sm shrink-0 !h-9 disabled:opacity-40">{busy === c.id ? '…' : cena ? t('Vyměnit') : t('Vzít si')}</button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Moje rezervace v podniku: potvrdit (z připomínky) nebo zrušit. */
function MojeRezervace({ slug, me, onDone }: { slug: string; me: any; onDone: (m: string) => void }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const [err, setErr] = useState('');
  const [zrusitId, setZrusitId] = useState<number | null>(null);
  // Kolo 8 (R8-7): připomínka vede na ?tab=reserve&rezervace=ID — ta rezervace se zvýrazní a host ji
  // jedním klepnutím potvrdí (podnik pak vidí „host potvrdil"). Potvrzené se drží i lokálně.
  const [zPripominky] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const id = Number(new URLSearchParams(window.location.search).get('rezervace'));
    return Number.isInteger(id) && id > 0 ? id : null;
  });
  const [potvrzene, setPotvrzene] = useState<Record<number, true>>({});
  const [potvrzuji, setPotvrzuji] = useState<number | null>(null);
  const potvrdit = async (id: number) => {
    setPotvrzuji(id); setErr('');
    try {
      const r = await fetch(`/api/client/b/${encodeURIComponent(slug)}/reservations`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'confirm' }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(x.error ? t(x.error) : t('Potvrzení se nepovedlo. Zkus to prosím znovu.')); return; }
      setPotvrzene(p => ({ ...p, [id]: true }));
      onDone(t('Díky, podnik s tebou počítá.'));
    } catch {
      setErr(t('Potvrzení neodešlo — vypadlo připojení. Zkus to prosím znovu.'));
    } finally { setPotvrzuji(null); }
  };
  const cancel = async (id: number) => {
    setZrusitId(null);
    try {
      const r = await fetch(`/api/client/reservations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) });
      if (r.ok) { onDone(t('Rezervace zrušena.')); void obnovHosta(); return; }
      const x = await r.json().catch(() => ({}));
      setErr(x.error ? t(x.error) : t('Zrušení se nepovedlo. Zkus to prosím znovu.'));
    } catch {
      // Nezrušená rezervace je horší než neodeslaná: podnik na hosta čeká.
      setErr(t('Zrušení neodešlo — vypadlo připojení. Rezervace zatím platí, zkus to prosím znovu.'));
    }
  };
  return (
    <section id="rezervace" aria-labelledby="h-moje-rez" className="scroll-mt-6">
      <h2 id="h-moje-rez" className="t-section mb-3">{t('Moje rezervace tady')}</h2>
      {err && <p role="alert" className="mb-3 note note-danger">{err}</p>}
      <ul className="card list px-4 sm:px-5">
        {me.reservations.map((r: any) => {
          const st = RES_STATUS[r.status] ?? RES_STATUS.requested;
          const potvrzeno = !!r.guest_confirmed_at || !!potvrzene[r.id];
          const zvyraznit = zPripominky === r.id;
          return (
            <li key={r.id} id={`rezervace-${r.id}`} className={`py-3.5 scroll-mt-24 ${zvyraznit ? '-mx-3 px-3 rounded-2xl bg-black/[0.045]' : ''}`}>
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/[0.05]" aria-hidden><Icon name="calendar" size={18} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-tight cz-sentence">{fmtDatum(r.date, { jazyk, styl: 'denDlouze' })} · {r.time}</p>
                  <p className="t-meta mt-0.5">{t('{n, plural, one {# osoba} few {# osoby} other {# osob}}', { n: r.party })}{r.note ? ` · ${r.note}` : ''}</p>
                  {zvyraznit && !potvrzeno && r.status === 'confirmed' && <p className="text-xs text-black/60 mt-1">{t('Dorazíš? Potvrď, nebo rezervaci zruš — uvolníš místo jiným.')}</p>}
                </div>
                <span className={`chip chip-sm shrink-0 ${st.tone === 'ok' ? 'chip-ok' : st.tone === 'wait' ? 'chip-wait' : 'chip-muted'}`}>{st.tone === 'ok' && <Icon name="check" size={11} />}{t(st.label)}</span>
              </div>
              {['requested', 'confirmed'].includes(r.status) && (
                <div className="mt-3 pl-[52px] grid grid-cols-2 gap-2">
                  {r.status === 'confirmed' ? (potvrzeno
                    ? <span className="chip chip-ok !h-9 justify-center"><Icon name="check" size={13} />{t('Potvrzeno tebou')}</span>
                    : <button type="button" onClick={() => { void potvrdit(r.id); }} disabled={potvrzuji === r.id}
                        className="tap-target-sm inline-flex items-center justify-center gap-1.5 btn btn-primary btn-sm !h-9 disabled:opacity-50"
                        aria-label={t('Potvrdit rezervaci {kdy}', { kdy: `${fmtDatum(r.date, { jazyk, styl: 'denDlouze' })} ${r.time}` })}>
                        <Icon name="check" size={14} />{potvrzuji === r.id ? '…' : t('Potvrdit', undefined, 'rezervace')}
                      </button>) : <span />}
                  <button type="button" onClick={() => setZrusitId(r.id)} className="tap-target-sm btn btn-secondary btn-sm !h-9">{t('Zrušit', undefined, 'rezervace')}</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Modal open={zrusitId !== null} onClose={() => setZrusitId(null)} size="sm" title={t('Zrušit rezervaci?')}
        subtitle={t('Podnik se o zrušení dozví a termín se uvolní.')}
        footer={<>
          <Button variant="secondary" onClick={() => setZrusitId(null)}>{t('Ponechat')}</Button>
          <Button variant="danger-solid" onClick={() => { if (zrusitId !== null) void cancel(zrusitId); }}>{t('Zrušit rezervaci')}</Button>
        </>}>
        {null}
      </Modal>
    </section>
  );
}

function Akce({ events, b, slug, signedIn }: { events: any[]; b: any; slug: string; signedIn: boolean }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const [evDetail, setEvDetail] = useState<any | null>(null);
  return (
    <section aria-labelledby="h-events">
      <h2 id="h-events" className="t-section mb-3">{t('Co se u nás chystá')}</h2>
      <ul className="card list px-4 sm:px-5">
        {events.map((e: any) => (
          <li key={e.id}>
            <button type="button" onClick={() => setEvDetail(e)} className="w-full text-left flex gap-3.5 py-3.5 items-center">
              {e.photos?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.photos[0]} alt="" className="shrink-0 h-12 w-12 rounded-[14px] object-cover" />
              ) : (
                <span className="shrink-0 grid place-items-center content-center rounded-[14px] h-12 w-12 text-center leading-none bg-black/[0.05]">
                  <span className="block text-[17px] font-semibold tabular-nums">{Number(String(e.date).slice(8, 10))}</span>
                  <span className="block text-[11px] font-medium text-black/55 mt-0.5">{fmtMesic(Number(String(e.date).slice(5, 7)), { jazyk, styl: 'kratky' })}</span>
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-tight">{e.title}</span>
                <span className="block t-meta mt-0.5 truncate cz-sentence">{fmtDatum(e.date, { jazyk, styl: 'denKratce' })}{e.start_time ? ` · ${e.start_time}` : ''}{e.going > 0 ? ` · ${t('{n, plural, one {# člověk jde} few {# lidi jdou} other {# lidí jde}}', { n: e.going })}` : ''}{e.capacity ? ` · ${t('kapacita {n}', { n: e.capacity })}` : ''}</span>
              </span>
              <Icon name="chevronRight" size={18} className="shrink-0 text-black/40" />
            </button>
          </li>
        ))}
      </ul>
      {evDetail && <EventSheet e={evDetail} currency={b.currency} ac={b.accent || '#C8F542'} slug={slug} signedIn={signedIn} businessName={b.name} address={b.address} onClose={() => setEvDetail(null)} />}
    </section>
  );
}

function Menu({ menu, currency }: { menu: any; currency: string }) {
  const t = useT('klient-host');
  // Ceny v menu smějí mít haléře (4,50 €) — formatMoney by je zaokrouhlil na celé.
  const money = (n: number) => formatPrice(n, currency);
  const sekce: any[] = menu?.sections ?? [];
  const [vybrana, setVybrana] = useState<number | null>(null);
  if (!sekce.length) return <EmptyState icon="leaf" title={t('Nabídka zatím není zveřejněná')} hint={t('Podnik ji doplní v aplikaci.')} compact />;
  const ukaz = vybrana == null ? sekce : sekce.filter(s => s.id === vybrana);
  return (
    <div className="space-y-4">
      {sekce.length > 1 && (
        <div className="-mx-4 min-[360px]:-mx-5 sm:mx-0 px-4 min-[360px]:px-5 sm:px-0 flex gap-2 overflow-x-auto scroll-fade-x pb-1" role="radiogroup" aria-label={t('Části nabídky')}>
          <button type="button" role="radio" aria-checked={vybrana == null} onClick={() => setVybrana(null)} className="h-cip shrink-0 tap-target-sm">{t('Všechno')}</button>
          {sekce.map(s => <button key={s.id} type="button" role="radio" aria-checked={vybrana === s.id} onClick={() => setVybrana(s.id)} className="h-cip shrink-0 tap-target-sm">{s.title}</button>)}
        </div>
      )}
      {ukaz.map((s: any) => (
        <section key={s.id} className="card px-4 sm:px-5 py-2">
          <h3 className="t-card pt-2.5 pb-1">{s.title}</h3>
          <ul className="list">
            {s.items.map((it: any) => (
              <li key={it.id} className={`py-3 flex items-baseline gap-3 ${it.soldOut ? 'opacity-50' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium leading-tight">{it.name}{it.soldOut && <span className="ml-2 chip chip-sm chip-muted align-middle">{t('vyprodáno')}</span>}</p>
                  {it.description && <p className="text-sm text-black/55 mt-0.5 text-pretty">{it.description}</p>}
                  {/* Alergeny jen u položek, kde je podnik vyplnil: prázdné neznamená „bez alergenů“. */}
                  {Array.isArray(it.alergeny) && it.alergeny.length > 0 && <p className="text-xs text-black/55 mt-0.5"><span className="font-semibold">{t('Alergeny')}:</span> {it.alergeny.join(', ')}</p>}
                </div>
                <span className="tabular-nums font-semibold shrink-0">{money(it.price)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {/* Legenda alergenů a věta o složení přicházejí ze serveru v jazyce hosta (formální „Sie“ u němčiny, právně citlivé). */}
      {menu?.alergenyNazvy && Object.keys(menu.alergenyNazvy).length > 0 && (
        <div className="text-xs text-black/55 leading-relaxed space-y-1">
          <p><span className="font-semibold text-black/70">{t('Alergeny')}:</span> {Object.entries(menu.alergenyNazvy).map(([k, n]) => `${k} ${n}`).join(' · ')}</p>
          {menu.alergenyPoznamka && <p>{menu.alergenyPoznamka}</p>}
          {menu.alergenyNeuplne && <p>{t('U některých položek alergeny nejsou vyplněny — zeptejte se obsluhy.')}</p>}
        </div>
      )}
    </div>
  );
}

function Info({ b, gallery }: { b: any; gallery?: string[] }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  return (
    <section aria-labelledby="h-info" className="space-y-3">
      <h2 id="h-info" className="t-section">{t('O podniku')}</h2>
      {(gallery?.length ?? 0) > 0 && (
        <ul aria-label={t('Fotky z podniku')} className="-mx-4 min-[360px]:-mx-5 sm:mx-0 flex gap-2.5 overflow-x-auto px-4 min-[360px]:px-5 sm:px-0 scrollbar-thin snap-x">
          {gallery!.slice(0, 8).map((g, i) => (
            <li key={g} className={`shrink-0 snap-start rounded-2xl overflow-hidden ${i === 0 ? 'w-64 aspect-[4/3]' : 'w-40 aspect-square'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g} alt="" loading="lazy" className="h-full w-full object-cover" />
            </li>
          ))}
        </ul>
      )}
      <div className="card p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="min-w-0">
          {b.tagline && <p className="t-card mb-1.5 text-pretty">{b.tagline}</p>}
          {b.description && <p className="text-sm text-black/70 leading-relaxed text-pretty">{b.description}</p>}
          {b.address && <p className="mt-3 text-sm text-black/70 flex items-start gap-1.5"><Icon name="location" size={15} className="text-black/45 shrink-0 mt-0.5" /><span className="min-w-0 break-words">{b.address}</span></p>}
          {b.phone && <p className="mt-2 text-sm"><a href={`tel:${String(b.phone).replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 text-black/70 tap-target-sm"><Icon name="phone" size={15} className="text-black/45" />{b.phone}</a></p>}
        </div>
        <div className="min-w-0">
          <h3 className="t-card mb-1">{t('Otevírací doba')}</h3>
          <ul className="text-sm divide-y divide-black/[0.06]">
            {[0, 1, 2, 3, 4, 5, 6].map(i => {
              const n = fmtDenVTydnu(i, { jazyk, styl: 'dlouhy' });
              const day = b.hours?.[String(i)];
              const txt = !day ? t('neuvedeno') : day.closed || !day.open ? t('zavřeno') : `${day.open}–${day.close}`;
              return <li key={i} className="py-1.5 flex justify-between gap-3"><span className="cz-sentence">{n}</span><span className="tabular-nums text-black/70">{txt}</span></li>;
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** 2026-11-12 na „12. 11." (pořadí den, měsíc platí pro všechny jazyky stránky). */
function denKratce(den: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(den);
  return m ? `${Number(m[3])}. ${Number(m[2])}.` : den;
}

const btnPrimary = 'tap-target inline-flex items-center justify-center gap-2 btn btn-accent hover:brightness-105 active:scale-[0.98] disabled:opacity-50 transition';
const btnQuiet = 'tap-target inline-flex items-center justify-center gap-2 btn btn-secondary hover:bg-black/[0.05] active:scale-[0.98] disabled:opacity-50 transition';
const input = 'field text-sm';
const label = 'field-label';

/** Pruh s právě běžící bonusovou akcí podniku. */
function BonusPruh({ bonus, accent }: { bonus: { name: string; multiplier: number; stampBonus: number; until: string | null }; accent: string }) {
  const t = useT('klient-host');
  const kdy = bonus.until ?? '';
  const nasobek = String(bonus.multiplier).replace('.', ',');
  const radky: string[] = [];
  if (bonus.multiplier > 1) {
    radky.push(bonus.multiplier === 2
      ? (kdy ? t('Dnes dvojnásobné body do {kdy}', { kdy }) : t('Dnes dvojnásobné body'))
      : (kdy ? t('Dnes {n}× body do {kdy}', { n: nasobek, kdy }) : t('Dnes {n}× body', { n: nasobek })));
  }
  if (bonus.stampBonus > 0) {
    radky.push(kdy
      ? t('Dnes navíc {n, plural, one {# razítko} few {# razítka} other {# razítek}} do {kdy}', { n: bonus.stampBonus, kdy })
      : t('Dnes navíc {n, plural, one {# razítko} few {# razítka} other {# razítek}}', { n: bonus.stampBonus }));
  }
  if (!radky.length) return null;
  return (
    <section aria-label={bonus.name} className="card px-4 py-3.5 flex items-start gap-3 min-w-0">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/[0.05] text-black/70" aria-hidden><Icon name="gift" size={17} /></span>
      <div className="min-w-0">
        <p className="t-label break-words">{bonus.name}</p>
        {radky.map(r => <p key={r} className="text-sm font-semibold leading-snug text-pretty">{r}</p>)}
      </div>
    </section>
  );
}

// ---- Objednávka od stolu ---------------------------------------------------------

/** Stavy objednávky; klíče do slovníku drží check-i18n (EXTRA_KLIENT_HOST). */
const ORDER_LABEL: Record<string, string> = { new: 'Čeká na obsluhu', confirmed: 'Připravuje se', done: 'Hotovo', declined: 'Nepřijato' }; // i18n-ok: klíče slovníku, překládá se při vykreslení

function OrderTab({ slug, b, menu, tables, plan, signedIn, onDone }: { slug: string; b: any; menu: any; tables: any[]; plan?: any; signedIn: boolean; onDone: (m: string) => void }) {
  const t = useT('klient-host');
  const [tableId, setTableId] = useState<number | ''>(() => {
    if (typeof window === 'undefined') return '';
    const t = parseInt(new URLSearchParams(window.location.search).get('table') ?? '', 10);
    return t && tables.some(x => x.id === t) ? t : '';
  });
  // Kód z QR na stole. Odkaz z domova ho nemá, a podnik ho může vyžadovat.
  const [token] = useState<string>(() => typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('t') ?? '').toUpperCase());
  const qrOnly = !!b.orderQrRequired;
  const qrTable = token && tableId ? tables.find(x => x.id === tableId) : null;
  // Poloha telefonu: podnik ji porovná se svou. Ptáme se hned, ať host
  // u tlačítka nečeká; když nepřijde, zkusí se to ještě při odeslání.
  const geoMode: 'off' | 'warn' | 'block' = b.orderGeo ?? 'off';
  const [geo, setGeo] = useState<{ status: 'idle' | 'asking' | 'ok' | 'denied'; lat?: number; lng?: number; accuracy?: number }>({ status: 'idle' });
  const askGeo = useCallback((): Promise<{ lat: number; lng: number; accuracy: number } | null> => new Promise(resolve => {
    if (geoMode === 'off' || typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    setGeo(g => g.status === 'ok' ? g : { status: 'asking' });
    navigator.geolocation.getCurrentPosition(
      pos => { const g = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }; setGeo({ status: 'ok', ...g }); resolve(g); },
      () => { setGeo({ status: 'denied' }); resolve(null); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }), [geoMode]);
  useEffect(() => { if (geoMode !== 'off' && (!qrOnly || token)) askGeo(); }, [geoMode, qrOnly, token, askGeo]);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<any[] | null>(null);
  const cur = currencySymbol(b.currency);
  const money = (n: number) => formatPrice(n, b.currency);

  const loadOrders = useCallback(() => fetch(`/api/client/b/${encodeURIComponent(slug)}/orders`).then(okJson).then(x => setOrders(x.orders ?? [])).catch(() => setOrders([])), [slug]);
  useEffect(() => { if (signedIn) loadOrders(); else setOrders([]); }, [signedIn, loadOrders]);
  // Dokud objednávka čeká nebo se připravuje, ptáme se každých deset vteřin.
  useEffect(() => {
    if (!orders?.some(o => o.status === 'new' || o.status === 'confirmed')) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadOrders(); }, 10000);
    return () => clearInterval(t);
  }, [orders, loadOrders]);

  const items: any[] = (menu?.sections ?? []).flatMap((s: any) => s.items.map((it: any) => ({ ...it, section: s.title }))).filter((it: any) => !it.soldOut && it.price > 0);
  const lines = items.filter(it => cart[it.id] > 0).map(it => ({ ...it, count: cart[it.id] }));
  const total = lines.reduce((a, l) => a + l.price * l.count, 0);
  const setCount = (id: number, n: number) => setCart(c => { const next = { ...c }; if (n <= 0) delete next[id]; else next[id] = Math.min(20, n); return next; });

  const submit = async () => {
    setErr('');
    if (!signedIn) { window.location.href = `/client/login?next=${encodeURIComponent('/client/' + slug + '?tab=order')}`; return; }
    if (!tableId) { setErr(qrOnly ? t('Naskenuj QR kód na stole.') : t('Vyber stůl, u kterého sedíš.')); return; }
    if (!lines.length) { setErr(t('Přidej aspoň jednu položku.')); return; }
    setBusy(true);
    const pos = geo.status === 'ok' ? { lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy } : await askGeo();
    if (geoMode === 'block' && !pos) { setBusy(false); setErr(t('Bez polohy objednat nejde. Povol polohu v prohlížeči a zkus to znovu.')); return; }
    try {
      const r = await fetch(`/api/client/b/${encodeURIComponent(slug)}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tableId, token, geo: pos, items: lines.map(l => ({ id: l.id, count: l.count })), note }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(x.error ? t(x.error) : t('Objednávka se nepovedla.')); return; }
      setCart({}); setNote(''); onDone(x.straight ? t('Objednávka je v pokladně. Obsluha ji už připravuje.') : t('Objednávka odeslána. Obsluha ji za chvíli potvrdí.')); loadOrders();
    } catch {
      // Košík schválně zůstává plný: host ťukne znovu a neztratí, co navybíral.
      setErr(t('Objednávka neodešla — vypadlo připojení. Nic se neodeslalo, zkus to prosím znovu.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-6 md:gap-10 items-start">
      <div className="space-y-5">
        <div className="glass-card p-5 grid gap-2">
          {qrTable ? (
            <>
              <p className={label}>{t('Kde sedíš')}</p>
              <p className="flex items-center gap-2 flex-wrap"><span className="chip chip-ink">{qrTable.name}</span><span className="t-meta">{t('podle QR na stole')}</span></p>
              <TableMap tables={tables} plan={plan} selectedId={qrTable.id} caption={t('Tvůj stůl na plánku podniku.')} />
            </>
          ) : qrOnly ? (
            <>
              <p className={label}>{t('Kde sedíš')}</p>
              <p className="font-semibold leading-tight">{t('Naskenuj QR kód na stole')}</p>
              <p className="text-xs text-black/55">{t('Objednat jde jen od stolu, kde sedíš. Otevři kameru v telefonu a namiř ji na kód na stole; otevře se tahle stránka s vybraným stolem.')}</p>
            </>
          ) : (
            <>
              <label htmlFor="o-table" className={label}>{t('Kde sedíš')}</label>
              {placedTables(tables).length > 0 && (
                <TableMap tables={tables} plan={plan} selectedId={tableId || null} onPick={id => setTableId(id)}
                  caption={t('Klepni na stůl, u kterého sedíš.')} />
              )}
              <select id="o-table" value={tableId} onChange={e => setTableId(e.target.value ? Number(e.target.value) : '')} className={input} aria-label={t('Stůl ze seznamu')}>
                <option value="">{placedTables(tables).length ? t('Nebo vyber ze seznamu') : t('Vyber stůl')}</option>
                {tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {placedTables(tables).length === 0 && <p className="text-xs text-black/45">{t('Číslo stolu bývá na cedulce na stole.')}</p>}
            </>
          )}
          {geoMode !== 'off' && (!qrOnly || token) && (
            <p className={`text-xs flex items-center gap-1.5 ${geo.status === 'ok' ? 'text-ok-ink' : geo.status === 'denied' ? (geoMode === 'block' ? 'text-bad-ink' : 'text-wait-ink') : 'text-black/50'}`}>
              <Icon name="location" size={13} />
              {geo.status === 'ok' ? t('Poloha ověřena.') : geo.status === 'asking' || geo.status === 'idle' ? t('Ověřujeme, že sedíš u stolu…')
                : geoMode === 'block' ? t('Bez polohy objednat nejde. Povol ji v prohlížeči.') : t('Bez polohy objednávku nejdřív potvrdí obsluha.')}
              {geo.status === 'denied' && <button type="button" onClick={() => askGeo()} className="tap-target-sm underline font-medium">{t('Zkusit znovu')}</button>}
            </p>
          )}
        </div>
        {items.length === 0 ? <EmptyState icon="leaf" title={t('Zatím není z čeho objednat')} hint={t('Podnik nabídku doplní v aplikaci.')} compact /> : (
          <div className="space-y-5">
            {(menu?.sections ?? []).map((s: any) => {
              const list = s.items.filter((it: any) => !it.soldOut && it.price > 0);
              if (!list.length) return null;
              return (
                <section key={s.id}>
                  <h2 className="t-section mb-1">{s.title}</h2>
                  <ul className="list">
                    {list.map((it: any) => {
                      const n = cart[it.id] ?? 0;
                      return (
                        <li key={it.id} className="list-row">
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-medium leading-tight">{it.name}</p>
                            <p className="text-sm text-black/55">{money(it.price)}{it.description ? ` · ${it.description}` : ''}</p>
                          </div>
                          {n === 0 ? (
                            <button type="button" onClick={() => setCount(it.id, 1)} aria-label={t('Přidat {name}', { name: it.name })} className="tap-target btn-icon !h-10 !w-10 !text-[#16181A]"><Icon name="plus" size={18} /></button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button type="button" onClick={() => setCount(it.id, n - 1)} aria-label={t('Méně')} className="tap-target btn-icon !h-10 !w-10"><Icon name="minus" size={18} /></button>
                              <span className="w-6 text-center text-[15px] font-bold tabular-nums" aria-live="polite">{n}</span>
                              <button type="button" onClick={() => setCount(it.id, n + 1)} aria-label={t('Více')} className="tap-target btn-icon !h-10 !w-10 !text-[#16181A]"><Icon name="plus" size={18} /></button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
      <aside className="space-y-4 md:sticky md:top-24">
        <div className="glass-card p-5 space-y-3">
          <h2 className="t-section">{t('Objednávka')}</h2>
          {lines.length === 0 ? <p className="text-sm text-black/55">{t('Zatím prázdná. Přidej něco z nabídky.')}</p> : (
            <ul className="divide-y divide-black/[0.06] text-sm">
              {lines.map(l => <li key={l.id} className="py-1.5 flex justify-between gap-3"><span><span className="font-semibold tabular-nums">{l.count}×</span> {l.name}</span><span className="tabular-nums">{money(l.price * l.count)}</span></li>)}
            </ul>
          )}
          <div className="flex items-baseline justify-between border-t border-black/[0.06] pt-3">
            <span className="text-sm text-black/60">{t('Celkem')}</span>
            <span className="text-[1.75rem] font-bold tracking-[-0.02em] tabular-nums leading-none">{money(total)}</span>
          </div>
          <div className="grid gap-2">
            <label htmlFor="o-note" className={label}>{t('Poznámka pro obsluhu')}</label>
            <input id="o-note" value={note} onChange={e => setNote(e.target.value)} placeholder={t('Bez cukru, mléko zvlášť…')} className={input} maxLength={300} />
          </div>
          {err && <p role="alert" className="note note-danger text-sm px-3 py-2">{err}</p>}
          <button type="button" onClick={submit} disabled={busy} className={`${btnPrimary} btn-lg w-full`}><Icon name="cup" size={16} /> {busy ? t('Odesílám…') : signedIn ? t('Objednat') : t('Přihlásit se a objednat')}</button>
          <p className="text-xs text-black/45">{t('Platí se u obsluhy jako obvykle. Za každých 100 {mena} dostaneš {body} bodů.', { mena: cur, body: b.pointsPer100 })}</p>
        </div>
        {orders && orders.length > 0 && (
          <section>
            <h3 className="t-card mb-1">{t('Dnešní objednávky')}</h3>
            <ul className="card list px-4">
              {orders.map(o => (
                <li key={o.id} className="list-row">
                  <div className="min-w-0 flex-1">
                    <span className={`chip chip-sm ${o.status === 'new' ? 'chip-wait' : o.status === 'confirmed' ? 'chip-info' : o.status === 'done' ? 'chip-ok' : 'chip-muted'}`}>{ORDER_LABEL[o.status] ? t(ORDER_LABEL[o.status]) : o.status}</span>
                    <p className="t-meta truncate mt-1">{(o.items ?? []).map((l: any) => `${l.count}× ${l.name}`).join(', ')}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0">{money(o.total)}{o.table_name ? ` · ${o.table_name}` : ''}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}


// ---- Detail akce pro hosta: fotky, menu, mapa, kalendář, sledování -------
function EventSheet({ e, currency, ac, slug, signedIn, businessName, address, onClose }: {
  e: any; currency: string; ac: string; slug: string; signedIn: boolean; businessName: string; address: string; onClose: () => void;
}) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const m = useModal(true, onClose, t('Akce {nazev}', { nazev: e.title }));
  const money = (n: number) => formatPrice(n, currency);
  // Sledování se drží lokálně, ať tlačítka reagují hned a bez načítání celé stránky.
  const [follow, setFollow] = useState<boolean>(e.myFollow === true);
  const [going, setGoing] = useState<boolean>(e.myGoing === true);
  const [goingCount, setGoingCount] = useState<number>(Number(e.going) || 0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const photos: string[] = Array.isArray(e.photos) ? e.photos : [];
  const menu: any[] = Array.isArray(e.menu) ? e.menu : [];
  const place = e.offsite ? (e.location || '') : (e.location ? `${businessName} — ${e.location}` : businessName);
  const mapQuery = e.offsite ? e.location : address || businessName;

  const setState = async (next: { follow: boolean; going: boolean }) => {
    if (!signedIn) { window.location.href = `/client/login?next=${encodeURIComponent('/client/' + slug)}`; return; }
    setBusy(true); setMsg('');
    const res = next.follow
      ? await fetch(`/api/client/events/${e.id}/follow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ going: next.going }) }).catch(() => null)
      : await fetch(`/api/client/events/${e.id}/follow`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    const d = res?.ok ? await res.json().catch(() => null) : null;
    if (!d) { setMsg(t('Nepovedlo se — zkus to za chvíli.')); return; }
    setFollow(d.myFollow === true); setGoing(d.myGoing === true); setGoingCount(Number(d.going) || 0);
    setMsg(next.follow ? (next.going ? t('Počítáme s tebou! Den předem ti to připomeneme.') : t('Hlídáme ti to — den předem přijde připomínka.')) : t('Už nehlídáme.'));
  };

  // .ics ke stažení — bez času je to celodenní událost. Skládá `lib/ics`,
  // ať má soubor `DTSTAMP`, popis pásma a zalomené dlouhé řádky; popis akce
  // od podniku je snadno přeleze a čtečka pak událost zahodí.
  const saveIcs = () => {
    const ics = buildIcs([{
      uid: `managero-event-${e.id}@managero`,
      date: String(e.date),
      startTime: e.start_time ?? null,
      endTime: e.end_time ?? null,
      summary: `${e.title} — ${businessName}`,
      location: place || null,
      description: e.description || null,
    }], '-//Managero//Akce//CS');
    downloadIcs(`akce-${e.id}.ics`, ics);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center modal-overlay p-4" onClick={onClose}>
      <div ref={m.ref} {...m.dialogProps} className="modal-sheet rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto scrollbar-thin" onClick={ev => ev.stopPropagation()}>
        <DiscardGuard guard={m.guard} />
        {photos.length > 0 && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photos[0]} alt="" className="w-full h-44 sm:h-52 object-cover rounded-t-3xl" />
        )}
        <div className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="t-section text-[1.375rem] leading-tight font-bold tracking-[-0.02em] text-balance">{e.title}</h3>
              <p className="text-sm text-black/55 cz-sentence mt-0.5">
                {fmtDatum(e.date, { jazyk, styl: 'denDlouze' })}{e.start_time ? ` · ${e.start_time}${e.end_time ? `–${e.end_time}` : ''}` : ''}
              </p>
            </div>
            <button type="button" onClick={m.guard.attemptClose} className="tap-target shrink-0 btn-icon -mt-1 -mr-1" aria-label={t('Zavřít')}><Icon name="close" size={16} /></button>
          </div>

          {place && (
            <p className="text-sm text-black/60 mt-2">
              <Icon name="location" size={15} className="inline -mt-0.5 mr-1.5 shrink-0" />{place}
              {mapQuery && (
                <a href={`https://mapy.cz/zakladni?q=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer"
                  className="tap-target-sm inline-block ml-2 py-1 text-[#0A5CC0] underline decoration-[#0A5CC0]/30 hover:decoration-[#0A5CC0]">{t('Mapa')}</a>
              )}
            </p>
          )}
          {(goingCount > 0 || e.capacity) && (
            <p className="text-xs text-black/45 mt-1.5">{goingCount > 0 ? t('{n, plural, one {# člověk jde} few {# lidi jdou} other {# lidí jde}}', { n: goingCount }) : ''}{goingCount > 0 && e.capacity ? ' · ' : ''}{e.capacity ? t('kapacita {n}', { n: e.capacity }) : ''}</p>
          )}

          {e.description && <p className="text-sm text-black/70 mt-3 whitespace-pre-wrap text-pretty">{e.description}</p>}

          {photos.length > 1 && (
            <div className="flex gap-2 mt-4 overflow-x-auto scrollbar-thin pb-1 -mx-1 px-1">
              {photos.slice(1).map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt={t('Fotka {n}', { n: i + 2 })} className="h-24 w-24 shrink-0 rounded-2xl object-cover border border-black/[0.06]" />
              ))}
            </div>
          )}

          {menu.length > 0 && (
            <div className="mt-4 well p-4">
              <p className="t-label mb-1.5">{t('Co se bude podávat')}</p>
              <ul className="divide-y divide-black/[0.06]">
                {menu.map((l: any, i: number) => (
                  <li key={i} className="py-1.5 flex items-baseline gap-3">
                    <span className="min-w-0 flex-1">{l.board ? <>{t('Platí celá naše nabídka „{nazev}“', { nazev: l.name })} <span className="text-black/45">{t('— mrkni do záložky Menu')}</span></> : l.name}</span>
                    {l.price != null && <span className="shrink-0 text-sm text-black/60 tabular-nums">{money(l.price)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* akční řádka: přijdu / hlídat / do kalendáře */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button disabled={busy} onClick={() => setState(going ? { follow, going: false } : { follow: true, going: true })}
              className={going
                ? `${btnQuiet} !text-[#16181A]`
                : btnPrimary}>
              {going ? t('Jdu · zrušit účast') : t('Přijdu')}
            </button>
            <button disabled={busy} onClick={() => (follow ? setState({ follow: false, going: false }) : setState({ follow: true, going }))}
              className={btnQuiet} aria-pressed={follow}>
              <Icon name="bell" size={15} className="shrink-0" />{follow ? t('Hlídám · zrušit') : t('Hlídat akci')}
            </button>
          </div>
          <button onClick={saveIcs} className={`${btnQuiet} w-full mt-2`}>
            <Icon name="calendarCheck" size={15} className="shrink-0" />{t('Přidat do kalendáře (.ics)')}
          </button>
          {!signedIn && <p className="text-xs text-black/45 mt-2 text-center">{t('Na „Přijdu“ a hlídání se přihlas — připomínku pošleme den předem.')}</p>}
          {msg && <p role="status" className="toast-in note note-ok mt-2 text-center">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
