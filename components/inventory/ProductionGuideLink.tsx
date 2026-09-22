'use client';

// Podle čeho se položka vyrábí: návod, ne odstavec textu.
//
// Postup výroby se tu psal do holého `<textarea>`. Vedle toho v Návodech
// často ležel návod na tutéž věc — se schválením, kategorií a potvrzením
// přečtení. Dva popisy jednoho postupu, které se po první změně rozešly,
// a obsluha četla ten, na který zrovna narazila.
//
// Textové pole zůstává pro položky, kde návod nikdo psát nebude („Svařit
// a stočit“ opravdu nepotřebuje kategorii). Jakmile je ale návod připnutý,
// kroky do úkolu „Vyrobit X“ jdou z něj.

import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { useResultKeys } from '@/lib/useResultKeys';
import { okJson } from '@/lib/api';
import { obsahuje } from '@/lib/hledani';

type GuideOption = { id: number; title: string; hasChecklist?: boolean; approved?: boolean; itemId?: number | null };

export default function ProductionGuideLink({ itemId, itemName, guideId, guideTitle, guideSteps, onChanged }: {
  itemId: number;
  itemName: string;
  guideId: number | null;
  guideTitle: string | null;
  /** Kolik kroků návod má — nula znamená, že úkol z něj nic nesestaví. */
  guideSteps: number;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState<GuideOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const vstup = useRef<HTMLInputElement>(null);
  const seznam = useRef<HTMLDivElement>(null);
  const keys = useResultKeys(seznam, vstup, { onEscape: () => { setOpen(false); setQuery(''); } });

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch('/api/guides').then(okJson).then(d => {
      if (alive && Array.isArray(d.guides)) setAll(d.guides);
    }).catch(() => { if (alive) setErr('Návody se nenačetly.'); });
    return () => { alive = false; };
  }, [open]);

  // Návod už připnutý k JINÉ položce se nenabízí: připnutí by ho té položce
  // potichu sebralo a nikdo by nevěděl proč.
  const nalezene = all
    .filter(g => g.itemId == null || g.itemId === itemId)
    .filter(g => obsahuje(g.title, query))
    .slice(0, 8);

  const uloz = async (body: Record<string, unknown>, id: number) => {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/guides/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || 'Uložení se nepodařilo.');
      } else {
        setOpen(false); setQuery(''); onChanged();
      }
    } catch { setErr('Uložení se nepodařilo.'); }
    setBusy(false);
  };

  // Skupina, ne jedno pole — viz stejná poznámka v GuideItemLink.
  const popisek = useId();

  return (
    <div role="group" aria-labelledby={popisek}>
      <p id={popisek} className="field-label">Návod k výrobě (volitelné)</p>
      {guideId ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 rounded-2xl bg-[#C8F542]/[0.09] border border-[#C8F542]/25 px-4 py-2.5">
            <Icon name="book" size={15} className="shrink-0 text-[#5B7A08]" />
            <a href={`?view=guides&guide=${guideId}`}
              className="min-w-0 flex-1 truncate text-sm text-[#16181A] underline decoration-black/20 underline-offset-2 hover:decoration-black/50">
              {guideTitle ?? `Návod #${guideId}`}
            </a>
            <button type="button" disabled={busy} onClick={() => uloz({ itemId: null }, guideId)}
              title="Zrušit vazbu" aria-label="Zrušit vazbu na návod"
              className="shrink-0 btn-icon btn-icon-danger transition disabled:opacity-50">
              <Icon name="close" size={13} />
            </button>
          </div>
          <p className="text-[11px] text-black/45">
            {guideSteps > 0
              ? `Úkol „Vyrobit ${itemName}“ dostane ${guideSteps} kroků z tohohle návodu.`
              : 'Návod nemá checklist — do úkolu půjde postup z pole níž. Doplň kroky v Návodech.'}
          </p>
        </div>
      ) : open ? (
        <div className="well border border-black/[0.07] p-3 space-y-2">
          <input ref={vstup} autoFocus value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={keys.onInputKeyDown}
            placeholder="Hledat mezi návody…"
            className="w-full rounded-2xl bg-white/70 border border-black/[0.08] px-3.5 py-2.5 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none" />
          {nalezene.length === 0 && (
            <p className="text-xs text-black/40">
              {all.length === 0 ? 'Zatím žádné návody — napiš ho v záložce Návody.' : 'Nic takového mezi návody není.'}
            </p>
          )}
          {nalezene.length > 0 && (
            <div ref={seznam} onKeyDown={keys.onListKeyDown}
              className="max-h-44 overflow-y-auto scrollbar-thin divide-y divide-black/[0.05]">
              {nalezene.map(g => (
                <button key={g.id} type="button" disabled={busy}
                  onClick={() => uloz({ itemId }, g.id)}
                  className="w-full text-left px-1 py-2 hover:bg-black/[0.03] transition disabled:opacity-50">
                  <span className="block text-sm text-[#16181A] truncate">{g.title}</span>
                  <span className="block text-[11px] text-black/40 truncate">
                    {g.hasChecklist ? 'má checklist' : 'bez checklistu'}
                    {g.approved === false ? ' · čeká na schválení' : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => { setOpen(false); setQuery(''); }}
            className="text-xs font-semibold text-black/45 hover:text-black transition">Zrušit</button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)}
          className="w-full rounded-2xl glass border border-black/10 text-black/60 hover:bg-black/[0.06] hover:text-black px-4 py-2.5 text-sm text-left transition inline-flex items-center gap-2">
          <Icon name="plus" size={15} /> Připojit návod
        </button>
      )}
      {err && <p className="text-xs text-bad-ink mt-1">{err}</p>}
    </div>
  );
}
