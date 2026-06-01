import { useState } from 'react';
import { recipes } from '../../data/mockData.js';

export default function Recipes() {
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Vše');

  const categories = ['Vše', ...new Set(recipes.map(r => r.category))];
  const filtered = recipes.filter(r => {
    const matchCat = category === 'Vše' || r.category === category;
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  const recipe = selected ? recipes.find(r => r.id === selected) : null;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex gap-6">
        {/* List */}
        <div className="w-80 flex-shrink-0 space-y-4">
          <input
            type="text"
            placeholder="🔍 Hledat recept..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-4 py-2.5 border-2 border-tea-200 rounded-xl text-sm focus:outline-none focus:border-matcha-400"
          />
          <div className="flex gap-2 flex-wrap">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  category === cat ? 'bg-matcha-600 text-white' : 'bg-white border border-tea-200 text-tea-600 hover:border-matcha-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {filtered.map(r => (
              <button
                key={r.id}
                onClick={() => setSelected(r.id)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                  selected === r.id
                    ? 'border-matcha-400 bg-matcha-50'
                    : 'border-tea-100 bg-white hover:border-tea-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm text-tea-800">{r.name}</p>
                  <span className="text-sm font-bold text-matcha-700">{r.price} Kč</span>
                </div>
                <p className="text-xs text-tea-400 mt-0.5">{r.category} · {r.prepTime}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {r.tags.map(tag => (
                    <span key={tag} className="text-xs bg-tea-100 text-tea-500 px-1.5 py-0.5 rounded-full">{tag}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detail */}
        <div className="flex-1 min-w-0">
          {!recipe ? (
            <div className="bg-white rounded-2xl border border-tea-100 p-12 text-center">
              <p className="text-5xl mb-3">🍵</p>
              <p className="text-tea-400">Vyberte recept ze seznamu</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-tea-100 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-matcha-700 to-matcha-600 p-6 text-white">
                <p className="text-xs uppercase tracking-wider text-matcha-300 mb-1">{recipe.category}</p>
                <h2 className="text-2xl font-bold">{recipe.name}</h2>
                <div className="flex gap-4 mt-3 text-sm text-matcha-200">
                  <span>⏱ {recipe.prepTime}</span>
                  <span>🌡 {recipe.temperature}</span>
                  <span>⏳ {recipe.steepTime}</span>
                  <span className="font-bold text-white">💰 {recipe.price} Kč</span>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <h3 className="font-bold text-tea-800 mb-3 flex items-center gap-2">🌿 Ingredience</h3>
                  <ul className="space-y-2">
                    {recipe.ingredients.map((ing, i) => (
                      <li key={i} className="flex items-center gap-3 p-3 bg-matcha-50 rounded-xl text-sm text-tea-700">
                        <span className="w-2 h-2 bg-matcha-400 rounded-full flex-shrink-0"></span>
                        {ing}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="font-bold text-tea-800 mb-3 flex items-center gap-2">📝 Postup</h3>
                  <div className="bg-tea-50 rounded-xl p-4 text-sm text-tea-700 leading-relaxed">
                    {recipe.instructions}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {recipe.tags.map(tag => (
                    <span key={tag} className="bg-matcha-100 text-matcha-700 text-sm px-3 py-1 rounded-full">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
