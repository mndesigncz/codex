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
import { useT } from '@/lib/i18n/client';

export interface PickableGuide { id: number; title: string }

export default function StepGuidePicker({ guides, value, onChange, stepNumber }: {
  guides: PickableGuide[];
  value: number | null;
  onChange: (guideId: number | null) => void;
  /** Jen do popisku pro odečítač — „Návod ke kroku 3". */
  stepNumber: number;
}) {
  const t = useT('navody');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const popisek = useId();
  const vybrany = value != null ? guides.find(g => g.id === value) ?? null : null;
  const nalezene = guides.filter(g => obsahuje(g.title, query)).slice(0, 8);

  if (value != null) {
    return (
      // Kolo 69 (B6b): vybraný návod byl limetková pilulka — teď neutrální chip (limetka je akce).
      // v4 (P7): v řadě kroku stejná výška a šířka dílu jako vedlejší tlačítko (44, ½).
      <span className="chip chip-muted inline-flex w-full min-w-0 !h-11 items-center gap-1.5 !pl-3.5 !pr-1.5">
        <Icon name="book" size={14} className="shrink-0" />
        <span className="truncate min-w-0 flex-1">{vybrany?.title ?? t('Návod #{id}', { id: value })}</span>
        <button type="button" onClick={() => onChange(null)}
          aria-label={t('Zrušit návod u kroku {n}', { n: stepNumber })} title={t('Zrušit návod')}
          className="btn-icon btn-icon-danger shrink-0 !h-8 !w-8">
          <Icon name="close" size={12} />
        </button>
      </span>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        title={t('Připojit ke kroku návod')}
        className="btn btn-secondary w-full">
        <Icon name="book" size={15} />  {t('Návod')}
      </button>
    );
  }

  return (
    <div role="group" aria-labelledby={popisek} className="w-full min-w-0 well p-2 space-y-1.5">
      <p id={popisek} className="sr-only">{t('Návod ke kroku {n}', { n: stepNumber })}</p>
      <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setQuery(''); } }}
        placeholder={t('Hledat mezi návody…')} aria-label={t('Hledat návod ke kroku {n}', { n: stepNumber })}
        className="field w-full" />
      {nalezene.length === 0 ? (
        <p className="t-meta px-1">
          {guides.length === 0 ? t('Zatím žádné návody — napiš je v záložce Návody.') : t('Nic takového mezi návody není.')}
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
        className="btn btn-ghost w-full">{t('Zrušit')}</button>
    </div>
  );
}
