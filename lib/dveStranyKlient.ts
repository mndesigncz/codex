'use client';

// Dvě strany jednoho účtu v prohlížeči (serverová část v lib/dveStrany a
// app/api/strana). Tři věci: kam jít hned po přihlášení, přechod na druhou
// stranu bez nového hesla a hook pro přepínač v menu. V nativním obalu se
// strany nepřepínají (každá aplikace má jen svou), hook tam vrací null.

import { useCallback, useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useObal } from '@/components/ObalProvider';
import type { Strana } from './dveStrany';

interface StavStran { strana: Strana; druha: Strana | null; zapamatovana: Strana | null }

async function nactiStrany(): Promise<StavStran | null> {
  try {
    const r = await fetch('/api/strana', { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function zapamatuj(strana: Strana): Promise<void> {
  await fetch('/api/strana', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strana }) }).catch(() => {});
}

/**
 * Kam po úspěšném přihlášení. Kdo má obě strany a ještě si nevybral, jde na
 * volbu „Kam jdeš“ (/kam). Konkrétní cíl z odkazu (`explicitni`) má přednost.
 * Jinak se zapamatuje strana, na kterou se právě přihlásil.
 */
export async function kamPoPrihlaseni(vychozi: string, explicitni: boolean): Promise<string> {
  const s = await nactiStrany();
  if (!s) return vychozi;
  if (s.druha && !s.zapamatovana && !explicitni) return '/kam';
  if (s.zapamatovana !== s.strana) await zapamatuj(s.strana);
  return vychozi;
}

/**
 * Přejde na stranu (zapamatuje ji, u druhé strany vymění relaci přes lístek)
 * a načte její úvod celý znovu: layouty se skládají na serveru podle role.
 * Vrací text chyby (k přeložení), když se to nepovede.
 */
export async function prejdiNaStranu(strana: Strana): Promise<string | null> {
  let d: any = {};
  try {
    const r = await fetch('/api/strana', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strana }) });
    d = await r.json().catch(() => ({}));
    if (!r.ok) return d.error ?? 'Přepnutí se nepovedlo.';
  } catch {
    return 'Přepnutí se nepovedlo.';
  }
  if (d.listek) {
    const s = await signIn('prepnout-stranu', { listek: d.listek, redirect: false });
    if (!s?.ok || s.error) return 'Přepnutí se nepovedlo.';
  }
  window.location.assign(d.cil ?? '/');
  return null;
}

/**
 * Druhá strana přihlášeného účtu pro přepínač v menu; `druha` null = přepínač se
 * neukazuje. `chyba` je nepřeložená věta pro toast, `zrusChybu` ho zavře.
 */
export function useDruhaStrana() {
  const { jeObal } = useObal();
  const [druha, setDruha] = useState<Strana | null>(null);
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  useEffect(() => {
    if (jeObal) return;
    let zivy = true;
    nactiStrany().then(s => { if (zivy) setDruha(s?.druha ?? null); });
    return () => { zivy = false; };
  }, [jeObal]);
  const prepnout = useCallback(async () => {
    if (!druha || busy) return;
    setBusy(true); setChyba(null);
    const e = await prejdiNaStranu(druha);
    if (e) { setChyba(e); setBusy(false); }
  }, [druha, busy]);
  const zrusChybu = useCallback(() => setChyba(null), []);
  return { druha: jeObal ? null : druha, prepnout, busy, chyba, zrusChybu };
}
