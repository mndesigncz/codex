'use client';

// Hromadné přidání členů do ruční skupiny z CSV nebo vloženého seznamu e-mailů, telefonů a jmen.
// Nejdřív náhled (kolik se spáruje, koho se nepodařilo najít), teprve potom zápis. Nikdo se nezakládá.

import { useRef, useState } from 'react';
import { Button, Field, Modal, Textarea } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { czCount, type CzNoun } from '@/lib/czech';
import { csvNenalezenych } from '@/lib/clenoveSeznam';
import { apiMessage } from '@/lib/api';
import { ulozSoubor, HLASKA_NEJDE_ULOZIT } from '@/lib/stahni';
import { j, type Hlaska } from '../import/typy';


const CLEN: CzNoun = { one: 'člen', few: 'členové', many: 'členů' };
const RADEK: CzNoun = { one: 'řádek', few: 'řádky', many: 'řádků' };

interface NahledImportu { nalezeno: number; pridano: number; uBylo: number | null; nenalezeno: { radek: number; hodnota: string; duvod: string }[]; nenalezenoCelkem: number; prazdnych: number; zkraceno: boolean; ukazka: { name: string; podle: string }[]; potvrzeno: boolean }
const PODLE: Record<string, string> = { email: 'podle e-mailu', telefon: 'podle telefonu', jmeno: 'podle jména' };

export default function ImportDoSkupiny({ skupina, oznam, onZavrit }: { skupina: { id: number; name: string }; oznam: Hlaska; onZavrit: () => void }) {
  const smiKontakty = useOpravneni().ma('zakaznici.kontakty');
  const [text, setText] = useState('');
  const [soubor, setSoubor] = useState('');
  const [nahled, setNahled] = useState<NahledImportu | null>(null);
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const vstup = useRef<HTMLInputElement>(null);
  const nactiSoubor = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 600_000) { setChyba('Soubor je moc velký. Rozděl ho na víc částí.'); return; }
    const r = new FileReader();
    r.onload = () => { setText(String(r.result ?? '')); setSoubor(f.name); setNahled(null); setChyba(''); };
    r.onerror = () => setChyba('Soubor se nepodařilo přečíst.');
    r.readAsText(f, 'utf-8');
  };
  const spust = async (potvrdit: boolean) => {
    setBusy(true); setChyba('');
    try {
      const r: NahledImportu = await j('/api/client/admin/groups/import', { method: 'POST', body: JSON.stringify({ skupina: skupina.id, text, potvrdit }) });
      setNahled(r);
      if (potvrdit) { oznam(`Do skupiny ${skupina.name} přibylo ${czCount(r.pridano, CLEN)}.`); if (r.nenalezenoCelkem === 0) onZavrit(); }
    } catch (err) { setChyba(apiMessage(err, 'Soubor se nepodařilo zpracovat.')); }
    setBusy(false);
  };
  const stahniNenalezene = async () => {
    if (!nahled) return;
    const r = await ulozSoubor(`nenalezeni-${skupina.name}.csv`, csvNenalezenych(nahled.nenalezeno), 'text/csv;charset=utf-8');
    oznam(r === 'nejde' ? HLASKA_NEJDE_ULOZIT : 'Soubor se stáhl.', r === 'nejde' ? 'bad' : 'ok');
  };
  return (
    <Modal open onClose={onZavrit} size="lg" title={`Přidat členy do skupiny ${skupina.name}`}
      subtitle="Vlož seznam e-mailů, telefonů nebo jmen, nebo vyber soubor CSV. Páruje se podle e-mailu, pak telefonu, pak celého jména."
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>{nahled?.potvrzeno ? 'Hotovo' : 'Zrušit'}</Button>
        {!nahled?.potvrzeno && (nahled && nahled.nalezeno > 0
          ? <Button variant="primary" loading={busy} onClick={() => { void spust(true); }}>Přidat {czCount(nahled.nalezeno, CLEN)}</Button>
          : <Button variant="primary" loading={busy} disabled={!text.trim() || !smiKontakty} onClick={() => { void spust(false); }}>Zkontrolovat</Button>)}
      </>}>
      <div className="grid gap-3">
        {!smiKontakty && <p className="note note-wait">Přidávat členy ze souboru smí jen ten, kdo vidí kontakty hostů.</p>}
        <Field id="imp-text" label="Seznam nebo obsah CSV" hint="Jeden člen na řádek. CSV s hlavičkou E-mail, Telefon, Jméno se pozná samo. Nikdo se nezakládá, jen se přidávají stávající členové.">
          <Textarea id="imp-text" rows={6} value={text} onChange={e => { setText(e.target.value); setNahled(null); setSoubor(''); }} placeholder={'jana@example.cz\n+420 777 123 456\nPetr Novák'} />
        </Field>
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={vstup} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" aria-label="Vybrat soubor CSV" onChange={e => nactiSoubor(e.target.files?.[0])} />
          <Button size="sm" variant="secondary" icon="upload" onClick={() => vstup.current?.click()}>Vybrat soubor CSV</Button>
          {soubor && <span className="t-meta truncate">{soubor}</span>}
        </div>
        {chyba && <p className="note note-bad" role="alert">{chyba}</p>}
        {nahled && (
          <div className="well grid gap-2" aria-live="polite">
            <p className="text-sm font-medium">
              {nahled.potvrzeno
                ? `Přidáno ${czCount(nahled.pridano, CLEN)}${nahled.uBylo ? `, ${czCount(nahled.uBylo, CLEN)} už ve skupině bylo` : ''}.`
                : `Nalezeno ${czCount(nahled.nalezeno, CLEN)}${nahled.ukazka.length ? `, třeba ${nahled.ukazka.slice(0, 3).map(u => `${u.name} (${PODLE[u.podle] ?? u.podle})`).join(', ')}` : ''}.`}
            </p>
            {nahled.nenalezenoCelkem > 0 && (
              <>
                <p className="text-sm text-black/70">{czCount(nahled.nenalezenoCelkem, RADEK)} se nepodařilo spárovat:</p>
                <ul className="text-sm text-black/65 grid gap-0.5">
                  {nahled.nenalezeno.slice(0, 6).map(n => <li key={n.radek} className="truncate">Řádek {n.radek}: {n.hodnota || '(prázdný)'} — {n.duvod}</li>)}
                  {nahled.nenalezenoCelkem > 6 && <li>… a dalších {nahled.nenalezenoCelkem - 6}</li>}
                </ul>
                <div><Button size="sm" variant="secondary" icon="download" onClick={() => { void stahniNenalezene(); }}>Stáhnout nenalezené</Button></div>
              </>
            )}
            {nahled.prazdnych > 0 && <p className="t-meta">{czCount(nahled.prazdnych, RADEK)} bez použitelného údaje se přeskočilo.</p>}
            {nahled.zkraceno && <p className="note note-wait">Soubor má víc než 5 000 řádků, zpracovalo se prvních 5 000. Zbytek nahraj zvlášť.</p>}
            {nahled.nalezeno === 0 && !nahled.potvrzeno && <p className="note note-wait">Nikdo se nenašel. Zkontroluj, jestli jsou to členové podniku a jestli sedí e-mail nebo telefon.</p>}
          </div>
        )}
        {nahled?.potvrzeno && nahled.pridano === 0 && <p className="t-meta">Nikdo nepřibyl — všichni nalezení už ve skupině byli.</p>}
      </div>
    </Modal>
  );
}
