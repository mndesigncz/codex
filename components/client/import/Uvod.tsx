'use client';

// Krok 1: co se přenese, jak soubor získat, nahrát ho nebo vložit z tabulky.

import { useRef, useState } from 'react';
import { Button, Field, Segmented, Select, Textarea, Well } from '../../ui';
import { Icon } from '../../Icons';
import { cislo } from './typy';

export type Kodovani = 'utf-8' | 'windows-1250';

/** Přenáší se: každý bod je to, co import opravdu umí zapsat. */
const PRENASI = [
  'členové s e-mailem (jméno, telefon, datum narození pro dárek k narozeninám)',
  'body a kredit / cashback',
  'razítka na rozdělané kartě',
  'počet návštěv a poslední návštěva',
  'skupiny nebo úrovně (založí se jako skupiny členů)',
];

const MAX_BAJTU = 10 * 1024 * 1024;

/** Přečte soubor v daném kódování; vrací text a to, jestli v něm zůstaly nečitelné znaky (U+FFFD). */
export async function precistSoubor(soubor: File, kodovani: Kodovani): Promise<{ text: string; vadnyZnak: boolean }> {
  if (kodovani === 'utf-8') {
    const text = await soubor.text();
    return { text, vadnyZnak: text.includes('�') };
  }
  const text = new TextDecoder('windows-1250').decode(await soubor.arrayBuffer());
  return { text, vadnyZnak: text.includes('�') };
}

export const jeSouborMoc = (soubor: File): boolean => soubor.size > MAX_BAJTU;

export default function Uvod({
  cesta, setCesta, text, setText, nazevSouboru, kodovani, onKodovani, onSoubor, chybaSouboru, upozorneniKodovani,
  radku, sloupcu, onHistorie, muzeHistorii,
}: {
  cesta: 'soubor' | 'vlozit';
  setCesta: (c: 'soubor' | 'vlozit') => void;
  text: string;
  setText: (t: string) => void;
  nazevSouboru: string | null;
  kodovani: Kodovani;
  onKodovani: (k: Kodovani) => void;
  onSoubor: (f: File) => void;
  chybaSouboru: string | null;
  upozorneniKodovani: string | null;
  radku: number;
  sloupcu: number;
  onHistorie: () => void;
  muzeHistorii: boolean;
}) {
  const vstup = useRef<HTMLInputElement>(null);
  const [tahne, setTahne] = useState(false);

  return (
    <div className="space-y-5 min-w-0">
      <div>
        <h4 className="text-sm font-semibold text-[#16181A]">Co se přenese</h4>
        <ul className="mt-2 space-y-1.5">
          {PRENASI.map(t => (
            <li key={t} className="flex items-start gap-2 text-sm text-black/70">
              <Icon name="check" size={15} className="shrink-0 mt-0.5 text-[var(--ok-ink)]" />
              <span className="min-w-0 text-pretty">{t}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-black/50 text-pretty">
          Funguje i s jiným souborem: stačí tabulka (CSV, TSV nebo text z Excelu) s e-maily členů.
        </p>
      </div>

      <Well className="space-y-2">
        <h4 className="text-sm font-semibold text-[#16181A]">Jak soubor získat</h4>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-black/70">
          <li className="text-pretty">V administraci Kartičky (mojekarticka.cz) exportujte zákazníky jako CSV nebo Excel.</li>
          <li className="text-pretty">Excel: <em>Uložit jako</em> a typ <em>CSV UTF-8</em>. Nebo celou tabulku označte, zkopírujte a vložte do pole níže.</li>
        </ol>
        <p className="text-xs text-black/55 text-pretty">
          Upřímně: přesný formát exportu Kartička nezveřejňuje. Proto si v dalším kroku sloupce před importem zkontrolujete
          a přiřadíte sami. Když export nejde nebo je potíž, pomůže podpora Kartičky (info@karticka.cz).
        </p>
      </Well>

      <div className="space-y-3">
        <Segmented
          ariaLabel="Způsob načtení tabulky"
          value={cesta}
          onChange={setCesta}
          options={[{ id: 'soubor', label: 'Nahrát soubor' }, { id: 'vlozit', label: 'Vložit z tabulky' }]}
        />

        {cesta === 'soubor' ? (
          <div className="space-y-3">
            <div
              onDragOver={e => { e.preventDefault(); setTahne(true); }}
              onDragLeave={() => setTahne(false)}
              onDrop={e => { e.preventDefault(); setTahne(false); const f = e.dataTransfer.files?.[0]; if (f) onSoubor(f); }}
              className={`rounded-2xl border border-dashed p-4 flex flex-col sm:flex-row sm:items-center gap-3 min-w-0 ${tahne ? 'border-[#16181A] bg-black/[0.03]' : 'border-black/20'}`}>
              <input
                ref={vstup} id="import-soubor" type="file" className="sr-only"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                aria-label="Soubor s členy (.csv, .tsv, .txt)"
                onChange={e => { const f = e.target.files?.[0]; if (f) onSoubor(f); e.target.value = ''; }} />
              <Button variant="secondary" icon="upload" onClick={() => vstup.current?.click()}>Vybrat soubor</Button>
              <p className="text-sm text-black/60 min-w-0 truncate" aria-live="polite">
                {nazevSouboru ? <>Načteno: <span className="font-medium text-[#16181A]">{nazevSouboru}</span></> : 'Podporujeme .csv, .tsv a .txt. Soubor se čte jen ve vašem prohlížeči.'}
              </p>
            </div>
            {nazevSouboru && (
              <Field id="import-kodovani" label="Kódování souboru" hint="Kdyby se háčky a čárky zobrazily špatně, přepněte kódování.">
                <Select className="min-h-11" id="import-kodovani" value={kodovani} onChange={e => onKodovani(e.target.value as Kodovani)}>
                  <option value="utf-8">UTF-8 (výchozí)</option>
                  <option value="windows-1250">Windows-1250 (starší Excel)</option>
                </Select>
              </Field>
            )}
          </div>
        ) : (
          <Field id="import-vlozeno" label="Tabulka z Excelu nebo CSV" hint="První řádek musí být hlavička se jmény sloupců.">
            <Textarea
              id="import-vlozeno" rows={6} value={text} spellCheck={false}
              placeholder={'E-mail\tJméno\tBody\nanna@example.cz\tAnna Nováková\t120'}
              className="font-mono text-xs"
              onChange={e => setText(e.target.value)} />
          </Field>
        )}

        {upozorneniKodovani && <p className="text-xs text-[var(--wait-ink)] text-pretty" role="status">{upozorneniKodovani}</p>}
        {chybaSouboru && <p role="alert" className="text-sm text-[var(--bad-ink)] text-pretty">{chybaSouboru}</p>}
        {!chybaSouboru && text.trim() && (
          <p className="text-sm text-black/70" role="status" aria-live="polite">
            {radku > 0
              ? <>Rozpoznáno <strong>{cislo(radku)}</strong> řádků a <strong>{cislo(sloupcu)}</strong> sloupců.</>
              : 'V tabulce nejsou žádné řádky pod hlavičkou.'}
          </p>
        )}
      </div>

      {muzeHistorii && (
        <p className="text-sm">
          <button type="button" onClick={onHistorie} className="tap-target-sm underline underline-offset-2 text-black/70 hover:text-[#16181A]">
            Historie importů a vrácení
          </button>
        </p>
      )}
    </div>
  );
}
