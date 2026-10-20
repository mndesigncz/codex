'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from '../Icons';
import { Button, Card, EmptyState, ErrorState, ListRow, SearchField, Segmented } from '../ui';
import KioskPackagedStock from './KioskPackagedStock';
import NewStockEntry from '../inventory/NewStockEntry';
import StocktakeModal from '../inventory/Stocktake';
import { useKioskShift } from './KioskShiftGate';
import { okJson } from '@/lib/api';
import { useJazyk, useT } from '@/lib/i18n/client';
import { LOCALE_PRO_JAZYK } from '@/lib/i18n/config';
import {
  filtrujSkladTabletu, filtrZeSkladArg, minimumPolozky, pocetStavuSkladu, stavPolozkyTabletu, type FiltrStavuSkladu,
} from '@/lib/kioskPrehled';

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

/** Interní hodnota filtru „všechny kategorie“ — nápis se překládá až při vykreslení. */
const KAT_VSE = '*vse*';

/** Předání z widgetu (Docházející zásoby): argument `stav:dochazi|Kategorie` a počítadlo, ať jde stejný proklik zopakovat. */
export interface PredaniSkladuTabletu { arg?: string; n: number }

export default function KioskInventory({ autoOpenEntry = false, onEntryOpened, predani }: {
  autoOpenEntry?: boolean;
  onEntryOpened?: () => void;
  predani?: PredaniSkladuTabletu;
} = {}) {
  const t = useT('kiosk');
  const { jazyk } = useJazyk();
  const cislo = (n: number) => n.toLocaleString(LOCALE_PRO_JAZYK[jazyk]);
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Kiosk stojí u baru bez očí na konzoli — když načtení nebo uložení selže,
  // musí to být vidět na obrazovce, ne zmizet do prázdného seznamu.
  const [loadErr, setLoadErr] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [cat, setCat] = useState(KAT_VSE);
  const [search, setSearch] = useState('');
  // Filtr stavu nad kategoriemi (MarketMan „Below par", Square „Low stock"): obsluha před
  // objednávkou chce vidět jen to, co dochází. Proklik z widgetu ho nastaví sám.
  const [filtrStavu, setFiltrStavu] = useState<FiltrStavuSkladu>(() => filtrZeSkladArg(predani?.arg).stav);
  useEffect(() => {
    if (!predani?.n) return;
    const f = filtrZeSkladArg(predani.arg);
    setFiltrStavu(f.stav);
    setCat(f.kategorie ?? KAT_VSE);
    setShowParked(false);
    setStockFocused(false);
  }, [predani?.n]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const cats = useMemo(() => [KAT_VSE, ...Array.from(new Set(items.map(i => i.category).filter(Boolean)))], [items]);
  // Kategorie z prokliku, kterou sklad nemá (přejmenovaná, nebo jen v jiném podniku): zpět na Vše,
  // ať seznam neukazuje prázdno bez vybrané pilulky.
  useEffect(() => { if (!loading && cat !== KAT_VSE && !cats.includes(cat)) setCat(KAT_VSE); }, [loading, cat, cats]);
  const parkedCount = items.filter(i => i.archived === true).length;
  const pocty = useMemo(() => pocetStavuSkladu(items), [items]);
  const filtered = filtrujSkladTabletu(items, { nevedeme: showParked, stav: filtrStavu, kategorie: cat === KAT_VSE ? null : cat, hledani: search });

  const setParked = (item: Item, archived: boolean) => {
    setItems(list => list.map(x => x.id === item.id ? { ...x, archived } : x));
    fetch(`/api/inventory/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived, note: archived ? 'Označeno „nevedeme"' : 'Vráceno do skladu' }), // i18n-ok: poznámka do historie skladu
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
        setSaveErr(t('Změnu u „{nazev}" se nepodařilo uložit. Zkontroluj připojení a zkus to znovu.', { nazev: item.name }));
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
                <Icon name="box" size={20} /> {t('Nová věc do skladu')}
                {active && <span className="t-meta">· {t('zapisuje {jmeno}', { jmeno: active.name })}</span>}
              </h2>
              <NewStockEntry
                variant="kiosk"
                actingAs={activeId}
                onSaved={() => { setAdding(false); setJustAdded(true); setTimeout(() => setJustAdded(false), 4000); reload(); }}
                onCancel={() => setAdding(false)}
              />
            </Card>
          ) : (
            // Při inventuře je hlavní akcí limetkové „spočítat sklad" — zápis nové věci pak
            // ustoupí do šedé pilulky, ať pod sebou nesvítí inkoust i limetka (v3).
            <Button variant={stocktakeOpen ? 'secondary' : 'primary'} size="lg" icon="plus" block className="w-full" onClick={() => setAdding(true)}>
              {t('Zapsat novou věc do skladu')}
            </Button>
          )}
          {/* Inventuru zahajuje vedení, ale počítá ji ten, kdo stojí u regálu —
              tedy zpravidla někdo s tímhle tabletem v ruce. */}
          {stocktakeOpen && (
            <Button variant="accent" size="lg" icon="clipboard" block className="w-full" onClick={() => setCounting(true)}>
              {t('Probíhá inventura — spočítat sklad')}
            </Button>
          )}
          {justAdded && (
            // Stavové hlášení `.note` (DP §3.15) — dřív ručně limetkový box a znak ✓.
            <p className="note note-ok text-base font-semibold" role="status">
              {t('Zapsáno do skladu. Vedení to potvrdí.')}
            </p>
          )}
          <SearchField value={search} onChange={setSearch} placeholder={t('Hledat položku…')} storageKey="inventory-kiosk"
            suggestions={Array.from(new Set(items.map(i => i.category).filter(Boolean))).slice(0, 6).map(c => ({ label: String(c), hint: t('kategorie') }))}
            inputClassName="!py-3.5 text-base" />
          {(parkedCount > 0 || showParked) && (
            <Button variant="secondary" size="lg" block className="w-full" aria-pressed={showParked} onClick={() => setShowParked(v => !v)}>
              {showParked ? t('Zpět na to, co máme') : t('Co nevedeme ({n})', { n: parkedCount })}
            </Button>
          )}
          {/* Stav nad kategoriemi; počty jen z toho, co podnik vede. V „Co nevedeme" nedává smysl. */}
          {!showParked && (
            // U baru palcem: položky pásu 48 px jako záložky tabletu (tap-target-sm by dal jen 44).
            <Segmented ariaLabel={t('Stav zásob')} value={filtrStavu} onChange={setFiltrStavu} className="[&_[role=tab]]:min-h-12"
              options={[
                { id: 'vse', label: t('Vše') },
                { id: 'dochazi', label: t('Dochází'), count: pocty.dochazi },
                { id: 'kriticky', label: t('Kriticky'), count: pocty.kriticky },
              ]} />
          )}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1">
            {cats.map(c => (
              <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}
                className={`filter-pill whitespace-nowrap shrink-0 ${cat === c ? 'seg-on' : 'seg-off glass'}`}>
                {c === KAT_VSE ? t('Vše') : c}
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
              <ErrorState compact title={t('Sklad se nepodařilo načíst.')}
                hint={t('Nejspíš vypadlo připojení. Data můžou být neúplná — nespoléhej na tenhle seznam, dokud se nenačte.')}
                onRetry={() => { setLoading(true); reload(); }} />
            </Card>
          ) : filtered.length === 0 ? (
            filtrStavu !== 'vse' && !showParked ? (
              <Card pad="sm"><EmptyState icon="box" compact title={filtrStavu === 'kriticky' ? t('Nic není kriticky') : t('Nic nedochází')}
                hint={t('Všechno je nad minimem. Ostatní položky najdeš pod Vše.')}
                action={<Button variant="secondary" onClick={() => setFiltrStavu('vse')}>{t('Ukázat vše')}</Button>} /></Card>
            ) : (
              <Card pad="sm"><EmptyState icon="box" compact title={t('Žádné položky')}
                hint={t('V téhle kategorii zatím nic není. Zkus jinou, nebo hledej podle názvu.')} /></Card>
            )
          ) : (
            // Jedna karta s linkami (DP §3.6), ne karta na položku. Na telefonu
            // ListRow zalomí ovládání pod název, takže „Sirup Monin Levandule"
            // zůstane čitelný celý.
            <Card pad="none" className="px-5">
              <ul className="list">
                {filtered.map(i => {
                  const st = stavPolozkyTabletu(i);
                  const ceka = (i as any).approved === false;
                  const { min, chybi } = minimumPolozky(i);
                  return (
                    <li key={i.id}>
                      <ListRow as="div"
                        lead={<span className={`w-2.5 h-2.5 rounded-full shrink-0 ${st === 'critical' ? 'bg-bad' : st === 'low' ? 'bg-wait' : 'bg-ok'}`} aria-hidden />}
                        title={<>{i.name}{i.brand && <span className="ml-1.5 font-normal text-black/55">{i.brand}</span>}</>}
                        meta={<>
                          {st !== 'ok' && <span className={`font-medium ${st === 'critical' ? 'text-bad-ink' : 'text-wait-ink'}`}>{st === 'critical' ? `${t('kriticky')} · ` : `${t('dochází')} · `}</span>}
                          {ceka && <span className="font-medium text-wait-ink">{t('čeká na potvrzení')} · </span>}
                          {/* Minimum jako „par level" — u „1 bal · dochází" je vidět, jestli má být 2, nebo 10.
                              Před kategorií: meta se na telefonu zkracuje a kategorie je z toho nejméně důležitá. */}
                          {min != null && <span className="tabular-nums">{t('min {n} {jednotka}', { n: cislo(min), jednotka: i.unit })} · </span>}
                          {chybi != null && <span className={`tabular-nums font-medium ${st === 'critical' ? 'text-bad-ink' : 'text-wait-ink'}`}>{t('chybí {n}', { n: cislo(chybi) })} · </span>}
                          {i.category}
                        </>}
                        actions={i.archived ? (
                          <Button variant="secondary" onClick={() => setParked(i, false)}>{t('Máme zpátky')}</Button>
                        ) : <>
                          <Button variant="ghost" iconOnly icon="archive" aria-label={t('Momentálně nevedeme — {nazev}', { nazev: i.name })} title={t('Momentálně nevedeme')}
                            onClick={() => setParked(i, true)} />
                          <span className="flex items-center gap-1.5">
                            <Button variant="secondary" iconOnly icon="minus" aria-label={t('Ubrat — {nazev}', { nazev: i.name })} onClick={() => step(i, -1)} />
                            <span className="w-14 text-center font-bold text-[#16181A] tabular-nums text-lg" aria-live="polite">
                              {i.quantity}<span className="block text-[11px] font-medium text-black/55 leading-none">{i.unit}</span>
                            </span>
                            <Button variant="secondary" iconOnly icon="plus" aria-label={t('Přidat — {nazev}', { nazev: i.name })} onClick={() => step(i, 1)} />
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
