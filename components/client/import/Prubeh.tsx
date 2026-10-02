'use client';

// Krok 5: shrnutí před spuštěním, průběh po dávkách a výsledek.

import { Button, Stat, Well } from '../../ui';
import { Icon } from '../../Icons';
import { czCount, type CzNoun } from '@/lib/czech';
import { cislo, MAX_DAVKA, type SoucetImportu } from './typy';

const DAVKA: CzNoun = { one: 'dávka', few: 'dávky', many: 'dávek' };

export type FazeImportu = 'pripraveno' | 'bezi' | 'chyba' | 'hotovo' | 'zastaveno';

export default function Prubeh({
  faze, zpracovano, celkem, soucet, chybaDavky, cisloDavky, pocetDavek, importId, radkyShrnuti, onZkusit, onZrusit, onVratit, vraceno,
}: {
  faze: FazeImportu;
  zpracovano: number;
  celkem: number;
  soucet: SoucetImportu;
  chybaDavky: string | null;
  cisloDavky: number;
  pocetDavek: number;
  importId: number | null;
  radkyShrnuti: string[];
  onZkusit: () => void;
  onZrusit: () => void;
  onVratit: () => void;
  vraceno: boolean;
}) {
  const procent = celkem > 0 ? Math.min(100, Math.round((zpracovano / celkem) * 100)) : 0;

  if (faze === 'pripraveno') {
    return (
      <div className="space-y-4 min-w-0">
        <p className="text-sm text-black/70 text-pretty">
          Import se zapíše po dávkách po {cislo(MAX_DAVKA)} členech ({czCount(pocetDavek, DAVKA)}).
          Každý import jde později vrátit v historii.
        </p>
        <Well as="div">
          <ul className="space-y-1.5 text-sm text-black/75">
            {radkyShrnuti.map(t => (
              <li key={t} className="flex items-start gap-2"><Icon name="check" size={15} className="shrink-0 mt-0.5 text-[var(--ok-ink)]" /><span className="min-w-0 text-pretty">{t}</span></li>
            ))}
          </ul>
        </Well>
      </div>
    );
  }

  const bezi = faze === 'bezi';
  return (
    <div className="space-y-5 min-w-0">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-[#16181A]" aria-live="polite" role="status">
            {faze === 'hotovo' ? 'Import dokončen' : faze === 'zastaveno' ? 'Import zastaven' : faze === 'chyba' ? 'Import se zastavil' : 'Probíhá import'}
            {' · '}Import: {cislo(zpracovano)} z {cislo(celkem)}
          </p>
          <span className="text-xs text-black/50 tabular-nums shrink-0">{procent} %</span>
        </div>
        <div role="progressbar" aria-label="Průběh importu" aria-valuemin={0} aria-valuemax={celkem} aria-valuenow={zpracovano}
          aria-valuetext={`Import: ${cislo(zpracovano)} z ${cislo(celkem)}`}
          className="mt-2 h-2.5 rounded-full bg-black/[0.08] overflow-hidden">
          <div className={`h-full rounded-full transition-[width] duration-300 ${faze === 'chyba' ? 'bg-[#DC2626]' : 'bg-[#16181A]'}`} style={{ width: `${procent}%` }} />
        </div>
        {bezi && (
          <p className="mt-2 text-xs text-black/50">Dávka {cislo(Math.min(cisloDavky, pocetDavek))} z {cislo(pocetDavek)}. Okno nezavírejte, dokud import neskončí.</p>
        )}
      </div>

      {bezi && <div><Button variant="secondary" onClick={onZrusit}>Zrušit</Button><p className="mt-1.5 text-xs text-black/50 text-pretty">Zruší se po dokončení právě zapisované dávky. Co už je zapsané, zůstane a půjde vrátit.</p></div>}

      {faze === 'chyba' && (
        <div role="alert" className="rounded-2xl bg-[var(--bad-bg)] text-[var(--bad-ink)] p-4 space-y-3">
          <p className="text-sm text-pretty">{chybaDavky ?? 'Dávku se nepodařilo zapsat.'}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon="refresh" onClick={onZkusit}>Zkusit znovu</Button>
            <Button variant="secondary" onClick={onZrusit}>Zastavit import</Button>
          </div>
        </div>
      )}

      {(faze === 'hotovo' || faze === 'zastaveno') && (
        <Vysledek soucet={soucet} importId={importId} onVratit={onVratit} vraceno={vraceno} zastaveno={faze === 'zastaveno'} />
      )}
    </div>
  );
}

function Vysledek({ soucet, importId, onVratit, vraceno, zastaveno }: {
  soucet: SoucetImportu; importId: number | null; onVratit: () => void; vraceno: boolean; zastaveno: boolean;
}) {
  return (
    <section aria-label="Výsledek importu" className="space-y-4 min-w-0">
      {vraceno && (
        <p role="status" className="rounded-2xl bg-[var(--ok-bg)] text-[var(--ok-ink)] p-3 text-sm">Import byl vrácen. Nové účty a členství z něj zmizely.</p>
      )}
      {zastaveno && !vraceno && (
        <p role="status" className="rounded-2xl bg-[var(--wait-bg)] text-[var(--wait-ink)] p-3 text-sm text-pretty">
          Import jste zastavili. Co se stihlo zapsat, zůstává. Můžete ho nechat, nebo vrátit odkazem níže.
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5">
        <Stat label="Noví členové" value={cislo(soucet.novaClenstvi)} />
        <Stat label="Nové účty" value={cislo(soucet.noveUcty)} />
        <Stat label="Aktualizováno" value={cislo(soucet.aktualizovano)} />
        <Stat label="Přeskočeno" value={cislo(soucet.preskoceno)} />
        <Stat label="Razítka zapsána" value={cislo(soucet.razitkaZapsana)} />
        <Stat label="Plné karty" note="k ruční kontrole" value={cislo(soucet.plneKarty)} />
      </div>
      {soucet.zarazenoDoSkupin > 0 && <p className="text-sm text-black/65">Do skupin zařazeno: <strong>{cislo(soucet.zarazenoDoSkupin)}</strong> členů.</p>}
      {soucet.razitkaBezKampane > 0 && (
        <p className="text-sm text-black/65 text-pretty">U {cislo(soucet.razitkaBezKampane)} členů soubor razítka měl, ale nebyla vybraná kampaň, takže se nepřenesla.</p>
      )}
      {soucet.plneKarty > 0 && (
        <Well className="text-sm text-black/70 text-pretty">
          <p className="font-medium text-[#16181A]">Plné karty</p>
          <p className="mt-1">
            {cislo(soucet.plneKarty)} {soucet.plneKarty === 1 ? 'člen měl' : 'členů mělo'} v souboru plnou kartu. Plná karta se ve výchozím zápisu uložila
            jako rozdělaná zbytková část, odměna se automaticky nevydala. Tyto členy zkontrolujte ručně a odměnu případně dejte sami.
          </p>
        </Well>
      )}
      {soucet.chyby.length > 0 && (
        <details className="rounded-2xl border border-[var(--surface-line)] px-4 py-1">
          <summary className="tap-target-sm cursor-pointer select-none py-3 text-sm font-semibold text-[#16181A]">Řádky, které se nezapsaly ({cislo(soucet.chyby.length)})</summary>
          <ul className="pb-3 space-y-1 text-sm text-black/70">
            {soucet.chyby.slice(0, 30).map((c, i) => <li key={i}><span className="tabular-nums text-black/45">Řádek {c.radek}:</span> {c.duvod}</li>)}
          </ul>
        </details>
      )}
      {importId !== null && !vraceno && (
        <p className="text-sm">
          <button type="button" onClick={onVratit} className="tap-target-sm underline underline-offset-2 text-black/65 hover:text-[#16181A]">Vrátit import</button>
        </p>
      )}
    </section>
  );
}
