'use client';
import { SearchField } from '../ui';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from '../Icons';
import { EmptyState } from '../ui';
import KioskPackagedStock from './KioskPackagedStock';
import NewStockEntry from '../inventory/NewStockEntry';
import StocktakeModal from '../inventory/Stocktake';
import { useKioskShift } from './KioskShiftGate';
import { okJson } from '@/lib/api';

interface Item {
  id: number;
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
  criticalQuantity: number;
  unit: string;
  brand?: string | null;
  archived?: boolean;
  packageSize?: number | null;
  openAmount?: number | null;
}

const statusOf = (i: Item) =>
  (i as any).status ?? (i.quantity <= (i.criticalQuantity ?? 0) ? 'critical' : i.quantity <= i.minQuantity ? 'low' : 'ok');

export default function KioskInventory({ autoOpenEntry = false, onEntryOpened }: {
  autoOpenEntry?: boolean;
  onEntryOpened?: () => void;
} = {}) {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Kiosk stojí u baru bez očí na konzoli — když načtení nebo uložení selže,
  // musí to být vidět na obrazovce, ne zmizet do prázdného seznamu.
  const [loadErr, setLoadErr] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [cat, setCat] = useState('Vše');
  const [search, setSearch] = useState('');
  // Debounced quantity saves so rapid taps don't spam the server.
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  // While a packaged category is open it owns the screen — the search and the
  // full list would only be in the way on a tablet.
  const [stockFocused, setStockFocused] = useState(false);
  const [showParked, setShowParked] = useState(false);
  // Writing a new thing in, attributed to whoever is clocked in on this tablet.
  const { activeId, active } = useKioskShift();
  const [adding, setAdding] = useState(false);
  const [stocktakeOpen, setStocktakeOpen] = useState(false);
  const [counting, setCounting] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const reload = () =>
    Promise.all([
      fetch('/api/inventory').then(okJson).catch(() => null),
      fetch('/api/inventory/categories').then(okJson).catch(() => null),
    ]).then(([d, c]) => {
      // Pole = data (klidně prázdný sklad). Cokoli jiného (null, {error}, 500)
      // je selhání načtení — to se nesmí tvářit jako „nic ve skladu".
      if (Array.isArray(d)) { setItems(d); setLoadErr(false); }
      else setLoadErr(true);
      if (Array.isArray(c)) setCategories(c);
      setLoading(false);
    }).catch(() => { setLoadErr(true); setLoading(false); });

  useEffect(() => { reload(); }, []);

  // Běží inventura? Když ano, tablet ji nabídne — počítat může kdokoli z týmu.
  useEffect(() => {
    fetch('/api/stocktake').then(okJson)
      .then(d => setStocktakeOpen(!!d?.open))
      .catch(() => setStocktakeOpen(false));
  }, [counting]);
  // Arriving from the home-screen shortcut: open the entry form straight away.
  useEffect(() => {
    if (!autoOpenEntry) return;
    setAdding(true);
    setStockFocused(false);
    onEntryOpened?.();
  }, [autoOpenEntry]); // eslint-disable-line react-hooks/exhaustive-deps

  const cats = useMemo(() => ['Vše', ...Array.from(new Set(items.map(i => i.category).filter(Boolean)))], [items]);
  const parkedCount = items.filter(i => i.archived === true).length;
  const filtered = items.filter(i =>
    (showParked ? i.archived === true : i.archived !== true) &&
    (cat === 'Vše' || i.category === cat) &&
    (!search.trim() || i.name.toLowerCase().includes(search.trim().toLowerCase())));

  const setParked = (item: Item, archived: boolean) => {
    setItems(list => list.map(x => x.id === item.id ? { ...x, archived } : x));
    fetch(`/api/inventory/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived, note: archived ? 'Označeno „nevedeme"' : 'Vráceno do skladu' }),
    }).catch(() => setItems(list => list.map(x => x.id === item.id ? { ...x, archived: !archived } : x)));
  };

  const step = (item: Item, delta: number) => {
    const before = item.quantity;
    const next = Math.max(0, item.quantity + delta);
    setItems(list => list.map(x => x.id === item.id ? { ...x, quantity: next } : x));
    clearTimeout(timers.current[item.id]);
    timers.current[item.id] = setTimeout(async () => {
      try {
        const r = await fetch(`/api/inventory/${item.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quantity: next }),
        });
        if (!r.ok) throw new Error(String(r.status));
        setSaveErr('');
      } catch {
        // Uložení neprošlo: vrátit číslo zpět, ať tablet neukazuje stav, který
        // v databázi není, a říct to nahlas.
        setItems(list => list.map(x => x.id === item.id ? { ...x, quantity: before } : x));
        setSaveErr(`Změnu u „${item.name}" se nepodařilo uložit. Zkontroluj připojení a zkus to znovu.`);
      }
    }, 500);
  };

  const patchItem = (next: Item) =>
    setItems(list => list.map(x => x.id === next.id ? { ...x, ...next } : x));

  return (
    <div className="space-y-5">
      {!loading && (
        <KioskPackagedStock
          items={items}
          categories={categories}
          onChanged={patchItem}
          onFocusChange={setStockFocused}
        />
      )}

      {!stockFocused && (
        <div className="space-y-4">
          {/* New arrivals get written in right here — the tablet is where the
              crew stands when the delivery is unpacked. */}
          {adding ? (
            <div className="glass-card p-5 space-y-4">
              <p className="font-bold text-lg text-[#16181A] flex items-center gap-2">
                <Icon name="box" size={20} className="text-[#5B7A08]" /> Nová věc do skladu
                {active && <span className="text-sm font-medium text-black/40">· zapisuje {active.name}</span>}
              </p>
              <NewStockEntry
                variant="kiosk"
                actingAs={activeId}
                onSaved={() => { setAdding(false); setJustAdded(true); setTimeout(() => setJustAdded(false), 4000); reload(); }}
                onCancel={() => setAdding(false)}
              />
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              className="w-full rounded-2xl bg-[#16181A] text-white px-5 py-4 text-base font-bold min-h-[56px] flex items-center justify-center gap-2 active:scale-[0.99] transition">
              <Icon name="plus" size={20} strokeWidth={2.2} /> Zapsat novou věc do skladu
            </button>
          )}
          {/* Inventuru zahajuje vedení, ale počítá ji ten, kdo stojí u regálu —
              tedy zpravidla někdo s tímhle tabletem v ruce. */}
          {stocktakeOpen && (
            <button onClick={() => setCounting(true)}
              className="w-full rounded-2xl bg-[#C8F542] on-accent px-5 py-4 text-base font-bold min-h-[56px] flex items-center justify-center gap-2 active:scale-[0.99] transition">
              <Icon name="clipboard" size={20} strokeWidth={2.2} /> Probíhá inventura — spočítat sklad
            </button>
          )}
          {justAdded && (
            <div className="rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/30 text-[#5B7A08] px-5 py-3.5 text-base font-semibold">
              Zapsáno do skladu ✓ Vedení to potvrdí.
            </div>
          )}
          <SearchField value={search} onChange={setSearch} placeholder="Hledat položku…" storageKey="inventory-kiosk"
            suggestions={Array.from(new Set(items.map(i => i.category).filter(Boolean))).slice(0, 6).map(c => ({ label: String(c), hint: 'kategorie' }))}
            inputClassName="!py-3.5 text-base" />
          {(parkedCount > 0 || showParked) && (
            <button onClick={() => setShowParked(v => !v)}
              className={`w-full rounded-2xl px-5 py-3 text-sm font-semibold min-h-[48px] transition active:scale-[0.99] ${
                showParked ? 'seg-on' : 'seg-off glass'
              }`}>
              {showParked ? 'Zpět na to, co máme' : `Co nevedeme (${parkedCount})`}
            </button>
          )}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1">
            {cats.map(c => (
              <button key={c} onClick={() => setCat(c)}
                className={`px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap shrink-0 transition ${cat === c ? 'seg-on' : 'seg-off glass'}`}>
                {c}
              </button>
            ))}
          </div>

          {saveErr && (
            <div role="alert" className="note note-danger px-5 py-3.5 text-base font-semibold flex items-center gap-2">
              <Icon name="warning" size={18} className="shrink-0" />{saveErr}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center h-40"><div className="spinner" /></div>
          ) : loadErr ? (
            <div className="glass-card p-8 text-center space-y-3">
              <p className="text-base font-semibold text-red-700">Sklad se nepodařilo načíst.</p>
              <p className="text-sm text-black/50">Nejspíš vypadlo připojení. Data můžou být neúplná — nespoléhej na tenhle seznam, dokud se nenačte.</p>
              <button onClick={() => { setLoading(true); reload(); }} className="rounded-2xl bg-[#16181A] text-white px-5 py-3 text-sm font-bold min-h-[48px] active:scale-[0.99] transition">Zkusit znovu</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="glass-card p-4"><EmptyState icon="box" compact title="Žádné položky"
              hint="V téhle kategorii zatím nic není. Zkus jinou, nebo hledej podle názvu." /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map(i => {
                const st = statusOf(i);
                const dot = st === 'critical' ? 'bg-red-500' : st === 'low' ? 'bg-amber-500' : 'bg-[#C8F542]';
                return (
                  // Ovládání zabere 226 px (čtyři tlačítka 48 px a počítadlo).
                  // Na telefonu tak na název zbylo 56 px z potřebných 176 —
                  // z „Sirup Monin Levandule" bylo vidět „Siru…". Název si
                  // proto bere celý řádek a tlačítka se zalomí pod něj.
                  <div key={i.id} className={`glass-card p-3 min-[360px]:p-4 flex items-center gap-x-2 min-[360px]:gap-x-3 gap-y-3 flex-wrap ${st === 'critical' ? 'border-red-500/25' : ''}`}>
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
                    {/* Zlom podle šířky okna tady klame: od 520 px se karty
                        srovnají do dvou sloupců, takže karta je zase úzká a na
                        název zbylo 52 px. Na jeden řádek se to vrací až od
                        1024 px, kde je karta doopravdy široká. */}
                    <div className="min-w-0 flex-1 basis-[calc(100%-1.5rem)] lg:basis-0">
                      <p className="font-semibold text-[#16181A] line-clamp-2">
                        {i.name}
                        {i.brand && <span className="ml-1.5 font-normal text-black/40">{i.brand}</span>}
                        {(i as any).approved === false && (
                          <span className="ml-1.5 rounded-full bg-amber-500/12 text-amber-700 px-2 py-0.5 text-[11px] font-semibold align-middle">
                            čeká na potvrzení
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-black/40 truncate">{i.category}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                      {i.archived ? (
                        <button onClick={() => setParked(i, false)}
                          className="rounded-2xl bg-[#C8F542] text-black px-4 h-12 text-sm font-bold active:scale-95 transition">
                          Máme zpátky
                        </button>
                      ) : (
                      <>
                      <button onClick={() => setParked(i, true)} title="Momentálně nevedeme"
                        className="rounded-2xl glass border border-black/10 w-11 h-11 min-[360px]:w-12 min-[360px]:h-12 flex items-center justify-center text-black/40 active:scale-95 transition">
                        <Icon name="warning" size={18} />
                      </button>
                      <button onClick={() => step(i, -1)}
                        className="rounded-2xl glass border border-black/10 w-11 h-11 min-[360px]:w-12 min-[360px]:h-12 flex items-center justify-center text-xl min-[360px]:text-2xl leading-none text-black/70 active:scale-95 transition">−</button>
                      <span className="w-12 min-[360px]:w-16 text-center font-bold text-[#16181A] tabular-nums text-base min-[360px]:text-lg">
                        {i.quantity}<span className="block text-[11px] font-medium text-black/40 leading-none">{i.unit}</span>
                      </span>
                      <button onClick={() => step(i, 1)}
                        className="rounded-2xl bg-[#C8F542] w-11 h-11 min-[360px]:w-12 min-[360px]:h-12 flex items-center justify-center text-xl min-[360px]:text-2xl leading-none text-black active:scale-95 transition">+</button>
                      </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {counting && (
        <StocktakeModal isEmployer={false} onClose={() => setCounting(false)} onApplied={reload} />
      )}
    </div>
  );
}
