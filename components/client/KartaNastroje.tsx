'use client';

// Nástroje kolem karty hosta: velký QR k načtení u kasy, uložení karty jako obrázek,
// přidání aplikace na plochu a (jen když je to na serveru nakonfigurované) karta
// v Apple Wallet nebo Google Wallet. Čtečka u kasy (např. Storyous) načte QR s kódem
// karty a obsluha hned vidí body, razítka, kupony i členství.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Modal } from '../ui';
import { useT } from '@/lib/i18n/client';

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

export default function KartaNastroje({ karta, podniky }: { karta: Karta; podniky: Podnik[] }) {
  const t = useT('klient-host');
  const [velky, setVelky] = useState(false);
  const [vyber, setVyber] = useState(podniky[0]?.slug ?? '');
  const [zprava, setZprava] = useState('');
  const [instalace, setInstalace] = useState<any>(null);
  const [pomocPlocha, setPomocPlocha] = useState(false);
  const [ios, setIos] = useState(false);
  const [android, setAndroid] = useState(false);
  const [nainstalovana, setNainstalovana] = useState(true);
  const umiDrzet = useDrzDisplej(velky);

  useEffect(() => {
    setIos(jeIos()); setAndroid(jeAndroid()); setNainstalovana(jeNainstalovana());
    const pred = (e: Event) => { e.preventDefault(); setInstalace(e); };
    window.addEventListener('beforeinstallprompt', pred);
    return () => window.removeEventListener('beforeinstallprompt', pred);
  }, []);
  useEffect(() => { if (!podniky.some(p => p.slug === vyber)) setVyber(podniky[0]?.slug ?? ''); }, [podniky, vyber]);
  useEffect(() => { if (zprava) { const id = setTimeout(() => setZprava(''), 5000); return () => clearTimeout(id); } }, [zprava]);

  const ulozObrazek = useCallback(async () => {
    try {
      const blob = await kartaJakoPng(karta, karta.name ?? '', t('Kartička'));
      if (!blob) { setZprava(t('Kartička se nenačetla.')); return; }
      const soubor = new File([blob], 'karta.png', { type: 'image/png' });
      // Na telefonu nabídne „Uložit do Fotek“ přes sdílení; jinde se stáhne.
      if ((navigator as any).canShare?.({ files: [soubor] })) {
        try { await navigator.share({ files: [soubor], title: t('Kartička') }); return; } catch (e: any) { if (e?.name === 'AbortError') return; }
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

  const wallet = karta.wallet ?? {};
  const jdeApple = !!wallet.apple && ios && !!vyber;
  const jdeGoogle = !!wallet.google && android && !!vyber;
  const otevri = (cesta: string) => { window.location.href = `/api/client/card/wallet/${cesta}?team=${encodeURIComponent(vyber)}`; };

  return (
    <section aria-label={t('Nástroje karty')} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon="card" onClick={() => setVelky(true)} disabled={!karta.svg}>{t('Zvětšit QR')}</Button>
        <Button size="sm" variant="secondary" icon="download" onClick={ulozObrazek} disabled={!karta.svg}>{t('Uložit kartu jako obrázek')}</Button>
        {!nainstalovana && <Button size="sm" variant="secondary" icon="plus" onClick={naPlochu} aria-expanded={pomocPlocha}>{t('Přidat na plochu')}</Button>}
      </div>

      {(jdeApple || jdeGoogle) && (
        <div className="flex flex-wrap items-center gap-2">
          {podniky.length > 1 && (
            <select value={vyber} onChange={e => setVyber(e.target.value)} aria-label={t('Podnik pro kartu v peněžence')} className="field !py-2 text-sm min-w-0 max-w-full w-full sm:w-auto">
              {podniky.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          )}
          {jdeApple && <Button size="sm" variant="accent" icon="card" onClick={() => otevri('apple')}>{t('Přidat do Apple Wallet')}</Button>}
          {jdeGoogle && <Button size="sm" variant="accent" icon="card" onClick={() => otevri('google')}>{t('Přidat do Google Wallet')}</Button>}
        </div>
      )}

      {pomocPlocha && !instalace && (
        <p className="note text-sm px-4 py-3 text-pretty">
          {ios ? t('V Safari klepni na Sdílet a pak na Přidat na plochu. Karta se pak otevře jedním klepnutím.') : t('V menu prohlížeče zvol Přidat na plochu (nebo Nainstalovat aplikaci). Karta se pak otevře jedním klepnutím.')}
        </p>
      )}
      {zprava && <p role="status" className="text-sm text-black/60">{zprava}</p>}

      <Modal open={velky} onClose={() => setVelky(false)} title={t('Kartička')} size="sm">
        <div className="rounded-2xl bg-white border border-black/10 p-4 w-full aspect-square grid place-items-center [&_svg]:w-full [&_svg]:h-full">
          {karta.svg && <span dangerouslySetInnerHTML={{ __html: karta.svg }} className="block w-full h-full" aria-hidden />}
        </div>
        <p className="mt-3 text-center font-mono text-2xl font-bold tracking-[0.2em]">{karta.code}</p>
        <p className="mt-3 text-sm text-black/60 text-center text-pretty">
          {umiDrzet
            ? t('Displej zůstane svítit. Pro rychlé načtení zvyš jas displeje na maximum.')
            : t('Zvyš jas displeje na maximum a nenech ho zhasnout, ať se QR načte hned.')}
        </p>
      </Modal>
    </section>
  );
}
