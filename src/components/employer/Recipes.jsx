import { useState } from 'react';
import { recipes as initialRecipes } from '../../data/mockData.js';

export default function Recipes() {
  const [recipes, setRecipes] = useState(initialRecipes);
  const [activeCategory, setActiveCategory] = useState('Vše');
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [showNewRecipe, setShowNewRecipe] = useState(false);
  const [newRecipe, setNewRecipe] = useState({
    name: '', category: 'Čaje', prepTime: '', temperature: '', steepTime: '',
    ingredients: '', instructions: '', price: '', tags: '',
  });

  const categories = ['Vše', ...new Set(recipes.map(r => r.category))];
  const filtered = recipes.filter(r => activeCategory === 'Vše' || r.category === activeCategory);

  const handleAddRecipe = () => {
    if (!newRecipe.name) return;
    const id = Math.max(...recipes.map(r => r.id)) + 1;
    setRecipes(prev => [...prev, {
      ...newRecipe,
      id,
      ingredients: newRecipe.ingredients.split('\n').filter(Boolean),
      price: parseFloat(newRecipe.price) || 0,
      tags: newRecipe.tags.split(',').map(t => t.trim()).filter(Boolean),
    }]);
    setShowNewRecipe(false);
    setNewRecipe({ name: '', category: 'Čaje', prepTime: '', temperature: '', steepTime: '', ingredients: '', instructions: '', price: '', tags: '' });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-tea-800">📋 Recepty & Menu</h1>
          <p className="text-tea-500 text-sm">{recipes.length} receptů</p>
        </div>
        <button
          onClick={() => setShowNewRecipe(true)}
          className="flex items-center gap-2 px-4 py-2 bg-matcha-600 hover:bg-matcha-700 text-white font-semibold rounded-xl transition-all shadow-md"
        >
          ➕ Nový recept
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeCategory === cat ? 'bg-matcha-600 text-white shadow' : 'bg-white border border-tea-200 text-tea-600 hover:bg-tea-50'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Recipe grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(recipe => (
          <div
            key={recipe.id}
            onClick={() => setSelectedRecipe(selectedRecipe?.id === recipe.id ? null : recipe)}
            className={`bg-white rounded-2xl shadow-sm border-2 overflow-hidden cursor-pointer transition-all hover:shadow-md ${
              selectedRecipe?.id === recipe.id ? 'border-matcha-400' : 'border-tea-100 hover:border-tea-200'
            }`}
          >
            <div className="px-5 py-4 border-b border-tea-100 bg-gradient-to-r from-matcha-50 to-tea-50">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-tea-800">{recipe.name}</h3>
                  <p className="text-xs text-tea-500 mt-0.5">{recipe.category}</p>
                </div>
                <span className="text-xl font-bold text-matcha-700 flex-shrink-0">{recipe.price} Kč</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="text-xs bg-white/80 px-2 py-1 rounded-lg text-tea-600">⏱ {recipe.prepTime}</span>
                <span className="text-xs bg-white/80 px-2 py-1 rounded-lg text-tea-600">🌡 {recipe.temperature}</span>
                {recipe.steepTime !== 'N/A' && (
                  <span className="text-xs bg-white/80 px-2 py-1 rounded-lg text-tea-600">⏳ {recipe.steepTime}</span>
                )}
              </div>
            </div>

            <div className="p-5">
              <div className="mb-3">
                <p className="text-xs font-semibold text-tea-500 uppercase tracking-wide mb-2">Ingredience</p>
                <ul className="space-y-1">
                  {recipe.ingredients.map((ing, i) => (
                    <li key={i} className="text-sm text-tea-700 flex gap-2">
                      <span className="text-matcha-500 flex-shrink-0">•</span>
                      {ing}
                    </li>
                  ))}
                </ul>
              </div>

              {selectedRecipe?.id === recipe.id && (
                <div className="mt-3 pt-3 border-t border-tea-100">
                  <p className="text-xs font-semibold text-tea-500 uppercase tracking-wide mb-2">Postup přípravy</p>
                  <p className="text-sm text-tea-600 leading-relaxed">{recipe.instructions}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-tea-100">
                {recipe.tags.map(tag => (
                  <span key={tag} className="text-xs px-2 py-0.5 bg-matcha-50 text-matcha-700 rounded-full border border-matcha-200">
                    #{tag}
                  </span>
                ))}
              </div>

              <p className="text-xs text-tea-400 mt-2 text-center">
                {selectedRecipe?.id === recipe.id ? '▲ Skrýt postup' : '▼ Zobrazit postup'}
              </p>
            </div>
          </div>
        ))}

        {/* Add recipe placeholder */}
        <button
          onClick={() => setShowNewRecipe(true)}
          className="bg-tea-50 border-2 border-dashed border-tea-300 rounded-2xl p-8 text-center hover:bg-tea-100 hover:border-tea-400 transition-all group"
        >
          <span className="text-4xl block mb-2 group-hover:scale-110 transition-transform">🍵</span>
          <p className="font-semibold text-tea-500 group-hover:text-tea-700">Přidat nový recept</p>
        </button>
      </div>

      {/* New recipe modal */}
      {showNewRecipe && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-tea-100 sticky top-0 bg-white">
              <h3 className="font-bold text-tea-800 text-lg">🍵 Nový recept</h3>
              <button onClick={() => setShowNewRecipe(false)} className="text-tea-400 hover:text-tea-700 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {[
                ['Název receptu', 'name', 'text', 'Název'],
                ['Cena (Kč)', 'price', 'number', '0'],
                ['Čas přípravy', 'prepTime', 'text', 'např. 5 min'],
                ['Teplota vody', 'temperature', 'text', 'např. 75°C'],
                ['Čas louhování', 'steepTime', 'text', 'např. 3 min nebo N/A'],
              ].map(([label, key, type, placeholder]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-tea-700 mb-1">{label}</label>
                  <input
                    type={type}
                    value={newRecipe[key]}
                    onChange={e => setNewRecipe(s => ({ ...s, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm"
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Kategorie</label>
                <select
                  value={newRecipe.category}
                  onChange={e => setNewRecipe(s => ({ ...s, category: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm"
                >
                  <option>Čaje</option>
                  <option>Speciální nápoje</option>
                  <option>Studené nápoje</option>
                  <option>Jídlo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Ingredience (každá na nový řádek)</label>
                <textarea
                  value={newRecipe.ingredients}
                  onChange={e => setNewRecipe(s => ({ ...s, ingredients: e.target.value }))}
                  placeholder="3g Zelený čaj Sencha&#10;250ml vody&#10;Med (volitelně)"
                  rows={4}
                  className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 resize-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Postup přípravy</label>
                <textarea
                  value={newRecipe.instructions}
                  onChange={e => setNewRecipe(s => ({ ...s, instructions: e.target.value }))}
                  placeholder="Popis přípravy..."
                  rows={3}
                  className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 resize-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-tea-700 mb-1">Tagy (oddělené čárkou)</label>
                <input
                  type="text"
                  value={newRecipe.tags}
                  onChange={e => setNewRecipe(s => ({ ...s, tags: e.target.value }))}
                  placeholder="zelený, klasický, oblíbený"
                  className="w-full px-3 py-2 border-2 border-tea-200 rounded-xl focus:outline-none focus:border-matcha-500 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowNewRecipe(false)} className="flex-1 py-2 border-2 border-tea-200 text-tea-600 rounded-xl hover:bg-tea-50 font-semibold">Zrušit</button>
              <button onClick={handleAddRecipe} className="flex-1 py-2 bg-matcha-600 hover:bg-matcha-700 text-white rounded-xl font-semibold shadow-md">Přidat recept</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
