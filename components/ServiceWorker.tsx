'use client';

// Registrace service workeru.
//
// Dřív ho registroval `PushManager` — ale až po přihlášení a jen tehdy, když
// je nastavený klíč pro notifikace. Bez klíče tedy nebyl worker žádný, takže
// aplikace neměla ani offline skořápku: po výpadku wifi a obnovení stránky
// se ukázala chybová stránka prohlížeče.
//
// Tohle registruje worker vždycky. Notifikace zůstávají věcí `PushManager`
// (ten si registraci najde) — dvě různé věci se nemají podmiňovat navzájem.

import { useEffect } from 'react';

export default function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Prohlížeč pustí workera jen v bezpečném kontextu; `localhost` sem
    // patří taky, takže se to dá vyzkoušet ve vývoji.
    if (!window.isSecureContext) return;

    // Až po načtení stránky. Registrace během startu soutěží o síť s tím,
    // co člověk doopravdy chce vidět.
    const spustit = () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* bez skořápky se dá žít */ }); };
    if (document.readyState === 'complete') spustit();
    else {
      window.addEventListener('load', spustit, { once: true });
      return () => window.removeEventListener('load', spustit);
    }
  }, []);

  return null;
}
