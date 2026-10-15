'use client';

// Volba způsobu počítání bodů (kolo 91): výchozí podniku v Nastavení bodů (VolbaRezimu)
// a přepsání u jedné položky v okně postupu nebo úkolu (VolbaRezimuPolozky). Pod volbou
// vždy věta, co to znamená v bodech — ať nikdo nemusí zkoušet, co „Za celek“ udělá.

import { useId } from 'react';
import { Segmented, Input, SwitchRow, Field } from '../ui';
import { useT } from '@/lib/i18n/client';
import { ucinnePravidlo, type DruhBodu, type PravidloRezimu, type PrepisRezimu, type Rezim } from '@/lib/bodyRezim';
import { nazevRezimu, vetaPravidla } from './veta';

const REZIMY: Rezim[] = ['kombinace', 'kroky', 'celek'];
const cele = (v: string, max = 100) => Math.max(0, Math.min(max, Number.parseInt(v.replace(/\D/g, ''), 10) || 0));

/** Výchozí pravidlo jednoho druhu (Nastavení bodů). */
export function VolbaRezimu({ druh, nazev, pravidlo, zaklad, onZmena }: {
  druh: DruhBodu; nazev: string; pravidlo: PravidloRezimu; zaklad: number; onZmena: (p: PravidloRezimu) => void;
}) {
  const t = useT('sprava');
  const uid = useId();
  const polozky = druh !== 'postupy';
  return (
    <div className="py-3 space-y-2.5" data-volba-rezimu={druh}>
      <p id={`${uid}-n`} className="text-sm font-semibold text-[#16181A]">{nazev}</p>
      <Segmented size="sm" ariaLabel={t('Způsob počítání: {co}', { co: nazev })} value={pravidlo.rezim}
        onChange={r => onZmena({ ...pravidlo, rezim: r })} options={REZIMY.map(r => ({ id: r, label: nazevRezimu(t, r) }))} />
      {pravidlo.rezim === 'kroky' && (
        <SwitchRow as="div" className="!py-1" title={t('Bonus za dokončení celku (+{z} b)', { z: zaklad })}
          checked={pravidlo.bonus} onChange={v => onZmena({ ...pravidlo, bonus: v })} />
      )}
      {polozky && pravidlo.rezim !== 'kombinace' && (
        <Field id={`${uid}-pol`} label={pravidlo.rezim === 'kroky'
          ? (druh === 'ukoly' ? t('Body za splněnou položku checklistu') : t('Body za splněnou povinnou věc'))
          : (druh === 'ukoly' ? t('Srážka za nesplněnou položku checklistu') : t('Srážka za nesplněnou povinnou věc'))}>
          <Input id={`${uid}-pol`} type="text" inputMode="numeric" className="!w-24 tabular-nums"
            value={String(pravidlo.rezim === 'kroky' ? pravidlo.zaPolozku : pravidlo.srazka)}
            onChange={e => onZmena(pravidlo.rezim === 'kroky' ? { ...pravidlo, zaPolozku: cele(e.target.value) } : { ...pravidlo, srazka: cele(e.target.value) })} />
        </Field>
      )}
      <p className="t-meta text-pretty" data-veta-rezimu>{vetaPravidla(t, druh, { ...pravidlo, zaklad })}</p>
    </div>
  );
}

/** Přepsání u jedné položky: „Podle podniku“ nebo vlastní způsob a vlastní body za celek. */
export function VolbaRezimuPolozky({ druh, prepis, vychozi, onZmena, smiZaklad = true }: {
  druh: 'postupy' | 'ukoly';
  prepis: PrepisRezimu | null;
  /** Výchozí podniku (z /api/body/vychozi); null = ještě se načítá. */
  vychozi: (PravidloRezimu & { zaklad: number }) | null;
  onZmena: (p: PrepisRezimu | null) => void;
  smiZaklad?: boolean;
}) {
  const t = useT('sprava');
  const uid = useId();
  const volba: Rezim | 'podnik' = prepis?.rezim ?? 'podnik';
  const nastav = (zmena: Partial<PrepisRezimu>) => {
    const dalsi: PrepisRezimu = { rezim: prepis?.rezim ?? null, bonus: prepis?.bonus ?? null, zaklad: prepis?.zaklad ?? null, ...zmena };
    onZmena(dalsi.rezim == null && dalsi.bonus == null && dalsi.zaklad == null ? null : dalsi);
  };
  const ucinne = vychozi ? ucinnePravidlo(vychozi, prepis, vychozi.zaklad) : null;
  const zakladPopis = druh === 'postupy' ? t('Body za celý postup') : t('Body za celý úkol');
  return (
    <div className="space-y-2.5" data-volba-rezimu-polozky={druh}>
      <Segmented size="sm" ariaLabel={t('Způsob počítání bodů')} value={volba}
        onChange={r => nastav(r === 'podnik' ? { rezim: null, bonus: null } : { rezim: r })}
        options={(['podnik', ...REZIMY] as const).map(r => ({ id: r, label: nazevRezimu(t, r) }))} />
      {ucinne?.rezim === 'kroky' && (
        <SwitchRow as="div" className="!py-1" title={t('Bonus za dokončení celku (+{z} b)', { z: ucinne.zaklad })}
          checked={ucinne.bonus} onChange={v => nastav({ bonus: v })} />
      )}
      {smiZaklad && (
        <Field id={`${uid}-z`} label={zakladPopis} hint={vychozi ? t('Prázdné = podle podniku ({z} b).', { z: vychozi.zaklad }) : undefined}>
          <Input id={`${uid}-z`} type="text" inputMode="numeric" className="!w-24 tabular-nums" placeholder={vychozi ? String(vychozi.zaklad) : ''}
            value={prepis?.zaklad == null ? '' : String(prepis.zaklad)}
            onChange={e => nastav({ zaklad: e.target.value.trim() === '' ? null : cele(e.target.value, 500) })} />
        </Field>
      )}
      {ucinne && <p className="t-meta text-pretty" data-veta-rezimu>{vetaPravidla(t, druh, ucinne)}</p>}
    </div>
  );
}
