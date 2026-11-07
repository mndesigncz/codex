'use client';

// Stránka podniku ve směru A „Peněženka“ (předloha 04). Nahoře inkoustová obálka s velkým lehkým
// názvem (na telefonu přes celou šířku, na počítači karta s rádiusem 22), pod ní list: monogram,
// název, adresa, stav otevření a řada akcí Rezervovat · Menu · Navigovat · Zavolat. Pak segment
// Odměny · Menu · Akce · Info (role tab, ?tab= v adrese). Odměny = moje karta (QR u kasy) nebo vstup
// do členství, „Dnes“ (bonus a bannery), co dostaneš, moje rezervace, rezervace přímo na stránce,
// co se chystá, o podniku a pravidla s historií. Objednávka od stolu (QR na stole, ?tab=order) má
// vlastní pohled se šipkou zpět. Barva značky podniku tu není nikde: tvář je textura a monogram.

import { useEffect, useState, useCallback, useRef } from 'react';
import { useJePocitac } from '@/lib/useJeTelefon';
import Link from 'next/link';
import { Icon } from '../Icons';
import { Skeleton, EmptyState, Segmented } from '../ui';
import { placedTables } from './TableMap';
import TableMap from './TableMap';
import { RES_STATUS } from '@/lib/clientSlots';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum, fmtMesic } from '@/lib/i18n/format';
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
import Rezervace from './host/Rezervace';
import { useCesta } from './host/cesty';
import { obnovHosta } from './host/data';
import { ListObalky, NadpisSekce, Seznam, PrazdnyStav, KruhoveTlacitko } from './penezenka';
import { ObalkaStranky, HlavickaPodniku } from './host/podnik/Zahlavi';
import { MojeKarta, VstupDoClenstvi } from './host/podnik/MojeKarta';
import { CoDostanes } from './host/podnik/CoDostanes';
import { OPodniku } from './host/podnik/OPodniku';
import './host/podnik/podnik.css';

type Zalozka = 'odmeny' | 'menu' | 'akce' | 'info';
/** ?tab= v adrese → záložka (staré odkazy: loyalty, reserve, menu; order má vlastní pohled). */
const ZE_TAB: Record<string, Zalozka> = { loyalty: 'odmeny', reserve: 'odmeny', odmeny: 'odmeny', menu: 'menu', akce: 'akce', events: 'akce', info: 'info' };
const DO_TAB: Record<Zalozka, string | null> = { odmeny: null, menu: 'menu', akce: 'akce', info: 'info' };

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
  const jePocitac = useJePocitac();
  const [zalozka, setZalozkaStav] = useState<Zalozka>(() => ZE_TAB[dotaz.get('tab') ?? ''] ?? 'odmeny');
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

  /** Přepne záložku a zapíše ji do adresy (?tab=), ostatní parametry nechá. */
  const setZalozka = useCallback((z: Zalozka) => {
    setZalozkaStav(z);
    try {
      const u = new URL(window.location.href);
      const tab = DO_TAB[z];
      if (tab) u.searchParams.set('tab', tab); else if (u.searchParams.get('tab') !== 'reserve' && u.searchParams.get('tab') !== 'loyalty') u.searchParams.delete('tab');
      window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    } catch { /* bez history API zůstane adresa */ }
  }, []);
  /** Skok na prvek na stránce (po přepnutí záložky až po vykreslení). */
  const skok = useCallback((id: string, z?: Zalozka, block: ScrollLogicalPosition = 'start') => {
    if (z) setZalozka(z);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ block, behavior: 'smooth' }), z ? 120 : 0);
  }, [setZalozka]);

  // ?tab=reserve: s ?rezervace=ID skok na moji rezervaci (připomínka), bez něj na rezervaci stolu.
  // ?tab=loyalty: skok na kartu a odměny.
  const skocil = useRef(false);
  useEffect(() => {
    if (!d || skocil.current) return;
    skocil.current = true;
    const tab = dotaz.get('tab');
    const kam = tab === 'reserve' ? (dotaz.get('rezervace') ? `rezervace-${dotaz.get('rezervace')}` : 'rezervovat') : tab === 'loyalty' ? 'vernost' : null;
    if (kam) setTimeout(() => document.getElementById(kam)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 200);
  }, [d, dotaz]);

  if (notFound) return (
    <div className="pt-10">
      <PrazdnyStav titulek={t('Podnik tu není')} text={t('Buď má jinou adresu, nebo Managero client zatím nezapnul.')}
        akce={<Link href={cesta('/client')} className="hp-btn hp-btn-inkoust hp-btn-stredni tap-target">{t('Zpět na podniky')}</Link>} />
    </div>
  );
  if (loadErr && !d) return (
    <div className="pt-10" role="alert">
      <PrazdnyStav titulek={t('Stránka podniku se nenačetla')}
        text={`${/[.!?…]$/.test(loadErr) ? loadErr : loadErr + '.'} ${t('Podnik tu nejspíš je — jen se k němu teď nedovoláme.')}`}
        akce={<button type="button" onClick={() => { void load(); }} className="hp-btn hp-btn-inkoust hp-btn-stredni tap-target"><Icon name="refresh" size={16} strokeWidth={1.6} />{t('Zkusit znovu')}</button>} />
    </div>
  );
  if (!d) return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-[300px] -mx-5 md:mx-0 -mt-5 md:mt-0 md:rounded-[22px]" />
      <Skeleton className="h-16 rounded-[22px]" /><Skeleton className="h-48 rounded-[22px]" />
    </div>
  );

  const b = d.business; const me = d.me; const today: string = d.today; const signedIn = !!d.signedIn;
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

  if (objednavka && lzeObjednat) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <KruhoveTlacitko ikona="arrowLeft" popis={t('Zpět na stránku podniku')} onClick={() => setObjednavka(false)} />
          <div className="min-w-0">
            <p className="hp-meta truncate">{b.name}</p>
            <h1 className="hp-titulek !text-[26px]">{t('Objednat od stolu')}</h1>
          </div>
        </div>
        {flash && <p role="status" className="toast-in note note-ok">{flash}</p>}
        <OrderTab slug={slug} b={b} menu={d.menu} tables={d.tables ?? []} plan={d.plan} signedIn={d.signedIn} onDone={(m: string) => { setFlash(m); }} />
      </div>
    );
  }

  const events: any[] = d.events ?? [];
  const news: any[] = d.news ?? [];
  const zalozky = [
    { id: 'odmeny' as const, label: t('Odměny') },
    { id: 'menu' as const, label: t('Menu') },
    { id: 'akce' as const, label: t('Akce', undefined, 'zalozka') },
    { id: 'info' as const, label: t('Info') },
  ];
  const doMenu = () => skok('h-menu', 'menu');
  const pravidla = b.loyaltyOn ? (
    <section id="pravidla" aria-labelledby="h-pravidla" className="scroll-mt-24">
      <NadpisSekce id="h-pravidla" titulek={t('Pravidla věrnosti')} />
      <div className="lgx hp-sklo p-4 space-y-4">
        <HostPravidla b={b} campaigns={d.stampCampaigns ?? []} />
        {me?.member && <SkonceneKarticky list={me.endedCampaigns ?? []} />}
        {signedIn && <HostHistorie slug={slug} className="border-t border-[var(--hp-line)] pt-3" />}
      </div>
    </section>
  ) : null;

  // Počítač: vlevo předmět (hlavička, Moje karta, O podniku), vpravo záložky. Telefon: jeden sloupec.
  // Do připojení platí telefon (stejné HTML ze serveru), počítač se přeskládá hned po něm.
  const sloupec = jePocitac;
  const vernost = (
    <section id="vernost" aria-label={t('Věrnost')} className="scroll-mt-24 mt-[22px]">
      {me?.member ? <MojeKarta b={b} me={me} coupons={d.coupons ?? []} /> : b.loyaltyOn ? (
        <VstupDoClenstvi b={b} kampan={(d.stampCampaigns ?? [])[0] ?? null} joining={joining} chciNovinky={chciNovinky} setChciNovinky={setChciNovinky} onJoin={join} />
      ) : null}
    </section>
  );
  const oPodniku = <OPodniku b={b} today={today} signedIn={signedIn} poukazOtevreny={dotaz.get('tab') === 'loyalty'} />;

  return (
    <div className="hpp-stranka">
      <ObalkaStranky b={b} />
      <ListObalky>
        <div className="md:grid md:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] md:gap-10 md:items-start">
          <div className="min-w-0">
            <HlavickaPodniku b={b} today={today} bonus={b.loyaltyOn ? d.bonus : null}
              onRezervovat={b.reservationsOn ? () => skok('rezervovat', 'odmeny', 'center') : null} onMenu={doMenu} />
            {sloupec && vernost}
            {sloupec && oPodniku}
          </div>
          <div className="min-w-0">
            {flash && <p role="status" className="mt-5 md:mt-0 toast-in note note-ok">{flash}</p>}
            <div className="hp-segment mt-[22px] md:mt-0">
              <Segmented ariaLabel={t('Stránka podniku', undefined, 'host')} value={zalozka} onChange={z => setZalozka(z)} options={zalozky} />
            </div>

            {zalozka === 'odmeny' && (
              <div role="tabpanel" aria-label={t('Odměny')}>
                {/* Členství: moje karta (QR u kasy), nebo vstup s tím, co host dostane hned. */}
                {!sloupec && vernost}

                {/* Dnes: běžící bonus a bannery podniku (data podniku). */}
                {((d.bonus && b.loyaltyOn) || (d.banners?.length ?? 0) > 0) && (
                  <section aria-label={t('Dnes')} className={`${sloupec ? 'mt-[22px]' : 'mt-6'} space-y-3`}>
                    {d.bonus && b.loyaltyOn && <BonusPruh bonus={d.bonus} />}
                    {(d.banners?.length ?? 0) > 0 && <PromoBanners vzhled="penezenka" banners={d.banners} loyaltyOn={!!b.loyaltyOn} slug={slug}
                      onGoTab={tab => { if (tab === 'loyalty') skok('odmeny-podniku', 'odmeny'); else if (tab === 'events') skok('h-events', 'akce'); else doMenu(); }} />}
                  </section>
                )}

                {b.loyaltyOn && <CoDostanes slug={slug} me={me} today={today} campaigns={d.stampCampaigns ?? []} coupons={d.coupons ?? []} signedIn={signedIn}
                  onDone={(m: string) => { setFlash(m); load(); void obnovHosta(); }} onPravidla={() => skok('pravidla')} />}

                {signedIn && b.reservationsOn && (me?.reservations?.length ?? 0) > 0 && <MojeRezervace slug={slug} me={me} onDone={(m: string) => { setFlash(m); load(); }} />}

                {b.reservationsOn && (
                  <section id="rezervovat" aria-labelledby="h-rezervovat" className="scroll-mt-24">
                    <NadpisSekce id="h-rezervovat" titulek={t('Rezervace')} />
                    <Rezervace slug={slug} nazev={b.name} adresa={b.address} maxOsob={b.maxParty || 8} dnes={today} prihlasen={signedIn} hodiny={b.hours} krok={b.slotMinutes} dopredu={b.leadDays} onHotovo={(m: string) => { setFlash(m); load(); }} />
                  </section>
                )}

                {events.length > 0 && <CoSeChysta events={events.slice(0, 2)} b={b} slug={slug} signedIn={signedIn}
                  vpravo={events.length > 2 ? <button type="button" onClick={() => skok('h-events', 'akce')} className="tap-target">{t('Všechny akce')}</button> : null} />}

                {!sloupec && oPodniku}

                {pravidla}
              </div>
            )}

            {zalozka === 'menu' && (
              <div role="tabpanel" aria-label={t('Menu')}>
                <section id="menu" aria-labelledby="h-menu" className="scroll-mt-24">
                  <NadpisSekce id="h-menu" titulek={t('Menu')} className="!mt-[22px]"
                    vpravo={lzeObjednat ? <button type="button" onClick={() => { setObjednavka(true); window.scrollTo({ top: 0 }); }} className="hp-btn hp-btn-inkoust hp-btn-male tap-target !text-[13px] !text-[var(--hp-btn-ink-fg)]"><Icon name="cup" size={15} strokeWidth={1.6} />{t('Objednat od stolu')}</button> : null} />
                  <Menu menu={d.menu} currency={b.currency} />
                </section>
              </div>
            )}

            {zalozka === 'akce' && (
              <div role="tabpanel" aria-label={t('Akce', undefined, 'zalozka')}>
                {d.bonus && b.loyaltyOn && <div className="mt-[22px]"><BonusPruh bonus={d.bonus} /></div>}
                {events.length > 0
                  ? <CoSeChysta events={events} b={b} slug={slug} signedIn={signedIn} />
                  : <div className="mt-6"><PrazdnyStav titulek={t('Zatím se nic nechystá')} text={t('Akce podniku se objeví tady.')} /></div>}
                {news.length > 0 && (
                  <section aria-labelledby="h-novinky">
                    <NadpisSekce id="h-novinky" titulek={t('Novinky')} />
                    <Seznam>
                      {news.map((n: any) => (
                        <li key={n.id} className="px-4 py-3.5">
                          <p className="hp-silny">{n.title}</p>
                          {n.body && <p className="hp-text text-[var(--hp-muted)] mt-0.5 text-pretty">{n.body}</p>}
                          <p className="hp-meta mt-1 cz-sentence">{fmtDatum(String(n.sent_at).slice(0, 10), { jazyk, styl: 'denDlouze' })}</p>
                        </li>
                      ))}
                    </Seznam>
                  </section>
                )}
              </div>
            )}

            {zalozka === 'info' && (
              <div role="tabpanel" aria-label={t('Info')}>
                {/* Na počítači je O podniku vlevo pod kartou; tady jen fotky. */}
                <OPodniku b={b} today={today} signedIn={signedIn} galerie jenGalerie={sloupec} />
                {pravidla}
              </div>
            )}
          </div>
        </div>
      </ListObalky>
    </div>
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
    <section id="rezervace" aria-labelledby="h-moje-rez" className="scroll-mt-24">
      <NadpisSekce id="h-moje-rez" titulek={t('Moje rezervace tady')} />
      {err && <p role="alert" className="mb-3 note note-danger">{err}</p>}
      <Seznam>
        {me.reservations.map((r: any) => {
          const st = RES_STATUS[r.status] ?? RES_STATUS.requested;
          const potvrzeno = !!r.guest_confirmed_at || !!potvrzene[r.id];
          const zvyraznit = zPripominky === r.id;
          return (
            <li key={r.id} id={`rezervace-${r.id}`} className={`px-4 py-3.5 scroll-mt-24 ${zvyraznit ? 'bg-[var(--hp-well)]' : ''}`}>
              <div className="flex items-start gap-3.5">
                <span className="hp-jamka" aria-hidden><Icon name="calendar" size={18} strokeWidth={1.6} /></span>
                <div className="min-w-0 flex-1">
                  <p className="hp-silny cz-sentence">{fmtDatum(r.date, { jazyk, styl: 'denDlouze' })} · {r.time}</p>
                  <p className="hp-meta mt-0.5">{t('{n, plural, one {# osoba} few {# osoby} other {# osob}}', { n: r.party })}{r.note ? ` · ${r.note}` : ''}</p>
                  {zvyraznit && !potvrzeno && r.status === 'confirmed' && <p className="hp-meta mt-1">{t('Dorazíš? Potvrď, nebo rezervaci zruš — uvolníš místo jiným.')}</p>}
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full hp-mikro ${st.tone === 'ok' ? 'bg-[var(--hp-btn-ink-bg)] text-[var(--hp-btn-ink-fg)]' : 'bg-[var(--hp-well)] text-[var(--hp-fg)]'}`}>{st.tone === 'ok' && <Icon name="check" size={11} />}{t(st.label)}</span>
              </div>
              {['requested', 'confirmed'].includes(r.status) && (
                <div className="mt-3 pl-[52px] grid grid-cols-2 gap-2">
                  {r.status === 'confirmed' ? (potvrzeno
                    ? <span className="hp-btn hp-btn-male bg-[var(--hp-well)] text-[var(--hp-fg)] !font-medium"><Icon name="check" size={13} />{t('Potvrzeno tebou')}</span>
                    : <button type="button" onClick={() => { void potvrdit(r.id); }} disabled={potvrzuji === r.id}
                        className="tap-target hp-btn hp-btn-inkoust hp-btn-male min-w-0 disabled:opacity-50"
                        aria-label={t('Potvrdit rezervaci {kdy}', { kdy: `${fmtDatum(r.date, { jazyk, styl: 'denDlouze' })} ${r.time}` })}>
                        <Icon name="check" size={14} />{potvrzuji === r.id ? '…' : t('Potvrdit', undefined, 'rezervace')}
                      </button>) : <span />}
                  <button type="button" onClick={() => setZrusitId(r.id)} className="tap-target hp-btn lgx hp-btn-sklo hp-btn-male min-w-0">{t('Zrušit', undefined, 'rezervace')}</button>
                </div>
              )}
            </li>
          );
        })}
      </Seznam>
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

/** „Co se chystá“: akce podniku jako řádky s datovou dlaždicí na krému (nebo fotkou). */
function CoSeChysta({ events, b, slug, signedIn, vpravo }: { events: any[]; b: any; slug: string; signedIn: boolean; vpravo?: React.ReactNode }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const [evDetail, setEvDetail] = useState<any | null>(null);
  return (
    <section aria-labelledby="h-events" className="scroll-mt-24">
      <NadpisSekce id="h-events" titulek={t('Co se chystá')} vpravo={vpravo} />
      <Seznam>
        {events.map((e: any) => (
          <li key={e.id}>
            <button type="button" onClick={() => setEvDetail(e)} className="hp-radek">
              {e.photos?.[0]
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={e.photos[0]} alt="" className="hpp-foto" />
                : <span className="hpp-datum" aria-hidden><b>{Number(String(e.date).slice(8, 10))}</b><span>{fmtMesic(Number(String(e.date).slice(5, 7)), { jazyk, styl: 'kratky' })}</span></span>}
              <span className="hp-radek-telo">
                <span className="hp-silny block">{e.title}</span>
                <span className="hp-meta hp-num block mt-0.5 cz-sentence">{fmtDatum(e.date, { jazyk, styl: 'denKratce' })}{e.start_time ? ` · ${e.start_time}` : ''}{e.going > 0 ? ` · ${t('{n, plural, one {# člověk jde} few {# lidi jdou} other {# lidí jde}}', { n: e.going })}` : ''}{e.capacity ? ` · ${t('kapacita {n}', { n: e.capacity })}` : ''}</span>
              </span>
              <span className="hp-sipka" aria-hidden><Icon name="chevronRight" size={18} strokeWidth={1.6} /></span>
            </button>
          </li>
        ))}
      </Seznam>
      {evDetail && <EventSheet e={evDetail} currency={b.currency} slug={slug} signedIn={signedIn} businessName={b.name} address={b.address} onClose={() => setEvDetail(null)} />}
    </section>
  );
}

/** Menu: oddíly jako tiché sklo, čipy částí nabídky nahoře. */
function Menu({ menu, currency }: { menu: any; currency: string }) {
  const t = useT('klient-host');
  // Ceny v menu smějí mít haléře (4,50 €) — formatMoney by je zaokrouhlil na celé.
  const money = (n: number) => formatPrice(n, currency);
  const sekce: any[] = menu?.sections ?? [];
  const [vybrana, setVybrana] = useState<number | null>(null);
  if (!sekce.length) return <PrazdnyStav titulek={t('Nabídka zatím není zveřejněná')} text={t('Podnik ji doplní v aplikaci.')} />;
  const ukaz = vybrana == null ? sekce : sekce.filter(s => s.id === vybrana);
  return (
    <div className="space-y-3">
      {sekce.length > 1 && (
        <div className="hpp-filtry overflow-x-auto scroll-fade-x !mt-0" role="radiogroup" aria-label={t('Části nabídky')}>
          <button type="button" role="radio" aria-checked={vybrana == null} onClick={() => setVybrana(null)} className="hp-cip">{t('Všechno')}</button>
          {sekce.map(s => <button key={s.id} type="button" role="radio" aria-checked={vybrana === s.id} onClick={() => setVybrana(s.id)} className="hp-cip">{s.title}</button>)}
        </div>
      )}
      {ukaz.map((s: any) => (
        <section key={s.id} className="lgx hp-sklo hpp-oddil">
          <h3 className="hp-h2 pt-2.5 pb-1">{s.title}</h3>
          <ul>
            {s.items.map((it: any) => (
              <li key={it.id} className={`py-3 flex items-baseline gap-3 ${it.soldOut ? 'opacity-50' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="hp-silny !font-medium">{it.name}{it.soldOut && <span className="ml-2 hp-mikro text-[var(--hp-muted)] align-middle">{t('vyprodáno')}</span>}</p>
                  {it.description && <p className="hp-meta mt-0.5 text-pretty">{it.description}</p>}
                  {/* Alergeny jen u položek, kde je podnik vyplnil: prázdné neznamená „bez alergenů“. */}
                  {Array.isArray(it.alergeny) && it.alergeny.length > 0 && <p className="hp-meta !text-[12px] mt-0.5"><span className="font-semibold">{t('Alergeny')}:</span> {it.alergeny.join(', ')}</p>}
                </div>
                <span className="hp-num font-semibold shrink-0 text-[var(--hp-fg)]">{money(it.price)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {/* Legenda alergenů a věta o složení přicházejí ze serveru v jazyce hosta (formální „Sie“ u němčiny, právně citlivé). */}
      {menu?.alergenyNazvy && Object.keys(menu.alergenyNazvy).length > 0 && (
        <div className="hp-meta !text-[12px] leading-relaxed space-y-1">
          <p><span className="font-semibold text-[var(--hp-fg)]">{t('Alergeny')}:</span> {Object.entries(menu.alergenyNazvy).map(([k, n]) => `${k} ${n}`).join(' · ')}</p>
          {menu.alergenyPoznamka && <p>{menu.alergenyPoznamka}</p>}
          {menu.alergenyNeuplne && <p>{t('U některých položek alergeny nejsou vyplněny — zeptejte se obsluhy.')}</p>}
        </div>
      )}
    </div>
  );
}

const btnPrimary = 'tap-target inline-flex items-center justify-center gap-2 btn btn-accent hover:brightness-105 active:scale-[0.98] disabled:opacity-50 transition';
const btnQuiet = 'tap-target inline-flex items-center justify-center gap-2 btn btn-secondary hover:bg-black/[0.05] active:scale-[0.98] disabled:opacity-50 transition';
const input = 'field text-sm';
const label = 'field-label';

/** Pruh s právě běžící bonusovou akcí podniku. */
function BonusPruh({ bonus }: { bonus: { name: string; multiplier: number; stampBonus: number; until: string | null } }) {
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
    <section aria-label={bonus.name} className="lgx hp-sklo px-4 py-3.5 flex items-center gap-3.5 min-w-0">
      <span className="hp-jamka" aria-hidden><Icon name="sparkle" size={18} strokeWidth={1.6} /></span>
      <div className="min-w-0">
        <p className="hp-meta break-words">{bonus.name}</p>
        {radky.map(r => <p key={r} className="hp-silny text-pretty">{r}</p>)}
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
        <div className="lgx hp-sklo p-5 grid gap-2">
          {qrTable ? (
            <>
              <p className={label}>{t('Kde sedíš')}</p>
              <p className="flex items-center gap-2 flex-wrap"><span className="inline-flex items-center h-8 px-3 rounded-full bg-[var(--hp-btn-ink-bg)] text-[var(--hp-btn-ink-fg)] text-[13px] font-semibold">{qrTable.name}</span><span className="hp-meta">{t('podle QR na stole')}</span></p>
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
            <p className={`text-xs flex items-center gap-1.5 ${geo.status === 'ok' ? 'text-ok-ink' : geo.status === 'denied' ? (geoMode === 'block' ? 'text-bad-ink' : 'font-semibold text-[color:var(--hp-fg)]') : 'text-black/50'}`}>
              <Icon name="location" size={13} />
              {geo.status === 'ok' ? t('Poloha ověřena.') : geo.status === 'asking' || geo.status === 'idle' ? t('Ověřujeme, že sedíš u stolu…')
                : geoMode === 'block' ? t('Bez polohy objednat nejde. Povol ji v prohlížeči.') : t('Bez polohy objednávku nejdřív potvrdí obsluha.')}
              {geo.status === 'denied' && <button type="button" onClick={() => askGeo()} className="tap-target underline font-medium">{t('Zkusit znovu')}</button>}
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
        <div className="lgx hp-sklo p-5 space-y-3">
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
          <button type="button" onClick={submit} disabled={busy} className="hp-btn hp-btn-limetka hp-btn-blok tap-target disabled:opacity-50"><Icon name="cup" size={16} /> {busy ? t('Odesílám…') : signedIn ? t('Objednat') : t('Přihlásit se a objednat')}</button>
          <p className="text-xs text-black/45">{t('Platí se u obsluhy jako obvykle. Za každých 100 {mena} dostaneš {body} bodů.', { mena: cur, body: b.pointsPer100 })}</p>
        </div>
        {orders && orders.length > 0 && (
          <section>
            <h3 className="t-card mb-1">{t('Dnešní objednávky')}</h3>
            <ul className="card list px-4">
              {orders.map(o => (
                <li key={o.id} className="list-row">
                  <div className="min-w-0 flex-1">
                    <span className={`inline-flex items-center h-7 px-2.5 rounded-full hp-mikro ${o.status === 'done' ? 'bg-[var(--hp-btn-ink-bg)] text-[var(--hp-btn-ink-fg)]' : 'bg-[var(--hp-well)] text-[var(--hp-fg)]'}`}>{ORDER_LABEL[o.status] ? t(ORDER_LABEL[o.status]) : o.status}</span>
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
function EventSheet({ e, currency, slug, signedIn, businessName, address, onClose }: {
  e: any; currency: string; slug: string; signedIn: boolean; businessName: string; address: string; onClose: () => void;
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
                  className="tap-target inline-block ml-2 py-1 text-[#0A5CC0] underline decoration-[#0A5CC0]/30 hover:decoration-[#0A5CC0]">{t('Mapa')}</a>
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
