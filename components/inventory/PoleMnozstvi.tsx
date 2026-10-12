'use client';

// Pole množství s jednotkou PŘÍMO V POLI (sufix vpravo, ne jen placeholder) a
// volitelným krokovačem ±. Jedna podoba pro formulář položky, inventuru, zápis
// stavu na telefonu, balení kategorie i předvyplnění.
//
// Proč: do kola 81 bylo u každého čísla ve Skladu jinak — někde jednotka vedle
// jako šedý text, někde jen v placeholderu, někde nikde — a člověk nevěděl,
// jestli píše kusy, gramy nebo balení (zadání kola 82). Pole je textové
// s inputMode decimal/numeric (type="number" zahodí českou čárku, viz
// scripts/check-decimal-inputs.mjs); číslo si z něj bere volající přes
// lib/inventura.pocetZPole.

import { useT } from '@/lib/i18n/client';
import { pocetDoPole } from '@/lib/inventura';
import { krokMnozstvi } from '@/lib/mnozstvi';
import { Button } from '../ui';

export interface PoleMnozstviProps {
  id?: string;
  value: string;
  onChange: (text: string) => void;
  /** Jednotka vpravo v poli (ks, g, lahev…). Prázdná = bez sufixu. */
  jednotka?: string | null;
  /** Smí se psát desetinné číslo (klávesnice s čárkou). */
  desetinne?: boolean;
  /** Krokovač ±: o kolik jeden stisk mění hodnotu. Bez něj je to jen pole. */
  krok?: number;
  /** Spodní mez krokovače (výchozí 0). */
  min?: number;
  /** Název položky do popisků krokovače pro odečítač („Ubrat — Mléko"). */
  nazev?: string;
  /** Přístupný název pole; bez něj se použije `aria-labelledby`/`<label htmlFor>` volajícího. */
  ariaLabel?: string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /** `lg` = vyšší pole a větší číslo pro palec (inventura, zápis stavu). */
  velikost?: 'md' | 'lg';
  /** Zarovnání čísla; výchozí vpravo (u krokovače na střed). */
  zarovnat?: 'left' | 'center' | 'right';
  /** Třídy obalu (šířka: `!w-28`, `flex-1 min-w-0`). */
  className?: string;
  onBlur?: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}

export default function PoleMnozstvi({
  id, value, onChange, jednotka, desetinne = false, krok, min = 0, nazev, ariaLabel, placeholder, invalid, disabled, autoFocus,
  velikost = 'md', zarovnat, className = '', onBlur, onKeyDown,
}: PoleMnozstviProps) {
  const t = useT('sklad');
  const j = String(jednotka ?? '').trim();
  // Odsazení textu podle délky jednotky, ať číslo nepodjíždí pod sufix.
  const odsazeni = !j ? '' : j.length <= 2 ? '!pr-9' : j.length <= 4 ? '!pr-12' : j.length <= 7 ? '!pr-16' : '!pr-20';
  const align = zarovnat ?? (krok ? 'center' : 'right');
  const vyska = velikost === 'lg' ? '!py-3 text-[17px] font-semibold' : '';
  const pole = (
    <div className={`relative min-w-0 ${krok ? 'flex-1' : 'w-full'}`}>
      <input
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        inputMode={desetinne ? 'decimal' : 'numeric'}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className={`field tabular-nums ${odsazeni} ${vyska} ${align === 'center' ? 'text-center' : align === 'left' ? 'text-left' : 'text-right'}`}
      />
      {j && (
        <span aria-hidden className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-black/55 max-w-[5.5rem] truncate ${velikost === 'lg' ? 'text-sm' : 'text-xs'}`}>
          {j}
        </span>
      )}
    </div>
  );
  if (!krok) return <div className={`min-w-0 ${className}`}>{pole}</div>;
  const velikostTlacitka = velikost === 'lg' ? 'md' : 'sm';
  return (
    <div className={`flex items-center gap-1.5 min-w-0 ${className}`}>
      <Button type="button" variant="secondary" size={velikostTlacitka} iconOnly icon="minus" disabled={disabled}
        aria-label={nazev ? t('Ubrat — {nazev}', { nazev }) : t('Ubrat')}
        onClick={() => onChange(pocetDoPole(krokMnozstvi(value, -krok, min)))} />
      {pole}
      <Button type="button" variant="secondary" size={velikostTlacitka} iconOnly icon="plus" disabled={disabled}
        aria-label={nazev ? t('Přidat — {nazev}', { nazev }) : t('Přidat')}
        onClick={() => onChange(pocetDoPole(krokMnozstvi(value, krok, min)))} />
    </div>
  );
}
