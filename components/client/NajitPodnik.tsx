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
import { usePathname, useRouter } from 'next/navigation';
import { Modal } from '../ui';
import { Icon } from '../Icons';
import { cestaZKoduPodniku, cestaZQr } from '@/lib/nativni/most';
import { useT } from '@/lib/i18n/client';
import { useCesta } from './host/cesty';

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
  // V ukázce (/client/demo) zůstane i sken v ukázce.
  const vUkazce = useCesta();
  const { nativni, kamera, umi } = useUmiSkenovat(jeObal);
  const [kod, setKod] = useState('');
  const [chyba, setChyba] = useState('');
  const [hleda, setHleda] = useState(false);
  const [kameraZap, setKameraZap] = useState(false);
  const spusteno = useRef(false);

  // Otevřené okno má vlastní záznam v historii (lib/useModal: Zpět zavře okno). Kdyby se okno zavřelo
  // před navigací, jeho úklid by zavolal history.back() a navigaci zrušil. Proto se záznam okna NAHRADÍ
  // stránkou podniku (Zpět pak vede na seznam) a okno se zavře, až se adresa opravdu změní.
  const aktualni = usePathname();
  const [cil, setCil] = useState<string | null>(null);
  const otevri = useCallback((kamSkutecne: string) => {
    const kam = vUkazce(kamSkutecne);
    if (kam.split(/[?#]/)[0] === aktualni) { onClose(); setTimeout(() => router.replace(kam), 350); return; }
    setCil(kam);
    router.replace(kam);
  }, [aktualni, onClose, router, vUkazce]);
  useEffect(() => {
    if (!cil) return;
    if (aktualni === cil.split(/[?#]/)[0]) { setCil(null); onClose(); }
  }, [aktualni, cil, onClose]);

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
    <Modal open={open} onClose={onClose} size="sm" title={t('Najít podnik')} className="lgx-strong hp-sklo h-list-sklo h-plocha"
      subtitle={umi ? t('Naskenuj QR kód na stole nebo u pultu, nebo zadej kód podniku.') : t('Zadej kód podniku ze stojánku nebo letáku.')}>
      <div className="space-y-4">
        {umi && (
          <div className="space-y-3">
            {/* Jedna limetka na okno: když jde skenovat, je hlavní akcí sken a kód je druhá cesta (sklo). */}
            <button type="button" className="hp-btn hp-btn-limetka hp-btn-blok" onClick={() => void skenuj()} disabled={!nativni && !kamera}>
              <Icon name="camera" size={18} strokeWidth={1.7} aria-hidden />
              {kameraZap ? t('Zavřít kameru') : t('Naskenovat QR kód')}
            </button>
            {kameraZap && !nativni && (
              <KameraQr onCesta={otevri} onCizi={() => setChyba(t('Tohle není QR kód podniku z Managera. Zkus jiný, nebo zadej kód podniku.'))}
                onChyba={() => { setKameraZap(false); setChyba(t('Kamera není k dispozici. Zadej kód podniku.')); }} />
            )}
            {/* „nebo" jako tichý předěl mezi dvěma cestami, ne další štítek. */}
            <p className="hp-meta flex items-center gap-3 before:h-px before:flex-1 before:bg-[color:var(--hp-line)] after:h-px after:flex-1 after:bg-[color:var(--hp-line)]" aria-hidden>{t('nebo')}</p>
          </div>
        )}
        <form onSubmit={odeslat} className="space-y-3" noValidate>
          <div>
            <label htmlFor="kod-podniku" className="hp-pole-popis">{t('Kód podniku')}</label>
            <div className="hp-pole">
              <Icon name="search" size={18} strokeWidth={1.6} className="shrink-0 text-[color:var(--hp-muted)]" aria-hidden />
              <input id="kod-podniku" value={kod} onChange={e => { setKod(e.target.value); setChyba(''); }} placeholder="cafe-demo"
                aria-describedby="kod-podniku-napoveda" aria-invalid={chyba ? true : undefined}
                autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} inputMode="url" enterKeyHint="go" maxLength={300} data-transient />
            </div>
            <p id="kod-podniku-napoveda" className="hp-meta mt-2 px-0.5 text-pretty">{t('Najdeš ho pod QR kódem na stojánku nebo na letáku, třeba cafe-demo.')}</p>
          </div>
          <button type="submit" className={`hp-btn hp-btn-blok ${umi ? 'lgx hp-btn-sklo' : 'hp-btn-limetka'}`} disabled={hleda} aria-busy={hleda || undefined}>
            {hleda && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
            {t('Otevřít podnik')}
          </button>
        </form>
        {chyba && (
          <p role="alert" className="flex items-start gap-2.5 rounded-[14px] bg-[color:var(--hp-well)] px-4 py-3 text-[14px] leading-snug text-[color:var(--hp-fg)]">
            <Icon name="warning" size={17} strokeWidth={1.7} className="mt-0.5 shrink-0" aria-hidden />
            <span className="min-w-0">{chyba}</span>
          </p>
        )}
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
  return <video ref={ref} muted playsInline className="w-full aspect-square object-cover rounded-[22px] bg-[#16181A]" aria-label={t('Náhled kamery')} />;
}
