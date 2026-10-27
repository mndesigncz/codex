'use client';

// „U kasy“: jedno klepnutí odkudkoli (prostřední tlačítko doku) a host má QR přes celou výšku.
// Displej se drží rozsvícený (Wake Lock), kód je i textem (Geist Mono), přepínač podniku,
// když je host členem víc míst, a „přibalit odměnu“: host si sám zapne připravenou odměnu
// k této návštěvě (PUT /api/client/me/zamer) a čtečka ji obsluze nabídne jako hlavní akci
// (kontrakt: …/klient/kontrakt-ctecka.md).
//
// Okamžitá odezva: dokud je okno otevřené, ptá se každé 2,5 s GET /api/client/card/stav?od=<kurzor>.
// Jakmile obsluha načte kód, okno se samo přepne na „Razítko připsáno · 9 / 10“ (body, uplatněná
// odměna). Jen když je stránka vidět; po zavření se nic nedotazuje.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../../Icons';
import { Switch } from '../../ui';
import { Modal } from '../../ui';
import { useT } from '@/lib/i18n/client';
import { okJson } from '@/lib/api';
import { useObal } from '../../ObalProvider';
import { otevriVeSystemu } from '@/lib/stahni';
import KartaPodniku, { stylKarty } from '../karta/KartaPodniku';
import RazitkaMrizka from '../karta/RazitkaMrizka';
import { useHostMe, useKartaHosta, obnovHosta } from './data';
import { kartaZClenstvi, pripraveneOdmeny, type Odmena } from './model';
import { useCesta, useJeDemo } from './cesty';
import { slucUdalosti } from '@/lib/klient/slouceniOdezvy';

interface Udalost {
  id: string; typ: 'razitko' | 'body' | 'kredit' | 'odmena' | 'uplatneno'; at: string;
  teamId: number; slug: string; podnik: string; accent: string | null; delta: number;
  karta?: { id: number; nazev: string; razitka: number; cil: number; odmena: string | null };
  nazev?: string; zustatek?: number;
}

const UKasyKontext = createContext<{ otevri: (slug?: string) => void; otevreno: boolean }>({ otevri: () => {}, otevreno: false });
export const useUKasy = () => useContext(UKasyKontext);

export function UKasyProvider({ prihlasen, children }: { prihlasen: boolean; children: React.ReactNode }) {
  const [stav, setStav] = useState<{ open: boolean; slug?: string }>({ open: false });
  const otevri = useCallback((slug?: string) => setStav({ open: true, slug }), []);
  // Odkaz zvenku (zástupce na ploše, Wallet, push): ?kasa=1 otevře U kasy hned.
  useEffect(() => {
    if (!prihlasen || typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('kasa') === '1') setStav({ open: true, slug: q.get('podnik') ?? undefined });
  }, [prihlasen]);
  const hodnota = useMemo(() => ({ otevri, otevreno: stav.open }), [otevri, stav.open]);
  return (
    <UKasyKontext.Provider value={hodnota}>
      {children}
      {prihlasen && stav.open && <UKasy slug={stav.slug} onClose={() => setStav({ open: false })} />}
    </UKasyKontext.Provider>
  );
}

/** Udrží displej rozsvícený, dokud je okno otevřené. */
function useDrzDisplej(): boolean {
  const [umi, setUmi] = useState(true);
  useEffect(() => {
    const wl = (navigator as any).wakeLock;
    if (!wl?.request) { setUmi(false); return; }
    let zamek: any = null; let konec = false;
    const zamkni = async () => { try { const z = await wl.request('screen'); if (konec) z.release().catch(() => {}); else zamek = z; } catch { /* úsporný režim */ } };
    zamkni();
    const znovu = () => { if (document.visibilityState === 'visible') zamkni(); };
    document.addEventListener('visibilitychange', znovu);
    return () => { konec = true; document.removeEventListener('visibilitychange', znovu); zamek?.release?.().catch(() => {}); };
  }, []);
  return umi;
}

function jeIos() { return typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)); }
function jeAndroid() { return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent); }

function UKasy({ slug, onClose }: { slug?: string; onClose: () => void }) {
  const t = useT('klient-host');
  const cesta = useCesta();
  const demo = useJeDemo();
  const { jeObal } = useObal();
  const karta = useKartaHosta();
  const me = useHostMe();
  const umiDrzet = useDrzDisplej();
  const clenstvi: any[] = useMemo(() => (me.data?.memberships ?? []).filter((x: any) => x.loyaltyOn !== false), [me.data]);
  const odmeny = useMemo(() => pripraveneOdmeny(me.data), [me.data]);
  const [vybrany, setVybrany] = useState<string>(slug ?? '');
  useEffect(() => {
    if (vybrany && clenstvi.some(c => c.slug === vybrany)) return;
    // Výchozí podnik: ten, kde čeká odměna, jinak naposledy navštívený (pořadí z API).
    const s = odmeny[0]?.slug ?? clenstvi[0]?.slug ?? '';
    if (s) setVybrany(s);
  }, [clenstvi, odmeny, vybrany]);
  const podnik = clenstvi.find(c => c.slug === vybrany) ?? null;
  const odmenyPodniku = odmeny.filter(o => o.slug === vybrany);

  // Záměr: přibalená odměna v tomhle podniku.
  const [zamery, setZamery] = useState<{ teamId: number; claimId: number }[]>([]);
  const [zamerChyba, setZamerChyba] = useState('');
  const [ukladam, setUkladam] = useState(false);
  useEffect(() => {
    fetch('/api/client/me/zamer', { cache: 'no-store' }).then(okJson).then(x => setZamery(Array.isArray(x?.zamery) ? x.zamery : [])).catch(() => setZamery([]));
  }, []);
  const prebaleno = (o: Odmena) => zamery.some(z => z.claimId === o.id);
  const prepniOdmenu = async (o: Odmena, zapnout: boolean) => {
    if (ukladam) return;
    setUkladam(true); setZamerChyba('');
    try {
      const r = zapnout
        ? await fetch('/api/client/me/zamer', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: o.slug, claimId: o.id }) })
        : await fetch(`/api/client/me/zamer?slug=${encodeURIComponent(o.slug)}`, { method: 'DELETE' });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) { setZamerChyba(x.error ? t(x.error) : t('Nepovedlo se. Zkus to znovu.')); return; }
      setZamery(Array.isArray(x.zamery) ? x.zamery : zapnout ? [...zamery.filter(z => z.claimId !== o.id), { teamId: -1, claimId: o.id }] : zamery.filter(z => z.claimId !== o.id));
    } catch {
      setZamerChyba(t('Nepovedlo se — vypadlo připojení.'));
    } finally { setUkladam(false); }
  };

  // Živá odezva: kurzor podle hodin serveru, dotaz každé 2,5 s, jen když je stránka vidět.
  // Ptá se dál i po prvním načtení: čtečka zapíše razítko, razítka navíc a uplatnění odměny
  // za sebou a druhá půlka může přijít až v dalším dotazu — přidá se do téhož listu
  // (slucUdalosti: stejná karta = jedno „+2“, uplatnění pod tím).
  const [udalosti, setUdalosti] = useState<Udalost[] | null>(null);
  const kurzor = useRef<string | null>(null);
  useEffect(() => {
    let konec = false;
    const zeptejSe = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const q = kurzor.current ? `?od=${encodeURIComponent(kurzor.current)}` : '';
        const x = await fetch(`/api/client/card/stav${q}`, { cache: 'no-store' }).then(okJson);
        if (konec) return;
        if (typeof x?.kurzor === 'string') kurzor.current = x.kurzor;
        const nove: Udalost[] = Array.isArray(x?.udalosti) ? x.udalosti : [];
        if (nove.length) { setUdalosti(pred => slucUdalosti(pred ?? [], nove)); void obnovHosta(); try { navigator.vibrate?.(30); } catch { /* bez vibrace */ } }
      } catch { /* další pokus za chvíli */ }
    };
    void zeptejSe();
    const i = setInterval(zeptejSe, 2500);
    return () => { konec = true; clearInterval(i); };
  }, []);

  const wallet = karta.data?.wallet ?? {};
  const [ios, setIos] = useState(false); const [android, setAndroid] = useState(false);
  useEffect(() => { setIos(jeIos()); setAndroid(jeAndroid()); }, []);
  const jdeWallet = !!vybrany && ((!!wallet.apple && ios) || (!!wallet.google && android));
  const doPenezenky = () => {
    const druh = ios ? 'apple' : 'google';
    if (!jeObal) { otevriVeSystemu(`/api/client/card/wallet/${druh}?team=${encodeURIComponent(vybrany)}`); return; }
    fetch('/api/client/cards/wallet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team: vybrany, druh }) })
      .then(okJson).then(x => { if (typeof x?.url === 'string') otevriVeSystemu(x.url); }).catch(() => {});
  };

  const vm = podnik ? kartaZClenstvi(podnik, odmeny, t) : null;

  return (
    <Modal open onClose={onClose} size="md" className="h-vyjed min-h-[calc(100dvh-1rem)] sm:min-h-0"
      title={udalosti ? souhrnOdezvy(udalosti, t).titul : t('Ukaž u kasy')}
      subtitle={udalosti ? souhrnOdezvy(udalosti, t).podtitul : umiDrzet ? t('Displej necháme svítit. Platí ve všech podnicích.') : t('Zvyš jas displeje. Platí ve všech podnicích.')}>
        {udalosti ? (
          <Odezva udalosti={udalosti} podnik={clenstvi.find(c => c.slug === udalosti[0]?.slug) ?? null} onHotovo={onClose} onDalsi={() => { setUdalosti(null); }} hodnotitHref={cesta('/client/me/aktivita')} />
        ) : (
          <>
            <div className="mx-auto w-full max-w-[18rem] aspect-square h-qr-pole p-4 border border-black/[0.07]">
              {karta.data?.svg
                ? <span dangerouslySetInnerHTML={{ __html: karta.data.svg }} className="block w-full h-full" role="img" aria-label={t('QR kód karty {kod}', { kod: karta.data.code })} />
                : karta.data?.code
                  ? <p className="h-kod text-xl text-center break-all" style={{ color: '#16181A' }}>{karta.data.code}</p>
                  : karta.chyba ? <p className="text-sm text-center px-3" style={{ color: 'rgba(22,24,26,0.7)' }}>{t('QR se nenačetlo. Řekni obsluze kód níž.')}</p>
                  : <span className="block w-full h-full rounded-xl bg-black/[0.06] animate-pulse" aria-hidden />}
            </div>
            <p className="mt-4 text-center h-kod text-[22px]" aria-label={t('Kód karty {kod}', { kod: karta.data?.code ?? '' })}>{karta.data?.code ?? ' '}</p>

            {clenstvi.length > 1 && (
              <div className="mt-4 flex justify-center gap-2 flex-wrap" role="radiogroup" aria-label={t('Podnik')}>
                {clenstvi.map(c => (
                  <button key={c.slug} type="button" role="radio" aria-checked={c.slug === vybrany} onClick={() => setVybrany(c.slug)} className="h-cip tap-target-sm max-w-[11rem]">
                    <span className="truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            )}

            {vm && (
              <div className="mt-5">
                {odmenyPodniku.length > 0 ? (
                  <ul className="space-y-2">
                    {odmenyPodniku.slice(0, 3).map(o => {
                      const on = prebaleno(o);
                      return (
                        <li key={o.id} className={`rounded-[18px] px-4 py-3 flex items-center gap-3 ${on ? 'bg-[#C8F542]/25 ring-1 ring-[#C8F542]' : 'well'}`}>
                          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${on ? 'bg-[#C8F542] ring-2 ring-black/70' : 'bg-black/25'}`} aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p id={`zamer-${o.id}`} className="text-[15px] font-semibold leading-tight">{t('{odmena} je připravená', { odmena: o.title })}</p>
                            <p className="t-meta mt-0.5">{on ? t('Obsluha ji uplatní při načtení.') : t('Uplatnit při této návštěvě?')}</p>
                          </div>
                          <Switch checked={on} onChange={v => void prepniOdmenu(o, v)} disabled={ukladam} labelledBy={`zamer-${o.id}`} />
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <KartaPodniku {...vm} pripraveno={null} veta={vm.veta} className="!py-3.5" />
                )}
                {zamerChyba && <p role="alert" className="mt-2 text-sm text-bad-ink">{zamerChyba}</p>}
              </div>
            )}

            <p className="mt-4 t-meta text-center text-pretty">{t('Obsluha načte kód. Razítko a body se ti ukážou hned tady.')}</p>
            {jdeWallet && !demo && (
              <button type="button" onClick={doPenezenky} className="mt-4 btn btn-secondary w-full !h-[52px]"><Icon name="card" size={17} /> {ios ? t('Přidat do Apple Wallet') : t('Přidat do Google Wallet')}</button>
            )}
            {demo && (
              <button type="button" className="mt-4 btn btn-secondary w-full !h-[52px]" onClick={() => { (window as any).__hostDemoNacteni?.(vybrany, odmenyPodniku.filter(prebaleno).map(o => o.id)); }}>
                <Icon name="sparkle" size={17} /> {t('Ukázat načtení u kasy (ukázka)')}
              </button>
            )}
            {!clenstvi.length && me.data && (
              <p className="mt-4 text-sm text-center text-pretty">
                {t('Zatím nejsi členem žádného podniku.')} <Link href={cesta('/client')} onClick={onClose} className="font-semibold underline underline-offset-2">{t('Najít podnik')}</Link>
              </p>
            )}
          </>
        )}
    </Modal>
  );
}

/** Titul a čísla listu po načtení: razítko má přednost, pak body, pak uplatněná odměna. */
function souhrnOdezvy(udalosti: Udalost[], t: (cs: string, p?: any) => string) {
  const raz = udalosti.find(u => u.typ === 'razitko');
  const body = udalosti.filter(u => u.typ === 'body' && u.delta > 0).reduce((a, u) => a + u.delta, 0);
  const uplatneno = udalosti.some(u => u.typ === 'uplatneno');
  const prvni = raz ?? udalosti[0];
  const d = new Date(prvni.at);
  const cas = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const titul = raz ? (raz.delta > 1 ? t('Razítka připsána') : t('Razítko připsáno')) : body > 0 ? t('Body připsány') : uplatneno ? t('Odměna uplatněna') : t('Hotovo');
  return { raz, body, titul, podtitul: t('{podnik} · dnes {cas}', { podnik: prvni.podnik, cas }), velke: raz ? `+${raz.delta}` : body > 0 ? `+${body}` : '' };
}

/** „Razítko připsáno“ / „Body připsány“ / „Odměna uplatněna“ — list po načtení u kasy. */
function Odezva({ udalosti, podnik, onHotovo, onDalsi, hodnotitHref }: { udalosti: Udalost[]; podnik: any | null; onHotovo: () => void; onDalsi: () => void; hodnotitHref: string }) {
  const t = useT('klient-host');
  const { raz, body, velke } = souhrnOdezvy(udalosti, t);
  const uplatneno = udalosti.filter(u => u.typ === 'uplatneno');
  const odmena = udalosti.find(u => u.typ === 'odmena');
  const prvni = raz ?? udalosti[0];
  const k = raz?.karta;
  const plna = !!k && k.razitka >= k.cil;
  return (
    <div className="pb-1" role="status" aria-live="polite">
      <div className="flex justify-center">
        {velke ? <span className="h-plus h-pop">{velke}</span> : <span className="h-plus h-pop"><Icon name="check" size={30} strokeWidth={2.4} /></span>}
      </div>
      {k && k.cil > 0 && (
        <div className="h-karta mt-5" style={stylKarty(prvni.accent ?? podnik?.accent)}>
          <RazitkaMrizka pocet={k.razitka} cil={k.cil} noveOd={Math.max(0, k.razitka - (raz?.delta ?? 1))}
            data={(podnik?.razitkaData?.[String(k.id)] ?? []) as string[]}
            popis={t('{n} z {cil} razítek', { n: k.razitka, cil: k.cil })} />
          <p className="mt-3 text-[14px] font-medium">
            {plna ? t('{n} / {cil} — {odmena} je tvoje, řekni si o ni', { n: k.razitka, cil: k.cil, odmena: k.odmena || t('odměna') })
              : k.cil - k.razitka === 1 && k.odmena ? t('{n} / {cil} — příště je {odmena}', { n: k.razitka, cil: k.cil, odmena: k.odmena })
              : t('{n} / {cil} — ještě {zbyva} do odměny', { n: k.razitka, cil: k.cil, zbyva: k.cil - k.razitka })}
          </p>
        </div>
      )}
      <ul className="mt-4 space-y-1.5 text-sm text-center">
        {raz && body > 0 && <li className="font-semibold">{t('+{n} bodů', { n: body })}</li>}
        {uplatneno.map(u => <li key={u.id} className="font-semibold">{t('Uplatněno: {odmena}', { odmena: u.nazev ?? '' })}</li>)}
        {odmena && <li className="font-semibold">{t('Odměna připravena: {odmena}', { odmena: odmena.nazev ?? '' })}</li>}
      </ul>
      <div className="mt-6 grid grid-cols-2 gap-2">
        <Link href={hodnotitHref} onClick={onHotovo} className="btn btn-secondary !h-[52px] min-w-0">{t('Ohodnotit návštěvu')}</Link>
        <button type="button" onClick={onHotovo} className="btn btn-accent !h-[52px] min-w-0">{t('Hotovo')}</button>
      </div>
      <button type="button" onClick={onDalsi} className="mt-2 w-full tap-target-sm text-sm font-medium text-black/60 py-2">{t('Zpět na kód')}</button>
    </div>
  );
}
