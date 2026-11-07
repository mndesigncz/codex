'use client';

// „U kasy“ (směr A „Peněženka“): jedno klepnutí odkudkoli (limetková pilulka v doku, „Ukázat kartu“
// na počítači) a host má kartu přes celou obrazovku stejným jazykem jako otevřená karta: vybraná
// karta podniku (inkoust s koly razítek), přibalení připravené odměny přepínačem a skleněný panel
// s bílým QR a kódem karty (jeden kód pro všechny podniky). Jinou kartu vybere ťuk na zasunuté
// karty dole. Displej se drží rozsvícený (Wake Lock). „Přibalit odměnu“: host si sám zapne
// připravenou odměnu k této návštěvě (PUT /api/client/me/zamer) a čtečka ji obsluze nabídne jako
// hlavní akci (kontrakt: …/klient/kontrakt-ctecka.md).
//
// Okamžitá odezva (useZivaOdezva níž, sdílí ji otevřená karta na Domů): dokud je okno otevřené, ptá se každé 2,5 s na card/stav.
// Jakmile obsluha načte kód, okno se samo přepne na „+1 · Razítko připsáno“ s kartou, kde nové
// razítko docvakne, a větou „9 / 10 — …“ (body, uplatněná odměna). Po zavření se nic nedotazuje.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../../Icons';
import { Switch } from '../../ui';
import { useT } from '@/lib/i18n/client';
import { okJson } from '@/lib/api';
import { useObal } from '../../ObalProvider';
import { otevriVeSystemu } from '@/lib/stahni';
import { InkoustovaKarta, KruhoveTlacitko, ZasunuteKarty } from '../penezenka';
import { useHostMe, useKartaHosta, obnovHosta } from './data';
import { kartaZClenstvi, pripraveneOdmeny, indexPredni, odmenaCekaNazev, type KartaHosta, type Odmena } from './model';
import { useCesta } from './cesty';
import CelaObrazovka, { ListaOkna } from './domov/CelaObrazovka';
import { PanelKodu } from './domov/DetailKarty';
import { UkazkaNacteni, popisZasunutych } from './domov/spolecne';
import { slucUdalosti } from '@/lib/klient/slouceniOdezvy';

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

// ---- Živá odezva u kasy (sdílí ji i otevřená karta na Domů) ----
// Dokud host ukazuje kód (U kasy, otevřená karta), ptá se každé 2,5 s GET /api/client/card/stav?od=<kurzor>.
// Jakmile obsluha kód načte, přijdou události (razítko, body, uplatněná odměna) a data hosta se obnoví.
// Ptá se dál i po první události: čtečka zapíše razítko, razítka navíc a uplatnění za sebou a druhá
// půlka může přijít až v dalším dotazu (slucUdalosti: stejná karta = jedno „+2“). Jen když je stránka vidět.

export interface Udalost {
  id: string; typ: 'razitko' | 'body' | 'kredit' | 'odmena' | 'uplatneno'; at: string;
  teamId: number; slug: string; podnik: string; accent: string | null; delta: number;
  karta?: { id: number; nazev: string; razitka: number; cil: number; odmena: string | null };
  nazev?: string; zustatek?: number;
}

export function useZivaOdezva(aktivni: boolean): { udalosti: Udalost[] | null; vynuluj: () => void } {
  const [udalosti, setUdalosti] = useState<Udalost[] | null>(null);
  const kurzor = useRef<string | null>(null);
  useEffect(() => {
    if (!aktivni) return;
    let konec = false;
    kurzor.current = null;
    const zeptejSe = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const q = kurzor.current ? `?od=${encodeURIComponent(kurzor.current)}` : '';
        const x = await fetch(`/api/client/card/stav${q}`, { cache: 'no-store' }).then(okJson);
        if (konec) return;
        if (typeof x?.kurzor === 'string') kurzor.current = x.kurzor;
        const nove: Udalost[] = Array.isArray(x?.udalosti) ? x.udalosti : [];
        if (nove.length) {
          setUdalosti(pred => slucUdalosti(pred ?? [], nove));
          void obnovHosta();
          try { navigator.vibrate?.(30); } catch { /* bez vibrace */ }
        }
      } catch { /* další pokus za chvíli */ }
    };
    void zeptejSe();
    const i = setInterval(zeptejSe, 2500);
    return () => { konec = true; clearInterval(i); };
  }, [aktivni]);
  const vynuluj = useCallback(() => setUdalosti(null), []);
  return { udalosti, vynuluj };
}

/** Titul a čísla po načtení: razítko má přednost, pak body, pak uplatněná odměna. */
export function souhrnOdezvy(udalosti: Udalost[], t: (cs: string, p?: any) => string) {
  const raz = udalosti.find(u => u.typ === 'razitko');
  const body = udalosti.filter(u => u.typ === 'body' && u.delta > 0).reduce((a, u) => a + u.delta, 0);
  const uplatneno = udalosti.some(u => u.typ === 'uplatneno');
  const prvni = raz ?? udalosti[0];
  const d = new Date(prvni.at);
  const cas = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const titul = raz ? (raz.delta > 1 ? t('Razítka připsána') : t('Razítko připsáno')) : body > 0 ? t('Body připsány') : uplatneno ? t('Odměna uplatněna') : t('Hotovo');
  return { raz, body, titul, podtitul: t('{podnik} · dnes {cas}', { podnik: prvni.podnik, cas }), velke: raz ? `+${raz.delta}` : body > 0 ? `+${body}` : '' };
}

/** „+1 · Razítko připsáno · Kavárna U Lípy · dnes 10:42“ nad panelem s QR (živá odezva). */
export function RadekOdezvy({ udalosti, onSkryt }: { udalosti: Udalost[]; onSkryt?: () => void }) {
  const t = useT('klient-host');
  const s = souhrnOdezvy(udalosti, t);
  return (
    <div className="flex items-center gap-3">
      <span className="h-plus h-pop !h-10 !w-10 shrink-0 !text-[15px]" aria-hidden>{s.velke || <Icon name="check" size={18} strokeWidth={2.4} />}</span>
      <p className="min-w-0 flex-1">
        <span className="hp-silny block">{s.velke && <span className="sr-only">{s.velke} </span>}{s.titul}</span>
        <span className="hp-meta block">{s.podtitul}</span>
      </p>
      {onSkryt && (
        <button type="button" onClick={onSkryt} className="hp-kruh tap-target shrink-0 text-[color:var(--hp-muted)]" aria-label={t('Skrýt')} title={t('Skrýt')}>
          <Icon name="close" size={16} strokeWidth={1.6} />
        </button>
      )}
    </div>
  );
}

function jeIos() { return typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)); }
function jeAndroid() { return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent); }

function UKasy({ slug, onClose }: { slug?: string; onClose: () => void }) {
  const t = useT('klient-host');
  const cesta = useCesta();
  const { jeObal } = useObal();
  const karta = useKartaHosta();
  const me = useHostMe();
  const umiDrzet = useDrzDisplej();
  const clenstvi: any[] = useMemo(() => (me.data?.memberships ?? []).filter((x: any) => x.loyaltyOn !== false), [me.data]);
  const odmeny = useMemo(() => pripraveneOdmeny(me.data), [me.data]);
  const karty: KartaHosta[] = useMemo(() => clenstvi.map(m => kartaZClenstvi(m, odmeny, t)), [clenstvi, odmeny, t]);
  const [vybrany, setVybrany] = useState<string>(slug ?? '');
  useEffect(() => {
    if (vybrany && karty.some(c => c.slug === vybrany)) return;
    // Výchozí podnik: ten, kde čeká odměna, jinak nejblíž odměně (stejně jako přední karta balíčku).
    const s = karty.length ? karty[indexPredni(karty)].slug : '';
    if (s) setVybrany(s);
  }, [karty, vybrany]);
  const iVybrane = karty.findIndex(c => c.slug === vybrany);
  const k = iVybrane >= 0 ? karty[iVybrane] : null;
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

  const { udalosti, vynuluj } = useZivaOdezva(true);

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

  const ostatni = iVybrane >= 0 ? [...karty.slice(iVybrane + 1), ...karty.slice(0, iVybrane)] : [];
  const dalsi = ostatni[0];
  const souhrn = udalosti ? souhrnOdezvy(udalosti, t) : null;

  return (
    <CelaObrazovka open onClose={onClose} label={souhrn ? souhrn.titul : t('U kasy')}>
      <ListaOkna vlevo={<KruhoveTlacitko ikona="chevron" popis={t('Zavřít')} onClick={onClose} />}
        stred={souhrn ? <p className="hp-meta">{t('U kasy')}</p> : <h2 className="hp-silny">{t('Ukaž u kasy')}</h2>} />
      {udalosti && souhrn ? (
        <Odezva udalosti={udalosti} karta={karty.find(c => c.slug === udalosti[0]?.slug) ?? null} onHotovo={onClose} onDalsi={vynuluj} hodnotitHref={cesta('/client/me/aktivita')} />
      ) : (
        <>
          {k && (
            <InkoustovaKarta varianta="otevrena" nazev={k.nazev} klic={k.klic} logoUrl={k.logoUrl} popis={k.popis}
              cislo={k.cislo} z={k.z} stitek={k.stitekOtevrena} razitka={k.razitka} postup={k.postup} ariaLabel={k.aria} />
          )}

          {k && odmenyPodniku.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {odmenyPodniku.slice(0, 3).map(o => {
                const on = prebaleno(o);
                return (
                  <li key={o.id} className="lgx hp-sklo flex items-center gap-3 px-4 py-3">
                    <span className="hp-jamka" aria-hidden><Icon name="gift" size={18} strokeWidth={1.6} /></span>
                    <div className="min-w-0 flex-1">
                      <p id={`zamer-${o.id}`} className="hp-silny [overflow-wrap:anywhere]">{odmenaCekaNazev(o, t)}</p>
                      <p className="hp-meta mt-0.5">{on ? t('Obsluha ji uplatní při načtení.') : t('Uplatnit při této návštěvě?')}</p>
                    </div>
                    <Switch checked={on} onChange={v => void prepniOdmenu(o, v)} disabled={ukladam} labelledBy={`zamer-${o.id}`} />
                  </li>
                );
              })}
            </ul>
          )}
          {k && !odmenyPodniku.length && k.veta && <p className="hp-silny mx-0.5 mt-3 text-pretty">{k.veta}</p>}
          {zamerChyba && <p role="alert" className="hp-silny mx-0.5 mt-2 flex items-center gap-2"><Icon name="warning" size={16} aria-hidden />{zamerChyba}</p>}

          <PanelKodu className="mt-4" karta={karta}
            napoveda={<>{t('Obsluha načte kód. Razítko a body se ti ukážou hned tady.')} {umiDrzet ? t('Displej necháme svítit. Platí ve všech podnicích.') : t('Zvyš jas displeje. Platí ve všech podnicích.')}</>} />

          {jdeWallet && (
            <button type="button" onClick={doPenezenky} className="hp-btn lgx hp-btn-sklo hp-btn-blok mt-3"><Icon name="card" size={17} aria-hidden /> {ios ? t('Přidat do Apple Wallet') : t('Přidat do Google Wallet')}</button>
          )}
          <UkazkaNacteni slug={vybrany} prebalene={odmenyPodniku.filter(prebaleno).map(o => o.id)} className="mt-3" />
          {!clenstvi.length && me.data && (
            <p className="hp-meta mx-0.5 mt-4 text-center text-pretty">
              {t('Zatím nejsi členem žádného podniku.')} <Link href={cesta('/client')} onClick={onClose} className="tap-target font-semibold text-[color:var(--hp-fg)] underline underline-offset-2">{t('Najít podnik')}</Link>
            </p>
          )}

          <div className="flex-1" />
          {dalsi ? (
            <div className="mt-6 pt-2 pb-[env(safe-area-inset-bottom)]">
              <ZasunuteKarty karty={ostatni.map(o => ({ nazev: o.nazev, klic: o.klic, logoUrl: o.logoUrl }))}
                popis={popisZasunutych(ostatni, t)}
                hodnota={t('+{n, plural, one {# karta} few {# karty} other {# karet}}', { n: ostatni.length })}
                ariaLabel={t('Přepnout na kartu {podnik}', { podnik: dalsi.nazev })}
                onClick={() => setVybrany(dalsi.slug)} />
            </div>
          ) : <div className="h-8" />}
        </>
      )}
    </CelaObrazovka>
  );
}

/** „Razítko připsáno“ / „Body připsány“ / „Odměna uplatněna“ — po načtení u kasy. Karta podniku
 *  ukáže stav po všech zápisech a nová razítka docvaknou (RazitkaKolecka noveOd). */
function Odezva({ udalosti, karta, onHotovo, onDalsi, hodnotitHref }: { udalosti: Udalost[]; karta: KartaHosta | null; onHotovo: () => void; onDalsi: () => void; hodnotitHref: string }) {
  const t = useT('klient-host');
  const { raz, body, velke, titul, podtitul } = souhrnOdezvy(udalosti, t);
  const uplatneno = udalosti.filter(u => u.typ === 'uplatneno');
  const odmena = udalosti.find(u => u.typ === 'odmena');
  const k = raz?.karta;
  const plna = !!k && k.razitka >= k.cil;
  return (
    <div className="pb-6" role="status" aria-live="polite">
      <div className="flex flex-col items-center text-center">
        {velke ? <span className="h-plus h-pop">{velke}</span> : <span className="h-plus h-pop"><Icon name="check" size={30} strokeWidth={2.4} /></span>}
        <h2 className="hp-titulek mt-4">{titul}</h2>
        <p className="hp-meta mt-1.5">{podtitul}</p>
      </div>
      {k && k.cil > 0 && (
        <div className="mt-6">
          <InkoustovaKarta varianta="otevrena" nazev={karta?.nazev ?? raz?.podnik ?? ''} klic={karta?.klic ?? raz?.slug} logoUrl={karta?.logoUrl}
            popis={k.nazev} cislo={k.razitka} z={`/ ${k.cil}`}
            razitka={{ pocet: k.razitka, cil: k.cil, noveOd: Math.max(0, k.razitka - (raz?.delta ?? 1)), popis: t('{n} z {cil} razítek', { n: k.razitka, cil: k.cil }) }} />
          <p className="hp-silny mx-0.5 mt-3 text-pretty">
            {plna ? t('{n} / {cil} — {odmena} je tvoje, řekni si o ni', { n: k.razitka, cil: k.cil, odmena: k.odmena || t('odměna') })
              : k.cil - k.razitka === 1 && k.odmena ? t('{n} / {cil} — příště je {odmena}', { n: k.razitka, cil: k.cil, odmena: k.odmena })
              : t('{n} / {cil} — ještě {zbyva} do odměny', { n: k.razitka, cil: k.cil, zbyva: k.cil - k.razitka })}
          </p>
        </div>
      )}
      {(raz && body > 0) || uplatneno.length || odmena ? (
        <ul className="lgx hp-sklo hp-seznam mt-4">
          {raz && body > 0 && <li className="hp-radek !min-h-[52px]"><span className="hp-jamka" aria-hidden><Icon name="coins" size={18} strokeWidth={1.6} /></span><span className="hp-silny">{t('+{n} bodů', { n: body })}</span></li>}
          {uplatneno.map(u => <li key={u.id} className="hp-radek !min-h-[52px]"><span className="hp-jamka" aria-hidden><Icon name="check" size={18} strokeWidth={1.6} /></span><span className="hp-silny [overflow-wrap:anywhere]">{t('Uplatněno: {odmena}', { odmena: u.nazev ?? '' })}</span></li>)}
          {odmena && <li className="hp-radek !min-h-[52px]"><span className="hp-jamka" aria-hidden><Icon name="gift" size={18} strokeWidth={1.6} /></span><span className="hp-silny [overflow-wrap:anywhere]">{t('Odměna připravena: {odmena}', { odmena: odmena.nazev ?? '' })}</span></li>}
        </ul>
      ) : null}
      <div className="mt-6 grid grid-cols-2 gap-2">
        <Link href={hodnotitHref} onClick={onHotovo} className="hp-btn lgx hp-btn-sklo min-w-0 !px-3"><span className="truncate">{t('Ohodnotit návštěvu')}</span></Link>
        <button type="button" onClick={onHotovo} className="hp-btn hp-btn-limetka min-w-0 !px-3"><span className="truncate">{t('Hotovo')}</span></button>
      </div>
      <button type="button" onClick={onDalsi} className="hp-btn hp-btn-blok mt-2 !h-11 text-[14px] text-[color:var(--hp-muted)]">{t('Zpět na kód')}</button>
    </div>
  );
}
