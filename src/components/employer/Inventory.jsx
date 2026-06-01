import { useState } from 'react';
import { inventory as initialInventory } from '../../data/mockData.js';

const categories = ['Vše', 'Čaje', 'Přísady', 'Nádobí', 'Doplňky'];

function StockBar({ quantity, min, max }) {
  const pct = Math.min(100, Math.round((quantity / max) * 100));
  const isLow = quantity <= min;
  const isCritical = quantity <= min * 0.5;
  return (
    <div className="w-full bg-elevated rounded-full h-2 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${isCritical ? 'bg-danger' : isLow ? 'bg-warning' : 'bg-accent'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function Inventory() {
  const [items, setItems] = useState(initialInventory);
  const [activeCategory, setActiveCategory] = useState('Vše');
  const [activeTab, setActiveTab] = useState('stock');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', category: 'Čaje', unit: 'g', quantity: 0, minQuantity: 100, maxQuantity: 1000, price: 0, supplier: '' });

  const filtered = items.filter(item => {
    const catMatch = activeCategory === 'Vše' || item.category === activeCategory;
    const searchMatch = item.name.toLowerCase().includes(search.toLowerCase());
    return catMatch && searchMatch;
  });

  const lowStock = items.filter(i => i.quantity <= i.minQuantity);
  const shoppingList = items.filter(i => i.quantity <= i.minQuantity);

  const handleUpdateQty = (id) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: parseFloat(editQty) || i.quantity } : i));
    setEditingId(null);
  };

  const handleAddItem = () => {
    const id = Math.max(...items.map(i => i.id)) + 1;
    setItems(prev => [...prev, { ...newItem, id, quantity: parseFloat(newItem.quantity), lastOrdered: new Date().toISOString().split('T')[0] }]);
    setShowAddModal(false);
    setNewItem({ name: '', category: 'Čaje', unit: 'g', quantity: 0, minQuantity: 100, maxQuantity: 1000, price: 0, supplier: '' });
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Sklad & Zásoby</h1>
          <p className="text-text-secondary text-sm">{items.length} položek · {lowStock.length} pod minimem</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-accent hover:bg-accent/90 text-black font-semibold rounded-xl transition-all shadow-lg text-sm"
        >
          <span>+</span>
          <span className="hidden sm:inline">Přidat položku</span>
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: 'Celkem položek', value: items.length, icon: '📦', accent: 'bg-accent-blue/10 border-accent-blue/30 text-accent-blue' },
          { label: 'Pod minimem', value: lowStock.length, icon: '⚠️', accent: 'bg-warning/10 border-warning/30 text-warning' },
          { label: 'Kategorie', value: categories.length - 1, icon: '🏷️', accent: 'bg-accent/10 border-accent/30 text-accent' },
          { label: 'Dodavatelé', value: [...new Set(items.map(i => i.supplier))].length, icon: '🚚', accent: 'bg-elevated border-border text-text-secondary' },
        ].map(c => (
          <div key={c.label} className={`rounded-2xl border p-4 ${c.accent}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-70">{c.label}</p>
                <p className="text-2xl font-bold text-white">{c.value}</p>
              </div>
              <span className="text-2xl">{c.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-elevated p-1 rounded-xl w-fit">
        {[
          ['stock', '📦 Zásoby'],
          ['shopping', `🛒 Nákup${shoppingList.length > 0 ? ` (${shoppingList.length})` : ''}`]
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all ${
              activeTab === id ? 'bg-card text-white shadow' : 'text-text-secondary hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'stock' && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 px-4 md:px-5 py-4 border-b border-border">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Hledat položku..."
              className="px-3 py-2 bg-elevated border border-border rounded-xl text-sm focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50 w-48"
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

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-text-secondary uppercase bg-elevated border-b border-border">
                  <th className="text-left px-4 md:px-5 py-3 font-semibold">Název</th>
                  <th className="text-left px-3 py-3 font-semibold hidden sm:table-cell">Kat.</th>
                  <th className="text-right px-3 py-3 font-semibold">Množství</th>
                  <th className="px-4 py-3 font-semibold w-28 hidden md:table-cell">Stav</th>
                  <th className="text-right px-3 py-3 font-semibold hidden lg:table-cell">Min/Max</th>
                  <th className="text-left px-3 py-3 font-semibold hidden lg:table-cell">Dodavatel</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(item => {
                  const isLow = item.quantity <= item.minQuantity;
                  const isCritical = item.quantity <= item.minQuantity * 0.5;
                  return (
                    <tr key={item.id} className={`hover:bg-elevated transition-colors ${isLow ? 'bg-danger/5' : ''}`}>
                      <td className="px-4 md:px-5 py-3">
                        <div className="flex items-center gap-2">
                          {isCritical ? '🔴' : isLow ? '🟡' : '🟢'}
                          <span className="text-sm font-medium text-white">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell">
                        <span className="text-xs px-2 py-0.5 bg-elevated text-text-secondary rounded-full border border-border">{item.category}</span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {editingId === item.id ? (
                          <div className="flex items-center gap-1 justify-end">
                            <input
                              type="number"
                              value={editQty}
                              onChange={e => setEditQty(e.target.value)}
                              className="w-20 px-2 py-1 bg-elevated border border-accent rounded-lg text-sm text-right focus:outline-none text-white"
                              autoFocus
                            />
                            <button onClick={() => handleUpdateQty(item.id)} className="text-accent hover:text-accent/80 text-sm">✓</button>
                            <button onClick={() => setEditingId(null)} className="text-danger hover:text-danger/80 text-sm">✕</button>
                          </div>
                        ) : (
                          <span className={`text-sm font-semibold ${isLow ? 'text-danger' : 'text-white'}`}>
                            {item.quantity} {item.unit}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <StockBar quantity={item.quantity} min={item.minQuantity} max={item.maxQuantity} />
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-text-secondary hidden lg:table-cell">
                        {item.minQuantity}/{item.maxQuantity} {item.unit}
                      </td>
                      <td className="px-3 py-3 text-xs text-text-secondary hidden lg:table-cell">{item.supplier}</td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => { setEditingId(item.id); setEditQty(String(item.quantity)); }}
                          className="text-xs px-2 py-1 text-text-secondary hover:text-white hover:bg-elevated rounded-lg transition-colors"
                        >
                          ✏️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'shopping' && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-4 md:px-5 py-4 border-b border-border">
            <h3 className="font-bold text-white">🛒 Nákupní seznam</h3>
            <p className="text-sm text-text-secondary mt-0.5">Položky pod minimální zásobou</p>
          </div>
          {shoppingList.length === 0 ? (
            <div className="p-8 text-center text-accent">
              <p className="text-2xl mb-2">✅</p>
              <p className="font-semibold text-white">Vše je doplněno!</p>
              <p className="text-sm text-text-secondary mt-1">Žádné položky nevyžadují doplnění.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {shoppingList.map(item => {
                const needed = item.maxQuantity - item.quantity;
                return (
                  <div key={item.id} className="flex items-center gap-4 px-4 md:px-5 py-4">
                    <span className="text-xl">{item.quantity <= item.minQuantity * 0.5 ? '🔴' : '🟡'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white">{item.name}</p>
                      <p className="text-xs text-text-secondary">{item.supplier}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-accent">+{needed} {item.unit}</p>
                      <p className="text-xs text-text-secondary">Má: {item.quantity} / Min: {item.minQuantity}</p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-semibold text-white">~{(needed * item.price).toFixed(0)} Kč</p>
                      <p className="text-xs text-text-secondary">{item.price} Kč/{item.unit}</p>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between px-4 md:px-5 py-4 bg-elevated font-bold">
                <span className="text-text-secondary">Celková odhadovaná cena:</span>
                <span className="text-accent text-lg">
                  {shoppingList.reduce((sum, item) => sum + (item.maxQuantity - item.quantity) * item.price, 0).toFixed(0)} Kč
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add item modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
              <h3 className="font-bold text-white text-lg">Nová položka</h3>
              <button onClick={() => setShowAddModal(false)} className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-white bg-elevated rounded-lg">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {[
                ['Název', 'name', 'text', 'Název položky'],
                ['Dodavatel', 'supplier', 'text', 'Název dodavatele'],
              ].map(([label, key, type, placeholder]) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">{label}</label>
                  <input
                    type={type}
                    value={newItem[key]}
                    onChange={e => setNewItem(s => ({ ...s, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50 text-sm"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Kategorie</label>
                <select
                  value={newItem.category}
                  onChange={e => setNewItem(s => ({ ...s, category: e.target.value }))}
                  className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white text-sm"
                >
                  {categories.filter(c => c !== 'Vše').map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Jednotka', 'unit', 'text', 'g, ks, l...'],
                  ['Aktuální množství', 'quantity', 'number', '0'],
                  ['Minimální množství', 'minQuantity', 'number', '100'],
                  ['Maximální množství', 'maxQuantity', 'number', '1000'],
                ].map(([label, key, type, placeholder]) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">{label}</label>
                    <input
                      type={type}
                      value={newItem[key]}
                      onChange={e => setNewItem(s => ({ ...s, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-3 border border-border text-text-secondary rounded-2xl hover:bg-elevated font-semibold text-sm transition-colors">Zrušit</button>
              <button onClick={handleAddItem} className="flex-1 py-3 bg-accent hover:bg-accent/90 text-black rounded-2xl font-bold shadow-lg text-sm transition-colors">Přidat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
