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
//
// Kolo 69 (B4): připnutý návod byl limetkově tónovaný box uvnitř modrého
// boxu výroby a „Připojit návod" ruční skleněná pilulka. Teď řádek .list
// (bez tónu — tón nese stav, ne ozdobu) a tlačítka z ui.

import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Button, Input, ListRow } from '../ui';
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
          <ul className="list">
            <ListRow lead={<Icon name="book" size={16} className="text-black/40" />}
              title={guideTitle ?? `Návod #${guideId}`} href={`?view=guides&guide=${guideId}`} chevron={false}
              actions={<Button variant="ghost" size="sm" iconOnly icon="close" disabled={busy}
                aria-label="Zrušit vazbu na návod" onClick={() => uloz({ itemId: null }, guideId)} />} />
          </ul>
          <p className="t-meta">
            {guideSteps > 0
              ? `Úkol „Vyrobit ${itemName}“ dostane ${guideSteps} kroků z tohohle návodu.`
              : 'Návod nemá checklist — do úkolu půjde postup z pole níž. Doplň kroky v Návodech.'}
          </p>
        </div>
      ) : open ? (
        <div className="space-y-2">
          <Input ref={vstup} autoFocus value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={keys.onInputKeyDown} aria-label="Hledat mezi návody"
            placeholder="Hledat mezi návody…" />
          {nalezene.length === 0 && (
            <p className="t-meta">
              {all.length === 0 ? 'Zatím žádné návody — napiš ho v záložce Návody.' : 'Nic takového mezi návody není.'}
            </p>
          )}
          {nalezene.length > 0 && (
            <div ref={seznam} onKeyDown={keys.onListKeyDown}
              className="max-h-44 overflow-y-auto scrollbar-thin divide-y divide-black/[0.06]">
              {nalezene.map(g => (
                <button key={g.id} type="button" disabled={busy}
                  onClick={() => uloz({ itemId }, g.id)}
                  className="w-full text-left px-1 py-2 hover:bg-black/[0.04] transition-colors disabled:opacity-50">
                  <span className="block text-sm text-[#16181A] truncate">{g.title}</span>
                  <span className="block text-[13px] text-black/55 truncate">
                    {g.hasChecklist ? 'má checklist' : 'bez checklistu'}
                    {g.approved === false ? ' · čeká na schválení' : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setQuery(''); }}>Zrušit</Button>
        </div>
      ) : (
        <Button variant="secondary" size="sm" icon="plus" onClick={() => setOpen(true)}>Připojit návod</Button>
      )}
      {err && <p className="note note-danger mt-1" role="alert">{err}</p>}
    </div>
  );
}
