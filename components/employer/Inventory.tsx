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
    if (level === 'low') return 'bg-red-500';
    if (level === 'medium') return 'bg-amber-500';
    return 'bg-matcha-500';
  };

  return (
    <div className="p-6 space-y-5">
      {lowStock.length > 0 && (
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4">
          <p className="text-red-700 font-semibold text-sm">⚠️ {lowStock.length} položek pod minimální zásobou:</p>
          <p className="text-red-600 text-sm mt-1">{lowStock.map(i => i.name).join(', ')}</p>
        </div>
      )}

      {/* Search & filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Hledat položku..."
          className="flex-1 px-4 py-2.5 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-tea-800 placeholder:text-tea-300 text-sm"
        />
        <div className="flex gap-1 overflow-x-auto">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCat(cat)}
              className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                selectedCat === cat ? 'bg-matcha-600 text-white' : 'bg-tea-100 text-tea-600 hover:bg-tea-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-4xl animate-spin">⏳</div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border-2 border-tea-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-tea-100 bg-tea-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-tea-600 uppercase">Název</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-tea-600 uppercase hidden sm:table-cell">Kategorie</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-tea-600 uppercase">Množství</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-tea-600 uppercase hidden md:table-cell">Stav</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-tea-600 uppercase hidden lg:table-cell">Dodavatel</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => {
                const level = getStockLevel(item);
                const pct = Math.min(100, Math.round((item.quantity / item.maxQuantity) * 100));
                return (
                  <tr key={item.id} className={`border-b border-tea-50 hover:bg-tea-50/50 transition-colors ${level === 'low' ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {level === 'low' && <span className="text-red-500 text-sm">⚠️</span>}
                        <span className="text-sm font-medium text-tea-800">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs bg-tea-100 text-tea-600 px-2 py-0.5 rounded-full">{item.category}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-semibold ${level === 'low' ? 'text-red-600' : 'text-tea-800'}`}>
                        {item.quantity} {item.unit}
                      </span>
                      <span className="text-xs text-tea-400 ml-1">/ min. {item.minQuantity}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="w-24">
                        <div className="h-2 bg-tea-100 rounded-full overflow-hidden">
                          <div className={`h-full ${stockColor(level)} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-tea-400 mt-0.5 block">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-tea-500">{item.supplier ?? '—'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-tea-400 text-sm">Žádné položky nenalezeny.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
