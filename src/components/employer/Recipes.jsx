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
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Recepty & Menu</h1>
          <p className="text-text-secondary text-sm">{recipes.length} receptů</p>
        </div>
        <button
          onClick={() => setShowNewRecipe(true)}
          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-accent hover:bg-accent/90 text-black font-semibold rounded-xl transition-all shadow-lg text-sm"
        >
          <span>+</span>
          <span className="hidden sm:inline">Nový recept</span>
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 md:px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeCategory === cat ? 'bg-accent text-black shadow' : 'bg-card border border-border text-text-secondary hover:text-white hover:border-border/60'
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
            className={`bg-card rounded-2xl border-2 overflow-hidden cursor-pointer transition-all hover:border-border/60 ${
              selectedRecipe?.id === recipe.id ? 'border-accent/60' : 'border-border'
            }`}
          >
            <div className="px-5 py-4 border-b border-border bg-elevated">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-white">{recipe.name}</h3>
                  <p className="text-xs text-text-secondary mt-0.5">{recipe.category}</p>
                </div>
                <span className="text-xl font-bold text-accent flex-shrink-0">{recipe.price} Kč</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {[['⏱', recipe.prepTime], ['🌡', recipe.temperature], recipe.steepTime !== 'N/A' && ['⏳', recipe.steepTime]].filter(Boolean).map(([icon, val]) => (
                  <span key={val} className="text-xs bg-card/60 px-2 py-1 rounded-lg text-text-secondary border border-border">{icon} {val}</span>
                ))}
              </div>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Ingredience</p>
              <ul className="space-y-1">
                {recipe.ingredients.map((ing, i) => (
                  <li key={i} className="text-sm text-text-secondary flex gap-2">
                    <span className="text-accent flex-shrink-0">•</span>
                    {ing}
                  </li>
                ))}
              </ul>

              {selectedRecipe?.id === recipe.id && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Postup přípravy</p>
                  <p className="text-sm text-text-secondary leading-relaxed">{recipe.instructions}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-border">
                {recipe.tags.map(tag => (
                  <span key={tag} className="text-xs px-2 py-0.5 bg-accent/10 text-accent rounded-full border border-accent/20">
                    #{tag}
                  </span>
                ))}
              </div>

              <p className="text-xs text-text-secondary/40 mt-2 text-center">
                {selectedRecipe?.id === recipe.id ? '▲ Skrýt postup' : '▼ Zobrazit postup'}
              </p>
            </div>
          </div>
        ))}

        {/* Add recipe placeholder */}
        <button
          onClick={() => setShowNewRecipe(true)}
          className="bg-elevated border-2 border-dashed border-border rounded-2xl p-8 text-center hover:bg-card hover:border-border/60 transition-all group"
        >
          <span className="text-4xl block mb-2">🍵</span>
          <p className="font-semibold text-text-secondary group-hover:text-white transition-colors">Přidat nový recept</p>
        </button>
      </div>

      {/* New recipe modal */}
      {showNewRecipe && (
        <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
              <h3 className="font-bold text-white text-lg">Nový recept</h3>
              <button onClick={() => setShowNewRecipe(false)} className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-white bg-elevated rounded-lg">✕</button>
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
                  <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">{label}</label>
                  <input
                    type={type}
                    value={newRecipe[key]}
                    onChange={e => setNewRecipe(s => ({ ...s, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50 text-sm"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Kategorie</label>
                <select
                  value={newRecipe.category}
                  onChange={e => setNewRecipe(s => ({ ...s, category: e.target.value }))}
                  className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white text-sm"
                >
                  <option>Čaje</option>
                  <option>Speciální nápoje</option>
                  <option>Studené nápoje</option>
                  <option>Jídlo</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Ingredience (každá na nový řádek)</label>
                <textarea
                  value={newRecipe.ingredients}
                  onChange={e => setNewRecipe(s => ({ ...s, ingredients: e.target.value }))}
                  placeholder="3g Zelený čaj Sencha&#10;250ml vody&#10;Med (volitelně)"
                  rows={4}
                  className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50 resize-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Postup přípravy</label>
                <textarea
                  value={newRecipe.instructions}
                  onChange={e => setNewRecipe(s => ({ ...s, instructions: e.target.value }))}
                  placeholder="Popis přípravy..."
                  rows={3}
                  className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50 resize-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">Tagy (oddělené čárkou)</label>
                <input
                  type="text"
                  value={newRecipe.tags}
                  onChange={e => setNewRecipe(s => ({ ...s, tags: e.target.value }))}
                  placeholder="zelený, klasický, oblíbený"
                  className="w-full px-3 py-3 bg-elevated border border-border rounded-2xl focus:outline-none focus:border-accent text-white placeholder:text-text-secondary/50 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowNewRecipe(false)} className="flex-1 py-3 border border-border text-text-secondary rounded-2xl hover:bg-elevated font-semibold text-sm transition-colors">Zrušit</button>
              <button onClick={handleAddRecipe} className="flex-1 py-3 bg-accent hover:bg-accent/90 text-black rounded-2xl font-bold shadow-lg text-sm transition-colors">Přidat recept</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
