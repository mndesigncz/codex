'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Icon } from './Icons';

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
}

interface GuideSummary {
  id: number;
  title: string;
  categoryId: number | null;
  updatedAt: string;
  excerpt: string;
  hasChecklist: boolean;
}

interface GuideFull {
  id: number;
  title: string;
  content: string;
  checklist: string[];
  categoryId: number | null;
  updatedAt: string;
  createdAt?: string;
  author?: string;
}

// Replaces the removed Recipes feature — recipes now live as guides under "Recepty & Menu".
const DEFAULT_CATEGORIES = [
  { name: 'Recepty & Menu', icon: 'leaf' },
  { name: 'Úklid', icon: 'check' },
  { name: 'Provoz', icon: 'box' },
  { name: 'Zákaznický servis', icon: 'chat' },
];

const CATEGORY_ICONS = ['book', 'leaf', 'check', 'box', 'chat', 'users', 'clock', 'calendar', 'trend', 'warning'];

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Lightweight markdown-ish renderer: **bold**, "- " bullets, preserved line breaks.
function renderContent(content: string) {
  const lines = String(content || '').split('\n');
  const blocks: JSX.Element[] = [];
  let bullets: string[] = [];

  const flushBullets = (key: string) => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={key} className="my-2 space-y-1.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-black/80">
            <span className="text-[#5B7A08] mt-1.5 leading-none">•</span>
            <span>{renderInline(b)}</span>
          </li>
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

export default function Guides({ user }: { user: User }) {
  const isEmployer = user.role === 'employer';

  const [categories, setCategories] = useState<Category[]>([]);
  const [guides, setGuides] = useState<GuideSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');

  // Reader / editor modals
  const [reader, setReader] = useState<GuideFull | null>(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<GuideFull | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [creatingCat, setCreatingCat] = useState(false);

  const loadCategories = useCallback(async () => {
    const r = await fetch('/api/guides/categories');
    const d = await r.json();
    if (Array.isArray(d.categories)) setCategories(d.categories);
  }, []);

  const loadGuides = useCallback(async () => {
    const r = await fetch('/api/guides');
    const d = await r.json();
    if (Array.isArray(d.guides)) setGuides(d.guides);
  }, []);

  useEffect(() => {
    Promise.all([loadCategories(), loadGuides()]).finally(() => setLoading(false));
  }, [loadCategories, loadGuides]);

  const catById = useMemo(() => {
    const m = new Map<number, Category>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const counts = useMemo(() => {
    const m = new Map<number | 'all', number>();
    m.set('all', guides.length);
    guides.forEach((g) => {
      const k = g.categoryId ?? -1;
      m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  }, [guides]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return guides.filter((g) => {
      if (activeCat === 'all') {
        // no-op
      } else if (activeCat === -1) {
        if (g.categoryId != null) return false;
      } else if (g.categoryId !== activeCat) {
        return false;
      }
      if (!q) return true;
      return g.title.toLowerCase().includes(q) || g.excerpt.toLowerCase().includes(q);
    });
  }, [guides, activeCat, search]);

  const hasUncategorized = useMemo(() => guides.some((g) => g.categoryId == null), [guides]);

  const openReader = async (id: number) => {
    setReaderLoading(true);
    setReader({ id, title: '', content: '', checklist: [], categoryId: null, updatedAt: '' });
    const r = await fetch(`/api/guides/${id}`);
    const d = await r.json();
    if (d.guide) setReader({ ...d.guide, checklist: Array.isArray(d.guide.checklist) ? d.guide.checklist : [] });
    setReaderLoading(false);
  };

  const createDefaults = async () => {
    setCreatingCat(true);
    for (const c of DEFAULT_CATEGORIES) {
      await fetch('/api/guides/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c),
      });
    }
    await loadCategories();
    setCreatingCat(false);
  };

  const openEditor = (g?: GuideFull) => {
    setEditing(g ?? null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditing(null);
  };

  const afterSave = async () => {
    await loadGuides();
    closeEditor();
  };

  const deleteGuide = async (id: number) => {
    if (!confirm('Opravdu smazat tento návod?')) return;
    await fetch(`/api/guides/${id}`, { method: 'DELETE' });
    setReader(null);
    await loadGuides();
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#16181A] flex items-center gap-3">
            <span className="inline-flex items-center justify-center rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/25 text-[#5B7A08] w-11 h-11">
              <Icon name="book" size={22} />
            </span>
            Návody
          </h1>
          <p className="text-black/45 mt-1 text-sm">Znalostní báze vašeho týmu</p>
        </div>
        {isEmployer && (
          <button
            onClick={() => openEditor()}
            className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 flex items-center gap-2 hover:brightness-110 transition-all flex-shrink-0"
          >
            <Icon name="plus" size={18} strokeWidth={2.2} />
            <span className="hidden sm:inline">Nový návod</span>
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <aside className="lg:w-64 flex-shrink-0">
          <div className="glass-card p-3">
            <div className="flex items-center justify-between px-2 py-1.5 mb-1">
              <span className="text-xs uppercase tracking-wider text-black/45 font-medium">Kategorie</span>
              {isEmployer && categories.length > 0 && (
                <button
                  onClick={() => setManageOpen(true)}
                  className="text-black/45 hover:text-black text-xs transition-colors"
                  title="Spravovat kategorie"
                >
                  Spravovat
                </button>
              )}
            </div>

            <nav className="flex lg:flex-col gap-1 overflow-x-auto scrollbar-thin">
              <CatButton
                label="Vše"
                icon="book"
                count={counts.get('all') || 0}
                active={activeCat === 'all'}
                onClick={() => setActiveCat('all')}
              />
              {categories.map((c) => (
                <CatButton
                  key={c.id}
                  label={c.name}
                  icon={c.icon}
                  count={counts.get(c.id) || 0}
                  active={activeCat === c.id}
                  onClick={() => setActiveCat(c.id)}
                />
              ))}
              {hasUncategorized && (
                <CatButton
                  label="Bez kategorie"
                  icon="box"
                  count={counts.get(-1) || 0}
                  active={activeCat === -1}
                  onClick={() => setActiveCat(-1)}
                />
              )}
            </nav>

            {isEmployer && categories.length > 0 && (
              <button
                onClick={() => setManageOpen(true)}
                className="mt-2 w-full rounded-2xl glass border border-black/10 text-black/70 hover:bg-black/[0.06] hover:text-black px-3 py-2.5 flex items-center gap-2 text-sm transition-all"
              >
                <Icon name="plus" size={16} strokeWidth={2} />
                Kategorie
              </button>
            )}

            {isEmployer && categories.length === 0 && (
              <button
                onClick={createDefaults}
                disabled={creatingCat}
                className="mt-2 w-full rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/25 text-[#5B7A08] px-3 py-2.5 text-sm font-medium hover:bg-[#C8F542]/20 transition-all disabled:opacity-50"
              >
                {creatingCat ? 'Vytvářím…' : 'Vytvořit výchozí kategorie'}
              </button>
            )}
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          <div className="relative mb-5">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30">
              <Icon name="search" size={18} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Hledat návody…"
              className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] pl-11 pr-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <div className="text-4xl mb-3">📖</div>
              {search.trim() ? (
                <p className="text-black/45">Nic nenalezeno pro „{search}“.</p>
              ) : isEmployer ? (
                <>
                  <p className="text-black/60 mb-4">Zatím žádné návody. Vytvořte první 📖</p>
                  <button
                    onClick={() => openEditor()}
                    className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 inline-flex items-center gap-2 hover:brightness-110 transition-all"
                  >
                    <Icon name="plus" size={18} strokeWidth={2.2} />
                    Nový návod
                  </button>
                </>
              ) : (
                <p className="text-black/45">Zatím tu nejsou žádné návody.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((g) => {
                const cat = g.categoryId != null ? catById.get(g.categoryId) : undefined;
                return (
                  <div
                    key={g.id}
                    onClick={() => openReader(g.id)}
                    className="glass-card p-5 cursor-pointer hover:bg-black/[0.05] hover:border-[#C8F542]/30 transition-all duration-300 flex flex-col group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-bold tracking-tight text-[#16181A] leading-snug">{g.title}</h3>
                      {isEmployer && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              const r = await fetch(`/api/guides/${g.id}`);
                              const d = await r.json();
                              if (d.guide) openEditor({ ...d.guide, checklist: Array.isArray(d.guide.checklist) ? d.guide.checklist : [] });
                            }}
                            className="w-7 h-7 rounded-full glass flex items-center justify-center text-black/55 hover:text-black transition-all text-xs"
                            title="Upravit"
                          >
                            ✎
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteGuide(g.id);
                            }}
                            className="w-7 h-7 rounded-full glass flex items-center justify-center text-black/55 hover:text-red-600 transition-all text-xs"
                            title="Smazat"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                    {g.excerpt && <p className="text-sm text-black/55 leading-relaxed line-clamp-3 flex-1">{g.excerpt}</p>}
                    <div className="flex items-center gap-2 mt-4 flex-wrap">
                      {cat && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-[#C8F542]/10 text-[#5B7A08]">
                          <Icon name={cat.icon} size={12} strokeWidth={2} />
                          {cat.name}
                        </span>
                      )}
                      {g.hasChecklist && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-black/[0.05] text-black/60">
                          <Icon name="check" size={12} strokeWidth={2.2} />
                          checklist
                        </span>
                      )}
                      <span className="text-xs text-black/30 flex items-center gap-1 ml-auto">
                        <Icon name="clock" size={12} />
                        {formatDate(g.updatedAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Reader modal */}
      {reader && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xl z-50 flex items-end md:items-center justify-center md:p-4"
          onClick={() => setReader(null)}
        >
          <div
            className="glass-strong rounded-3xl rounded-b-none md:rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 md:p-8 scrollbar-thin"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                {(() => {
                  const cat = reader.categoryId != null ? catById.get(reader.categoryId) : undefined;
                  return cat ? (
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-[#C8F542]/10 text-[#5B7A08] mb-3">
                      <Icon name={cat.icon} size={12} strokeWidth={2} />
                      {cat.name}
                    </span>
                  ) : null;
                })()}
                <h2 className="text-2xl font-bold tracking-tight text-[#16181A]">{reader.title || '…'}</h2>
                {(reader.author || reader.updatedAt) && (
                  <p className="text-xs text-black/45 mt-1.5">
                    {reader.author ? `${reader.author} · ` : ''}
                    Aktualizováno {formatDate(reader.updatedAt)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isEmployer && !readerLoading && (
                  <>
                    <button
                      onClick={() => {
                        openEditor(reader);
                        setReader(null);
                      }}
                      className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.06] px-3 py-1.5 text-sm transition-all"
                    >
                      Upravit
                    </button>
                    <button
                      onClick={() => deleteGuide(reader.id)}
                      className="w-9 h-9 rounded-full glass flex items-center justify-center text-black/55 hover:text-red-600 transition-all"
                      title="Smazat"
                    >
                      ✕
                    </button>
                  </>
                )}
                {(!isEmployer || readerLoading) && (
                  <button
                    onClick={() => setReader(null)}
                    className="w-9 h-9 rounded-full glass flex items-center justify-center text-black/55 hover:text-black transition-all"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {readerLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="h-7 w-7 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
              </div>
            ) : (
              <>
                <div className="text-[15px] whitespace-pre-wrap break-words">{renderContent(reader.content)}</div>
                {reader.checklist.length > 0 && <ReaderChecklist steps={reader.checklist} />}
              </>
            )}
          </div>
        </div>
      )}

      {/* Editor modal */}
      {editorOpen && (
        <GuideEditor
          editing={editing}
          categories={categories}
          defaultCategory={typeof activeCat === 'number' && activeCat > 0 ? activeCat : null}
          onClose={closeEditor}
          onSaved={afterSave}
        />
      )}

      {/* Manage categories modal */}
      {manageOpen && isEmployer && (
        <ManageCategories
          categories={categories}
          onClose={() => setManageOpen(false)}
          onChanged={async () => {
            await Promise.all([loadCategories(), loadGuides()]);
          }}
        />
      )}
    </div>
  );
}

// Interactive tick list for the reader. State is local to the session — resets on reopen.
function ReaderChecklist({ steps }: { steps: string[] }) {
  const [done, setDone] = useState<boolean[]>(() => steps.map(() => false));

  const doneCount = done.filter(Boolean).length;
  const total = steps.length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const allDone = doneCount === total && total > 0;

  const toggle = (i: number) => setDone((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  const reset = () => setDone(steps.map(() => false));

  return (
    <div className="mt-6 pt-6 border-t border-black/[0.08]">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-black/45">Postup</h3>
        <span className={`text-xs font-medium ${allDone ? 'text-[#5B7A08]' : 'text-black/45'}`}>
          {doneCount}/{total}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-black/[0.06] overflow-hidden mb-4">
        <div
          className="h-full rounded-full bg-[#C8F542] transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="space-y-2">
        {steps.map((s, i) => {
          const checked = done[i];
          return (
            <li key={i}>
              <button
                onClick={() => toggle(i)}
                className={`w-full flex items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition-all ${
                  checked ? 'bg-[#C8F542]/10' : 'bg-black/[0.03] hover:bg-black/[0.05]'
                }`}
              >
                <span
                  className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-all ${
                    checked ? 'bg-[#C8F542] border-[#C8F542] text-black' : 'border-black/20 text-transparent'
                  }`}
                >
                  <Icon name="check" size={13} strokeWidth={3} />
                </span>
                <span className={`text-sm leading-relaxed ${checked ? 'text-black/40 line-through' : 'text-black/80'}`}>
                  {s}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {allDone && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/30 px-4 py-3">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#5B7A08]">
            <Icon name="check" size={16} strokeWidth={2.5} />
            Hotovo! Všechny kroky splněny.
          </span>
          <button
            onClick={reset}
            className="text-xs text-[#5B7A08]/80 hover:text-[#5B7A08] transition-colors underline underline-offset-2"
          >
            Znovu
          </button>
        </div>
      )}
    </div>
  );
}

function CatButton({
  label,
  icon,
  count,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm transition-all flex-shrink-0 whitespace-nowrap lg:w-full ${
        active ? 'bg-[#C8F542]/15 text-[#5B7A08]' : 'text-black/60 hover:bg-black/[0.04] hover:text-black'
      }`}
    >
      <Icon name={icon} size={17} strokeWidth={active ? 2 : 1.7} />
      <span className="flex-1 text-left truncate">{label}</span>
      <span className={`text-xs ${active ? 'text-[#5B7A08]/70' : 'text-black/30'}`}>{count}</span>
    </button>
  );
}

function GuideEditor({
  editing,
  categories,
  defaultCategory,
  onClose,
  onSaved,
}: {
  editing: GuideFull | null;
  categories: Category[];
  defaultCategory: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(editing?.title || '');
  const [content, setContent] = useState(editing?.content || '');
  const [categoryId, setCategoryId] = useState<number | null>(
    editing ? editing.categoryId : defaultCategory
  );
  const [steps, setSteps] = useState<string[]>(editing?.checklist?.length ? [...editing.checklist] : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addStep = () => setSteps((prev) => [...prev, '']);
  const updateStep = (i: number, v: string) => setSteps((prev) => prev.map((s, idx) => (idx === i ? v : s)));
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
    if (!title.trim()) {
      setError('Zadejte název návodu.');
      return;
    }
    setSaving(true);
    setError('');
    const checklist = steps.map((s) => s.trim()).filter((s) => s.length > 0);
    const payload = { title: title.trim(), content, categoryId, checklist };
    const res = editing
      ? await fetch(`/api/guides/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/guides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
    setSaving(false);
    if (res.ok) {
      onSaved();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Uložení se nezdařilo.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[60] flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
      <div
        className="glass-strong rounded-3xl rounded-b-none md:rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold tracking-tight text-[#16181A]">{editing ? 'Upravit návod' : 'Nový návod'}</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full glass flex items-center justify-center text-black/55 hover:text-black transition-all">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Název</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Např. Jak připravit matcha latte"
              className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Kategorie</label>
            <select
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all appearance-none"
            >
              <option value="" className="bg-neutral-900">
                Bez kategorie
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id} className="bg-neutral-900">
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Obsah</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              placeholder={'Sem napište návod…\n\nTip: řádky **tučně** a odrážky pomocí „- “.'}
              className="w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all leading-relaxed resize-y"
            />
            <p className="text-xs text-black/30 mt-2">Zalomení řádků se zachovají. Podporováno: **tučně** a odrážky „- “.</p>
          </div>

          {/* Checklist builder */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs uppercase tracking-wider text-black/45">Checklist (volitelný)</label>
              <span className="text-xs text-black/30">{steps.length} kroků</span>
            </div>
            {steps.length === 0 ? (
              <p className="text-xs text-black/40 mb-3">Přidejte kroky, které si personál může odškrtávat při čtení návodu.</p>
            ) : (
              <div className="space-y-2 mb-3">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex flex-col flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => moveStep(i, -1)}
                        disabled={i === 0}
                        className="w-6 h-4 flex items-center justify-center text-black/40 hover:text-black disabled:opacity-25 disabled:hover:text-black/40 transition-all rotate-180"
                        title="Nahoru"
                      >
                        <Icon name="chevron" size={14} strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStep(i, 1)}
                        disabled={i === steps.length - 1}
                        className="w-6 h-4 flex items-center justify-center text-black/40 hover:text-black disabled:opacity-25 disabled:hover:text-black/40 transition-all"
                        title="Dolů"
                      >
                        <Icon name="chevron" size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                    <span className="text-xs text-black/30 w-5 text-right flex-shrink-0">{i + 1}.</span>
                    <input
                      value={s}
                      onChange={(e) => updateStep(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (i === steps.length - 1) addStep();
                        }
                      }}
                      placeholder={`Krok ${i + 1}`}
                      className="flex-1 rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-2.5 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm min-w-0"
                    />
                    <button
                      type="button"
                      onClick={() => removeStep(i)}
                      className="w-8 h-8 rounded-full glass flex items-center justify-center text-black/45 hover:text-red-600 transition-all text-xs flex-shrink-0"
                      title="Odebrat krok"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={addStep}
              className="w-full rounded-2xl glass border border-black/10 text-black/70 hover:bg-black/[0.06] hover:text-black px-3 py-2.5 flex items-center justify-center gap-2 text-sm transition-all"
            >
              <Icon name="plus" size={16} strokeWidth={2} />
              Přidat krok
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="rounded-full glass border border-black/10 text-[#16181A] hover:bg-black/[0.06] px-5 py-2.5 transition-all"
          >
            Zrušit
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 hover:brightness-110 transition-all disabled:opacity-50"
          >
            {saving ? 'Ukládám…' : editing ? 'Uložit změny' : 'Vytvořit návod'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManageCategories({
  categories,
  onClose,
  onChanged,
}: {
  categories: Category[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [items, setItems] = useState<Category[]>(categories);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('book');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setItems(categories);
  }, [categories]);

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    await fetch('/api/guides/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), icon: newIcon }),
    });
    setNewName('');
    setNewIcon('book');
    await onChanged();
    setBusy(false);
  };

  const rename = async (id: number, name: string) => {
    await fetch(`/api/guides/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    await onChanged();
  };

  const remove = async (id: number) => {
    if (!confirm('Smazat kategorii? Návody v ní zůstanou (bez kategorie).')) return;
    await fetch(`/api/guides/categories/${id}`, { method: 'DELETE' });
    await onChanged();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[60] flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
      <div
        className="glass-strong rounded-3xl rounded-b-none md:rounded-3xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 md:p-8 scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold tracking-tight text-[#16181A]">Kategorie</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full glass flex items-center justify-center text-black/55 hover:text-black transition-all">
            ✕
          </button>
        </div>

        <div className="space-y-2 mb-6">
          {items.length === 0 && <p className="text-black/45 text-sm">Zatím žádné kategorie.</p>}
          {items.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-2xl bg-black/[0.03] border border-black/[0.08] px-3 py-2">
              <span className="text-black/55">
                <Icon name={c.icon} size={18} />
              </span>
              <input
                defaultValue={c.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== c.name) rename(c.id, v);
                }}
                className="flex-1 bg-transparent text-[#16181A] text-sm focus:outline-none min-w-0"
              />
              <button
                onClick={() => remove(c.id)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-black/45 hover:text-red-600 transition-all text-xs flex-shrink-0"
                title="Smazat"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-black/[0.08] pt-5">
          <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Nová kategorie</label>
          <div className="flex gap-2 mb-3 flex-wrap">
            {CATEGORY_ICONS.map((ic) => (
              <button
                key={ic}
                onClick={() => setNewIcon(ic)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                  newIcon === ic ? 'bg-[#C8F542]/15 text-[#5B7A08] border border-[#C8F542]/30' : 'glass text-black/55 hover:text-black'
                }`}
              >
                <Icon name={ic} size={17} />
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Název kategorie"
              className="flex-1 rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm"
            />
            <button
              onClick={add}
              disabled={busy || !newName.trim()}
              className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 hover:brightness-110 transition-all disabled:opacity-50 flex-shrink-0"
            >
              Přidat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
