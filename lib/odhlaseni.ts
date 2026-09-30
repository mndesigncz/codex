'use client';

// Odhlášení s úklidem: než se zahodí relace, odhlásí se token nativního pushe
// (přes window.manageroNative z components/NativeBridge, který token vlastní)
// tohoto zařízení. Po odhlášení by DELETE dostal 401 a token by zůstal u
// předchozího účtu, takže by další člověk na zařízení četl cizí oznámení.

import { signOut } from 'next-auth/react';
import { nativniMost } from './nativni/most';

export async function odhlasit(volby: { callbackUrl?: string } = {}): Promise<void> {
  try { await (await nativniMost(1500))?.odhlasitPush(); } catch { /* odhlášení nesmí záviset na pushi */ }
  await signOut(volby);
}
