'use client';

// Bannery: jazykové mutace. Nadpis a text se dají přeložit do jazyků hostů (angličtina, němčina, slovenština, polština).
// Host s jiným jazykem než češtinou uvidí překlad; kde chybí, vidí český text, nikdy prázdný banner.
// Český text je původní a platí vždy. Komponenta správy: texty česky natvrdo.

import { useState } from 'react';
import { Icon } from '../../Icons';
import { Field, Input, Textarea } from '../../ui';
import { JAZYKY_BANNERU, JAZYK_BANNERU_NAZEV, type JazykBanneru } from '@/lib/banneryPlan';

export type PrekladyDraft = Partial<Record<JazykBanneru, { title: string; text: string }>>;

export default function BanneryJazyky({ value, onChange }: { value: PrekladyDraft; onChange: (v: PrekladyDraft) => void }) {
  const [otevrene, setOtevrene] = useState<JazykBanneru | null>(null);
  const nastav = (j: JazykBanneru, cast: Partial<{ title: string; text: string }>) => onChange({ ...value, [j]: { title: '', text: '', ...value[j], ...cast } });
  const hotovo = JAZYKY_BANNERU.filter(j => value[j]?.title?.trim()).length;
  return (
    <div className="space-y-2">
      <p className="field-label">Jazykové mutace (nepovinné)</p>
      <p className="t-meta">{hotovo > 0 ? `Přeloženo do ${hotovo} z ${JAZYKY_BANNERU.length} jazyků.` : 'Bez překladu vidí všichni hosté český text.'} Kde překlad chybí, host uvidí češtinu.</p>
      <ul className="space-y-1.5">
        {JAZYKY_BANNERU.map(j => {
          const otevreno = otevrene === j;
          const p = value[j];
          return (
            <li key={j} className="rounded-2xl border border-[var(--surface-line)]">
              <button type="button" aria-expanded={otevreno} aria-controls={`bn-j-${j}`} onClick={() => setOtevrene(otevreno ? null : j)}
                className="tap-target-sm w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-left">
                <span>{JAZYK_BANNERU_NAZEV[j]}{p?.title?.trim() ? <span className="t-meta font-normal"> · {p.title.trim()}</span> : <span className="t-meta font-normal"> · bez překladu</span>}</span>
                <Icon name="chevron" size={15} className={`shrink-0 transition-transform ${otevreno ? 'rotate-180' : ''}`} />
              </button>
              {otevreno && (
                <div id={`bn-j-${j}`} className="px-3 pb-3 space-y-3">
                  <Field id={`bn-j-${j}-title`} label={`Nadpis (${JAZYK_BANNERU_NAZEV[j].toLowerCase()})`}>
                    <Input id={`bn-j-${j}-title`} lang={j} value={p?.title ?? ''} maxLength={80} onChange={e => nastav(j, { title: e.target.value })} />
                  </Field>
                  <Field id={`bn-j-${j}-text`} label={`Text (${JAZYK_BANNERU_NAZEV[j].toLowerCase()})`} hint="Nejvýš 300 znaků.">
                    <Textarea id={`bn-j-${j}-text`} lang={j} rows={2} maxLength={300} value={p?.text ?? ''} onChange={e => nastav(j, { text: e.target.value })} />
                  </Field>
                  {p?.title?.trim() || p?.text?.trim() ? <button type="button" className="tap-target-sm text-sm font-semibold text-bad-ink" onClick={() => { const { [j]: _, ...zbytek } = value; onChange(zbytek); }}>Smazat překlad</button> : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
