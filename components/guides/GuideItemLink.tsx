'use client';

// K jaké skladové položce návod patří — tedy co se podle něj vyrábí.
//
// Protějšek `GuideProductLink`: ten říká „tohle se z návodu prodává“,
// tenhle „takhle se to vyrábí“. Se vazbou přestane být postup výroby
// odstavcem textu u skladové položky a úkol „Vyrobit X“ si kroky vezme
// rovnou odsud.
//
// Nabízí jen položky s příznakem „vyrábíme sami“. Návod na výrobu mléka,
// které se nakupuje, by vazbu jen zaplevelil.
//
// Kolo 69 (B6b): vybraná vazba byla modře tónovaný blok s hexem #0A84FF mimo tokeny,
// pole ručně psané a „Připojit…“ jako glass karta → Well, .field, Button třídy.

import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { useResultKeys } from '@/lib/useResultKeys';
import { okJson } from '@/lib/api';
import { obsahujeNekde } from '@/lib/hledani';

type Polozka = { id: number; name: string; unit?: string; category?: string | null; madeInHouse?: boolean };

export default function GuideItemLink({ itemId, items, onPick }: {
  itemId: number | null;
  /** Celý sklad — editor ho už načítá kvůli surovinám v krocích. */
  items: Polozka[];
  onPick: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const vstup = useRef<HTMLInputElement>(null);
  const seznam = useRef<HTMLDivElement>(null);
  const keys = useResultKeys(seznam, vstup, { onEscape: () => { setOpen(false); setQuery(''); } });

  const vyrabene = items.filter(i => i.madeInHouse);
  const vybrana = itemId != null ? items.find(i => i.id === itemId) ?? null : null;
  const nalezene = vyrabene.filter(i => obsahujeNekde(query, i.name, i.category)).slice(0, 8);

  // Vazba může ukazovat na položku, která mezitím „vyrábíme sami“ ztratila.
  // Mlčet by znamenalo, že vedení nechápe, proč se návod v úkolu neobjevuje.
  const uzSeNevyrabi = !!vybrana && !vybrana.madeInHouse;

  useEffect(() => { if (!open) setQuery(''); }, [open]);

  // `<label>` by tu popisoval skupinu, ne jedno pole — a odečítač by ho
  // ohlásil jako popisek bez ovládacího prvku. Skupina s `aria-labelledby`
  // říká totéž a je pravdivá.
  const popisek = useId();

  return (
    <div role="group" aria-labelledby={popisek}>
      <p id={popisek} className="field-label">Vyrábíme podle něj (volitelné)</p>
      {itemId != null ? (
        <div className="space-y-1.5">
          <div className="well flex items-center gap-2 px-4 py-2.5">
            <Icon name="leaf" size={15} className="shrink-0 text-black/45" />
            <span className="min-w-0 flex-1 truncate text-sm text-[#16181A]">
              {vybrana?.name ?? `Položka #${itemId}`}
            </span>
            <button type="button" onClick={() => { onPick(null); setOpen(false); }}
              title="Zrušit vazbu" aria-label="Zrušit vazbu na skladovou položku"
              className="shrink-0 btn-icon btn-icon-danger transition">
              <Icon name="close" size={13} />
            </button>
          </div>
          <p className="t-meta">
            {uzSeNevyrabi
              ? 'Tahle položka už nemá zapnuté „vyrábíme sami“ — úkol na výrobu proto nevzniká.'
              : 'Až bude docházet, směna dostane úkol s kroky z tohohle návodu.'}
          </p>
        </div>
      ) : open ? (
        <div className="well p-3 space-y-2">
          <input ref={vstup} autoFocus value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={keys.onInputKeyDown}
            placeholder="Hledat mezi vlastní výrobou…"
            className="field w-full" />
          {nalezene.length === 0 && (
            <p className="t-meta">
              {vyrabene.length === 0
                ? 'Žádná položka nemá zapnuté „vyrábíme sami“ — zapni to v detailu položky ve Skladu.'
                : 'Nic takového mezi vlastní výrobou není.'}
            </p>
          )}
          {nalezene.length > 0 && (
            <div ref={seznam} onKeyDown={keys.onListKeyDown}
              className="max-h-44 overflow-y-auto scrollbar-thin divide-y divide-black/[0.05]">
              {nalezene.map(i => (
                <button key={i.id} type="button"
                  onClick={() => { onPick(i.id); setOpen(false); }}
                  className="w-full text-left px-1 py-2 hover:bg-black/[0.03] transition">
                  <span className="block text-sm text-[#16181A] truncate">{i.name}</span>
                  <span className="block t-meta truncate">
                    {i.category || 'bez kategorie'}{i.unit ? ` · ${i.unit}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setOpen(false)}
            className="btn btn-ghost btn-sm">Zrušit</button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)}
          className="btn btn-secondary btn-sm">
          <Icon name="plus" size={15} /> Připojit ke skladové položce
        </button>
      )}
    </div>
  );
}
