'use client';

// Odhlášení s úklidem: než se zahodí relace, odhlásí se token nativního pushe
// tohoto zařízení. Po odhlášení by DELETE dostal 401 a token by zůstal u
// předchozího účtu, takže by další člověk na zařízení četl cizí oznámení.

import { signOut } from 'next-auth/react';
import { vypniNativniPush } from './nativniMost';

export async function odhlasit(volby: { callbackUrl?: string } = {}): Promise<void> {
  try { await vypniNativniPush(); } catch { /* odhlášení nesmí záviset na pushi */ }
  await signOut(volby);
}
