'use client';

// Odhlášení s úklidem: než se zahodí relace, odhlásí se token nativního pushe
// (přes window.manageroNative z components/NativeBridge, který token vlastní)
// tohoto zařízení. Po odhlášení by DELETE dostal 401 a token by zůstal u
// předchozího účtu, takže by další člověk na zařízení četl cizí oznámení.

import { signOut } from 'next-auth/react';
import { nativniMost } from './nativni/most';
import { smazUlozenouKartu } from './offlineKarta';

export async function odhlasit(volby: { callbackUrl?: string } = {}): Promise<void> {
  // Offline kartička hosta patří k účtu: další člověk na zařízení ji nesmí vidět.
  smazUlozenouKartu();
  try { await (await nativniMost(1500))?.odhlasitPush(); } catch { /* odhlášení nesmí záviset na pushi */ }
  await signOut(volby);
}
