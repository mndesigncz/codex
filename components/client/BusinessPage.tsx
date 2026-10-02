'use client';

// Stránka podniku pro hosta: kdo jsou, kdy mají otevřeno, co nabízejí,
// rezervace a věrnost. Vše na jedné adrese, přepínané záložkami.

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { Icon } from '../Icons';
import { Segmented, Skeleton, EmptyState, ErrorState } from '../ui';
import { Initials } from './ClientShell';
import TableMap, { placedTables } from './TableMap';
import { onAccent } from '@/lib/floorplan';
import { hoursLabel, slotsFor, RES_STATUS } from '@/lib/clientSlots';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum, fmtDenVTydnu, fmtMesic } from '@/lib/i18n/format';
import { pragueToday, dayPlus } from '@/lib/pragueTime';
import { useModal } from '@/lib/useModal';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { formatMoney, formatPrice, currencySymbol } from '@/lib/money';
import { okJson, apiMessage } from '@/lib/api';
import { buildIcs, downloadIcs } from '@/lib/ics';
import { DiscardGuard } from '../ui/DiscardGuard';
import MamPoukaz from './MamPoukaz';
import PromoBanners from './PromoBanners';
import RazitkaPoznamky from './loyalty/RazitkaHost';
import HostHistorie from './loyalty/HostHistorie';
import HostPravidla from './loyalty/HostPravidla';
import { PlatnostKuponu } from './loyalty/HostPlatnost';

type Tab = 'menu' | 'reserve' | 'order' | 'loyalty';

const btnPrimary = 'tap-target inline-flex items-center justify-center gap-2 btn btn-accent hover:brightness-105 active:scale-[0.98] disabled:opacity-50 transition';
const btnQuiet = 'tap-target inline-flex items-center justify-center gap-2 btn btn-secondary hover:bg-black/[0.05] active:scale-[0.98] disabled:opacity-50 transition';
const input = 'field text-sm';
const label = 'field-label';

export default function BusinessPage({ slug }: { slug: string }) {
  // Jazyk stránky je jazyk hosta (?lang=, cookie, jazyk prohlížeče; viz lib/i18n/client).
  // Texty podniku (název, popis, novinky) se nepřekládají, jsou to obsah podniku;
  // překládá se obal stránky a nabídka podle jazyků, které podnik v lístku zapnul.
  // Tón: hostům tykání (německy „du“), věty o alergenech jsou formální (server).
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const [d, setD] = useState<any | null>(null);
  const [notFound, setNotFound] = useState(false);
  /** Nepovedlo se načíst — na rozdíl od „podnik neexistuje" se dá zkusit znovu. */
  const [loadErr, setLoadErr] = useState('');
  const [tab, setTab] = useState<Tab>(() => {
    // Odkaz nebo QR na stole může vést rovnou na objednávku: /client/<podnik>?tab=order
    if (typeof window === 'undefined') return 'menu';
    const t = new URLSearchParams(window.location.search).get('tab');
    return (['menu', 'reserve', 'order', 'loyalty'] as string[]).includes(t ?? '') ? (t as Tab) : 'menu';
  });
  const [flash, setFlash] = useState('');
  const [joining, setJoining] = useState(false);
  // „Podnik tu není" smí zaznít **jen** na 404. Dřív to bylo v `catch`,
  // takže výpadek wifi vypadal úplně stejně — a zákazník z toho usoudil,
  // že kavárna na platformě není, a přestal to zkoušet. Kavárna přitom
  // existuje; jen se k ní telefon zrovna nedovolal.
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
  useEffect(() => { if (flash) { const t = setTimeout(() => setFlash(''), 4000); return () => clearTimeout(t); } }, [flash]);

  if (notFound) return <EmptyState icon="location" title={t('Podnik tu není')} hint={t('Buď má jinou adresu, nebo Managero client zatím nezapnul.')} action={<Link href="/client" className={btnQuiet}>{t('Zpět na podniky')}</Link>} />;
  if (loadErr && !d) return (
    <ErrorState
      title={t('Stránka podniku se nenačetla')}
      /* Zprávu posílá server a nemusí končit tečkou; bez tohohle by se
         obě věty slily dohromady. */
      hint={`${/[.!?…]$/.test(loadErr) ? loadErr : loadErr + '.'} ${t('Podnik tu nejspíš je — jen se k němu teď nedovoláme.')}`}
      onRetry={() => { void load(); }}
    />
  );
  if (!d) return <div className="space-y-4"><Skeleton className="h-48 rounded-3xl" /><Skeleton className="h-10 w-72 rounded-full" /><Skeleton className="h-64 rounded-3xl" /></div>;

  const b = d.business; const me = d.me; const today: string = d.today;
  // Barva značky podniku; bez vlastní volby zůstává limetková jako ve zbytku aplikace.
  const accent: string = b.accent || '#C8F542';
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'menu', label: t('Nabídka'), icon: 'leaf' },
    ...(b.reservationsOn ? [{ id: 'reserve' as Tab, label: t('Rezervace'), icon: 'calendarCheck' }] : []),
    ...(b.orderingOn && (d.tables?.length ?? 0) > 0 ? [{ id: 'order' as Tab, label: t('Objednat'), icon: 'cup' }] : []),
    ...(b.loyaltyOn ? [{ id: 'loyalty' as Tab, label: t('Věrnost'), icon: 'gift' }] : []),
  ];
  const join = async () => {
    if (joining) return;
    setJoining(true);
    try {
      const r = await fetch(`/api/client/b/${encodeURIComponent(slug)}/join`, { method: 'POST' });
      if (r.status === 401) { window.location.href = `/client/login?next=${encodeURIComponent('/client/' + slug)}`; return; }
      if (r.ok) { setFlash(t('Jsi členem. Vítej.')); load(); return; }
      const d = await r.json().catch(() => ({}));
      setFlash(d.error ? t(d.error) : t('Přidat se teď nepovedlo. Zkus to prosím znovu.'));
    } finally { setJoining(false); }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className={`relative overflow-hidden rounded-3xl border border-black/[0.06] ${b.coverUrl ? 'bg-[#16181A]' : 'glass-card'} min-h-[13rem] sm:min-h-[16rem] flex flex-col justify-end p-5 sm:p-7`}>
        {b.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {b.coverUrl && <div className="absolute inset-0 bg-gradient-to-t from-[#16181A]/90 via-[#16181A]/35 to-[#16181A]/5" />}
        {!b.coverUrl && (
          <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none" aria-hidden>
            <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full blur-3xl" style={{ background: accent, opacity: 0.22 }} />
            <div className="absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-[#0A84FF]/10 blur-3xl" />
          </div>
        )}
        <div className={`relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end ${b.coverUrl ? 'text-white' : ''}`}>
          <div className="min-w-0 flex items-start gap-4">
            {b.logoUrl ? (
              <span className="hidden sm:grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-white shadow-lg overflow-hidden mt-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.logoUrl} alt="" className="h-full w-full object-contain p-2" />
              </span>
            ) : !b.coverUrl ? <span className="hidden sm:block mt-1"><Initials name={b.name} size={64} /></span> : null}
            <div className="min-w-0">
              <h1 className="text-3xl sm:text-[2.6rem] font-bold tracking-tighter leading-[1.02] text-balance">{b.name}</h1>
              {b.tagline && <p className={`mt-1.5 text-base sm:text-lg leading-snug text-pretty max-w-[40ch] ${b.coverUrl ? 'text-white/85' : 'text-black/65'}`}>{b.tagline}</p>}
              <p className={`mt-2 text-sm flex flex-wrap items-center gap-x-3 gap-y-1 ${b.coverUrl ? 'text-white/75' : 'text-black/55'}`}>
                <span className="inline-flex items-center gap-1.5"><Icon name="clock" size={15} />{t('Dnes {hodiny}', { hodiny: hoursLabel(b.hours, today, cs => t(cs)) })}</span>
                {/* Adresu píše podnik: dlouhé slovo bez mezer jinak přeteče přes okraj (rodič má overflow-hidden a text uřízne). */}
                {b.address && <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full"><Icon name="location" size={15} className="shrink-0" /><span className="min-w-0 break-words">{b.address}</span></span>}
              </p>
              {/* Tady dřív stály pilulky „Rezervovat / Objednat od stolu /
                  Kartička a kupony". Volaly přesně totéž co přepínač
                  o čtyřicet pixelů níž — tentýž ovladač dvakrát, pokaždé
                  jiným slovníkem („Rezervovat" nahoře, „Rezervace" dole).
                  Host tak na první obrazovce řešil, jestli jsou to dvě
                  různé věci. Zůstává jedna nabídka a jedna hlavní akce. */}
            </div>
          </div>
          <div className="shrink-0">
            {me?.member ? (
              <div className={`rounded-2xl px-4 py-3 ${b.coverUrl ? 'bg-white/15 backdrop-blur' : ''}`}
                style={b.coverUrl ? undefined : { background: `${accent}22`, border: `1px solid ${accent}66` }}>
                <p className="text-[11px] uppercase tracking-wider opacity-70">{t(me.levelLabel ?? 'Člen')}{me.discount > 0 ? ` · ${me.discountSource === 'skupina' && me.discountName ? t('sleva {n} % ({skupina})', { n: me.discount, skupina: me.discountName }) : t('sleva {n} %', { n: me.discount })}` : ''}</p>
                <p className="text-lg font-bold tabular-nums leading-tight">{me.points} {t('b.')} {b.stampTarget > 0 && !(me.campaigns?.length) && <span className="opacity-60 font-medium text-sm">· {t('{stamps}/{target} razítek', { stamps: me.stamps, target: b.stampTarget })}</span>}</p>
                {me.expiring && <p className="text-[11px] font-semibold leading-snug">{t('{n, plural, one {# bod propadne} few {# body propadnou} other {# bodů propadne}} do {kdy}', { n: me.expiring.points, kdy: denKratce(me.expiring.till) })}</p>}
                {me.credit > 0 && <p className="text-sm font-semibold tabular-nums leading-tight">{t('{castka} kreditu', { castka: formatMoney(me.credit, b.currency) })}</p>}
                {me.nextTierAt && <p className="text-[11px] opacity-60 leading-snug">{me.nextTierUnit === 'spend' ? t('do „{level}“ ještě {castka}', { level: t(me.nextTierLabel), castka: formatMoney(Math.max(0, me.nextTierAt - (me.spend ?? 0)), b.currency) }) : t('do „{level}“ ještě {n, plural, one {# návštěva} few {# návštěvy} other {# návštěv}}', { level: t(me.nextTierLabel), n: Math.max(0, me.nextTierAt - me.visits) })}</p>}
              </div>
            ) : (
              <button onClick={join} disabled={joining} className="tap-target w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold hover:brightness-105 active:scale-[0.98] disabled:opacity-60 transition"
                style={{ background: accent, color: onAccent(accent) }}><Icon name="plus" size={16} /> {t('Stát se členem')}</button>
            )}
          </div>
        </div>
      </section>

      {/* Promo bannery podniku: akce a oznámení (data podniku, nepřekládají se). */}
      {(d.banners?.length ?? 0) > 0 && <PromoBanners banners={d.banners} accent={accent} loyaltyOn={!!b.loyaltyOn} onGoTab={setTab} slug={slug} />}

      {/* Běžící bonusová akce („Dnes dvojnásobné body do 18:00"): název akce je data podniku, věta jde přes t(). */}
      {d.bonus && b.loyaltyOn && <BonusPruh bonus={d.bonus} accent={accent} />}

      {flash && <p role="status" className="toast-in rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/40 text-[#3E5406] text-sm px-4 py-3">{flash}</p>}

      {tabs.length > 1 && <Segmented options={tabs} value={tab} onChange={setTab} ariaLabel={t('Části stránky podniku')} />}

      {tab === 'menu' && <MenuTab menu={d.menu} news={d.news} events={d.events} gallery={b.gallery} accent={accent} tagline={b.tagline} address={b.address} description={b.description} hours={b.hours} currency={b.currency} slug={slug} signedIn={d.signedIn} businessName={b.name} />}
      {tab === 'reserve' && b.reservationsOn && <ReserveTab slug={slug} b={b} me={me} today={today} signedIn={d.signedIn} onDone={(m: string) => { setFlash(m); load(); }} />}
      {tab === 'order' && b.orderingOn && <OrderTab slug={slug} b={b} menu={d.menu} tables={d.tables ?? []} plan={d.plan} signedIn={d.signedIn} onDone={(m: string) => { setFlash(m); }} />}
      {tab === 'loyalty' && b.loyaltyOn && <LoyaltyTab slug={slug} b={b} me={me} today={today} campaigns={d.stampCampaigns ?? []} coupons={d.coupons} signedIn={d.signedIn} onDone={(m: string) => { setFlash(m); load(); }} />}
    </div>
  );
}

function MenuTab({ menu, news, events, gallery, accent, tagline, address, description, hours, currency, slug, signedIn, businessName }: { menu: any; news?: any[]; events?: any[]; gallery?: string[]; accent?: string; tagline: string; address: string; description: string; hours: any; currency: string; slug: string; signedIn: boolean; businessName: string }) {
  // Dřív `currency === 'CZK' ? 'Kč' : currency`, takže eurová kavárna
  // ukazovala hostům „120 EUR" a dvanáct a půl tisíce jako „12500 Kč".
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const cur = currencySymbol(currency);
  // Ceny v menu smějí mít haléře (4,50 €) — formatMoney by je zaokrouhlil na celé.
  const money = (n: number) => formatPrice(n, currency);
  const [evDetail, setEvDetail] = useState<any | null>(null);
  const ac = accent || '#C8F542';
  return (
    <div className="space-y-8">
      {(gallery?.length ?? 0) > 0 && (
        <section aria-label={t('Fotky z podniku')} className="-mx-4 sm:mx-0">
          {/* Pás fotek: na telefonu se posouvá prstem, na monitoru se zarovná
              do mřížky. První fotka je větší — podnik má čím začít. */}
          <ul className="flex gap-2.5 overflow-x-auto px-4 sm:px-0 sm:grid sm:grid-cols-4 scrollbar-thin snap-x">
            {gallery!.slice(0, 8).map((g, i) => (
              <li key={g} className={`shrink-0 snap-start rounded-2xl overflow-hidden border border-black/[0.06] ${i === 0 ? 'w-64 sm:w-auto sm:col-span-2 sm:row-span-2 aspect-[4/3]' : 'w-40 sm:w-auto aspect-square'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g} alt="" loading="lazy" className="h-full w-full object-cover hover:scale-[1.03] transition-transform duration-500" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {(events?.length ?? 0) > 0 && (
        <section aria-labelledby="h-events">
          <h2 id="h-events" className="text-lg font-bold tracking-tight mb-3">{t('Co se u nás chystá')}</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {events!.map((e: any) => (
              <li key={e.id}>
                <button type="button" onClick={() => setEvDetail(e)}
                  className="w-full text-left card p-4 flex gap-3.5 hover:bg-white/80 active:scale-[0.99] transition">
                  {e.photos?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.photos[0]} alt="" className="shrink-0 h-14 w-14 rounded-2xl object-cover" />
                  ) : (
                    <span className="shrink-0 grid place-items-center rounded-2xl h-14 w-14 text-center leading-none" style={{ background: `${ac}26` }}>
                      <span className="block text-lg font-bold tabular-nums">{Number(String(e.date).slice(8, 10))}</span>
                      <span className="block text-[11px] uppercase tracking-wider text-black/50 mt-0.5">{fmtMesic(Number(String(e.date).slice(5, 7)), { jazyk, styl: 'kratky' })}</span>
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-tight">{e.title}</p>
                    <p className="text-xs text-black/55 mt-0.5 cz-sentence">{fmtDatum(e.date, { jazyk, styl: 'denDlouze' })}{e.start_time ? ` · ${e.start_time}` : ''}{e.location ? ` · ${e.location}` : ''}</p>
                    {e.description && <p className="text-sm text-black/65 mt-1 line-clamp-2 text-pretty">{e.description}</p>}
                    {(e.going > 0 || e.capacity) && (
                      <p className="text-[11px] text-black/45 mt-1">{e.going > 0 ? t('✋ {n, plural, one {# člověk jde} few {# lidi jdou} other {# lidí jde}}', { n: e.going }) : ''}{e.going > 0 && e.capacity ? ' · ' : ''}{e.capacity ? t('kapacita {n}', { n: e.capacity }) : ''}</p>
                    )}
                  </div>
                  <Icon name="chevron" size={16} className="shrink-0 self-center -rotate-90 text-black/30" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {evDetail && <EventSheet e={evDetail} currency={currency} ac={ac} slug={slug} signedIn={signedIn} businessName={businessName} address={address} onClose={() => setEvDetail(null)} />}

    <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6 md:gap-10 items-start">
      <div className="space-y-6">
        {menu?.sections?.length ? menu.sections.map((s: any) => (
          <section key={s.id}>
            <h2 className="t-section mb-2">{s.title}</h2>
            <ul className="divide-y divide-black/[0.06]">
              {s.items.map((it: any) => (
                <li key={it.id} className={`py-2.5 flex items-baseline gap-3 ${it.soldOut ? 'opacity-50' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight">{it.name}{it.soldOut && <span className="ml-2 text-[11px] uppercase tracking-wider text-black/50">{t('vyprodáno')}</span>}</p>
                    {it.description && <p className="text-sm text-black/55 mt-0.5 text-pretty">{it.description}</p>}
                    {/* Alergeny jen u položek, kde je podnik vyplnil: prázdné neznamená „bez alergenů“. */}
                    {Array.isArray(it.alergeny) && it.alergeny.length > 0 && <p className="text-xs text-black/55 mt-0.5"><span className="font-semibold">{t('Alergeny')}:</span> {it.alergeny.join(', ')}</p>}
                  </div>
                  <span className="tabular-nums font-semibold shrink-0">{money(it.price)}</span>
                </li>
              ))}
            </ul>
          </section>
        )) : <EmptyState icon="leaf" title={t('Nabídka zatím není zveřejněná')} hint={t('Podnik ji doplní v aplikaci.')} compact />}
        {/* Legenda alergenů a věta o složení přicházejí ze serveru v jazyce hosta (formální „Sie“ u němčiny, právně citlivé). */}
        {menu?.alergenyNazvy && Object.keys(menu.alergenyNazvy).length > 0 && (
          <div className="text-xs text-black/55 leading-relaxed space-y-1">
            <p><span className="font-semibold text-black/70">{t('Alergeny')}:</span> {Object.entries(menu.alergenyNazvy).map(([k, n]) => `${k} ${n}`).join(' · ')}</p>
            {menu.alergenyPoznamka && <p>{menu.alergenyPoznamka}</p>}
            {menu.alergenyNeuplne && <p>{t('U některých položek alergeny nejsou vyplněny — zeptejte se obsluhy.')}</p>}
          </div>
        )}
      </div>
      <aside className="space-y-5 md:sticky md:top-24">
        {tagline && <p className="text-base font-semibold tracking-tight text-pretty">{tagline}</p>}
        {description && <p className="text-sm text-black/65 leading-relaxed text-pretty">{description}</p>}
        {address && <p className="text-sm text-black/65 inline-flex items-center gap-1.5 max-w-full"><Icon name="location" size={15} className="text-black/45 shrink-0" /><span className="min-w-0 break-words">{address}</span></p>}
        <div>
          {(news?.length ?? 0) > 0 && (
            <div className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-black/45 mb-2">{t('Novinky')}</p>
              <ul className="space-y-3">
                {news!.map((n: any) => (
                  <li key={n.id}>
                    <p className="font-semibold text-sm leading-tight">{n.title}</p>
                    {n.body && <p className="text-sm text-black/60 text-pretty">{n.body}</p>}
                    <p className="text-xs text-black/40 mt-0.5"><span className="cz-sentence">{fmtDatum(String(n.sent_at).slice(0, 10), { jazyk, styl: 'denDlouze' })}</span></p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-black/45 mb-2">{t('Otevírací doba')}</p>
          <ul className="text-sm divide-y divide-black/[0.06]">
            {[0, 1, 2, 3, 4, 5, 6].map(i => {
              const n = fmtDenVTydnu(i, { jazyk, styl: 'dlouhy' });
              const day = hours?.[String(i)];
              const txt = !day ? t('neuvedeno') : day.closed || !day.open ? t('zavřeno') : `${day.open}–${day.close}`;
              return <li key={i} className="py-1.5 flex justify-between gap-3"><span className="cz-sentence">{n}</span><span className="tabular-nums text-black/70">{txt}</span></li>;
            })}
          </ul>
        </div>
      </aside>
    </div>
    </div>
  );
}

function ReserveTab({ slug, b, me, today, signedIn, onDone }: { slug: string; b: any; me: any; today: string; signedIn: boolean; onDone: (m: string) => void }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('');
  const [party, setParty] = useState(2);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const slots = useMemo(() => slotsFor(b.hours, date, b.slotMinutes), [b.hours, date, b.slotMinutes]);
  useEffect(() => { if (!slots.includes(time)) setTime(slots[0] ?? ''); }, [slots, time]);
  const maxDate = dayPlus(today, b.leadDays);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (!signedIn) { window.location.href = `/client/login?next=${encodeURIComponent('/client/' + slug)}`; return; }
    if (!time) { setErr(t('Vyber čas.')); return; }
    setBusy(true);
    // Bez `try` umřela obsluha na výpadku spojení uvnitř `await fetch`
    // a nestalo se **vůbec nic**: žádná chyba, žádné potvrzení. Host pak
    // neví, jestli stůl má — buď přijde a nemá, nebo nepřijde vůbec.
    // U rezervace je nejistota to nejhorší, co jí můžeme vrátit.
    try {
      const r = await fetch(`/api/client/b/${encodeURIComponent(slug)}/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, time, party, note }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error ? t(d.error) : t('Rezervace se nepovedla.')); return; }
      setNote(''); onDone(t('Rezervace odeslána. Podnik ji potvrdí.'));
    } catch {
      setErr(t('Rezervace neodešla — vypadlo připojení. Zkus to prosím znovu.'));
    } finally {
      setBusy(false);
    }
  };
  const [zrusitId, setZrusitId] = useState<number | null>(null);
  const cancel = async (id: number) => {
    setZrusitId(null);
    try {
      const r = await fetch(`/api/client/reservations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) });
      if (r.ok) { onDone(t('Rezervace zrušena.')); return; }
      const d = await r.json().catch(() => ({}));
      setErr(d.error ? t(d.error) : t('Zrušení se nepovedlo. Zkus to prosím znovu.'));
    } catch {
      // Nezrušená rezervace je horší než neodeslaná: podnik na hosta čeká.
      setErr(t('Zrušení neodešlo — vypadlo připojení. Rezervace zatím platí, zkus to prosím znovu.'));
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-6 md:gap-10 items-start">
      <form onSubmit={submit} className="glass-card p-5 sm:p-6 grid gap-4" noValidate>
        <h2 className="t-section">{t('Rezervovat stůl')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <label htmlFor="r-date" className={label}>{t('Den')}</label>
            <input id="r-date" type="date" min={today} max={maxDate} value={date} onChange={e => setDate(e.target.value)} className={input} required />
          </div>
          <div className="grid gap-2">
            <label htmlFor="r-time" className={label}>{t('Čas')}</label>
            {slots.length ? (
              <select id="r-time" value={time} onChange={e => setTime(e.target.value)} className={input}>
                {slots.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : <p className="text-sm text-black/55 py-3">{t('V tento den je zavřeno.')}</p>}
          </div>
          <div className="grid gap-2">
            <label htmlFor="r-party" className={label}>{t('Kolik vás bude')}</label>
            <div className="flex items-center gap-2">
              <button type="button" aria-label={t('Méně')} onClick={() => setParty(p => Math.max(1, p - 1))} className="tap-target h-11 w-11 rounded-full glass border border-black/10 grid place-items-center hover:bg-black/[0.05] active:scale-95 transition"><span className="text-lg leading-none">−</span></button>
              <input id="r-party" type="number" min={1} max={b.maxParty} value={party} onChange={e => setParty(Math.max(1, Math.min(b.maxParty, parseInt(e.target.value || '1', 10))))} className={`${input} text-center tabular-nums !w-20`} />
              <button type="button" aria-label={t('Více')} onClick={() => setParty(p => Math.min(b.maxParty, p + 1))} className="tap-target h-11 w-11 rounded-full glass border border-black/10 grid place-items-center hover:bg-black/[0.05] active:scale-95 transition"><span className="text-lg leading-none">+</span></button>
            </div>
            <p className="text-xs text-black/45">{t('Nejvíc {n} u jedné rezervace.', { n: b.maxParty })}</p>
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <label htmlFor="r-note" className={label}>{t('Poznámka')}</label>
            <input id="r-note" value={note} onChange={e => setNote(e.target.value)} placeholder={t('Kočárek, oslava, u okna…')} className={input} maxLength={300} />
          </div>
        </div>
        {err && <p role="alert" className="note note-danger text-sm px-3 py-2">{err}</p>}
        <button type="submit" disabled={busy || !slots.length} className={btnPrimary}>
          <Icon name="calendarCheck" size={16} /> {busy ? t('Odesílám…') : signedIn ? t('Odeslat rezervaci') : t('Přihlásit se a rezervovat')}
        </button>
      </form>
      <aside>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-black/45 mb-2">{t('Moje rezervace tady')}</h3>
        {me?.reservations?.length ? (
          <ul className="divide-y divide-black/[0.06]">
            {me.reservations.map((r: any) => {
              const st = RES_STATUS[r.status] ?? RES_STATUS.requested;
              return (
                <li key={r.id} className="py-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold cz-sentence">{fmtDatum(r.date, { jazyk, styl: 'denDlouze' })} <span className="text-black/50 font-medium">· {r.time}</span></p>
                    <p className="text-sm text-black/55">{t('{n, plural, one {# osoba} few {# osoby} other {# osob}}', { n: r.party })}{r.note ? ` · ${r.note}` : ''}</p>
                    <span className={`inline-block mt-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.tone === 'ok' ? 'bg-[#C8F542]/25 text-[#3E5406]' : st.tone === 'wait' ? 'bg-wait/15 text-wait-ink' : 'bg-black/[0.06] text-black/60'}`}>{t(st.label)}</span>
                  </div>
                  {['requested', 'confirmed'].includes(r.status) && (
                    <button onClick={() => setZrusitId(r.id)} className="tap-target-sm text-xs text-black/55 hover:text-bad-ink transition shrink-0">{t('Zrušit', undefined, 'rezervace')}</button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-black/55">{t('Zatím žádná. První je hned vlevo.')}</p>}
      </aside>
      <Modal open={zrusitId !== null} onClose={() => setZrusitId(null)} size="sm" title={t('Zrušit rezervaci?')}
        footer={<>
          <Button variant="secondary" onClick={() => setZrusitId(null)}>{t('Ponechat')}</Button>
          <Button variant="danger" onClick={() => { if (zrusitId !== null) void cancel(zrusitId); }}>{t('Zrušit rezervaci')}</Button>
        </>}>
        <p className="text-sm text-black/65">{t('Podnik se o zrušení dozví a termín se uvolní.')}</p>
      </Modal>
    </div>
  );
}

/** 2026-11-12 na „12. 11." (pořadí den, měsíc platí pro všechny jazyky stránky). */
function denKratce(den: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(den);
  return m ? `${Number(m[3])}. ${Number(m[2])}.` : den;
}

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
    <section aria-label={bonus.name} className="rounded-2xl px-4 py-3 flex items-start gap-3 min-w-0" style={{ background: `${accent}22`, border: `1px solid ${accent}66` }}>
      <Icon name="gift" size={18} className="shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider opacity-70 break-words">{bonus.name}</p>
        {radky.map(r => <p key={r} className="text-sm font-semibold leading-snug text-pretty">{r}</p>)}
      </div>
    </section>
  );
}

function LoyaltyTab({ slug, b, me, today, campaigns, coupons, signedIn, onDone }: { slug: string; b: any; me: any; today: string; campaigns: any[]; coupons: any[]; signedIn: boolean; onDone: (m: string) => void }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [promo, setPromo] = useState('');
  const [promoErr, setPromoErr] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const usePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signedIn) { window.location.href = `/client/login?next=${encodeURIComponent('/client/' + slug + '?tab=loyalty')}`; return; }
    if (!promo.trim()) return;
    setPromoBusy(true); setPromoErr('');
    try {
      const r = await fetch(`/api/client/b/${encodeURIComponent(slug)}/promo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: promo }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setPromoErr(d.error ? t(d.error) : t('Kód nešel uplatnit.')); return; }
      setPromo('');
      onDone(`${d.title}: ${[d.points ? t('+{n} bodů', { n: d.points }) : '', d.coupon ? t('kupon {kod}', { kod: d.coupon }) : ''].filter(Boolean).join(` ${t('a')} `)}.`);
    } catch {
      // Kód zůstává v poli — jednorázový promo kód se nepřepisuje naslepo.
      setPromoErr(t('Kód se nepodařilo odeslat — vypadlo připojení. Zkus to znovu.'));
    } finally {
      setPromoBusy(false);
    }
  };
  const claim = async (id: number) => {
    if (!signedIn) { window.location.href = `/client/login?next=${encodeURIComponent('/client/' + slug)}`; return; }
    setBusy(id); setErr('');
    try {
      const r = await fetch(`/api/client/b/${encodeURIComponent(slug)}/coupons/${id}/claim`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error ? t(d.error) : t('Kupon se nepodařilo vzít.')); return; }
      onDone(t('Kupon je tvůj. Kód {kod} ukaž u kasy.', { kod: d.code }));
    } catch {
      setErr(t('Kupon se nepodařilo vzít — vypadlo připojení. Zkus to znovu.'));
    } finally {
      setBusy(null);
    }
  };
  const target = b.stampTarget || 0;
  return (
    <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-6 md:gap-10 items-start">
      <section className="glass-card p-5 sm:p-6">
        <h2 className="t-section">{t('Razítka a body')}</h2>
        {me?.member ? (
          <>
            {(me.campaigns ?? []).length > 0 ? (
              <ul className="mt-4 space-y-4">
                {me.campaigns.map((cp: any) => (
                  <li key={cp.id} id={`karta-${cp.id}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold min-w-0 truncate">{cp.name}</p>
                      <p className="text-sm font-semibold tabular-nums shrink-0">{cp.stamps} / {cp.required}</p>
                    </div>
                    {cp.description && <p className="text-xs text-black/55 mt-0.5">{cp.description}</p>}
                    <RazitkaPoznamky cp={cp} />
                    <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(cp.required, 10)}, minmax(0, 1fr))` }} aria-hidden>
                      {Array.from({ length: Math.min(cp.required, 20) }).map((_, i) => (
                        <span key={i} className={`h-8 rounded-lg border ${i < cp.stamps ? 'bg-[#C8F542] border-[#C8F542]' : 'bg-white/60 border-black/[0.08]'}`} />
                      ))}
                    </div>
                    {cp.reward && <p className="mt-2 text-xs text-black/55">{t('Za plnou kartu:')} <strong className="text-black/80">{cp.reward}</strong>{cp.completed > 0 ? ` · ${t('dokončeno {n}×', { n: cp.completed })}` : ''}</p>}
                  </li>
                ))}
              </ul>
            ) : target > 0 && (
              <div className="mt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-black/60">{t('Razítka za návštěvy')}</p>
                  <p className="text-sm font-semibold tabular-nums">{me.stamps} / {target}</p>
                </div>
                <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(target, 10)}, minmax(0, 1fr))` }} aria-hidden>
                  {Array.from({ length: target }).map((_, i) => (
                    <span key={i} className={`h-8 rounded-lg border ${i < me.stamps ? 'bg-[#C8F542] border-[#C8F542]' : 'bg-white/60 border-black/[0.08]'}`} />
                  ))}
                </div>
                <p className="mt-2 text-xs text-black/55">{t('Za {n, plural, one {# návštěvu} few {# návštěvy} other {# návštěv}}:', { n: target })} <strong className="text-black/80">{b.stampReward || t('odměna')}</strong>. {t('Razítko přibude, když podnik uzavře tvoji rezervaci nebo objednávku.')}</p>
              </div>
            )}
            <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-black/[0.06] pt-4">
              <p className="text-sm text-black/60">{t('Body')}</p>
              <p className="text-2xl font-bold tabular-nums">{me.points}</p>
            </div>
            <p className="text-xs text-black/55 mt-1">{t('{body} bodů za každých {castka} útraty od stolu. Body jsou na kupony vpravo.', { body: b.pointsPer100, castka: formatMoney(100, b.currency) })}</p>
            {b.cashbackPct > 0 && (
              <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-black/[0.06] pt-4">
                <div className="min-w-0">
                  <p className="text-sm text-black/60">{t('Kredit')}</p>
                  <p className="text-xs text-black/55 mt-0.5">{t('{n} % z každé útraty se vrací jako kredit. Obsluha ho odečte u kasy.', { n: b.cashbackPct })}</p>
                </div>
                <p className="text-2xl font-bold tabular-nums shrink-0">{formatMoney(me.credit ?? 0, b.currency)}</p>
              </div>
            )}
            {me.discount > 0 && (
              <p className="mt-4 rounded-2xl bg-[#16181A] text-[#C8F542] px-3.5 py-2.5 text-sm font-semibold">
                {me.discountSource === 'skupina' && me.discountName
                  ? t('Jako člen skupiny „{skupina}“ máš u nás slevu {n} %.', { skupina: me.discountName, n: me.discount })
                  : t('Jako „{level}“ máš u nás slevu {n} %.', { level: t(me.levelLabel), n: me.discount })}
                {me.nextTierAt ? ` ${me.nextTierUnit === 'spend'
                  ? t('Do „{level}“ ti zbývá {castka}.', { level: t(me.nextTierLabel), castka: formatMoney(Math.max(0, me.nextTierAt - (me.spend ?? 0)), b.currency) })
                  : t('Do „{level}“ ti zbývá {n, plural, one {# návštěva} few {# návštěvy} other {# návštěv}}.', { level: t(me.nextTierLabel), n: Math.max(0, me.nextTierAt - me.visits) })}` : ''}
              </p>
            )}
            {me.claims?.length > 0 && (
              <div className="mt-5 border-t border-black/[0.06] pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-black/45 mb-2">{t('Kupony k uplatnění')}</p>
                <ul className="space-y-2">
                  {me.claims.map((c: any) => (
                    <li key={c.id} className="rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/40 px-3.5 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium min-w-0 truncate">{c.title}</span>
                        <span className="font-mono font-bold tracking-widest text-sm shrink-0">{c.code}</span>
                      </div>
                      <PlatnostKuponu validUntil={c.valid_until} today={today} className="block text-xs mt-0.5" />
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-black/50 mt-2">{t('Kód ukaž obsluze u kasy.')}</p>
              </div>
            )}
            {signedIn && <HostHistorie slug={slug} className="mt-5 border-t border-black/[0.06] pt-4" />}
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-black/60">{t('Staň se členem a začni sbírat razítka za návštěvy a body za útratu. Kartičku s QR máš v Moje.')}</p>
            {campaigns.length > 0 && (
              <ul className="mt-4 space-y-3">
                {campaigns.map((cp: any) => (
                  <li key={cp.id} className="well bg-white px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold min-w-0 truncate">{cp.name}</p>
                      <p className="text-xs text-black/50 tabular-nums shrink-0">{t('{n} razítek', { n: cp.required })}</p>
                    </div>
                    <p className="text-xs text-black/55 mt-0.5">{cp.description || (cp.reward ? `${t('Za plnou kartu:')} ${cp.reward}` : '')}</p>
                    <RazitkaPoznamky cp={cp} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <HostPravidla b={b} campaigns={campaigns} />
        <form onSubmit={usePromo} className="mt-5 border-t border-black/[0.06] pt-4">
          <label htmlFor="promo-code" className={label}>{t('Máš promo kód?')}</label>
          <div className="flex gap-2">
            <input id="promo-code" value={promo} onChange={e => setPromo(e.target.value.toUpperCase())} placeholder={t('Z letáku nebo účtenky')} autoComplete="off" className={`${input} font-mono tracking-widest flex-1 min-w-0`} />
            <button type="submit" disabled={promoBusy} className="tap-target shrink-0 inline-flex items-center btn btn-primary active:scale-[0.98] disabled:opacity-50 transition">{promoBusy ? '…' : t('Uplatnit')}</button>
          </div>
          {promoErr && <p role="alert" className="mt-2 text-sm text-bad-ink">{promoErr}</p>}
        </form>
        <div className="mt-5 border-t border-black/[0.06] pt-4"><MamPoukaz slug={slug} /></div>
      </section>
      <section>
        <h2 className="t-section mb-3">{t('Kupony za body')}</h2>
        {err && <p role="alert" className="mb-3 note note-danger text-sm px-3 py-2">{err}</p>}
        {coupons?.length ? (
          <ul className="divide-y divide-black/[0.06]">
            {coupons.map((c: any) => {
              const can = me?.member && me.points >= Number(c.cost_points) && !c.blocked;
              return (
                <li key={c.id} id={`kupon-${c.id}`} className={`py-3.5 flex items-center gap-4 ${c.blocked ? 'opacity-60' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {c.title}
                      {c.benefit && <span className="ml-2 rounded-full bg-[#C8F542]/25 text-[#3E5406] px-2 py-0.5 text-[11px] font-bold align-middle whitespace-nowrap">{c.benefit}</span>}
                    </p>
                    {c.description && <p className="text-sm text-black/55 text-pretty">{c.description}</p>}
                    {(c.badges?.length > 0 || c.valid_until) && (
                      <p className="text-xs text-black/45 mt-0.5">
                        {(c.badges ?? []).join(' · ')}{c.badges?.length > 0 && c.valid_until ? ' · ' : ''}
                        <PlatnostKuponu validUntil={c.valid_until} today={today} />
                      </p>
                    )}
                    {c.blocked && <p className="text-xs text-wait-ink mt-0.5">{c.blocked}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums">{Number(c.cost_points) === 0 ? t('zdarma') : t('{n} b.', { n: c.cost_points })}</p>
                    <button onClick={() => claim(c.id)} disabled={busy === c.id || (signedIn && me?.member && !can)}
                      className="tap-target-sm mt-1 btn btn-primary btn-sm active:scale-[0.97] disabled:opacity-40 transition">
                      {busy === c.id ? '…' : t('Vzít')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <EmptyState icon="gift" title={t('Zatím žádné kupony')} hint={t('Podnik je přidá, jakmile bude mít co nabídnout.')} compact />}
      </section>
    </div>
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
              <p className="text-lg font-bold tracking-tight flex items-center gap-2"><span className="rounded-lg bg-[#16181A] text-[#C8F542] px-2 py-0.5 text-sm">{qrTable.name}</span><span className="text-sm font-medium text-black/50">{t('podle QR na stole')}</span></p>
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
            <p className={`text-xs flex items-center gap-1.5 ${geo.status === 'ok' ? 'text-[#3E5406]' : geo.status === 'denied' ? (geoMode === 'block' ? 'text-bad-ink' : 'text-wait-ink') : 'text-black/50'}`}>
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
                  <h2 className="text-base font-bold tracking-tight mb-1">{s.title}</h2>
                  <ul className="divide-y divide-black/[0.06]">
                    {list.map((it: any) => {
                      const n = cart[it.id] ?? 0;
                      return (
                        <li key={it.id} className="py-2.5 flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium leading-tight">{it.name}</p>
                            <p className="text-sm text-black/55">{money(it.price)}{it.description ? ` · ${it.description}` : ''}</p>
                          </div>
                          {n === 0 ? (
                            <button onClick={() => setCount(it.id, 1)} aria-label={t('Přidat {name}', { name: it.name })} className="tap-target-sm rounded-full bg-[#16181A] text-white h-9 w-9 grid place-items-center hover:bg-black active:scale-95 transition"><Icon name="plus" size={16} /></button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => setCount(it.id, n - 1)} aria-label={t('Méně')} className="tap-target-sm h-9 w-9 rounded-full glass border border-black/10 grid place-items-center active:scale-95 transition"><span className="text-lg leading-none">−</span></button>
                              <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">{n}</span>
                              <button onClick={() => setCount(it.id, n + 1)} aria-label={t('Více')} className="tap-target-sm h-9 w-9 rounded-full bg-[#16181A] text-white grid place-items-center active:scale-95 transition"><Icon name="plus" size={16} /></button>
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
            <span className="text-xl font-bold tabular-nums">{money(total)}</span>
          </div>
          <div className="grid gap-2">
            <label htmlFor="o-note" className={label}>{t('Poznámka pro obsluhu')}</label>
            <input id="o-note" value={note} onChange={e => setNote(e.target.value)} placeholder={t('Bez cukru, mléko zvlášť…')} className={input} maxLength={300} />
          </div>
          {err && <p role="alert" className="note note-danger text-sm px-3 py-2">{err}</p>}
          <button onClick={submit} disabled={busy} className={`${btnPrimary} w-full`}><Icon name="cup" size={16} /> {busy ? t('Odesílám…') : signedIn ? t('Objednat') : t('Přihlásit se a objednat')}</button>
          <p className="text-xs text-black/45">{t('Platí se u obsluhy jako obvykle. Za každých 100 {mena} dostaneš {body} bodů.', { mena: cur, body: b.pointsPer100 })}</p>
        </div>
        {orders && orders.length > 0 && (
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-black/45 mb-2">{t('Dnešní objednávky')}</h3>
            <ul className="space-y-2">
              {orders.map(o => (
                <li key={o.id} className={`rounded-2xl border px-3.5 py-2.5 ${o.status === 'new' ? 'bg-wait/[0.08] border-wait/30' : o.status === 'confirmed' ? 'bg-[#C8F542]/15 border-[#C8F542]/40' : 'bg-white/60 border-black/[0.06]'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-sm">{ORDER_LABEL[o.status] ? t(ORDER_LABEL[o.status]) : o.status}</span>
                    <span className="text-sm tabular-nums">{money(o.total)}{o.table_name ? ` · ${o.table_name}` : ''}</span>
                  </div>
                  <p className="text-xs text-black/55 truncate">{(o.items ?? []).map((l: any) => `${l.count}× ${l.name}`).join(', ')}</p>
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
              <h3 className="text-xl font-bold tracking-tight text-[#16181A]">{e.title}</h3>
              <p className="text-sm text-black/55 cz-sentence mt-0.5">
                {fmtDatum(e.date, { jazyk, styl: 'denDlouze' })}{e.start_time ? ` · ${e.start_time}${e.end_time ? `–${e.end_time}` : ''}` : ''}
              </p>
            </div>
            <button onClick={m.guard.attemptClose} className="tap-target-sm shrink-0 btn-icon" aria-label={t('Zavřít')}><Icon name="close" size={15} /></button>
          </div>

          {place && (
            <p className="text-sm text-black/60 mt-2">
              <Icon name="location" size={15} className="inline -mt-0.5 mr-1.5 shrink-0" />{place}
              {mapQuery && (
                <a href={`https://mapy.cz/zakladni?q=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer"
                  className="tap-target-sm inline-block ml-2 py-1 text-[#0A5CC0] underline decoration-[#0A5CC0]/30 hover:decoration-[#0A5CC0]">{t('mapa ↗')}</a>
              )}
            </p>
          )}
          {(goingCount > 0 || e.capacity) && (
            <p className="text-xs text-black/45 mt-1.5">{goingCount > 0 ? t('✋ {n, plural, one {# člověk jde} few {# lidi jdou} other {# lidí jde}}', { n: goingCount }) : ''}{goingCount > 0 && e.capacity ? ' · ' : ''}{e.capacity ? t('kapacita {n}', { n: e.capacity }) : ''}</p>
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
            <div className="mt-4 well bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-2">{t('Co se bude podávat')}</p>
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
                ? 'tap-target inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition text-[#16181A]'
                : btnPrimary}
              style={going ? { background: `${ac}40` } : undefined}>
              {going ? t('✋ Jdu — zrušit účast') : t('✋ Přijdu')}
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
          {msg && <p role="status" className="toast-in text-xs text-[#3E5406] bg-[#C8F542]/15 border border-[#C8F542]/35 rounded-xl px-3 py-2 mt-2 text-center">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
