'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTheme } from './ThemeProvider';
import { jazykZarizeniVyslovny, useJazyk } from '@/lib/i18n/client';
import { jazykKUplatneni } from '@/lib/i18n/synchronizace';
import { cistyFormaty, nactiMezipametFormatu, nastavOsobniFormaty, ulozMezipametFormatu } from '@/lib/i18n/osobniFormaty';
import { jeCestaDema } from '@/lib/demo/cesta';
import { okJson } from '@/lib/api';

// Nic nevykresluje: po přihlášení (a při každé změně relace, třeba po session.update)
// přenese nastavení z účtu na tohle zařízení.
//
//  * jazyk (users.lang) a motiv (users.theme) se uplatní jen tehdy, když na zařízení
//    člověk výslovně nic nezvolil: cookie `managero-lang` chybí (nebo ji nastavilo
//    automatické zjištění jazyka), resp. v localStorage chybí `managero-theme`.
//    Výslovná volba na zařízení má přednost a zůstane;
//  * osobní formáty (čas, datum, týden, desetinný oddělovač) platí vždy z účtu a pro
//    rychlý start se drží i v localStorage zařízení (u konkrétního účtu).
//
// Běží až po hydrataci (useEffect), takže server a prohlížeč vykreslí první snímek stejně.
// Jazyk se mění přes setJazyk, který dotáhne slovníky pro všechny sekce jako při ručním
// přepnutí. Tablet (kiosk) se nesynchronizuje: jeho jazyk je věc zařízení (viz KioskApp).

export default function NastaveniSync() {
  const { data: session, status } = useSession();
  const { jazyk, setJazyk } = useJazyk();
  const { pouzijZUctu } = useTheme();
  const demo = jeCestaDema(usePathname());
  const jazykRef = useRef(jazyk);
  jazykRef.current = jazyk;

  const u = session?.user as { id?: string; role?: string; lang?: string } | undefined;
  const uid = u?.id ?? null;
  const role = u?.role ?? null;
  const lang = u?.lang ?? '';

  useEffect(() => {
    if (demo || status !== 'authenticated' || !uid || role === 'kiosk') return;
    // Rychlý start z mezipaměti zařízení (jen pro stejný účet).
    const zMezipameti = nactiMezipametFormatu(uid);
    if (zMezipameti) nastavOsobniFormaty(zMezipameti);

    let zruseno = false;
    fetch('/api/account').then(okJson).then(d => {
      const ucet = d?.user;
      if (zruseno || !ucet) return;
      // Jazyk z účtu jen tam, kde si ho člověk na zařízení výslovně nezvolil (pravidla: lib/i18n/synchronizace.ts).
      const j = jazykKUplatneni({ zUctu: ucet.lang, aktualni: jazykRef.current, vyslovnyNaZarizeni: jazykZarizeniVyslovny() });
      if (j) void setJazyk(j, { ulozit: false });
      pouzijZUctu(ucet.theme);
      const formaty = cistyFormaty(ucet.notifPrefs?.formaty);
      nastavOsobniFormaty(formaty);
      ulozMezipametFormatu(uid, formaty);
    }).catch(() => { /* bez sítě zůstane, co zařízení má */ });
    return () => { zruseno = true; };
    // `lang` je tu schválně: session.update() s novým jazykem spustí synchronizaci znovu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, status, uid, role, lang]);

  return null;
}
