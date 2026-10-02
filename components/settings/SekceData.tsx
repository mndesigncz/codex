'use client';

import { useState } from 'react';
import { Button } from '../ui';
import { useT } from '@/lib/i18n/client';
import { ulozZAdresy } from '@/lib/stahni';
import SmazatUcet from '../ucet/SmazatUcet';

// Nastavení → Data a soukromí: stažení vlastních dat a smazání účtu.
// Export (app/api/account/export) obsahuje jen data přihlášeného: profil, nastavení, jeho
// směny, docházku, žádosti o volno, dostupnost a zprávy, které sám napsal.

export default function SekceData() {
  const t = useT('spolecne');
  const [bezi, setBezi] = useState(false);
  const [vysledek, setVysledek] = useState<'' | 'stazeno' | 'sdileno' | 'nejde'>('');

  const stahnout = async () => {
    setBezi(true); setVysledek('');
    try {
      setVysledek(await ulozZAdresy('/api/account/export', 'managero-moje-data.json'));
    } finally {
      setBezi(false);
    }
  };

  return (
    <div>
      <section className="card p-6 space-y-4" aria-labelledby="nast-export-t">
        <div>
          <h2 id="nast-export-t" className="t-card">{t('Stáhnout moje data')}</h2>
          <p className="t-meta mt-1">
            {t('Soubor JSON s tvým profilem, nastavením, směnami, docházkou, žádostmi o volno, dostupností a tvými zprávami z chatu. Zprávy ostatních a data podniku v něm nejsou.')}
          </p>
        </div>
        <div>
          <Button variant="secondary" icon="download" loading={bezi} onClick={stahnout}>{t('Stáhnout data')}</Button>
        </div>
        <p role="status" aria-live="polite" className="t-meta min-h-[1.25rem]">
          {vysledek === 'stazeno' ? t('Soubor je stažený.') : vysledek === 'sdileno' ? t('Soubor je připravený ke sdílení.') : ''}
        </p>
        {vysledek === 'nejde' && <p role="alert" className="note note-danger">{t('Data se nepodařilo stáhnout. Zkus to za chvíli znovu.')}</p>}
      </section>

      <SmazatUcet jeHost={false} />
    </div>
  );
}
