import { useState } from 'react';
import { inventory } from '../../data/mockData.js';

const categories = ['Vše', 'Čaje', 'Přísady', 'Nádobí', 'Doplňky'];

function StockBar({ quantity, min, max }) {
  const pct = Math.min(100, Math.round((quantity / max) * 100));
  const isLow = quantity <= min;
  const isCritical = quantity <= min * 0.5;
  return (
    <div className="w-full bg-elevated rounded-full h-2 overflow-hidden">
      <div
        className={`h-full rounded-full ${isCritical ? 'bg-danger' : isLow ? 'bg-warning' : 'bg-accent'}`}
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
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-white">Sklad</h1>
        <p className="text-text-secondary text-sm">Přehled zásob a hlášení nedostatků</p>
      </div>

      {/* Alert banner */}
      {lowStockItems.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-2xl p-4">
          <h3 className="font-bold text-warning mb-2 text-sm">⚠️ Upozornění – nízké zásoby</h3>
          <div className="flex flex-wrap gap-2">
            {lowStockItems.map(item => (
              <span key={item.id} className="text-xs px-2 py-1 bg-warning/20 text-warning rounded-full border border-warning/30">
                {item.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Report submitted success */}
      {submittedReport && (
        <div className="bg-accent/10 border border-accent/30 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <p className="font-bold text-accent">Zpráva odeslána!</p>
            <p className="text-sm text-text-secondary">Vedení bylo upozorněno na nedostatky v zásobách.</p>
          </div>
        </div>
      )}

      {/* Report selection */}
      {reportedItems.length > 0 && (
        <div className="bg-card rounded-2xl border border-accent/30 p-4 md:p-5">
          <h3 className="font-bold text-white mb-3 text-sm">Vybrané položky k hlášení ({reportedItems.length})</h3>
          <div className="space-y-3">
            {reportedItems.map(itemId => {
              const item = inventory.find(i => i.id === itemId);
              return (
                <div key={itemId} className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{item?.name}</p>
                    <p className="text-xs text-text-secondary">Aktuálně: {item?.quantity} {item?.unit} / Min: {item?.minQuantity} {item?.unit}</p>
                  </div>
                  <input
                    type="text"
                    placeholder="Poznámka (volitelné)"
                    value={reportText[itemId] || ''}
                    onChange={e => setReportText(prev => ({ ...prev, [itemId]: e.target.value }))}
                    className="flex-1 px-2 py-1.5 text-sm bg-elevated border border-border rounded-xl focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50"
                  />
                  <button onClick={() => handleToggleReport(itemId)} className="text-danger hover:text-danger/80 text-sm w-6 h-6 flex items-center justify-center">✕</button>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => setReportedItems([])}
              className="px-4 py-2 border border-border text-text-secondary rounded-xl text-sm hover:bg-elevated font-medium transition-colors"
            >
              Zrušit výběr
            </button>
            <button
              onClick={handleSubmitReport}
              className="flex-1 py-2 bg-accent hover:bg-accent/90 text-black rounded-xl text-sm font-bold shadow-lg transition-colors"
            >
              Odeslat zprávu vedení ({reportedItems.length} položek)
            </button>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-accent-blue/10 border border-accent-blue/30 rounded-xl p-3">
        <p className="text-sm text-accent-blue">
          <strong>Jak nahlásit nedostatek:</strong> Klikněte na "Nahlásit" u položek, které docházejí, pak odešlete zprávu.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Hledat položku..."
          className="px-3 py-2 bg-elevated border border-border rounded-xl text-sm focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50 w-44"
        />
        <div className="flex gap-1 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeCategory === cat ? 'bg-accent text-black' : 'bg-elevated text-text-secondary hover:text-white border border-border'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory list */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="divide-y divide-border">
          {filtered.map(item => {
            const isLow = item.quantity <= item.minQuantity;
            const isCritical = item.quantity <= item.minQuantity * 0.5;
            const isReported = reportedItems.includes(item.id);
            return (
              <div key={item.id} className={`flex items-center gap-3 md:gap-4 px-4 md:px-5 py-4 hover:bg-elevated transition-colors ${isLow ? 'bg-danger/5' : ''}`}>
                <span className="text-xl flex-shrink-0">
                  {isCritical ? '🔴' : isLow ? '🟡' : '🟢'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{item.name}</p>
                  <p className="text-xs text-text-secondary">{item.category} · {item.supplier}</p>
                  <div className="mt-1.5 max-w-48">
                    <StockBar quantity={item.quantity} min={item.minQuantity} max={item.maxQuantity} />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-bold ${isLow ? 'text-danger' : 'text-white'}`}>
                    {item.quantity} {item.unit}
                  </p>
                  <p className="text-xs text-text-secondary">Min: {item.minQuantity} {item.unit}</p>
                </div>
                <button
                  onClick={() => handleToggleReport(item.id)}
                  className={`flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all min-h-[36px] ${
                    isReported
                      ? 'bg-accent/20 text-accent border border-accent/40'
                      : isLow
                      ? 'bg-danger/20 text-danger hover:bg-danger/30 border border-danger/30'
                      : 'bg-elevated text-text-secondary hover:text-white border border-border'
                  }`}
                >
                  {isReported ? '✓ Vybráno' : 'Nahlásit'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
