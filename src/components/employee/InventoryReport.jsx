import { useState } from 'react';
import { inventory } from '../../data/mockData.js';

const categories = ['Vše', 'Čaje', 'Přísady', 'Nádobí', 'Doplňky'];

function StockBar({ quantity, min, max }) {
  const pct = Math.min(100, Math.round((quantity / max) * 100));
  const isLow = quantity <= min;
  const isCritical = quantity <= min * 0.5;
  return (
    <div className="w-full bg-tea-100 rounded-full h-2">
      <div
        className={`h-full rounded-full ${isCritical ? 'bg-red-500' : isLow ? 'bg-amber-400' : 'bg-matcha-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function InventoryReport({ user }) {
  const [activeCategory, setActiveCategory] = useState('Vše');
  const [search, setSearch] = useState('');
  const [reportedItems, setReportedItems] = useState([]);
  const [reportText, setReportText] = useState({});
  const [submittedReport, setSubmittedReport] = useState(false);

  const filtered = inventory.filter(item => {
    const catMatch = activeCategory === 'Vše' || item.category === activeCategory;
    const searchMatch = item.name.toLowerCase().includes(search.toLowerCase());
    return catMatch && searchMatch;
  });

  const lowStockItems = inventory.filter(i => i.quantity <= i.minQuantity);

  const handleToggleReport = (itemId) => {
    setReportedItems(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const handleSubmitReport = () => {
    if (reportedItems.length === 0) return;
    setSubmittedReport(true);
    setTimeout(() => {
      setSubmittedReport(false);
      setReportedItems([]);
      setReportText({});
    }, 3000);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-tea-800">📦 Sklad</h1>
        <p className="text-tea-500 text-sm">Přehled zásob a hlášení nedostatků</p>
      </div>

      {/* Alert banner */}
      {lowStockItems.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4">
          <h3 className="font-bold text-amber-800 mb-2">⚠️ Upozornění – nízké zásoby</h3>
          <div className="flex flex-wrap gap-2">
            {lowStockItems.map(item => (
              <span key={item.id} className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full border border-amber-200">
                {item.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Report submitted success */}
      {submittedReport && (
        <div className="bg-matcha-50 border-2 border-matcha-300 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <p className="font-bold text-matcha-800">Zpráva odeslána!</p>
            <p className="text-sm text-matcha-600">Vedení bylo upozorněno na nedostatky v zásobách.</p>
          </div>
        </div>
      )}

      {/* Report selection */}
      {reportedItems.length > 0 && (
        <div className="bg-white rounded-2xl border-2 border-matcha-300 p-5 shadow-sm">
          <h3 className="font-bold text-tea-800 mb-3">📋 Vybrané položky k hlášení ({reportedItems.length})</h3>
          <div className="space-y-3">
            {reportedItems.map(itemId => {
              const item = inventory.find(i => i.id === itemId);
              return (
                <div key={itemId} className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-tea-800">{item?.name}</p>
                    <p className="text-xs text-tea-400">Aktuálně: {item?.quantity} {item?.unit} / Min: {item?.minQuantity} {item?.unit}</p>
                  </div>
                  <input
                    type="text"
                    placeholder="Poznámka (volitelné)"
                    value={reportText[itemId] || ''}
                    onChange={e => setReportText(prev => ({ ...prev, [itemId]: e.target.value }))}
                    className="flex-1 px-2 py-1.5 text-sm border border-tea-200 rounded-lg focus:outline-none focus:border-matcha-500"
                  />
                  <button onClick={() => handleToggleReport(itemId)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => setReportedItems([])}
              className="px-4 py-2 border-2 border-tea-200 text-tea-600 rounded-xl text-sm hover:bg-tea-50 font-medium"
            >
              Zrušit výběr
            </button>
            <button
              onClick={handleSubmitReport}
              className="flex-1 py-2 bg-matcha-600 hover:bg-matcha-700 text-white rounded-xl text-sm font-bold shadow-md"
            >
              📤 Odeslat zprávu vedení ({reportedItems.length} položek)
            </button>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
        <p className="text-sm text-blue-700">
          💡 <strong>Jak nahlásit nedostatek:</strong> Klikněte na tlačítko "Nahlásit" u položek, které docházejí.
          Pak odešlete souhrnnou zprávu vedení.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Hledat položku..."
          className="px-3 py-2 border-2 border-tea-200 rounded-xl text-sm focus:outline-none focus:border-matcha-500 w-48"
        />
        <div className="flex gap-1 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeCategory === cat ? 'bg-matcha-600 text-white' : 'bg-tea-100 text-tea-600 hover:bg-tea-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory list */}
      <div className="bg-white rounded-2xl shadow-sm border border-tea-100 overflow-hidden">
        <div className="divide-y divide-tea-50">
          {filtered.map(item => {
            const isLow = item.quantity <= item.minQuantity;
            const isCritical = item.quantity <= item.minQuantity * 0.5;
            const isReported = reportedItems.includes(item.id);
            return (
              <div key={item.id} className={`flex items-center gap-4 px-5 py-4 hover:bg-tea-50 transition-colors ${isLow ? 'bg-amber-50/30' : ''}`}>
                <span className="text-xl">
                  {isCritical ? '🔴' : isLow ? '🟡' : '🟢'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-tea-800">{item.name}</p>
                  <p className="text-xs text-tea-400">{item.category} · {item.supplier}</p>
                  <div className="mt-1.5 max-w-48">
                    <StockBar quantity={item.quantity} min={item.minQuantity} max={item.maxQuantity} />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-bold ${isLow ? 'text-red-600' : 'text-tea-800'}`}>
                    {item.quantity} {item.unit}
                  </p>
                  <p className="text-xs text-tea-400">Min: {item.minQuantity} {item.unit}</p>
                </div>
                <button
                  onClick={() => handleToggleReport(item.id)}
                  className={`flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                    isReported
                      ? 'bg-matcha-100 text-matcha-700 border-2 border-matcha-400'
                      : isLow
                      ? 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-200'
                      : 'bg-tea-100 text-tea-600 hover:bg-tea-200 border border-tea-200'
                  }`}
                >
                  {isReported ? '✓ Vybráno' : '⚐ Nahlásit'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
