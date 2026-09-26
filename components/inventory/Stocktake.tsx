'use client';

// Inventura: count the shelf item by item against the frozen snapshot, then
// let the employer write the differences back in one confirmed step.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icons';
import ShrinkageReport from './ShrinkageReport';
import { okJson } from '@/lib/api';
import { czCount, POLOZKA } from '@/lib/czech';
import { Button, Chip, ListRow, Modal, Skeleton } from '../ui';

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (n: number) => round3(n).toLocaleString('cs-CZ', { maximumFractionDigits: 3 });

type Row = {
  itemId: number; name: string; category: string | null; unit: string;
  expected: number; counted: number | null;
  /** Položky s balením mají ještě načaté balení — to se počítá zvlášť. */
  packageSize?: number | null; contentUnit?: string | null;
  expectedOpen?: number | null; countedOpen?: number | null;
  unitCost?: number | null;
};
type Take = { id: number; status: string; data: Row[]; createdAt: string; completedAt: string | null };

/**
 * Tři samostatná oprávnění místo jednoho „isEmployer" (kolo 69): server
 * zahájení a zrušení pouští s `inventura.spravovat`, zápis rozdílů s
 * `inventura.dokoncit` a report ztrát s `finance.ztraty`. Vlastní role může
 * mít jen některé z nich — jeden příznak pro všechno jí buď schoval tlačítko,
 * na které má právo, nebo ukázal takové, které server odmítne.
 */
export default function StocktakeModal({ smiZahajit, smiDokoncit, smiZtraty, onClose, onApplied }: {
  /** inventura.spravovat — zahájit a zrušit inventuru. */
  smiZahajit: boolean;
  /** inventura.dokoncit — zapsat rozdíly do skladu. */
  smiDokoncit: boolean;
  /** finance.ztraty — report ztrát z minulých inventur. */
  smiZtraty: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [open, setOpen] = useState<Take | null>(null);
  const [history, setHistory] = useState<Take[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDone, setConfirmDone] = useState(false);
  // Zrušení inventury se potvrzuje v okně (dřív confirm()).
  const [confirmCancel, setConfirmCancel] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCounts = useRef<Record<string, number | null>>({});
  const pendingOpens = useRef<Record<string, number | null>>({});

  const load = async () => {
    try {
      const d = await fetch('/api/stocktake').then(okJson);
      setOpen(d.open ?? null);
      setHistory(Array.isArray(d.history) ? d.history : []);
      if (d.notMigrated) setErr('Inventura bude dostupná po dokončení migrace (/api/init).');
    } catch { setErr('Inventuru se nepodařilo načíst.'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const start = async () => {
    setBusy(true); setErr('');
    const res = await fetch('/api/stocktake', { method: 'POST' }).catch(() => null);
    setBusy(false);
    if (res?.ok) { const d = await res.json(); setOpen(d.open); }
    else { const d = res ? await res.json().catch(() => ({})) : {}; setErr(d.error || 'Inventuru se nepodařilo zahájit.'); }
  };

  // Debounced batched save — counting is rapid-fire typing on a tablet.
  const flush = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const counts = pendingCounts.current;
      const opens = pendingOpens.current;
      pendingCounts.current = {};
      pendingOpens.current = {};
      const res = await fetch('/api/stocktake', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: open!.id, counts, opens }),
      }).catch(() => null);
      if (!res?.ok) setErr('Počty se neuložily — zkontroluj připojení.');
      else setErr('');
    }, 600);
  };

  const setCount = (itemId: number, raw: string) => {
    if (!open) return;
    const counted = raw === '' ? null : Math.max(0, Math.round(Number(raw) || 0));
    setOpen(o => o && { ...o, data: o.data.map(r => r.itemId === itemId ? { ...r, counted } : r) });
    pendingCounts.current[String(itemId)] = counted;
    flush();
  };

  /** Zbytek v načatém balení — 0,68 l zůstane 0,68 l. */
  const setOpenAmount = (itemId: number, raw: string) => {
    if (!open) return;
    const v = raw.replace(',', '.');
    const countedOpen = v === '' ? null : Math.max(0, Math.round((Number(v) || 0) * 1000) / 1000);
    setOpen(o => o && { ...o, data: o.data.map(r => r.itemId === itemId ? { ...r, countedOpen } : r) });
    pendingOpens.current[String(itemId)] = countedOpen;
    flush();
  };

  const complete = async () => {
    if (!open) return;
    setBusy(true); setErr('');
    // flush pending counts along with completion
    const res = await fetch('/api/stocktake', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: open.id, counts: pendingCounts.current, opens: pendingOpens.current, complete: true }),
    }).catch(() => null);
    pendingCounts.current = {};
    pendingOpens.current = {};
    setBusy(false); setConfirmDone(false);
    if (res?.ok) {
      const d = await res.json().catch(() => ({}));
      setOpen(null);
      await load();
      onApplied();
      setErr('');
      setDoneMsg(`Hotovo — spočítáno: ${czCount(d.applied ?? 0, POLOZKA)}, zapsáno: ${czCount(d.diffs ?? 0, { one: 'rozdíl', few: 'rozdíly', many: 'rozdílů' })}.`);
    } else {
      const d = res ? await res.json().catch(() => ({})) : {};
      setErr(d.error || 'Dokončení se nepodařilo.');
    }
  };
  const [doneMsg, setDoneMsg] = useState('');
  /** Kterou inventuru rozebírá report — výchozí je poslední. */
  const [selected, setSelected] = useState<number | null>(null);

  const cancel = async () => {
    if (!open) return;
    setConfirmCancel(false);
    const res = await fetch('/api/stocktake', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: open.id, cancel: true }),
    }).catch(() => null);
    if (res?.ok) setOpen(null);
  };

  const grouped = useMemo(() => {
    if (!open) return [] as [string, Row[]][];
    const map = new Map<string, Row[]>();
    open.data.forEach(r => {
      const k = r.category ?? 'Bez kategorie';
      (map.get(k) ?? map.set(k, []).get(k)!).push(r);
    });
    return Array.from(map.entries());
  }, [open]);

  const countedN = open ? open.data.filter(r => r.counted != null || r.countedOpen != null).length : 0;
  const diffN = open ? open.data.filter(r =>
    (r.counted != null && r.counted !== r.expected) ||
    (r.countedOpen != null && r.countedOpen !== (r.expectedOpen ?? 0))).length : 0;

  const plural = (n: number) => czCount(n, { one: 'rozdíl', few: 'rozdíly', many: 'rozdílů' });

  // Jedno okno z ui (DP §3.10) místo ručního překryvu; úvod bez karty v okně,
  // „Zahájit" je potvrzení v okně = primary, ne limetka.
  return (
    <Modal open onClose={onClose} size="lg" title="Inventura skladu"
      subtitle={open ? `Zahájena ${new Date(open.createdAt).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' })}` : 'Spočítat skutečné stavy a zapsat rozdíly.'}>
      <div className="space-y-4">
        {err && <p className="note note-danger" role="alert">{err}</p>}
        {doneMsg && <p className="note note-ok" role="status">{doneMsg}</p>}

        {loading ? (
          <div className="space-y-2" aria-busy>
            <Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10 w-2/3" />
          </div>
        ) : !open ? (
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="t-meta">Projdi sklad položku po položce a spočítej skutečné stavy. Rozdíly proti evidenci se po potvrzení zapíšou a uloží do historie položek.</p>
              {smiZahajit ? (
                <Button variant="primary" icon="clipboard" onClick={start} loading={busy}>Zahájit inventuru</Button>
              ) : (
                <p className="t-meta">Inventuru zahajuje vedení — pak může počítat kdokoli.</p>
              )}
            </div>
            {smiZtraty && history.length > 0 && (
              <ShrinkageReport stocktakeId={selected ?? undefined} />
            )}

            {history.length > 0 && (
              <section aria-labelledby="inventura-historie">
                <p id="inventura-historie" className="t-label">Minulé inventury</p>
                <ul className="list mt-1">
                  {history.map(h => {
                    const counted = h.data.filter(r => r.counted != null || r.countedOpen != null);
                    const diffs = counted.filter(r =>
                      (r.counted != null && r.counted !== r.expected) ||
                      (r.countedOpen != null && r.countedOpen !== (r.expectedOpen ?? 0)));
                    const vybrana = (selected ?? history[0]?.id) === h.id;
                    return (
                      <li key={h.id} className={vybrana ? 'bg-black/[0.04] rounded-xl' : ''}>
                        <ListRow as="div"
                          title={h.completedAt ? new Date(h.completedAt).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                          meta={`${counted.length} spočítáno`}
                          right={<Chip tone={diffs.length ? 'wait' : 'ok'} size="sm">{diffs.length ? plural(diffs.length) : 'vše sedělo'}</Chip>}
                          onClick={() => setSelected(h.id)} />
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="sticky top-0 z-10 glass-strong rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[#16181A] tabular-nums" aria-live="polite">
                {countedN}/{open.data.length} spočítáno
                {diffN > 0 && <span className="text-wait-ink"> · {plural(diffN)}</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                {smiZahajit && (
                  confirmCancel ? (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => setConfirmCancel(false)}>Nechat běžet</Button>
                      <Button variant="danger-solid" size="sm" onClick={cancel}>Zahodit napočítané</Button>
                    </>
                  ) : (
                    <Button variant="danger" size="sm" onClick={() => { setConfirmDone(false); setConfirmCancel(true); }}>Zrušit inventuru</Button>
                  )
                )}
                {smiDokoncit && !confirmCancel && (
                  confirmDone ? (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => setConfirmDone(false)}>Ještě ne</Button>
                      <Button variant="danger-solid" size="sm" loading={busy} onClick={complete}>
                        {diffN > 0 ? `Zapsat ${plural(diffN)}` : 'Zapsat'}
                      </Button>
                    </>
                  ) : (
                    <Button variant="primary" size="sm" disabled={countedN === 0} onClick={() => setConfirmDone(true)}>
                      Dokončit a zapsat
                    </Button>
                  )
                )}
              </div>
            </div>

            {grouped.map(([cat, rows]) => (
              <section key={cat} aria-label={cat}>
                <p className="t-label">{cat}</p>
                <ul className="list mt-1">
                  {rows.map(r => {
                    const diff = r.counted != null ? r.counted - r.expected : null;
                    const pkg = Number(r.packageSize) || 0;
                    const openDiff = r.countedOpen != null ? round3(r.countedOpen - (r.expectedOpen ?? 0)) : null;
                    return (
                      <li key={r.itemId} className="py-2.5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="w-full sm:w-auto sm:flex-1 min-w-0 text-sm text-[#16181A] truncate">{r.name}</span>
                          <span className="sm:hidden flex-1" />
                          <span className="shrink-0 text-xs text-black/55 tabular-nums whitespace-nowrap">evid. {r.expected} {r.unit}</span>
                          <input
                            type="number" inputMode="numeric" min={0}
                            aria-label={`Spočítáno — ${r.name} (${r.unit})`}
                            value={r.counted ?? ''}
                            onChange={e => setCount(r.itemId, e.target.value)}
                            placeholder="—"
                            className="field !w-20 shrink-0 text-right tabular-nums"
                          />
                          <Rozdil n={diff} text={diff == null ? '' : diff > 0 ? `+${diff}` : String(diff)} />
                        </div>
                        {pkg > 0 && (
                          <div className="flex items-center gap-3 pl-4 mt-1.5">
                            <span className="min-w-0 flex-1 text-xs text-black/55 truncate">
                              Zbytek v načatém balení
                              <span className="hidden sm:inline"> (z {pkg} {r.contentUnit || 'l'})</span>
                            </span>
                            <span className="shrink-0 text-xs text-black/55 tabular-nums whitespace-nowrap">
                              evid. {fmt(r.expectedOpen ?? 0)} {r.contentUnit || ''}
                            </span>
                            <input
                              inputMode="decimal"
                              aria-label={`Zbytek v načatém — ${r.name}`}
                              value={r.countedOpen ?? ''}
                              onChange={e => setOpenAmount(r.itemId, e.target.value)}
                              placeholder="—"
                              className="field !w-20 shrink-0 text-right tabular-nums"
                            />
                            <Rozdil n={openDiff} text={openDiff == null ? '' : openDiff > 0 ? `+${fmt(openDiff)}` : fmt(openDiff)} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Rozdíl proti evidenci: sedí = ikona fajfky (dřív znak ✓), jinak číslo. */
function Rozdil({ n, text }: { n: number | null; text: string }) {
  return (
    <span className={`w-12 shrink-0 flex justify-end text-xs font-semibold tabular-nums ${n === 0 ? 'text-ok-ink' : 'text-wait-ink'}`}>
      {n == null ? null : n === 0 ? <><Icon name="check" size={14} /><span className="sr-only">sedí</span></> : text}
    </span>
  );
}
