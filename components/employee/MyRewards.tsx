'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import type { RewardLevel } from '@/lib/rewardLevels';
import { ProGate } from '../Pro';

interface Review {
  work_date: string; rating: number; note: string | null; points: number;
  autoPoints?: number; flagged?: boolean; scope?: string; seen_at?: string | null; created_at?: string | null;
}
interface FeedbackItem {
  work_date: string; kind: string; refId: number; label: string;
  points: number; note: string | null; flagged: boolean;
}
interface Me {
  points: number;
  breakdown: {
    tasks: number; procedures: number; closings: number; reviewPoints: number; ratedShifts: number;
    autoPoints?: number; itemPoints?: number; flagged?: number;
  };
  levelName: string; levelIndex: number; perks: string;
  next: RewardLevel | null; pctToNext: number; pointsIntoLevel: number; pointsForNext: number;
}

// One day of feedback: the shift rating plus everything the employer marked
// on individual tasks / procedures / the closing that day.
interface DayFeedback { date: string; review: Review | null; items: FeedbackItem[]; }

const KIND_LABEL: Record<string, string> = { task: 'Úkol', procedure: 'Postup', closing: 'Uzávěrka' };

const fmtWhen = (s: string) => {
  const d = new Date(String(s).slice(0, 10) + 'T00:00:00');
  return isNaN(d.getTime()) ? String(s) : d.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long' });
};

const Stars = ({ n }: { n: number }) => (
  <span className="inline-flex gap-0.5" aria-label={`${n} z 5`}>
    {[1, 2, 3, 4, 5].map(i => (
      <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={i <= n ? '#C8F542' : 'none'} stroke={i <= n ? '#8FB811' : 'currentColor'} strokeWidth="1.6" className={i <= n ? '' : 'text-black/25'}>
        <path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9 6.7 19.2l1-5.8-4.2-4.1 5.9-.9L12 3Z" strokeLinejoin="round" />
      </svg>
    ))}
  </span>
);

const PointsBadge = ({ n }: { n: number }) => n === 0 ? null : (
  <span className={`text-xs font-bold tabular-nums rounded-full px-2 py-0.5 shrink-0 ${n > 0 ? 'bg-[#C8F542]/25 text-[#5B7A08]' : 'bg-red-500/15 text-red-600'}`}>
    {n > 0 ? '+' : ''}{n} b
  </span>
);

function DayCard({ day, alert }: { day: DayFeedback; alert: boolean }) {
  const r = day.review;
  const auto = r?.autoPoints ?? 0;
  return (
    <div className={`rounded-2xl p-3.5 border ${alert ? 'bg-white/60 border-red-500/25' : 'bg-black/[0.03] border-transparent'}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-semibold text-[#16181A]">{fmtWhen(day.date)}</span>
        <div className="flex items-center gap-2 flex-wrap">
          {r && r.rating > 0 && <Stars n={r.rating} />}
          {r && <PointsBadge n={r.points ?? 0} />}
          {auto !== 0 && (
            <span className={`text-[11px] font-medium tabular-nums rounded-full px-2 py-0.5 bg-black/[0.05] ${auto > 0 ? 'text-[#5B7A08]' : 'text-red-600'}`}>
              {auto > 0 ? '+' : ''}{auto} b automaticky
            </span>
          )}
        </div>
      </div>

      {r?.scope === 'shift' && (
        <span className="inline-flex items-center gap-1 mt-1.5 rounded-full bg-black/[0.05] text-black/55 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
          <Icon name="users" size={11} /> Hodnocení celé směny
        </span>
      )}

      {r?.note && <p className="text-sm text-black/60 mt-1.5 whitespace-pre-line">{r.note}</p>}

      {day.items.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {day.items.map(it => (
            <div key={`${it.kind}-${it.refId}`} className={`rounded-xl px-3 py-2 ${it.flagged ? 'bg-amber-500/[0.12] border border-amber-500/30' : 'bg-black/[0.03]'}`}>
              <div className="flex items-center gap-2 flex-wrap">
                {it.flagged && <Icon name="warning" size={13} className="text-amber-600 shrink-0" />}
                <span className="text-[11px] font-semibold uppercase tracking-wider text-black/40 shrink-0">{KIND_LABEL[it.kind] ?? 'Hodnocení'}</span>
                <span className="text-[13px] font-medium text-[#16181A] min-w-0 flex-1 truncate">{it.label}</span>
                <PointsBadge n={it.points ?? 0} />
              </div>
              {it.note && <p className="text-[13px] text-black/60 mt-1 whitespace-pre-line">{it.note}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MyRewards() {
  return (
    <ProGate feature="Moje odměny" employer={false} benefit="Body, úrovně a odměny za dobře odvedené směny.">
      <MyRewardsInner  />
    </ProGate>
  );
}

function MyRewardsInner() {
  const [levels, setLevels] = useState<RewardLevel[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  // Rewards shop: what points can buy + my redemption requests.
  const [catalog, setCatalog] = useState<any[]>([]);
  const [myRedemptions, setMyRedemptions] = useState<any[]>([]);
  const [shopMsg, setShopMsg] = useState('');
  const loadShop = () =>
    fetch('/api/rewards/catalog').then(r => r.json()).then(d => {
      setCatalog(Array.isArray(d.catalog) ? d.catalog : []);
      setMyRedemptions(Array.isArray(d.redemptions) ? d.redemptions : []);
    }).catch(() => {});
  useEffect(() => { loadShop(); }, []);
  const redeem = async (rw: any) => {
    if (!confirm(`Vyměnit ${rw.cost} bodů za „${rw.title}"? Vedení žádost schválí.`)) return;
    const res = await fetch('/api/rewards/catalog', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rewardId: rw.id }),
    }).catch(() => null);
    if (res?.ok) { setShopMsg('Žádost odeslána — počká na schválení vedením. ✓'); loadShop(); setTimeout(() => setShopMsg(''), 4000); }
    else setShopMsg('Žádost se nepodařilo odeslat.');
  };
  const [reviews, setReviews] = useState<Review[]>([]);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [unseenFlagged, setUnseenFlagged] = useState(0);
  const [acking, setAcking] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/rewards').then(r => r.json()).then(d => {
      if (d && !d.error) {
        setLevels(Array.isArray(d.levels) ? d.levels : []);
        setMe(d.me ?? null);
        setReviews(Array.isArray(d.reviews) ? d.reviews : []);
        setItems(Array.isArray(d.items) ? d.items : []);
        setUnseenFlagged(Number(d.unseenFlagged) || 0);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Days are built from both sources so a day with only item-level feedback
  // (no overall rating) still shows up.
  const days = useMemo(() => {
    const map = new Map<string, DayFeedback>();
    const get = (date: string) => {
      let d = map.get(date);
      if (!d) { d = { date, review: null, items: [] }; map.set(date, d); }
      return d;
    };
    reviews.forEach(r => { if (r?.work_date) get(String(r.work_date)).review = r; });
    items.forEach(it => { if (it?.work_date) get(String(it.work_date)).items.push(it); });
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [reviews, items]);

  const flaggedDays = days.filter(d => d.review?.flagged === true || d.items.some(i => i.flagged));
  const normalDays = days.filter(d => !(d.review?.flagged === true || d.items.some(i => i.flagged)));

  const acknowledge = async () => {
    setAcking(true);
    try {
      await fetch('/api/rewards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markSeen: true }),
      });
      setReviews(prev => prev.map(r => r.seen_at ? r : { ...r, seen_at: new Date().toISOString() }));
      setUnseenFlagged(0);
    } catch { /* banner stays so the employee can try again */ }
    setAcking(false);
  };

  if (loading) return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto w-full space-y-4">
      <div className="glass-card h-40 animate-pulse" />
      <div className="glass-card h-32 animate-pulse" />
    </div>
  );
  if (!me) return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto w-full">
      <div className="glass-card p-8 text-center text-black/45">Odměny zatím nejsou k dispozici.</div>
    </div>
  );

  const b = me.breakdown;
  const fromReviews = (b.reviewPoints ?? 0) + (b.autoPoints ?? 0) + (b.itemPoints ?? 0);

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto w-full space-y-6">
      <div className="flex items-center gap-2.5">
        <Icon name="award" size={22} className="text-[#16181A]" />
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#16181A]">Moje odměny</h1>
      </div>

      {/* Unacknowledged "fix this" feedback — first thing on the page */}
      {unseenFlagged > 0 && (
        <div className="rounded-3xl bg-red-500/[0.08] border border-red-500/30 p-5">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15 text-red-600 shrink-0"><Icon name="warning" size={19} /></span>
            <div className="flex-1 min-w-0">
              <p className="font-bold tracking-tight text-[#16181A]">Něco je potřeba napravit</p>
              <p className="text-sm text-black/60 mt-0.5">
                {unseenFlagged === 1 ? 'U jedné z tvých směn' : `U ${unseenFlagged} tvých směn`} vedení označilo něco k nápravě. Přečti si poznámky níže.
              </p>
              <button onClick={acknowledge} disabled={acking}
                className="mt-3 rounded-full bg-[#16181A] text-white font-semibold px-5 py-2.5 text-sm hover:brightness-125 disabled:opacity-50 transition">
                {acking ? 'Ukládám…' : 'Beru na vědomí'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Rewards shop */}
      {catalog.length > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
            <h3 className="font-bold tracking-tight text-[#16181A]">🎁 Katalog odměn</h3>
            <span className="text-xs text-black/40">máš {me.points} bodů</span>
          </div>
          <p className="text-sm text-black/45 mb-4">Vyměň body za odměnu — žádost schválí vedení a body se odečtou.</p>
          {shopMsg && <p className="text-sm text-[#5B7A08] bg-[#C8F542]/10 border border-[#C8F542]/25 rounded-2xl px-4 py-2.5 mb-3">{shopMsg}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {catalog.map(rw => {
              const afford = me.points >= rw.cost;
              const pending = myRedemptions.some(r => r.reward_id === rw.id && r.status === 'pending');
              return (
                <div key={rw.id} className="flex items-center gap-3 rounded-2xl bg-black/[0.03] border border-black/[0.06] px-4 py-3">
                  <span className="text-2xl shrink-0">{rw.icon ?? '🎁'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#16181A] truncate">{rw.title}</p>
                    <p className="text-xs text-black/45 tabular-nums">{rw.cost} bodů</p>
                  </div>
                  <button onClick={() => redeem(rw)} disabled={!afford || pending}
                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold whitespace-nowrap transition ${
                      pending ? 'bg-amber-500/12 text-amber-700 cursor-default'
                      : afford ? 'bg-[#16181A] text-white hover:bg-black'
                      : 'bg-black/[0.05] text-black/35 cursor-not-allowed'
                    }`}>
                    {pending ? 'Čeká…' : afford ? 'Vyměnit' : 'Málo bodů'}
                  </button>
                </div>
              );
            })}
          </div>
          {myRedemptions.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {myRedemptions.slice(0, 6).map(r => (
                <span key={r.id} className={`tap-target-sm rounded-full px-3 py-1.5 text-xs font-medium ${
                  r.status === 'approved' ? 'bg-[#C8F542]/15 text-[#5B7A08]'
                  : r.status === 'declined' ? 'bg-red-500/10 text-red-600'
                  : 'bg-amber-500/12 text-amber-700'
                }`}>
                  {r.title} · {r.status === 'approved' ? 'schváleno ✓' : r.status === 'declined' ? 'zamítnuto' : 'čeká'}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* How points are earned */}
      <div className="glass-card p-5">
        <h3 className="font-bold tracking-tight text-[#16181A] mb-3">Odkud máš body</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Úkoly', value: b.tasks, icon: 'check' },
            { label: 'Postupy', value: b.procedures, icon: 'clipboard' },
            { label: 'Uzávěrky', value: b.closings, icon: 'trend' },
            { label: 'Z hodnocení', value: fromReviews, icon: 'award' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl bg-black/[0.03] p-3 text-center">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#C8F542]/20 text-[#5B7A08] mb-1.5"><Icon name={s.icon} size={15} /></span>
              <p className="text-2xl font-bold tracking-tight text-[#16181A] tabular-nums">{s.value}</p>
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
                    <p className="font-semibold text-[#16181A] text-sm">{lv.name}{current && <span className="ml-2 text-[11px] font-bold uppercase tracking-wider text-[#5B7A08]">teď</span>}</p>
                    <span className="text-xs text-black/45 tabular-nums shrink-0">{lv.minPoints} b</span>
                  </div>
                  {lv.perks && <p className="text-xs text-black/55 mt-0.5 whitespace-pre-line">{lv.perks}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* What needs fixing — always above the ordinary feedback */}
      {flaggedDays.length > 0 && (
        <div className="rounded-3xl bg-red-500/[0.05] border border-red-500/25 p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-red-500/12 text-red-600 shrink-0"><Icon name="warning" size={17} /></span>
            <div className="min-w-0">
              <h3 className="font-bold tracking-tight text-[#16181A]">Něco je potřeba napravit</h3>
              <p className="text-xs text-black/50">Vedení u těchto směn označilo, co příště udělat jinak.</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {flaggedDays.map(d => <DayCard key={d.date} day={d} alert />)}
          </div>
        </div>
      )}

      {/* Feedback from employer */}
      <div className="glass-card p-5">
        <h3 className="font-bold tracking-tight text-[#16181A] mb-3">Hodnocení směn</h3>
        {normalDays.length === 0 ? (
          <p className="text-sm text-black/45">
            {flaggedDays.length > 0 ? 'Další hodnocení zatím nemáš.' : 'Zatím žádné hodnocení. Vedení ohodnotí tvé směny průběžně.'}
          </p>
        ) : (
          <div className="space-y-2.5">
            {normalDays.map(d => <DayCard key={d.date} day={d} alert={false} />)}
          </div>
        )}
      </div>
    </div>
  );
}
