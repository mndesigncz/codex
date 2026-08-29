'use client';

// Inventura: count the shelf item by item against the frozen snapshot, then
// let the employer write the differences back in one confirmed step.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icons';
import ShrinkageReport from './ShrinkageReport';

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

export default function StocktakeModal({ isEmployer, onClose, onApplied }: {
  isEmployer: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [open, setOpen] = useState<Take | null>(null);
  const [history, setHistory] = useState<Take[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDone, setConfirmDone] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCounts = useRef<Record<string, number | null>>({});
  const pendingOpens = useRef<Record<string, number | null>>({});

  const load = async () => {
    try {
      const d = await fetch('/api/stocktake').then(r => r.json());
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
      setDoneMsg(`Hotovo — spočítáno ${d.applied ?? 0} položek, zapsáno ${d.diffs ?? 0} rozdílů. ✓`);
    } else {
      const d = res ? await res.json().catch(() => ({})) : {};
      setErr(d.error || 'Dokončení se nepodařilo.');
    }
  };
  const [doneMsg, setDoneMsg] = useState('');
  /** Kterou inventuru rozebírá report — výchozí je poslední. */
  const [selected, setSelected] = useState<number | null>(null);

  const cancel = async () => {
    if (!open || !confirm('Zrušit rozpočítanou inventuru? Napočítané hodnoty se zahodí.')) return;
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

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center modal-overlay p-4" onClick={onClose}>
      <div className="modal-sheet rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="text-lg font-bold tracking-tight text-[#16181A]">📋 Inventura skladu</h3>
          <button onClick={onClose} className="rounded-full w-9 h-9 flex items-center justify-center glass text-black/50 hover:text-black">✕</button>
        </div>

        {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
        {doneMsg && <p className="text-sm text-[#5B7A08] bg-[#C8F542]/10 border border-[#C8F542]/25 rounded-2xl px-4 py-3 mt-3">{doneMsg}</p>}

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-8 w-8 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
          </div>
        ) : !open ? (
          <div className="mt-4 space-y-5">
            <div className="glass-card p-6 text-center space-y-3">
              <p className="text-sm text-black/55">Projdi sklad položku po položce a spočítej skutečné stavy. Rozdíly proti evidenci se po potvrzení zapíšou a uloží do historie položek.</p>
              {isEmployer ? (
                <button onClick={start} disabled={busy}
                  className="rounded-full bg-[#C8F542] text-black font-semibold px-6 py-3 text-sm hover:brightness-110 disabled:opacity-50 transition">
                  {busy ? 'Připravuji…' : 'Zahájit inventuru'}
                </button>
              ) : (
                <p className="text-xs text-black/40">Inventuru zahajuje vedení — pak může počítat kdokoli.</p>
              )}
            </div>
            {isEmployer && history.length > 0 && (
              <ShrinkageReport stocktakeId={selected ?? undefined} />
            )}

            {history.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-2">Minulé inventury</p>
                <div className="space-y-2">
                  {history.map(h => {
                    const counted = h.data.filter(r => r.counted != null || r.countedOpen != null);
                    const diffs = counted.filter(r =>
                      (r.counted != null && r.counted !== r.expected) ||
                      (r.countedOpen != null && r.countedOpen !== (r.expectedOpen ?? 0)));
                    return (
                      <button key={h.id} type="button" onClick={() => setSelected(h.id)}
                        className={`w-full text-left flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm transition ${
                          (selected ?? history[0]?.id) === h.id
                            ? 'bg-[#C8F542]/10 border-[#C8F542]/30'
                            : 'bg-black/[0.03] border-black/[0.06] hover:bg-black/[0.05]'
                        }`}>
                        <span className="font-medium text-[#16181A]">
                          {h.completedAt ? new Date(h.completedAt).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                        </span>
                        <span className="text-black/45">· {counted.length} spočítáno</span>
                        <span className={diffs.length ? 'text-amber-700 font-medium' : 'text-[#5B7A08]'}>
                          · {diffs.length ? `${diffs.length} rozdílů` : 'vše sedělo ✓'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            <div className="sticky top-0 z-10 glass-strong rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[#16181A] tabular-nums">
                {countedN}/{open.data.length} spočítáno
                {diffN > 0 && <span className="text-amber-700"> · {diffN} rozdílů</span>}
              </p>
              <div className="flex gap-2">
                {isEmployer && (
                  <button onClick={cancel} className="rounded-full glass text-black/50 hover:text-red-600 px-3.5 py-2 text-xs font-semibold transition">Zrušit</button>
                )}
                {isEmployer && (
                  confirmDone ? (
                    <button onClick={complete} disabled={busy}
                      className="rounded-full bg-red-500/15 border border-red-500/30 text-red-600 px-4 py-2 text-xs font-bold disabled:opacity-50 transition">
                      {busy ? 'Zapisuji…' : `Opravdu zapsat ${diffN} rozdílů?`}
                    </button>
                  ) : (
                    <button onClick={() => setConfirmDone(true)} disabled={countedN === 0}
                      className="rounded-full bg-[#16181A] text-white px-4 py-2 text-xs font-bold disabled:opacity-40 transition">
                      Dokončit a zapsat
                    </button>
                  )
                )}
              </div>
            </div>

            {grouped.map(([cat, rows]) => (
              <div key={cat}>
                <p className="text-xs font-semibold uppercase tracking-wider text-black/45 mb-1.5">{cat}</p>
                <div className="rounded-2xl border border-black/[0.06] divide-y divide-black/[0.05] overflow-hidden">
                  {rows.map(r => {
                    const diff = r.counted != null ? r.counted - r.expected : null;
                    const pkg = Number(r.packageSize) || 0;
                    const openDiff = r.countedOpen != null ? round3(r.countedOpen - (r.expectedOpen ?? 0)) : null;
                    const touched = r.counted != null || r.countedOpen != null;
                    return (
                      <div key={r.itemId} className={`px-4 py-2.5 ${touched ? 'bg-[#C8F542]/[0.05]' : ''}`}>
                        <div className="flex items-center gap-3">
                          <span className="min-w-0 flex-1 text-sm text-[#16181A] truncate">{r.name}</span>
                          <span className="shrink-0 text-xs text-black/40 tabular-nums whitespace-nowrap">evid. {r.expected} {r.unit}</span>
                          <input
                            type="number" inputMode="numeric" min={0}
                            value={r.counted ?? ''}
                            onChange={e => setCount(r.itemId, e.target.value)}
                            placeholder="—"
                            className="w-20 shrink-0 rounded-xl bg-white/70 border border-black/[0.08] px-3 py-2 text-sm text-right tabular-nums text-[#16181A] placeholder-black/25 focus:border-[#C8F542]/50 focus:outline-none"
                          />
                          <span className={`w-12 shrink-0 text-right text-xs font-semibold tabular-nums ${
                            diff == null ? 'text-black/20' : diff === 0 ? 'text-[#5B7A08]' : 'text-amber-700'
                          }`}>
                            {diff == null ? '' : diff === 0 ? '✓' : diff > 0 ? `+${diff}` : diff}
                          </span>
                        </div>
                        {pkg > 0 && (
                          <div className="flex items-center gap-3 pl-4 mt-1.5">
                            <span className="min-w-0 flex-1 text-[11px] text-black/40 truncate">
                              ↳ zbytek v načatém balení <span className="text-black/25">(z {pkg} {r.contentUnit || 'l'})</span>
                            </span>
                            <span className="shrink-0 text-[11px] text-black/35 tabular-nums whitespace-nowrap">
                              evid. {fmt(r.expectedOpen ?? 0)} {r.contentUnit || ''}
                            </span>
                            <input
                              inputMode="decimal"
                              value={r.countedOpen ?? ''}
                              onChange={e => setOpenAmount(r.itemId, e.target.value)}
                              placeholder="—"
                              className="w-20 shrink-0 rounded-xl bg-white/60 border border-black/[0.07] px-3 py-1.5 text-xs text-right tabular-nums text-[#16181A] placeholder-black/25 focus:border-[#C8F542]/50 focus:outline-none"
                            />
                            <span className={`w-12 shrink-0 text-right text-[11px] font-semibold tabular-nums ${
                              openDiff == null ? 'text-black/20' : openDiff === 0 ? 'text-[#5B7A08]' : 'text-amber-700'
                            }`}>
                              {openDiff == null ? '' : openDiff === 0 ? '✓' : openDiff > 0 ? `+${fmt(openDiff)}` : fmt(openDiff)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
