'use client';

// Po nasazení se musí spustit migrace databáze.
//
// Dřív to obstarávalo veřejné /api/init, jenže endpoint spouští dvě stě
// příkazů DDL a kdokoli ho mohl volat ve smyčce. Teď je zamčený a cron ho
// smí budit jen jednou denně (víc Hobby plán Vercelu nedovolí) — čekat na
// něj po nasazení by znamenalo až den s chybějícími sloupci.
//
// Tohle to zavře: když vedení otevře aplikaci a běží na jiné verzi, než na
// jaké se naposledy migrovalo, jednou se sáhne na /api/init. Verze se drží
// v prohlížeči, takže je to jedno zavolání na nasazení a prohlížeč, ne na
// každé načtení stránky.

import { useEffect } from 'react';

const KEY = 'managero-migrated-commit';

export default function MigrationOnLoad() {
  useEffect(() => {
    const commit = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'dev';
    let seen: string | null = null;
    try { seen = localStorage.getItem(KEY); } catch { /* soukromé okno */ }
    if (seen === commit) return;
    fetch('/api/init')
      .then(r => r.json())
      .then(d => {
        // Uloží se jen po skutečně proběhlé migraci; jinak by se při chybě
        // už nikdy nezkusila znovu.
        if (d?.migrated) { try { localStorage.setItem(KEY, commit); } catch { /* nevadí */ } }
      })
      .catch(() => { /* zkusí se při příštím otevření */ });
  }, []);
  return null;
}
