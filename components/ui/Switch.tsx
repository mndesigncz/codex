'use client';

import React, { useId } from 'react';

// Přepínač zapnuto / vypnuto — jeden pro celou aplikaci.
//
// V aplikaci bylo devět ručních kopií ve dvou podobách: sedm limetkových
// (Nastavení, Role, Uzávěrka, 4× Nastavení týmu) a dvě inkoustové. Převažuje
// limetka a ta zůstává: limetka BEZ záře je stav, ne akce, takže se do
// pravidla „jedna limetka na obrazovce" nepočítá (záři má jen tlačítko).
//
// Zakázaný přepínač je `aria-disabled`, ne `disabled`. Prohlížeč zakázané
// tlačítko odfokusuje — a přepínač bývá zakázaný hlavně chvíli po kliknutí,
// než se nastavení uloží. S `disabled` by klávesnice po každém přepnutí
// začínala znovu od začátku stránky a odečítač by ztratil, kde je
// (Nastavení organizace to tak řeší od kola 55). Kliknutí se pak jen ignoruje.

/**
 * Přepínač zapnuto/vypnuto (`role="switch"`). Použij ho pro nastavení, které
 * platí hned po přepnutí — bez tlačítka Uložit. Mezerník i Enter přepínají
 * (je to `<button>`). Popisek dodej přes `labelledBy` (id textu vedle), nebo
 * `label`; do řádku nastavení sáhni rovnou po `SwitchRow`.
 */
export function Switch({ checked, onChange, disabled = false, label, labelledBy, describedBy, id, className = '' }: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Nejde přepnout (ukládá se, nebo na to role nemá). Fokus zůstává. */
  disabled?: boolean;
  /** Přístupný název, když vedle není viditelný text s id. */
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  id?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      onClick={() => { if (!disabled) onChange(!checked); }}
      className={[
        'tap-target-sm relative inline-flex h-7 w-12 shrink-0 items-center rounded-full',
        // Stopa mění barvu a při stisku se jako každé tlačítko promáčkne
        // (globální button:active). Holé `transition-colors` by promáčknutí
        // vzalo přechod a stopa by při puštění cukla zpátky.
        'transition duration-[220ms] ease-out',
        'aria-disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:active:scale-100',
        // Fokus z klávesnice: obrys v tmavém limetkovém inkoustu (globals.css).
        // Limetkový prstenec jako u Button by kolem zapnuté (limetkové) stopy
        // splynul — na bílé kartě má limetka jen 1,27 : 1.
        'fokus-kontrast',
        checked ? 'bg-[#C8F542]' : 'bg-black/[0.12]',
        className,
      ].join(' ')}
    >
      {/* Knoflík jede 220 ms silným ease-out: rozjede se hned pod prstem
          a měkce dosedne. Při omezeném pohybu skočí rovnou na místo. */}
      <span aria-hidden
        className={`pointer-events-none absolute left-0 top-0.5 h-6 w-6 rounded-full bg-[#FDFDFB] shadow-sm transition-transform duration-[220ms] ease-out motion-reduce:transition-none ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

/**
 * Řádek nastavení s přepínačem: název a popis vlevo, přepínač vpravo.
 * Řádky patří do jedné karty se seznamem — `<Card><ul className="list">`
 * a v něm `SwitchRow` (je to `<li>`) — ne každý do vlastního boxu.
 * Klepnutí na název nebo popis přepíná taky (text je popisek přepínače).
 */
export function SwitchRow({ title, hint, checked, onChange, disabled, as: Tag = 'li', className = '' }: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** `div`, když řádek nestojí v `<ul className="list">`. */
  as?: 'li' | 'div';
  className?: string;
}) {
  const uid = useId();
  const idPrepinace = `${uid}-p`;
  const idNazvu = `${uid}-n`;
  const idPopisu = `${uid}-h`;
  return (
    <Tag className={`flex items-center justify-between gap-4 py-3 min-h-[3.25rem] ${className}`}>
      {/* Název i popis jsou uvnitř popisku (label), aby se dalo klepnout kamkoli na
          text. Přístupný název ale nese jen titulek (aria-labelledby) a popis
          jde zvlášť jako popis — jinak by odečítač četl celý odstavec jako
          jméno přepínače. */}
      <label htmlFor={idPrepinace} className={`min-w-0 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <span id={idNazvu} className="block text-sm font-semibold text-[#16181A] text-pretty">{title}</span>
        {hint && <span id={idPopisu} className="block text-xs text-black/45 mt-0.5 text-pretty">{hint}</span>}
      </label>
      <Switch id={idPrepinace} checked={checked} onChange={onChange} disabled={disabled}
        labelledBy={idNazvu} describedBy={hint ? idPopisu : undefined} />
    </Tag>
  );
}

export default Switch;
