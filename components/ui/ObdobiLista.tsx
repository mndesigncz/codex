'use client';

import React, { useState } from 'react';
import { Button } from './Button';
import { Segmented } from './Segmented';
import { Field, Input } from './Field';
import { Modal } from './Modal';
import { Switch } from './Switch';
import { Icon } from '../Icons';
import { aktualniJazyk } from '@/lib/i18n/stav';
import { useT } from '@/lib/i18n/client';
import {
  PRACOVNI_DNY, VIKEND, obdobiZPresetu, platneRozmezi, pocetDni,
  type Hrubost, type IdObdobi, type Obdobi, type PresetObdobi,
} from '@/lib/obdobi';
import { pragueToday } from '@/lib/pragueTime';

// Výběr období jako jediné tlačítko („Posledních 30 dní · 12. 9. – 11. 10. ▾"). Klepnutí otevře okno (na telefonu
// spodní list) s hotovými volbami — klepnutí na volbu ji použije a okno zavře. Vlastní od–do, dny v týdnu, hrubost grafu
// a srovnání s předchozím obdobím jsou v okně, ne na ploše: dřív to byla řada přepínačů a panel filtrů přímo v kartě,
// která na telefonu přetékala a odváděla pozornost od čísel. Jedna pro Finance, Uzávěrky, Docházku, Úkoly i widgety.

const SHODNE = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Volby v okně v pořadí, v jakém je čte člověk (krátká období → měsíce → rok). */
const VOLBY: PresetObdobi[] = ['dnes', 'vcera', 'tyden', '7_dni', '30_dni', 'mesic', 'minuly_mesic', '90_dni', '180_dni', '365_dni'];

export function ObdobiLista({ value, onChange, volby, dnyTydne = true, hrubost = true, porovnat, onPorovnat, className = '' }: {
  value: Obdobi;
  onChange: (o: Obdobi) => void;
  /** Které rychlé volby ukázat (výchozí všechny). */
  volby?: readonly PresetObdobi[];
  /** Nabídnout výběr dnů v týdnu. */
  dnyTydne?: boolean;
  /** Nabídnout hrubost grafu (den / týden / měsíc). */
  hrubost?: boolean;
  /** Přepínač srovnání s předchozím obdobím v okně (bez onPorovnat se nenabízí). */
  porovnat?: boolean;
  onPorovnat?: (zapnuto: boolean) => void;
  className?: string;
}) {
  const t = useT('widgety');
  const loc = aktualniJazyk();
  const [otevreno, setOtevreno] = useState(false);
  const [upresnit, setUpresnit] = useState(false);
  const dnes = pragueToday();
  const r = platneRozmezi(value, dnes);
  const jmenoDne = (i: number) => new Date(`2024-01-0${i + 1}T12:00:00`).toLocaleDateString(loc, { weekday: 'short' });
  const datum = (d: string, rok = false) => new Date(`${d}T12:00:00`).toLocaleDateString(loc, { day: 'numeric', month: 'numeric', ...(rok ? { year: 'numeric' } : {}) });
  const rozmezi = r.od === r.do ? datum(r.od, true) : `${datum(r.od)} – ${datum(r.do, true)}`;

  const popisky: Partial<Record<PresetObdobi, string>> = {
    dnes: t('Dnes'), vcera: t('Včera'), tyden: t('Tento týden'), '7_dni': t('Posledních 7 dní'), '30_dni': t('Posledních 30 dní'), mesic: t('Tento měsíc'),
    minuly_mesic: t('Minulý měsíc'), '90_dni': t('3 měsíce'), '180_dni': t('6 měsíců'), '365_dni': t('Rok'),
  };
  const nabidka = VOLBY.filter(v => !volby || volby.includes(v));
  const jmeno = value.preset !== 'vlastni' ? popisky[value.preset] : undefined;
  const nFiltru = (value.dnyTydne.length > 0 ? 1 : 0) + (value.hrubost !== 'auto' ? 1 : 0);

  const zvol = (id: PresetObdobi) => { onChange({ ...obdobiZPresetu(id, dnes), dnyTydne: value.dnyTydne, hrubost: value.hrubost }); setOtevreno(false); };
  const prepniDen = (i: number) => {
    const dalsi = value.dnyTydne.length === 0 ? [0, 1, 2, 3, 4, 5, 6].filter(x => x !== i) : value.dnyTydne.includes(i) ? value.dnyTydne.filter(x => x !== i) : [...value.dnyTydne, i].sort();
    onChange({ ...value, dnyTydne: dalsi.length === 7 || dalsi.length === 0 ? [] : dalsi });
  };
  const jeDenZapnuty = (i: number) => value.dnyTydne.length > 0 && value.dnyTydne.includes(i);
  const vlastni = (cast: Partial<Obdobi>) => onChange({ ...value, preset: 'vlastni' as IdObdobi, od: value.od || r.od, do: value.do || r.do, ...cast });

  return (
    <div className={`min-w-0 ${className}`} role="group" aria-label={t('Období')}>
      <button type="button" aria-haspopup="dialog" aria-expanded={otevreno} onClick={() => setOtevreno(true)}
        className="glass tap-target inline-flex max-w-full min-w-0 items-center gap-2.5 rounded-full py-2 pl-4 pr-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542]">
        <Icon name="calendar" size={16} className="shrink-0 text-black/55" />
        <span className="min-w-0 truncate text-sm">
          {jmeno && <span className="font-semibold text-[#16181A]">{jmeno}</span>}
          <span className={jmeno ? 'text-black/50 tabular-nums' : 'font-semibold text-[#16181A] tabular-nums'}>{jmeno ? ` · ${rozmezi}` : rozmezi}</span>
          {value.dnyTydne.length > 0 && <span className="text-black/50">{` · ${value.dnyTydne.map(jmenoDne).join(', ')}`}</span>}
        </span>
        <Icon name="chevron" size={14} className="shrink-0 text-black/45" />
      </button>

      {otevreno && (
        // Okno je v portálu, ale React události bublají stromem komponent: bez téhle zarážky by klepnutí mimo okno
        // doputovalo až na kartu widgetu a otevřelo její cíl.
        <div onClick={e => e.stopPropagation()}>
          <Modal open onClose={() => setOtevreno(false)} size="sm" title={t('Období')}
            subtitle={`${rozmezi} · ${t('{n, plural, one {# den} few {# dny} other {# dní}}', { n: pocetDni(r.od, r.do) })}`}
            footer={<Button variant="primary" onClick={() => setOtevreno(false)}>{t('Hotovo')}</Button>}>
            <div className="space-y-5">
              <div role="group" aria-label={t('Rychlá volba období')} className="grid grid-cols-2 gap-2">
                {nabidka.map(id => (
                  <button key={id} type="button" aria-pressed={value.preset === id} onClick={() => zvol(id)}
                    className={`filter-pill tap-target justify-center ${value.preset === id ? 'seg-on' : 'seg-off glass'}`}>{popisky[id]}</button>
                ))}
              </div>

              <div className="space-y-2">
                <p className="t-label">{t('Vlastní rozmezí')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="obd-od" label={t('Od dne')}>
                    <Input id="obd-od" type="date" value={r.od} max={r.do} onChange={e => e.target.value && vlastni({ od: e.target.value, do: r.do < e.target.value ? e.target.value : r.do })} />
                  </Field>
                  <Field id="obd-do" label={t('Do dne')}>
                    <Input id="obd-do" type="date" value={r.do} min={r.od} max={dnes} onChange={e => e.target.value && vlastni({ do: e.target.value, od: r.od > e.target.value ? e.target.value : r.od })} />
                  </Field>
                </div>
              </div>

              {onPorovnat && (
                <div className="flex items-center justify-between gap-3">
                  <span id="obd-porovnat" className="text-sm font-medium text-[#16181A]">{t('Porovnat s předchozím obdobím')}</span>
                  <Switch checked={!!porovnat} onChange={onPorovnat} labelledBy="obd-porovnat" />
                </div>
              )}

              {(dnyTydne || hrubost) && (
                <div className="space-y-3 border-t border-black/[0.07] pt-3">
                  <button type="button" aria-expanded={upresnit} onClick={() => setUpresnit(o => !o)}
                    className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-[#16181A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] rounded-lg">
                    <span>{t('Upřesnit')}{nFiltru > 0 ? ` · ${nFiltru}` : ''}</span>
                    <Icon name={upresnit ? 'chevronUp' : 'chevron'} size={15} className="text-black/45" />
                  </button>
                  {upresnit && (
                    <div className="space-y-4">
                      {dnyTydne && (
                        <div className="space-y-1.5">
                          <p className="t-label">{t('Dny v týdnu')}</p>
                          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Dny v týdnu')}>
                            {Array.from({ length: 7 }, (_, i) => (
                              <button key={i} type="button" aria-pressed={jeDenZapnuty(i)} onClick={() => prepniDen(i)}
                                className={`filter-pill tap-target-sm ${jeDenZapnuty(i) ? 'seg-on' : 'seg-off glass'}`}>{jmenoDne(i)}</button>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-1">
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
              )}
            </div>
          </Modal>
        </div>
      )}
    </div>
  );
}
