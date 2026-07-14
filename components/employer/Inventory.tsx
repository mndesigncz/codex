'use client';

import { useState, useEffect } from 'react';

interface InventoryItem {
  id: number;
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
  maxQuantity: number;
  unit: string;
  supplier?: string;
}

const CATEGORIES = ['Všechny', 'Čaje', 'Přísady', 'Nádobí', 'Doplňky'];

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState('Všechny');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/inventory')
      .then(r => r.json())
      .then(data => { setItems(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = items.filter(i => {
    const catMatch = selectedCat === 'Všechny' || i.category === selectedCat;
    const searchMatch = i.name.toLowerCase().includes(search.toLowerCase());
    return catMatch && searchMatch;
  });

  const lowStock = items.filter(i => i.quantity < i.minQuantity);

  const getStockLevel = (item: InventoryItem) => {
    const pct = (item.quantity / item.maxQuantity) * 100;
    if (item.quantity < item.minQuantity) return 'low';
    if (pct < 40) return 'medium';
    return 'ok';
  };

  const stockColor = (level: string) => {
    if (level === 'low') return 'bg-red-400';
    if (level === 'medium') return 'bg-orange-400';
    return 'bg-[#C8F542]';
  };

  return (
    <div className="p-6 space-y-6">
      {lowStock.length > 0 && (
        <div className="glass-card border-red-500/20 bg-red-500/[0.06] p-5">
          <p className="text-red-400 font-semibold text-sm">⚠️ {lowStock.length} položek pod minimální zásobou:</p>
          <p className="text-red-400/70 text-sm mt-1">{lowStock.map(i => i.name).join(', ')}</p>
        </div>
      )}

      {/* Search & filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Hledat položku..."
          className="flex-1 rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm"
        />
        <div className="flex gap-1 overflow-x-auto glass rounded-full p-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCat(cat)}
              className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-300 ${
                selectedCat === cat ? 'bg-[#C8F542] text-black' : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-[#C8F542] animate-spin" />
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-5 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Název</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider hidden sm:table-cell">Kategorie</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Množství</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider hidden md:table-cell">Stav</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider hidden lg:table-cell">Dodavatel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filtered.map(item => {
                const level = getStockLevel(item);
                const pct = Math.min(100, Math.round((item.quantity / item.maxQuantity) * 100));
                return (
                  <tr key={item.id} className={`hover:bg-white/[0.04] transition-colors ${level === 'low' ? 'bg-red-500/[0.04]' : ''}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {level === 'low' && <span className="text-red-400 text-sm">⚠️</span>}
                        <span className="text-sm font-medium text-white">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden sm:table-cell">
                      <span className="text-xs rounded-full px-3 py-1 font-medium bg-white/[0.08] text-white/60">{item.category}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-sm font-semibold ${level === 'low' ? 'text-red-400' : 'text-white'}`}>
                        {item.quantity} {item.unit}
                      </span>
                      <span className="text-xs text-white/30 ml-1">/ min. {item.minQuantity}</span>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <div className="w-24">
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className={`h-full ${stockColor(level)} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-white/30 mt-1 block">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <span className="text-xs text-white/40">{item.supplier ?? '—'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-white/40 text-sm">Žádné položky nenalezeny.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
