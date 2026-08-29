'use client';

// Receptury: co ze skladu zmizí, když se na pokladně prodá jedna položka.
//
// Ta těžká část není ukládání, ale zadávání. Do Blue Lagoon jde 0,02 l vodky —
// číslo, které se do políčka s krokem 0,1 zadává proti odporu a ve kterém se
// snadno splete řád. Proto se množství zadává v jednotce, kterou má člověk v
// ruce (ml, cl, l), a obrazovka rovnou ukáže, kolik porcí z balení vyjde a co
// ta porce stojí — tam se chyba o řád pozná okamžitě.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { useMoney } from '../CurrencyProvider';
import ItemInlineEdit from './ItemInlineEdit';
import NewIngredientInline from './NewIngredientInline';

const inputCls =
  'rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3.5 py-2.5 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none';

type Ingredient = { itemId: string; amount: string; unit: string };
type Draft = { productId: string; productName: string; ingredients: Ingredient[]; existing: boolean };

/** Jednotky, ve kterých se dá zadávat, a jejich převod na základní (l / kg / ks). */
const UNITS: Record<string, { label: string; toBase: number; base: string }[]> = {
  l: [
    { label: 'ml', toBase: 0.001, base: 'l' },
    { label: 'cl', toBase: 0.01, base: 'l' },
    { label: 'dl', toBase: 0.1, base: 'l' },
    { label: 'l', toBase: 1, base: 'l' },
  ],
  kg: [
    { label: 'g', toBase: 0.001, base: 'kg' },
    { label: 'dkg', toBase: 0.01, base: 'kg' },
    { label: 'kg', toBase: 1, base: 'kg' },
  ],
  ks: [{ label: 'ks', toBase: 1, base: 'ks' }],
};

/** Do které rodiny jednotek položka patří — podle toho, co má napsané. */
function familyOf(item: any): 'l' | 'kg' | 'ks' {
  const u = String(item?.contentUnit ?? item?.unit ?? '').toLowerCase();
  if (['l', 'ml', 'cl', 'dl', 'litr'].includes(u)) return 'l';
  if (['kg', 'g', 'dkg'].includes(u)) return 'kg';
  return 'ks';
}

/** Číslo z pole, které přijme i desetinnou čárku — píše se tak česky. */
const num = (s: string) => Number(String(s).replace(',', '.')) || 0;

/** Kolik základní jednotky (l, kg) je jedna jednotka, ve které je vedená
 *  položka. Receptura se ukládá v jednotce položky, protože v ní je i
 *  velikost balení a cena — jinak by se z tabáku vedeného v gramech
 *  odepisovalo tisíckrát míň, než se opravdu použije. */
function itemFactor(item: any): number {
  const u = String(item?.contentUnit ?? item?.unit ?? '').toLowerCase();
  const fam = familyOf(item);
  return UNITS[fam].find(o => o.label === u)?.toBase ?? 1;
}

export default function RecipesView({ openProductId, onNavigate }: {
  openProductId?: string;
  onNavigate?: (view: string, arg?: string) => void;
} = {}) {
  const money = useMoney();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [unmapped, setUnmapped] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  // Kategorie skladu (ne menu) — potřebné, když se surovina zakládá odsud.
  const [stockCategories, setStockCategories] = useState<{ id: number; name: string }[]>([]);
  const [cat, setCat] = useState('Vše');
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [d, inv, cats] = await Promise.all([
        fetch('/api/pos/products').then(r => r.json()),
        fetch('/api/inventory').then(r => r.json()).catch(() => []),
        fetch('/api/inventory/categories').then(r => r.json()).catch(() => []),
      ]);
      setStockCategories(
        Array.isArray(cats)
          ? cats.map((c: any) => ({ id: Number(c.id), name: String(c.name) }))
          : [],
      );
      setConnected(!!d.connected);
      setProducts(Array.isArray(d.products) ? d.products : []);
      setRecipes(Array.isArray(d.recipes) ? d.recipes : []);
      setUnmapped(Array.isArray(d.unmapped) ? d.unmapped : []);
      setItems(Array.isArray(inv) ? inv.filter((i: any) => i.approved !== false) : []);
      if (d.error) setErr(d.error);
    } catch { setErr('Načtení se nepodařilo.'); setConnected(false); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Příchod ze skladu („tahle surovina se používá v Blue Lagoon") — otevřeme
  // rovnou jeho recepturu, jakmile jsou data.
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (opened || !openProductId || loading) return;
    const p = products.find(x => x.productId === openProductId);
    const r = recipes.find((x: any) => x.productId === openProductId);
    if (p || r) {
      openEditor(openProductId, p?.name ?? r?.productName ?? openProductId);
      setOpened(true);
    }
  }, [openProductId, loading, products, recipes]); // eslint-disable-line react-hooks/exhaustive-deps

  const recipeByProduct = useMemo(() => new Map(recipes.map((r: any) => [r.productId, r])), [recipes]);
  const itemById = useMemo(() => new Map(items.map((i: any) => [String(i.id), i])), [items]);
  const soldByProduct = useMemo(
    () => new Map(unmapped.map((u: any) => [u.productId, Number(u.soldCount) || 0])), [unmapped]);

  const categories = useMemo(() => {
    const set = new Map<string, number>();
    products.forEach(p => {
      const c = p.category || 'Bez kategorie';
      set.set(c, (set.get(c) ?? 0) + 1);
    });
    return ['Vše', ...Array.from(set.keys()).sort((a, b) => a.localeCompare(b, 'cs'))];
  }, [products]);

  const q = search.trim().toLowerCase();
  const shown = useMemo(() => products.filter(p => {
    if (cat !== 'Vše' && (p.category || 'Bez kategorie') !== cat) return false;
    if (onlyMissing && recipeByProduct.has(p.productId)) return false;
    if (q && !p.name.toLowerCase().includes(q) && !(p.category ?? '').toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => (soldByProduct.get(b.productId) ?? 0) - (soldByProduct.get(a.productId) ?? 0)
    || a.name.localeCompare(b.name, 'cs')),
  [products, cat, onlyMissing, q, recipeByProduct, soldByProduct]);

  const withRecipe = recipes.length;
  const coverage = products.length ? Math.round((withRecipe / products.length) * 100) : 0;

  /** Co stojí suroviny na jednu porci produktu — a jaká z toho vyjde marže.
   *  Chybí-li u některé suroviny cena nebo balení, vrátíme null: nadhodnocená
   *  marže je horší než žádná, protože se podle ní mění ceny. */
  const economyOf = (productId: string, price: number | null) => {
    const r: any = recipeByProduct.get(productId);
    if (!r?.ingredients?.length) return null;
    let cost = 0;
    for (const ing of r.ingredients) {
      const item = itemById.get(String(ing.itemId));
      const unitCost = Number(item?.unitCost) || 0;
      const pkg = Number(item?.packageSize) || 0;
      if (!item || unitCost <= 0) return null;
      cost += pkg > 0 ? (unitCost / pkg) * Number(ing.amount) : unitCost * Number(ing.amount);
    }
    const c = Math.round(cost);
    const pct = price != null && price > 0 ? Math.round(((price - c) / price) * 100) : null;
    return { cost: c, marginPct: pct };
  };

  // ---- editor ---------------------------------------------------------------
  const openEditor = (productId: string, productName: string) => {
    const r = recipeByProduct.get(productId);
    setErr('');
    setDraft({
      productId, productName, existing: !!r,
      ingredients: r
        ? r.ingredients.map((ing: any) => {
          const item = itemById.get(String(ing.itemId));
          const fam = familyOf(item);
          // Uložené množství je v jednotce položky; převedeme na základní a
          // nabídneme v té, ve které to není samá nula (0,02 l → 20 ml).
          const opts = UNITS[fam];
          const base = (Number(ing.amount) || 0) * itemFactor(item);
          const pick = [...opts].reverse().find(o => base / o.toBase >= 1) ?? opts[0];
          return { itemId: String(ing.itemId), amount: String(+(base / pick.toBase).toFixed(4)), unit: pick.label };
        })
        : [{ itemId: '', amount: '', unit: 'ks' }],
    });
  };

  const setIng = (idx: number, patch: Partial<Ingredient>) =>
    setDraft(d => d && ({ ...d, ingredients: d.ingredients.map((x, i) => i === idx ? { ...x, ...patch } : x) }));

  const save = async () => {
    if (!draft) return;
    setSaving(true); setErr('');
    const ingredients = draft.ingredients
      .filter(ing => ing.itemId && num(ing.amount) > 0)
      .map(ing => {
        const item = itemById.get(ing.itemId);
        const conv = UNITS[familyOf(item)].find(u => u.label === ing.unit)?.toBase ?? 1;
        const amount = (num(ing.amount) * conv) / itemFactor(item);
        return { itemId: parseInt(ing.itemId), amount: Math.round(amount * 1e6) / 1e6 };
      });
    try {
      const res = await fetch('/api/pos/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: draft.productId, productName: draft.productName, ingredients }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setDraft(null);
        setMsg(ingredients.length ? 'Receptura uložena.' : 'Receptura smazána.');
        setTimeout(() => setMsg(''), 3000);
        await load();
      } else setErr(d.error || 'Uložení se nepodařilo.');
    } catch { setErr('Uložení se nepodařilo.'); }
    setSaving(false);
  };

  const sync = async () => {
    setSyncing(true); setErr(''); setMsg('');
    try {
      const res = await fetch('/api/pos/products', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sync: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        const n = (d.deducted ?? []).length;
        setMsg(n ? `Odepsáno ze skladu: ${(d.deducted ?? []).map((x: any) => `${x.name} −${x.amount}`).join(', ')}` : 'Nebylo co odepsat.');
        await load();
      } else setErr(d.error || 'Odpis se nepodařil.');
    } catch { setErr('Odpis se nepodařil.'); }
    setSyncing(false);
  };

  /** Kolik porcí z balení a co stojí jedna — tady se pozná chyba o řád.
   *  Množství i velikost balení musí být ve stejné jednotce jako položka. */
  const yieldOf = (item: any, amountBase: number) => {
    if (!item || amountBase <= 0) return null;
    const amount = amountBase / itemFactor(item);
    const pkg = Number(item.packageSize) || 0;
    const cost = Number(item.unitCost) || 0;
    const portions = pkg > 0 ? Math.floor(pkg / amount) : null;
    const perPortion = pkg > 0 && cost > 0 ? Math.round((cost / pkg) * amount) : null;
    return { portions, perPortion };
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
    </div>;
  }

  if (connected === false) {
    return (
      <div className="p-4 sm:p-6">
        <div className="glass-card p-8 text-center max-w-lg mx-auto space-y-2 rise-in">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-[#C8F542]/15 flex items-center justify-center text-[#5B7A08]">
            <Icon name="leaf" size={26} />
          </div>
          <h2 className="font-bold text-lg text-[#16181A]">Receptury potřebují připojenou pokladnu</h2>
          <p className="text-sm text-black/55">
            Propoj Storyous v Nastavení → Pokladna. Pak si u každé položky z menu naklikáš, co a kolik se z ní
            odepíše ze skladu.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#16181A]">Receptury</h1>
          <p className="text-sm text-black/50 mt-0.5">
            Co ze skladu ubude, když se prodá jedna položka. Podle toho se sklad odepisuje sám.
          </p>
        </div>
        <button onClick={sync} disabled={syncing}
          className="rounded-full bg-[#16181A] text-white px-5 py-2.5 text-sm font-bold hover:bg-black disabled:opacity-50 transition inline-flex items-center gap-2">
          <Icon name="swap" size={16} className="i-lead" /> {syncing ? 'Odepisuji…' : 'Odepsat prodeje'}
        </button>
      </div>

      {msg && <div className="rounded-2xl bg-[#C8F542]/12 border border-[#C8F542]/30 text-[#5B7A08] px-4 py-3 text-sm font-semibold rise-in">{msg}</div>}
      {err && <div className="rounded-2xl bg-red-500/[0.07] border border-red-500/25 text-red-600 px-4 py-3 text-sm rise-in">{err}</div>}

      {draft ? (
        <RecipeEditor
          draft={draft} items={items} itemById={itemById} money={money}
          setIng={setIng} setDraft={setDraft} save={save} saving={saving} yieldOf={yieldOf}
          recipes={recipes} products={products} categories={stockCategories}
          onItemSaved={(patched) => setItems(list => list.map(i => i.id === patched.id ? { ...i, ...patched } : i))}
          onItemCreated={(created) => setItems(list => [...list, created])}
        />
      ) : (
        <>
          {/* Pokrytí menu — jedno číslo, které říká, jestli sklad sedí. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 stagger">
            <div className="glass-card p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-black/45">Pokryto recepturou</p>
              <p className="text-3xl font-bold tracking-tight text-[#16181A] tabular">{coverage} %</p>
              <p className="text-xs text-black/45">{withRecipe} z {products.length} položek menu</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-black/45">Prodává se bez receptury</p>
              <p className="text-3xl font-bold tracking-tight text-amber-700 tabular">{unmapped.length}</p>
              <p className="text-xs text-black/45">tyhle prodeje se ze skladu neodepíšou</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-black/45">Položek ve skladu</p>
              <p className="text-3xl font-bold tracking-tight text-[#16181A] tabular">{items.length}</p>
              <p className="text-xs text-black/45">z nich se dá skládat</p>
            </div>
          </div>

          {unmapped.length > 0 && (
            <div className="glass-card border-amber-500/25 bg-amber-500/[0.05] p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700 flex items-center gap-1.5">
                <Icon name="warning" size={14} /> Prodává se, ale neodepisuje
              </p>
              <div className="flex flex-wrap gap-1.5">
                {unmapped.map((u: any) => (
                  <button key={u.productId} onClick={() => openEditor(u.productId, u.productName ?? u.productId)}
                    className="rounded-full bg-white/70 hover:bg-white border border-amber-500/20 px-3.5 py-1.5 text-xs font-semibold text-[#16181A] transition active:scale-95">
                    {u.productName ?? u.productId}
                    <span className="ml-1.5 text-amber-700 tabular">{Number(u.soldCount) || 0}×</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Procházení menu — kategorie, hledání, jen chybějící */}
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/30 pointer-events-none">
                  <Icon name="search" size={16} />
                </span>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder={`Hledat mezi ${products.length} položkami menu…`}
                  className={`${inputCls} w-full pl-10`} />
              </div>
              <button onClick={() => setOnlyMissing(v => !v)}
                className={`rounded-full px-4 py-2.5 text-sm font-semibold transition active:scale-95 ${
                  onlyMissing ? 'bg-[#16181A] text-white' : 'glass text-black/55 hover:text-black'
                }`}>
                Jen bez receptury
              </button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1">
              {categories.map(c => (
                <button key={c} onClick={() => setCat(c)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap shrink-0 transition ${
                    cat === c ? 'bg-[#16181A] text-white' : 'glass text-black/55 hover:text-black'
                  }`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card divide-y divide-black/[0.06] overflow-hidden">
            <div className="hidden sm:flex items-center gap-3 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-black/35">
              <span className="w-2" />
              <span className="flex-1">Položka menu</span>
              <span className="shrink-0">suroviny / marže</span>
              <span className="w-20 text-right">akce</span>
            </div>
            {shown.length === 0 && (
              <p className="p-8 text-center text-sm text-black/45">
                {onlyMissing ? 'Všechno v téhle kategorii má recepturu. 👌' : 'Nic nenalezeno.'}
              </p>
            )}
            {shown.slice(0, 200).map(p => {
              const r = recipeByProduct.get(p.productId);
              const sold = soldByProduct.get(p.productId) ?? 0;
              return (
                <button key={p.productId} onClick={() => openEditor(p.productId, p.name)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/[0.02] transition">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${r ? 'bg-[#C8F542]' : 'bg-amber-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#16181A] truncate">{p.name}</p>
                    <p className="text-[11px] text-black/45 truncate">
                      {r
                        ? r.ingredients.map((ing: any) =>
                          `${Number(ing.amount).toLocaleString('cs-CZ', { maximumFractionDigits: 3 })} ${ing.itemUnit ?? ''} ${ing.itemName ?? '?'}`.trim()).join(' + ')
                        : (p.category || 'bez kategorie')}
                    </p>
                  </div>
                  {sold > 0 && <span className="text-[11px] font-bold text-amber-700 tabular shrink-0">{sold}×</span>}
                  {(() => {
                    const eco = economyOf(p.productId, p.price ?? null);
                    if (!eco) return null;
                    return (
                      <span className="hidden sm:flex items-baseline gap-2 shrink-0">
                        <span className="text-[11px] text-black/45 tabular">{money(eco.cost)}</span>
                        {eco.marginPct != null && (
                          <span className={`text-xs font-bold tabular ${
                            eco.marginPct >= 65 ? 'text-[#5B7A08]'
                              : eco.marginPct >= 45 ? 'text-[#16181A]' : 'text-red-600'
                          }`}>{eco.marginPct} %</span>
                        )}
                      </span>
                    );
                  })()}
                  <span className={`text-xs font-bold shrink-0 ${r ? 'text-black/35' : 'text-[#5B7A08]'}`}>
                    {r ? 'Upravit' : '+ receptura'}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor jedné receptury. Množství se zadává v jednotce, kterou má člověk v
// ruce, a hned pod ním je vidět, kolik porcí z balení vyjde a co stojí — na
// tom se chyba o řád (0,02 l vs 0,2 l) pozná dřív, než se odepíše sklad.
// ---------------------------------------------------------------------------
function RecipeEditor({ draft, items, itemById, money, setIng, setDraft, save, saving, yieldOf, recipes, products, categories, onItemSaved, onItemCreated }: {
  draft: Draft; items: any[]; itemById: Map<string, any>; money: (n: number) => string;
  setIng: (idx: number, patch: Partial<Ingredient>) => void;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  save: () => void; saving: boolean;
  yieldOf: (item: any, amountBase: number) => { portions: number | null; perPortion: number | null } | null;
  recipes: any[]; products: any[]; categories: { id: number; name: string }[];
  onItemSaved: (item: any) => void;
  onItemCreated: (item: any) => void;
}) {
  // Která surovina se zrovna upravuje „na místě" — bez odcházení do skladu.
  const [editingItem, setEditingItem] = useState<string | null>(null);
  // Zakládání nové suroviny: index řádku, do kterého se má vložit, nebo -1 pro
  // nový řádek na konci.
  const [creatingAt, setCreatingAt] = useState<number | null>(null);

  const nameOfProduct = (r: any) =>
    products.find(p => p.productId === r.productId)?.name ?? r.productName ?? r.productId;
  const copyable = (recipes ?? [])
    .filter((r: any) => r.productId !== draft.productId && Array.isArray(r.ingredients) && r.ingredients.length)
    .sort((a: any, b: any) => nameOfProduct(a).localeCompare(nameOfProduct(b), 'cs'));

  /** Převezme suroviny z jiné receptury — množství se ukládá v jednotce
   *  položky, tak ho jen nabídneme v té, ve které to není samá nula. */
  const copyFrom = (productId: string) => {
    const src = copyable.find((r: any) => r.productId === productId);
    if (!src) return;
    setDraft(d => d && ({
      ...d,
      ingredients: src.ingredients.map((ing: any) => {
        const item = itemById.get(String(ing.itemId));
        const opts = UNITS[familyOf(item)];
        const base = (Number(ing.amount) || 0) * itemFactor(item);
        const pick = [...opts].reverse().find(o => base / o.toBase >= 1) ?? opts[0];
        return { itemId: String(ing.itemId), amount: String(+(base / pick.toBase).toFixed(4)), unit: pick.label };
      }),
    }));
  };
  const totalCost = draft.ingredients.reduce((sum, ing) => {
    const item = itemById.get(ing.itemId);
    if (!item) return sum;
    const conv = UNITS[familyOf(item)].find(u => u.label === ing.unit)?.toBase ?? 1;
    const y = yieldOf(item, num(ing.amount) * conv);
    return sum + (y?.perPortion ?? 0);
  }, 0);

  const menuPrice = products.find(p => p.productId === draft.productId)?.price ?? null;
  const marginPct = menuPrice != null && menuPrice > 0 && totalCost > 0
    ? Math.round(((menuPrice - totalCost) / menuPrice) * 100) : null;
  const ready = draft.ingredients.filter(i => i.itemId && num(i.amount) > 0).length;

  return (
    <div className="space-y-4 rise-in">
      <div className="flex items-center gap-2">
        <button onClick={() => setDraft(null)}
          className="rounded-full glass px-3.5 py-2 text-xs font-bold text-black/60 hover:text-black transition">← Zpět</button>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold tracking-tight text-[#16181A] truncate">{draft.productName}</h2>
          <p className="text-xs text-black/45">
            {ready === 0 ? 'Zatím bez surovin' : `${ready} ${ready === 1 ? 'surovina' : ready < 5 ? 'suroviny' : 'surovin'} v receptuře`}
            {menuPrice != null && <span> · v kase za {money(menuPrice)}</span>}
          </p>
        </div>
      </div>

      {/* Práce je vlevo, čísla vpravo. Editor dřív seděl v úzkém sloupci
          uprostřed a půlka obrazovky zůstala prázdná. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-4 items-start">
      <div className="glass-card p-5 space-y-4">

      {/* Nápoje se liší jedním sirupem. Opisovat kvůli tomu celou recepturu
          znovu je práce navíc, kterou nikdo neudělá — a produkt zůstane bez
          receptury. */}
      {copyable.length > 0 && draft.ingredients.every(i => !i.itemId) && (
        <label className="flex flex-wrap items-center gap-2 text-xs text-black/50">
          <span className="font-semibold">Převzít z jiné položky:</span>
          <select value="" onChange={e => copyFrom(e.target.value)}
            className="rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3 py-2 text-xs text-[#16181A] focus:border-[#C8F542]/50 focus:outline-none max-w-[16rem]">
            <option value="">— vyber recepturu —</option>
            {copyable.map(r => (
              <option key={r.productId} value={r.productId}>
                {nameOfProduct(r)} ({r.ingredients.length})
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="space-y-3">
        {draft.ingredients.map((ing, idx) => {
          const item = itemById.get(ing.itemId);
          const fam = familyOf(item);
          const opts = UNITS[fam];
          const conv = opts.find(u => u.label === ing.unit)?.toBase ?? 1;
          const y = item ? yieldOf(item, num(ing.amount) * conv) : null;
          return (
            <div key={idx} className="rounded-2xl bg-black/[0.03] border border-black/[0.06] p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2 justify-start">
                <select value={ing.itemId}
                  onChange={e => {
                    const next = itemById.get(e.target.value);
                    setIng(idx, { itemId: e.target.value, unit: UNITS[familyOf(next)][0].label });
                  }}
                  className={`${inputCls} flex-1 min-w-[180px] max-w-[26rem]`}>
                  <option value="">— vyber ze skladu —</option>
                  {items.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <input inputMode="decimal"
                  value={ing.amount} onChange={e => setIng(idx, { amount: e.target.value })}
                  placeholder="0,02" className={`${inputCls} w-24 text-center font-semibold tabular`} />
                <div className="flex gap-1">
                  {opts.map(u => (
                    <button key={u.label} type="button" onClick={() => setIng(idx, { unit: u.label })}
                      className={`rounded-full px-3 py-2 text-xs font-bold transition active:scale-95 ${
                        ing.unit === u.label ? 'bg-[#C8F542] text-[#16181A]' : 'glass text-black/50'
                      }`}>
                      {u.label}
                    </button>
                  ))}
                </div>
                <button type="button" title="Odebrat"
                  onClick={() => setDraft(d => d && ({ ...d, ingredients: d.ingredients.filter((_, i) => i !== idx) }))}
                  className="text-black/30 hover:text-red-600 transition px-1.5">✕</button>
              </div>
              {/* Díly položky — definované u ní, tady se jen vyberou. */}
              {item && Array.isArray(item.portions) && item.portions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-black/40">Díly:</span>
                  {item.portions.map((pt: any) => {
                    const base = opts.find(o => o.label === ing.unit)?.toBase ?? 1;
                    const active = Math.abs((num(ing.amount) * base) / itemFactor(item) - Number(pt.amount)) < 1e-9;
                    return (
                      <button key={pt.name} type="button"
                        onClick={() => {
                          // Díl je v jednotce položky; převedeme na základní a
                          // nabídneme v takové, ve které to není samá nula.
                          const b = Number(pt.amount) * itemFactor(item);
                          const pick = [...opts].reverse().find(o => b / o.toBase >= 1) ?? opts[0];
                          setIng(idx, { amount: String(+(b / pick.toBase).toFixed(4)), unit: pick.label });
                        }}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition active:scale-95 ${
                          active ? 'bg-[#C8F542] text-[#16181A]' : 'glass text-black/55 hover:text-black'
                        }`}>
                        {pt.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {item && (
                <p className="text-[11px] text-black/45 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  {num(ing.amount) > 0 && (y?.portions != null
                    ? <span>Z balení ({Number(item.packageSize).toLocaleString('cs-CZ')} {item.contentUnit ?? item.unit}) vyjde <b className="text-[#5B7A08]">{y.portions}×</b></span>
                    : <span className="text-amber-700">Chybí velikost balení — porce ani cenu nespočítám.</span>)}
                  {y?.perPortion != null && <span>· surovina za porci <b className="text-[#16181A]">{money(y.perPortion)}</b></span>}
                  {num(ing.amount) > 0 && y?.perPortion == null && Number(item.unitCost) > 0 === false && (
                    <span className="text-amber-700">· chybí cena za balení</span>
                  )}
                  <button type="button" onClick={() => setEditingItem(editingItem === ing.itemId ? null : ing.itemId)}
                    className="font-bold text-[#5B7A08] hover:brightness-110 transition">
                    {editingItem === ing.itemId ? '− zavřít úpravu' : '✎ upravit položku / díly'}
                  </button>
                </p>
              )}

              {item && editingItem === ing.itemId && (
                <ItemInlineEdit
                  item={item}
                  onSaved={(patched) => onItemSaved(patched)}
                  onClose={() => setEditingItem(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Surovina, kterou sklad ještě nezná, se dá založit rovnou tady —
          jinak se pro ni odchází jinam a receptura zůstane nedodělaná. */}
      {creatingAt != null ? (
        <NewIngredientInline
          categories={categories}
          onCancel={() => setCreatingAt(null)}
          onCreated={(created) => {
            onItemCreated(created);
            const fam = familyOf(created);
            const row = { itemId: String(created.id), amount: '', unit: UNITS[fam][0].label };
            setDraft(d => {
              if (!d) return d;
              const next = [...d.ingredients];
              // Prázdný řádek, ze kterého se zakládalo, se surovinou nahradíme;
              // jinak ji přidáme na konec.
              if (creatingAt >= 0 && next[creatingAt] && !next[creatingAt].itemId) next[creatingAt] = row;
              else next.push(row);
              return { ...d, ingredients: next };
            });
            setCreatingAt(null);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button"
            onClick={() => setDraft(d => d && ({ ...d, ingredients: [...d.ingredients, { itemId: '', amount: '', unit: 'ks' }] }))}
            className="rounded-full glass px-4 py-2 text-sm font-semibold text-[#5B7A08] hover:brightness-110 transition inline-flex items-center gap-1.5">
            <Icon name="plus" size={15} /> Další surovina
          </button>
          <button type="button" onClick={() => setCreatingAt(draft.ingredients.findIndex(i => !i.itemId))}
            className="rounded-full glass px-4 py-2 text-sm font-semibold text-black/55 hover:text-black transition inline-flex items-center gap-1.5">
            <Icon name="box" size={15} /> Založit novou surovinu
          </button>
        </div>
      )}
      </div>

      {/* Souhrn: co to stojí, co z toho zbude, a uložení na dosah. */}
      <aside className="glass-card p-5 space-y-4 lg:sticky lg:top-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-black/45">Suroviny na porci</p>
          <p className="text-2xl font-bold tracking-tight text-[#16181A] tabular">
            {totalCost > 0 ? money(totalCost) : '—'}
          </p>
          <p className="text-[11px] text-black/40">
            {totalCost > 0 ? 'podle cen ve skladu' : 'doplň množství a ceny balení'}
          </p>
        </div>

        {menuPrice != null && (
          <div className="rounded-2xl bg-black/[0.03] border border-black/[0.06] px-4 py-3 space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-black/50">Cena v kase</span>
              <span className="font-semibold tabular text-[#16181A]">{money(menuPrice)}</span>
            </div>
            {marginPct != null && (
              <>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-black/50">Zbyde na porci</span>
                  <span className="font-semibold tabular text-[#16181A]">{money(menuPrice - totalCost)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden mt-1.5">
                  <div className={`h-full rounded-full ${marginPct >= 65 ? 'bg-[#C8F542]' : marginPct >= 45 ? 'bg-amber-400' : 'bg-red-400'}`}
                    style={{ width: `${Math.max(0, Math.min(100, marginPct))}%` }} />
                </div>
                <p className={`text-[11px] font-semibold ${marginPct >= 65 ? 'text-[#5B7A08]' : marginPct >= 45 ? 'text-amber-700' : 'text-red-600'}`}>
                  marže {marginPct} %
                </p>
              </>
            )}
          </div>
        )}

        <div className="space-y-2">
          <button onClick={save} disabled={saving}
            className="w-full rounded-full bg-[#16181A] text-white px-6 py-3 text-sm font-bold hover:bg-black disabled:opacity-50 transition">
            {saving ? 'Ukládám…' : 'Uložit recepturu'}
          </button>
          {draft.existing && (
            <button
              onClick={() => { setDraft(d => d && ({ ...d, ingredients: [] })); setTimeout(save, 0); }}
              disabled={saving}
              className="w-full rounded-full glass px-5 py-2.5 text-sm font-semibold text-black/50 hover:text-red-600 transition">
              Smazat recepturu
            </button>
          )}
        </div>

        <p className="text-[11px] text-black/40 leading-relaxed">
          Uloženou recepturu odepisuje synchronizace s pokladnou po každém prodeji.
        </p>
      </aside>
      </div>
    </div>
  );
}
