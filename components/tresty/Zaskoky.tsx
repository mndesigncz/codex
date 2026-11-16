'use client';

// Přijatý záskok (kolo 96, docs/TRESTY-PENIZE.md): když vedení při trestu kolegy určilo, že stržená částka
// přejde mně (napravil/a jsem to), dostanu prémii `wage_adjustments` se `source = 'zaskok'` a poznámkou
// „Záskok: <text trestu>". Widget Moje tresty ji ukáže jako „+300 Kč · Za záskok: …" — bez cizích jmen
// a bez dalších podrobností o cizím trestu (poznámka nese jen text, nic víc o kolegovi neposíláme).
//
// Data: úpravy mzdy z GET /api/attendance (jako Můj výdělek). Zaměstnanec dostane vlastní úpravy za 70 dní
// na sdílené adrese Píchaček (`?days=1`); kdo vidí docházku i mzdy týmu, dostane úpravy všech za tolik dní,
// kolik řekne — vybírá se podle id přihlášeného. Bez finance.moje_mzda / finance.mzdy se nic neptá.

import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { ListRow } from '../ui';
import { useMoney } from '../CurrencyProvider';
import { useOpravneni } from '../role/useOpravneni';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import type { UpravaMzdy } from '@/lib/dochazkaPrehled';
import { prijateZaskoky, type PrijatyZaskok } from './logika';

const URL_VLASTNI = '/api/attendance?days=1';
const URL_TYM = '/api/attendance?days=62';

const vyberUpravy = (raw: unknown): UpravaMzdy[] => {
  const a = (raw as { adjustments?: unknown } | null)?.adjustments;
  return Array.isArray(a) ? a as UpravaMzdy[] : [];
};

/** Přijaté záskoky v měsíci („RRRR-MM"); prázdné bez oprávnění ke mzdě nebo v náhledu. */
export function usePrijateZaskoky(mesic: string, zapnuto = true): PrijatyZaskok[] {
  const { nacteno, ma } = useOpravneni();
  const { data } = useSession();
  const meId = Number((data?.user as { id?: unknown } | undefined)?.id);
  const smi = nacteno && ma(['finance.moje_mzda', 'finance.mzdy']);
  const tym = nacteno && ma('dochazka.zobrazit') && ma('finance.mzdy');
  const url = zapnuto && smi && meId > 0 ? (tym ? URL_TYM : URL_VLASTNI) : null;
  const d = useDataWidgetu<UpravaMzdy[]>(url, vyberUpravy);
  return useMemo(() => (d.data && meId > 0 ? prijateZaskoky(d.data, meId, mesic) : []), [d.data, meId, mesic]);
}

/** Řádky „Za záskok: <za co>" s částkou (do `ul.list`). */
export function ZaskokySeznam({ items, max = 5 }: { items: readonly PrijatyZaskok[]; max?: number }) {
  const t = useT('widgety');
  const { jazyk } = useJazyk();
  const money = useMoney();
  if (!items.length) return null;
  return (
    <div data-zaskoky>
      <p className="t-label mb-1">{t('Dostal(a) jsi za záskok')}</p>
      <ul className="list">
        {items.slice(0, max).map(z => (
          <ListRow key={z.id}
            title={<span className="block whitespace-normal text-pretty line-clamp-2 break-words">{z.zaCo ? t('Za opravu: {text}', { text: z.zaCo }) : t('Za záskok za kolegu')}</span>}
            meta={<><span className="cz-sentence inline-block">{fmtDatum(z.den, { jazyk, styl: 'denKratce' })}</span>{z.oprava ? <> · {t('oprava za uzavřené období')}</> : null}</>}
            value={<span className={z.castka > 0 ? 'text-ok-ink' : 'text-bad-ink'}>{z.castka > 0 ? `+${money(z.castka)}` : `−${money(Math.abs(z.castka))}`}</span>}
            valueMeta={t('k výplatě')} />
        ))}
      </ul>
    </div>
  );
}
