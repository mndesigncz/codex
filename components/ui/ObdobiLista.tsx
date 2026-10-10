'use client';

import React, { useState } from 'react';
import { Button } from './Button';
import { Segmented } from './Segmented';
import { Field, Input } from './Field';
import { aktualniJazyk } from '@/lib/i18n/stav';
import { useT } from '@/lib/i18n/client';
import {
  PRACOVNI_DNY, RYCHLE_VOLBY, VIKEND, obdobiZPresetu, platneRozmezi, pocetDni,
  type Hrubost, type IdObdobi, type Obdobi, type PresetObdobi,
} from '@/lib/obdobi';
import { pragueToday } from '@/lib/pragueTime';

// Lišta období: rychlé volby (Dnes · 7 dní · 30 dní · Měsíc · 3 měsíce · 6 měsíců · Rok · Vlastní), pod „Filtry"
// dny v týdnu, hrubost grafu a u vlastního rozmezí datum od–do. Jedna pro Finance, Uzávěrky, Docházku i widgety —
// dřív měl každý widget svoje tři přednastavené volby a nešlo zvolit „od–do", jen pondělky nebo půl roku.

const SHODNE = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export function ObdobiLista({ value, onChange, volby, dnyTydne = true, hrubost = true, className = '' }: {
  value: Obdobi;
  onChange: (o: Obdobi) => void;
  /** Které rychlé volby ukázat (výchozí všechny). */
  volby?: readonly PresetObdobi[];
  /** Nabídnout výběr dnů v týdnu. */
  dnyTydne?: boolean;
  /** Nabídnout hrubost grafu (den / týden / měsíc). */
  hrubost?: boolean;
  className?: string;
}) {
  const t = useT('widgety');
  const loc = aktualniJazyk();
  const [otevreno, setOtevreno] = useState(false);
  const dnes = pragueToday();
  const r = platneRozmezi(value, dnes);
  const ukazat = RYCHLE_VOLBY.filter(v => !volby || volby.includes(v.id));
  const jmenoDne = (i: number) => new Date(`2024-01-0${i + 1}T12:00:00`).toLocaleDateString(loc, { weekday: 'short' });
  const datum = (d: string, rok = false) => new Date(`${d}T12:00:00`).toLocaleDateString(loc, { day: 'numeric', month: 'numeric', ...(rok ? { year: 'numeric' } : {}) });
  const nFiltru = (value.dnyTydne.length > 0 ? 1 : 0) + (value.hrubost !== 'auto' ? 1 : 0);
  const popisky: Record<string, string> = {
    'Dnes': t('Dnes'), '7 dní': t('7 dní'), '30 dní': t('30 dní'), 'Měsíc': t('Měsíc'), '3 měsíce': t('3 měsíce'), '6 měsíců': t('6 měsíců'), 'Rok': t('Rok'),
  };

  const zvolPreset = (id: IdObdobi) => {
    if (id === 'vlastni') { onChange({ ...value, preset: 'vlastni', od: r.od, do: r.do }); setOtevreno(true); return; }
    onChange({ ...obdobiZPresetu(id, dnes), dnyTydne: value.dnyTydne, hrubost: value.hrubost });
  };
  const prepniDen = (i: number) => {
    const dalsi = value.dnyTydne.length === 0 ? [0, 1, 2, 3, 4, 5, 6].filter(x => x !== i) : value.dnyTydne.includes(i) ? value.dnyTydne.filter(x => x !== i) : [...value.dnyTydne, i].sort();
    onChange({ ...value, dnyTydne: dalsi.length === 7 || dalsi.length === 0 ? [] : dalsi });
  };
  const jeDenZapnuty = (i: number) => value.dnyTydne.length === 0 || value.dnyTydne.includes(i);

  return (
    <div className={`space-y-2 ${className}`} role="group" aria-label={t('Období')}>
      <div className="flex items-center gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <Segmented size="sm" ariaLabel={t('Rychlá volba období')} value={value.preset === 'minuly_mesic' || value.preset === 'vcera' || value.preset === 'tyden' ? 'vlastni' : value.preset}
            onChange={zvolPreset}
            options={[...ukazat.map(v => ({ id: v.id as IdObdobi, label: popisky[v.popisek] ?? v.popisek })), { id: 'vlastni' as IdObdobi, label: t('Vlastní') }]} />
        </div>
        {(dnyTydne || hrubost) && (
          <Button variant="secondary" size="sm" aria-expanded={otevreno} onClick={() => setOtevreno(o => !o)} className="shrink-0">
            {t('Filtry')}{nFiltru > 0 ? ` · ${nFiltru}` : ''}
          </Button>
        )}
      </div>
      <p className="t-meta tabular-nums" aria-live="polite">
        {r.od === r.do ? datum(r.od, true) : `${datum(r.od)} – ${datum(r.do, true)}`} · {t('{n, plural, one {# den} few {# dny} other {# dní}}', { n: pocetDni(r.od, r.do) })}
        {value.dnyTydne.length > 0 && <> · {value.dnyTydne.map(jmenoDne).join(', ')}</>}
      </p>
      {(otevreno || value.preset === 'vlastni') && (
        <div className="well px-4 py-3 space-y-3">
          {value.preset === 'vlastni' && (
            <div className="grid grid-cols-2 gap-3">
              <Field id="obd-od" label={t('Od dne')}>
                <Input id="obd-od" type="date" value={value.od} max={value.do || undefined} onChange={e => e.target.value && onChange({ ...value, preset: 'vlastni', od: e.target.value, do: value.do < e.target.value ? e.target.value : value.do })} />
              </Field>
              <Field id="obd-do" label={t('Do dne')}>
                <Input id="obd-do" type="date" value={value.do} min={value.od || undefined} max={dnes} onChange={e => e.target.value && onChange({ ...value, preset: 'vlastni', do: e.target.value, od: value.od > e.target.value ? e.target.value : value.od })} />
              </Field>
            </div>
          )}
          {dnyTydne && (
            <div className="space-y-1.5">
              <p className="t-label">{t('Dny v týdnu')}</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Dny v týdnu')}>
                {Array.from({ length: 7 }, (_, i) => (
                  <button key={i} type="button" aria-pressed={jeDenZapnuty(i) && value.dnyTydne.length > 0} onClick={() => prepniDen(i)}
                    className={`filter-pill tap-target-sm ${value.dnyTydne.length > 0 && jeDenZapnuty(i) ? 'seg-on' : 'seg-off glass'}`}>{jmenoDne(i)}</button>
                ))}
                <Button variant="ghost" size="sm" onClick={() => onChange({ ...value, dnyTydne: SHODNE(value.dnyTydne, PRACOVNI_DNY) ? [] : PRACOVNI_DNY })}>{t('Pracovní dny')}</Button>
                <Button variant="ghost" size="sm" onClick={() => onChange({ ...value, dnyTydne: SHODNE(value.dnyTydne, VIKEND) ? [] : VIKEND })}>{t('Víkend')}</Button>
                {value.dnyTydne.length > 0 && <Button variant="ghost" size="sm" onClick={() => onChange({ ...value, dnyTydne: [] })}>{t('Všechny dny')}</Button>}
              </div>
            </div>
          )}
          {hrubost && (
            <div className="space-y-1.5">
              <p className="t-label">{t('Graf po')}</p>
              <Segmented size="sm" ariaLabel={t('Hrubost grafu')} value={value.hrubost} onChange={(h: Hrubost) => onChange({ ...value, hrubost: h })}
                options={[{ id: 'auto', label: t('Automaticky') }, { id: 'den', label: t('Dnech') }, { id: 'tyden', label: t('Týdnech') }, { id: 'mesic', label: t('Měsících') }]} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ObdobiLista;
