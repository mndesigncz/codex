'use client';

// Návody: jak se co dělá — s kroky, na baru po ruce.
//
// Kolo 69 (balík B6b): stránka je plocha s widgety. Hlavička jde do PlochaWidgetu,
// pás návrhů je widget navody.navrhy, povinné čtení má souhrn ve widgetu
// navody.povinne_cteni a „kdo četl" ve widgetu navody.kdo_necetl (oblasti/navody.tsx).
// Tahle komponenta kreslí nástroj: kategorie, hledání, seznam, čtečku, editor
// a správu kategorií. Data čte přes useDataWidgetu ze stejných adres jako
// widgety — po schválení nebo potvrzení přečtení se obnoví obojí zároveň.
//
// Co se změnilo proti kolu 68 (audit final_sorted.json, obsah-kontrola.txt):
//  - boční karta kategorií s vybranou položkou limetkově tónovanou a ručním štítkem
//    verzálkami → filtrovací pás (filter-pill, vybráno inkoustem) nad seznamem;
//  - mřížka karet, které při hoveru šedly a dostaly limetkový okraj → seznam v jedné kartě;
//  - štítky kategorie v limetkovém (stavovém) tónu, ruční pilulky „povinné čtení",
//    „checklist" a „Čeká na schválení" → Chip;
//  - Upravit/Smazat pod myší s inline SVG → „···" vždy vidět; confirm() → Modal;
//  - čtečka, editor a správa kategorií ručně psanými okny → Modal; akce čtečky
//    (povinné čtení, připnutí k uzávěrce, kdo četl, upravit, smazat) do „···";
//  - `<option className="bg-neutral-900">` (tmavé položky výběru ve světlém režimu) pryč;
//  - kdo co smí, se čte z oprávnění (navody.vytvorit/upravit/mazat/schvalovat/
//    povinne_cteni/kategorie), ne z typu účtu.
//
// Tablet (KioskApp) plochu nemá — kreslí nástroj s vlastní hlavičkou jako dřív.

import { useState, useEffect, useMemo, useCallback, useId, useRef, type JSX } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from './Icons';
import {
  Avatar, Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Menu, Modal, PageHeader, SearchField, Select,
  Skeleton, SwitchRow, Textarea, type MenuItem,
} from './ui';
import StepTimeline from './procedures/StepTimeline';
import { parseSteps } from '@/lib/steps';
import { normalizeSteps, type GuideStep } from '@/lib/guideSteps';
import GuideStepIngredient from './guides/GuideStepIngredient';
import GuideProductLink from './guides/GuideProductLink';
import GuideItemLink from './guides/GuideItemLink';
import { okJson, apiMessage } from '@/lib/api';
import { czCount, KATEGORIE, type CzNoun } from '@/lib/czech';
import { obsahujeNekde } from '@/lib/hledani';
import KopieZPodniku, { useJinePodniky } from './organizace/KopieZPodniku';
import { PlochaWidgetu, type HlavickaPlochy } from './widgety/PlochaWidgetu';
import { obnovDataWidgetu, useDataWidgetu } from './widgety/useDataWidgetu';
import { useSmi } from './widgety/NavigaceKontext';
import { useOpravneni } from './role/useOpravneni';
import {
  URL_NAVODY, URL_CTENARI, UDALOST_OTEVRIT_NAVOD, vyberNavody, poctyKategorii, kdyUpraveno, type NavodApi,
} from '@/lib/navodyPrehled';

interface User {
  id: number;
  name: string;
  role: string;
}

interface Category {
  id: number;
  name: string;
  icon: string;
  position: number;
  /** Kategorie zdrojového podniku organizace — jen ke čtení, spravuje ji jeho vedení. */
  zOrganizace?: boolean;
  /** Vlastní kategorie, kterou vidí i ostatní podniky organizace. */
  sdileno?: boolean;
  /** Název podniku, který kategorii spravuje (jen u `zOrganizace`). */
  spravuje?: string | null;
}

interface GuideFull {
  id: number;
  title: string;
  content: string;
  checklist: GuideStep[];
  categoryId: number | null;
  updatedAt: string;
  createdAt?: string;
  author?: string;
  productId?: string | null;
  productName?: string | null;
  itemId?: number | null;
  itemName?: string | null;
  itemMadeInHouse?: boolean;
}

const URL_KATEGORIE = '/api/guides/categories';
const KROK: CzNoun = { one: 'krok', few: 'kroky', many: 'kroků' };

// Replaces the removed Recipes feature — recipes now live as guides under "Recepty & Menu".
const DEFAULT_CATEGORIES = [
  { name: 'Recepty & Menu', icon: 'leaf' },
  { name: 'Úklid', icon: 'check' },
  { name: 'Provoz', icon: 'box' },
  { name: 'Zákaznický servis', icon: 'chat' },
];

const CATEGORY_ICONS: { id: string; nazev: string }[] = [
  { id: 'book', nazev: 'Kniha' }, { id: 'leaf', nazev: 'List' }, { id: 'check', nazev: 'Fajfka' }, { id: 'box', nazev: 'Krabice' },
  { id: 'chat', nazev: 'Bublina' }, { id: 'users', nazev: 'Lidé' }, { id: 'clock', nazev: 'Hodiny' }, { id: 'calendar', nazev: 'Kalendář' },
  { id: 'trend', nazev: 'Graf' }, { id: 'warning', nazev: 'Výstraha' },
];

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

function vyberKategorie(raw: any): Category[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.categories)) throw new Error('Kategorie přišly v nečekaném tvaru.');
  return raw.categories;
}

// Lightweight markdown-ish renderer: **bold**, "- " bullets, preserved line breaks.
function renderContent(content: string) {
  const lines = String(content || '').split('\n');
  const blocks: JSX.Element[] = [];
  let bullets: string[] = [];

  const flushBullets = (key: string) => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={key} className="my-2 space-y-1.5 list-disc pl-5 marker:text-black/35">
        {bullets.map((b, i) => (
          <li key={i} className="text-black/80">{renderInline(b)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      bullets.push(trimmed.slice(2));
    } else {
      flushBullets(`ul-${i}`);
      if (trimmed === '') {
        blocks.push(<div key={`sp-${i}`} className="h-3" />);
      } else {
        blocks.push(
          <p key={`p-${i}`} className="text-black/80 leading-relaxed">
            {renderInline(line)}
          </p>
        );
      }
    }
  });
  flushBullets('ul-end');
  return blocks;
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-[#16181A]">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export default function Guides({ user, ticksFor, openGuideId }: {
  user: User;
  ticksFor?: number | null;
  /** Otevřít rovnou tenhle návod — proklik z receptury, ze skladu, z úkolu nebo z widgetu. */
  openGuideId?: number | null;
}) {
  const pathname = usePathname() ?? '';
  const { role } = useOpravneni();
  // Tablet nemá plochu (kiosk.smena je jiná stránka, balík B9) — nástroj s vlastní hlavičkou.
  const tablet = pathname.startsWith('/kiosk') || user.role === 'kiosk' || role?.typ === 'kiosk';
  const stranka = pathname.startsWith('/employer') ? 'vedeni.navody' : 'zamestnanec.navody';
  const smi = useSmi();
  const smiVytvorit = smi('navody.vytvorit');
  const smiNavrhnout = smi('navody.navrhnout');
  const smiUpravit = smi('navody.upravit');
  const smiMazat = smi('navody.mazat');
  const smiSchvalovat = smi('navody.schvalovat');
  const smiPovinne = smi('navody.povinne_cteni');
  const smiKategorie = smi('navody.kategorie');

  const navody = useDataWidgetu(URL_NAVODY, vyberNavody);
  const kategorie = useDataWidgetu(URL_KATEGORIE, vyberKategorie);
  const guides = navody.data ?? [];
  const categories = kategorie.data ?? [];

  const [activeCat, setActiveCat] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [chyba, setChyba] = useState('');

  // Reader / editor modals
  const [reader, setReader] = useState<GuideFull | null>(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<GuideFull | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [creatingCat, setCreatingCat] = useState(false);
  const [smazat, setSmazat] = useState<{ id: number; title: string } | null>(null);
  const [mazu, setMazu] = useState(false);
  // Kopie z jiného podniku organizace — jen s právem zakládat a jen když takový podnik existuje.
  const [kopieOpen, setKopieOpen] = useState(false);
  const { jine: jinePodniky, cil: nazevPodniku } = useJinePodniky(smiVytvorit);

  const reloadGuides = useCallback(() => { obnovDataWidgetu(URL_NAVODY); obnovDataWidgetu(URL_CTENARI); }, []);
  const reloadCategories = useCallback(() => { obnovDataWidgetu(URL_KATEGORIE); }, []);

  const catById = useMemo(() => {
    const m = new Map<number, Category>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const counts = useMemo(() => poctyKategorii(guides), [guides]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return guides.filter((g) => {
      if (activeCat === -1) { if (g.categoryId != null) return false; }
      else if (activeCat !== 'all' && g.categoryId !== activeCat) return false;
      if (!q) return true;
      return obsahujeNekde(q, g.title, g.excerpt);
    });
  }, [guides, activeCat, search]);

  const hasUncategorized = useMemo(() => guides.some((g) => g.categoryId == null), [guides]);

  const openReader = useCallback(async (id: number) => {
    setReaderLoading(true);
    setReader({ id, title: '', content: '', checklist: [], categoryId: null, updatedAt: '' });
    try {
      const d = await fetch(`/api/guides/${id}`).then(okJson);
      if (d.guide) setReader({ ...d.guide, checklist: normalizeSteps(d.guide.checklist) });
      else setReader(null);
    } catch (e) {
      // A dead network must not leave the reader on an endless spinner.
      setReader(null);
      setChyba(apiMessage(e, 'Návod se nepodařilo otevřít.'));
    } finally {
      setReaderLoading(false);
    }
  }, []);

  // Proklik na konkrétní návod otevře rovnou čtečku. Ref hlídá, aby se čtečka
  // po zavření sama znovu neotevřela.
  const otevrenoZOdkazu = useRef<number | null>(null);
  useEffect(() => {
    if (!openGuideId || otevrenoZOdkazu.current === openGuideId) return;
    otevrenoZOdkazu.current = openGuideId;
    void openReader(openGuideId);
  }, [openGuideId, openReader]);

  // Widgety (Povinné čtení, Nové, Kdo nečetl…) otevírají čtečku tady — bez přechodu jinam.
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ id: number; prijato: boolean }>).detail;
      if (!d) return;
      d.prijato = true;
      void openReader(d.id);
    };
    window.addEventListener(UDALOST_OTEVRIT_NAVOD, f);
    return () => window.removeEventListener(UDALOST_OTEVRIT_NAVOD, f);
  }, [openReader]);

  const createDefaults = async () => {
    setCreatingCat(true); setChyba('');
    // Smyčka bez kontroly mlčky založila jen část kategorií; člověk pak
    // koukal na neúplný seznam a nevěděl, jestli to tak má být.
    let selhalo = 0;
    for (const c of DEFAULT_CATEGORIES) {
      try {
        const res = await fetch(URL_KATEGORIE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) });
        if (!res.ok) selhalo += 1;
      } catch { selhalo += 1; }
    }
    if (selhalo > 0) setChyba(`${czCount(selhalo, KATEGORIE)} se nepodařilo založit. Zkus to prosím znovu.`);
    reloadCategories();
    setCreatingCat(false);
  };

  const openEditor = (g?: GuideFull) => { setEditing(g ?? null); setEditorOpen(true); };
  const closeEditor = () => { setEditorOpen(false); setEditing(null); };
  const editById = async (id: number) => {
    setChyba('');
    try {
      const d = await fetch(`/api/guides/${id}`).then(okJson);
      if (d.guide) openEditor({ ...d.guide, checklist: normalizeSteps(d.guide.checklist) });
    } catch (e) {
      setChyba(apiMessage(e, 'Návod se nepodařilo otevřít k úpravě.'));
    }
  };

  const deleteGuide = async () => {
    if (!smazat) return;
    setMazu(true); setChyba('');
    // Bez téhle kontroly se po nepovedeném smazání jen zavřel čtenář
    // a seznam se načetl znovu — návod tam pořád byl a nikdo nevěděl proč.
    try {
      const res = await fetch(`/api/guides/${smazat.id}`, { method: 'DELETE' });
      await okJson(res);
      if (reader?.id === smazat.id) setReader(null);
      reloadGuides();
    } catch (e) {
      setChyba(apiMessage(e, 'Návod se nepodařilo smazat. Zkus to prosím znovu.'));
    }
    setMazu(false);
    setSmazat(null);
  };

  const patchGuide = async (id: number, body: Record<string, unknown>, chybaText: string) => {
    setChyba('');
    try {
      const res = await fetch(`/api/guides/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      await okJson(res);
      reloadGuides();
    } catch (e) {
      setChyba(apiMessage(e, chybaText));
    }
  };

  const smiZakladat = smiVytvorit || smiNavrhnout;
  const hlavicka: HlavickaPlochy = {
    title: 'Návody',
    subtitle: 'Jak se co dělá — krok za krokem, na baru po ruce.',
    hintId: 'guides',
    primary: smiZakladat && !tablet ? (
      <Button variant="accent" icon="plus" onClick={() => openEditor()} title={smiVytvorit ? undefined : 'Návrh schválí vedení'}>
        {smiVytvorit ? 'Nový návod' : 'Navrhnout návod'}
      </Button>
    ) : undefined,
    secondary: smiVytvorit && jinePodniky.length > 0
      ? <Button variant="secondary" icon="copy" onClick={() => setKopieOpen(true)}>Z jiného podniku</Button>
      : undefined,
    menu: [
      ...(smiKategorie ? [{ label: 'Spravovat kategorie', icon: 'settings', onClick: () => setManageOpen(true) }] : []),
      ...(smiVytvorit && jinePodniky.length > 0 ? [{ label: 'Kopírovat z jiného podniku', icon: 'copy', onClick: () => setKopieOpen(true) }] : []),
    ],
  };

  const pilulka = (klic: number | 'all', label: string, n: number) => (
    <button key={String(klic)} type="button" aria-pressed={activeCat === klic} onClick={() => setActiveCat(klic)}
      className={`filter-pill tap-target whitespace-nowrap shrink-0 ${activeCat === klic ? 'seg-on' : 'seg-off glass'}`}>
      {label} <span className="tabular-nums opacity-60">{n}</span>
    </button>
  );

  let seznam: React.ReactNode;
  if (navody.loading) {
    seznam = <Card pad="none" aria-busy><div className="p-5 space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12" />)}</div></Card>;
  } else if (navody.error) {
    seznam = <Card><ErrorState title="Návody se nenačetly" hint={navody.error} onRetry={navody.reload} /></Card>;
  } else if (filtered.length === 0) {
    seznam = (
      <Card>
        {search.trim() || activeCat !== 'all' ? (
          <EmptyState icon="search" compact title={search.trim() ? `Nic pro „${search.trim()}“` : 'V téhle kategorii nic není'}
            hint="Zkus jiné slovo nebo jinou kategorii." />
        ) : (
          <EmptyState illustration="postupy" title="Zatím žádné návody"
            hint={smiVytvorit
              ? 'Jak se připravuje váš podpisový nápoj, jak se čistí kávovar, co říct hostovi o nabídce — návody, které si tým otevře na baru.'
              : 'Až je vedení sepíše, najdeš je tady — krok za krokem.'}
            action={smiZakladat && !tablet
              ? <Button variant="secondary" icon="plus" onClick={() => openEditor()}>{smiVytvorit ? 'Napsat první návod' : 'Navrhnout návod'}</Button>
              : undefined} />
        )}
      </Card>
    );
  } else {
    seznam = (
      <Card pad="none">
        <ul className="list px-5">
          {filtered.map((g) => {
            const cat = g.categoryId != null ? catById.get(g.categoryId) : undefined;
            const polozky: MenuItem[] = [
              ...(g.approved === false && smiSchvalovat ? [{ label: 'Schválit návrh', icon: 'check', onClick: () => { void patchGuide(g.id, { approve: true }, 'Návod se neschválil.'); } }] : []),
              ...(smiUpravit ? [{ label: 'Upravit', icon: 'pencil', onClick: () => { void editById(g.id); } }] : []),
              ...(smiMazat ? [{ label: 'Smazat', icon: 'trash', danger: true, onClick: () => setSmazat({ id: g.id, title: g.title }) }] : []),
            ];
            const meta = [cat?.name, g.excerpt].filter(Boolean).join(' · ') || undefined;
            const stav = g.approved === false
              ? <Chip tone="wait" size="sm">Čeká na schválení</Chip>
              : g.requireRead
                ? <Chip tone={g.myRead ? 'ok' : 'wait'} size="sm" icon={g.myRead ? 'check' : 'book'}>{g.myRead ? 'Přečteno' : 'Povinné čtení'}</Chip>
                : undefined;
            if (polozky.length === 0) {
              return (
                <ListRow key={g.id} title={g.title} meta={meta} aside={kdyUpraveno(g.updatedAt)} right={stav}
                  onClick={() => { void openReader(g.id); }} />
              );
            }
            return (
              <ListRow key={g.id}
                // Řádek má „···", takže celý klikací být nemůže (tlačítko v tlačítku) — čtečku otevře název.
                title={<button type="button" onClick={() => { void openReader(g.id); }} className="block max-w-full truncate text-left hover:underline underline-offset-2 focus-visible:outline-none focus-visible:underline">{g.title}</button>}
                meta={meta} aside={kdyUpraveno(g.updatedAt)} right={stav}
                actions={<Menu size="sm" label={`Další akce s návodem ${g.title}`} items={polozky} />} />
            );
          })}
        </ul>
      </Card>
    );
  }

  const nastroj = (
    <div className="space-y-3">
      {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
      {kategorie.error && <p className="note note-wait" role="status">Kategorie se nenačetly — návody ukazuji bez nich. {kategorie.error}</p>}
      <SearchField value={search} onChange={setSearch} placeholder="Hledat návody…" storageKey="guides" ariaLabel="Hledat návody"
        suggestions={categories.map(c => ({ label: c.name, hint: 'kategorie' }))} />
      {(categories.length > 0 || hasUncategorized || (smiKategorie && !kategorie.loading)) && (
        <div className="flex gap-2 overflow-x-auto scrollbar-thin scroll-fade-x -mx-1 px-1 items-center" role="group" aria-label="Kategorie návodů">
          {pilulka('all', 'Vše', counts.get('vse') ?? 0)}
          {categories.map(c => pilulka(c.id, c.name, counts.get(c.id) ?? 0))}
          {hasUncategorized && pilulka(-1, 'Bez kategorie', counts.get(-1) ?? 0)}
          {smiKategorie && categories.length === 0 && !kategorie.loading && !kategorie.error && (
            <Button variant="secondary" size="sm" icon="plus" onClick={createDefaults} loading={creatingCat} className="shrink-0">Vytvořit výchozí kategorie</Button>
          )}
        </div>
      )}
      {seznam}
    </div>
  );

  const summary = reader ? guides.find(g => g.id === reader.id) ?? null : null;
  const okna = (
    <>
      {reader && (
        <GuideReader
          reader={reader}
          loading={readerLoading}
          summary={summary}
          kategorie={reader.categoryId != null ? catById.get(reader.categoryId) ?? null : null}
          tablet={tablet}
          ticksFor={ticksFor ?? user.id}
          smiUpravit={smiUpravit}
          smiMazat={smiMazat}
          smiPovinne={smiPovinne}
          smiSchvalit={smiSchvalovat}
          onClose={() => setReader(null)}
          onEdit={() => { const r = reader; setReader(null); openEditor(r); }}
          onDelete={() => setSmazat({ id: reader.id, title: reader.title })}
          onPatch={(body, text) => patchGuide(reader.id, body, text)}
          onMarkRead={async () => {
            setChyba('');
            try {
              const res = await fetch(`/api/guides/${reader.id}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markRead: true }),
              });
              await okJson(res);
              reloadGuides();
            } catch (e) {
              setChyba(apiMessage(e, 'Přečtení se nepodařilo potvrdit.'));
            }
          }}
        />
      )}

      <Modal open={!!smazat} onClose={() => { if (!mazu) setSmazat(null); }} size="sm" title="Smazat návod?"
        subtitle={smazat ? `„${smazat.title}"` : undefined}
        footer={<>
          <Button variant="secondary" onClick={() => setSmazat(null)} disabled={mazu}>Zrušit</Button>
          <Button variant="danger-solid" icon="trash" onClick={deleteGuide} loading={mazu}>Smazat</Button>
        </>}>
        <p className="text-sm text-black/55 text-pretty">Návod zmizí z knihovny i z kroků postupů a úkolů, které na něj odkazují.</p>
      </Modal>

      {editorOpen && (
        <GuideEditor
          editing={editing}
          categories={categories}
          navrh={!smiVytvorit && !editing}
          defaultCategory={typeof activeCat === 'number' && activeCat > 0 ? activeCat : null}
          onClose={closeEditor}
          onSaved={() => { reloadGuides(); closeEditor(); }}
        />
      )}

      {kopieOpen && smiVytvorit && (
        <KopieZPodniku entita="navody" podniky={jinePodniky} cil={nazevPodniku} onClose={() => setKopieOpen(false)}
          onHotovo={() => { reloadGuides(); reloadCategories(); }} />
      )}

      {manageOpen && smiKategorie && (
        <ManageCategories
          categories={categories}
          onClose={() => setManageOpen(false)}
          onChanged={() => { reloadCategories(); reloadGuides(); }}
        />
      )}
    </>
  );

  if (tablet) {
    return (
      <div className="p-4 sm:p-6 space-y-5">
        <PageHeader title={hlavicka.title} subtitle={hlavicka.subtitle} hintId={hlavicka.hintId} />
        {nastroj}
        {okna}
      </div>
    );
  }
  return (
    <>
      <PlochaWidgetu stranka={stranka} hlavicka={hlavicka} nastroj={nastroj} />
      {okna}
    </>
  );
}

// ---------------------------------------------------------------------------
// Čtečka
// ---------------------------------------------------------------------------

function GuideReader({
  reader, loading, summary, kategorie, tablet, ticksFor, smiUpravit, smiMazat, smiPovinne, smiSchvalit,
  onClose, onEdit, onDelete, onPatch, onMarkRead,
}: {
  reader: GuideFull;
  loading: boolean;
  summary: NavodApi | null;
  kategorie: Category | null;
  tablet: boolean;
  ticksFor: number | null;
  smiUpravit: boolean;
  smiMazat: boolean;
  smiPovinne: boolean;
  smiSchvalit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPatch: (body: Record<string, unknown>, chyba: string) => Promise<void>;
  onMarkRead: () => Promise<void>;
}) {
  // U kterého návodu má vedení rozbalený seznam „kdo četl".
  const [ctenari, setCtenari] = useState(false);
  const [potvrzuji, setPotvrzuji] = useState(false);
  const povinne = summary?.requireRead === true;
  const polozky: MenuItem[] = loading ? [] : [
    ...(summary?.approved === false && smiSchvalit ? [{ label: 'Schválit návrh', icon: 'check', onClick: () => { void onPatch({ approve: true }, 'Návod se neschválil.'); } }] : []),
    ...(smiUpravit ? [{ label: 'Upravit', icon: 'pencil', onClick: onEdit }] : []),
    ...(smiPovinne && summary ? [{
      label: povinne ? 'Zrušit povinné čtení' : 'Označit jako povinné čtení', icon: 'book',
      onClick: () => { void onPatch({ requireRead: !povinne }, 'Povinné čtení se nepodařilo změnit.'); },
    }] : []),
    ...(smiPovinne && povinne ? [{ label: ctenari ? 'Skrýt, kdo četl' : 'Kdo četl', icon: 'users', onClick: () => setCtenari(v => !v) }] : []),
    // Krok „Kontrola kasy" je jediné místo, kde vzniká manko. Návod „co dělat,
    // když to nesedí" tam patří — proto se tenhle jeden připne přímo tam.
    ...(smiUpravit && summary ? [{
      label: summary.forClosing ? 'Odepnout od uzávěrky' : 'Připnout k uzávěrce', icon: 'pin',
      hint: 'Ukáže se u kroku „Kontrola kasy" v uzávěrce',
      onClick: () => { void onPatch({ forClosing: !summary.forClosing }, 'Připnutí k uzávěrce se nepodařilo změnit.'); },
    }] : []),
    ...(smiMazat ? [{ label: 'Smazat', icon: 'trash', danger: true, onClick: onDelete }] : []),
  ];
  const potvrdit = povinne && summary?.myRead !== true && !tablet;

  return (
    <Modal open onClose={onClose} size="lg" title={reader.title || 'Návod'}
      subtitle={loading ? undefined : [kategorie?.name, reader.author, reader.updatedAt ? `aktualizováno ${formatDate(reader.updatedAt)}` : null].filter(Boolean).join(' · ') || undefined}
      footer={potvrdit ? (
        <Button variant="primary" icon="check" loading={potvrzuji}
          onClick={async () => { setPotvrzuji(true); await onMarkRead(); setPotvrzuji(false); }}>
          Potvrzuji přečtení
        </Button>
      ) : undefined}>
      {loading ? (
        <div className="space-y-2" aria-busy>
          <Skeleton className="h-4 w-4/5 rounded-full" />
          <Skeleton className="h-4 w-3/5 rounded-full" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <>
          {(polozky.length > 0 || povinne || summary?.forClosing || summary?.approved === false) && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {summary?.approved === false && <Chip tone="wait" size="sm">Čeká na schválení</Chip>}
              {povinne && <Chip tone={summary?.myRead ? 'ok' : 'wait'} size="sm" icon={summary?.myRead ? 'check' : 'book'}>{summary?.myRead ? 'Přečteno' : 'Povinné čtení'}</Chip>}
              {summary?.forClosing && <Chip tone="muted" size="sm" icon="pin">U uzávěrky</Chip>}
              {polozky.length > 0 && <Menu size="sm" label="Akce s návodem" items={polozky} className="ml-auto" />}
            </div>
          )}
          {/* Že podle návodu vzniká konkrétní věc ve skladu, je při čtení
              důležité: obsluha pak ví, že odškrtání kroků má dopad na zásobu. */}
          {reader.itemName && (
            <p className="note mb-4 text-sm inline-flex items-center gap-1.5">
              <Icon name="leaf" size={14} className="shrink-0 text-black/45" />
              {reader.itemMadeInHouse ? `Vyrábíme podle něj: ${reader.itemName}` : `Položka ${reader.itemName} už není vlastní výroba`}
            </p>
          )}
          {smiPovinne && povinne && ctenari && <CtenariNavodu guideId={reader.id} />}
          <div className="text-[15px] whitespace-pre-wrap break-words">{renderContent(reader.content)}</div>
          {reader.checklist.length > 0 && <ReaderChecklist steps={reader.checklist} guideId={reader.id} ticksFor={ticksFor} />}
        </>
      )}
    </Modal>
  );
}

// Interactive tick list for the reader. Progress survives closing the reader —
// it lives in localStorage per guide on this device, and clears itself once
// the list is completed (next open starts fresh).
//
// Klíč nese i toho, kdo čte. Na sdíleném tabletu se dřív odškrtané kroky
// přenesly na dalšího člověka: ten otevřel návod na čištění kávovaru a viděl
// polovinu hotovou, aniž by na ni sáhl — a klidně ji přeskočil.
function ReaderChecklist({ steps, guideId, ticksFor }: { steps: GuideStep[]; guideId?: number; ticksFor?: number | null }) {
  const storageKey = guideId ? `managero-guide-ticks-${ticksFor ?? 0}-${guideId}` : null;
  const [done, setDone] = useState<boolean[]>(() => {
    if (storageKey) {
      try {
        const raw = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
        if (Array.isArray(raw) && raw.length === steps.length) return raw.map(Boolean);
      } catch { /* fall through */ }
    }
    return steps.map(() => false);
  });
  useEffect(() => {
    if (!storageKey) return;
    try {
      const all = done.length > 0 && done.every(Boolean);
      if (all) localStorage.removeItem(storageKey);
      else if (done.some(Boolean)) localStorage.setItem(storageKey, JSON.stringify(done));
      else localStorage.removeItem(storageKey);
    } catch { /* storage full/blocked — ticks just won't persist */ }
  }, [done, storageKey]);

  const doneCount = done.filter(Boolean).length;
  const total = steps.length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const allDone = doneCount === total && total > 0;

  const toggle = (i: number) => setDone((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  const reset = () => setDone(steps.map(() => false));

  return (
    <div className="mt-6 pt-6 border-t border-black/[0.08]">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="t-label">Postup</h3>
        <span className="t-meta tabular-nums">{doneCount}/{total}</span>
      </div>

      <div className="h-1.5 w-full rounded-full bg-black/[0.06] overflow-hidden mb-4" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Hotové kroky">
        <div className="h-full rounded-full bg-[#16181A] transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>

      <StepTimeline
        steps={parseSteps(steps.map(st => (
          // Gramáž patří ke kroku, ne do zvláštního seznamu — barista čte jeden řádek, ne dva.
          st.itemId != null && st.amount != null
            ? `${st.text} — ${String(st.amount).replace('.', ',')} ${st.unit ?? ''}`.trim()
            : st.text
        )))}
        statuses={Object.fromEntries(done.map((v, i) => [i, v ? 'done' : 'pending']))}
        onToggle={toggle}
        interactive
      />

      {allDone && (
        <div className="note note-ok mt-4 flex flex-wrap items-center justify-between gap-2" role="status">
          <span className="inline-flex items-center gap-2 text-sm font-semibold min-w-0">
            <Icon name="check" size={16} strokeWidth={2.2} />
            Všechny kroky jsou hotové.
          </span>
          <Button variant="ghost" size="sm" icon="undo" onClick={reset}>Znovu</Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function GuideEditor({
  editing, categories, navrh, defaultCategory, onClose, onSaved,
}: {
  editing: GuideFull | null;
  categories: Category[];
  /** Ukládá se jako návrh ke schválení (navody.navrhnout bez navody.vytvorit). */
  navrh: boolean;
  defaultCategory: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const uid = useId();
  const [title, setTitle] = useState(editing?.title || '');
  const [content, setContent] = useState(editing?.content || '');
  const [categoryId, setCategoryId] = useState<number | null>(editing ? editing.categoryId : defaultCategory);
  const [steps, setSteps] = useState<GuideStep[]>(editing?.checklist?.length ? normalizeSteps(editing.checklist) : []);
  // Návod patří k položce v kase; z jeho surovin se pak dá složit receptura.
  const [productId, setProductId] = useState<string | null>(editing?.productId ?? null);
  const [productName, setProductName] = useState<string | null>(editing?.productName ?? null);
  // A druhým směrem: podle kterého návodu se položka vyrábí.
  const [itemId, setItemId] = useState<number | null>(editing?.itemId ?? null);
  const [alsoRecipe, setAlsoRecipe] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [stockCategories, setStockCategories] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    fetch('/api/inventory').then(okJson)
      .then(d => setItems(Array.isArray(d) ? d.filter((i: any) => i.approved !== false) : []))
      .catch(() => setItems([]));
    fetch('/api/inventory/categories').then(okJson)
      .then(d => setStockCategories(Array.isArray(d) ? d.map((c: any) => ({ id: Number(c.id), name: String(c.name) })) : []))
      .catch(() => setStockCategories([]));
  }, []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addStep = () => setSteps((prev) => [...prev, { text: '' }]);
  const patchStep = (i: number, patch: Partial<GuideStep>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i));
  const moveStep = (i: number, dir: -1 | 1) =>
    setSteps((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = async () => {
    if (!title.trim()) { setError('Zadej název návodu.'); return; }
    setSaving(true);
    setError('');
    const checklist = normalizeSteps(steps);
    const payload = { title: title.trim(), content, categoryId, checklist, productId, productName, itemId };
    try {
      const res = await fetch(editing ? `/api/guides/${editing.id}` : '/api/guides', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await okJson(res);
      // Suroviny z návodu jsou receptura — psát ji podruhé ručně je přesně to
      // místo, kde se obě verze rozejdou.
      const ing = checklist
        .filter(st => st.itemId != null && st.amount != null && st.amount > 0)
        .map(st => ({ itemId: st.itemId, amount: st.amount }));
      if (alsoRecipe && productId && ing.length) {
        try {
          await fetch('/api/pos/products', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId, productName, ingredients: ing }),
          });
        } catch { /* receptura je bonus, návod je uložený */ }
      }
      onSaved();
    } catch (e) {
      setError(apiMessage(e, 'Uložení se nezdařilo.'));
    } finally {
      setSaving(false);
    }
  };

  const surovina = (s: GuideStep) => s.itemId != null || s.unit != null;

  return (
    <Modal open onClose={onClose} size="lg"
      title={editing ? 'Upravit návod' : navrh ? 'Navrhnout návod' : 'Nový návod'}
      subtitle={navrh ? 'Návrh schválí vedení, pak ho uvidí celý tým.' : undefined}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Zrušit</Button>
        <Button variant="primary" onClick={save} loading={saving}>{editing ? 'Uložit změny' : navrh ? 'Odeslat návrh' : 'Vytvořit návod'}</Button>
      </>}>
      <div className="space-y-4">
        <Field id={`${uid}-nazev`} label="Název">
          <Input id={`${uid}-nazev`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Např. Jak připravit naši podpisovou kávu" />
        </Field>

        <Field id={`${uid}-kat`} label="Kategorie">
          <Select id={`${uid}-kat`} value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value ? parseInt(e.target.value) : null)}>
            <option value="">Bez kategorie</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>

        <Field id={`${uid}-obsah`} label="Obsah" hint="Zalomení řádků se zachovají. Podporováno: **tučně** a odrážky „- “.">
          <Textarea id={`${uid}-obsah`} value={content} onChange={(e) => setContent(e.target.value)} rows={12}
            placeholder={'Sem napiš návod…\n\nTip: řádky **tučně** a odrážky pomocí „- “.'} className="leading-relaxed !resize-y" />
        </Field>

        {/* Vazba na položku v kase — z ní plyne, že se suroviny z návodu dají uložit rovnou jako receptura. */}
        <GuideProductLink productId={productId} productName={productName}
          onPick={(id, name) => { setProductId(id); setProductName(name); }} />

        {/* Opačný směr: co se podle návodu vyrábí. */}
        <GuideItemLink itemId={itemId} items={items} onPick={setItemId} />

        {/* Checklist builder */}
        <div role="group" aria-labelledby={`${uid}-kroky`}>
          <div className="flex items-center justify-between mb-2">
            <p id={`${uid}-kroky`} className="field-label !mb-0">Checklist (nepovinný)</p>
            <span className="t-meta">{czCount(steps.length, KROK)}</span>
          </div>
          {steps.length === 0 ? (
            <p className="t-meta mb-3">Přidej kroky, které si tým může odškrtávat při čtení návodu.</p>
          ) : (
            <ol className="space-y-2 mb-3">
              {steps.map((s, i) => (
                <li key={i} className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="t-meta w-5 text-right shrink-0 tabular-nums">{i + 1}.</span>
                    <Input value={s.text} onChange={(e) => patchStep(i, { text: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (i === steps.length - 1) addStep(); } }}
                      placeholder={`Krok ${i + 1}`} aria-label={`Krok ${i + 1}`} className="flex-1 min-w-0" />
                    <Button variant="ghost" size="sm" iconOnly icon="chevron" className="rotate-180" aria-label={`Posunout krok ${i + 1} výš`}
                      onClick={() => moveStep(i, -1)} disabled={i === 0} />
                    <Button variant="ghost" size="sm" iconOnly icon="chevron" aria-label={`Posunout krok ${i + 1} níž`}
                      onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} />
                    <button type="button" aria-pressed={surovina(s)}
                      onClick={() => patchStep(i, surovina(s) ? { itemId: null, amount: null, unit: null } : { itemId: null, amount: null, unit: '' })}
                      aria-label={surovina(s) ? `Krok ${i + 1}: zrušit surovinu` : `Krok ${i + 1}: označit jako surovinu`}
                      title={surovina(s) ? 'Zrušit surovinu' : 'Označit jako surovinu'}
                      className={`filter-pill tap-target grid h-9 w-9 place-items-center !px-0 shrink-0 ${surovina(s) ? 'seg-on' : 'seg-off glass'}`}>
                      <Icon name="box" size={14} />
                    </button>
                    <Button variant="ghost" size="sm" iconOnly icon="close" aria-label={`Odebrat krok ${i + 1}`} onClick={() => removeStep(i)} />
                  </div>
                  {surovina(s) && (
                    <div className="pl-7">
                      <GuideStepIngredient step={s} items={items} categories={stockCategories}
                        onChange={patch => patchStep(i, patch)}
                        onItemCreated={created => setItems(list => [...list, created])} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
          <Button variant="secondary" size="sm" icon="plus" onClick={addStep}>Přidat krok</Button>

          {productId && steps.some(st => st.itemId != null && (st.amount ?? 0) > 0) && (
            <ul className="list mt-3">
              <SwitchRow title="Uložit suroviny i jako recepturu"
                hint={`Prodej „${productName ?? ''}" pak sklad odepíše sám. Přepíše stávající recepturu téhle položky.`}
                checked={alsoRecipe} onChange={setAlsoRecipe} />
            </ul>
          )}
        </div>

        {error && <p className="note note-danger text-sm" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Správa kategorií
// ---------------------------------------------------------------------------

function ManageCategories({
  categories, onClose, onChanged,
}: {
  categories: Category[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const uid = useId();
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('book');
  const [busy, setBusy] = useState(false);
  /** Proč se poslední úprava kategorií neuložila. */
  const [chyba, setChyba] = useState('');
  const [smazat, setSmazat] = useState<Category | null>(null);

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true); setChyba('');
    try {
      const res = await fetch(URL_KATEGORIE, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), icon: newIcon }),
      });
      await okJson(res);
      setNewName('');
      setNewIcon('book');
      onChanged();
    } catch (e) {
      // Jméno zůstává v poli, ať se nemusí psát znovu.
      setChyba(apiMessage(e, 'Kategorii se nepodařilo založit. Zkus to prosím znovu.'));
    } finally {
      setBusy(false);
    }
  };

  const rename = async (id: number, name: string) => {
    setChyba('');
    try {
      const res = await fetch(`${URL_KATEGORIE}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      await okJson(res);
    } catch (e) {
      setChyba(apiMessage(e, 'Přejmenování se neuložilo. Zkus to prosím znovu.'));
    }
    onChanged();
  };

  const remove = async () => {
    if (!smazat) return;
    setChyba('');
    try {
      const res = await fetch(`${URL_KATEGORIE}/${smazat.id}`, { method: 'DELETE' });
      await okJson(res);
      onChanged();
    } catch (e) {
      setChyba(apiMessage(e, 'Kategorii se nepodařilo smazat. Zkus to prosím znovu.'));
    }
    setSmazat(null);
  };

  return (
    <>
      <Modal open onClose={onClose} size="md" title="Kategorie návodů">
        {chyba && <p role="alert" className="note note-danger mb-4">{chyba}</p>}

        {categories.length === 0 ? (
          <EmptyState icon="book" compact title="Zatím žádné kategorie"
            hint="Kategorie třídí návody podle toho, čeho se týkají — příprava, úklid, provoz." />
        ) : (
          <ul className="list mb-5">
            {categories.map((c) => (
              <li key={c.id} className="list-row gap-3">
                <Icon name={c.icon || 'book'} size={18} className="shrink-0 text-black/45" />
                {/* Kategorii ze zdrojového podniku organizace upraví jen jeho vedení —
                    pole i koš by tu jen vracely 403, tak se ukáže jen jméno a odkud je. */}
                {c.zOrganizace ? (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#16181A] truncate">{c.name} <Chip tone="muted" size="sm" className="ml-1 align-middle">z organizace</Chip></p>
                    {c.spravuje && <p className="t-meta truncate">Spravuje: {c.spravuje}</p>}
                  </div>
                ) : (
                  <>
                    <Input defaultValue={c.name} aria-label={`Název kategorie ${c.name}`}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) void rename(c.id, v); }}
                      className="flex-1 min-w-0" />
                    {c.sdileno && <Chip tone="info" size="sm" className="shrink-0">sdíleno</Chip>}
                    <Button variant="ghost" size="sm" iconOnly icon="trash" aria-label={`Smazat kategorii ${c.name}`} onClick={() => setSmazat(c)} />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-black/[0.08] pt-5 space-y-3">
          <div role="group" aria-labelledby={`${uid}-ikona`}>
            <p id={`${uid}-ikona`} className="field-label">Ikona nové kategorie</p>
            <div className="flex gap-2 flex-wrap">
              {CATEGORY_ICONS.map((ic) => (
                <button key={ic.id} type="button" onClick={() => setNewIcon(ic.id)} aria-pressed={newIcon === ic.id} aria-label={`Ikona ${ic.nazev}`}
                  className={`filter-pill tap-target grid h-10 w-10 place-items-center !px-0 ${newIcon === ic.id ? 'seg-on' : 'seg-off glass'}`}>
                  <Icon name={ic.id} size={17} />
                </button>
              ))}
            </div>
          </div>
          <Field id={`${uid}-nova`} label="Nová kategorie">
            <div className="flex gap-2">
              <Input id={`${uid}-nova`} value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} placeholder="Např. Úklid" className="flex-1 min-w-0" />
              <Button variant="primary" icon="plus" onClick={add} loading={busy} disabled={!newName.trim()} className="shrink-0">Přidat</Button>
            </div>
          </Field>
        </div>
      </Modal>

      <Modal open={!!smazat} onClose={() => setSmazat(null)} size="sm" title="Smazat kategorii?"
        subtitle={smazat ? `„${smazat.name}"` : undefined}
        footer={<>
          <Button variant="secondary" onClick={() => setSmazat(null)}>Zrušit</Button>
          <Button variant="danger-solid" icon="trash" onClick={remove}>Smazat</Button>
        </>}>
        <p className="text-sm text-black/55 text-pretty">Návody v ní zůstanou, jen bez kategorie.</p>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Kdo četl
// ---------------------------------------------------------------------------

/** Kdo návod četl a kdo ne — jmény, ne číslem. Vidí jen navody.povinne_cteni. */
function CtenariNavodu({ guideId }: { guideId: number }) {
  const [data, setData] = useState<{
    read: { id: number; name: string; avatar: string; jobTitle: string | null; readAt: string }[];
    unread: { id: number; name: string; avatar: string; jobTitle: string | null }[];
  } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null); setErr('');
    fetch(`/api/guides/${guideId}/reads`).then(okJson)
      .then(d => { if (alive) setData({ read: d.read ?? [], unread: d.unread ?? [] }); })
      // Tady se mlčet nesmí: prázdný seznam by vedení četlo jako „přečetli
      // to všichni", což je pravý opak toho, co se stalo.
      .catch(e => { if (alive) setErr(apiMessage(e, 'Seznam se nenačetl.')); });
    return () => { alive = false; };
  }, [guideId]);

  if (err) return <p className="note note-danger text-sm mb-4" role="alert">{err}</p>;
  if (!data) return <Skeleton className="h-16 mb-4" />;

  const radek = (p: { id: number; name: string; avatar: string; jobTitle: string | null }, kdy?: string) => (
    <ListRow key={p.id} lead={<Avatar emoji={p.avatar} size="xs" />} title={p.name} meta={p.jobTitle ?? undefined}
      aside={kdy ? formatDate(kdy) : undefined} />
  );

  return (
    <div className="well p-3 mb-4 space-y-3">
      <div>
        <p className="t-label">Nepřečetli ({data.unread.length})</p>
        {data.unread.length === 0
          ? <p className="t-meta mt-1">Přečetli to všichni.</p>
          : <ul className="list mt-1">{data.unread.map(p => radek(p))}</ul>}
      </div>
      {data.read.length > 0 && (
        <div>
          <p className="t-label">Přečetli ({data.read.length})</p>
          <ul className="list mt-1">{data.read.map(p => radek(p, p.readAt))}</ul>
        </div>
      )}
    </div>
  );
}
