'use client';

import { useEffect, useState, useCallback } from 'react';
import { Icon } from '../Icons';
import { useMoney } from '../CurrencyProvider';
import { normalizePoints } from '@/lib/rewardLevels';

interface TaskDetail { id: number; title: string; description: string | null; priority: string; checklist: { text: string; done: boolean }[]; reviewNote: string | null; }
interface ProcDetail { id: number; name: string; status: string; steps: string[]; checked: number[]; skipped: number[]; done: number; skippedCount: number; total: number; durationSeconds: number | null; reviewNote: string | null; }
interface ClosingDetail {
  id: number; approved: boolean; shiftLabel: string | null;
  openingCash: number | null; cashRevenue: number | null; cardRevenue: number | null; tips: number | null;
  expenses: number | null; cashRemoved: number | null; selfPayout: number | null; closingCash: number | null;
  customers: number | null; notes: string | null; reviewNote: string | null;
}
export interface Summary {
  employee: { id: number; name: string; avatar?: string };
  date: string; hadShift: boolean;
  tasks: TaskDetail[];
  procedures: ProcDetail[];
  closing: ClosingDetail | null;
  review: { rating: number; note: string | null; points: number } | null;
}

const todayStr = () => new Date().toISOString().split('T')[0];
const inputCls = 'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" onClick={() => onChange(i === value ? 0 : i)} className="transition active:scale-90">
          <svg width="30" height="30" viewBox="0 0 24 24" fill={i <= value ? '#C8F542' : 'none'} stroke={i <= value ? '#8FB811' : 'currentColor'} strokeWidth="1.5" className={i <= value ? '' : 'text-black/25 hover:text-black/40'}>
            <path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9 6.7 19.2l1-5.8-4.2-4.1 5.9-.9L12 3Z" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
    </div>
  );
}

const chev = (open: boolean) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? 'rotate-90' : ''} text-black/35`}><path d="m9 6 6 6-6 6" /></svg>
);

export default function ShiftReviewModal({ employee, initialDate, onClose, onSaved }:
  { employee: { id: number; name: string; avatar?: string }; initialDate?: string; onClose: () => void; onSaved: () => void }) {
  const money = useMoney();
  const [date, setDate] = useState(initialDate || todayStr());
  const [shiftDates, setShiftDates] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [pts, setPts] = useState(0);
  const [ptsTouched, setPtsTouched] = useState(false);
  const [ratingStar, setRatingStar] = useState(4);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleExpand = (k: string) => setExpanded(e => ({ ...e, [k]: !e[k] }));

  // Rating-star weight for the suggested points.
  useEffect(() => {
    fetch('/api/teams').then(r => r.json()).then(d => {
      const p = normalizePoints(d?.team?.points_config);
      setRatingStar(p.ratingStar);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/shifts?employeeId=${employee.id}`).then(r => r.json()).then(d => {
      const arr = Array.isArray(d?.shifts) ? d.shifts : Array.isArray(d) ? d : [];
      const today = todayStr();
      const dates = Array.from(new Set(arr.map((s: any) => s.date).filter((x: string) => x && x <= today)))
        .sort((a, b) => String(b).localeCompare(String(a))).slice(0, 8) as string[];
      setShiftDates(dates);
    }).catch(() => {});
  }, [employee.id]);

  const loadSummary = useCallback(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setLoadingSummary(true);
    fetch(`/api/shift-reviews?employeeId=${employee.id}&date=${date}`).then(r => r.json()).then((d: Summary) => {
      if (d && !(d as any).error) {
        setSummary(d);
        setRating(d.review?.rating ?? 0);
        setNote(d.review?.note ?? '');
        if (d.review) { setPts(d.review.points ?? 0); setPtsTouched(true); } else { setPtsTouched(false); }
        setExpanded({});
      }
    }).catch(() => {}).finally(() => setLoadingSummary(false));
  }, [date, employee.id]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  useEffect(() => { if (!ptsTouched) setPts(rating * ratingStar); }, [rating, ptsTouched, ratingStar]);

  // ---- Item mutations (optimistic + persist) ----
  const patchItem = (body: any) => fetch('/api/shift-reviews', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).catch(() => {});

  const toggleTaskCheck = (taskId: number, idx: number) => {
    setSummary(s => {
      if (!s) return s;
      const tasks = s.tasks.map(t => {
        if (t.id !== taskId) return t;
        const checklist = t.checklist.map((it, i) => i === idx ? { ...it, done: !it.done } : it);
        patchItem({ kind: 'task', id: taskId, checklist });
        return { ...t, checklist };
      });
      return { ...s, tasks };
    });
  };

  const toggleProcStep = (procId: number, idx: number) => {
    setSummary(s => {
      if (!s) return s;
      const procedures = s.procedures.map(p => {
        if (p.id !== procId) return p;
        const isChecked = p.checked.includes(idx);
        const checked = isChecked ? p.checked.filter(i => i !== idx) : [...p.checked, idx].sort((a, b) => a - b);
        const skipped = isChecked ? p.skipped : p.skipped.filter(i => i !== idx);
        patchItem({ kind: 'procedure', id: procId, checkedItems: checked, skippedItems: skipped });
        return { ...p, checked, skipped, done: checked.length, skippedCount: skipped.length };
      });
      return { ...s, procedures };
    });
  };

  const saveItemNote = (kind: 'task' | 'procedure' | 'closing', id: number, value: string) => {
    patchItem({ kind, id, note: value.trim() || null });
  };
  const setItemNoteLocal = (kind: 'task' | 'procedure' | 'closing', id: number, value: string) => {
    setSummary(s => {
      if (!s) return s;
      if (kind === 'task') return { ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, reviewNote: value } : t) };
      if (kind === 'procedure') return { ...s, procedures: s.procedures.map(p => p.id === id ? { ...p, reviewNote: value } : p) };
      if (kind === 'closing' && s.closing && s.closing.id === id) return { ...s, closing: { ...s.closing, reviewNote: value } };
      return s;
    });
  };

  const saveRating = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/shift-reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: employee.id, date, rating, note: note.trim() || null, points: pts }),
      });
      if (res.ok) onSaved();
    } finally { setSaving(false); }
  };

  const fmtChip = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
  const prioDot = (p: string) => p === 'high' ? 'bg-red-500' : p === 'medium' ? 'bg-orange-400' : 'bg-[#C8F542]';
  const noteBox = (kind: 'task' | 'procedure' | 'closing', id: number, value: string | null) => (
    <textarea
      defaultValue={value ?? ''} rows={2} placeholder="Poznámka pro zaměstnance…"
      onChange={e => setItemNoteLocal(kind, id, e.target.value)}
      onBlur={e => saveItemNote(kind, id, e.target.value)}
      className={`${inputCls} !py-2 !text-[13px] resize-none mt-2`}
    />
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center modal-overlay p-0 sm:p-4" onClick={onClose}>
      <div className="modal-sheet rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-white/85 backdrop-blur border-b border-black/[0.06]">
          <span className="text-xl flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-black/10 bg-white/60">{employee.avatar || '👤'}</span>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold tracking-tight text-[#16181A] truncate">Hodnotit směnu — {employee.name}</h3>
            <p className="text-xs text-black/45">Rozklikni položky, oprav odškrtnutí a připiš poznámku.</p>
          </div>
          <button onClick={onClose} className="rounded-full w-8 h-8 flex items-center justify-center text-black/45 hover:bg-black/[0.06]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Date picker */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Den směny</label>
            <input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} className={`${inputCls} appearance-none`} style={{ WebkitAppearance: 'none' }} />
            {shiftDates.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {shiftDates.map(d => (
                  <button key={d} onClick={() => setDate(d)} className={`rounded-full px-3 py-1 text-xs font-medium transition ${date === d ? 'bg-[#16181A] text-white' : 'bg-black/[0.05] text-black/55 hover:bg-black/[0.09]'}`}>
                    {fmtChip(d)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {loadingSummary ? (
            <div className="glass-card h-40 animate-pulse" />
          ) : summary && (
            <div className="space-y-3">
              {/* Closing */}
              <div className="rounded-2xl border border-black/[0.06] overflow-hidden">
                <button onClick={() => summary.closing && toggleExpand('closing')} className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left">
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full shrink-0 ${summary.closing ? 'bg-[#C8F542]/25 text-[#5B7A08]' : 'bg-red-500/12 text-red-600'}`}>
                    <Icon name={summary.closing ? 'check' : 'warning'} size={14} />
                  </span>
                  <span className="flex-1 min-w-0 text-sm text-[#16181A]">
                    {summary.closing ? <>Uzávěrka hotová{summary.closing.approved ? '' : ' · čeká na schválení'}</> : 'Uzávěrka nevyplněna'}
                  </span>
                  {summary.closing && chev(!!expanded['closing'])}
                </button>
                {summary.closing && expanded['closing'] && (
                  <div className="px-3.5 pb-3.5 pt-0.5 border-t border-black/[0.05] bg-black/[0.015]">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2.5 text-[13px]">
                      {([
                        ['Tržba hotovost', summary.closing.cashRevenue], ['Tržba karta', summary.closing.cardRevenue],
                        ['Spropitné', summary.closing.tips], ['Výdaje', summary.closing.expenses],
                        ['Kasa na konci', summary.closing.closingCash], ['Zákazníků', summary.closing.customers],
                      ] as [string, number | null][]).filter(([, v]) => v != null).map(([label, v]) => (
                        <div key={label} className="flex items-center justify-between gap-2">
                          <span className="text-black/50">{label}</span>
                          <span className="font-medium text-[#16181A] tabular-nums">{label === 'Zákazníků' ? v : money(Number(v))}</span>
                        </div>
                      ))}
                    </div>
                    {summary.closing.notes && <p className="mt-2.5 text-[13px] text-black/60"><span className="text-black/40">Poznámka zaměstnance:</span> {summary.closing.notes}</p>}
                    {noteBox('closing', summary.closing.id, summary.closing.reviewNote)}
                  </div>
                )}
              </div>

              {/* Tasks */}
              <div className="rounded-2xl border border-black/[0.06] overflow-hidden">
                <div className="flex items-center gap-2.5 px-3.5 py-3">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#C8F542]/20 text-[#5B7A08] shrink-0"><Icon name="check" size={14} /></span>
                  <span className="flex-1 text-sm text-[#16181A]">{summary.tasks.length} {summary.tasks.length === 1 ? 'splněný úkol' : summary.tasks.length >= 2 && summary.tasks.length <= 4 ? 'splněné úkoly' : 'splněných úkolů'}</span>
                </div>
                {summary.tasks.length > 0 && (
                  <div className="border-t border-black/[0.05] divide-y divide-black/[0.05]">
                    {summary.tasks.map(t => {
                      const key = `task-${t.id}`;
                      const hasDetail = (t.checklist?.length ?? 0) > 0 || t.description || true;
                      return (
                        <div key={t.id}>
                          <button onClick={() => hasDetail && toggleExpand(key)} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${prioDot(t.priority)}`} />
                            <span className="flex-1 min-w-0 text-[13px] text-[#16181A] truncate">{t.title}</span>
                            {t.reviewNote && <Icon name="chat" size={13} className="text-[#5B7A08] shrink-0" />}
                            {t.checklist.length > 0 && <span className="text-[10px] text-black/40 tabular-nums shrink-0">{t.checklist.filter(i => i.done).length}/{t.checklist.length}</span>}
                            {chev(!!expanded[key])}
                          </button>
                          {expanded[key] && (
                            <div className="px-3.5 pb-3 pt-0.5 bg-black/[0.015]">
                              {t.description && <p className="text-[13px] text-black/55 mt-1.5">{t.description}</p>}
                              {t.checklist.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {t.checklist.map((it, i) => (
                                    <button key={i} onClick={() => toggleTaskCheck(t.id, i)} className="w-full flex items-center gap-2.5 text-left group">
                                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${it.done ? 'bg-[#C8F542] border-[#C8F542] text-black' : 'border-black/20 group-hover:border-[#C8F542]/60'}`}>
                                        {it.done && <span className="text-[11px] font-bold">✓</span>}
                                      </span>
                                      <span className={`text-[13px] ${it.done ? 'text-black/45 line-through' : 'text-[#16181A]'}`}>{it.text}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              {noteBox('task', t.id, t.reviewNote)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Procedures */}
              <div className="rounded-2xl border border-black/[0.06] overflow-hidden">
                <div className="flex items-center gap-2.5 px-3.5 py-3">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#C8F542]/20 text-[#5B7A08] shrink-0"><Icon name="clipboard" size={14} /></span>
                  <span className="flex-1 text-sm text-[#16181A]">{summary.procedures.length} {summary.procedures.length === 1 ? 'postup' : summary.procedures.length >= 2 && summary.procedures.length <= 4 ? 'postupy' : 'postupů'}</span>
                </div>
                {summary.procedures.length > 0 && (
                  <div className="border-t border-black/[0.05] divide-y divide-black/[0.05]">
                    {summary.procedures.map(p => {
                      const key = `proc-${p.id}`;
                      const count = Math.max(p.total, p.steps.length);
                      return (
                        <div key={p.id}>
                          <button onClick={() => toggleExpand(key)} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left">
                            <span className="flex-1 min-w-0 text-[13px] text-[#16181A] truncate">{p.name}</span>
                            {p.reviewNote && <Icon name="chat" size={13} className="text-[#5B7A08] shrink-0" />}
                            <span className="text-[10px] tabular-nums shrink-0 text-[#5B7A08]">{p.done}/{count}</span>
                            {p.skippedCount > 0 && <span className="text-[10px] text-amber-600 shrink-0">{p.skippedCount}⤳</span>}
                            {chev(!!expanded[key])}
                          </button>
                          {expanded[key] && (
                            <div className="px-3.5 pb-3 pt-0.5 bg-black/[0.015]">
                              {p.status !== 'completed' && <p className="text-[11px] text-amber-600 mt-1.5">Postup nebyl dokončen.</p>}
                              <div className="mt-2 space-y-1">
                                {Array.from({ length: count }).map((_, i) => {
                                  const checked = p.checked.includes(i);
                                  const skipped = p.skipped.includes(i);
                                  return (
                                    <button key={i} onClick={() => toggleProcStep(p.id, i)} className="w-full flex items-center gap-2.5 text-left group">
                                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${checked ? 'bg-[#C8F542] border-[#C8F542] text-black' : skipped ? 'bg-amber-400/80 border-amber-400 text-white' : 'border-black/20 group-hover:border-[#C8F542]/60'}`}>
                                        {checked ? <span className="text-[11px] font-bold">✓</span> : skipped ? <span className="text-[10px] font-bold">⤳</span> : null}
                                      </span>
                                      <span className={`text-[13px] ${checked ? 'text-black/45 line-through' : skipped ? 'text-amber-700' : 'text-[#16181A]'}`}>{p.steps[i] ?? `Krok ${i + 1}`}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              {noteBox('procedure', p.id, p.reviewNote)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {!summary.hadShift && !summary.closing && summary.tasks.length === 0 && summary.procedures.length === 0 && (
                <p className="text-xs text-black/40 text-center py-1">Pro tento den nemáme žádnou aktivitu ani naplánovanou směnu.</p>
              )}
            </div>
          )}

          {/* Rating */}
          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Celkové hodnocení směny</label>
              <StarPicker value={rating} onChange={setRating} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Zpětná vazba (uvidí zaměstnanec)</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Co bylo super, co příště zlepšit…" className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">Body za směnu</label>
              <div className="flex items-center gap-2">
                <input type="number" value={pts} onChange={e => { setPtsTouched(true); setPts(parseInt(e.target.value) || 0); }} className={`${inputCls} !py-2.5 max-w-[130px] tabular-nums`} />
                <span className="text-xs text-black/45">bodů {!ptsTouched && rating > 0 && '(návrh z hvězd)'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex gap-2 px-5 py-4 bg-white/85 backdrop-blur border-t border-black/[0.06]">
          <button onClick={onClose} className="flex-1 rounded-full glass border border-black/10 text-[#16181A] px-5 py-2.5 text-sm font-medium hover:bg-black/[0.05] transition">Zavřít</button>
          <button onClick={saveRating} disabled={saving} className="flex-1 rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 disabled:opacity-50 transition">
            {saving ? 'Ukládám…' : 'Uložit hodnocení'}
          </button>
        </div>
      </div>
    </div>
  );
}
