'use client';

// Homescreen-style dashboard editing. The employer flips the gear, drags the
// order around, hides what they don't want and adds tiles pointing at a
// concrete category / procedure / guide / section. Employees never see this —
// they get exactly the layout the employer approved.

import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import {
  type LayoutEntry, type Widget, availableWidgets, moveEntry, parseTarget,
} from '@/lib/dashboardWidgets';

type Role = 'employer' | 'employee';

// Sections a tile can point at, and where its options come from.
const LINK_SOURCES: { kind: string; label: string; icon: string; url?: string; nameKey?: string }[] = [
  { kind: 'inventory', label: 'Kategorie ve skladu', icon: 'box', url: '/api/inventory/categories', nameKey: 'name' },
  { kind: 'procedure', label: 'Postup', icon: 'clipboard', url: '/api/procedures', nameKey: 'name' },
  { kind: 'guide', label: 'Návod', icon: 'book', url: '/api/guides', nameKey: 'title' },
];

const PLAIN_VIEWS: { id: string; label: string; icon: string }[] = [
  { id: 'tasks', label: 'Úkoly', icon: 'check' },
  { id: 'procedures', label: 'Postupy', icon: 'clipboard' },
  { id: 'inventory', label: 'Sklad', icon: 'box' },
  { id: 'closing', label: 'Uzávěrka', icon: 'trend' },
  { id: 'my-shifts', label: 'Směny', icon: 'calendar' },
  { id: 'rewards', label: 'Odměny', icon: 'award' },
  { id: 'guides', label: 'Návody', icon: 'book' },
  { id: 'chat', label: 'Chat', icon: 'chat' },
];

export function DashboardEditor({ role, layout, widgets, onChange, onClose, canSwitchRole, onSwitchRole }: {
  role: Role;
  layout: LayoutEntry[];
  widgets: Widget[];
  onChange: (next: LayoutEntry[]) => void;
  onClose: () => void;
  canSwitchRole: boolean;
  onSwitchRole: (r: Role) => void;
}) {
  const [adding, setAdding] = useState(false);
  const spare = availableWidgets(layout, widgets);
  const labelOf = (e: LayoutEntry) =>
    e.type === 'link' ? e.label : (widgets.find(w => w.id === e.id)?.label ?? e.id);

  return (
    <div className="glass-card p-5 space-y-4 border-2 border-[#C8F542]/50">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#C8F542]/20 text-[#5B7A08] shrink-0">
            <Icon name="settings" size={17} />
          </span>
          <div className="min-w-0">
            <h3 className="font-bold tracking-tight text-[#16181A]">Skládání přehledu</h3>
            <p className="text-xs text-black/45">Seřaď, skryj nebo přidej dlaždice.</p>
          </div>
        </div>
        <button onClick={onClose}
          className="rounded-full bg-[#16181A] text-white px-4 py-2 text-sm font-semibold hover:brightness-125 transition shrink-0">
          Hotovo
        </button>
      </div>

      {canSwitchRole && (
        <div className="flex gap-1 rounded-full glass border border-black/[0.07] p-1 w-fit">
          {([['employer', 'Můj přehled'], ['employee', 'Přehled zaměstnanců']] as const).map(([r, lbl]) => (
            <button key={r} onClick={() => onSwitchRole(r)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                role === r ? 'bg-[#16181A] text-white' : 'text-black/55 hover:text-black'
              }`}>
              {lbl}
            </button>
          ))}
        </div>
      )}

      {role === 'employee' && (
        <p className="text-xs text-black/50 bg-[#C8F542]/[0.12] border border-[#C8F542]/25 rounded-xl px-3 py-2">
          Zaměstnanci uvidí přesně tohle — nic si nepřidají ani nepřeskládají.
        </p>
      )}

      {layout.length === 0 ? (
        <p className="text-sm text-black/45">Přehled je prázdný. Přidej první dlaždici.</p>
      ) : (
        <div className="space-y-1.5">
          {layout.map((e, i) => (
            <div key={`${e.type}-${e.type === 'link' ? e.target : e.id}-${i}`}
              className="flex items-center gap-2 rounded-xl bg-black/[0.03] border border-black/[0.06] px-3 py-2">
              <div className="flex flex-col shrink-0">
                <button onClick={() => onChange(moveEntry(layout, i, -1))} disabled={i === 0}
                  className="text-black/35 hover:text-black disabled:opacity-20 leading-none text-[11px]">▲</button>
                <button onClick={() => onChange(moveEntry(layout, i, 1))} disabled={i === layout.length - 1}
                  className="text-black/35 hover:text-black disabled:opacity-20 leading-none text-[11px]">▼</button>
              </div>
              <Icon name={e.type === 'link' ? (e.icon || 'chevron') : 'overview'} size={15}
                className={e.type === 'link' ? 'text-[#5B7A08] shrink-0' : 'text-black/35 shrink-0'} />
              <span className="text-sm text-[#16181A] min-w-0 flex-1 truncate">{labelOf(e)}</span>
              {e.type === 'link' && (
                <span className="text-[10px] uppercase tracking-wider text-black/30 shrink-0">odkaz</span>
              )}
              <button onClick={() => onChange(layout.filter((_, idx) => idx !== i))} title="Odebrat z přehledu"
                className="shrink-0 rounded-full w-7 h-7 flex items-center justify-center text-black/35 hover:text-red-600">✕</button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <AddPanel
          spare={spare}
          onAdd={entry => { onChange([...layout, entry]); setAdding(false); }}
          onClose={() => setAdding(false)}
        />
      ) : (
        <button onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#C8F542] text-black px-4 py-2 text-sm font-semibold hover:brightness-110 transition">
          <Icon name="plus" size={15} /> Přidat dlaždici
        </button>
      )}
    </div>
  );
}

function AddPanel({ spare, onAdd, onClose }: {
  spare: Widget[];
  onAdd: (e: LayoutEntry) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [options, setOptions] = useState<{ label: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // Options for a link source are fetched only when that source is opened.
  useEffect(() => {
    const src = LINK_SOURCES.find(s => s.kind === source);
    if (!src?.url) { setOptions([]); return; }
    setLoading(true);
    fetch(src.url).then(r => r.json()).then(d => {
      const rows = Array.isArray(d) ? d : (d?.procedures ?? d?.guides ?? []);
      setOptions(rows.map((r: any) => ({ label: String(r[src.nameKey ?? 'name'] ?? '') })).filter((o: any) => o.label));
    }).catch(() => setOptions([])).finally(() => setLoading(false));
  }, [source]);

  return (
    <div className="rounded-2xl bg-black/[0.03] border border-black/[0.06] p-3.5 space-y-3">
      {spare.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-black/45 mb-1.5">Widgety</p>
          <div className="flex flex-wrap gap-1.5">
            {spare.map(w => (
              <button key={w.id} onClick={() => onAdd({ type: 'widget', id: w.id })} title={w.hint}
                className="rounded-full bg-white border border-black/[0.08] px-3 py-1.5 text-xs font-medium text-[#16181A] hover:border-[#C8F542] transition">
                {w.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-wider text-black/45 mb-1.5">Odkaz na…</p>
        <div className="flex flex-wrap gap-1.5">
          {LINK_SOURCES.map(s => (
            <button key={s.kind} onClick={() => setSource(source === s.kind ? null : s.kind)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                source === s.kind ? 'bg-[#16181A] text-white' : 'bg-white border border-black/[0.08] text-[#16181A] hover:border-[#C8F542]'
              }`}>
              <Icon name={s.icon} size={13} /> {s.label}
            </button>
          ))}
          <button onClick={() => setSource(source === 'view' ? null : 'view')}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              source === 'view' ? 'bg-[#16181A] text-white' : 'bg-white border border-black/[0.08] text-[#16181A] hover:border-[#C8F542]'
            }`}>
            <Icon name="menu" size={13} /> Záložka
          </button>
        </div>
      </div>

      {source === 'view' && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {PLAIN_VIEWS.map(v => (
            <button key={v.id} onClick={() => onAdd({ type: 'link', label: v.label, target: `view:${v.id}`, icon: v.icon })}
              className="inline-flex items-center gap-1.5 rounded-full bg-white border border-black/[0.08] px-3 py-1.5 text-xs text-[#16181A] hover:border-[#C8F542] transition">
              <Icon name={v.icon} size={13} /> {v.label}
            </button>
          ))}
        </div>
      )}

      {source && source !== 'view' && (
        <div className="pt-1">
          {loading ? (
            <p className="text-xs text-black/40">Načítám…</p>
          ) : options.length === 0 ? (
            <p className="text-xs text-black/40">Tady zatím nic není.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {options.map(o => {
                const src = LINK_SOURCES.find(s => s.kind === source)!;
                return (
                  <button key={o.label}
                    onClick={() => onAdd({ type: 'link', label: o.label, target: `${source}:${o.label}`, icon: src.icon })}
                    className="rounded-full bg-white border border-black/[0.08] px-3 py-1.5 text-xs text-[#16181A] hover:border-[#C8F542] transition">
                    {o.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <button onClick={onClose}
        className="rounded-full glass border border-black/10 text-[#16181A] px-4 py-1.5 text-xs font-medium hover:bg-black/[0.05] transition">
        Zavřít
      </button>
    </div>
  );
}

/** One link tile as it appears on a finished dashboard. */
export function LinkTile({ entry, onNavigate }: {
  entry: Extract<LayoutEntry, { type: 'link' }>;
  onNavigate: (view: string, arg?: string) => void;
}) {
  const { kind, arg } = parseTarget(entry.target);
  const go = () => {
    if (kind === 'inventory') return onNavigate('inventory', arg);
    if (kind === 'view') return onNavigate(arg);
    // Procedures and guides live on their own sections; the tile takes the
    // person there and the name in the label tells them what to open.
    if (kind === 'procedure') return onNavigate('procedures');
    if (kind === 'guide') return onNavigate('guides');
    return onNavigate(kind);
  };
  return (
    <button onClick={go}
      className="w-full flex items-center gap-2.5 rounded-2xl glass-card px-4 py-3.5 text-left hover:bg-black/[0.03] transition active:scale-[0.99]">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#C8F542]/20 text-[#5B7A08]">
        <Icon name={entry.icon || 'chevron'} size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[#16181A] truncate">{entry.label}</span>
        <span className="block text-[11px] text-black/40">
          {kind === 'inventory' ? 'Sklad' : kind === 'procedure' ? 'Postup' : kind === 'guide' ? 'Návod' : 'Otevřít'}
        </span>
      </span>
      <Icon name="chevron" size={15} className="text-black/25 -rotate-90 ml-auto shrink-0" />
    </button>
  );
}
