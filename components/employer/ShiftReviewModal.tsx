'use client';

import { useEffect, useState, useCallback } from 'react';
import { Icon } from '../Icons';
import { useMoney } from '../CurrencyProvider';
import { normalizePoints } from '@/lib/rewardLevels';
import { pragueToday } from '@/lib/pragueTime';
import { czForm } from '@/lib/czech';
import { okJson } from '@/lib/api';
import { Modal, Button, Segmented, Skeleton, Switch, SwitchRow } from '../ui';

export interface ItemMark { points: number; note: string | null; flagged: boolean }
type ItemKind = 'task' | 'procedure' | 'closing';

interface TaskDetail {
  id: number; title: string; description: string | null; priority: string;
  checklist: { text: string; done: boolean }[]; reviewNote: string | null;
  state: 'done' | 'missed'; item: ItemMark | null;
}
interface ProcDetail {
  id: number; name: string; status: string; steps: string[];
  checked: number[]; skipped: number[]; missing: number[];
  done: number; skippedCount: number; total: number;
  durationSeconds: number | null; reviewNote: string | null; item: ItemMark | null;
}
interface ClosingDetail {
  id: number; approved: boolean; shiftLabel: string | null;
  openingCash: number | null; cashRevenue: number | null; cardRevenue: number | null; tips: number | null;
  expenses: number | null; cashRemoved: number | null; selfPayout: number | null; closingCash: number | null;
  customers: number | null; notes: string | null; reviewNote: string | null;
  tipsInDrawer?: boolean | null; expected: number | null; difference: number | null; item: ItemMark | null;
  filedByName?: string | null; date?: string;
}
export interface Summary {
  employee: { id: number; name: string; avatar?: string };
  date: string; hadShift: boolean;
  shift: { startTime: string | null; endTime: string | null; label: string } | null;
  coworkers: { id: number; name: string; avatar?: string | null }[];
  window?: { from: string; to: string; overnight: boolean; days: string[] };
  tasks: TaskDetail[];
  procedures: ProcDetail[];
  closing: ClosingDetail | null;
  review: { rating: number; note: string | null; points: number; autoPoints: number; flagged: boolean; scope: string } | null;
  autoPoints: { total: number; lines: { label: string; points: number }[] };
}

const todayStr = () => pragueToday();
const inputCls = 'field';
const plural = (n: number, one: string, few: string, many: string) => czForm(n, { one, few, many });
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" onClick={() => onChange(i === value ? 0 : i)} aria-label={`${i} z 5`} aria-pressed={i <= value}
          className="tap-target-sm transition active:scale-90">
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

export default function ShiftReviewModal({ employee, initialDate, initialWholeShift, onClose, onSaved }:
  { employee: { id: number; name: string; avatar?: string }; initialDate?: string;
    /** Opened from "ohodnotit celou směnu" — rate everyone who worked it. */
    initialWholeShift?: boolean;
    onClose: () => void; onSaved: () => void }) {
  const money = useMoney();
  const [date, setDate] = useState(initialDate || todayStr());
  const [shiftDates, setShiftDates] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [pts, setPts] = useState(0);
  const [ptsTouched, setPtsTouched] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [wholeShift, setWholeShift] = useState(false);
  const [ratingStar, setRatingStar] = useState(4);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleExpand = (k: string) => setExpanded(e => ({ ...e, [k]: !e[k] }));

  // Rating-star weight for the suggested points.
  useEffect(() => {
    fetch('/api/teams').then(okJson).then(d => {
      const p = normalizePoints(d?.team?.points_config);
      setRatingStar(p.ratingStar);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/shifts?employeeId=${employee.id}`).then(okJson).then(d => {
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
    fetch(`/api/shift-reviews?employeeId=${employee.id}&date=${date}`).then(okJson).then((d: Summary) => {
      // Jen odpověď ve tvaru přehledu směny: jiný tvar (starší server, chyba
      // s kódem 200) by okno shodil na `summary.tasks.filter`.
      if (d && !(d as any).error && Array.isArray(d.tasks) && Array.isArray(d.procedures)) {
        setSummary(d);
        setRating(d.review?.rating ?? 0);
        setNote(d.review?.note ?? '');
        setFlagged(d.review?.flagged ?? false);
        // Two people on one shift shouldn't mean rating it twice — whole-shift
        // is the default, unless an individual review already exists.
        const crew = d.coworkers?.length ?? 0;
        setWholeShift(crew > 0 && (initialWholeShift || (d.review ? d.review.scope === 'shift' : true)));
        if (d.review) { setPts(d.review.points ?? 0); setPtsTouched(true); } else { setPtsTouched(false); }
        setExpanded({});
      }
    }).catch(() => {}).finally(() => setLoadingSummary(false));
  }, [date, employee.id, initialWholeShift]);
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
        const missing: number[] = [];
        for (let i = 0; i < Math.max(p.total, p.steps.length); i++) if (!checked.includes(i) && !skipped.includes(i)) missing.push(i);
        patchItem({ kind: 'procedure', id: procId, checkedItems: checked, skippedItems: skipped });
        return { ...p, checked, skipped, missing, done: checked.length, skippedCount: skipped.length };
      });
      return { ...s, procedures };
    });
  };

  // Per-item points / note / flag — merged into the local copy, then persisted.
  const mergeItem = (kind: ItemKind, id: number, patch: Partial<ItemMark>) => {
    const apply = (cur: ItemMark | null): ItemMark => ({ points: 0, note: null, flagged: false, ...(cur ?? {}), ...patch });
    setSummary(s => {
      if (!s) return s;
      if (kind === 'task') return { ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, item: apply(t.item) } : t) };
      if (kind === 'procedure') return { ...s, procedures: s.procedures.map(p => p.id === id ? { ...p, item: apply(p.item) } : p) };
      if (s.closing && s.closing.id === id) return { ...s, closing: { ...s.closing, item: apply(s.closing.item) } };
      return s;
    });
  };
  const saveItem = (kind: ItemKind, id: number, patch: Partial<ItemMark>) => {
    mergeItem(kind, id, patch);
    patchItem({ kind, id, employeeId: employee.id, date, ...patch });
  };

  const saveRating = async () => {
    setSaving(true); setSaveErr('');
    try {
      const ids = wholeShift ? [employee.id, ...(summary?.coworkers ?? []).map(c => c.id)] : undefined;
      const res = await fetch('/api/shift-reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: employee.id, date, rating, note: note.trim() || null, points: pts, flagged,
          applyToShift: wholeShift, employeeIds: ids,
        }),
      });
      if (res.ok) onSaved();
      else {
        const d = await res.json().catch(() => ({}));
        setSaveErr(d.error || 'Hodnocení se nepodařilo uložit.');
      }
    } catch {
      setSaveErr('Nepodařilo se spojit se serverem.');
    } finally { setSaving(false); }
  };

  const fmtChip = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
  const prioDot = (p: string) => p === 'high' ? 'bg-bad' : p === 'medium' ? 'bg-wait' : 'bg-[#C8F542]';

  // Shared per-item review controls: points stepper + flag + note.
  const itemControls = (kind: ItemKind, id: number, mark: ItemMark | null, legacyNote: string | null) => {
    const value = mark?.points ?? 0;
    const isFlagged = mark?.flagged ?? false;
    const step = (delta: number) => saveItem(kind, id, { points: Math.max(-10, Math.min(10, value + delta)) });
    return (
      <div className="mt-2.5 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center rounded-full bg-black/[0.05] border border-black/[0.07] overflow-hidden">
            <button onClick={() => step(-1)} className="tap-target w-8 h-8 flex items-center justify-center text-black/50 hover:bg-black/[0.06] transition" aria-label="Ubrat bod"><Icon name="minus" size={14} /></button>
            <span className={`min-w-[3rem] text-center text-[13px] font-semibold tabular-nums ${value > 0 ? 'text-[#5B7A08]' : value < 0 ? 'text-bad-ink' : 'text-black/40'}`}>{signed(value)}</span>
            <button onClick={() => step(1)} className="tap-target w-8 h-8 flex items-center justify-center text-black/50 hover:bg-black/[0.06] transition" aria-label="Přidat bod"><Icon name="plus" size={14} /></button>
          </div>
          {/* Přepínač Switch, ne ručně psaná pilulka: dřív měla ~30 px a vlastní tóny (DP §6.2 bod 4).
              Stejný tvar jako celosměnové „Označit směnu k nápravě" níž v okně. */}
          <span className="inline-flex items-center gap-2">
            <Switch checked={isFlagged} onChange={v => saveItem(kind, id, { flagged: v })} labelledBy={`spatne-${kind}-${id}`} />
            <span id={`spatne-${kind}-${id}`} className="t-meta">Něco je špatně</span>
          </span>
        </div>
        <textarea
          defaultValue={mark?.note ?? legacyNote ?? ''} rows={2} placeholder="Poznámka pro zaměstnance…"
          onBlur={e => saveItem(kind, id, { note: e.target.value.trim() || null })}
          className={`${inputCls} !py-2 !text-[13px] resize-none`}
        />
      </div>
    );
  };

  const flagRing = (mark: ItemMark | null) => mark?.flagged ? 'bg-wait/[0.07]' : '';
  const itemBadge = (mark: ItemMark | null) => (
    <>
      {mark?.flagged && <Icon name="warning" size={13} className="text-wait-ink shrink-0" />}
      {!!mark?.points && <span className={`text-[11px] font-bold tabular-nums shrink-0 ${mark.points > 0 ? 'text-[#5B7A08]' : 'text-bad-ink'}`}>{signed(mark.points)}</span>}
    </>
  );

  const doneTasks = summary?.tasks.filter(t => t.state === 'done') ?? [];
  const missedTasks = summary?.tasks.filter(t => t.state === 'missed') ?? [];
  const coworkers = summary?.coworkers ?? [];
  const targetNames = [employee.name, ...coworkers.map(c => c.name)];

  const titulek = wholeShift && coworkers.length > 0
    ? `Hodnotit směnu — ${targetNames.map(n => n.split(' ')[0]).join(' + ')}`
    : `Hodnotit směnu — ${employee.name}`;
  const podtitulek = summary?.shift
    ? `${summary.shift.label}${summary.shift.startTime ? ` · ${summary.shift.startTime}–${summary.shift.endTime ?? ''}` : ''}${summary?.window?.overnight ? ' · přes půlnoc' : ''}`
    : 'Rozklikni položky, oprav odškrtnutí a připiš poznámku.';

  // Společné okno (kolo 68, audit Přehledu vedení): dřív ručně skládané
  // s vlastní šířkou 512 px mimo tři velikosti Modal, s vlastním křížkem
  // a limetkovým „Uložit". Props komponenty zůstávají stejné — okno otevírá
  // widget Ohodnotit směny, Odměny, kalendář hodnocení i profil člověka.
  return (
    <Modal open onClose={onClose} size="md" title={titulek} subtitle={podtitulek}
      footer={<>
        <Button variant="secondary" onClick={onClose} title="Body a poznámky u položek se ukládají průběžně">Hotovo</Button>
        <Button variant="primary" onClick={saveRating} loading={saving}>
          {wholeShift ? `Uložit pro ${targetNames.length} ${plural(targetNames.length, 'člověka', 'lidi', 'lidí')}` : 'Uložit hodnocení'}
        </Button>
      </>}>
        <div className="space-y-5">
          {/* Date picker */}
          <div>
            <label className="field-label">Den směny</label>
            <input type="date" aria-label="Datum směny" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} className={`${inputCls} appearance-none`} style={{ WebkitAppearance: 'none' }} />
            {shiftDates.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {shiftDates.map(d => (
                  <button key={d} type="button" aria-pressed={date === d} onClick={() => setDate(d)} className={`filter-pill tap-target-sm ${date === d ? 'seg-on' : 'seg-off glass'}`}>
                    {fmtChip(d)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Who the verdict covers — first decision, so one shift is one job. */}
          {coworkers.length > 0 && (
            // Bez limetkového panelu a ručního přepínače (DP §3, Segmented):
            // výběr je rozhodnutí, ne upozornění, a limetka patří jen hlavní akci.
            <div>
              <p className="t-label mb-2">Koho hodnotíš</p>
              <Segmented size="sm" ariaLabel="Koho hodnotíš" value={wholeShift ? 'smena' : 'jeden'}
                onChange={v => setWholeShift(v === 'smena')}
                options={[
                  { id: 'smena', label: `Celou směnu (${targetNames.length} ${plural(targetNames.length, 'člověk', 'lidé', 'lidí')})` },
                  { id: 'jeden', label: `Jen ${employee.name.split(' ')[0]}` },
                ]} />
              <p className="text-xs text-black/50 mt-2">
                {wholeShift
                  ? `Hvězdičky, poznámka i body se uloží všem: ${targetNames.join(', ')}. Automatické body se počítají každému zvlášť podle toho, co odvedl.`
                  : `Uloží se jen pro ${employee.name}. Na směně byl/a ještě: ${coworkers.map(c => c.name).join(', ')}.`}
              </p>
            </div>
          )}

          {loadingSummary ? (
            <Skeleton className="h-40 rounded-3xl" />
          ) : summary && (
            <div className="space-y-3">
              {/* Closing */}
              <div className={`rounded-2xl border overflow-hidden ${summary.closing?.item?.flagged ? 'border-wait/40' : 'border-black/[0.06]'}`}>
                <button onClick={() => summary.closing && toggleExpand('closing')} className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left">
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full shrink-0 ${summary.closing ? 'bg-[#C8F542]/25 text-[#5B7A08]' : 'bg-bad/15 text-bad-ink'}`}>
                    <Icon name={summary.closing ? 'check' : 'warning'} size={14} />
                  </span>
                  <span className="flex-1 min-w-0 text-sm text-[#16181A]">
                    {summary.closing
                      ? <>Uzávěrka hotová{summary.closing.filedByName ? ` · vyplnil/a ${summary.closing.filedByName}` : ''}{summary.closing.approved ? '' : ' · čeká na schválení'}</>
                      : 'Uzávěrka nevyplněna'}
                  </span>
                  {summary.closing && itemBadge(summary.closing.item)}
                  {summary.closing && chev(!!expanded['closing'])}
                </button>
                {summary.closing && expanded['closing'] && (
                  <div className={`px-3.5 pb-3.5 pt-0.5 border-t border-black/[0.05] ${flagRing(summary.closing.item) || 'bg-black/[0.015]'}`}>
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
                    {summary.closing.expected != null && summary.closing.difference != null && (
                      <div className="mt-2.5 flex items-center justify-between gap-2 well rounded-xl px-3 py-2 text-[13px]">
                        <span className="text-black/50">Očekávaná kasa {money(summary.closing.expected)}</span>
                        <span className={`font-semibold tabular-nums ${summary.closing.difference === 0 ? 'text-[#5B7A08]' : summary.closing.difference > 0 ? 'text-wait-ink' : 'text-bad-ink'}`}>
                          {summary.closing.difference === 0 ? 'sedí' : `${summary.closing.difference > 0 ? 'přebytek' : 'manko'} ${money(Math.abs(summary.closing.difference))}`}
                        </span>
                      </div>
                    )}
                    {summary.closing.notes && <p className="mt-2.5 text-[13px] text-black/60"><span className="text-black/40">Poznámka zaměstnance:</span> {summary.closing.notes}</p>}
                    {itemControls('closing', summary.closing.id, summary.closing.item, summary.closing.reviewNote)}
                  </div>
                )}
              </div>

              {/* Tasks */}
              <div className="rounded-2xl border border-black/[0.06] overflow-hidden">
                <div className="flex items-center gap-2.5 px-3.5 py-3">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#C8F542]/20 text-[#5B7A08] shrink-0"><Icon name="check" size={14} /></span>
                  <span className="flex-1 text-sm text-[#16181A]">
                    {doneTasks.length} {plural(doneTasks.length, 'splněný úkol', 'splněné úkoly', 'splněných úkolů')}
                    {missedTasks.length > 0 && <span className="text-bad-ink"> · {missedTasks.length} {plural(missedTasks.length, 'nesplněný', 'nesplněné', 'nesplněných')}</span>}
                  </span>
                </div>
                {summary.tasks.length > 0 && (
                  <div className="border-t border-black/[0.05] divide-y divide-black/[0.05]">
                    {summary.tasks.map(t => {
                      const key = `task-${t.id}`;
                      const missed = t.state === 'missed';
                      return (
                        <div key={t.id} className={t.item?.flagged ? 'bg-wait/[0.07]' : ''}>
                          <button onClick={() => toggleExpand(key)} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${prioDot(t.priority)}`} />
                            <span className={`flex-1 min-w-0 text-[13px] truncate ${missed ? 'text-bad-ink' : 'text-[#16181A]'}`}>{t.title}</span>
                            {missed && <span className="rounded-full bg-bad/15 text-bad-ink px-2 py-0.5 text-[11px] font-semibold shrink-0">neuděláno</span>}
                            {itemBadge(t.item)}
                            {(t.item?.note || t.reviewNote) && <Icon name="chat" size={13} className="text-[#5B7A08] shrink-0" />}
                            {t.checklist.length > 0 && <span className="text-[11px] text-black/40 tabular-nums shrink-0">{t.checklist.filter(i => i.done).length}/{t.checklist.length}</span>}
                            {chev(!!expanded[key])}
                          </button>
                          {expanded[key] && (
                            <div className={`px-3.5 pb-3 pt-0.5 ${t.item?.flagged ? '' : 'bg-black/[0.015]'}`}>
                              {t.description && <p className="text-[13px] text-black/55 mt-1.5">{t.description}</p>}
                              {t.checklist.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {t.checklist.map((it, i) => (
                                    <button key={i} onClick={() => toggleTaskCheck(t.id, i)} className="w-full flex items-center gap-2.5 text-left group">
                                      <span className={`w-5 h-5 rounded-xl border flex items-center justify-center shrink-0 transition ${it.done ? 'bg-[#C8F542] border-[#C8F542] text-black' : 'border-black/20 group-hover:border-[#C8F542]/60'}`}>
                                        {it.done && <span className="text-[11px] font-bold"><Icon name="check" size={15} /></span>}
                                      </span>
                                      <span className={`text-[13px] ${it.done ? 'text-black/45 line-through' : 'text-[#16181A]'}`}>{it.text}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              {itemControls('task', t.id, t.item, t.reviewNote)}
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
                  <span className="flex-1 text-sm text-[#16181A]">{summary.procedures.length} {plural(summary.procedures.length, 'postup', 'postupy', 'postupů')}</span>
                </div>
                {summary.procedures.length > 0 && (
                  <div className="border-t border-black/[0.05] divide-y divide-black/[0.05]">
                    {summary.procedures.map(p => {
                      const key = `proc-${p.id}`;
                      const count = Math.max(p.total, p.steps.length);
                      return (
                        <div key={p.id} className={p.item?.flagged ? 'bg-wait/[0.07]' : ''}>
                          <button onClick={() => toggleExpand(key)} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left">
                            <span className="flex-1 min-w-0 text-[13px] text-[#16181A] truncate">{p.name}</span>
                            {itemBadge(p.item)}
                            {(p.item?.note || p.reviewNote) && <Icon name="chat" size={13} className="text-[#5B7A08] shrink-0" />}
                            <span className="text-[11px] tabular-nums shrink-0 text-[#5B7A08]">{p.done}/{count}</span>
                            {p.skippedCount > 0 && <span className="text-[11px] text-wait-ink shrink-0" title="Přeskočené kroky">{p.skippedCount} přeskočeno</span>}
                            {p.missing.length > 0 && <span className="text-[11px] text-bad-ink shrink-0">{p.missing.length}<Icon name="close" size={10} className="inline -mt-0.5" /></span>}
                            {chev(!!expanded[key])}
                          </button>
                          {expanded[key] && (
                            <div className={`px-3.5 pb-3 pt-0.5 ${p.item?.flagged ? '' : 'bg-black/[0.015]'}`}>
                              {p.status !== 'completed' && <p className="text-[11px] text-wait-ink mt-1.5">Postup nebyl dokončen.</p>}
                              {p.missing.length > 0 && <p className="text-[11px] text-bad-ink mt-1.5">{p.missing.length} {plural(p.missing.length, 'krok', 'kroky', 'kroků')} vůbec neudělali.</p>}
                              <div className="mt-2 space-y-1">
                                {Array.from({ length: count }).map((_, i) => {
                                  const checked = p.checked.includes(i);
                                  const skipped = p.skipped.includes(i);
                                  return (
                                    <button key={i} onClick={() => toggleProcStep(p.id, i)} className="w-full flex items-center gap-2.5 text-left group">
                                      <span className={`w-5 h-5 rounded-xl border flex items-center justify-center shrink-0 transition ${checked ? 'bg-[#C8F542] border-[#C8F542] text-black' : skipped ? 'bg-wait/80 border-wait text-white' : 'border-bad/40 group-hover:border-[#C8F542]/60'}`}>
                                        {checked ? <span className="text-[11px] font-bold"><Icon name="check" size={15} /></span> : skipped ? <Icon name="chevronRight" size={13} /> : null}
                                      </span>
                                      <span className={`text-[13px] ${checked ? 'text-black/45 line-through' : skipped ? 'text-wait-ink' : 'text-bad-ink'}`}>{p.steps[i] ?? `Krok ${i + 1}`}</span>
                                      {!checked && !skipped && <span className="text-[11px] text-bad-ink shrink-0">neuděláno</span>}
                                    </button>
                                  );
                                })}
                              </div>
                              {itemControls('procedure', p.id, p.item, p.reviewNote)}
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

              {/* Automatic points */}
              {summary.autoPoints.lines.length > 0 && (
                <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] p-3.5">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name="bulb" size={14} className="text-black/45" />
                    <span className="t-label">Automatické body</span>
                    <span className={`ml-auto text-sm font-bold tabular-nums ${summary.autoPoints.total > 0 ? 'text-[#5B7A08]' : summary.autoPoints.total < 0 ? 'text-bad-ink' : 'text-black/40'}`}>{signed(summary.autoPoints.total)}</span>
                  </div>
                  <div className="space-y-1">
                    {summary.autoPoints.lines.map((l, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="text-black/55">{l.label}</span>
                        <span className={`font-medium tabular-nums ${l.points > 0 ? 'text-[#5B7A08]' : 'text-bad-ink'}`}>{signed(l.points)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-black/40 mt-2">Připočítají se automaticky k bodům níže.</p>
                </div>
              )}
            </div>
          )}

          {/* Rating */}
          <div className="space-y-3 pt-1">
            <div>
              <label className="field-label">Celkové hodnocení směny</label>
              <StarPicker value={rating} onChange={setRating} />
            </div>
            <div>
              <label className="field-label">Zpětná vazba (uvidí zaměstnanec)</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Co bylo super, co příště zlepšit…" className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className="field-label">Body za směnu</label>
              <div className="flex items-center gap-2 flex-wrap">
                <input type="number" inputMode="numeric" value={pts} onChange={e => { setPtsTouched(true); setPts(parseInt(e.target.value) || 0); }} className={`${inputCls} !py-2.5 max-w-[130px] tabular-nums`} />
                <span className="text-xs text-black/45">bodů {!ptsTouched && rating > 0 && '(návrh z hvězd)'}</span>
                {summary && summary.autoPoints.total !== 0 && (
                  <span className="text-xs text-black/45 tabular-nums">· celkem s automatickými: <strong className="text-[#16181A]">{signed(pts + summary.autoPoints.total)}</strong></span>
                )}
              </div>
            </div>
            {/* Kolo 69 (B7): dřív ručně obarvená pilulka — je to zapnuto/vypnuto, tak Switch (DP §3.20). */}
            <SwitchRow as="div" title="Označit směnu k nápravě" checked={flagged} onChange={setFlagged}
              hint="Zaměstnanec uvidí výtku nahoře v Odměnách a potvrdí, že ji četl." />
          </div>
        </div>

        {saveErr && (
          <p role="alert" className="note note-danger mt-5"><Icon name="warning" size={15} className="inline -mt-0.5 mr-1.5 shrink-0" /> {saveErr}</p>
        )}
    </Modal>
  );
}
