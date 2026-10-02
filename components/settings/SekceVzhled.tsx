'use client';

import { useEffect, useState } from 'react';
import { Segmented, SwitchRow, Button, hintsEnabled, setHintsEnabled, resetHints, dismissedCount } from '../ui';
import { useTheme, type VolbaMotivu } from '../ThemeProvider';
import { useT } from '@/lib/i18n/client';
import { nactiVzhled, ulozVzhled, VYCHOZI_VZHLED, type Vzhled } from '@/lib/vzhled';

// Nastavení → Vzhled: motiv (světlý / tmavý / podle systému), hustota, velikost písma,
// omezení pohybu a vysoký kontrast, nápovědy. Motiv se ukládá na účet a převezmou ho
// zařízení, kde ho člověk ještě nezvolil; zbytek patří jen tomuhle zařízení (lib/vzhled.ts).

export default function SekceVzhled() {
  const t = useT('spolecne');
  const { volba, setTheme } = useTheme();
  // Uložený vzhled zařízení se čte až v prohlížeči (server localStorage nezná).
  const [vzhled, setVzhled] = useState<Vzhled>(VYCHOZI_VZHLED);
  useEffect(() => { setVzhled(nactiVzhled()); }, []);
  const zmen = (cast: Partial<Vzhled>) => { const n = { ...vzhled, ...cast }; setVzhled(n); ulozVzhled(n); };

  const [hintsOn, setHintsOn] = useState(true);
  const [hintsHidden, setHintsHidden] = useState(0);
  useEffect(() => { setHintsOn(hintsEnabled()); setHintsHidden(dismissedCount()); }, []);

  return (
    <div className="space-y-6">
      <section className="card p-6 space-y-4" aria-labelledby="nast-motiv-t">
        <div>
          <h2 id="nast-motiv-t" className="t-card">{t('Motiv')}</h2>
          <p className="t-meta mt-1">{t('Světlý, tmavý, nebo podle zařízení. Motiv se ukládá k účtu; zařízení bez vlastní volby ho převezme při přihlášení.')}</p>
        </div>
        <Segmented ariaLabel={t('Motiv aplikace')} value={volba} onChange={(id: VolbaMotivu) => setTheme(id)}
          options={[
            { id: 'light', label: t('Světlý'), icon: 'sun' },
            { id: 'dark', label: t('Tmavý'), icon: 'moon' },
            { id: 'system', label: t('Podle systému'), icon: 'settings' },
          ]} />
      </section>

      <section className="card p-6 space-y-4" aria-labelledby="nast-zobrazeni-t">
        <div>
          <h2 id="nast-zobrazeni-t" className="t-card">{t('Zobrazení na tomhle zařízení')}</h2>
          <p className="t-meta mt-1">{t('Tahle nastavení platí jen tady; telefon a tablet si je drží každý zvlášť.')}</p>
        </div>
        <div className="space-y-2">
          <p className="field-label !mb-0">{t('Hustota')}</p>
          <Segmented ariaLabel={t('Hustota')} value={vzhled.hustota} onChange={id => zmen({ hustota: id })}
            options={[{ id: 'pohodlna', label: t('Pohodlná') }, { id: 'kompaktni', label: t('Kompaktní') }]} />
        </div>
        <div className="space-y-2">
          <p className="field-label !mb-0">{t('Velikost písma')}</p>
          <Segmented ariaLabel={t('Velikost písma')} value={vzhled.pismo} onChange={id => zmen({ pismo: id })}
            options={[{ id: 'normalni', label: t('Normální') }, { id: 'vetsi', label: t('Větší') }, { id: 'nejvetsi', label: t('Největší') }]} />
        </div>
        <ul className="list">
          <SwitchRow title={t('Omezit pohyb')} hint={t('Bez animací a přejezdů. Platí i tehdy, když systém omezení pohybu nehlásí.')}
            checked={vzhled.pohyb} onChange={v => zmen({ pohyb: v })} />
          <SwitchRow title={t('Vysoký kontrast')} hint={t('Výraznější okraje karet. Platí i tehdy, když systém vysoký kontrast nehlásí.')}
            checked={vzhled.kontrast} onChange={v => zmen({ kontrast: v })} />
        </ul>
      </section>

      {/* Nápovědy: zapnuto/vypnuto je přepínač, ne dvě limetkové volby. */}
      <section className="card p-6 space-y-4" aria-labelledby="nast-napovedy-t">
        <h2 id="nast-napovedy-t" className="t-card">{t('Nápovědy')}</h2>
        <ul className="list">
          <SwitchRow title={t('Zobrazovat nápovědy')}
            hint={t('Krátké rady u obrazovek. Jednotlivou radu zavřeš křížkem a už se neukáže — tady je můžeš všechny vrátit nebo vypnout úplně.')}
            checked={hintsOn} onChange={v => { setHintsEnabled(v); setHintsOn(v); }} />
        </ul>
        {hintsHidden > 0 && (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="t-meta">
              {t('Zavřených rad: {n}', { n: hintsHidden })}
            </p>
            <Button variant="secondary" size="sm" icon="refresh"
              onClick={() => { resetHints(); setHintsHidden(0); setHintsOn(true); }}>
              {t('Zobrazit znovu všechny')}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
