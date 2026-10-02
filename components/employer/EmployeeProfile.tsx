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

import { useEffect, useState, useCallback, useRef } from 'react';
import { Icon } from '../Icons';
import { Button, Chip, EmptyState, ErrorState, ListRow, Modal, Segmented, Skeleton, Stat, StatRow, Avatar } from '../ui';
import ShiftReviewModal from './ShiftReviewModal';
import type { RewardLevel } from '@/lib/rewardLevels';
import { apiMessage, okJson } from '@/lib/api';
import { fmtHM } from '@/lib/i18n/format';
import { useMoney } from '../CurrencyProvider';
import { useOpravneni } from '../role/useOpravneni';
import { hodinyMinuty } from '@/lib/dochazkaPrehled';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { useLocale } from './jazyk';

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

const druhPolozky = (t: PrekladFn): Record<string, string> => ({ task: t('Úkol'), procedure: t('Postup'), closing: t('Uzávěrka') });
const fmtDay = (s: string, loc: string) => new Date(String(s).slice(0, 10) + 'T12:00:00').toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'numeric' });
const fmtDayLong = (s: string, loc: string) => new Date(String(s).slice(0, 10) + 'T12:00:00').toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'long' });
const hm = (t: string | null) => String(t ?? '').slice(0, 5);

/** Body jako stav: kladné ok, záporné bad, nula nic. */
const Body = ({ n }: { n: number | null | undefined }) => {
  const t = useT('sprava');
  const loc = useLocale();
  return !n ? null : (
    <Chip tone={n > 0 ? 'ok' : 'bad'} size="sm">{t('{n} b', { n: `${n > 0 ? '+' : ''}${n.toLocaleString(loc)}` })}</Chip>
  );
};
const Hvezdy = ({ n }: { n: number }) => n > 0 ? <Chip tone="muted" size="sm" icon="star">{n}/5</Chip> : null;

export default function EmployeeProfile({ employeeId, onClose }: { employeeId: number; onClose: () => void }) {
  const loc = useLocale();
  const t = useT('sprava');
  const tRef = useRef(t); tRef.current = t; // callbacky nesmí držet starý jazyk po přepnutí
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
    const t = tRef.current;
    setChyba(null);
    fetch(`/api/employees/${employeeId}`).then(okJson)
      .then(d => { if (d && d.employee) setP(d); else setChyba(t('Profil přišel v nečekaném tvaru.')); })
      .catch(e => setChyba(apiMessage(e, t('Profil se nepodařilo načíst.'))));
  }, [employeeId]);
  useEffect(() => { load(); }, [load]);

  const flaggedItems = p?.items.filter(i => i.flagged) ?? [];
  const e = p?.employee;
  const podtitul = e ? [e.jobTitle || t('Člen týmu'), smi('finance.mzdy') && e.hourlyRate ? `${money(e.hourlyRate)}/h` : null].filter(Boolean).join(' · ') : undefined;
  const zalozky = [
    { id: 'overview' as const, label: t('Přehled') },
    { id: 'shifts' as const, label: t('Směny') },
    ...(vidiHodnoceni ? [{ id: 'feedback' as const, label: t('Hodnocení'), count: flaggedItems.length || undefined }] : []),
  ];

  return (
    <>
      <Modal open onClose={onClose} size="lg" title={e?.name ?? t('Profil zaměstnance')} subtitle={podtitul}>
        {chyba ? (
          <ErrorState compact title={t('Profil se nenačetl')} detail={chyba} onRetry={load} />
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
                <p className="t-label">{t('Úroveň')}</p>
                <p className="t-section">{p.standing.levelName}</p>
              </div>
              <Chip tone="ink" icon="award">{t('{n} b', { n: p.standing.points.toLocaleString(loc) })}</Chip>
            </div>
            <Segmented size="sm" ariaLabel={t('Část profilu')} value={tab} onChange={setTab} options={zalozky} />

            {tab === 'overview' && (
              <>
                {p.standing.next && (
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[13px] text-black/55 tabular-nums">
                      <span>{t('do úrovně {nazev}', { nazev: p.standing.next.name })}</span>
                      <span>{t('zbývá {n} b', { n: Math.max(0, p.standing.pointsForNext - p.standing.pointsIntoLevel).toLocaleString(loc) })}</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full rounded-full bg-black/[0.06] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.standing.pctToNext)} aria-label={t('Postup na další úroveň')}>
                      <div className="h-full rounded-full bg-[#16181A]" style={{ width: `${p.standing.pctToNext}%` }} />
                    </div>
                  </div>
                )}
                {p.standing.perks && <p className="text-[13px] text-black/60 whitespace-pre-line"><strong className="font-semibold text-[#16181A]">{t('Výhody:')}</strong> {p.standing.perks}</p>}

                <section aria-labelledby="profil-mesic">
                  <h3 id="profil-mesic" className="t-label mb-2">{t('Tento měsíc')}</h3>
                  <StatRow>
                    <Stat label={t('Odpracováno')} value={hodinyMinuty(p.month.hoursMs)} />
                    <Stat label={t('Směny')} value={p.month.shifts.toLocaleString(loc)} />
                    <Stat label={t('Uzávěrky')} value={p.month.closings.toLocaleString(loc)} />
                  </StatRow>
                  {p.punctuality && (
                    <p className={`note mt-3 ${p.punctuality.late === 0 ? 'note-ok' : 'note-wait'}`}>
                      <Icon name="clock" size={14} className="inline -mt-0.5 mr-1.5" />
                      {t('Dochvilnost za 30 dní: {vcas}/{celkem} včas', { vcas: p.punctuality.checked - p.punctuality.late, celkem: p.punctuality.checked })}
                      {p.punctuality.late > 0 && ` · ${t('{n}× pozdě (víc než 10 min)', { n: p.punctuality.late })}`}
                    </p>
                  )}
                </section>

                <section aria-labelledby="profil-body">
                  <h3 id="profil-body" className="t-label mb-2">{t('Odkud má body')}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      [t('Úkoly'), p.breakdown.tasks], [t('Postupy'), p.breakdown.procedures], [t('Uzávěrky'), p.breakdown.closings],
                      ...(vidiHodnoceni ? [[t('Z hodnocení'), p.breakdown.reviewPoints], [t('Automaticky'), p.breakdown.autoPoints], [t('K položkám'), p.breakdown.itemPoints]] : []),
                    ] as [string, number | null][]).filter(([, v]) => v != null).map(([label, val]) => (
                      <Chip key={label} tone="muted" size="sm">{label}: {(val ?? 0).toLocaleString(loc)}</Chip>
                    ))}
                    {vidiHodnoceni && (p.breakdown.flagged ?? 0) > 0 && <Chip tone="bad" size="sm" icon="warning">{t('Výtky: {n}', { n: p.breakdown.flagged })}</Chip>}
                  </div>
                </section>

                {flaggedItems.length > 0 && (
                  <section aria-labelledby="profil-napravit">
                    <h3 id="profil-napravit" className="t-label mb-1">{t('Co je potřeba napravit')}</h3>
                    <ul className="list">
                      {flaggedItems.slice(0, 5).map(it => (
                        <ListRow key={`${it.kind}-${it.refId}`} title={it.label}
                          meta={[`${druhPolozky(t)[it.kind] ?? ''} · ${fmtDay(it.workDate, loc)}`, it.note].filter(Boolean).join(' · ')}
                          right={<Body n={it.points} />} />
                      ))}
                    </ul>
                  </section>
                )}

                {(e.email || e.phone) && (
                  <section aria-labelledby="profil-kontakt">
                    <h3 id="profil-kontakt" className="t-label mb-1">{t('Kontakt')}</h3>
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
                    <h3 id="profil-nadchazejici" className="t-label mb-1">{t('Nadcházející ({n})', { n: p.shifts.upcoming.length })}</h3>
                    <ul className="list">
                      {p.shifts.upcoming.map(sh => (
                        <ListRow key={sh.id} title={<span className="cz-sentence">{fmtDayLong(sh.date, loc)}</span>} value={`${fmtHM(sh.startTime)}–${fmtHM(sh.endTime)}`} />
                      ))}
                    </ul>
                  </section>
                )}
                <section aria-labelledby="profil-odpracovane">
                  <h3 id="profil-odpracovane" className="t-label mb-1">{t('Odpracované ({n})', { n: p.shifts.recent.length })}</h3>
                  {p.shifts.recent.length === 0 ? (
                    <EmptyState illustration="smeny" title={t('Zatím žádná odpracovaná směna')} compact />
                  ) : (
                    <ul className="list">
                      {p.shifts.recent.map(sh => (
                        <ListRow key={sh.id}
                          title={<span className="cz-sentence">{fmtDayLong(sh.date, loc)}</span>}
                          meta={`${fmtHM(sh.startTime)}–${fmtHM(sh.endTime)}`}
                          right={vidiHodnoceni ? (sh.reviewed ? <>
                            <Hvezdy n={sh.rating} />
                            {sh.flagged && <Chip tone="bad" size="sm" icon="warning">{t('Výtka')}</Chip>}
                            <Body n={sh.reviewPoints} />
                          </> : <Chip tone="wait" size="sm">{t('Nehodnoceno')}</Chip>) : undefined}
                          actions={smiHodnotit ? (
                            <Button variant="secondary" size="sm" onClick={() => setRateDate(sh.date)}>{sh.reviewed ? t('Upravit') : t('Ohodnotit')}</Button>
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
                <EmptyState illustration="odmeny" title={t('Zatím žádné hodnocení')} hint={t('Otevři záložku Směny a ohodnoť první.')} compact />
              ) : (
                <ul className="list">
                  {p.reviews.map(r => {
                    const dayItems = p.items.filter(i => i.workDate === r.work_date);
                    return (
                      <li key={r.work_date} className="py-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-[15px] font-medium text-[#16181A] cz-sentence">{fmtDayLong(r.work_date, loc)}</span>
                          <span className="flex items-center gap-1.5 flex-wrap">
                            <Hvezdy n={r.rating} />
                            {r.flagged && <Chip tone="bad" size="sm" icon="warning">{t('Výtka')}</Chip>}
                            <Body n={r.points} />
                            {(r.autoPoints ?? 0) !== 0 && <Chip tone="muted" size="sm">{t('{n} auto', { n: `${(r.autoPoints ?? 0) > 0 ? '+' : ''}${r.autoPoints}` })}</Chip>}
                          </span>
                        </div>
                        {r.note && <p className="text-sm text-black/60 mt-1.5 whitespace-pre-line">{r.note}</p>}
                        {dayItems.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {dayItems.map(it => (
                              <li key={`${it.kind}-${it.refId}`} className="flex items-center gap-2 flex-wrap text-[13px]">
                                {it.flagged && <Icon name="warning" size={13} className="text-wait-ink shrink-0" />}
                                <span className="text-black/55 shrink-0">{druhPolozky(t)[it.kind] ?? ''}</span>
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
