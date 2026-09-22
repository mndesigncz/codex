'use client';

// Jedno vyhledávací pole pro celou aplikaci. Po kliknutí nabídne předvolby
// (poslední hledání + návrhy obrazovky — kategorie, dodavatelé…), při psaní
// se návrhy filtrují a volající zároveň filtruje svůj seznam jako dřív.
// Šipky + Enter vybírají, Escape zavře a podruhé vyčistí. Poslední hledání
// se drží v localStorage pod klíčem obrazovky, jen v tomhle prohlížeči.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { obsahuje, proHledani } from '@/lib/hledani';

export interface SearchSuggestion {
  label: string;
  /** Drobný popisek vpravo („kategorie", „dodavatel"). */
  hint?: string;
  /** Co se po výběru dosadí do pole; bez uvedení se použije label. */
  value?: string;
}

const RECENT_MAX = 4;
const recentKey = (k: string) => `managero-search-${k}`;
const readRecent = (k: string): string[] => {
  try { const v = JSON.parse(localStorage.getItem(recentKey(k)) ?? '[]'); return Array.isArray(v) ? v.slice(0, RECENT_MAX) : []; }
  catch { return []; }
};

export function SearchField({ value, onChange, placeholder = 'Hledat…', suggestions = [], storageKey, autoFocus, className = '', inputClassName = '', ariaLabel }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Předvolby obrazovky — kategorie, dodavatelé, časté volby. */
  suggestions?: SearchSuggestion[];
  /** Klíč pro poslední hledání; bez něj se poslední hledání neukládají. */
  storageKey?: string;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (storageKey) setRecent(readRecent(storageKey)); }, [storageKey]);
  // Zavření kliknutím mimo.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  // Dopsané hledání si zapamatovat (až po chvíli klidu, ne po každém písmenu).
  useEffect(() => {
    if (!storageKey) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const q = value.trim();
    if (q.length < 3) return;
    saveTimer.current = setTimeout(() => {
      try {
        const next = [q, ...readRecent(storageKey).filter(r => r.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX);
        localStorage.setItem(recentKey(storageKey), JSON.stringify(next));
        setRecent(next);
      } catch { /* soukromé okno */ }
    }, 1200);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [value, storageKey]);

  const q = value.trim().toLowerCase();
  const items = useMemo(() => {
    const sug = (q ? suggestions.filter(s => obsahuje(s.label, q)) : suggestions).slice(0, 6)
      .map(s => ({ kind: 'sug' as const, label: s.label, hint: s.hint, value: s.value ?? s.label }));
    const rec = (q ? recent.filter(r => obsahuje(r, q) && proHledani(r) !== proHledani(q)) : recent)
      .filter(r => !sug.some(s => s.value.toLowerCase() === r.toLowerCase()))
      .map(r => ({ kind: 'rec' as const, label: r, hint: 'poslední hledání', value: r }));
    return [...rec.slice(0, 3), ...sug];
  }, [q, suggestions, recent]);

  const pick = (v: string) => { onChange(v); setOpen(false); setActive(-1); input.current?.focus(); };
  const showPanel = open && items.length > 0;

  return (
    <div ref={wrap} className={`relative ${className}`}>
      <Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35 pointer-events-none" />
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-label={ariaLabel ?? placeholder}
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Escape') { if (open) setOpen(false); else onChange(''); return; }
          if (!showPanel) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % items.length); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a <= 0 ? items.length - 1 : a - 1)); }
          else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active].value); }
        }}
        className={`field !pl-10 ${value ? '!pr-10' : ''} ${inputClassName}`}
      />
      {value && (
        <button type="button" aria-label="Vyčistit hledání" onClick={() => { onChange(''); input.current?.focus(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full flex items-center justify-center text-black/35 hover:text-black">
          <Icon name="close" size={13} />
        </button>
      )}
      {showPanel && (
        <div role="listbox" className="absolute z-30 left-0 right-0 mt-1.5 card p-1.5 shadow-[var(--shadow-float)] pop-in origin-top max-h-64 overflow-y-auto scrollbar-thin">
          {items.map((it, i) => (
            <button key={`${it.kind}-${it.label}`} type="button" role="option" aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(it.value)}
              className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${i === active ? 'bg-black/[0.05] text-[#16181A]' : 'text-black/70'}`}>
              <Icon name={it.kind === 'rec' ? 'clock' : 'search'} size={14} className="shrink-0 text-black/30" />
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              {it.hint && <span className="shrink-0 text-[11px] text-black/35">{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SearchField;
