'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from '../Icons';

interface Item {
  id: number;
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
  criticalQuantity: number;
  unit: string;
}

const statusOf = (i: Item) =>
  i.quantity <= (i.criticalQuantity ?? 0) ? 'critical' : i.quantity <= i.minQuantity ? 'low' : 'ok';

export default function KioskInventory() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('Vše');
  const [search, setSearch] = useState('');
  // Debounced quantity saves so rapid taps don't spam the server.
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    fetch('/api/inventory').then(r => r.json()).then(d => { if (Array.isArray(d)) setItems(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const cats = useMemo(() => ['Vše', ...Array.from(new Set(items.map(i => i.category).filter(Boolean)))], [items]);
  const filtered = items.filter(i =>
    (cat === 'Vše' || i.category === cat) &&
    (!search.trim() || i.name.toLowerCase().includes(search.trim().toLowerCase())));

  const step = (item: Item, delta: number) => {
    const next = Math.max(0, item.quantity + delta);
    setItems(list => list.map(x => x.id === item.id ? { ...x, quantity: next } : x));
    clearTimeout(timers.current[item.id]);
    timers.current[item.id] = setTimeout(() => {
      fetch(`/api/inventory/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: next }),
      }).catch(() => { /* best-effort */ });
    }, 500);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30 pointer-events-none"><Icon name="search" size={17} /></span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hledat položku…"
          className="w-full rounded-2xl bg-white/70 border border-black/[0.08] pl-11 pr-4 py-3.5 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none text-base" />
      </div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1">
        {cats.map(c => (
          <button key={c} onClick={() => setCat(c)}
            className={`px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap shrink-0 transition ${cat === c ? 'bg-[#16181A] text-white' : 'glass text-black/55'}`}>
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-black/45">Žádné položky.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(i => {
            const st = statusOf(i);
            const dot = st === 'critical' ? 'bg-red-500' : st === 'low' ? 'bg-orange-500' : 'bg-[#C8F542]';
            return (
              <div key={i.id} className={`glass-card p-4 flex items-center gap-3 ${st === 'critical' ? 'border-red-500/25' : ''}`}>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#16181A] truncate">{i.name}</p>
                  <p className="text-xs text-black/40 truncate">{i.category}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => step(i, -1)}
                    className="rounded-2xl glass border border-black/10 w-12 h-12 flex items-center justify-center text-2xl leading-none text-black/70 active:scale-95 transition">−</button>
                  <span className="w-16 text-center font-bold text-[#16181A] tabular-nums text-lg">
                    {i.quantity}<span className="block text-[10px] font-medium text-black/40 leading-none">{i.unit}</span>
                  </span>
                  <button onClick={() => step(i, 1)}
                    className="rounded-2xl bg-[#C8F542] w-12 h-12 flex items-center justify-center text-2xl leading-none text-black active:scale-95 transition">+</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
