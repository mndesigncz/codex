'use client';

// K jaké položce v kase návod patří.
//
// Bez téhle vazby je „Jak udělat Blue Lagoon" jen text — se vazbou z něj jde
// složit receptura a z receptury naopak odkázat na postup.

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';

type Product = { productId: string; name: string; category?: string | null; price?: number | null };

export default function GuideProductLink({ productId, productName, onPick }: {
  productId: string | null;
  productName: string | null;
  onPick: (id: string | null, name: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
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
        const d = await fetch(`/api/pos/usage?q=${encodeURIComponent(q)}`).then(r => r.json());
        setFound(Array.isArray(d.products) ? d.products : []);
        setNote(d.error ?? '');
      } catch { setFound([]); }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, open]);

  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Položka v kase (volitelné)</label>
      {productId ? (
        <div className="flex items-center gap-2 rounded-2xl bg-[#C8F542]/[0.09] border border-[#C8F542]/25 px-4 py-2.5">
          <Icon name="receipt" size={15} className="shrink-0 text-[#5B7A08]" />
          <span className="min-w-0 flex-1 truncate text-sm text-[#16181A]">{productName ?? productId}</span>
          <button type="button" onClick={() => { onPick(null, null); setOpen(false); setQuery(''); }}
            title="Zrušit vazbu" aria-label="Zrušit vazbu"
            className="shrink-0 rounded-full w-7 h-7 flex items-center justify-center text-black/35 hover:text-red-600 transition">
            <Icon name="close" size={13} />
          </button>
        </div>
      ) : open ? (
        <div className="rounded-2xl bg-black/[0.03] border border-black/[0.07] p-3 space-y-2">
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Hledat položku v kase…"
            className="w-full rounded-2xl bg-white/70 border border-black/[0.08] px-3.5 py-2.5 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none" />
          {query.trim().length >= 2 && found.length === 0 && (
            <p className="text-xs text-black/40">{note || 'Nic takového v menu není.'}</p>
          )}
          {found.length > 0 && (
            <div className="max-h-44 overflow-y-auto scrollbar-thin divide-y divide-black/[0.05]">
              {found.map(p => (
                <button key={p.productId} type="button"
                  onClick={() => { onPick(p.productId, p.name); setOpen(false); setQuery(''); }}
                  className="w-full text-left px-1 py-2 hover:bg-black/[0.03] transition">
                  <span className="block text-sm text-[#16181A] truncate">{p.name}</span>
                  <span className="block text-[11px] text-black/40 truncate">
                    {p.category || 'bez kategorie'}{p.price != null ? ` · ${p.price} Kč` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => { setOpen(false); setQuery(''); setFound([]); }}
            className="text-xs font-semibold text-black/45 hover:text-black transition">Zrušit</button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)}
          className="w-full rounded-2xl glass border border-black/10 text-black/60 hover:bg-black/[0.06] hover:text-black px-4 py-2.5 text-sm text-left transition inline-flex items-center gap-2">
          <Icon name="plus" size={15} /> Připojit k položce v kase
        </button>
      )}
    </div>
  );
}
