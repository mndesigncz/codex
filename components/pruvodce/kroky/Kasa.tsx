'use client';

import { Chip, Field, Input, Segmented, SwitchRow } from '@/components/ui';
import { useT } from '@/lib/i18n/client';
import { currencySymbol } from '@/lib/money';
import { TRIAL_DAYS } from '@/lib/plan';
import { POKLADNY, type Pokladna } from '@/lib/pruvodce/typy';
import type { KrokProps } from './spolecne';

// Kasa (jen když cíle obsahují uzávěrky): hotovost v kase na začátku a dva
// záměry, pokladna a tablet. Záměry se jen zapíšou do odpovědí, nic se
// neaktivuje — Storyous je v Nastavení → Pokladna (Max), tablet v nastavení
// tabletu (Pro); finále nabídne odkaz a věta o tarifu není nátlak.

export default function Kasa({ odp, zmen, info, chybaPole }: KrokProps) {
  const t = useT('pruvodce');
  const NAZEV_POKLADNY: Record<Pokladna, string> = { storyous: 'Storyous', jina: t('Jiná pokladna'), zadna: t('Žádná') };
  const mena = odp.mena ?? info.currency;
  const format = odp.formatCisel ?? info.locale;
  return (
    <div className="space-y-5">
      <Field id="pv-kasa" label={t('Hotovost v kase na začátku')} hint={t('Kolik necháváte v kase na drobné. Uzávěrka pak ukáže rozdíl proti očekávané hotovosti.')}
        error={chybaPole?.pole === 'kasa' ? chybaPole.text : undefined}>
        <div className="flex items-center gap-2">
          <Input id="pv-kasa" inputMode="numeric" autoComplete="off" enterKeyHint="next" placeholder="2000" className="max-w-[10rem]"
            value={odp.hotovostVKase ?? ''} onChange={e => {
              const cisla = e.target.value.replace(/\D/g, '').slice(0, 7);
              zmen({ hotovostVKase: cisla === '' ? undefined : Number(cisla) });
            }} />
          <span className="text-sm text-black/55">{currencySymbol(mena, format)}</span>
        </div>
      </Field>

      <div>
        <span className="field-label">{t('Pokladna')}</span>
        <Segmented ariaLabel={t('Pokladna')} size="sm" value={odp.pokladna ?? 'zadna'}
          options={POKLADNY.map(p => ({ id: p, label: NAZEV_POKLADNY[p] }))} onChange={(p: Pokladna) => zmen({ pokladna: p })} />
        {odp.pokladna === 'storyous' && (
          <p className="t-meta mt-2 flex flex-wrap items-center gap-2"><Chip tone="muted" size="sm">Max</Chip>{t('Napojení zapneš po dokončení v Nastavení → Pokladna.')}</p>
        )}
      </div>

      <ul className="list" aria-label={t('Tablet u baru')}>
        <SwitchRow title={t('Tablet u baru')} hint={t('Obsluha na něm píchá a odevzdává uzávěrku. Zapneš ho po dokončení v nastavení tabletu.')}
          checked={odp.tablet === true} onChange={v => zmen({ tablet: v })} />
      </ul>
      {odp.tablet === true && <p className="t-meta flex flex-wrap items-center gap-2"><Chip tone="muted" size="sm">Pro</Chip>{t('Tablet vyzkoušíš zdarma {n} dní.', { n: TRIAL_DAYS })}</p>}
    </div>
  );
}
