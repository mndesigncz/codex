'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from '../Icons';
import { Button, Card, EmptyState, ErrorState, ListRow, SearchField } from '../ui';
import KioskPackagedStock from './KioskPackagedStock';
import NewStockEntry from '../inventory/NewStockEntry';
import StocktakeModal from '../inventory/Stocktake';
import { useKioskShift } from './KioskShiftGate';
import { okJson } from '@/lib/api';
import { obsahuje, obsahujeNekde } from '@/lib/hledani';

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
    obsahuje(i.name, search));

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
          {/* Kolo 69 (DP §6.1, §6.2, §6.6, §6.8): tlačítka z ui místo ručně
              psaných, kontejnery Card a `.list` místo glass-card na položku,
              znaky „−"/„+" jako ikony. Limetka je na obrazovce jediná — na
              „Probíhá inventura", když běží; jinak žádná. Dřív svítila na „+"
              u každého řádku, na tečce „v pořádku" i na „Máme zpátky". Cíle
              44 px si tlačítkům na kiosku zvedá .kiosk-surface. */}
          {/* New arrivals get written in right here — the tablet is where the
              crew stands when the delivery is unpacked. */}
          {adding ? (
            <Card className="space-y-4" aria-labelledby="kiosk-sklad-nova">
              <h2 id="kiosk-sklad-nova" className="t-card flex flex-wrap items-center gap-2">
                <Icon name="box" size={20} /> Nová věc do skladu
                {active && <span className="t-meta">· zapisuje {active.name}</span>}
              </h2>
              <NewStockEntry
                variant="kiosk"
                actingAs={activeId}
                onSaved={() => { setAdding(false); setJustAdded(true); setTimeout(() => setJustAdded(false), 4000); reload(); }}
                onCancel={() => setAdding(false)}
              />
            </Card>
          ) : (
            <Button variant="primary" size="lg" icon="plus" block className="w-full" onClick={() => setAdding(true)}>
              Zapsat novou věc do skladu
            </Button>
          )}
          {/* Inventuru zahajuje vedení, ale počítá ji ten, kdo stojí u regálu —
              tedy zpravidla někdo s tímhle tabletem v ruce. */}
          {stocktakeOpen && (
            <Button variant="accent" size="lg" icon="clipboard" block className="w-full" onClick={() => setCounting(true)}>
              Probíhá inventura — spočítat sklad
            </Button>
          )}
          {justAdded && (
            // Stavové hlášení `.note` (DP §3.15) — dřív ručně limetkový box a znak ✓.
            <p className="note note-ok text-base font-semibold" role="status">
              Zapsáno do skladu. Vedení to potvrdí.
            </p>
          )}
          <SearchField value={search} onChange={setSearch} placeholder="Hledat položku…" storageKey="inventory-kiosk"
            suggestions={Array.from(new Set(items.map(i => i.category).filter(Boolean))).slice(0, 6).map(c => ({ label: String(c), hint: 'kategorie' }))}
            inputClassName="!py-3.5 text-base" />
          {(parkedCount > 0 || showParked) && (
            <Button variant="secondary" size="lg" block className="w-full" aria-pressed={showParked} onClick={() => setShowParked(v => !v)}>
              {showParked ? 'Zpět na to, co máme' : `Co nevedeme (${parkedCount})`}
            </Button>
          )}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1">
            {cats.map(c => (
              <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}
                className={`filter-pill whitespace-nowrap shrink-0 ${cat === c ? 'seg-on' : 'seg-off glass'}`}>
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
            <Card pad="none">
              <ErrorState compact title="Sklad se nepodařilo načíst."
                hint="Nejspíš vypadlo připojení. Data můžou být neúplná — nespoléhej na tenhle seznam, dokud se nenačte."
                onRetry={() => { setLoading(true); reload(); }} />
            </Card>
          ) : filtered.length === 0 ? (
            <Card pad="sm"><EmptyState icon="box" compact title="Žádné položky"
              hint="V téhle kategorii zatím nic není. Zkus jinou, nebo hledej podle názvu." /></Card>
          ) : (
            // Jedna karta s linkami (DP §3.6), ne karta na položku. Na telefonu
            // ListRow zalomí ovládání pod název, takže „Sirup Monin Levandule"
            // zůstane čitelný celý.
            <Card pad="none" className="px-5">
              <ul className="list">
                {filtered.map(i => {
                  const st = statusOf(i);
                  const ceka = (i as any).approved === false;
                  return (
                    <li key={i.id}>
                      <ListRow as="div"
                        lead={<span className={`w-2.5 h-2.5 rounded-full shrink-0 ${st === 'critical' ? 'bg-bad' : st === 'low' ? 'bg-wait' : 'bg-ok'}`} aria-hidden />}
                        title={<>{i.name}{i.brand && <span className="ml-1.5 font-normal text-black/55">{i.brand}</span>}</>}
                        meta={<>
                          {st !== 'ok' && <span className={`font-medium ${st === 'critical' ? 'text-bad-ink' : 'text-wait-ink'}`}>{st === 'critical' ? 'kriticky · ' : 'dochází · '}</span>}
                          {ceka && <span className="font-medium text-wait-ink">čeká na potvrzení · </span>}
                          {i.category}
                        </>}
                        actions={i.archived ? (
                          <Button variant="secondary" onClick={() => setParked(i, false)}>Máme zpátky</Button>
                        ) : <>
                          <Button variant="ghost" iconOnly icon="archive" aria-label={`Momentálně nevedeme — ${i.name}`} title="Momentálně nevedeme"
                            onClick={() => setParked(i, true)} />
                          <span className="flex items-center gap-1.5">
                            <Button variant="secondary" iconOnly icon="minus" aria-label={`Ubrat — ${i.name}`} onClick={() => step(i, -1)} />
                            <span className="w-14 text-center font-bold text-[#16181A] tabular-nums text-lg" aria-live="polite">
                              {i.quantity}<span className="block text-[11px] font-medium text-black/55 leading-none">{i.unit}</span>
                            </span>
                            <Button variant="secondary" iconOnly icon="plus" aria-label={`Přidat — ${i.name}`} onClick={() => step(i, 1)} />
                          </span>
                        </>}
                      />
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      )}

      {counting && (
        <StocktakeModal smiZahajit={false} smiDokoncit={false} smiZtraty={false} onClose={() => setCounting(false)} onApplied={reload} />
      )}
    </div>
  );
}
