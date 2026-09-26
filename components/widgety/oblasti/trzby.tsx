'use client';

// Widgety oblasti „Tržby a pokladna" — komponenty (kolo 68, spec §2.5, §2.6 a §6.1).
//
// Vlastník v kole 69: balík B5b (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/trzby.ts;
// tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — test AK-20 v scripts/testy/k68-widgety.ts klíče čte z textu, proto bez spreadu.
//
// Co z dřívějšího Přehledu opravuje (audit Přehledu vedení):
//  - Pokladna dnes: dřív se kreslila bez kontroly oprávnění. /api/pos/summary
//    pouští dnešní souhrn i roli s uzaverky.vytvorit (potřebuje ho k uzávěrce),
//    takže Provozní bez finance.trzby na Přehledu viděla tržbu, hotovost
//    i spropitné (N2). Teď se dotaz pošle až při `nacteno && ma('finance.trzby')`
//    a bez klíče se widget nekreslí ani nenabízí.
//  - Hlavička už není ruční `p.font-bold` s vlastní ikonou a číslo 20 px vpravo;
//    tělo je Stat/StatRow (hotově, kartou, spropitné) místo řádku textu s tečkami.
//  - Nepropojená nebo nedostupná pokladna už widget tiše neschová (dřív
//    `catch(() => {})` a blok zmizel): nepropojená je prázdný stav s větou,
//    výpadek pokladny je ErrorState se „Zkusit znovu".
//
// Data jen přes useDataWidgetu (sdílená mezipaměť), v náhledu nic nenaviguje.

import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { czForm, type CzNoun } from '@/lib/czech';
import { pragueToday } from '@/lib/pragueTime';
import { useMoney } from '../../CurrencyProvider';
import { Stat, StatRow } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { Widget, useWidget, type StavNacteni } from '../Widget';
import { useDataWidgetu } from '../useDataWidgetu';

// ---------------------------------------------------------------------------
// Společné drobnosti
// ---------------------------------------------------------------------------

const cislo = (n: number) => n.toLocaleString('cs-CZ');
const UCTENKA: CzNoun = { one: 'účtenka', few: 'účtenky', many: 'účtenek' };

/**
 * Brána widgetu (spec §1.5): přísně `nacteno && ma()`. Samotné `ma()` před
 * načtením oprávnění vrací ANO a dotaz na tržby by odešel dřív, než víme,
 * jestli na ně divák má — skončil by 403 jako falešná chyba. Když
 * /api/teams/mine selže, rozhodl už server: widget je na ploše jen tehdy,
 * když ho vrátil v rozložení.
 */
function useBrana(klic: string | readonly string[]): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  return { ok: nacteno ? ma(klic) : chyba, ceka: !nacteno && !chyba };
}

/** „Ještě nevíme, jestli smí": kostra a žádný dotaz. */
const CEKA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

// ---------------------------------------------------------------------------
// Pokladna dnes
// ---------------------------------------------------------------------------

const ID_POKLADNA = 'pokladna.dnes';

interface SouhrnPokladny {
  propojeno: boolean;
  misto: string | null;
  celkem: number;
  uctenek: number;
  hotove: number;
  kartou: number;
  spropitne: number;
}

function vyberSouhrn(raw: any): SouhrnPokladny {
  const n = (v: unknown) => Number(v) || 0;
  return {
    // Propojená pokladna bez čísel (bills null) je pro widget totéž co
    // nepropojená — nemá co ukázat a nula by lhala.
    propojeno: raw?.connected === true && raw?.bills != null,
    misto: typeof raw?.placeName === 'string' && raw.placeName.trim() ? raw.placeName.trim() : null,
    celkem: n(raw?.total),
    uctenek: n(raw?.bills),
    hotove: n(raw?.cash),
    // „Kartou" dřív sčítalo kartu a ostatní bezhotovostní platby — zůstává,
    // ať číslo sedí s tím, co lidé znají z uzávěrky.
    kartou: n(raw?.card) + n(raw?.other),
    spropitne: n(raw?.tips),
  };
}

function PokladnaDnes({ velikost }: WidgetProps) {
  const money = useMoney();
  const { inkoust } = useWidget();
  const { ok, ceka } = useBrana(widget(ID_POKLADNA)?.opravneni.vse ?? ['finance.trzby']);
  // Den podle Prahy, ne podle hodin prohlížeče — tablet v jiném pásmu by
  // po půlnoci UTC ukazoval zítřek.
  const data = useDataWidgetu<SouhrnPokladny>(ok ? `/api/pos/summary?date=${pragueToday()}` : null, vyberSouhrn);
  const s = data.data;
  const uctenky = s ? `${cislo(s.uctenek)} ${czForm(s.uctenek, UCTENKA)}` : '';
  const poznamka = s ? [uctenky, s.misto].filter(Boolean).join(' · ') : '';

  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      kostra="cislo"
      odkaz={velikost === 'S' ? undefined : { popisek: 'Finance', pohled: 'finance' }}
      prazdno={s && !s.propojeno ? <p className="t-meta">Pokladna není propojená. Propojí ji majitel v Nastavení.</p> : undefined}
    >
      {s && (velikost === 'S' ? (
        <Stat label="Tržba" value={money(s.celkem)} note={uctenky} />
      ) : inkoust ? (
        // Inkoustová plocha (DP §2.10): jediné tmavé místo v obsahu. Stat
        // má barvy pro bílou kartu, tady by číslo zmizelo — proto stejná
        // stavba v bílé: štítek white/55, číslo 40 tučně, poznámka white/60.
        <div className="min-w-0">
          <p className="t-label !text-white/55">Tržba</p>
          <p className="mt-1.5 text-[2.5rem] leading-none font-bold tracking-tight tabular-nums text-white">{money(s.celkem)}</p>
          {poznamka && <p className="mt-1.5 text-[13px] text-white/60 truncate">{poznamka}</p>}
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-white/10 pt-3">
            {([['Hotově', s.hotove], ['Kartou', s.kartou], ['Spropitné', s.spropitne]] as const).map(([stitek, castka]) => (
              <div key={stitek} className="min-w-0">
                <dt className="t-label !text-white/55 truncate">{stitek}</dt>
                <dd className="mt-1 text-[15px] font-semibold tabular-nums text-white truncate">{money(castka)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <div className="space-y-4">
          <Stat label="Tržba" value={money(s.celkem)} note={poznamka} />
          <StatRow className="border-t border-[var(--surface-line)] pt-4">
            <Stat label="Hotově" value={money(s.hotove)} />
            <Stat label="Kartou" value={money(s.kartou)} />
            <Stat label="Spropitné" value={money(s.spropitne)} />
          </StatRow>
        </div>
      ))}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'pokladna.dnes': PokladnaDnes,
};
