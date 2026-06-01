import { useState } from 'react';
import { inventory } from '../../data/mockData.js';

function getStatus(item) {
  if (item.quantity <= 0) return { label: 'Prázdné', color: 'bg-red-600 text-white', bar: 'bg-red-500', pct: 0, alert: true };
  if (item.quantity <= item.minQuantity) return { label: 'Kritické', color: 'bg-red-100 text-red-700 border border-red-200', bar: 'bg-red-400', pct: (item.quantity / item.maxQuantity) * 100, alert: true };
  if (item.quantity <= item.minQuantity * 1.5) return { label: 'Nízké', color: 'bg-amber-100 text-amber-700 border border-amber-200', bar: 'bg-amber-400', pct: (item.quantity / item.maxQuantity) * 100, alert: true };
  return { label: 'OK', color: 'bg-matcha-100 text-matcha-700 border border-matcha-200', bar: 'bg-matcha-400', pct: (item.quantity / item.maxQuantity) * 100, alert: false };
}

export default function InventoryReport({ user }) {
  const [items, setItems] = useState(inventory);
  const [reported, setReported] = useState(new Set());
  const [category, setCategory] = useState('Vše');
  const [search, setSearch] = useState('');
  const [showOnlyLow, setShowOnlyLow] = useState(false);
  const [toast, setToast] = useState(null);

  const categories = ['Vše', ...new Set(inventory.map(i => i.category))];

  const filtered = items.filter(item => {
    const matchCat = category === 'Vše' || item.category === category;
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const st = getStatus(item);
    const matchLow = !showOnlyLow || st.alert;
    return matchCat && matchSearch && matchLow;
  });

  const reportLow = (id) => {
    setReported(prev => new Set([...prev, id]));
    const item = items.find(i => i.id === id);
    setToast(`📢 Nahlášeno: "${item?.name}" dochází`);
    setTimeout(() => setToast(null), 3000);
  };

  const alertCount = items.filter(i => getStatus(i).alert).length;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-matcha-700 text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-medium animate-bounce">
          {toast}
        </div>
      )}

      {/* Info banner */}
      <div className="bg-matcha-50 border border-matcha-200 rounded-2xl p-4 text-sm text-matcha-700">
        <p className="font-semibold mb-1">📦 Správa zásob</p>
        <p>Pokud zpozorujete, že nějaká položka dochází, stiskněte tlačítko <strong>Nahlásit</strong>. Zaměstnavatel dostane upozornění.</p>
      </div>

      {/* Alert summary */}
      {alertCount > 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div className="flex-1">
            <p className="font-bold text-amber-800">{alertCount} položek potřebuje doplnit</p>
            <p className="text-sm text-amber-600">{reported.size} z nich jste již nahlásili</p>
          </div>
          <button
            onClick={() => setShowOnlyLow(v => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              showOnlyLow ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
            }`}
          >
            {showOnlyLow ? '👁 Zobrazit vše' : '🔍 Jen kritické'}
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="🔍 Hledat..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-400 w-40"
        />
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              category === cat ? 'bg-matcha-600 text-white' : 'bg-white border border-tea-200 text-tea-600 hover:bg-tea-50'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Items list */}
      <div className="space-y-3">
        {filtered.map(item => {
          const st = getStatus(item);
          const isReported = reported.has(item.id);
          return (
            <div
              key={item.id}
              className={`bg-white rounded-2xl border-2 shadow-sm p-4 transition-all ${
                st.alert ? 'border-red-200' : 'border-tea-100'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold text-tea-800 text-sm">{item.name}</p>
                    <span className="text-xs bg-tea-100 text-tea-500 px-1.5 py-0.5 rounded-full">{item.category}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                  </div>

                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex-1 bg-tea-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${st.bar} transition-all`}
                        style={{ width: `${Math.min(st.pct, 100)}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-tea-600 flex-shrink-0 font-medium">
                      {item.quantity} {item.unit} / {item.minQuantity} {item.unit} min.
                    </span>
                  </div>
                </div>

                {st.alert && (
                  <div className="flex-shrink-0">
                    {isReported ? (
                      <span className="flex items-center gap-1 text-xs text-matcha-600 bg-matcha-50 px-3 py-2 rounded-xl font-medium border border-matcha-200">
                        ✓ Nahlášeno
                      </span>
                    ) : (
                      <button
                        onClick={() => reportLow(item.id)}
                        className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white text-xs rounded-xl font-semibold transition-colors active:scale-95"
                      >
                        📢 Nahlásit
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-tea-100 p-12 text-center">
            <p className="text-3xl mb-2">✅</p>
            <p className="text-matcha-600 font-semibold">
              {showOnlyLow ? 'Žádné kritické zásoby!' : 'Žádné položky nenalezeny'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
