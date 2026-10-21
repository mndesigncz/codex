'use client';

// Odměny: jedna peněženka odměn přes všechny podniky (koncept B 5, audit C §6).
//   K uplatnění — připravené odměny v barvě podniku s platností; „Uplatnit“ otevře živý poukaz
//                 (běžící hodiny + pulzující rám = není to snímek obrazovky, kód i QR pro čtečku).
//                 Pod nimi dárkové poukazy se zůstatkem.
//   Nabídky     — kupony za body nebo zdarma; „Vyměnit“, když body stačí, jinak „chybí 280 b.“.
//   Výzvy       — rozdělané razítkové karty a cesta k další úrovni (skutečný postup, žádný odhad).
//   Historie    — co host kdy získal a uplatnil.
// Nahoře jedno pole „Mám kód“: promo kód, dárkový poukaz, plastová karta i kód podniku — server
// pozná, co to je (POST /api/client/kod). Nahrazuje pět polí na pěti místech.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../Icons';
import { Segmented, Skeleton, EmptyState, ErrorState, Modal } from '../../ui';
import HostPoukazy from '../loyalty/HostPoukazy';
import { LogoPodniku } from '../karta/KartaPodniku';
import { useHostMe, obnovHosta, useTed } from './data';
import { pripraveneOdmeny, hlavniKampan, dniDo, denMesicRok, type Odmena } from './model';
import { useCesta, useJeDemo } from './cesty';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { tierForMember } from '@/lib/clientSlots';
import { formatMoney } from '@/lib/money';
import { okJson } from '@/lib/api';
import { pragueDaySafe } from '@/lib/pragueTime';

type Zalozka = 'pripravene' | 'nabidky' | 'vyzvy' | 'historie';

export default function Odmeny() {
  const t = useT('klient-host');
  const me = useHostMe();
  const d = me.data;
  const [zal, setZal] = useState<Zalozka>(() => {
    if (typeof window === 'undefined') return 'pripravene';
    const z = new URLSearchParams(window.location.search).get('z');
    return (['pripravene', 'nabidky', 'vyzvy', 'historie'] as string[]).includes(z ?? '') ? z as Zalozka : 'pripravene';
  });
  const odmeny = useMemo(() => pripraveneOdmeny(d), [d]);
  const [zivy, setZivy] = useState<Odmena | null>(null);
  const [zprava, setZprava] = useState('');
  useEffect(() => { if (zprava) { const i = setTimeout(() => setZprava(''), 5000); return () => clearTimeout(i); } }, [zprava]);

  if (me.chyba && !d) return <ErrorState title={t('Odměny se nenačetly')} hint={t('Zkontroluj připojení a zkus to znovu.')} onRetry={() => { void me.obnov(); }} />;
  const pocet = odmeny.length + (d?.poukazy ?? []).filter((p: any) => p.stav === 'active').length;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="t-page">{t('Odměny')}</h1>
      <div className="mt-4"><MamKod onHotovo={m => { setZprava(m); void obnovHosta(); }} /></div>
      {zprava && <p role="status" className="mt-3 toast-in note note-ok">{zprava}</p>}
      <div className="mt-5">
        <Segmented<Zalozka> ariaLabel={t('Části odměn')} value={zal} onChange={setZal} options={[
          { id: 'pripravene', label: t('K uplatnění'), count: pocet || undefined },
          { id: 'nabidky', label: t('Nabídky') },
          { id: 'vyzvy', label: t('Výzvy') },
          { id: 'historie', label: t('Historie') },
        ]} />
      </div>
      <div className="mt-5">
        {!d ? <div className="space-y-3"><Skeleton className="h-20 rounded-[20px]" /><Skeleton className="h-20 rounded-[20px]" /></div>
          : zal === 'pripravene' ? <Pripravene odmeny={odmeny} poukazy={d.poukazy ?? []} dnes={d.today} onUplatnit={setZivy} />
          : zal === 'nabidky' ? <Nabidky nabidky={d.nabidky ?? []} onZprava={setZprava} />
          : zal === 'vyzvy' ? <Vyzvy clenstvi={d.memberships ?? []} />
          : <Historie />}
      </div>
      {zivy && <ZivyPoukaz odmena={zivy} onClose={() => setZivy(null)} />}
    </div>
  );
}

function Pripravene({ odmeny, poukazy, dnes, onUplatnit }: { odmeny: Odmena[]; poukazy: any[]; dnes: string; onUplatnit: (o: Odmena) => void }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const cesta = useCesta();
  if (!odmeny.length && !poukazy.length) {
    return <EmptyState icon="gift" title={t('Zatím tu nic není')} hint={t('Odměnu dostaneš za plnou kartu razítek nebo ji vyměníš za body v Nabídkách.')}
      action={<Link href={cesta('/client')} className="btn btn-secondary">{t('Moje podniky')}</Link>} />;
  }
  return (
    <div className="space-y-8">
      {odmeny.length > 0 && (
        <ul className="space-y-3">
          {odmeny.map((o, i) => {
            const n = dniDo(o.validUntil, dnes);
            const brzy = n != null && n <= 7;
            return (
              <li key={o.id} className="card p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <LogoPodniku nazev={o.business} logoUrl={o.logoUrl} barva={o.accent} velikost={44} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold leading-snug text-pretty">{o.title}</p>
                    <p className="t-meta mt-0.5">
                      {[o.business, o.fromStamps ? t('za plnou kartu razítek') : o.benefit].filter(Boolean).join(' · ')}
                      {o.validUntil && <> · <span className={brzy ? 'text-wait-ink font-medium' : ''}>{n === 0 ? t('platí jen dnes') : brzy ? t('ještě {n, plural, one {# den} few {# dny} other {# dní}}', { n }) : t('do {datum}', { datum: fmtDatum(String(o.validUntil).slice(0, 10), { jazyk, styl: 'kratce' }) })}</span></>}
                    </p>
                  </div>
                  <button type="button" onClick={() => onUplatnit(o)} className={`btn ${i === 0 ? 'btn-accent' : 'btn-secondary'} btn-sm shrink-0 !h-9`}>{t('Uplatnit')}</button>
                </div>
                <p className="mt-3 well px-3 py-2.5 h-kod text-center text-[17px]" aria-label={t('Kód odměny {kod}', { kod: o.code })}>{o.code}</p>
              </li>
            );
          })}
        </ul>
      )}
      {poukazy.length > 0 && <HostPoukazy poukazy={poukazy} />}
    </div>
  );
}

function Nabidky({ nabidky, onZprava }: { nabidky: any[]; onZprava: (m: string) => void }) {
  const t = useT('klient-host');
  const [busy, setBusy] = useState<number | null>(null);
  const [chyba, setChyba] = useState('');
  if (!nabidky.length) return <EmptyState icon="tag" title={t('Teď žádné nabídky')} hint={t('Až podnik vypíše kupon za body nebo zdarma, najdeš ho tady.')} />;
  const vymen = async (n: any) => {
    setBusy(n.id); setChyba('');
    try {
      const r = await fetch(`/api/client/b/${encodeURIComponent(n.slug)}/coupons/${n.id}/claim`, { method: 'POST' });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) { setChyba(x.error ? t(x.error) : t('Kupon se nepodařilo vzít.')); return; }
      onZprava(t('{kupon} je tvůj. Najdeš ho v K uplatnění.', { kupon: n.title }));
      await obnovHosta();
    } catch { setChyba(t('Kupon se nepodařilo vzít — vypadlo připojení. Zkus to znovu.')); }
    finally { setBusy(null); }
  };
  return (
    <div>
      {chyba && <p role="alert" className="mb-3 note note-danger">{chyba}</p>}
      <ul className="card list px-4 sm:px-5">
        {nabidky.map(n => {
          const chybi = Math.max(0, n.costPoints - n.points);
          return (
            <li key={`${n.slug}-${n.id}`} className="py-4 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-snug text-pretty">{n.title}</p>
                <p className="t-meta mt-0.5">{[n.business, n.benefit, n.costPoints ? t('{n} b.', { n: n.costPoints }) : t('zdarma')].filter(Boolean).join(' · ')}</p>
                {chybi > 0 && (
                  <div className="mt-2.5 flex items-center gap-2.5">
                    <span className="h-postup flex-1 max-w-[12rem]" aria-hidden><span style={{ width: `${Math.round((n.points / n.costPoints) * 100)}%` }} /></span>
                    <span className="text-xs text-black/55 tabular-nums">{t('chybí {n} b.', { n: chybi })}</span>
                  </div>
                )}
              </div>
              <button type="button" onClick={() => void vymen(n)} disabled={busy === n.id || chybi > 0}
                className="btn btn-secondary btn-sm shrink-0 !h-9 disabled:opacity-40">{busy === n.id ? '…' : n.costPoints ? t('Vyměnit') : t('Vzít si')}</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Vyzvy({ clenstvi }: { clenstvi: any[] }) {
  const t = useT('klient-host');
  const cesta = useCesta();
  const radky: { klic: string; slug: string; podnik: string; accent: string | null; titul: string; meta: string; hotovo: number; cil: number }[] = [];
  for (const m of clenstvi) {
    for (const k of (m.campaigns ?? []).filter((c: any) => Number(c.required) > 0 && !c.finishedForever)) {
      radky.push({ klic: `k-${m.slug}-${k.id}`, slug: m.slug, podnik: m.name, accent: m.accent || null, titul: k.name || t('Razítková karta'),
        meta: k.reward ? t('Odměna: {odmena}', { odmena: k.reward }) : '', hotovo: Math.min(Number(k.stamps) || 0, Number(k.required)), cil: Number(k.required) });
    }
    const lv = tierForMember({ visits: Number(m.visits), spend: Number(m.spend), lastVisitAt: m.lastVisitAt }, m.tiers);
    if (lv.nextAt && lv.nextLabel) {
      const hodnota = lv.unit === 'spend' ? Number(m.spend) || 0 : Number(m.visits) || 0;
      radky.push({ klic: `u-${m.slug}`, slug: m.slug, podnik: m.name, accent: m.accent || null, titul: t('Úroveň {uroven}', { uroven: t(lv.nextLabel) }),
        meta: lv.unit === 'spend' ? t('ještě {castka} útraty', { castka: formatMoney(Math.max(0, lv.nextAt - hodnota), m.currency ?? 'CZK') }) : t('ještě {n, plural, one {# návštěva} few {# návštěvy} other {# návštěv}}', { n: Math.max(0, lv.nextAt - hodnota) }),
        hotovo: hodnota, cil: lv.nextAt });
    }
  }
  if (!radky.length) return <EmptyState icon="award" title={t('Žádná rozdělaná výzva')} hint={t('Razítkové karty a cesta k vyšší úrovni se ukážou, až se přidáš k podniku.')} />;
  return (
    <ul className="card list px-4 sm:px-5">
      {radky.map(r => (
        <li key={r.klic}>
          <Link href={cesta(`/client/${r.slug}`)} className="py-4 flex items-start gap-3">
            <LogoPodniku nazev={r.podnik} barva={r.accent} velikost={36} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-snug">{r.titul}</span>
              <span className="block t-meta mt-0.5 truncate">{[r.podnik, r.meta].filter(Boolean).join(' · ')}</span>
              <span className="mt-2.5 flex items-center gap-2.5">
                <span className="h-postup flex-1" aria-hidden><span style={{ width: `${Math.min(100, Math.round((r.hotovo / Math.max(1, r.cil)) * 100))}%` }} /></span>
                <span className="text-xs font-semibold tabular-nums shrink-0">{r.hotovo} / {r.cil}</span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

interface PolozkaHistorie { key: string; typ: string; at: string; points: number; credit: number; title: string | null; business: string; currency: string }

function Historie() {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const [polozky, setPolozky] = useState<PolozkaHistorie[] | null>(null);
  const [dalsi, setDalsi] = useState(false);
  const [strana, setStrana] = useState(1);
  const [chyba, setChyba] = useState('');
  const nacti = useCallback((s: number) => {
    setChyba('');
    fetch(`/api/client/me/historie?strana=${s}`, { cache: 'no-store' }).then(okJson).then(x => {
      setPolozky(p => [...(s === 1 ? [] : p ?? []), ...(Array.isArray(x?.polozky) ? x.polozky : [])]); setDalsi(!!x?.dalsi); setStrana(s);
    }).catch(() => setChyba(t('Historii se nepodařilo načíst.')));
  }, [t]);
  useEffect(() => { nacti(1); }, [nacti]);
  const popis = (p: PolozkaHistorie): string => {
    switch (p.typ) {
      case 'stamp': return t('Razítko');
      case 'points_earned': return t('Body za návštěvu nebo útratu');
      case 'points_spent_coupon': return p.title ? t('Kupon za body: {kupon}', { kupon: p.title }) : t('Kupon za body');
      case 'points_returned': return t('Vrácené body za kupon');
      case 'points_expired': return t('Propadlé body');
      case 'welcome': return t('Uvítací body');
      case 'birthday': return t('Dárek k narozeninám');
      case 'referral': return t('Body za pozvaného kamaráda');
      case 'reactivation': return t('Body za návrat');
      case 'manual_plus': return t('Body od podniku');
      case 'manual_minus': return t('Úprava bodů');
      case 'cashback': return t('Kredit z útraty');
      case 'credit_spent': return t('Kredit uplatněn');
      case 'reward_coupon': return t('Odměna za razítka: {kupon}', { kupon: p.title ?? '' });
      case 'coupon_used': case 'coupon_redeemed': return t('Kupon uplatněn: {kupon}', { kupon: p.title ?? '' });
      default: return t('Jiný záznam v historii');
    }
  };
  if (chyba && !polozky) return <ErrorState compact title={t('Historie se nenačetla')} hint={chyba} onRetry={() => nacti(1)} />;
  if (!polozky) return <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>;
  if (!polozky.length) return <EmptyState icon="clock" title={t('Zatím tu nic není')} hint={t('Jakmile získáš body, razítko nebo kupon, uvidíš to tady.')} />;
  return (
    <div>
      <ul className="card list px-4 sm:px-5">
        {polozky.map(p => {
          const den = pragueDaySafe(p.at);
          const h = [p.points ? `${p.points > 0 ? '+' : '−'}${t('{n} b.', { n: Math.abs(p.points) })}` : '', p.credit ? `${p.credit > 0 ? '+' : '−'}${formatMoney(Math.abs(p.credit), p.currency)}` : ''].filter(Boolean).join(' · ');
          return (
            <li key={p.key} className="py-3 flex items-start gap-3 min-h-[56px]">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium leading-snug text-pretty">{popis(p)}</p>
                <p className="t-meta mt-0.5 truncate">{[den ? fmtDatum(den, { jazyk, styl: 'cislo' }) : '', p.business].filter(Boolean).join(' · ')}</p>
              </div>
              {h && <p className={`shrink-0 text-[15px] font-semibold tabular-nums ${p.points < 0 || p.credit < 0 ? 'text-black/55' : ''}`}>{h}</p>}
            </li>
          );
        })}
      </ul>
      {dalsi && <button type="button" onClick={() => nacti(strana + 1)} className="mt-3 btn btn-secondary w-full">{t('Načíst další')}</button>}
    </div>
  );
}

/** Jedno pole na všechny kódy: promo z letáku, dárkový poukaz, plastová karta, kód podniku. */
export function MamKod({ onHotovo }: { onHotovo: (zprava: string) => void }) {
  const t = useT('klient-host');
  const cesta = useCesta();
  const [kod, setKod] = useState('');
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const [podnik, setPodnik] = useState<{ slug: string; podnik: string } | null>(null);
  const odeslat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kod.trim()) return;
    setBusy(true); setChyba(''); setPodnik(null);
    try {
      const r = await fetch('/api/client/kod', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kod }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) { setChyba(x.error ? t(x.error) : t('Tenhle kód neznáme. Zkontroluj ho, nebo se zeptej obsluhy.')); return; }
      setKod('');
      if (x.typ === 'promo') onHotovo([x.title, x.points ? t('+{n} bodů', { n: x.points }) : '', x.coupon ? t('kupon {kod}', { kod: x.coupon }) : ''].filter(Boolean).join(' · ') + (x.podnik ? ` · ${x.podnik}` : ''));
      else if (x.typ === 'poukaz') onHotovo(t('Poukaz {podnik} je v tvé aplikaci. Zůstatek {castka}.', { podnik: x.podnik ?? '', castka: formatMoney(Number(x.balance) || 0, x.currency ?? 'CZK') }));
      else if (x.typ === 'karta') onHotovo(x.zprava ? t(x.zprava) : t('Karta je připojená.'));
      else if (x.typ === 'podnik') setPodnik({ slug: x.slug, podnik: x.podnik });
      else onHotovo(t('Hotovo.'));
    } catch { setChyba(t('Kód se nepodařilo odeslat — vypadlo připojení. Zkus to znovu.')); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={odeslat} aria-label={t('Mám kód')}>
      <label htmlFor="mam-kod" className="field-label">{t('Mám kód')}</label>
      <div className="flex gap-2">
        <input id="mam-kod" value={kod} onChange={e => { setKod(e.target.value.toUpperCase().slice(0, 40)); setChyba(''); setPodnik(null); }}
          placeholder={t('Promo, poukaz nebo karta')} autoComplete="off" autoCapitalize="characters" spellCheck={false} data-transient
          className="field flex-1 min-w-0 h-kod !tracking-[0.08em] placeholder:font-sans placeholder:tracking-normal" />
        <button type="submit" disabled={busy || !kod.trim()} className="btn btn-primary shrink-0 disabled:opacity-40">{busy ? '…' : t('Použít')}</button>
      </div>
      {chyba && <p role="alert" className="mt-2 text-sm text-bad-ink">{chyba}</p>}
      {podnik && (
        <p role="status" className="mt-2 text-sm">
          {t('To je kód podniku {podnik}.', { podnik: podnik.podnik })}{' '}
          <Link href={cesta(`/client/${podnik.slug}`)} className="font-semibold underline underline-offset-2">{t('Otevřít')}</Link>
        </p>
      )}
    </form>
  );
}

/**
 * Živý poukaz (koncept B 6): běžící hodiny se sekundami a pulzující limetkový rám dokazují, že nejde
 * o snímek obrazovky. Kód a QR kuponu pro čtečku; jakmile obsluha odměnu uplatní, okno to samo ukáže
 * (stejná živá odezva jako U kasy). Pro podniky bez čtečky a TO GO.
 */
function ZivyPoukaz({ odmena, onClose }: { odmena: Odmena; onClose: () => void }) {
  const t = useT('klient-host');
  const demo = useJeDemo();
  const ted = useTed(1000);
  const [uplatneno, setUplatneno] = useState(false);
  const kurzor = useRef<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let zije = true;
    import('qrcode').then(q => q.default.toString(`managero:coupon:${odmena.code}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#16181A', light: '#00000000' } }))
      .then(x => { if (zije) setSvg(x); }).catch(() => {});
    return () => { zije = false; };
  }, [odmena.code]);
  useEffect(() => {
    if (uplatneno) return;
    let konec = false;
    const zeptej = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const x = await fetch(`/api/client/card/stav${kurzor.current ? `?od=${encodeURIComponent(kurzor.current)}` : ''}`, { cache: 'no-store' }).then(okJson);
        if (konec) return;
        if (typeof x?.kurzor === 'string') kurzor.current = x.kurzor;
        if ((x?.udalosti ?? []).some((u: any) => u.typ === 'uplatneno' && u.id === `U${odmena.id}`)) { setUplatneno(true); void obnovHosta(); }
      } catch { /* další pokus */ }
    };
    void zeptej();
    const i = setInterval(zeptej, 2500);
    return () => { konec = true; clearInterval(i); };
  }, [uplatneno, odmena.id]);
  const hh = String(ted.getHours()).padStart(2, '0'); const mm = String(ted.getMinutes()).padStart(2, '0'); const ss = String(ted.getSeconds()).padStart(2, '0');
  return (
    <Modal open onClose={onClose} size="md" className="h-vyjed" title={odmena.title} subtitle={odmena.business}>
        <div className="flex justify-center">
          <LogoPodniku nazev={odmena.business} logoUrl={odmena.logoUrl} barva={odmena.accent} velikost={56} />
        </div>
        {uplatneno ? (
          <div className="mt-5 flex flex-col items-center text-center" role="status">
            <span className="h-plus h-pop"><Icon name="check" size={30} strokeWidth={2.4} /></span>
            <p className="mt-4 t-section">{t('Uplatněno. Dobrou chuť!')}</p>
          </div>
        ) : (
          <div className="mt-5 h-zivy bg-[var(--surface)] p-5 text-center">
            <p className="t-meta">{t('Ukaž obsluze · platí teď')}</p>
            <p className="mt-2 text-[3.25rem] leading-none font-semibold tabular-nums tracking-[-0.03em]" aria-live="off">{hh}:{mm}<span className="text-black/40">:{ss}</span></p>
            <p className="mt-2 text-xs text-black/55 inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#C8F542] ring-1 ring-black/40" aria-hidden />{t('vteřiny běží — snímek obrazovky neplatí')}</p>
            <div className="mt-4 mx-auto w-40 h-40 h-qr-pole p-3 border border-black/[0.07]">
              {svg ? <span dangerouslySetInnerHTML={{ __html: svg }} className="block w-full h-full" role="img" aria-label={t('QR kód odměny {kod}', { kod: odmena.code })} /> : null}
            </div>
            <p className="mt-3 well px-3 py-2.5 h-kod text-[20px]">{odmena.code}</p>
          </div>
        )}
        <p className="mt-4 t-meta text-center text-pretty">{odmena.validUntil ? t('Platí do {datum}. Obsluha odměnu uplatní jedním klepnutím.', { datum: denMesicRok(odmena.validUntil) }) : t('Obsluha odměnu uplatní jedním klepnutím.')}</p>
        {demo && !uplatneno && <button type="button" onClick={() => { (window as any).__hostDemoNacteni?.(odmena.slug, [odmena.id]); }} className="mt-3 btn btn-secondary w-full !h-[52px]"><Icon name="sparkle" size={17} />{t('Ukázat uplatnění u kasy (ukázka)')}</button>}
        <button type="button" onClick={onClose} className="mt-3 btn btn-primary w-full !h-[52px]">{uplatneno ? t('Hotovo') : t('Zavřít')}</button>
    </Modal>
  );
}
