'use client';

// Ruční připsání a odebrání razítek: jednomu hostovi, nebo hromadně celé
// skupině. Důvod je povinný — zapíše se do historie hosta i do auditu.

import { useEffect, useRef, useState } from 'react';
import { Button, Chip, Field, Input, ListRow, Modal, Segmented } from '../../ui';
import { apiMessage, okJson } from '@/lib/api';
import { czCount, type CzNoun } from '@/lib/czech';
import { useResultKeys } from '@/lib/useResultKeys';

const RAZITKO: CzNoun = { one: 'razítko', few: 'razítka', many: 'razítek' };
const HOST: CzNoun = { one: 'host', few: 'hosté', many: 'hostů' };

export default function RucniRazitka({ kampan, onZavrit, onHotovo }: {
  kampan: { id: number; name: string; required_stamps: number };
  onZavrit: () => void; onHotovo: (zprava: string) => void;
}) {
  const [rezim, setRezim] = useState<'pridat' | 'odebrat'>('pridat');
  const [komu, setKomu] = useState<'host' | 'skupina'>('host');
  const [q, setQ] = useState('');
  const [nalezeni, setNalezeni] = useState<{ id: number; name: string }[]>([]);
  const [hoste, setHoste] = useState<{ id: number; name: string }[]>([]);
  const [ptamStorno, setPtamStorno] = useState(false);
  const [skupiny, setSkupiny] = useState<{ id: number; name: string; members: number }[]>([]);
  const [skupina, setSkupina] = useState('');
  const [pocet, setPocet] = useState('1');
  const [duvod, setDuvod] = useState('');
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const [vysledek, setVysledek] = useState<{ upraveno: number; preskoceno: { id: number; proc: string }[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const keys = useResultKeys(listRef, inputRef, { onEscape: () => setQ('') });

  useEffect(() => {
    if (komu !== 'skupina' || skupiny.length) return;
    fetch('/api/client/admin/groups').then(okJson).then(d => setSkupiny(d.groups ?? [])).catch(e => setChyba(apiMessage(e, 'Skupiny se nepodařilo načíst.')));
  }, [komu, skupiny.length]);
  useEffect(() => {
    const dotaz = q.trim();
    if (dotaz.length < 2) { setNalezeni([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/client/admin/customers?q=${encodeURIComponent(dotaz)}&limit=6`).then(okJson)
        .then(d => setNalezeni((d.customers ?? []).map((c: any) => ({ id: Number(c.id), name: String(c.name) })).filter((c: { id: number }) => !hoste.some(h => h.id === c.id))))
        .catch(() => setNalezeni([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = Math.max(1, Math.min(50, Math.round(Number(pocet) || 0)));
  const hotovoKOdeslani = (komu === 'host' ? hoste.length > 0 : !!skupina) && duvod.trim().length >= 3 && Number(pocet) >= 1;

  const odeslat = async () => {
    if (!hotovoKOdeslani || busy) return;
    setBusy(true); setChyba('');
    try {
      const body: any = { action: 'bulk', campaignId: kampan.id, delta: rezim === 'pridat' ? n : -n, reason: duvod.trim() };
      if (komu === 'host') body.customerIds = hoste.map(h => h.id); else body.groupId = Number(skupina);
      const r = await fetch('/api/client/admin/stamps/member', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Nepovedlo se.');
      if ((d.preskoceno ?? []).length === 0 || (komu === 'host' && hoste.length === 1)) {
        if (!d.ok) throw new Error(d.preskoceno?.[0]?.proc || 'Nic se nezměnilo.');
        onHotovo(`${rezim === 'pridat' ? 'Připsáno' : 'Odebráno'}: ${czCount(n, RAZITKO)}${komu === 'host' && hoste.length === 1 ? ` — ${hoste[0].name}` : ` — ${czCount(d.upraveno, HOST)}`}.`);
        return;
      }
      setVysledek({ upraveno: d.upraveno, preskoceno: d.preskoceno });
    } catch (e) { setChyba(apiMessage(e, 'Razítka se nepodařilo upravit.')); }
    setBusy(false);
  };

  const storno = async () => {
    if (hoste.length !== 1 || busy) return;
    setBusy(true); setChyba('');
    try {
      const r = await fetch('/api/client/admin/stamps/member', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'undo', customerId: hoste[0].id, campaignId: kampan.id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Nepovedlo se.');
      onHotovo(`${hoste[0].name}: ${d.message}`);
      return;
    } catch (e) { setChyba(apiMessage(e, 'Storno se nepodařilo.')); }
    setBusy(false);
  };

  return (
    <>
    <Modal open onClose={onZavrit} size="md" title={`Razítka ručně: ${kampan.name}`}
      subtitle="Oprava chyby, dárek nebo reklamace. Změna se zapíše do historie hosta i do auditu."
      footer={vysledek
        ? <Button variant="primary" onClick={() => onHotovo(`Upraveno ${czCount(vysledek.upraveno, HOST)}, ${czCount(vysledek.preskoceno.length, HOST)} přeskočeno.`)}>Hotovo</Button>
        : <>
          <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
          <Button variant="primary" loading={busy} disabled={!hotovoKOdeslani} onClick={odeslat}>{rezim === 'pridat' ? 'Připsat' : 'Odebrat'}</Button>
        </>}>
      {vysledek ? (
        <div className="space-y-2">
          <p className="text-sm">Upraveno: <strong>{czCount(vysledek.upraveno, HOST)}</strong>.</p>
          <p className="text-sm text-black/65">Přeskočeno ({vysledek.preskoceno.length}) — důvod je u každého hosta:</p>
          <ul className="list max-h-48 overflow-y-auto">
            {vysledek.preskoceno.slice(0, 30).map(p => <li key={p.id} className="list-row text-[13px]"><span className="tabular-nums text-black/50">#{p.id}</span> {p.proc}</li>)}
          </ul>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); void odeslat(); }}>
          <Segmented options={[{ id: 'pridat', label: 'Připsat' }, { id: 'odebrat', label: 'Odebrat' }]} value={rezim} onChange={v => setRezim(v as 'pridat' | 'odebrat')} size="sm" ariaLabel="Připsat nebo odebrat" />
          <Segmented options={[{ id: 'host', label: 'Jeden host' }, { id: 'skupina', label: 'Celá skupina' }]} value={komu} onChange={v => { setKomu(v as 'host' | 'skupina'); setChyba(''); }} size="sm" ariaLabel="Komu" />
          {komu === 'host' ? (
            <div>
              <label htmlFor="rr-host" className="field-label">Hosté</label>
              {hoste.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {hoste.map(h => (
                    <button key={h.id} type="button" aria-label={`Odebrat ${h.name}`} onClick={() => setHoste(hoste.filter(x => x.id !== h.id))}
                      className="filter-pill tap-target-sm seg-on inline-flex items-center gap-1.5">{h.name}<span aria-hidden className="opacity-60">×</span></button>
                  ))}
                </div>
              )}
              <Input id="rr-host" ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={keys.onInputKeyDown} placeholder={hoste.length ? 'Přidat dalšího hosta…' : 'Začni psát jméno člena…'} autoComplete="off" />
              {nalezeni.length > 0 && (
                <ul ref={listRef} onKeyDown={keys.onListKeyDown} className="list mt-1.5">
                  {nalezeni.map(c => <ListRow key={c.id} title={c.name} chevron={false} onClick={() => { setHoste([...hoste, c]); setQ(''); setNalezeni([]); inputRef.current?.focus(); }} />)}
                </ul>
              )}
              {q.trim().length >= 2 && !nalezeni.length && <p className="t-meta mt-1.5">Žádný další člen takhle nezačíná.</p>}
              {hoste.length === 1 && (
                <Button type="button" size="sm" variant="ghost" icon="undo" className="mt-2" onClick={() => setPtamStorno(true)}>Stornovat poslední akci s razítky tohoto hosta</Button>
              )}
            </div>
          ) : (
            <Field id="rr-skupina" label="Skupina" hint={skupiny.length ? 'Razítka dostanou jen členové podniku; najednou nejvýš 200 hostů.' : 'Skupiny zakládáš v Zákaznících.'}>
              <select id="rr-skupina" className="field" value={skupina} onChange={e => setSkupina(e.target.value)}>
                <option value="">Vyber skupinu…</option>
                {skupiny.map(g => <option key={g.id} value={g.id}>{g.name} ({czCount(g.members, HOST)})</option>)}
              </select>
            </Field>
          )}
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <Field id="rr-pocet" label="Počet razítek" hint={`Karta má ${kampan.required_stamps}.`}>
              <Input id="rr-pocet" type="number" inputMode="numeric" min={1} max={50} value={pocet} onChange={e => setPocet(e.target.value)} />
            </Field>
            <Field id="rr-duvod" label="Důvod" hint={rezim === 'pridat' ? 'Např. „omluva za dlouhé čekání“.' : 'Např. „razítko dáno omylem“.'}>
              <Input id="rr-duvod" value={duvod} onChange={e => setDuvod(e.target.value)} maxLength={160} placeholder="Napiš důvod" autoComplete="off" />
            </Field>
          </div>
          {rezim === 'odebrat' && <p className="t-meta">Odebrat jde jen to, co host na kartě má (pod nulu se nejde dostat). Už vydané odměny zůstávají.</p>}
          {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      )}
    </Modal>
    <Modal open={ptamStorno} onClose={() => setPtamStorno(false)} size="sm" title="Stornovat poslední akci?"
      footer={<>
        <Button variant="secondary" onClick={() => setPtamStorno(false)}>Ne, nechat</Button>
        <Button variant="danger-solid" onClick={() => { setPtamStorno(false); void storno(); }}>Stornovat</Button>
      </>}>
      <p className="text-sm text-black/70 text-pretty">Vrátí se poslední akce s razítky hosta na téhle kartičce (razítko z kasy, účtenky nebo ruční úprava) a neuplatněná odměna z ní zmizí. Body a kredit se nemění.</p>
      </Modal>
    </>
  );
}
