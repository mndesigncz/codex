'use client';

import { useEffect, useState, useCallback } from 'react';
import { Icon } from '../Icons';
import ShiftReviewModal from './ShiftReviewModal';
import type { RewardLevel } from '@/lib/rewardLevels';

interface ShiftRow {
  id: number; date: string; startTime: string | null; endTime: string | null; type: string | null;
  reviewed: boolean; rating: number; flagged: boolean; reviewPoints: number;
}
interface Review {
  work_date: string; rating: number; note: string | null; points: number;
  autoPoints?: number; flagged?: boolean; scope?: string;
}
interface FeedbackItem { workDate: string; kind: string; refId: number; label: string; points: number; note: string | null; flagged: boolean; }

interface Profile {
  employee: { id: number; name: string; avatar?: string; email: string | null; phone: string | null; jobTitle: string | null; hourlyRate: number | null };
  standing: { points: number; levelName: string; levelIndex: number; perks: string; next: RewardLevel | null; pctToNext: number; pointsIntoLevel: number; pointsForNext: number };
  levels: RewardLevel[];
  breakdown: { tasks: number; procedures: number; closings: number; reviewPoints: number; autoPoints: number; itemPoints: number; ratedShifts: number; flagged: number };
  shifts: { upcoming: ShiftRow[]; recent: ShiftRow[] };
  reviews: Review[];
  items: FeedbackItem[];
  month: { hoursMs: number; shifts: number; closings: number };
  punctuality?: { checked: number; late: number } | null;
}

const KIND_LABEL: Record<string, string> = { task: 'Úkol', procedure: 'Postup', closing: 'Uzávěrka' };
const fmtDay = (s: string) => new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });
const fmtDayLong = (s: string) => new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long' });

const Stars = ({ n }: { n: number }) => (
  <span className="inline-flex gap-0.5">
    {[1, 2, 3, 4, 5].map(i => (
      <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill={i <= n ? '#C8F542' : 'none'} stroke={i <= n ? '#8FB811' : 'currentColor'} strokeWidth="1.6" className={i <= n ? '' : 'text-black/20'}>
        <path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9 6.7 19.2l1-5.8-4.2-4.1 5.9-.9L12 3Z" strokeLinejoin="round" />
      </svg>
    ))}
  </span>
);

const PointsBadge = ({ n }: { n: number }) => n === 0 ? null : (
  <span className={`text-[11px] font-bold tabular-nums rounded-full px-2 py-0.5 shrink-0 ${n > 0 ? 'bg-[#C8F542]/25 text-[#5B7A08]' : 'bg-red-500/15 text-red-600'}`}>
    {n > 0 ? '+' : ''}{n} b
  </span>
);

export default function EmployeeProfile({ employeeId, onClose }: { employeeId: number; onClose: () => void }) {
  const [p, setP] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'shifts' | 'feedback'>('overview');
  const [rateDate, setRateDate] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/employees/${employeeId}`).then(r => r.json()).then(d => {
      if (d && !d.error) setP(d);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [employeeId]);
  useEffect(() => { load(); }, [load]);

  const hours = p ? Math.floor(p.month.hoursMs / 3600000) : 0;
  const minutes = p ? Math.floor((p.month.hoursMs % 3600000) / 60000) : 0;
  const flaggedItems = p?.items.filter(i => i.flagged) ?? [];

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center modal-overlay p-0 sm:p-4" onClick={onClose}>
      <div className="modal-sheet rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[94vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {loading || !p ? (
          <div className="p-10 flex items-center justify-center">
            <div className="h-9 w-9 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="sticky top-0 z-10 glass-strong border-b border-black/[0.06]">
              <div className="flex items-center gap-3.5 px-5 pt-5 pb-3">
                <span className="text-3xl flex h-14 w-14 items-center justify-center rounded-full ring-1 ring-black/10 bg-white/60 shrink-0">{p.employee.avatar || '👤'}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold tracking-tight text-[#16181A] truncate">{p.employee.name}</h2>
                  <p className="text-sm text-black/50 truncate">
                    {p.employee.jobTitle || 'Zaměstnanec'}
                    {p.employee.hourlyRate ? ` · ${p.employee.hourlyRate} Kč/h` : ''}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#16181A] text-[#C8F542] px-3.5 py-1.5 text-sm font-bold tabular-nums shrink-0">
                  <Icon name="award" size={15} /> {p.standing.points} b
                </span>
                <button onClick={onClose} className="rounded-full w-9 h-9 flex items-center justify-center text-black/45 hover:bg-black/[0.06] shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
              <div className="flex gap-1 px-5 pb-3">
                {([['overview', 'Přehled'], ['shifts', 'Směny'], ['feedback', 'Hodnocení']] as const).map(([v, lbl]) => (
                  <button key={v} onClick={() => setTab(v)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${tab === v ? 'bg-[#16181A] text-white' : 'bg-black/[0.05] text-black/55 hover:text-black'}`}>
                    {lbl}
                    {v === 'feedback' && flaggedItems.length > 0 && <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 text-white text-[11px] px-1">{flaggedItems.length}</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-5 space-y-5">
              {tab === 'overview' && (
                <>
                  {/* Level + progress */}
                  <div className="rounded-2xl bg-black/[0.03] border border-black/[0.05] p-4">
                    <div className="flex items-end justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-black/40 font-semibold">Úroveň</p>
                        <p className="text-2xl font-bold tracking-tight text-[#16181A]">{p.standing.levelName}</p>
                      </div>
                      {p.standing.next && (
                        <p className="text-xs text-black/50 tabular-nums">do <strong className="text-[#16181A]">{p.standing.next.name}</strong> zbývá {Math.max(0, p.standing.pointsForNext - p.standing.pointsIntoLevel)} b</p>
                      )}
                    </div>
                    {p.standing.next && (
                      <div className="mt-2.5 h-2 w-full rounded-full bg-black/[0.06] overflow-hidden">
                        <div className="h-full rounded-full bg-[#C8F542]" style={{ width: `${p.standing.pctToNext}%` }} />
                      </div>
                    )}
                    {p.standing.perks && (
                      <p className="mt-2.5 text-xs text-[#5B7A08] whitespace-pre-line"><strong>Výhody:</strong> {p.standing.perks}</p>
                    )}
                  </div>

                  {/* This month */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-[0.13em] text-black/40 mb-2">Tento měsíc</h3>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="rounded-2xl bg-black/[0.03] p-3 text-center">
                        <p className="text-base sm:text-xl font-bold tracking-tight text-[#16181A] tabular-nums whitespace-nowrap">{hours}<span className="text-xs font-semibold text-black/40"> h </span>{minutes > 0 && <>{minutes}<span className="text-xs font-semibold text-black/40"> m</span></>}</p>
                        <p className="text-[11px] text-black/45 mt-0.5">odpracováno</p>
                      </div>
                      <div className="rounded-2xl bg-black/[0.03] p-3 text-center">
                        <p className="text-xl font-bold tracking-tight text-[#16181A] tabular-nums">{p.month.shifts}</p>
                        <p className="text-[11px] text-black/45 mt-0.5">směn</p>
                      </div>
                      <div className="rounded-2xl bg-black/[0.03] p-3 text-center">
                        <p className="text-xl font-bold tracking-tight text-[#16181A] tabular-nums">{p.month.closings}</p>
                        <p className="text-[11px] text-black/45 mt-0.5">uzávěrek</p>
                      </div>
                    </div>
                    {p.punctuality && (
                      <p className={`mt-2 text-[12px] rounded-xl px-3 py-2 ${
                        p.punctuality.late === 0
                          ? 'bg-[#C8F542]/10 text-[#5B7A08]'
                          : 'bg-amber-500/10 text-amber-700'
                      }`}>
                        ⏰ Dochvilnost (30 dní): {p.punctuality.checked - p.punctuality.late}/{p.punctuality.checked} včas
                        {p.punctuality.late > 0 && ` · ${p.punctuality.late}× pozdě (víc než 10 min)`}
                      </p>
                    )}
                  </div>

                  {/* Points breakdown */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-[0.13em] text-black/40 mb-2">Odkud má body</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {([
                        ['Úkoly', p.breakdown.tasks], ['Postupy', p.breakdown.procedures], ['Uzávěrky', p.breakdown.closings],
                        ['Z hodnocení', p.breakdown.reviewPoints], ['Automaticky', p.breakdown.autoPoints], ['K položkám', p.breakdown.itemPoints],
                      ] as [string, number][]).map(([label, val]) => (
                        <span key={label} className="inline-flex items-center gap-1 rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-medium text-black/55 tabular-nums">
                          {label}: <strong className="text-[#16181A]">{val}</strong>
                        </span>
                      ))}
                      {p.breakdown.flagged > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/12 px-2.5 py-1 text-[11px] font-medium text-red-600 tabular-nums">
                          <Icon name="warning" size={11} /> Výtky: <strong>{p.breakdown.flagged}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Reminders — unresolved flagged feedback */}
                  {flaggedItems.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-[0.13em] text-red-600 mb-2">Co je potřeba napravit</h3>
                      <div className="space-y-1.5">
                        {flaggedItems.slice(0, 5).map(it => (
                          <div key={`${it.kind}-${it.refId}`} className="rounded-xl px-3 py-2 bg-amber-500/[0.12] border border-amber-500/30">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Icon name="warning" size={13} className="text-amber-600 shrink-0" />
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-black/40">{KIND_LABEL[it.kind] ?? ''} · {fmtDay(it.workDate)}</span>
                              <span className="text-[13px] font-medium text-[#16181A] min-w-0 flex-1 truncate">{it.label}</span>
                              <PointsBadge n={it.points} />
                            </div>
                            {it.note && <p className="text-[13px] text-black/60 mt-1">{it.note}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Contact */}
                  {(p.employee.email || p.employee.phone) && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-[0.13em] text-black/40 mb-2">Kontakt</h3>
                      <div className="rounded-2xl bg-black/[0.03] p-3.5 space-y-1 text-sm">
                        {p.employee.email && <p className="text-[#16181A] truncate">✉️ {p.employee.email}</p>}
                        {p.employee.phone && <p className="text-[#16181A]">📞 {p.employee.phone}</p>}
                      </div>
                    </div>
                  )}
                </>
              )}

              {tab === 'shifts' && (
                <>
                  {p.shifts.upcoming.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-[0.13em] text-[#5B7A08] mb-2">Nadcházející ({p.shifts.upcoming.length})</h3>
                      <div className="space-y-1.5">
                        {p.shifts.upcoming.map(sh => (
                          <div key={sh.id} className="flex items-center gap-3 rounded-2xl bg-[#C8F542]/[0.08] border border-[#C8F542]/20 px-3.5 py-2.5">
                            <span className="text-sm font-semibold text-[#16181A] capitalize flex-1 min-w-0 truncate">{fmtDayLong(sh.date)}</span>
                            <span className="text-xs text-black/50 tabular-nums shrink-0">{sh.startTime}–{sh.endTime}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-[0.13em] text-black/40 mb-2">Odpracované ({p.shifts.recent.length})</h3>
                    {p.shifts.recent.length === 0 ? (
                      <p className="text-sm text-black/45">Zatím žádné odpracované směny.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {p.shifts.recent.map(sh => (
                          <div key={sh.id} className={`flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 ${sh.flagged ? 'bg-red-500/[0.06] border border-red-500/20' : 'bg-black/[0.03]'}`}>
                            <span className="text-sm font-medium text-[#16181A] capitalize min-w-0 flex-1 truncate">{fmtDayLong(sh.date)}</span>
                            <span className="text-xs text-black/45 tabular-nums shrink-0 hidden sm:inline">{sh.startTime}–{sh.endTime}</span>
                            {sh.reviewed ? (
                              <span className="flex items-center gap-1.5 shrink-0">
                                {sh.rating > 0 && <Stars n={sh.rating} />}
                                {sh.flagged && <Icon name="warning" size={13} className="text-red-600" />}
                                <PointsBadge n={sh.reviewPoints} />
                              </span>
                            ) : (
                              <span className="text-[11px] font-medium text-orange-600 bg-orange-500/12 rounded-full px-2 py-0.5 shrink-0">Nehodnoceno</span>
                            )}
                            <button onClick={() => setRateDate(sh.date)}
                              className="rounded-full bg-[#16181A] text-white px-3 py-1.5 text-[11px] font-semibold hover:brightness-125 transition shrink-0">
                              {sh.reviewed ? 'Upravit' : 'Ohodnotit'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {tab === 'feedback' && (
                <>
                  {p.reviews.length === 0 && p.items.length === 0 ? (
                    <p className="text-sm text-black/45">Zatím žádné hodnocení. Otevři záložku Směny a ohodnoť první.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {p.reviews.map(r => {
                        const dayItems = p.items.filter(i => i.workDate === r.work_date);
                        const alert = r.flagged === true || dayItems.some(i => i.flagged);
                        return (
                          <div key={r.work_date} className={`rounded-2xl p-3.5 border ${alert ? 'bg-white/60 border-red-500/25' : 'bg-black/[0.03] border-transparent'}`}>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-[#16181A]">{fmtDayLong(r.work_date)}</span>
                              <div className="flex items-center gap-2">
                                {r.rating > 0 && <Stars n={r.rating} />}
                                <PointsBadge n={r.points} />
                                {(r.autoPoints ?? 0) !== 0 && (
                                  <span className={`text-[11px] tabular-nums rounded-full px-1.5 py-0.5 bg-black/[0.05] ${(r.autoPoints ?? 0) > 0 ? 'text-[#5B7A08]' : 'text-red-600'}`}>
                                    {(r.autoPoints ?? 0) > 0 ? '+' : ''}{r.autoPoints} auto
                                  </span>
                                )}
                              </div>
                            </div>
                            {r.note && <p className="text-sm text-black/60 mt-1.5 whitespace-pre-line">{r.note}</p>}
                            {dayItems.length > 0 && (
                              <div className="mt-2 space-y-1.5">
                                {dayItems.map(it => (
                                  <div key={`${it.kind}-${it.refId}`} className={`rounded-xl px-3 py-2 ${it.flagged ? 'bg-amber-500/[0.12] border border-amber-500/30' : 'bg-black/[0.04]'}`}>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {it.flagged && <Icon name="warning" size={12} className="text-amber-600 shrink-0" />}
                                      <span className="text-[11px] font-semibold uppercase tracking-wider text-black/40 shrink-0">{KIND_LABEL[it.kind] ?? ''}</span>
                                      <span className="text-[13px] text-[#16181A] min-w-0 flex-1 truncate">{it.label}</span>
                                      <PointsBadge n={it.points} />
                                    </div>
                                    {it.note && <p className="text-[13px] text-black/60 mt-1">{it.note}</p>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {rateDate && p && (
        <div onClick={e => e.stopPropagation()}>
          <ShiftReviewModal
            employee={{ id: p.employee.id, name: p.employee.name, avatar: p.employee.avatar }}
            initialDate={rateDate}
            onClose={() => setRateDate(null)}
            onSaved={() => { setRateDate(null); load(); }}
          />
        </div>
      )}
    </div>
  );
}
