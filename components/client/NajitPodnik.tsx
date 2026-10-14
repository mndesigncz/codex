'use client';

// „Naskenovat“ a „Zadat kód podniku“ v Managero client (ClientShell: hlavička a spodní dok).
//
// Host přijde ke stolu, na stojánku je QR. V nativní aplikaci ho čte nativní skener z obalu
// (window.manageroNative.skenujQr, components/NativeBridge: ML Kit na iPhonu, Google Code Scanner
// na Androidu); v prohlížeči, který umí BarcodeDetector (Chrome na Androidu), kamera přímo v okně.
// Kdo QR nemá nebo mu kamera nejde, opíše kód podniku (slug, třeba „cafe-demo“) nebo vloží adresu.
// Obojí otevře stránku podniku v aplikaci; cizí QR se neotevře nikdy (cestaZQr, lib/nativni/most.ts).
//
// Okno se otevírá z tlačítka „Naskenovat“. V obalu rovnou spustí nativní skener a okno čeká pod ním:
// když host skener zavře, vidí pole pro kód, nemusí nic hledat.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Modal } from '../ui';
import { cestaZKoduPodniku, cestaZQr } from '@/lib/nativni/most';
import { useT } from '@/lib/i18n/client';

/** Umí tohle prostředí naskenovat QR? Nativní most (obal), nebo BarcodeDetector v prohlížeči. */
export function useUmiSkenovat(jeObal: boolean): { nativni: boolean; kamera: boolean; umi: boolean } {
  const [nativni, setNativni] = useState(false);
  const [kamera, setKamera] = useState(false);
  useEffect(() => {
    const zjisti = () => setNativni(!!window.manageroNative?.skenujQr);
    zjisti();
    // V obalu jen nativní skener: hostovská aplikace na Androidu oprávnění ke kameře vůbec nemá
    // (Google Code Scanner ho nepotřebuje), kamera webu by skončila chybou.
    setKamera(!jeObal && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia);
    window.addEventListener('managero:nativni-pripraveno', zjisti);
    return () => window.removeEventListener('managero:nativni-pripraveno', zjisti);
  }, [jeObal]);
  // Obal skenovat umí vždycky (most se jen načítá líně), tlačítko se nemá objevit až po chvíli.
  return { nativni, kamera, umi: jeObal || nativni || kamera };
}

const slugZCesty = (cesta: string): string => cesta.replace(/^\/client\//, '').split(/[/?#]/)[0];

export default function NajitPodnik({ open, onClose, skenovatHned, jeObal }: {
  open: boolean; onClose: () => void; skenovatHned: boolean; jeObal: boolean;
}) {
  const t = useT('klient-host');
  const router = useRouter();
  const { nativni, kamera, umi } = useUmiSkenovat(jeObal);
  const [kod, setKod] = useState('');
  const [chyba, setChyba] = useState('');
  const [hleda, setHleda] = useState(false);
  const [kameraZap, setKameraZap] = useState(false);
  const spusteno = useRef(false);

  const otevri = useCallback((cesta: string) => { onClose(); router.push(cesta); }, [onClose, router]);

  const skenuj = useCallback(async () => {
    setChyba('');
    if (!nativni) { setKameraZap(v => !v); return; }
    const text = await window.manageroNative?.skenujQr();
    if (text == null) return; // zavřel skener: okno s polem pro kód zůstává
    const cesta = cestaZQr(text);
    if (cesta) otevri(cesta); else setChyba(t('Tohle není QR kód podniku z Managera. Zkus jiný, nebo zadej kód podniku.'));
  }, [nativni, otevri, t]);

  // Otevřeno tlačítkem „Naskenovat“ v obalu: skener hned, jednou na otevření.
  useEffect(() => {
    if (!open) { spusteno.current = false; setKameraZap(false); setChyba(''); return; }
    if (!skenovatHned || spusteno.current) return;
    if (nativni) { spusteno.current = true; void skenuj(); }
    else if (kamera) { spusteno.current = true; setKameraZap(true); }
  }, [open, skenovatHned, nativni, kamera, skenuj]);

  const odeslat = async (e: React.FormEvent) => {
    e.preventDefault();
    setChyba('');
    const cesta = cestaZKoduPodniku(kod);
    if (!cesta) { setChyba(kod.trim() ? t('Takový kód podniku nemáme. Kód tvoří malá písmena, číslice a pomlčky, třeba cafe-demo.') : t('Napiš kód podniku.')); return; }
    setHleda(true);
    try {
      const r = await fetch(`/api/client/b/${encodeURIComponent(slugZCesty(cesta))}`);
      if (r.status === 404) { setChyba(t('Podnik s tímhle kódem jsme nenašli. Zkontroluj ho, nebo podnik vyhledej podle názvu.')); return; }
      // Jiná chyba (síť, server) nemá bránit pokusu: stránka podniku umí výpadek říct sama.
      otevri(cesta);
    } catch {
      otevri(cesta);
    } finally {
      setHleda(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="sm" title={t('Najít podnik')}
      subtitle={umi ? t('Naskenuj QR kód na stole nebo u pultu, nebo zadej kód podniku.') : t('Zadej kód podniku ze stojánku nebo letáku.')}>
      <div className="space-y-4">
        {umi && (
          <div className="space-y-3">
            <Button variant="primary" icon="camera" block className="!w-full" onClick={() => void skenuj()} disabled={!nativni && !kamera}>
              {kameraZap ? t('Zavřít kameru') : t('Naskenovat QR kód')}
            </Button>
            {kameraZap && !nativni && (
              <KameraQr onCesta={otevri} onCizi={() => setChyba(t('Tohle není QR kód podniku z Managera. Zkus jiný, nebo zadej kód podniku.'))}
                onChyba={() => { setKameraZap(false); setChyba(t('Kamera není k dispozici. Zadej kód podniku.')); }} />
            )}
            <p className="t-label text-center" aria-hidden>{t('nebo')}</p>
          </div>
        )}
        <form onSubmit={odeslat} className="space-y-3" noValidate>
          <Field id="kod-podniku" label={t('Kód podniku')} hint={t('Najdeš ho pod QR kódem na stojánku nebo na letáku, třeba cafe-demo.')}>
            <Input id="kod-podniku" value={kod} onChange={e => { setKod(e.target.value); setChyba(''); }} placeholder="cafe-demo"
              autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} inputMode="url" enterKeyHint="go" maxLength={300} data-transient />
          </Field>
          <Button type="submit" variant="accent" block className="!w-full" loading={hleda}>{t('Otevřít podnik')}</Button>
        </form>
        {chyba && <p role="alert" className="note note-danger text-sm">{chyba}</p>}
      </div>
    </Modal>
  );
}

/** Kamera v prohlížeči (BarcodeDetector): čte QR každých 300 ms, přijme jen QR podniku nebo stolu. */
function KameraQr({ onCesta, onCizi, onChyba }: { onCesta: (c: string) => void; onCizi: () => void; onChyba: () => void }) {
  const t = useT('klient-host');
  const ref = useRef<HTMLVideoElement>(null);
  // Zpětná volání v refu, ať překreslení rodiče (hláška o cizím QR) kameru nerestartuje.
  const cb = useRef({ onCesta, onCizi, onChyba });
  cb.current = { onCesta, onCizi, onChyba };
  useEffect(() => {
    let stream: MediaStream | null = null; let timer: ReturnType<typeof setInterval> | undefined; let hotovo = false; let posledni = '';
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (ref.current) { ref.current.srcObject = stream; await ref.current.play(); }
        const det = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        timer = setInterval(async () => {
          if (hotovo || !ref.current) return;
          try {
            const v = String((await det.detect(ref.current))?.[0]?.rawValue ?? '');
            if (!v) return;
            const c = cestaZQr(v);
            if (c) { hotovo = true; cb.current.onCesta(c); }
            else if (v !== posledni) { posledni = v; cb.current.onCizi(); }
          } catch { /* další snímek */ }
        }, 300);
      } catch { cb.current.onChyba(); }
    })();
    return () => { hotovo = true; if (timer) clearInterval(timer); stream?.getTracks().forEach(s => s.stop()); };
  }, []);
  return <video ref={ref} muted playsInline className="w-full aspect-square object-cover rounded-2xl bg-black/80" aria-label={t('Náhled kamery')} />;
}
