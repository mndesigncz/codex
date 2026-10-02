'use client';

import { useState, useSyncExternalStore } from 'react';
import { useSession } from 'next-auth/react';
import { Field, Select } from '../ui';
import JazykKarta from '../JazykKarta';
import { useCurrency } from '../CurrencyProvider';
import { useT, useJazyk } from '@/lib/i18n/client';
import { fmtDatum, fmtHM } from '@/lib/i18n/format';
import {
  cistyFormaty, nastavOsobniFormaty, osobniFormaty, posluchejFormaty, prepisDesetinny,
  ulozMezipametFormatu, VYCHOZI_FORMATY, type OsobniFormaty,
} from '@/lib/i18n/osobniFormaty';
import { ulozPrefsUctu } from './ulozPrefs';

// Nastavení → Jazyk a region: jazyk aplikace a osobní formáty (čas, datum, začátek týdne,
// desetinný oddělovač). „Podle podniku / podle jazyka" je výchozí; volba tady přebíjí
// podnik jen pro tohoto člověka a platí na všech jeho zařízeních (users.notif_prefs.formaty).
// Čtou se na JEDNOM místě (lib/i18n/format, lib/pragueTime, CurrencyProvider), ne po komponentách.

export default function SekceJazyk() {
  const t = useT('spolecne');
  const { jazyk } = useJazyk();
  const { data: session } = useSession();
  const uid = (session?.user as { id?: string } | undefined)?.id ?? null;
  const { locale } = useCurrency();
  const formaty = useSyncExternalStore(posluchejFormaty, osobniFormaty, () => VYCHOZI_FORMATY);
  const [chyba, setChyba] = useState('');
  const [ulozeno, setUlozeno] = useState(false);
  const [uklada, setUklada] = useState(false);

  const zmen = async (klic: keyof OsobniFormaty, hodnota: string) => {
    const predtim = formaty;
    const nove = cistyFormaty({ ...formaty, [klic]: hodnota });
    nastavOsobniFormaty(nove); // projeví se hned
    setChyba(''); setUlozeno(false); setUklada(true);
    try {
      await ulozPrefsUctu({ formaty: nove });
      if (uid) ulozMezipametFormatu(uid, nove);
      setUlozeno(true);
    } catch {
      nastavOsobniFormaty(predtim);
      setChyba(t('Formáty se nepodařilo uložit. Zkus to znovu.'));
    } finally {
      setUklada(false);
    }
  };

  const ukazka = {
    cas: fmtHM('14:30'),
    datum: fmtDatum('2026-02-11', { jazyk, styl: 'cislo' }),
    cislo: prepisDesetinny(new Intl.NumberFormat(locale).format(1234.5), locale, formaty.desetinny),
  };

  return (
    <div className="space-y-6">
      <section className="card p-6 space-y-4" aria-labelledby="nast-jazyk-t">
        <div>
          <h2 id="nast-jazyk-t" className="t-card">{t('Jazyk aplikace')}</h2>
          <p className="t-meta mt-1">{t('Platí na všech tvých zařízeních. Na zařízení, kde je jazyk zvolený ručně, zůstane tahle volba.')}</p>
        </div>
        <JazykKarta />
      </section>

      <section className="card p-6 space-y-4" aria-labelledby="nast-formaty-t">
        <div>
          <h2 id="nast-formaty-t" className="t-card">{t('Osobní formáty')}</h2>
          <p className="t-meta mt-1">{t('Čas, datum, týden a čísla podle tebe. Výchozí je nastavení podniku a jazyka; tady ho přepíšeš jen pro sebe.')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="nast-f-cas" label={t('Formát času')}>
            <Select id="nast-f-cas" value={formaty.cas} onChange={e => zmen('cas', e.target.value)}>
              <option value="auto">{t('Podle podniku')}</option>
              <option value="24">{t('24 hodin (14:30)')}</option>
              <option value="12">{t('12 hodin (2:30 PM)')}</option>
            </Select>
          </Field>
          <Field id="nast-f-datum" label={t('Formát data')}>
            <Select id="nast-f-datum" value={formaty.datum} onChange={e => zmen('datum', e.target.value)}>
              <option value="auto">{t('Podle jazyka')}</option>
              <option value="dmy">{t('Den, měsíc, rok (11. 2. 2026)')}</option>
              <option value="mdy">{t('Měsíc, den, rok (2/11/2026)')}</option>
              <option value="ymd">{t('Rok, měsíc, den (2026-02-11)')}</option>
            </Select>
          </Field>
          <Field id="nast-f-tyden" label={t('Začátek týdne')}>
            <Select id="nast-f-tyden" value={formaty.tyden} onChange={e => zmen('tyden', e.target.value)}>
              <option value="auto">{t('Podle podniku')}</option>
              <option value="1">{t('Pondělí')}</option>
              <option value="0">{t('Neděle')}</option>
            </Select>
          </Field>
          <Field id="nast-f-des" label={t('Desetinný oddělovač')}>
            <Select id="nast-f-des" value={formaty.desetinny} onChange={e => zmen('desetinny', e.target.value)}>
              <option value="auto">{t('Podle jazyka')}</option>
              <option value=",">{t('Čárka (1 234,5)')}</option>
              <option value=".">{t('Tečka (1 234.5)')}</option>
            </Select>
          </Field>
        </div>
        <p className="well p-3 text-sm tabular-nums" aria-live="polite">
          {t('Ukázka: {cas} · {datum} · {cislo}', ukazka)}
        </p>
        {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
        <p role="status" aria-live="polite" className="t-meta min-h-[1.25rem]">{uklada ? t('Ukládám…') : ulozeno ? t('Formáty jsou uložené.') : ''}</p>
      </section>
    </div>
  );
}
