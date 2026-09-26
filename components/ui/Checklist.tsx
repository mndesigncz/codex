'use client';

import React from 'react';
import { Icon } from '../Icons';

// Seznam kroků s odškrtnutím — „První kroky" na Přehledu a klientské
// „Propojení". Obojí bylo psané zvlášť jako šedé jamky pod sebou a hotový
// krok se přeškrtával, takže to, co člověk udělal, vypadalo jako smazané.
//
// Tady je to seznam v jedné kartě s linkami mezi řádky (`.list`), jako
// každý jiný seznam v aplikaci. Hotový krok má limetkové kolečko s fajfkou
// — limetka bez záře je stav, ne akce — a tlumený text, bez přeškrtnutí.
// Nesplněný krok není chyba: prázdné kolečko, žádný červený kroužek.

export interface ChecklistItem {
  /** Stálý klíč řádku. */
  id: string;
  label: React.ReactNode;
  done: boolean;
  /** Krátká věta pod krokem — kde nebo proč. */
  hint?: React.ReactNode;
  /** Kam krok vede (otevře obrazovku, kde se udělá). Bez něj je řádek jen text. */
  onClick?: () => void;
}

/**
 * Seznam kroků, které se dají odškrtat: úvodní „První kroky", napojení
 * služeb, cokoli s pořadím a stavem hotovo/zbývá. Každý krok může vést tam,
 * kde se udělá (`onClick`, pak má šipku). Počet „2/4" patří do titulku karty
 * (`Chip`), ne sem. Vkládá se do karty s `pad="none"` a `px-5`, jako `.list`.
 */
export function Checklist({ items, label, className = '' }: {
  items: ChecklistItem[];
  /** Název seznamu pro odečítač, když ho nenese nadpis karty. */
  label?: string;
  className?: string;
}) {
  return (
    <ul className={`list ${className}`} aria-label={label}>
      {items.map(it => {
        const obsah = (
          <>
            <span aria-hidden className={`shrink-0 grid place-items-center h-5 w-5 rounded-full ${
              it.done ? 'bg-[#C8F542] on-accent' : 'border-2 border-black/15'}`}>
              {it.done && <Icon name="check" size={12} strokeWidth={2.6} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-[15px] font-medium leading-snug text-pretty ${it.done ? 'text-black/45' : 'text-[#16181A]'}`}>
                {/* Stav, který je vidět jen z kolečka, musí slyšet i odečítač. */}
                {it.done && <span className="sr-only">Hotovo: </span>}
                {it.label}
              </span>
              {it.hint && <span className="block text-[13px] leading-snug text-black/55 mt-0.5 text-pretty">{it.hint}</span>}
            </span>
            {it.onClick && <Icon name="chevronRight" size={16} className="shrink-0 text-black/30" />}
          </>
        );
        // Klikací řádek je <button> uvnitř vlastního <li>: kdyby tlačítko
        // bylo přímo položkou `.list`, linka nad ním by se nevykreslila
        // (stejná past jako u ListRow s onClick). Odsazení, přesah podkladu
        // i šířku mu dává globals.css (`button:where(.list-row-tap)`); `w-full`
        // by šířku přebil a řádek by ujel o přesah doleva.
        return it.onClick ? (
          <li key={it.id}>
            <button type="button" onClick={it.onClick} className="list-row list-row-tap text-left">{obsah}</button>
          </li>
        ) : (
          <li key={it.id} className="list-row">{obsah}</li>
        );
      })}
    </ul>
  );
}

export default Checklist;
