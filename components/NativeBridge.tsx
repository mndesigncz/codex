'use client';

// Nativní most v obalu (apps/managero, apps/client): push, sken QR, sdílení, haptika,
// Face ID zámek, universal links, stavový řádek a splash. Vykresluje se JEN v obalu
// (načítá ho NativeBridgeLoader podle značky v User-Agentu), takže web ho nestahuje.
//
// Žádné `@capacitor/*` importy: pluginy jsou v obalu na `window.Capacitor.Plugins`
// (viz lib/nativni/most.ts). Když plugin chybí (starší binárka, simulátor), daná
// funkce se tiše vynechá, aplikace nespadne.

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from './ui';
import {
  cestaZOdkazu, cestaZQr, jeKioskCesta, jeNativni, nacti, platforma, plugin,
  uloz, zjistiObalUa, type KlicObalu, type NativniApi, type VysledekPushe,
} from '@/lib/nativni/most';
import { mistniCesta } from '@/lib/bezpecnaUrl';

// Jediný vlastník klíče tokenu a volby „push vypnut“ (ostatní kód volá window.manageroNative).
const KLIC_TOKENU = 'managero-push-token';
const KLIC_PUSH_VYPNUTO = 'managero-push-vypnuto';
const KLIC_ODLOZENO = 'managero-push-odlozeno';
const ODLOZENI_MS = 14 * 24 * 3600 * 1000; // „Teď ne“ se znovu neptá dva týdny
const ZAMEK_PO_MS = 60_000;                // zámek po minutě v pozadí

/** Registrace tokenu na serveru; selže tiše (endpoint může před nasazením serveru chybět). */
// Aplikaci (managero / client) určuje server podle role účtu, ne podle těla požadavku.
async function posliToken(token: string, verze: string | null) {
  try {
    const r = await fetch('/api/native/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: platforma(), version: verze }),
    });
    if (r.ok) uloz(KLIC_TOKENU, token);
  } catch { /* server ještě nezná endpoint nebo není síť: zkusí se při dalším startu */ }
}
const pushVypnuto = (): boolean => nacti(KLIC_PUSH_VYPNUTO) === '1';
async function smazToken() {
  const token = nacti(KLIC_TOKENU);
  if (!token) return;
  uloz(KLIC_TOKENU, null);
  try {
    await fetch('/api/native/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  } catch { /* tiše */ }
}

export default function NativeBridge() {
  const { status } = useSession();
  const cesta = usePathname();
  const kiosk = jeKioskCesta(cesta);
  const ua = useRef(zjistiObalUa(typeof navigator === 'undefined' ? '' : navigator.userAgent));
  const obal = ua.current.obal;
  const [nabidkaPush, setNabidkaPush] = useState(false);
  const [zamceno, setZamceno] = useState(false);
  const posluchaceHotovo = useRef(false);

  // ---------- Push ---------------------------------------------------------------------------
  const registruj = useCallback(async () => {
    const PN = plugin('PushNotifications');
    if (!PN || !obal) return false;
    if (!posluchaceHotovo.current) {
      posluchaceHotovo.current = true;
      PN.addListener('registration', (t: { value: string }) => {
        // Zavolal-li uživatel mezitím vypnutí, token se na server nedostane.
        if (!pushVypnuto()) void posliToken(t.value, ua.current.verze);
      });
      PN.addListener('registrationError', () => { /* bez push se dá žít */ });
      PN.addListener('pushNotificationReceived', (n: unknown) => window.dispatchEvent(new CustomEvent('managero:push-prijato', { detail: n })));
      PN.addListener('pushNotificationActionPerformed', (a: { notification?: { data?: { link?: string } } }) => {
        // Jen relativní cesta: odkaz z notifikace nesmí vést mimo aplikaci.
        const c = mistniCesta(a?.notification?.data?.link, '');
        if (c) window.location.assign(c);
      });
      if (platforma() === 'android') {
        try { await PN.createChannel({ id: 'default', name: 'Upozornění', importance: 4, visibility: 1 }); } catch { /* kanál už je */ }
      }
    }
    await PN.register();
    return true;
  }, [obal]);

  const zapniPush = useCallback(async (): Promise<VysledekPushe> => {
    const PN = plugin('PushNotifications');
    if (!PN) return 'nedostupny';
    try {
      let p = await PN.checkPermissions();
      if (p.receive === 'prompt' || p.receive === 'prompt-with-rationale') p = await PN.requestPermissions();
      if (p.receive === 'denied') return 'denied';
      if (p.receive !== 'granted') return 'prompt';
      uloz(KLIC_PUSH_VYPNUTO, null);
      return (await registruj()) ? 'granted' : 'chyba';
    } catch { return 'chyba'; }
  }, [registruj]);

  const vypniPush = useCallback(async () => {
    uloz(KLIC_PUSH_VYPNUTO, '1');
    await smazToken();
  }, []);

  useEffect(() => {
    if (!obal) return;
    // Po odhlášení už je relace pryč (DELETE by dostal 401); token maže odhlasitPush před signOut.
    if (status === 'unauthenticated') { uloz(KLIC_TOKENU, null); return; }
    if (status !== 'authenticated' || kiosk || pushVypnuto()) return;
    const PN = plugin('PushNotifications');
    if (!PN) return;
    let zrusene = false;
    (async () => {
      try {
        const p = await PN.checkPermissions();
        if (zrusene) return;
        if (p.receive === 'granted') { await registruj(); return; }
        if (p.receive === 'denied') return;
        // Systémový dialog se ukáže jen jednou, proto se nejdřív ptáme po svém (Apple to doporučuje):
        // vlastní vysvětlení, teprve po souhlasu systémová otázka.
        const odlozeno = Number(nacti(KLIC_ODLOZENO) ?? 0);
        if (Date.now() - odlozeno > ODLOZENI_MS) setTimeout(() => { if (!zrusene) setNabidkaPush(true); }, 6000);
      } catch { /* bez push */ }
    })();
    return () => { zrusene = true; };
  }, [obal, status, kiosk, registruj]);

  // ---------- Zámek Face ID / otisk (volitelný, vypnutý výchozí) -------------------------------
  const odemkni = useCallback(async () => {
    const BA = plugin('BiometricAuth');
    if (!BA) { setZamceno(false); return; }
    try {
      await BA.authenticate({
        reason: obal === 'client' ? 'Odemkni svou kartu a rezervace' : 'Odemkni data podniku',
        cancelTitle: 'Zrušit', allowDeviceCredential: true,
        androidTitle: 'Odemknout aplikaci', iosFallbackTitle: 'Zadat kód zařízení',
      });
      setZamceno(false);
    } catch { /* zrušeno: přehled zůstane zamčený, jde to zkusit znovu tlačítkem */ }
  }, [obal]);

  useEffect(() => {
    if (!obal || status !== 'authenticated' || kiosk) return;
    const PR = plugin('Preferences');
    const APP = plugin('App');
    if (!PR) return;
    let zrusene = false;
    let pozadiOd = 0;
    let slib: { remove: () => void } | null = null;
    (async () => {
      const { value } = await PR.get({ key: 'zamek' });
      if (zrusene) return;
      if (value === '1') { setZamceno(true); void odemkni(); }
      if (APP) {
        slib = await APP.addListener('appStateChange', async (s: { isActive: boolean }) => {
          if (!s.isActive) { pozadiOd = Date.now(); return; }
          const { value: v } = await PR.get({ key: 'zamek' });
          if (v === '1' && pozadiOd && Date.now() - pozadiOd > ZAMEK_PO_MS) { setZamceno(true); void odemkni(); }
        });
      }
    })().catch(() => {});
    return () => { zrusene = true; slib?.remove(); };
  }, [obal, status, kiosk, odemkni]);

  // ---------- Jednorázová příprava: API, přepisy prohlížečových funkcí, odkazy, vzhled ---------------
  useEffect(() => {
    if (!obal || !jeNativni()) return;
    document.documentElement.dataset.obal = obal;

    // Sdílení a haptika: stávající kód volá navigator.share a navigator.vibrate beze změn,
    // ve WebView ale nefungují spolehlivě, proto je přepíšeme nativními pluginy.
    const Share = plugin('Share');
    const Haptics = plugin('Haptics');
    const puvodniShare = (navigator as any).share;
    const puvodniVibrate = (navigator as any).vibrate;
    const sdilej: NativniApi['sdilej'] = async (d) => {
      if (!Share) return false;
      try { await Share.share({ title: d.title, text: d.text, url: d.url, dialogTitle: d.title }); return true; } catch { return false; }
    };
    const haptika: NativniApi['haptika'] = (druh = 'lehka') => {
      if (!Haptics) return;
      try {
        if (druh === 'uspech') void Haptics.notification({ type: 'SUCCESS' });
        else if (druh === 'chyba') void Haptics.notification({ type: 'ERROR' });
        else void Haptics.impact({ style: druh === 'stredni' ? 'MEDIUM' : 'LIGHT' });
      } catch { /* bez haptiky */ }
    };
    if (Share) (navigator as any).share = (d: ShareData) => sdilej(d).then(ok => { if (!ok) throw new DOMException('Sdílení zrušeno', 'AbortError'); });
    if (Haptics) (navigator as any).vibrate = () => { haptika('lehka'); return true; };

    const skenujQr: NativniApi['skenujQr'] = async () => {
      const BS = plugin('BarcodeScanner');
      if (!BS) return null;
      try {
        if (platforma() === 'android') {
          // Google Code Scanner běží přes Play Services a nepotřebuje oprávnění ke kameře.
          const { available } = await BS.isGoogleBarcodeScannerModuleAvailable();
          if (!available) await BS.installGoogleBarcodeScannerModule();
        } else {
          let p = await BS.checkPermissions();
          if (p.camera === 'prompt' || p.camera === 'prompt-with-rationale') p = await BS.requestPermissions();
          if (p.camera !== 'granted' && p.camera !== 'limited') return null;
        }
        const { barcodes } = await BS.scan({ formats: ['QR_CODE'] });
        return barcodes?.[0]?.rawValue ?? null;
      } catch { return null; }
    };
    const skenujAOtevri: NativniApi['skenujAOtevri'] = async () => {
      const text = await skenujQr();
      if (text == null) return true; // zrušeno uživatelem není chyba
      const c = cestaZQr(text);
      if (!c) return false;
      window.location.assign(c);
      return true;
    };

    const zamek: NativniApi['zamek'] = {
      dostupny: async () => {
        const BA = plugin('BiometricAuth');
        if (!BA) return false;
        try { return !!(await BA.checkBiometry()).isAvailable; } catch { return false; }
      },
      zapnuto: async () => {
        const PR = plugin('Preferences');
        try { return !!PR && (await PR.get({ key: 'zamek' })).value === '1'; } catch { return false; }
      },
      nastav: async (zap) => {
        const PR = plugin('Preferences');
        const BA = plugin('BiometricAuth');
        if (!PR) return false;
        // Zapnutí se nejdřív ověří: kdo nemá nastavený Face ID ani kód, nesmí se zamknout ven.
        if (zap) {
          try {
            if (!BA || !(await BA.checkBiometry()).isAvailable) return false;
            await BA.authenticate({ reason: 'Potvrď zapnutí zámku', allowDeviceCredential: true, cancelTitle: 'Zrušit' });
          } catch { return false; }
        }
        await PR.set({ key: 'zamek', value: zap ? '1' : '0' });
        return true;
      },
    };

    window.manageroNative = { obal, skenujQr, skenujAOtevri, sdilej, haptika, zapniPush, vypniPush, pushVypnuto, odhlasitPush: smazToken, zamek };
    window.dispatchEvent(new Event('managero:nativni-pripraveno'));

    // Universal links a App Links: stejný host → cesta v aplikaci, jiný host se ignoruje.
    const APP = plugin('App');
    const odebrat: Array<() => void> = [];
    (async () => {
      if (APP) {
        const a = await APP.addListener('appUrlOpen', (e: { url: string }) => {
          const c = cestaZOdkazu(e.url);
          if (c) window.location.assign(c);
        });
        odebrat.push(() => a.remove());
        // Android: zpětné gesto nejdřív vrací v historii (okna a listy se zavírají po svém), na kořeni aplikaci skryje.
        if (platforma() === 'android') {
          const b = await APP.addListener('backButton', (e: { canGoBack: boolean }) => {
            if (e.canGoBack || window.history.length > 1) window.history.back(); else void APP.minimizeApp?.();
          });
          odebrat.push(() => b.remove());
        }
      }
    })().catch(() => {});

    // Stavový řádek podle motivu; splash pryč, až je web vykreslený.
    const SB = plugin('StatusBar');
    const nastavRadek = () => {
      if (!SB) return;
      const tmavy = document.documentElement.getAttribute('data-theme') === 'dark';
      // Style.Dark = světlý text (pro tmavé pozadí), Style.Light = tmavý text.
      try { void SB.setStyle({ style: tmavy ? 'DARK' : 'LIGHT' }); } catch { /* starší binárka */ }
    };
    nastavRadek();
    const mo = new MutationObserver(nastavRadek);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const SS = plugin('SplashScreen');
    const schovejSplash = () => { try { void SS?.hide({ fadeOutDuration: 200 }); } catch { /* */ } };
    schovejSplash();

    return () => {
      mo.disconnect();
      odebrat.forEach(f => f());
      if (Share) (navigator as any).share = puvodniShare;
      if (Haptics) (navigator as any).vibrate = puvodniVibrate;
      delete window.manageroNative;
    };
  }, [obal, zapniPush, vypniPush]);

  if (!obal) return null;
  return (
    <>
      {nabidkaPush && !zamceno && (
        <div role="dialog" aria-label="Zapnout upozornění"
          className="fixed inset-x-0 z-[60] px-4 pointer-events-none"
          style={{ bottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
          <div className="pointer-events-auto mx-auto max-w-md rounded-[var(--r-card)] border border-[var(--surface-line)] bg-[var(--surface)] p-4 shadow-[shadow:var(--shadow-float)]">
            <p className="text-sm font-semibold">Zapnout upozornění?</p>
            <p className="mt-1 text-sm text-black/60">
              {obal === 'client'
                ? 'Dáme ti vědět o potvrzené rezervaci a stavu objednávky. Novinky a akce podniků posíláme jen s tvým výslovným souhlasem. Systém se zeptá ještě jednou.'
                : 'Dáme vědět o nové směně, zprávě a docházejícím zboží. Jednotlivé druhy jdou vypnout v Nastavení. Systém se zeptá ještě jednou.'}
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" size="sm" onClick={async () => { setNabidkaPush(false); await zapniPush(); }}>Zapnout</Button>
              <Button variant="ghost" size="sm" onClick={() => { uloz(KLIC_ODLOZENO, String(Date.now())); setNabidkaPush(false); }}>Teď ne</Button>
            </div>
          </div>
        </div>
      )}
      {zamceno && (
        // Zamykací obrazovka není okno (nevyjíždí zdola, nejde zavřít), zakrývá celou aplikaci.
        <div role="dialog" aria-modal="true" aria-label="Aplikace je zamčená"
          style={{ position: 'fixed', inset: 0, zIndex: 2147483000 }}
          className="flex flex-col items-center justify-center gap-4 bg-[var(--bg)] px-6 text-center">
          <p className="text-lg font-semibold">Aplikace je zamčená</p>
          <p className="max-w-xs text-sm text-black/60">Odemkni ji Face ID, otiskem nebo kódem zařízení.</p>
          <Button variant="accent" onClick={() => void odemkni()}>Odemknout</Button>
        </div>
      )}
    </>
  );
}
