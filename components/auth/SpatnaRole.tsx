'use client';

// Účet hosta, který se dostal do aplikace pro podniky (nebo naopak). Nemá kam
// přesměrovat: brána obalu by ho poslala zpátky a vznikla by smyčka. Místo toho
// se řekne, kam ten účet patří, a nabídne se odhlášení.

import { Button } from '../ui/Button';
import { odhlasit } from '@/lib/odhlaseni';
import { useT } from '@/lib/i18n/client';

export default function SpatnaRole({ zprava }: { zprava: string }) {
  const t = useT('spolecne');
  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
      <div className="card p-6 max-w-md w-full text-center">
        <h1 className="t-page text-balance">{t('Tenhle účet sem nepatří')}</h1>
        <p className="t-meta mt-3 text-pretty">{zprava}</p>
        <div className="mt-6 flex justify-center">
          <Button variant="primary" icon="logout" onClick={() => odhlasit({ callbackUrl: '/login' })}>{t('Odhlásit se')}</Button>
        </div>
      </div>
    </main>
  );
}
