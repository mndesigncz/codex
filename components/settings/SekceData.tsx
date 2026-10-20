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
      <section className="card p-5 sloupec sloupec-6" aria-labelledby="nast-export-t">
        <div>
          <h2 id="nast-export-t" className="t-card">{t('Stáhnout moje data')}</h2>
          <p className="t-meta mt-1">
            {t('Soubor JSON s tvým profilem, nastavením, směnami, docházkou, žádostmi o volno, dostupností a tvými zprávami z chatu. Zprávy ostatních a data podniku v něm nejsou.')}
          </p>
        </div>
        {/* v4 (P2, V5): jediná akce karty přes celou šířku — ne osamělé tlačítko vlevo.
            Stavový řádek je prázdný schovaný jen vizuálně (aria-live musí zůstat v DOM). */}
        <Button variant="secondary" icon="download" className="w-full" loading={bezi} onClick={stahnout}>{t('Stáhnout data')}</Button>
        <p role="status" aria-live="polite" className="t-meta -mt-3 empty:sr-only">
          {vysledek === 'stazeno' ? t('Soubor je stažený.') : vysledek === 'sdileno' ? t('Soubor je připravený ke sdílení.') : ''}
        </p>
        {vysledek === 'nejde' && <p role="alert" className="note note-danger -mt-3">{t('Data se nepodařilo stáhnout. Zkus to za chvíli znovu.')}</p>}
      </section>

      <SmazatUcet jeHost={false} />
    </div>
  );
}
