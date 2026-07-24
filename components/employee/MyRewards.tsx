'use client';

import { useEffect, useState } from 'react';
import { Icon } from '../Icons';
import type { RewardLevel } from '@/lib/rewardLevels';

interface Review { work_date: string; rating: number; note: string | null; points: number; created_at: string; }
interface Me {
  points: number;
  breakdown: { tasks: number; procedures: number; closings: number; reviewPoints: number; ratedShifts: number };
  levelName: string; levelIndex: number; perks: string;
  next: RewardLevel | null; pctToNext: number; pointsIntoLevel: number; pointsForNext: number;
}

const Stars = ({ n }: { n: number }) => (
  <span className="inline-flex gap-0.5" aria-label={`${n} z 5`}>
    {[1, 2, 3, 4, 5].map(i => (
      <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={i <= n ? '#C8F542' : 'none'} stroke={i <= n ? '#8FB811' : 'currentColor'} strokeWidth="1.6" className={i <= n ? '' : 'text-black/25'}>
        <path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9 6.7 19.2l1-5.8-4.2-4.1 5.9-.9L12 3Z" strokeLinejoin="round" />
      </svg>
    ))}
  </span>
);

export default function MyRewards() {
  const [levels, setLevels] = useState<RewardLevel[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/rewards').then(r => r.json()).then(d => {
      if (d && !d.error) { setLevels(d.levels ?? []); setMe(d.me ?? null); setReviews(Array.isArray(d.reviews) ? d.reviews : []); }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="p-6 max-w-2xl mx-auto w-full space-y-4">
      <div className="glass-card h-40 animate-pulse" />
      <div className="glass-card h-32 animate-pulse" />
    </div>
  );
  if (!me) return (
    <div className="p-6 max-w-2xl mx-auto w-full">
      <div className="glass-card p-8 text-center text-black/45">Odměny zatím nejsou k dispozici.</div>
    </div>
  );

  const b = me.breakdown;
  const fmtWhen = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long' });

  return (
    <div className="p-6 max-w-2xl mx-auto w-full space-y-6">
      <div className="flex items-center gap-2.5">
        <Icon name="award" size={22} className="text-[#16181A]" />
        <h1 className="text-xl font-bold tracking-tight text-[#16181A]">Moje odměny</h1>
      </div>

      {/* Hero level card */}
      <div className="glass-card p-6 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-[#C8F542]/20 blur-2xl" />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.14em] text-black/45">Tvoje úroveň</p>
          <div className="mt-1 flex items-end justify-between gap-3 flex-wrap">
            <h2 className="text-3xl font-bold tracking-tight text-[#16181A]">{me.levelName}</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#16181A] text-[#C8F542] px-3.5 py-1.5 text-sm font-bold tabular-nums">
              <Icon name="trend" size={15} /> {me.points} bodů
            </span>
          </div>

          {me.next ? (
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-black/55 mb-1.5">
                <span>Do úrovně <strong className="text-[#16181A]">{me.next.name}</strong></span>
                <span className="tabular-nums">{me.pointsIntoLevel}/{me.pointsForNext}</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-black/[0.06] overflow-hidden">
                <div className="h-full rounded-full bg-[#C8F542] transition-[width] duration-500" style={{ width: `${me.pctToNext}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-black/45">Ještě {Math.max(0, me.pointsForNext - me.pointsIntoLevel)} bodů a postupuješ výš.</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#5B7A08] font-medium">Máš nejvyšší úroveň — skvělá práce! 🎉</p>
          )}

          {me.perks && (
            <div className="mt-5 rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/30 p-4">
              <p className="text-xs uppercase tracking-wider text-[#5B7A08] font-semibold mb-1">Tvoje výhody</p>
              <p className="text-sm text-[#16181A] whitespace-pre-line">{me.perks}</p>
            </div>
          )}
        </div>
      </div>

      {/* How points are earned */}
      <div className="glass-card p-5">
        <h3 className="font-bold tracking-tight text-[#16181A] mb-3">Odkud máš body</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Úkoly', value: b.tasks, icon: 'check' },
            { label: 'Postupy', value: b.procedures, icon: 'clipboard' },
            { label: 'Uzávěrky', value: b.closings, icon: 'trend' },
            { label: 'Z hodnocení', value: b.reviewPoints, icon: 'award', suffix: 'b' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl bg-black/[0.03] p-3 text-center">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#C8F542]/20 text-[#5B7A08] mb-1.5"><Icon name={s.icon} size={15} /></span>
              <p className="text-2xl font-bold tracking-tight text-[#16181A] tabular-nums">{s.value}{s.suffix === 'b' ? '' : ''}</p>
              <p className="text-[11px] text-black/45">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* All levels */}
      <div className="glass-card p-5">
        <h3 className="font-bold tracking-tight text-[#16181A] mb-3">Úrovně</h3>
        <div className="space-y-2">
          {levels.map((lv, i) => {
            const reached = i <= me.levelIndex;
            const current = i === me.levelIndex;
            return (
              <div key={i} className={`flex items-start gap-3 rounded-2xl p-3 border ${current ? 'bg-[#C8F542]/12 border-[#C8F542]/40' : reached ? 'bg-black/[0.02] border-black/[0.05]' : 'bg-white border-black/[0.05] opacity-70'}`}>
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${reached ? 'bg-[#16181A] text-[#C8F542]' : 'bg-black/[0.06] text-black/40'}`}>
                  {reached ? '✓' : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-[#16181A] text-sm">{lv.name}{current && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-[#5B7A08]">teď</span>}</p>
                    <span className="text-xs text-black/45 tabular-nums shrink-0">{lv.minPoints} b</span>
                  </div>
                  {lv.perks && <p className="text-xs text-black/55 mt-0.5 whitespace-pre-line">{lv.perks}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Feedback from employer */}
      <div className="glass-card p-5">
        <h3 className="font-bold tracking-tight text-[#16181A] mb-3">Hodnocení směn</h3>
        {reviews.length === 0 ? (
          <p className="text-sm text-black/45">Zatím žádné hodnocení. Vedení ohodnotí tvé směny průběžně.</p>
        ) : (
          <div className="space-y-2.5">
            {reviews.map((r, i) => (
              <div key={i} className="rounded-2xl bg-black/[0.03] p-3.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-[#16181A]">{fmtWhen(r.work_date)}</span>
                  <div className="flex items-center gap-2">
                    {r.rating > 0 && <Stars n={r.rating} />}
                    {r.points !== 0 && (
                      <span className={`text-xs font-bold tabular-nums rounded-full px-2 py-0.5 ${r.points > 0 ? 'bg-[#C8F542]/25 text-[#5B7A08]' : 'bg-red-500/15 text-red-600'}`}>
                        {r.points > 0 ? '+' : ''}{r.points} b
                      </span>
                    )}
                  </div>
                </div>
                {r.note && <p className="text-sm text-black/60 mt-1.5 whitespace-pre-line">{r.note}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
