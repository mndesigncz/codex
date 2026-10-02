'use client';

// Poukaz a host v aplikaci: výběr člena (hledání podle jména) a v detailu poukazu oddíl „Host v aplikaci“.
// Poukaz přiřazený členovi se hostovi ukáže v Moje (kód, zůstatek, platnost), takže ho nemusí hledat v e-mailu
// ani nosit papír. Přiřazení se dá kdykoli změnit nebo zrušit; zůstatek a platnost se tím nemění.
// Komponenta správy: texty česky natvrdo.

import { useEffect, useRef, useState } from 'react';
import { Button, Field, Input, Skeleton } from '../../ui';
import { apiMessage, okJson } from '@/lib/api';
import { useResultKeys } from '@/lib/useResultKeys';

export interface VybranyClen { id: number; name: string; email?: string }

/** Hledání člena podniku podle jména. `value` je vybraný člen; křížek ho zruší. Šipky a Enter vybírají, Escape zruší hledání. */
export function ClenVyber({ id, label, hint, value, onChange }: {
  id: string; label: string; hint?: string; value: VybranyClen | null; onChange: (c: VybranyClen | null) => void;
}) {
  const [q, setQ] = useState('');
  const [nalezeno, setNalezeno] = useState<VybranyClen[] | null>(null);
  const [chyba, setChyba] = useState('');
  const vstup = useRef<HTMLInputElement>(null);
  const seznam = useRef<HTMLUListElement>(null);
  const klavesy = useResultKeys(seznam, vstup, { onEscape: () => { setQ(''); setNalezeno(null); } });

  useEffect(() => {
    const dotaz = q.trim();
    if (dotaz.length < 2) { setNalezeno(null); setChyba(''); return; }
    let zije = true;
    const t = setTimeout(() => {
      fetch(`/api/client/admin/vouchers/clenove?q=${encodeURIComponent(dotaz)}`).then(okJson)
        .then(d => { if (zije) { setNalezeno(Array.isArray(d.clenove) ? d.clenove : []); setChyba(''); } })
        .catch(e => { if (zije) { setNalezeno(null); setChyba(apiMessage(e, 'Členy se nepodařilo vyhledat.')); } });
    }, 250);
    return () => { zije = false; clearTimeout(t); };
  }, [q]);

  if (value) {
    return (
      <div>
        <p className="field-label">{label}</p>
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--surface-line)] px-3 py-2">
          <p className="text-sm font-semibold truncate min-w-0">{value.name}{value.email ? <span className="t-meta font-normal"> · {value.email}</span> : null}</p>
          <Button type="button" size="sm" variant="ghost" aria-label={`Zrušit výběr: ${value.name}`} onClick={() => onChange(null)}>Změnit</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Field id={id} label={label} hint={hint ?? 'Piš jméno člena (aspoň dvě písmena).'}>
        <Input id={id} ref={vstup} value={q} autoComplete="off" onChange={e => setQ(e.target.value)} onKeyDown={klavesy.onInputKeyDown} placeholder="Jana Nováková" role="combobox" aria-expanded={!!nalezeno?.length} aria-controls={`${id}-seznam`} />
      </Field>
      {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
      {q.trim().length >= 2 && nalezeno === null && !chyba && <Skeleton className="h-10" />}
      {nalezeno && nalezeno.length === 0 && <p className="t-meta" role="status">Takového člena podnik nemá. Host se musí nejdřív přidat k podniku.</p>}
      {nalezeno && nalezeno.length > 0 && (
        <ul id={`${id}-seznam`} ref={seznam} onKeyDown={klavesy.onListKeyDown} role="listbox" aria-label="Nalezení členové" className="list rounded-2xl border border-[var(--surface-line)] overflow-hidden">
          {nalezeno.map(c => (
            <li key={c.id} role="option" aria-selected={false}>
              <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-black/[0.04] focus:bg-black/[0.06] outline-none" onClick={() => { onChange(c); setQ(''); setNalezeno(null); }}>
                <span className="font-semibold">{c.name}</span>{c.email ? <span className="t-meta"> · {c.email}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Oddíl detailu poukazu: komu v aplikaci patří; přiřadit, změnit, odpojit. */
export function PoukazHostSekce({ poukazId, clen, kupujici, body, toast, onHotovo }: {
  poukazId: number; clen: string | null; kupujici: string | null; body: number; toast: (m: string) => void; onHotovo: () => void;
}) {
  const [vybrany, setVybrany] = useState<VybranyClen | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const uloz = async (customerId: number | null, hotovo: string) => {
    setBusy(customerId == null ? 'odpojit' : 'prirad'); setErr('');
    try {
      const r = await fetch('/api/client/admin/vouchers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: poukazId, action: 'assign', customerId }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Přiřazení se nepovedlo.');
      toast(hotovo); setVybrany(null); onHotovo();
    } catch (e) { setErr(apiMessage(e, 'Přiřazení se nepovedlo.')); }
    setBusy('');
  };

  return (
    <div className="space-y-3 border-t border-[var(--surface-line)] pt-4" aria-labelledby="pk-host">
      <div>
        <h3 id="pk-host" className="t-label">Host v aplikaci</h3>
        <p className="t-meta mt-0.5">Poukaz přiřazený členovi uvidí v aplikaci v Moje: kód, zůstatek a platnost. Nic se tím nemění na tom, že ho u kasy uplatní obsluha.</p>
      </div>
      {clen ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">Patří hostovi <strong>{clen}</strong>.</p>
          <Button type="button" size="sm" variant="secondary" loading={busy === 'odpojit'} onClick={() => uloz(null, 'Poukaz je odpojený od hosta.')}>Odpojit od hosta</Button>
        </div>
      ) : (
        <>
          <ClenVyber id="pk-host-clen" label="Přiřadit členovi" value={vybrany} onChange={setVybrany} />
          <Button type="button" size="sm" variant="secondary" loading={busy === 'prirad'} disabled={!vybrany} onClick={() => vybrany && uloz(vybrany.id, `Poukaz je přiřazený hostovi ${vybrany.name}.`)}>Přiřadit poukaz</Button>
        </>
      )}
      {kupujici && <p className="t-meta">Kupující člen: {kupujici}{body > 0 ? `, za nákup dostal ${body} bodů.` : '.'}</p>}
      {err && <p role="alert" className="note note-danger">{err}</p>}
    </div>
  );
}
