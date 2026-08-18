'use client';

// Public share links plus the look of the pages they open. Everything here is
// customer-facing, so the editor stays blunt about what does and doesn't leave
// the app.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import {
  type ShareLink, type ShareTheme, DEFAULT_THEME, THEME_PRESETS, normalizeTheme,
} from '@/lib/share';
import { flattenTree, pathOfId, type CategoryNode } from '@/lib/categoryTree';

const inputClass =
  'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';

type GuideCat = { id: number; name: string };

export default function ShareSettings() {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [theme, setTheme] = useState<ShareTheme>(DEFAULT_THEME);
  const [cats, setCats] = useState<CategoryNode[]>([]);
  const [guideCats, setGuideCats] = useState<GuideCat[]>([]);
  const [loading, setLoading] = useState(true);
  const [notMigrated, setNotMigrated] = useState(false);
  const [msg, setMsg] = useState('');
  const [creating, setCreating] = useState(false);

  // New-link form.
  const [kind, setKind] = useState<'inventory' | 'guides'>('inventory');
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  const flat = useMemo(() => flattenTree(cats), [cats]);

  const load = async () => {
    try {
      const [d, c, g] = await Promise.all([
        fetch('/api/share').then(r => r.json()).catch(() => ({})),
        fetch('/api/inventory/categories').then(r => r.json()).catch(() => []),
        fetch('/api/guides/categories').then(r => r.json()).catch(() => ({})),
      ]);
      if (Array.isArray(d?.links)) setLinks(d.links);
      if (d?.theme) setTheme(normalizeTheme(d.theme));
      setNotMigrated(d?.notMigrated === true);
      if (Array.isArray(c)) setCats(c);
      const gc = g?.categories;
      if (Array.isArray(gc)) setGuideCats(gc.map((x: any) => ({ id: Number(x.id), name: String(x.name) })));
    } catch { /* leave the defaults */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  const create = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/share', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, categoryId: categoryId ? Number(categoryId) : null, title, note }),
      });
      if (res.ok) {
        setTitle(''); setNote(''); setCategoryId('');
        await load();
        flash('Odkaz vytvořen ✓');
      } else {
        const d = await res.json().catch(() => ({}));
        flash(d.error || 'Odkaz se nepodařilo vytvořit.');
      }
    } catch { flash('Nepodařilo se spojit se serverem.'); }
    setCreating(false);
  };

  const patch = async (id: number, body: Record<string, any>) => {
    setLinks(prev => prev.map(l => l.id === id ? { ...l, ...body } : l));
    try {
      await fetch(`/api/share/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } catch { load(); }
  };

  const remove = async (l: ShareLink) => {
    if (!confirm('Smazat odkaz? Kdo ho má, přestane stránku vidět.')) return;
    setLinks(prev => prev.filter(x => x.id !== l.id));
    try { await fetch(`/api/share/${l.id}`, { method: 'DELETE' }); } catch { load(); }
  };

  const saveTheme = async (next: ShareTheme) => {
    setTheme(next);
    try {
      const res = await fetch('/api/share', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: next }),
      });
      if (res.ok) flash('Vzhled uložen ✓');
    } catch { flash('Vzhled se nepodařilo uložit.'); }
  };

  const urlOf = (l: ShareLink) =>
    `${typeof window !== 'undefined' ? window.location.origin : ''}/s/${l.token}`;

  const copy = async (l: ShareLink) => {
    try { await navigator.clipboard.writeText(urlOf(l)); flash('Odkaz zkopírován ✓'); } catch {}
  };

  if (loading) {
    return <div className="glass-card p-6 text-sm text-black/45">Načítám…</div>;
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className="rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/30 text-[#5B7A08] text-sm font-semibold px-4 py-3">
          {msg}
        </div>
      )}

      {notMigrated && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-700 text-sm px-4 py-3">
          Sdílení zatím není v databázi připravené — spusť <code>/api/init</code>.
        </div>
      )}

      {/* ---- New link ---- */}
      <div className="glass-card p-6 space-y-4">
        <div>
          <h3 className="font-bold tracking-tight text-[#16181A] flex items-center gap-2">
            <Icon name="send" size={17} className="text-[#5B7A08]" /> Nový odkaz pro zákazníky
          </h3>
          <p className="text-sm text-black/45 mt-0.5">
            Stránka bez přihlášení, kde je vidět jen název, značka a popis. Žádné počty, ceny ani dodavatelé.
          </p>
        </div>

        <div className="flex gap-1 rounded-full glass border border-black/[0.07] p-1 w-fit">
          {([['inventory', 'Ze skladu'], ['guides', 'Z návodů']] as const).map(([k, label]) => (
            <button key={k} onClick={() => { setKind(k); setCategoryId(''); }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                kind === k ? 'bg-[#16181A] text-white' : 'text-black/55 hover:text-black'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {kind === 'inventory' && (
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Co sdílet</label>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inputClass}>
              <option value="">Celý sklad</option>
              {flat.map(({ cat: c, depth }) => (
                <option key={c.id} value={String(c.id)}>{' '.repeat(depth * 2)}{c.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-black/40 mt-1.5">
              U kategorie se sdílí i všechny její podkategorie, pěkně pod sebou.
            </p>
          </div>
        )}
        {kind === 'guides' && (
          <p className="text-[12px] text-black/45 rounded-xl bg-black/[0.03] border border-black/[0.06] px-3 py-2">
            Sdílí se jen názvy návodů seřazené podle kategorií — obsah návodu se ven nedostane.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Nadpis stránky</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Např. Naše tabáky" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Podtitulek</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Nepovinný text pod nadpisem" className={inputClass} />
          </div>
        </div>

        <button onClick={create} disabled={creating}
          className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 disabled:opacity-50 inline-flex items-center gap-2">
          <Icon name="plus" size={16} /> {creating ? 'Vytvářím…' : 'Vytvořit odkaz'}
        </button>
      </div>

      {/* ---- Existing links ---- */}
      {links.length > 0 && (
        <div className="glass-card p-6 space-y-4">
          <h3 className="font-bold tracking-tight text-[#16181A]">Sdílené odkazy</h3>
          <div className="divide-y divide-black/[0.06]">
            {links.map(l => (
              <LinkRow key={l.id} link={l} cats={cats} guideCats={guideCats}
                url={urlOf(l)} onCopy={() => copy(l)} onPatch={b => patch(l.id, b)} onRemove={() => remove(l)} />
            ))}
          </div>
        </div>
      )}

      {/* ---- Look of the pages ---- */}
      <div className="glass-card p-6 space-y-4">
        <div>
          <h3 className="font-bold tracking-tight text-[#16181A] flex items-center gap-2">
            <Icon name="sun" size={17} className="text-[#5B7A08]" /> Vzhled sdílených stránek
          </h3>
          <p className="text-sm text-black/45 mt-0.5">Platí pro všechny odkazy najednou.</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {THEME_PRESETS.map(p => {
            const active = theme.background === p.theme.background && theme.accent === p.theme.accent;
            return (
              <button key={p.id} onClick={() => saveTheme({ ...theme, ...p.theme })}
                className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium transition ${
                  active ? 'bg-[#16181A] text-white' : 'glass text-black/55 hover:text-black'
                }`}>
                <span className="inline-flex gap-0.5" aria-hidden>
                  <span className="w-3 h-3 rounded-full border border-black/10" style={{ background: p.theme.background }} />
                  <span className="w-3 h-3 rounded-full border border-black/10" style={{ background: p.theme.accent }} />
                </span>
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            ['background', 'Pozadí'],
            ['accent', 'Nadpisy'],
            ['text', 'Text'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">{label}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={theme[key]}
                  onChange={e => setTheme(t => ({ ...t, [key]: e.target.value }))}
                  onBlur={() => saveTheme(theme)}
                  className="h-11 w-14 rounded-xl border border-black/[0.08] bg-white cursor-pointer" />
                <input value={theme[key]} onChange={e => setTheme(t => ({ ...t, [key]: e.target.value }))}
                  onBlur={() => saveTheme(theme)} className={`${inputClass} font-mono`} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Název podniku</label>
            <input value={theme.businessName} onChange={e => setTheme(t => ({ ...t, businessName: e.target.value }))}
              onBlur={() => saveTheme(theme)} placeholder="Zobrazí se nad nadpisem" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Logo (odkaz na obrázek)</label>
            <input value={theme.logoUrl} onChange={e => setTheme(t => ({ ...t, logoUrl: e.target.value }))}
              onBlur={() => saveTheme(theme)} placeholder="https://…" className={inputClass} />
          </div>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-black/45 mb-1.5">Patička</label>
          <input value={theme.footer} onChange={e => setTheme(t => ({ ...t, footer: e.target.value }))}
            onBlur={() => saveTheme(theme)} placeholder="Adresa, otevírací doba, kontakt…" className={inputClass} />
        </div>

        {/* Live preview */}
        <div className="rounded-2xl overflow-hidden border border-black/[0.08]">
          <div style={{ background: theme.background, color: theme.text }} className="p-5 text-center">
            {theme.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={theme.logoUrl} alt="" style={{ maxHeight: 36, margin: '0 auto 10px', objectFit: 'contain' }} />
            )}
            {theme.businessName && (
              <p className="text-[11px] uppercase tracking-[0.16em] opacity-60">{theme.businessName}</p>
            )}
            <p style={{ color: theme.accent }} className="text-xl font-bold tracking-tight mt-1">Naše nabídka</p>
            <p className="text-xs opacity-60 mt-2">Ukázka toho, jak stránka vypadá.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkRow({ link, cats, guideCats, url, onCopy, onPatch, onRemove }: {
  link: ShareLink;
  cats: CategoryNode[];
  guideCats: GuideCat[];
  url: string;
  onCopy: () => void;
  onPatch: (body: Record<string, any>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const scope = link.kind === 'guides'
    ? 'Návody'
    : link.categoryId != null ? pathOfId(cats, link.categoryId) : 'Celý sklad';

  // Excluding only makes sense for what the link actually covers.
  const excludable = link.kind === 'guides'
    ? guideCats.map(g => ({ id: g.id, name: g.name, depth: 0 }))
    : flattenTree(cats).map(({ cat, depth }) => ({ id: cat.id, name: cat.name, depth }));

  const toggle = (id: number) => {
    const next = link.excluded.includes(id)
      ? link.excluded.filter(x => x !== id)
      : [...link.excluded, id];
    onPatch({ excluded: next });
  };

  return (
    <div className="py-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
          link.enabled ? 'bg-[#C8F542]/25 text-[#5B7A08]' : 'bg-black/[0.06] text-black/40'
        }`}>
          {link.kind === 'guides' ? 'Návody' : 'Sklad'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#16181A] truncate">{link.title || scope}</p>
          <p className="text-[11px] text-black/40 truncate">{scope}{link.excluded.length > 0 ? ` · ${link.excluded.length} skryto` : ''}</p>
        </div>
        <button onClick={onCopy} title="Zkopírovat odkaz"
          className="shrink-0 rounded-full bg-[#C8F542] text-black px-3.5 py-1.5 text-xs font-bold hover:brightness-110">
          Kopírovat
        </button>
        <a href={url} target="_blank" rel="noopener" title="Otevřít stránku"
          className="shrink-0 rounded-full glass border border-black/10 px-3.5 py-1.5 text-xs font-medium text-[#16181A] hover:bg-black/[0.05]">
          Otevřít ↗
        </a>
        <button onClick={() => setOpen(o => !o)} title="Nastavení odkazu"
          className={`shrink-0 rounded-full w-8 h-8 flex items-center justify-center text-sm transition ${
            open ? 'bg-[#16181A] text-white' : 'glass text-black/50 hover:text-black'
          }`}>
          <Icon name="settings" size={14} />
        </button>
      </div>

      {open && (
        <div className="rounded-2xl bg-black/[0.03] border border-black/[0.06] p-3.5 space-y-3">
          <p className="text-[11px] text-black/45 break-all font-mono">{url}</p>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={link.enabled}
              onChange={e => onPatch({ enabled: e.target.checked })}
              className="h-4 w-4 accent-[#C8F542]" />
            <span className="text-sm text-[#16181A]">Odkaz je aktivní</span>
          </label>

          <div>
            <p className="text-[11px] uppercase tracking-wider text-black/45 mb-1.5">Nesdílet tyhle kategorie</p>
            <div className="flex flex-wrap gap-1.5">
              {excludable.map(e => {
                const off = link.excluded.includes(e.id);
                return (
                  <button key={e.id} onClick={() => toggle(e.id)}
                    style={{ marginLeft: e.depth * 10 }}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      off ? 'bg-red-500/15 text-red-600 line-through' : 'bg-white border border-black/[0.08] text-[#16181A] hover:border-[#C8F542]'
                    }`}>
                    {e.name}
                  </button>
                );
              })}
              {excludable.length === 0 && <span className="text-xs text-black/35">Zatím žádné kategorie.</span>}
            </div>
            <p className="text-[11px] text-black/40 mt-1.5">Skrytá kategorie schová i všechno pod ní.</p>
          </div>

          <button onClick={onRemove}
            className="rounded-full glass border border-black/10 text-red-600/80 hover:text-red-600 px-4 py-2 text-xs font-medium">
            Smazat odkaz
          </button>
        </div>
      )}
    </div>
  );
}
