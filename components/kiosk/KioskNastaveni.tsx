'use client';

import { useEffect, useState } from 'react';
import { Modal, Segmented } from '../ui';
import JazykKarta from '../JazykKarta';
import { useTheme, type VolbaMotivu } from '../ThemeProvider';
import { useT } from '@/lib/i18n/client';
import { nactiVzhled, ulozVzhled, VYCHOZI_VZHLED, type Vzhled } from '@/lib/vzhled';

// Nastavení tabletu (nenápadné tlačítko v hlavičce kiosku): jazyk, motiv a velikost písma.
//
// Platí jen pro TENHLE tablet a ukládá se v cookie a localStorage zařízení, ne na účet
// kiosku: stejný účet může běžet na dvou tabletech, každý v jiném jazyce, a obsluha nesmí
// přepsat nastavení ostatním. Proto jazyk jde přes `jenZarizeni` a motiv přes `naUcet: false`.
// Tablet je sdílený, takže nastavení drží i po odhlášení obsluhy.

export default function KioskNastaveni({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT('kiosk');
  const { volba, setTheme } = useTheme();
  const [vzhled, setVzhled] = useState<Vzhled>(VYCHOZI_VZHLED);
  useEffect(() => { if (open) setVzhled(nactiVzhled()); }, [open]);
  const zmenPismo = (pismo: Vzhled['pismo']) => { const n = { ...vzhled, pismo }; setVzhled(n); ulozVzhled(n); };

  return (
    <Modal open={open} onClose={onClose} size="sm" title={t('Nastavení tabletu')} subtitle={t('Platí jen na tomhle tabletu.')}>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="field-label !mb-0">{t('Jazyk tabletu')}</p>
          <JazykKarta jenZarizeni />
        </div>
        <div className="space-y-2">
          <p className="field-label !mb-0">{t('Motiv')}</p>
          <Segmented ariaLabel={t('Motiv')} value={volba} onChange={(id: VolbaMotivu) => setTheme(id, { naUcet: false })}
            options={[{ id: 'light', label: t('Světlý') }, { id: 'dark', label: t('Tmavý') }, { id: 'system', label: t('Podle systému') }]} />
        </div>
        <div className="space-y-2">
          <p className="field-label !mb-0">{t('Velikost písma')}</p>
          <Segmented ariaLabel={t('Velikost písma')} value={vzhled.pismo} onChange={zmenPismo}
            options={[{ id: 'normalni', label: t('Normální') }, { id: 'vetsi', label: t('Větší') }, { id: 'nejvetsi', label: t('Největší') }]} />
        </div>
      </div>
    </Modal>
  );
}
