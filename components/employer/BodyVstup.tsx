'use client';

// Body se znaménkem: krokovač −/+, textové pole a ± (oprava „V hodnocení nemůžu dávat mínusové body").
//
// Dřív číselné pole (input number, inputMode numeric) řízené číslem přes parseInt(...) || 0: rozepsané „-" se hned
// přepsalo na 0 a iPhone na číselné klávesnici minus nemá. Text drží rozepsaný stav (lib/bodyVstup), číslo jde
// ven, až dává smysl, a ± otočí znaménko i tam, kde klávesnice minus nenabídne. Krokovač z nuly klesne do
// srážky, když to rozsah dovolí (min < 0); bez minusu (min 0) pod nulu neklesne. Cíle mají 44 px (telefon).

import { useEffect, useState } from 'react';
import { IconButton, Input } from '../ui';
import { useT } from '@/lib/i18n/client';
import { cistiTextBodu, hodnotaBodu, krokBodu, otocZnamenko, textBodu } from '@/lib/bodyVstup';

export function BodyVstup({ id, value, onChange, min, max, krok = 1, popis, className = '' }: {
  id: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  /** O kolik krokovač posune (výchozí 1). */
  krok?: number;
  /** Popisek pro odečítač, když pole nemá vlastní <label for>. */
  popis?: string;
  className?: string;
}) {
  const t = useT('sprava');
  const [text, setText] = useState(() => textBodu(value));
  // Hodnota zvenku (návrh z hvězd, načtené hodnocení) přepíše text, jen když se liší od rozepsaného čísla —
  // jinak by „-" během psaní spadlo zpátky na „0".
  useEffect(() => {
    if (hodnotaBodu(text, min, max) !== value) setText(textBodu(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, min, max]);

  const nastav = (raw: string) => {
    const t2 = cistiTextBodu(raw);
    const s = min >= 0 ? t2.replace('-', '') : t2;
    setText(s);
    const n = hodnotaBodu(s, min, max);
    if (n != null && n !== value) onChange(n);
  };
  const posun = (delta: number) => {
    const n = krokBodu(hodnotaBodu(text, min, max) ?? value, delta, min, max);
    setText(textBodu(n));
    if (n !== value) onChange(n);
  };
  const zaporne = (hodnotaBodu(text, min, max) ?? value) < 0;

  return (
    <span className={`inline-flex items-center gap-1 ${className}`} data-body-vstup>
      <IconButton icon="minus" aria-label={t('Ubrat bod')} onClick={() => posun(-krok)} disabled={value <= min} />
      <Input id={id} type="text" inputMode="numeric" autoComplete="off" value={text} aria-label={popis}
        onChange={e => nastav(e.target.value)}
        onBlur={() => { if (hodnotaBodu(text, min, max) == null) setText(textBodu(value)); }}
        className={`!w-[4.75rem] !px-2 text-center tabular-nums ${zaporne ? 'text-bad-ink' : ''}`} />
      <IconButton icon="plus" aria-label={t('Přidat bod')} onClick={() => posun(krok)} disabled={value >= max} />
      {min < 0 && (
        <button type="button" onClick={() => nastav(otocZnamenko(text))} aria-label={t('Otočit znaménko')}
          title={t('Otočit znaménko')}
          className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[17px] font-semibold text-black/70 hover:text-[#16181A] transition">
          <span aria-hidden className="pointer-events-none absolute inset-0.5 rounded-full bg-black/[0.05]" />
          <span aria-hidden className="relative">±</span>
        </button>
      )}
    </span>
  );
}

export default BodyVstup;
