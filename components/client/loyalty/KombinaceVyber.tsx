'use client';

// Sestavení kombinace podmínek: „nepřišli dva měsíce A zároveň jsou zlatí“, nebo „narozeniny NEBO blízko odměně“.
// Používá se u pravidla dynamické skupiny i u publika zprávy. Výstup je zápis `mix:…` z lib/skupinyPravidla,
// nebo prázdný řetězec, dokud nejsou vybrané aspoň dvě podmínky.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Segmented } from '../../ui';
import { ctiKombinaci, stitekKombinace, zapisKombinaci, MAX_CASTI_KOMBINACE, type RezimKombinace } from '@/lib/skupinyPravidla';

export interface MoznostKombinace { id: string; label: string; pocet?: number; skupina: string }

export default function KombinaceVyber({ moznosti, value, onChange, idPrefix }: {
  moznosti: MoznostKombinace[];
  /** Zápis `mix:…`, nebo cokoli jiného (pak se začne od nuly). */
  value: string;
  onChange: (zapis: string) => void;
  idPrefix: string;
}) {
  const [rezim, setRezim] = useState<RezimKombinace>('and');
  // Vybrané části v pořadí výběru; `!` na začátku = „kromě“.
  const [casti, setCasti] = useState<string[]>([]);
  const nacteno = useRef(false);
  useEffect(() => {
    if (nacteno.current) return;
    nacteno.current = true;
    const k = ctiKombinaci(value, { skupiny: true });
    if (k) { setRezim(k.rezim); setCasti(k.casti); }
  }, [value]);

  const zapis = useMemo(() => (casti.length >= 2 ? zapisKombinaci(rezim, casti) : ''), [rezim, casti]);
  useEffect(() => { onChange(zapis); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [zapis]);

  const je = (id: string) => casti.some(c => c === id || c === `!${id}`);
  const zaporna = (id: string) => casti.includes(`!${id}`);
  const prepni = (id: string) => setCasti(cur => je(id) ? cur.filter(c => c !== id && c !== `!${id}`) : cur.length >= MAX_CASTI_KOMBINACE ? cur : [...cur, id]);
  const prepniKrome = (id: string) => setCasti(cur => cur.map(c => (c === id ? `!${id}` : c === `!${id}` ? id : c)));
  const zmenRezim = (r: RezimKombinace) => { setRezim(r); if (r === 'or') setCasti(cur => cur.map(c => (c.startsWith('!') ? c.slice(1) : c))); };
  const skupiny = Array.from(new Set(moznosti.map(m => m.skupina)));
  const nazvy = Object.fromEntries(moznosti.filter(m => m.id.startsWith('group:')).map(m => [Number(m.id.slice(6)), m.label.replace(/^Skupina /, '')]));
  const k = zapis ? ctiKombinaci(zapis, { skupiny: true }) : null;

  return (
    <div className="grid gap-3 rounded-2xl border border-black/10 p-3.5" role="group" aria-label="Kombinace podmínek">
      <Segmented size="sm" ariaLabel="Jak se podmínky spojují" value={rezim} onChange={zmenRezim}
        options={[{ id: 'and', label: 'Platí všechno naráz' }, { id: 'or', label: 'Stačí kterákoli' }]} />
      {skupiny.map(sk => (
        <fieldset key={sk} className="min-w-0">
          <legend className="t-label mb-1">{sk}</legend>
          <ul className="grid gap-0.5">
            {moznosti.filter(m => m.skupina === sk).map(m => {
              const id = `${idPrefix}-${m.id.replace(/[^a-z0-9]/gi, '-')}`;
              const vybrano = je(m.id);
              const dosazeno = !vybrano && casti.length >= MAX_CASTI_KOMBINACE;
              return (
                <li key={m.id} className="flex items-center gap-2 min-h-[40px]">
                  <input id={id} type="checkbox" className="h-5 w-5 shrink-0 accent-[#16181A]" checked={vybrano} disabled={dosazeno} onChange={() => prepni(m.id)} />
                  <label htmlFor={id} className="flex-1 min-w-0 text-sm truncate">{m.label}{m.pocet != null && <span className="text-black/45 tabular-nums"> ({m.pocet})</span>}</label>
                  {vybrano && rezim === 'and' && (
                    <button type="button" onClick={() => prepniKrome(m.id)} aria-pressed={zaporna(m.id)}
                      className={`filter-pill tap-target-sm text-xs ${zaporna(m.id) ? 'seg-on' : 'seg-off glass'}`}>
                      kromě
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
      <p className={k ? 'text-sm text-black/70' : 'note note-wait'} aria-live="polite">
        {k ? `Vybráni budou: ${stitekKombinace(k, nazvy)}.`
          : casti.length === 1 ? 'Vyber ještě aspoň jednu podmínku. Jedna podmínka je obyčejný výběr výš.'
          : `Vyber aspoň dvě podmínky, nejvýš ${MAX_CASTI_KOMBINACE}.`}
        {rezim === 'and' && casti.every(c => c.startsWith('!')) && casti.length > 0 ? ' Aspoň jedna podmínka musí být bez „kromě“.' : ''}
      </p>
    </div>
  );
}
