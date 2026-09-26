'use client';

// Výběr návodu pro JEDEN krok postupu.
//
// Krok má dnes pole „Poznámka" na jednu větu („Nechat nahřát před prvním
// kafem."). Krok „Vyčistit kávovar" ale potřebuje celý postup — a ten
// v Návodech většinou existuje. Bez tohohle výběru ho vedení mohlo leda
// přepsat do poznámky a mít ho pak ve dvou verzích.
//
// Seznam návodů si komponenta NEnačítá sama: v editoru postupu je krok
// klidně dvacet a dvacet stejných požadavků na `/api/guides` je zbytečných.
// Načte ho editor jednou a předá sem.

import { useId, useState } from 'react';
import { Icon } from '../Icons';
import { obsahuje } from '@/lib/hledani';

export interface PickableGuide { id: number; title: string }

export default function StepGuidePicker({ guides, value, onChange, stepNumber }: {
  guides: PickableGuide[];
  value: number | null;
  onChange: (guideId: number | null) => void;
  /** Jen do popisku pro odečítač — „Návod ke kroku 3". */
  stepNumber: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const popisek = useId();
  const vybrany = value != null ? guides.find(g => g.id === value) ?? null : null;
  const nalezene = guides.filter(g => obsahuje(g.title, query)).slice(0, 8);

  if (value != null) {
    return (
      // Kolo 69 (B6b): vybraný návod byl limetková pilulka — teď neutrální chip (limetka je akce).
      <span className="chip chip-muted inline-flex min-w-0 items-center gap-1.5 !pr-1">
        <Icon name="book" size={12} className="shrink-0" />
        <span className="truncate max-w-[10rem]">{vybrany?.title ?? `Návod #${value}`}</span>
        <button type="button" onClick={() => onChange(null)}
          aria-label={`Zrušit návod u kroku ${stepNumber}`} title="Zrušit návod"
          className="btn-icon btn-icon-danger shrink-0 !h-6 !w-6">
          <Icon name="close" size={11} />
        </button>
      </span>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        title="Připojit ke kroku návod"
        className="btn btn-secondary btn-sm">
        <Icon name="book" size={12} /> Návod
      </button>
    );
  }

  return (
    <div role="group" aria-labelledby={popisek} className="w-full min-w-0 well p-2 space-y-1.5">
      <p id={popisek} className="sr-only">Návod ke kroku {stepNumber}</p>
      <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setQuery(''); } }}
        placeholder="Hledat mezi návody…" aria-label={`Hledat návod ke kroku ${stepNumber}`}
        className="field w-full" />
      {nalezene.length === 0 ? (
        <p className="t-meta px-1">
          {guides.length === 0 ? 'Zatím žádné návody — napiš je v záložce Návody.' : 'Nic takového mezi návody není.'}
        </p>
      ) : (
        <div className="max-h-36 overflow-y-auto scrollbar-thin divide-y divide-black/[0.05]">
          {nalezene.map(g => (
            <button key={g.id} type="button"
              onClick={() => { onChange(g.id); setOpen(false); setQuery(''); }}
              className="w-full text-left px-1 py-2 text-sm text-[#16181A] truncate hover:bg-black/[0.03] transition-colors">
              {g.title}
            </button>
          ))}
        </div>
      )}
      <button type="button" onClick={() => { setOpen(false); setQuery(''); }}
        className="btn btn-ghost btn-sm">Zrušit</button>
    </div>
  );
}
