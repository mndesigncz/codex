'use client';

// K jaké položce v kase návod patří.
//
// Bez téhle vazby je „Jak udělat Blue Lagoon" jen text — se vazbou z něj jde
// složit receptura a z receptury naopak odkázat na postup.

import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { useResultKeys } from '@/lib/useResultKeys';
import { okJson } from '@/lib/api';

type Product = { productId: string; name: string; category?: string | null; price?: number | null };

export default function GuideProductLink({ productId, productName, onPick }: {
  productId: string | null;
  productName: string | null;
  onPick: (id: string | null, name: string | null) => void;
}) {
  const popisek = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const pickInput = useRef<HTMLInputElement>(null);
  const pickList = useRef<HTMLDivElement>(null);
  const keys = useResultKeys(pickList, pickInput, { onEscape: () => { setOpen(false); setQuery(''); } });
  const [found, setFound] = useState<Product[]>([]);
  const [note, setNote] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) { setFound([]); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const d = await fetch(`/api/pos/usage?q=${encodeURIComponent(q)}`).then(okJson);
        setFound(Array.isArray(d.products) ? d.products : []);
        setNote(d.error ?? '');
      } catch { setFound([]); }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, open]);

  return (
    // Popisek skupiny, ne jednoho pole (pole se objeví až po „Připojit") — proto skupina, ne <label>.
    <div role="group" aria-labelledby={popisek}>
      <p id={popisek} className="field-label">Položka v kase (volitelné)</p>
      {productId ? (
        <div className="well flex items-center gap-2 px-4 py-2.5">
          {/* Kolo 69 (B6b): dřív limetkově tónovaný blok — limetka je akce, ne stav vazby. */}
          <Icon name="receipt" size={15} className="shrink-0 text-black/45" />
          <span className="min-w-0 flex-1 truncate text-sm text-[#16181A]">{productName ?? productId}</span>
          <button type="button" onClick={() => { onPick(null, null); setOpen(false); setQuery(''); }}
            title="Zrušit vazbu" aria-label="Zrušit vazbu"
            className="shrink-0 btn-icon btn-icon-danger transition">
            <Icon name="close" size={13} />
          </button>
        </div>
      ) : open ? (
        <div className="well p-3 space-y-2">
          <input ref={pickInput} autoFocus value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={keys.onInputKeyDown}
            placeholder="Hledat položku v kase…"
            className="field w-full" />
          {query.trim().length >= 2 && found.length === 0 && (
            <p className="t-meta">{note || 'Nic takového v menu není.'}</p>
          )}
          {found.length > 0 && (
            <div ref={pickList} onKeyDown={keys.onListKeyDown}
              className="max-h-44 overflow-y-auto scrollbar-thin divide-y divide-black/[0.05]">
              {found.map(p => (
                <button key={p.productId} type="button"
                  onClick={() => { onPick(p.productId, p.name); setOpen(false); setQuery(''); }}
                  className="w-full text-left px-1 py-2 hover:bg-black/[0.03] transition">
                  <span className="block text-sm text-[#16181A] truncate">{p.name}</span>
                  <span className="block t-meta truncate">
                    {p.category || 'bez kategorie'}{p.price != null ? ` · ${p.price} Kč` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => { setOpen(false); setQuery(''); setFound([]); }}
            className="btn btn-ghost btn-sm">Zrušit</button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)}
          className="btn btn-secondary btn-sm">
          <Icon name="plus" size={15} /> Připojit k položce v kase
        </button>
      )}
    </div>
  );
}
