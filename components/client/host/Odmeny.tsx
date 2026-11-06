'use client';

// Odměny ve směru A „Peněženka“ (předloha 05): jedna peněženka odměn přes všechny podniky.
//   Nahoře hlavička („2 čekají na uplatnění“ · Odměny) a jedno pole na kódy: promo kód, dárkový
//   poukaz, plastová karta i kód podniku — server pozná, co to je (POST /api/client/kod).
//   K uplatnění — připravené odměny a kupony jako lístky s perforací (podnik s monogramem,
//                 název 24/620, platnost, kód prostrkaně, „Uplatnit“ otevře živý poukaz s QR);
//                 pod nimi Moje poukazy jako inkoustové karty a až pak uplatněné a propadlé tlumeně
//                 (na počítači lístky vlevo, poukazy a historie vpravo).
//   Nabídky     — kupony za body nebo zdarma jako lístky („Vyzvednout“ / „Uložit“, jinak „chybí 280 b.“).
//   Výzvy       — rozdělané razítkové karty a úrovně po podnicích (host/odmeny/Vyzvy).
//   Historie    — co host kdy získal a uplatnil (host/odmeny/Historie).
// Barva značky podniku nikde: podnik nese monogram na krému.

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../Icons';
import { Segmented, Skeleton, ErrorState, Modal } from '../../ui';
import { HlavickaObrazovky, Listek, Monogram, NadpisSekce, PrazdnyStav } from '../penezenka';
import HostPoukazy from '../loyalty/HostPoukazy';
import Vyzvy from './odmeny/Vyzvy';
import Historie from './odmeny/Historie';
import PostupSvetly from './odmeny/PostupSvetly';
import { useHostMe, obnovHosta, useTed } from './data';
import { pripraveneOdmeny, dniDo, type Odmena } from './model';
import { useCesta, useJeDemo } from './cesty';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { formatMoney } from '@/lib/money';
import { okJson } from '@/lib/api';

type Zalozka = 'pripravene' | 'nabidky' | 'vyzvy' | 'historie';
const ZALOZKY: Zalozka[] = ['pripravene', 'nabidky', 'vyzvy', 'historie'];

export default function Odmeny() {
  const t = useT('klient-host');
  const me = useHostMe();
  const d = me.data;
  // Část z adresy (?z=) až po hydrataci: server ji nezná a rozdílné první vykreslení by nechalo
  // v segmentu vybranou serverovou položku (pilulka na „K uplatnění“, text vybrané části neviditelný).
  const [zal, setZal] = useState<Zalozka>('pripravene');
  useEffect(() => {
    const z = new URLSearchParams(window.location.search).get('z');
    if ((ZALOZKY as string[]).includes(z ?? '')) setZal(z as Zalozka);
  }, []);
  const prepni = (z: Zalozka) => {
    setZal(z);
    // Část se pamatuje v adrese (?z=), ať zpět a sdílený odkaz vedou na stejné místo.
    try {
      const u = new URL(window.location.href);
      if (z === 'pripravene') u.searchParams.delete('z'); else u.searchParams.set('z', z);
      window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    } catch { /* adresa se nezmění, obsah ano */ }
  };
  const vsechny = useMemo(() => pripraveneOdmeny(d), [d]);
  const dnes = d?.today ?? '';
  const pripravene = useMemo(() => vsechny.filter(o => (dniDo(o.validUntil, dnes) ?? 0) >= 0), [vsechny, dnes]);
  const [zivy, setZivy] = useState<Odmena | null>(null);
  const [zprava, setZprava] = useState('');
  useEffect(() => { if (zprava) { const i = setTimeout(() => setZprava(''), 5000); return () => clearTimeout(i); } }, [zprava]);

  if (me.chyba && !d) return <ErrorState title={t('Odměny se nenačetly')} hint={t('Zkontroluj připojení a zkus to znovu.')} onRetry={() => { void me.obnov(); }} />;

  return (
    <div>
      <div className="max-w-2xl">
      <HlavickaObrazovky
        nadtitulek={d && pripravene.length ? t('{n, plural, one {# čeká na uplatnění} few {# čekají na uplatnění} other {# čeká na uplatnění}}', { n: pripravene.length }) : undefined}
        titulek={t('Odměny')} />
      <MamKod onHotovo={m => { setZprava(m); void obnovHosta(); }} />
      {zprava && (
        <p role="status" className="mt-3 toast-in lgx hp-sklo flex items-center gap-3 px-4 py-3 hp-text">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--hp-lime)] text-[#16181A]" aria-hidden><Icon name="check" size={15} strokeWidth={2.2} /></span>
          <span className="min-w-0">{zprava}</span>
        </p>
      )}
      {/* Vybraná položka nese v tmavém i vlastní pozadí (stejné jako jezdec pod ní): sonda dark měří kontrast
          proti pozadí PŘEDKŮ a jezdec je sourozenec — bez toho hlásí inkoust na tmavé dráze. */}
      <div className="hp-segment mt-3.5">
        <Segmented<Zalozka> ariaLabel={t('Části odměn')} value={zal} onChange={prepni} options={[
          { id: 'pripravene', label: t('K uplatnění') },
          { id: 'nabidky', label: t('Nabídky') },
          { id: 'vyzvy', label: t('Výzvy') },
          { id: 'historie', label: t('Historie') },
        ]} />
      </div>
      </div>
      {/* K uplatnění má na počítači dva sloupce (lístky · poukazy a historie); ostatní záložky drží 672 px u levé hrany. */}
      <div className={`mt-[18px] ${zal === 'pripravene' ? '' : 'max-w-2xl'}`}>
        {!d ? <div className="space-y-2.5"><Skeleton className="h-40 rounded-[22px]" /><Skeleton className="h-40 rounded-[22px]" /></div>
          : zal === 'pripravene' ? <Pripravene odmeny={vsechny} claims={d.claims ?? []} poukazy={d.poukazy ?? []} clenstvi={d.memberships ?? []} dnes={dnes} onUplatnit={setZivy} />
          : zal === 'nabidky' ? <Nabidky nabidky={d.nabidky ?? []} clenstvi={d.memberships ?? []} onZprava={setZprava} />
          : zal === 'vyzvy' ? <Vyzvy clenstvi={d.memberships ?? []} />
          : <Historie />}
      </div>
      {zivy && <ZivyPoukaz odmena={zivy} onClose={() => setZivy(null)} />}
    </div>
  );
}

function Pripravene({ odmeny, claims, poukazy, clenstvi, dnes, onUplatnit }: { odmeny: Odmena[]; claims: any[]; poukazy: any[]; clenstvi: any[]; dnes: string; onUplatnit: (o: Odmena) => void }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const cesta = useCesta();
  const druh = useMemo(() => new Map<number, string>(claims.map(c => [Number(c.id), String(c.kind ?? 'offer')])), [claims]);
  const loga = useMemo(() => new Map<string, string | null>(clenstvi.map(m => [String(m.slug), m.logoUrl || null])), [clenstvi]);
  const aktivni = odmeny.filter(o => (dniDo(o.validUntil, dnes) ?? 0) >= 0);
  const propadle = odmeny.filter(o => (dniDo(o.validUntil, dnes) ?? 0) < 0);
  // Uplatněné (nejnovější nahoře) a propadlé: tlumené lístky, ať host ví, kam se odměna poděla. Jen pár posledních.
  const vypnute = [
    ...propadle.map(o => ({ id: `p${o.id}`, o: { title: o.title, business: o.business, slug: o.slug }, kdy: String(o.validUntil ?? '').slice(0, 10), stav: 'propadlo' as const })),
    ...claims.filter(c => c.redeemed_at).map(c => ({ id: `u${c.id}`, o: { title: String(c.title ?? ''), business: String(c.business ?? ''), slug: String(c.slug ?? '') }, kdy: String(c.redeemed_at ?? '').slice(0, 10), stav: 'uplatneno' as const })),
  ].sort((a, b) => b.kdy.localeCompare(a.kdy)).slice(0, 3);
  const datum = (den: string, styl: 'cislo' | 'kratce') => (/^\d{4}-\d{2}-\d{2}$/.test(den) ? fmtDatum(den, { jazyk, styl }) : '');

  const poznamka = (o: Odmena) => {
    const k = druh.get(o.id);
    if (o.fromStamps || k === 'stamps') return t('za plnou kartu');
    if (k === 'birthday') return t('k narozeninám');
    return t('kupon');
  };
  const platnost = (o: Odmena) => {
    const n = dniDo(o.validUntil, dnes);
    if (n == null) return t('bez omezení platnosti');
    const den = String(o.validUntil).slice(0, 10);
    if (n <= 7) {
      return (
        <>
          <b className="font-semibold text-[color:var(--hp-fg)]">{n === 0 ? t('Končí dnes') : t('Končí za {n, plural, one {# den} few {# dny} other {# dní}}', { n })}</b>
          {' · '}{t('do {datum}', { datum: datum(den, 'kratce') })}
        </>
      );
    }
    return t('Platí do {datum}', { datum: datum(den, 'cislo') });
  };

  if (!aktivni.length && !poukazy.length && !vypnute.length) {
    return (
      <div className="lgx hp-sklo">
        <PrazdnyStav titulek={t('Zatím tu nic není')} text={t('Odměnu dostaneš za plnou kartu razítek nebo ji vyměníš za body v Nabídkách.')}
          akce={<Link href={cesta('/client')} className="hp-btn hp-btn-inkoust hp-btn-stredni">{t('Moje podniky')}</Link>} />
      </div>
    );
  }
  // Pořadí: K uplatnění → Moje poukazy → Uplatněné a propadlé (historie až nakonec). Počítač: lístky vlevo,
  // poukazy a historie vpravo.
  const vpravo = poukazy.length > 0 || vypnute.length > 0;
  return (
    <div className={vpravo ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-16' : 'max-w-2xl'}>
      <div className="min-w-0">
      {aktivni.length > 0 ? (
        <ul className="flex flex-col gap-2.5" aria-label={t('K uplatnění')}>
          {aktivni.map(o => (
            <Listek key={o.id} as="li"
              podnik={{ nazev: o.business, klic: o.slug, logoUrl: o.logoUrl ?? loga.get(o.slug) ?? null }}
              poznamka={poznamka(o)}
              titulek={o.title}
              podtitulek={platnost(o)}
              kodPopisek={t('Kód')}
              kod={o.code}
              akce={<button type="button" onClick={() => onUplatnit(o)} aria-label={t('Uplatnit: {odmena}', { odmena: o.title })} className="hp-btn hp-btn-inkoust hp-btn-stredni shrink-0">{t('Uplatnit')}</button>}
            />
          ))}
        </ul>
      ) : (
        <div className="lgx hp-sklo">
          <PrazdnyStav titulek={t('Teď nic nečeká na uplatnění')} text={t('Odměnu dostaneš za plnou kartu razítek nebo ji vyměníš za body v Nabídkách.')} />
        </div>
      )}

      </div>
      {vpravo && (
        <div className="min-w-0 hp-sloupec">
          {poukazy.length > 0 && <HostPoukazy poukazy={poukazy} />}

      {vypnute.length > 0 && (
        <section aria-labelledby="odm-vypnute">
          <NadpisSekce id="odm-vypnute" titulek={t('Uplatněné a propadlé')} />
          <ul className="flex flex-col gap-2.5">
            {vypnute.map(v => (
              <Listek key={v.id} as="li" vypnuty
                podnik={{ nazev: v.o.business, klic: v.o.slug, logoUrl: loga.get(v.o.slug) ?? null }}
                poznamka={v.stav === 'uplatneno'
                  ? t('uplatněno {datum}', { datum: datum(v.kdy, 'kratce') })
                  : t('propadlo {datum}', { datum: datum(v.kdy, 'kratce') })}
                titulek={v.o.title} />
            ))}
          </ul>
        </section>
      )}

        </div>
      )}
    </div>
  );
}

function Nabidky({ nabidky, clenstvi, onZprava }: { nabidky: any[]; clenstvi: any[]; onZprava: (m: string) => void }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const [busy, setBusy] = useState<number | null>(null);
  const [chyba, setChyba] = useState('');
  const loga = useMemo(() => new Map<string, string | null>(clenstvi.map(m => [String(m.slug), m.logoUrl || null])), [clenstvi]);
  if (!nabidky.length) {
    return (
      <div className="lgx hp-sklo">
        <PrazdnyStav titulek={t('Teď žádné nabídky')} text={t('Až podnik vypíše kupon za body nebo zdarma, najdeš ho tady.')} />
      </div>
    );
  }
  const vezmi = async (n: any) => {
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
      {chyba && <p role="alert" className="mb-3 lgx hp-sklo px-4 py-3 text-sm text-bad-ink">{chyba}</p>}
      <ul className="flex flex-col gap-2.5" aria-label={t('Nabídky')}>
        {nabidky.map(n => {
          const cena = Number(n.costPoints) || 0;
          const body = Number(n.points) || 0;
          const chybi = Math.max(0, cena - body);
          const popis = [n.description || n.benefit, n.validUntil ? t('do {datum}', { datum: fmtDatum(String(n.validUntil).slice(0, 10), { jazyk, styl: 'cislo' }) }) : ''].filter(Boolean).join(' · ');
          return (
            <Listek key={`${n.slug}-${n.id}`} as="li"
              podnik={{ nazev: String(n.business ?? ''), klic: n.slug, logoUrl: loga.get(String(n.slug)) ?? null }}
              poznamka={<span className="hp-num">{cena ? t('{n} b.', { n: cena }) : t('zdarma')}</span>}
              titulek={n.title}
              podtitulek={popis || undefined}
              dole={
                <>
                  <div className="flex-1 min-w-0">
                    {chybi > 0 ? (
                      <>
                        <div className="hp-mikro text-[color:var(--hp-muted)] hp-num">{t('chybí {n} b.', { n: chybi })}</div>
                        <PostupSvetly podil={body / Math.max(1, cena)} className="mt-2" />
                      </>
                    ) : cena > 0 ? (
                      <div className="hp-mikro text-[color:var(--hp-muted)] hp-num">{t('Máš {n} b.', { n: body })}</div>
                    ) : (
                      <div className="hp-mikro text-[color:var(--hp-muted)]">{t('Uloží se do K uplatnění')}</div>
                    )}
                  </div>
                  <button type="button" onClick={() => void vezmi(n)} disabled={busy === n.id || chybi > 0}
                    aria-label={cena ? t('Vyzvednout za {n} b.: {kupon}', { n: cena, kupon: n.title }) : t('Uložit: {kupon}', { kupon: n.title })}
                    className="hp-btn hp-btn-inkoust hp-btn-stredni shrink-0">{busy === n.id ? '…' : cena ? t('Vyzvednout') : t('Uložit')}</button>
                </>
              }
            />
          );
        })}
      </ul>
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
      <div className="hp-pole">
        <Icon name="tag" size={18} strokeWidth={1.6} className="shrink-0 text-[color:var(--hp-muted)]" />
        <input id="mam-kod" value={kod} onChange={e => { setKod(e.target.value.toUpperCase().slice(0, 40)); setChyba(''); setPodnik(null); }}
          aria-label={t('Promo kód, poukaz nebo karta')} placeholder={t('Promo kód, poukaz nebo karta')}
          autoComplete="off" autoCapitalize="characters" spellCheck={false} data-transient
          aria-invalid={chyba ? true : undefined} aria-describedby={chyba ? 'mam-kod-chyba' : undefined}
          className="text-ellipsis tracking-[0.08em] placeholder:tracking-normal" />
        <button type="submit" disabled={busy || !kod.trim()} className="hp-btn hp-btn-inkoust hp-btn-male tap-target shrink-0">{busy ? '…' : t('Použít')}</button>
      </div>
      {chyba && <p id="mam-kod-chyba" role="alert" className="mt-2 text-sm text-bad-ink">{chyba}</p>}
      {podnik && (
        <p role="status" className="mt-2 hp-text">
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
  const { jazyk } = useJazyk();
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
    <Modal open onClose={onClose} size="md" className="h-list-sklo h-plocha h-vyjed" title={odmena.title} subtitle={odmena.business}>
        <div className="flex justify-center">
          <Monogram nazev={odmena.business} klic={odmena.slug} logoUrl={odmena.logoUrl} velikost={56} />
        </div>
        {uplatneno ? (
          <div className="mt-5 flex flex-col items-center text-center" role="status">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--hp-lime)] text-[#16181A] h-pop"><Icon name="check" size={30} strokeWidth={2.4} /></span>
            <p className="mt-4 hp-h2">{t('Uplatněno. Dobrou chuť!')}</p>
          </div>
        ) : (
          <div className="mt-5 h-zivy bg-[var(--hp-surface)] p-5 text-center">
            <p className="hp-meta">{t('Ukaž obsluze · platí teď')}</p>
            <p className="mt-2 text-[3.25rem] leading-none font-[250] hp-num tracking-[-0.04em] text-[color:var(--hp-fg)]" aria-live="off">{hh}:{mm}<span className="text-[color:var(--hp-muted)]">:{ss}</span></p>
            <p className="mt-2 hp-mikro text-[color:var(--hp-muted)] inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--hp-lime)] ring-1 ring-[rgba(79,106,7,0.6)]" aria-hidden />{t('vteřiny běží — snímek obrazovky neplatí')}</p>
            <div className="mt-4 mx-auto w-40 h-40 h-qr-pole p-3 shadow-[inset_0_0_0_1px_rgba(22,24,26,0.07)]">
              {svg ? <span dangerouslySetInnerHTML={{ __html: svg }} className="block w-full h-full" role="img" aria-label={t('QR kód odměny {kod}', { kod: odmena.code })} /> : null}
            </div>
            <p className="mt-4 hp-kod text-[22px] text-[color:var(--hp-fg)]">{odmena.code}</p>
          </div>
        )}
        <p className="mt-4 hp-meta text-center text-pretty">{odmena.validUntil ? t('Platí do {datum}. Obsluha odměnu uplatní jedním klepnutím.', { datum: fmtDatum(String(odmena.validUntil).slice(0, 10), { jazyk, styl: 'cislo' }) }) : t('Obsluha odměnu uplatní jedním klepnutím.')}</p>
        {demo && !uplatneno && <button type="button" onClick={() => { (window as any).__hostDemoNacteni?.(odmena.slug, [odmena.id]); }} className="mt-3 hp-btn lgx hp-btn-sklo hp-btn-blok"><Icon name="sparkle" size={17} />{t('Ukázat uplatnění u kasy (ukázka)')}</button>}
        <button type="button" onClick={onClose} className="mt-3 hp-btn hp-btn-inkoust hp-btn-blok">{uplatneno ? t('Hotovo') : t('Zavřít')}</button>
    </Modal>
  );
}
