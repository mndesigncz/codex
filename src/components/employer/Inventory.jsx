import { useState } from 'react';
import { inventory as initialInventory } from '../../data/mockData.js';

const categories = ['Vše', 'Čaje', 'Přísady', 'Nádobí', 'Doplňky'];

function StockBar({ quantity, min, max }) {
  const pct = Math.min(100, Math.round((quantity / max) * 100));
  const isLow = quantity <= min;
  const isCritical = quantity <= min * 0.5;
  return (
    <div className="w-full bg-tea-100 rounded-full h-2 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${isCritical ? 'bg-red-500' : isLow ? 'bg-amber-400' : 'bg-matcha-500'}`}
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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-tea-800">📦 Sklad & Zásoby</h1>
          <p className="text-tea-500 text-sm">{items.length} položek · {lowStock.length} pod minimem</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-matcha-600 hover:bg-matcha-700 text-white font-semibold rounded-xl transition-all shadow-md"
        >
          ➕ Přidat položku
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Celkem položek', value: items.length, icon: '📦', color: 'bg-blue-50 border-blue-200 text-blue-700' },
          { label: 'Pod minimem', value: lowStock.length, icon: '⚠️', color: 'bg-amber-50 border-amber-200 text-amber-700' },
          { label: 'Kategorie', value: categories.length - 1, icon: '🏷️', color: 'bg-matcha-50 border-matcha-200 text-matcha-700' },
          { label: 'Dodavatelé', value: [...new Set(items.map(i => i.supplier))].length, icon: '🚚', color: 'bg-tea-50 border-tea-200 text-tea-700' },
        ].map(c => (
          <div key={c.label} className={`rounded-2xl border-2 p-4 ${c.color}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-70">{c.label}</p>
                <p className="text-2xl font-bold">{c.value}</p>
              </div>
              <span className="text-2xl">{c.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-tea-100 p-1 rounded-xl w-fit">
        {[['stock', '📦 Skladové zásoby'], ['shopping', `🛒 Nákupní seznam ${shoppingList.length > 0 ? `(${shoppingList.length})` : ''}`]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === id ? 'bg-white shadow text-matcha-700' : 'text-tea-500 hover:text-tea-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'stock' && (
        <div className="bg-white rounded-2xl shadow-sm border border-tea-100 overflow-hidden">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-tea-100">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Hledat položku..."
              className="px-3 py-2 border-2 border-tea-200 rounded-xl text-sm focus:outline-none focus:border-matcha-500 w-56"
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

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-tea-400 uppercase bg-tea-50 border-b border-tea-100">
                  <th className="text-left px-5 py-3 font-semibold">Název</th>
                  <th className="text-left px-3 py-3 font-semibold">Kat.</th>
                  <th className="text-right px-3 py-3 font-semibold">Množství</th>
                  <th className="px-4 py-3 font-semibold w-32">Stav</th>
                  <th className="text-right px-3 py-3 font-semibold">Min/Max</th>
                  <th className="text-left px-3 py-3 font-semibold">Dodavatel</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tea-50">
                {filtered.map(item => {
                  const isLow = item.quantity <= item.minQuantity;
                  const isCritical = item.quantity <= item.minQuantity * 0.5;
                  return (
                    <tr key={item.id} className={`hover:bg-tea-50 transition-colors ${isLow ? 'bg-red-50/30' : ''}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {isCritical ? '🔴' : isLow ? '🟡' : '🟢'}
                          <span className="text-sm font-medium text-tea-800">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs px-2 py-0.5 bg-tea-100 text-tea-600 rounded-full">{item.category}</span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {editingId === item.id ? (
                          <div className="flex items-center gap-1 justify-end">
                            <input
                              type="number"
                              value={editQty}
                              onChange={e => setEditQty(e.target.value)}
                              className="w-20 px-2 py-1 border-2 border-matcha-500 rounded-lg text-sm text-right focus:outline-none"
                              autoFocus
                            />
                            <button onClick={() => handleUpdateQty(item.id)} className="text-matcha-600 hover:text-matcha-800 text-sm">✓</button>
                            <button onClick={() => setEditingId(null)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
                          </div>
                        ) : (
                          <span className={`text-sm font-semibold ${isLow ? 'text-red-600' : 'text-tea-800'}`}>
                            {item.quantity} {item.unit}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StockBar quantity={item.quantity} min={item.minQuantity} max={item.maxQuantity} />
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-tea-400">
                        {item.minQuantity}/{item.maxQuantity} {item.unit}
                      </td>
                      <td className="px-3 py-3 text-xs text-tea-500">{item.supplier}</td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => { setEditingId(item.id); setEditQty(String(item.quantity)); }}
                          className="text-xs px-2 py-1 text-matcha-600 hover:bg-matcha-50 rounded-lg transition-colors"
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
        <div className="bg-white rounded-2xl shadow-sm border border-tea-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-tea-100">
            <h3 className="font-bold text-tea-800">🛒 Nákupní seznam</h3>
            <p className="text-sm text-tea-500 mt-0.5">Položky pod minimální zásobou</p>
          </div>
          {shoppingList.length === 0 ? (
            <div className="p-8 text-center text-matcha-600">
              <p className="text-2xl mb-2">✅</p>
              <p className="font-semibold">Vše je doplněno!</p>
              <p className="text-sm text-tea-400 mt-1">Žádné položky nevyžadují doplnění.</p>
            </div>
          ) : (
            <div className="divide-y divide-tea-50">
              {shoppingList.map(item => {
                const needed = item.maxQuantity - item.quantity;
                return (
                  <div key={item.id} className="flex items-center gap-4 px-5 py-4">
                    <span className="text-xl">{item.quantity <= item.minQuantity * 0.5 ? '🔴' : '🟡'}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-tea-800">{item.name}</p>
                      <p className="text-xs text-tea-400">Dodavatel: {item.supplier}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-matcha-700">
                        +{needed} {item.unit}
                      </p>
                      <p className="text-xs text-tea-400">Má: {item.quantity} / Min: {item.minQuantity}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-tea-700">
                        ~{(needed * item.price).toFixed(0)} Kč
                      </p>
                      <p className="text-xs text-tea-400">{item.price} Kč/{item.unit}</p>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between px-5 py-4 bg-tea-50 font-bold">
                <span className="text-tea-700">Celková odhadovaná cena:</span>
                <span className="text-matcha-700 text-lg">
                  {shoppingList.reduce((sum, item) => sum + (item.maxQuantity - item.quantity) * item.price, 0).toFixed(0)} Kč
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add item modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-tea-100 sticky top-0 bg-white">
              <h3 className="font-bold text-tea-800 text-lg">➕ Nová položka</h3>
              <button onClick={() => setShowAddModal(false)} className="text-tea-400 hover:text-tea-700 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {[
                ['Název', 'name', 'text', 'Název položky'],
                ['Dodavatel', 'supplier', 'text', 'Název dodavatele'],
              ].map(([label, key, type, placeholder]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-tea-700 mb-1">{label}</label>
                  <input
                    type={type}
                    value={newItem[key]}
                    onChange={e => setNewItem(s => ({ ...s, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Kategorie</label>
                <select
                  value={newItem.category}
                  onChange={e => setNewItem(s => ({ ...s, category: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500"
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
                    <label className="block text-sm font-medium text-tea-700 mb-1">{label}</label>
                    <input
                      type={type}
                      value={newItem[key]}
                      onChange={e => setNewItem(s => ({ ...s, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-2 border-2 border-tea-200 text-tea-600 rounded-xl hover:bg-tea-50 font-semibold">Zrušit</button>
              <button onClick={handleAddItem} className="flex-1 py-2 bg-matcha-600 hover:bg-matcha-700 text-white rounded-xl font-semibold shadow-md">Přidat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
