'use client';

// Denní strop v Nastavení bodů (kolo 91, Martin: „to je můj pomyslný strop, ten si nastavím
// sám ve svém účtu, ale chci mít možnost si nastavit všechno custom“). Ve výchozím stavu
// vypnutý; podnik si zapne hodnotu a vybere, které zdroje bodů se do stropu počítají.
// Srážky a tresty platí vždy mimo strop.

import { useId } from 'react';
import { Field, Input, SwitchRow } from '../ui';
import { Icon } from '../Icons';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { ZDROJE_STROPU, type ZdrojStropu } from '@/lib/bodyRezim';

export function nazevZdroje(t: ReturnType<typeof useT>, z: ZdrojStropu): string {
  switch (z) {
    case 'postupy': return t('Postupy');
    case 'ukoly': return t('Úkoly');
    case 'uzaverky': return t('Uzávěrky');
    case 'hodnoceni': return t('Automatické hodnocení směny');
    case 'automaticke': return t('Dochvilnost, výročí, narozeniny');
    case 'navic': return t('Navíc');
    case 'za_body': return t('Úkoly za body');
    case 'pochvaly': return t('Pochvaly');
    case 'vyzvy': return t('Výzvy a poděkování');
    default: return t('Ruční body vedení');
  }
}

export function NastaveniStropu({ zap, onZap, hodnota, onHodnota, zdroje, onZdroje, stropOd, zmenen }: {
  zap: boolean; onZap: (v: boolean) => void;
  hodnota: string; onHodnota: (v: string) => void;
  zdroje: ZdrojStropu[]; onZdroje: (z: ZdrojStropu[]) => void;
  /** Uložené datum platnosti (null = odjakživa). */
  stropOd: string | null;
  /** Strop se v rozepsaném formuláři změnil (začne platit dnem uložení). */
  zmenen: boolean;
}) {
  const t = useT('sprava');
  const { jazyk } = useJazyk();
  const uid = useId();
  const prepni = (z: ZdrojStropu) => onZdroje(zdroje.includes(z) ? zdroje.filter(x => x !== z) : ZDROJE_STROPU.filter(x => x === z || zdroje.includes(x)));
  return (
    <div className="space-y-3" data-nastaveni-stropu>
      <SwitchRow as="div" className="!py-1" title={t('Denní strop bodů')} checked={zap} onChange={onZap}
        hint={t('Nejvýš kolik bodů ze zvolených zdrojů člověk dostane za jeden den. Srážky a tresty platí vždy. Vypnuto = bez omezení.')} />
      {zap && (
        <>
          <Field id={`${uid}-hodnota`} label={t('Strop na člověka a den (b)')}>
            <Input id={`${uid}-hodnota`} type="text" inputMode="numeric" value={hodnota} className="!w-24 tabular-nums"
              onChange={e => onHodnota(e.target.value.replace(/\D/g, '').slice(0, 3))} />
          </Field>
          <fieldset className="min-w-0">
            <legend className="field-label">{t('Do stropu se počítá')}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              {ZDROJE_STROPU.map(z => {
                const on = zdroje.includes(z);
                return (
                  <button key={z} type="button" role="checkbox" aria-checked={on} onClick={() => prepni(z)} data-zdroj-stropu={z}
                    className="flex min-h-[44px] w-full items-center gap-3 py-1.5 text-left">
                    <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition-colors ${
                      on ? 'bg-[#16181A] border-[#16181A] text-[#C8F542]' : 'border-black/20 bg-white/60 text-transparent'}`}>
                      <Icon name="check" size={14} strokeWidth={3} />
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-[#16181A]">{nazevZdroje(t, z)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </>
      )}
      <p className="t-meta text-pretty" data-strop-od>
        {!zap ? t('Bez stropu.')
          : zmenen ? t('Nový strop začne platit dnem uložení. Starší dny jsou beze změny, dokud body nepřepočítáš zpětně.')
          : stropOd ? t('Strop platí od {datum}, starší dny jsou beze změny, dokud body nepřepočítáš zpětně.', { datum: fmtDatum(stropOd, { jazyk, styl: 'kratce' }) })
          : t('Strop platí pro všechny dny (přepočítáno zpětně).')}
      </p>
    </div>
  );
}
