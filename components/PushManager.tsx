'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { pushVypnutoNaZarizeni, vypniPushProhlizece, zapniPushProhlizece } from '@/lib/pushProhlizec';

// Registers the service worker and subscribes the logged-in user to web push.
// Kdo si na tomhle zařízení upozornění vypnul (Nastavení → Notifikace), odběr nedostane
// zpátky při každém otevření: značka zařízení ho místo zakládání ruší.
export default function PushManager() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'authenticated') return;
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    // Vypnuto výslovně: odběr se nezakládá a ten, co tu ještě je, se zruší.
    if (pushVypnutoNaZarizeni()) { void vypniPushProhlizece(); return; }
    void zapniPushProhlizece(vapid);
  }, [status]);

  return null;
}
