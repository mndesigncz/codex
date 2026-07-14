'use client';

import { useState, useEffect } from 'react';

interface InventoryItem {
  id: number;
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
  unit: string;
}

interface Props {
  user: { id?: string; name?: string | null };
}

export default function InventoryReport({ user }: Props) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/inventory')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setItems(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const toggle = (id: number) => {
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/inventory/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportedBy: parseInt(user.id ?? '0'),
          items: JSON.stringify(selected),
          note,
        }),
      });
      if (res.ok) {
        setSuccess(true);
        setSelected([]);
        setNote('');
        setTimeout(() => setSuccess(false), 4000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const lowStock = items.filter(i => i.quantity < i.minQuantity);
  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-5">
      <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4">
        <p className="text-amber-700 font-semibold text-sm">⚠️ Nahlásit nízký stav zásob</p>
        <p className="text-amber-600 text-xs mt-1">Zaškrtněte položky, které je potřeba doplnit, a odešlete hlášení zaměstnavateli.</p>
      </div>

      {success && (
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-3 text-green-700 text-sm">
          ✅ Hlášení bylo odesláno zaměstnavateli.
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4">
          <p className="text-red-700 font-semibold text-sm mb-2">Položky pod minimem:</p>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(i => (
              <button key={i.id} onClick={() => toggle(i.id)}
                className={`text-xs px-3 py-1.5 rounded-full border-2 font-medium transition-all ${selected.includes(i.id) ? 'bg-red-500 text-white border-red-500' : 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200'}`}>
                {i.name} ({i.quantity} {i.unit})
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Hledat položku..."
          className="w-full max-w-sm px-4 py-2.5 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm text-tea-800 placeholder:text-tea-300"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="text-4xl animate-spin">⏳</div></div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-white rounded-2xl border-2 border-tea-100 overflow-hidden">
            <div className="p-3 bg-tea-50 border-b border-tea-100">
              <p className="text-xs font-semibold text-tea-600 uppercase">Vyberte položky k nahlášení ({selected.length} vybráno)</p>
            </div>
            <div className="divide-y divide-tea-50">
              {filtered.map(item => {
                const isLow = item.quantity < item.minQuantity;
                const isChecked = selected.includes(item.id);
                return (
                  <label key={item.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-tea-50 transition-colors ${isChecked ? 'bg-matcha-50' : ''}`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(item.id)}
                      className="accent-matcha-600 w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-tea-800">{item.name}</p>
                      <p className="text-xs text-tea-400">{item.category}</p>
                    </div>
                    <span className={`text-xs font-medium ${isLow ? 'text-red-600' : 'text-tea-500'}`}>
                      {item.quantity} {item.unit}
                      {isLow && ' ⚠️'}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-tea-700 mb-1">Poznámka (volitelné)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="Popište stav zásob nebo další informace..."
              className="w-full px-4 py-2.5 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm text-tea-800 resize-none placeholder:text-tea-300" />
          </div>

          <button type="submit" disabled={selected.length === 0 || submitting}
            className="px-6 py-3 bg-matcha-600 hover:bg-matcha-700 disabled:bg-matcha-400 text-white font-semibold rounded-xl transition-all disabled:cursor-not-allowed">
            {submitting ? '⏳ Odesílám...' : `📤 Odeslat hlášení (${selected.length} položek)`}
          </button>
        </form>
      )}
    </div>
  );
}
