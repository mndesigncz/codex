'use client';

// Druhá strana provázání: z otevřené skladové položky přiřadit, do kterých
// položek v kase patří a kolik jí na jednu porci jde.
//
// Dosud to šlo jen z Receptur — tedy „vyber produkt, pak najdi surovinu".
// Když ale někdo zakládá surovinu, přemýšlí opačně: „tohle je vodka, jde do
// Blue Lagoonu a do Espressa Martini". Tenhle panel to umí i tímhle směrem.

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';

type Link = { productId: string; productName: string | null; amount: number };
type Product = { productId: string; name: string; category?: string | null; price?: number | null };

const field =
  'w-full rounded-2xl bg-white/70 border border-black/[0.08] px-3.5 py-2.5 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none';

const dec = (v: string) => Number(String(v).replace(',', '.')) || 0;
const fmt = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 3 });

export default function ItemRecipeLinks({ item, links, unitLabel, onChanged, onOpenRecipe }: {
  item: { id: number; name: string };
  links: Link[];
  /** Jednotka, ve které se surovina odepisuje — obsahová, když ji položka má. */
  unitLabel: string;
  onChanged: (next: Link[]) => void;
  onOpenRecipe?: (productId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Product[]>([]);
  const [picked, setPicked] = useState<Product | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Menu má u větších podniků skoro tisíc položek — hledáme na serveru.
  useEffect(() => {
    if (!adding || picked) return;
    const q = query.trim();
    if (q.length < 2) { setFound([]); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const d = await fetch(`/api/pos/usage?q=${encodeURIComponent(q)}`).then(r => r.json());
        setFound(Array.isArray(d.products) ? d.products : []);
        if (d.error) setErr(d.error);
      } catch { setFound([]); }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, adding, picked]);

  const send = async (productId: string, productName: string | null, value: number) => {
    setBusy(productId); setErr('');
    try {
      const res = await fetch('/api/pos/usage', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, productName, itemId: item.id, amount: value }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || 'Uložení se nepodařilo.'); setBusy(''); return false; }
      const rest = links.filter(l => l.productId !== productId);
      onChanged(value > 0 ? [...rest, { productId, productName, amount: value }] : rest);
      setBusy('');
      return true;
    } catch { setErr('Uložení se nepodařilo.'); setBusy(''); return false; }
  };

  const confirmAdd = async () => {
    if (!picked) return;
    const v = dec(amount);
    if (!(v > 0)) { setErr('Kolik téhle suroviny jde na jednu porci?'); return; }
    if (await send(picked.productId, picked.name, v)) {
      setAdding(false); setPicked(null); setQuery(''); setAmount(''); setFound([]);
    }
  };

  return (
    <div className="rounded-2xl bg-[#C8F542]/[0.09] border border-[#C8F542]/25 px-4 py-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#5B7A08]">
          Používá se v kase{links.length > 0 ? ` (${links.length}×)` : ''}
        </p>
        {!adding && (
          <button type="button" onClick={() => { setAdding(true); setErr(''); }}
            className="tap-target-sm rounded-full bg-white/70 hover:bg-white border border-black/[0.07] px-3 py-1.5 text-xs font-bold text-[#5B7A08] transition inline-flex items-center gap-1">
            <Icon name="plus" size={13} /> Přidat do receptury
          </button>
        )}
      </div>

      {links.length === 0 && !adding && (
        <p className="text-xs text-black/50">
          Zatím v žádné receptuře. Dokud tam nebude, prodej téhle suroviny sklad neodepíše.
        </p>
      )}

      {links.length > 0 && (
        <div className="space-y-1.5">
          {links.map(l => (
            <div key={l.productId} className="flex items-center gap-2 rounded-2xl bg-white/70 border border-black/[0.06] pl-3.5 pr-2 py-1.5">
              <button type="button" onClick={() => onOpenRecipe?.(l.productId)} title="Otevřít recepturu"
                className="min-w-0 flex-1 text-left text-sm text-[#16181A] truncate hover:text-[#5B7A08] transition">
                {l.productName ?? l.productId}
              </button>
              <input
                defaultValue={fmt(l.amount)} inputMode="decimal"
                onBlur={e => {
                  const v = dec(e.target.value);
                  if (v > 0 && v !== l.amount) send(l.productId, l.productName, v);
                }}
                className="tap-target-sm w-20 shrink-0 rounded-xl bg-black/[0.04] border border-black/[0.07] px-2.5 py-1.5 text-xs text-right tabular-nums text-[#16181A] focus:border-[#C8F542]/50 focus:outline-none"
              />
              <span className="shrink-0 text-[11px] text-black/40 w-8">{unitLabel}</span>
              <button type="button" onClick={() => send(l.productId, l.productName, 0)}
                disabled={busy === l.productId} title="Odebrat z receptury" aria-label="Odebrat z receptury"
                className="shrink-0 rounded-full w-7 h-7 flex items-center justify-center text-black/30 hover:text-red-600 transition">
                <Icon name="close" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="rounded-2xl bg-white/70 border border-black/[0.07] p-3 space-y-2">
          {picked ? (
            <>
              <p className="text-sm text-[#16181A]">
                <b>{picked.name}</b>
                {picked.category ? <span className="text-black/40"> · {picked.category}</span> : null}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-black/50">Na jednu porci jde</span>
                <input autoFocus inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmAdd(); } }}
                  placeholder="0,04" className={`${field} w-24 text-center py-1.5`} />
                <span className="text-xs text-black/50">{unitLabel}</span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={confirmAdd} disabled={!!busy}
                  className="rounded-full bg-[#16181A] text-white px-4 py-2 text-xs font-bold hover:bg-black disabled:opacity-50 transition">
                  {busy ? 'Ukládám…' : 'Přidat'}
                </button>
                <button type="button" onClick={() => { setPicked(null); setAmount(''); }}
                  className="text-xs font-semibold text-black/45 hover:text-black transition">Zpět na hledání</button>
              </div>
            </>
          ) : (
            <>
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Hledat položku v kase…" className={field} />
              {query.trim().length >= 2 && found.length === 0 && (
                <p className="text-xs text-black/40">Nic takového v menu není.</p>
              )}
              {found.length > 0 && (
                <div className="max-h-48 overflow-y-auto scrollbar-thin divide-y divide-black/[0.05]">
                  {found.map(p => (
                    <button key={p.productId} type="button" onClick={() => { setPicked(p); setErr(''); }}
                      className="w-full text-left px-1 py-2 hover:bg-black/[0.03] transition">
                      <span className="block text-sm text-[#16181A] truncate">{p.name}</span>
                      <span className="block text-[11px] text-black/40 truncate">
                        {p.category || 'bez kategorie'}{p.price != null ? ` · ${p.price} Kč` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => { setAdding(false); setQuery(''); setFound([]); setErr(''); }}
                className="text-xs font-semibold text-black/45 hover:text-black transition">Zrušit</button>
            </>
          )}
        </div>
      )}

      {err && <p className="text-xs text-red-600">{err}</p>}

      {links.length > 0 && (
        <p className="text-[11px] text-black/45">
          Změna velikosti balení nebo ceny se propíše do marží těchhle položek.
        </p>
      )}
    </div>
  );
}
