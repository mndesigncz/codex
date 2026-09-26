'use client';

// Profil člena — okno z Týmu, Docházky, Odměn (PersonLink) a widgetu Profil člena.
//
// Kolo 69 (balík B2, audit Týmu): dřív ručně psané okno s vlastním
// kolečkem načítání, zavíracím SVG bez popisku, záložkami seg-on/seg-off,
// třemi čísly v jamkách 11 px a emoji ⏰ 📞 jako ikonami. Teď <Modal size="lg">
// (DiscardGuard, Escape a fokus řeší Modal), Segmented, StatRow, .list
// a stavy přes Chip. Odpracováno počítá server stejně jako Docházka
// (lib/dochazkaPrehled: bez zapomenutých odchodů a jen v tomhle podniku).
//
// Oprávnění: záložka Hodnocení a hvězdy jen s hodnoceni.zobrazit (server
// je bez něj neposílá), „Ohodnotit" jen s hodnoceni.hodnotit, sazba jen
// s finance.mzdy, kontakty jen s tym.kontakty (obojí server vynechá).

import { useEffect, useState, useCallback } from 'react';
import { Icon } from '../Icons';
import { Button, Chip, EmptyState, ErrorState, ListRow, Modal, Segmented, Skeleton, Stat, StatRow, Avatar } from '../ui';
import ShiftReviewModal from './ShiftReviewModal';
import type { RewardLevel } from '@/lib/rewardLevels';
import { apiMessage, okJson } from '@/lib/api';
import { useMoney } from '../CurrencyProvider';
import { useOpravneni } from '../role/useOpravneni';
import { hodinyMinuty } from '@/lib/dochazkaPrehled';

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
  breakdown: { tasks: number; procedures: number; closings: number; reviewPoints: number | null; autoPoints: number | null; itemPoints: number | null; ratedShifts: number | null; flagged: number | null };
  shifts: { upcoming: ShiftRow[]; recent: ShiftRow[] };
  reviews: Review[];
  items: FeedbackItem[];
  month: { hoursMs: number; shifts: number; closings: number };
  punctuality?: { checked: number; late: number } | null;
}

type Zalozka = 'overview' | 'shifts' | 'feedback';

const KIND_LABEL: Record<string, string> = { task: 'Úkol', procedure: 'Postup', closing: 'Uzávěrka' };
const fmtDay = (s: string) => new Date(String(s).slice(0, 10) + 'T12:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });
const fmtDayLong = (s: string) => new Date(String(s).slice(0, 10) + 'T12:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long' });
const hm = (t: string | null) => String(t ?? '').slice(0, 5);

/** Body jako stav: kladné ok, záporné bad, nula nic. */
const Body = ({ n }: { n: number | null | undefined }) => !n ? null : (
  <Chip tone={n > 0 ? 'ok' : 'bad'} size="sm">{n > 0 ? '+' : ''}{n.toLocaleString('cs-CZ')} b</Chip>
);
const Hvezdy = ({ n }: { n: number }) => n > 0 ? <Chip tone="muted" size="sm" icon="star">{n}/5</Chip> : null;

export default function EmployeeProfile({ employeeId, onClose }: { employeeId: number; onClose: () => void }) {
  // Jako na stránkách: před načtením oprávnění rozhoduje server (data bez klíče nepošle).
  const { ma: smi } = useOpravneni();
  const money = useMoney();
  const vidiHodnoceni = smi('hodnoceni.zobrazit');
  const smiHodnotit = smi('hodnoceni.hodnotit');
  const [p, setP] = useState<Profile | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [tab, setTab] = useState<Zalozka>('overview');
  const [rateDate, setRateDate] = useState<string | null>(null);

  const load = useCallback(() => {
    setChyba(null);
    fetch(`/api/employees/${employeeId}`).then(okJson)
      .then(d => { if (d && d.employee) setP(d); else setChyba('Profil přišel v nečekaném tvaru.'); })
      .catch(e => setChyba(apiMessage(e, 'Profil se nepodařilo načíst.')));
  }, [employeeId]);
  useEffect(() => { load(); }, [load]);

  const flaggedItems = p?.items.filter(i => i.flagged) ?? [];
  const e = p?.employee;
  const podtitul = e ? [e.jobTitle || 'Člen týmu', smi('finance.mzdy') && e.hourlyRate ? `${money(e.hourlyRate)}/h` : null].filter(Boolean).join(' · ') : undefined;
  const zalozky = [
    { id: 'overview' as const, label: 'Přehled' },
    { id: 'shifts' as const, label: 'Směny' },
    ...(vidiHodnoceni ? [{ id: 'feedback' as const, label: 'Hodnocení', count: flaggedItems.length || undefined }] : []),
  ];

  return (
    <>
      <Modal open onClose={onClose} size="lg" title={e?.name ?? 'Profil zaměstnance'} subtitle={podtitul}>
        {chyba ? (
          <ErrorState compact title="Profil se nenačetl" detail={chyba} onRetry={load} />
        ) : !p || !e ? (
          <div className="space-y-3" aria-busy>
            <Skeleton className="h-14" />
            <Skeleton className="h-24" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3 flex-wrap">
              <Avatar emoji={e.avatar} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="t-label">Úroveň</p>
                <p className="t-section">{p.standing.levelName}</p>
              </div>
              <Chip tone="ink" icon="award">{p.standing.points.toLocaleString('cs-CZ')} b</Chip>
            </div>
            <Segmented size="sm" ariaLabel="Část profilu" value={tab} onChange={setTab} options={zalozky} />

            {tab === 'overview' && (
              <>
                {p.standing.next && (
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[13px] text-black/55 tabular-nums">
                      <span>do úrovně {p.standing.next.name}</span>
                      <span>zbývá {Math.max(0, p.standing.pointsForNext - p.standing.pointsIntoLevel).toLocaleString('cs-CZ')} b</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full rounded-full bg-black/[0.06] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.standing.pctToNext)} aria-label="Postup na další úroveň">
                      <div className="h-full rounded-full bg-[#16181A]" style={{ width: `${p.standing.pctToNext}%` }} />
                    </div>
                  </div>
                )}
                {p.standing.perks && <p className="text-[13px] text-black/60 whitespace-pre-line"><strong className="font-semibold text-[#16181A]">Výhody:</strong> {p.standing.perks}</p>}

                <section aria-labelledby="profil-mesic">
                  <h3 id="profil-mesic" className="t-label mb-2">Tento měsíc</h3>
                  <StatRow>
                    <Stat label="Odpracováno" value={hodinyMinuty(p.month.hoursMs)} />
                    <Stat label="Směny" value={p.month.shifts.toLocaleString('cs-CZ')} />
                    <Stat label="Uzávěrky" value={p.month.closings.toLocaleString('cs-CZ')} />
                  </StatRow>
                  {p.punctuality && (
                    <p className={`note mt-3 ${p.punctuality.late === 0 ? 'note-ok' : 'note-wait'}`}>
                      <Icon name="clock" size={14} className="inline -mt-0.5 mr-1.5" />
                      Dochvilnost za 30 dní: {p.punctuality.checked - p.punctuality.late}/{p.punctuality.checked} včas
                      {p.punctuality.late > 0 && ` · ${p.punctuality.late}× pozdě (víc než 10 min)`}
                    </p>
                  )}
                </section>

                <section aria-labelledby="profil-body">
                  <h3 id="profil-body" className="t-label mb-2">Odkud má body</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      ['Úkoly', p.breakdown.tasks], ['Postupy', p.breakdown.procedures], ['Uzávěrky', p.breakdown.closings],
                      ...(vidiHodnoceni ? [['Z hodnocení', p.breakdown.reviewPoints], ['Automaticky', p.breakdown.autoPoints], ['K položkám', p.breakdown.itemPoints]] : []),
                    ] as [string, number | null][]).filter(([, v]) => v != null).map(([label, val]) => (
                      <Chip key={label} tone="muted" size="sm">{label}: {(val ?? 0).toLocaleString('cs-CZ')}</Chip>
                    ))}
                    {vidiHodnoceni && (p.breakdown.flagged ?? 0) > 0 && <Chip tone="bad" size="sm" icon="warning">Výtky: {p.breakdown.flagged}</Chip>}
                  </div>
                </section>

                {flaggedItems.length > 0 && (
                  <section aria-labelledby="profil-napravit">
                    <h3 id="profil-napravit" className="t-label mb-1">Co je potřeba napravit</h3>
                    <ul className="list">
                      {flaggedItems.slice(0, 5).map(it => (
                        <ListRow key={`${it.kind}-${it.refId}`} title={it.label}
                          meta={[`${KIND_LABEL[it.kind] ?? ''} · ${fmtDay(it.workDate)}`, it.note].filter(Boolean).join(' · ')}
                          right={<Body n={it.points} />} />
                      ))}
                    </ul>
                  </section>
                )}

                {(e.email || e.phone) && (
                  <section aria-labelledby="profil-kontakt">
                    <h3 id="profil-kontakt" className="t-label mb-1">Kontakt</h3>
                    <ul className="list">
                      {e.email && <ListRow lead={<Icon name="mail" size={16} className="text-black/40" />} title={<a href={`mailto:${e.email}`} className="hover:underline">{e.email}</a>} />}
                      {e.phone && <ListRow lead={<Icon name="chat" size={16} className="text-black/40" />} title={<a href={`tel:${e.phone}`} className="hover:underline">{e.phone}</a>} />}
                    </ul>
                  </section>
                )}
              </>
            )}

            {tab === 'shifts' && (
              <>
                {p.shifts.upcoming.length > 0 && (
                  <section aria-labelledby="profil-nadchazejici">
                    <h3 id="profil-nadchazejici" className="t-label mb-1">Nadcházející ({p.shifts.upcoming.length})</h3>
                    <ul className="list">
                      {p.shifts.upcoming.map(sh => (
                        <ListRow key={sh.id} title={<span className="cz-sentence">{fmtDayLong(sh.date)}</span>} value={`${hm(sh.startTime)}–${hm(sh.endTime)}`} />
                      ))}
                    </ul>
                  </section>
                )}
                <section aria-labelledby="profil-odpracovane">
                  <h3 id="profil-odpracovane" className="t-label mb-1">Odpracované ({p.shifts.recent.length})</h3>
                  {p.shifts.recent.length === 0 ? (
                    <EmptyState illustration="smeny" title="Zatím žádná odpracovaná směna" compact />
                  ) : (
                    <ul className="list">
                      {p.shifts.recent.map(sh => (
                        <ListRow key={sh.id}
                          title={<span className="cz-sentence">{fmtDayLong(sh.date)}</span>}
                          meta={`${hm(sh.startTime)}–${hm(sh.endTime)}`}
                          right={vidiHodnoceni ? (sh.reviewed ? <>
                            <Hvezdy n={sh.rating} />
                            {sh.flagged && <Chip tone="bad" size="sm" icon="warning">Výtka</Chip>}
                            <Body n={sh.reviewPoints} />
                          </> : <Chip tone="wait" size="sm">Nehodnoceno</Chip>) : undefined}
                          actions={smiHodnotit ? (
                            <Button variant="secondary" size="sm" onClick={() => setRateDate(sh.date)}>{sh.reviewed ? 'Upravit' : 'Ohodnotit'}</Button>
                          ) : undefined}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}

            {tab === 'feedback' && vidiHodnoceni && (
              p.reviews.length === 0 && p.items.length === 0 ? (
                <EmptyState illustration="odmeny" title="Zatím žádné hodnocení" hint="Otevři záložku Směny a ohodnoť první." compact />
              ) : (
                <ul className="list">
                  {p.reviews.map(r => {
                    const dayItems = p.items.filter(i => i.workDate === r.work_date);
                    return (
                      <li key={r.work_date} className="py-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-[15px] font-medium text-[#16181A] cz-sentence">{fmtDayLong(r.work_date)}</span>
                          <span className="flex items-center gap-1.5 flex-wrap">
                            <Hvezdy n={r.rating} />
                            {r.flagged && <Chip tone="bad" size="sm" icon="warning">Výtka</Chip>}
                            <Body n={r.points} />
                            {(r.autoPoints ?? 0) !== 0 && <Chip tone="muted" size="sm">{(r.autoPoints ?? 0) > 0 ? '+' : ''}{r.autoPoints} auto</Chip>}
                          </span>
                        </div>
                        {r.note && <p className="text-sm text-black/60 mt-1.5 whitespace-pre-line">{r.note}</p>}
                        {dayItems.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {dayItems.map(it => (
                              <li key={`${it.kind}-${it.refId}`} className="flex items-center gap-2 flex-wrap text-[13px]">
                                {it.flagged && <Icon name="warning" size={13} className="text-wait-ink shrink-0" />}
                                <span className="text-black/55 shrink-0">{KIND_LABEL[it.kind] ?? ''}</span>
                                <span className="text-[#16181A] min-w-0 flex-1 truncate">{it.label}</span>
                                <Body n={it.points} />
                                {it.note && <span className="basis-full text-black/60">{it.note}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )
            )}
          </div>
        )}
      </Modal>

      {rateDate && p && (
        <ShiftReviewModal
          employee={{ id: p.employee.id, name: p.employee.name, avatar: p.employee.avatar }}
          initialDate={rateDate}
          onClose={() => setRateDate(null)}
          onSaved={() => { setRateDate(null); load(); }}
        />
      )}
    </>
  );
}
