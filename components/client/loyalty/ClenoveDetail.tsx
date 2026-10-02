'use client';

// Detail člena pod řádkem seznamu: skupiny (klepnutím přidat / odebrat), interní
// poznámky personálu a deník bodů s časovou osou. Dřív to bylo v ClientAdmin.tsx.
// Oprávnění: skupiny zakaznici.skupiny, poznámky zakaznici.poznamky, deník vernost.zobrazit.

import { useCallback, useEffect, useState } from 'react';
import { Button, Chip, ListRow, Skeleton, Textarea, Well, useLoad } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { useMoney } from '../../CurrencyProvider';
import { casovaOsa, zbyvaDoUrovne, zbyvaDoOdmeny, type UdalostOsy } from '@/lib/clenPrehled';
import { czCount, type CzNoun } from '@/lib/czech';
import { dbTimeDayHM, pragueDaySafe } from '@/lib/pragueTime';
import { apiMessage, okJson } from '@/lib/api';
import { NOTE_MAX } from '@/lib/poznamkyHosta';
import { j, type Hlaska } from '../import/typy';
import RazitkaClen from './RazitkaClen';

const NAVSTEVA: CzNoun = { one: 'návštěva', few: 'návštěvy', many: 'návštěv' };
const POPISEK_DRUHU: Record<string, string> = { body: 'Body', kupon: 'Kupon', poukaz: 'Poukaz', objednavka: 'Objednávka' };

/** Datum z databáze česky i s rokem („11. 2. 2026") — přes pražský den, ne místní zónu prohlížeče. */
export function denCesky(v: unknown): string {
  const d = pragueDaySafe(v);
  return d ? `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}` : '–';
}

/** Deník bodů, skupiny a poznámky člena — jamka pod řádkem. */
export default function DetailClena({ customerId, oznam, vidiDenik }: { customerId: number; oznam: Hlaska; vidiDenik: boolean }) {
  const money = useMoney();
  const { ma: smi } = useOpravneni();
  // Přehled hosta jen s vernost.zobrazit — bez něj by GET skončil 403 (widget bez oprávnění nevolá).
  const { data: pr } = useLoad<any>(vidiDenik ? `/api/client/admin/loyalty?customerId=${customerId}&detail=1` : null,
    raw => ({ ...raw, osa: casovaOsa({ ledger: raw?.ledger, claims: raw?.claims, vouchers: raw?.vouchers, orders: raw?.orders }, money), kampane: Array.isArray(raw?.kampane) ? raw.kampane : [] }));
  const zbyva = pr?.uroven && pr?.clen ? zbyvaDoUrovne(pr.uroven, pr.uroven.unit === 'spend' ? pr.clen.spend : pr.clen.visits, money) : null;
  const razitka = pr ? zbyvaDoOdmeny(pr.kampane) : [];
  return (
    <Well className="mb-3 space-y-3">
      <SkupinyClena customerId={customerId} oznam={oznam} prazdne={!vidiDenik && !smi('zakaznici.poznamky')} />
      {vidiDenik && <RazitkaClen customerId={customerId} oznam={oznam} />}
      {smi('zakaznici.poznamky') && <PoznamkyClena customerId={customerId} oznam={oznam} />}
      {!vidiDenik ? null
        : pr === null ? <Skeleton className="h-10" />
        : (
          <>
            <div className="space-y-1">
              <p className="text-sm font-medium">{pr.uroven?.label ?? 'Člen'} · {pr.clen.points} b.{pr.clen.credit > 0 ? ` · kredit ${money(pr.clen.credit)}` : ''}</p>
              <p className="t-meta">
                {pr.clen.last_visit_at ? `Naposledy tu byl ${denCesky(pr.clen.last_visit_at)}` : 'Zatím tu nebyl'}
                {` · člen od ${denCesky(pr.clen.joined_at)} · ${czCount(pr.clen.visits, NAVSTEVA)}`}
                {pr.clen.spend > 0 ? ` · celkem ${money(pr.clen.spend)}` : ''}
              </p>
              {zbyva && <p className="t-meta">{zbyva}</p>}
              {razitka.map(r => <p key={r} className="t-meta">{r}</p>)}
            </div>
            {pr.osa.length === 0 ? <p className="t-meta">Zatím žádná historie.</p> : (
              <ul className="list" aria-label="Časová osa hosta">
                {pr.osa.map((u: UdalostOsy, i: number) => (
                  <ListRow key={`${u.druh}-${u.at}-${i}`} title={u.titulek} meta={[dbTimeDayHM(u.at), u.meta].filter(Boolean).join(' · ')}
                    right={<Chip tone="muted" size="sm">{POPISEK_DRUHU[u.druh]}</Chip>} />
                ))}
              </ul>
            )}
          </>
        )}
    </Well>
  );
}

/** Štítky skupin u člena: klepnutím se host do skupiny přidá / odebere. Jen se zakaznici.skupiny. Dynamické skupiny řídí pravidla, ty jsou jen k přečtení. */
function SkupinyClena({ customerId, oznam, prazdne = false }: { customerId: number; oznam: Hlaska; prazdne?: boolean }) {
  const { ma: smi } = useOpravneni();
  const meni = smi('zakaznici.skupiny');
  const [skupiny, setSkupiny] = useState<{ id: number; name: string; color: string | null; dynamic: boolean }[] | null>(null);
  const [moje, setMoje] = useState<number[]>([]);
  const [busy, setBusy] = useState(0);
  const load = useCallback(() => fetch(`/api/client/admin/groups?customerId=${customerId}`).then(okJson)
    .then(d => { setSkupiny(d.groups ?? []); setMoje(d.customerGroupIds ?? []); }).catch(() => setSkupiny([])), [customerId]);
  useEffect(() => { load(); }, [load]);
  // Bez deníku je jamka jen pro skupiny — prázdná by jen zmizela, tak řekne proč.
  if (skupiny === null) return prazdne ? <Skeleton className="h-8" /> : null;
  if (skupiny.length === 0) return prazdne ? <p className="t-meta">Zatím žádné skupiny. Založíš je ve Věrnosti.</p> : null;
  const prepni = async (g: { id: number; name: string }) => {
    const je = moje.includes(g.id);
    setBusy(g.id);
    try {
      await j('/api/client/admin/groups', { method: 'PATCH', body: JSON.stringify({ id: g.id, [je ? 'remove' : 'add']: [customerId] }) });
      setMoje(je ? moje.filter(x => x !== g.id) : [...moje, g.id]);
    } catch (err) { oznam(apiMessage(err, 'Skupinu se nepodařilo změnit.'), 'bad'); }
    setBusy(0);
  };
  return (
    <div>
      <p className="t-label mb-1.5">Skupiny</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {skupiny.map(g => (
          <button key={g.id} type="button" onClick={() => { void prepni(g); }} disabled={!meni || g.dynamic || busy === g.id} aria-pressed={moje.includes(g.id)}
            title={g.dynamic ? 'Dynamická skupina: členy určují pravidla' : undefined}
            className={`filter-pill tap-target-sm ${moje.includes(g.id) ? 'seg-on' : 'seg-off glass'}`}>
            {g.name}{g.dynamic ? ' (auto)' : ''}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Poznamka { id: number; body: string; created_at: string; autor: string | null }

/** Interní poznámky k hostovi. Host je nevidí; zápis i smazání jde do protokolu změn. */
function PoznamkyClena({ customerId, oznam }: { customerId: number; oznam: Hlaska }) {
  const { data: d, error, reload } = useLoad<{ notes: Poznamka[] }>(`/api/client/admin/notes?customerId=${customerId}`,
    raw => ({ notes: Array.isArray(raw?.notes) ? raw.notes : [] }));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const pridej = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      await j('/api/client/admin/notes', { method: 'POST', body: JSON.stringify({ customerId, body: t }) });
      setText(''); reload();
    } catch (err) { oznam(apiMessage(err, 'Poznámku se nepodařilo uložit.'), 'bad'); }
    setBusy(false);
  };
  const smaz = async (n: Poznamka) => {
    try { await j(`/api/client/admin/notes?id=${n.id}`, { method: 'DELETE' }); reload(); }
    catch (err) { oznam(apiMessage(err, 'Poznámku se nepodařilo smazat.'), 'bad'); }
  };
  return (
    <div>
      <p className="t-label mb-1.5">Poznámky pro personál</p>
      {error ? <p className="note note-wait">Poznámky se nenačetly. <button type="button" className="underline" onClick={reload}>Zkusit znovu</button></p>
        : d === null ? <Skeleton className="h-8" />
        : (
          <>
            {d.notes.length === 0 ? <p className="t-meta mb-2">Zatím nic. Host poznámky nevidí.</p> : (
              <ul className="list mb-2" aria-label="Poznámky k hostovi">
                {d.notes.map(n => (
                  <ListRow key={n.id} title={<span className="whitespace-normal break-words font-normal">{n.body}</span>}
                    meta={[dbTimeDayHM(n.created_at), n.autor].filter(Boolean).join(' · ')}
                    actions={<Button size="sm" variant="ghost" icon="trash" aria-label="Smazat poznámku" onClick={() => { void smaz(n); }}>Smazat</Button>} />
                ))}
              </ul>
            )}
            <form onSubmit={pridej} className="flex gap-2 items-end flex-wrap">
              <Textarea aria-label="Nová poznámka" rows={2} maxLength={NOTE_MAX} value={text} onChange={e => setText(e.target.value)}
                placeholder="Třeba: nesnáší mléko, domluvená oslava v pátek" className="flex-1 basis-56" />
              <Button type="submit" size="sm" variant="secondary" icon="plus" loading={busy} disabled={!text.trim()}>Přidat</Button>
            </form>
          </>
        )}
    </div>
  );
}
