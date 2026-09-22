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
      <span className="inline-flex min-w-0 items-center gap-1.5 rounded-xl bg-[#C8F542]/20 border border-[#C8F542]/30 pl-2.5 pr-1 py-1 text-[11px] font-semibold text-[#5B7A08]">
        <Icon name="book" size={12} className="shrink-0" />
        <span className="truncate max-w-[10rem]">{vybrany?.title ?? `Návod #${value}`}</span>
        <button type="button" onClick={() => onChange(null)}
          aria-label={`Zrušit návod u kroku ${stepNumber}`} title="Zrušit návod"
          className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-[#5B7A08]/60 hover:text-bad-ink hover:bg-bad/10 transition">
          <Icon name="close" size={11} />
        </button>
      </span>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        title="Připojit ke kroku návod"
        className="tap-target-sm inline-flex items-center gap-1.5 rounded-xl bg-white/60 border border-black/[0.07] px-2.5 py-1.5 text-[11px] font-semibold text-black/45 hover:text-[#5B7A08] hover:border-[#C8F542]/60 transition">
        <Icon name="book" size={12} /> Návod
      </button>
    );
  }

  return (
    <div role="group" aria-labelledby={popisek} className="w-full min-w-0 well border border-black/[0.07] p-2 space-y-1.5">
      <p id={popisek} className="sr-only">Návod ke kroku {stepNumber}</p>
      <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setQuery(''); } }}
        placeholder="Hledat mezi návody…"
        className="w-full rounded-xl bg-white/70 border border-black/[0.08] px-3 py-2 text-xs text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none" />
      {nalezene.length === 0 ? (
        <p className="text-[11px] text-black/40 px-1">
          {guides.length === 0 ? 'Zatím žádné návody — napiš je v záložce Návody.' : 'Nic takového mezi návody není.'}
        </p>
      ) : (
        <div className="max-h-36 overflow-y-auto scrollbar-thin divide-y divide-black/[0.05]">
          {nalezene.map(g => (
            <button key={g.id} type="button"
              onClick={() => { onChange(g.id); setOpen(false); setQuery(''); }}
              className="w-full text-left px-1 py-1.5 text-xs text-[#16181A] truncate hover:bg-black/[0.03] transition">
              {g.title}
            </button>
          ))}
        </div>
      )}
      <button type="button" onClick={() => { setOpen(false); setQuery(''); }}
        className="text-[11px] font-semibold text-black/45 hover:text-black transition">Zrušit</button>
    </div>
  );
}
