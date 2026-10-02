'use client';

// Vstupy do přechodu z Kartičky: jedno místo pro texty, kartu a otevření průvodce, ať je na všech
// obrazovkách (Věrnost → Přehled, Přehled správy, Zákazníci → Členové, Nastavení) stejně pojmenovaný.
// Průvodce samotný (ImportKartickaOkno) se stahuje líně a až po kliknutí.

import dynamic from 'next/dynamic';
import { useCallback, useState, type ReactNode } from 'react';
import { Button, Card, Chip } from '../ui';
import { Icon } from '../Icons';
import { useOpravneni } from '../role/useOpravneni';
import type { Hlaska } from './import/typy';

const ImportKartickaOkno = dynamic(() => import('./ImportKartickaOkno'), { ssr: false });

export const PRECHOD_OTAZKA = 'Přecházíš z Kartičky?';
export const PRECHOD_TLACITKO = 'Přenést z Kartičky';
export const PRECHOD_POPIS = 'Nahraj export zákazníků z Kartičky (mojekarticka.cz). Přeneseme členy s body a razítky a pomůžeme ti opsat pravidla věrnosti.';

/** Do tolika členů se podnik bere jako „teprve začíná" a karta je výrazná. */
export const MALO_CLENU = 5;

/** Karta je výrazná, dokud podnik nemá víc než MALO_CLENU členů; počet neznámý = decentní. */
export const jeVyrazna = (clenu: number | null): boolean => clenu !== null && clenu <= MALO_CLENU;

/** Stav okna a oprávnění na jednom místě: `okno` se vykreslí kamkoli v obrazovce, `otevri` ho zapne. */
export function useImportKarticky(oznam: Hlaska, onHotovo: () => void): { smi: boolean; otevri: () => void; okno: ReactNode } {
  const { ma } = useOpravneni();
  const smi = ma('zakaznici.import');
  const [otevreno, setOtevreno] = useState(false);
  const otevri = useCallback(() => setOtevreno(true), []);
  const okno = smi && otevreno ? <ImportKartickaOkno open onClose={() => setOtevreno(false)} oznam={oznam} onHotovo={onHotovo} /> : null;
  return { smi, otevri, okno };
}

/**
 * Karta „Přecházíš z Kartičky?". Výrazná (s popisem a hlavní akcí) pro podnik bez členů nebo s hrstkou,
 * jinak jen decentní řádek s vedlejším tlačítkem. `krok` přidá štítek „Začni" (Přehled správy).
 */
export default function PrechodZKarticky({ clenu, onOtevri, krok = false, className = '' }: {
  clenu: number | null; onOtevri: () => void; krok?: boolean; className?: string;
}) {
  if (!jeVyrazna(clenu)) {
    return (
      <div data-prechod="decentni" className={`flex items-center gap-3 flex-wrap rounded-2xl border border-black/10 px-4 py-3 ${className}`}>
        <p className="text-sm text-black/65 min-w-0 flex-1 basis-48 text-pretty">
          <span className="font-semibold text-[#16181A]">{PRECHOD_OTAZKA}</span> Přenes další členy nebo si zkontroluj pravidla věrnosti.
        </p>
        <Button size="sm" variant="secondary" icon="upload" className="max-sm:w-full" onClick={onOtevri}>{PRECHOD_TLACITKO}</Button>
      </div>
    );
  }
  return (
    <Card tone="accent" data-prechod="vyrazna" className={className} aria-labelledby="prechod-nadpis">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span className="shrink-0 mt-0.5 text-[#16181A]" aria-hidden="true"><Icon name="upload" size={22} /></span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {krok && <Chip tone="muted" size="sm">Začni</Chip>}
              <h2 id="prechod-nadpis" className="t-card">{PRECHOD_OTAZKA}</h2>
            </div>
            <p className="t-meta mt-1 text-pretty">
              {clenu === 0 ? 'Zatím tu nejsou žádní členové. ' : ''}{PRECHOD_POPIS}
            </p>
          </div>
        </div>
        <Button variant="accent" icon="upload" className="max-sm:w-full shrink-0" onClick={onOtevri}>{PRECHOD_TLACITKO}</Button>
      </div>
    </Card>
  );
}
