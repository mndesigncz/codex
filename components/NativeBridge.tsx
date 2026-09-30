'use client';

// Napojení na nativní obal: otevření aplikace přes universal link / app link,
// klepnutí na push oznámení a tichá obnova tokenu pushe. Mimo obal nedělá nic.

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { jeNativni, plugin, mistniCestaZOdkazu, stavNativnihoPushe, zapniNativniPush } from '@/lib/nativniMost';

export default function NativeBridge() {
  const { status } = useSession();

  // Odkazy a klepnutí na oznámení: plná navigace (BusinessPage čte ?tab=, ?table= z window.location).
  useEffect(() => {
    if (!jeNativni()) return;
    const otevri = (odkaz: unknown) => {
      const cesta = mistniCestaZOdkazu(odkaz);
      if (cesta) window.location.assign(cesta);
    };
    const uchyty: { remove?: () => void }[] = [];
    const app = plugin('App');
    const push = plugin('PushNotifications');
    try {
      app?.addListener?.('appUrlOpen', (e: { url?: string }) => otevri(e?.url))?.then?.((h: any) => uchyty.push(h));
      push?.addListener?.('pushNotificationActionPerformed', (e: any) => otevri(e?.notification?.data?.link))?.then?.((h: any) => uchyty.push(h));
    } catch { /* starší binárka bez pluginu */ }
    return () => { uchyty.forEach(h => { try { h.remove?.(); } catch { /* už odebráno */ } }); };
  }, []);

  // Povolení už udělené → token se tiše obnoví (mění se po přeinstalaci). Zeptat se poprvé
  // je věc vlastní obrazovky (Nastavení, souhlas hosta), ne startu aplikace.
  useEffect(() => {
    if (status !== 'authenticated' || !jeNativni()) return;
    let zruseno = false;
    (async () => {
      if ((await stavNativnihoPushe()) === 'granted' && !zruseno) await zapniNativniPush(false);
    })();
    return () => { zruseno = true; };
  }, [status]);

  return null;
}
