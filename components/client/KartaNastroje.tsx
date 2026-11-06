'use client';

// Nástroje kolem karty hosta: velký QR k načtení u kasy, uložení karty jako obrázek,
// přidání aplikace na plochu a (jen když je to na serveru nakonfigurované) karta
// v Apple Wallet nebo Google Wallet. Čtečka u kasy (např. Storyous) načte QR s kódem
// karty a obsluha hned vidí body, razítka, kupony i členství.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '../ui';
import { Icon } from '../Icons';
import { useT } from '@/lib/i18n/client';
import { useObal } from '../ObalProvider';
import { otevriVeSystemu } from '@/lib/stahni';
import { okJson } from '@/lib/api';

interface Karta { code: string; name?: string; svg?: string; wallet?: { apple?: boolean; google?: boolean } }
interface Podnik { slug: string; name: string }

/** iPhone a iPad (nový iPadOS se hlásí jako Mac s dotykem). */
function jeIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function jeAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}
function jeNainstalovana(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

/** Udrží displej rozsvícený, dokud je `aktivni`. Prohlížeč bez Screen Wake Lock vrátí false. */
function useDrzDisplej(aktivni: boolean): boolean {
  const [umi, setUmi] = useState(true);
  const zamek = useRef<any>(null);
  useEffect(() => {
    if (!aktivni) return;
    const wl = (navigator as any).wakeLock;
    if (!wl?.request) { setUmi(false); return; }
    let zruseno = false;
    const zamkni = async () => {
      try { const z = await wl.request('screen'); if (zruseno) { z.release().catch(() => {}); return; } zamek.current = z; }
      catch { /* baterie, úsporný režim: nevadí, QR funguje i tak */ }
    };
    zamkni();
    // Zámek se po schování stránky sám uvolní, po návratu se bere znovu.
    const znovu = () => { if (document.visibilityState === 'visible') zamkni(); };
    document.addEventListener('visibilitychange', znovu);
    return () => {
      zruseno = true;
      document.removeEventListener('visibilitychange', znovu);
      zamek.current?.release?.().catch(() => {});
      zamek.current = null;
    };
  }, [aktivni]);
  return umi;
}

/** Vykreslí kartu (QR, jméno, kód) do PNG. SVG z API má průhledné pozadí, tak se kreslí na bílou. */
async function kartaJakoPng(karta: Karta, jmeno: string, popisek: string): Promise<Blob | null> {
  if (!karta.svg) return null;
  const W = 1080, H = 1400;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  if (!c) return null;
  c.fillStyle = '#16181A'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#FFFFFF';
  c.beginPath(); (c as any).roundRect(90, 90, W - 180, W - 180, 56); c.fill();
  const url = URL.createObjectURL(new Blob([karta.svg], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise<HTMLImageElement>((ok, ne) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ne; i.src = url; });
    const strana = W - 180 - 120;
    c.drawImage(img, 150, 150, strana, strana);
  } finally { URL.revokeObjectURL(url); }
  c.textAlign = 'center';
  c.fillStyle = '#C8F542'; c.font = '600 34px system-ui, sans-serif';
  c.fillText(popisek.toUpperCase(), W / 2, W + 30);
  c.fillStyle = '#FFFFFF'; c.font = '700 72px system-ui, sans-serif';
  c.fillText(jmeno.length > 22 ? jmeno.slice(0, 21) + '…' : jmeno, W / 2, W + 130);
  c.font = '700 84px ui-monospace, monospace';
  c.fillText(karta.code, W / 2, W + 250);
  return new Promise(res => canvas.toBlob(res, 'image/png'));
}

/** Akce s kartou (uložit jako obrázek, přidat na plochu, Wallet pro vybraný podnik) — sdílí je
 *  dlaždice v Moje (výchozí export) a menu ⋯ otevřené karty (NabidkaKarty). */
function useNastrojeKarty(karta: Karta | null, vyber: string) {
  const t = useT('klient-host');
  // V aplikaci z obchodu (obal) je „Přidat na plochu“ k ničemu — aplikace na ploše už je.
  const { jeObal } = useObal();
  const [zprava, setZprava] = useState('');
  const [instalace, setInstalace] = useState<any>(null);
  const [pomocPlocha, setPomocPlocha] = useState(false);
  const [ios, setIos] = useState(false);
  const [android, setAndroid] = useState(false);
  const [nainstalovana, setNainstalovana] = useState(true);

  useEffect(() => {
    setIos(jeIos()); setAndroid(jeAndroid()); setNainstalovana(jeNainstalovana());
    const pred = (e: Event) => { e.preventDefault(); setInstalace(e); };
    window.addEventListener('beforeinstallprompt', pred);
    return () => window.removeEventListener('beforeinstallprompt', pred);
  }, []);
  useEffect(() => { if (zprava) { const id = setTimeout(() => setZprava(''), 5000); return () => clearTimeout(id); } }, [zprava]);

  const ulozObrazek = useCallback(async () => {
    if (!karta) return;
    try {
      const blob = await kartaJakoPng(karta, karta.name ?? '', t('Karta'));
      if (!blob) { setZprava(t('Karta se nenačetla.')); return; }
      const soubor = new File([blob], 'karta.png', { type: 'image/png' });
      // Na telefonu nabídne „Uložit do Fotek“ přes sdílení; jinde se stáhne.
      if ((navigator as any).canShare?.({ files: [soubor] })) {
        try { await navigator.share({ files: [soubor], title: t('Karta') }); return; } catch (e: any) { if (e?.name === 'AbortError') return; }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'karta.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch {
      setZprava(t('Nepovedlo se.'));
    }
  }, [karta, t]);

  const naPlochu = useCallback(async () => {
    if (instalace) {
      try { await instalace.prompt(); } catch { /* zavřeno */ }
      setInstalace(null);
      return;
    }
    setPomocPlocha(v => !v);
  }, [instalace]);

  const wallet = karta?.wallet ?? {};
  const jdeApple = !!wallet.apple && ios && !!vyber;
  const jdeGoogle = !!wallet.google && android && !!vyber;
  // Wallet přes prohlížeč systému: v obalu by navigace WebView na .pkpass nebo odkaz Googlu skončila
  // prázdnou obrazovkou; SFSafariViewController / Custom Tabs kartu nabídnou do peněženky. Na webu nová záložka.
  // V obalu nemá prohlížeč systému přihlášení z aplikace: aplikace si řekne o podepsaný odkaz na 10 minut.
  const doWallet = (cesta: 'apple' | 'google') => {
    if (!jeObal) { otevriVeSystemu(`/api/client/card/wallet/${cesta}?team=${encodeURIComponent(vyber)}`); return; }
    fetch('/api/client/cards/wallet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team: vyber, druh: cesta }) })
      .then(okJson).then(x => { if (typeof x?.url === 'string') otevriVeSystemu(x.url); else setZprava(t('Nepovedlo se.')); })
      .catch(() => setZprava(t('Nepovedlo se.')));
  };
  const textPlocha = ios ? t('V Safari klepni na Sdílet a pak na Přidat na plochu. Karta se pak otevře jedním klepnutím.') : t('V menu prohlížeče zvol Přidat na plochu (nebo Nainstalovat aplikaci). Karta se pak otevře jedním klepnutím.');
  return {
    jeObal, nainstalovana, zprava, setZprava, ulozObrazek, naPlochu, jdeApple, jdeGoogle, doWallet,
    plochaJde: !nainstalovana && !jeObal,
    pomocPlocha: pomocPlocha && !instalace && !jeObal, setPomocPlocha, textPlocha, maPrompt: !!instalace,
  };
}

export default function KartaNastroje({ karta, podniky }: { karta: Karta; podniky: Podnik[] }) {
  const t = useT('klient-host');
  const [velky, setVelky] = useState(false);
  const [vyber, setVyber] = useState(podniky[0]?.slug ?? '');
  const n = useNastrojeKarty(karta, vyber);
  const { nainstalovana, jeObal } = n;
  const umiDrzet = useDrzDisplej(velky);
  useEffect(() => { if (!podniky.some(p => p.slug === vyber)) setVyber(podniky[0]?.slug ?? ''); }, [podniky, vyber]);

  return (
    <section aria-label={t('Nástroje karty')} className="space-y-3">
      {/* Akce pod kartou hosta jako skleněné pilulky (směr A), ne šedé dlaždice. */}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="hp-btn lgx hp-btn-sklo hp-btn-stredni" onClick={() => setVelky(true)} disabled={!karta.svg}><Icon name="qr" size={17} aria-hidden />{t('Zvětšit QR')}</button>
        <button type="button" className="hp-btn lgx hp-btn-sklo hp-btn-stredni" onClick={() => void n.ulozObrazek()} disabled={!karta.svg} aria-label={t('Uložit kartu jako obrázek')}><Icon name="download" size={17} aria-hidden />{t('Uložit')}</button>
        {!nainstalovana && !jeObal && <button type="button" className="hp-btn lgx hp-btn-sklo hp-btn-stredni" onClick={() => void n.naPlochu()} aria-expanded={n.pomocPlocha}><Icon name="plus" size={17} aria-hidden />{t('Přidat na plochu')}</button>}
      </div>

      {(n.jdeApple || n.jdeGoogle) && (
        <div className="flex flex-wrap items-center gap-2">
          {podniky.length > 1 && (
            <select value={vyber} onChange={e => setVyber(e.target.value)} aria-label={t('Podnik pro kartu v peněžence')} className="field !py-2 text-sm min-w-0 max-w-full w-full sm:w-auto">
              {podniky.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          )}
          {n.jdeApple && <button type="button" className="hp-btn hp-btn-inkoust hp-btn-stredni" onClick={() => n.doWallet('apple')}><Icon name="card" size={16} aria-hidden />{t('Přidat do Apple Wallet')}</button>}
          {n.jdeGoogle && <button type="button" className="hp-btn hp-btn-inkoust hp-btn-stredni" onClick={() => n.doWallet('google')}><Icon name="card" size={16} aria-hidden />{t('Přidat do Google Wallet')}</button>}
        </div>
      )}

      {n.pomocPlocha && <p className="hp-meta rounded-[14px] bg-[color:var(--hp-well)] px-4 py-3 text-pretty">{n.textPlocha}</p>}
      {n.zprava && <p role="status" className="hp-meta">{n.zprava}</p>}

      <Modal open={velky} onClose={() => setVelky(false)} title={t('Karta')} size="sm" className="h-list-sklo h-plocha">
        <div className="h-qr-pole w-full aspect-square p-4 shadow-[0_0_0_1px_rgba(22,24,26,0.06)]">
          {karta.svg && <span dangerouslySetInnerHTML={{ __html: karta.svg }} className="block w-full h-full" aria-hidden />}
        </div>
        <p className="hp-kod mt-4 text-center text-[22px]">{karta.code}</p>
        <p className="hp-meta mt-3 text-center text-pretty">
          {umiDrzet
            ? t('Displej zůstane svítit. Pro rychlé načtení zvyš jas displeje na maximum.')
            : t('Zvyš jas displeje na maximum a nenech ho zhasnout, ať se QR načte hned.')}
        </p>
      </Modal>
    </section>
  );
}

/** Menu ⋯ otevřené karty: Wallet pro tenhle podnik, uložit kartu jako obrázek, přidat na plochu.
 *  Tlačítko s aria-haspopup, seznam s role=menu; šipky nahoru/dolů, Escape menu zavře (jen menu,
 *  okno pod ním zůstane) a fokus se vrátí na ⋯. */
export function NabidkaKarty({ karta, slug, className = '' }: { karta: Karta | null; slug: string; className?: string }) {
  const t = useT('klient-host');
  const n = useNastrojeKarty(karta, slug);
  const [otevreno, setOtevreno] = useState(false);
  const tlacitko = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const zavri = useCallback((fokus = true) => { setOtevreno(false); if (fokus) tlacitko.current?.focus(); }, []);

  useEffect(() => {
    if (!otevreno) return;
    const polozky = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    const id = setTimeout(() => polozky()[0]?.focus(), 0);
    // Zachytává se na window (před posluchačem okna na dokumentu): Escape zavře jen menu.
    const klavesa = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); zavri(); return; }
      if (e.key === 'Tab') { zavri(false); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      const p = polozky(); if (!p.length) return;
      e.preventDefault();
      const i = p.indexOf(document.activeElement as HTMLElement);
      const dalsi = e.key === 'Home' ? 0 : e.key === 'End' ? p.length - 1 : e.key === 'ArrowDown' ? (i + 1) % p.length : (i - 1 + p.length) % p.length;
      p[dalsi]?.focus();
    };
    const mimo = (e: PointerEvent) => {
      const c = e.target as Node;
      if (menu.current?.contains(c) || tlacitko.current?.contains(c)) return;
      zavri(false);
    };
    window.addEventListener('keydown', klavesa, true);
    document.addEventListener('pointerdown', mimo, true);
    return () => { clearTimeout(id); window.removeEventListener('keydown', klavesa, true); document.removeEventListener('pointerdown', mimo, true); };
  }, [otevreno, zavri]);

  const akce = (f: () => void) => () => { zavri(); f(); };
  const POLOZKA = 'flex w-full min-h-[48px] items-center gap-3 rounded-[14px] px-3.5 text-left text-[15px] font-medium text-[color:var(--hp-fg)] hover:bg-[color:var(--hp-well)] focus-visible:bg-[color:var(--hp-well)] focus-visible:outline-none disabled:opacity-50';
  const poznamka = n.pomocPlocha ? n.textPlocha : n.zprava;

  return (
    <div className={`relative ${className}`}>
      <button ref={tlacitko} type="button" onClick={() => setOtevreno(v => !v)} aria-haspopup="menu" aria-expanded={otevreno}
        aria-label={t('Další akce s kartou')} title={t('Další akce s kartou')} className="hp-kruh tap-target lgx hp-btn-sklo">
        <Icon name="more" size={18} strokeWidth={1.6} />
      </button>
      {otevreno && (
        <div ref={menu} role="menu" aria-label={t('Další akce s kartou')}
          className="lgx-strong hp-sklo absolute right-0 top-full z-10 mt-2 w-[min(17rem,calc(100vw-40px))] p-1.5">
          {n.jdeApple && <button type="button" role="menuitem" className={POLOZKA} onClick={akce(() => n.doWallet('apple'))}><Icon name="card" size={18} strokeWidth={1.6} aria-hidden />{t('Přidat do Apple Wallet')}</button>}
          {n.jdeGoogle && <button type="button" role="menuitem" className={POLOZKA} onClick={akce(() => n.doWallet('google'))}><Icon name="card" size={18} strokeWidth={1.6} aria-hidden />{t('Přidat do Google Wallet')}</button>}
          <button type="button" role="menuitem" className={POLOZKA} disabled={!karta?.svg} onClick={akce(() => void n.ulozObrazek())}><Icon name="download" size={18} strokeWidth={1.6} aria-hidden />{t('Uložit kartu jako obrázek')}</button>
          {n.plochaJde && <button type="button" role="menuitem" className={POLOZKA} onClick={akce(() => { if (n.maPrompt) void n.naPlochu(); else n.setPomocPlocha(true); })}><Icon name="plus" size={18} strokeWidth={1.6} aria-hidden />{t('Přidat na plochu')}</button>}
        </div>
      )}
      {!otevreno && poznamka && (
        <div role="status" className="lgx-strong hp-sklo absolute right-0 top-full z-10 mt-2 w-[min(17rem,calc(100vw-40px))] px-4 py-3 text-left">
          <p className="hp-meta text-pretty">{poznamka}</p>
          {n.pomocPlocha && <button type="button" onClick={() => n.setPomocPlocha(false)} className="hp-btn hp-btn-male lgx hp-btn-sklo mt-2 tap-target-sm">{t('Rozumím')}</button>}
        </div>
      )}
    </div>
  );
}
