'use client';

import { useEffect, useState, useCallback } from 'react';
import { Icon } from '../Icons';
import type { RewardLevel, PointsConfig } from '@/lib/rewardLevels';
import ShiftReviewModal from './ShiftReviewModal';

interface Standing {
  id: number; name: string; avatar?: string;
  points: number;
  breakdown: { tasks: number; procedures: number; closings: number; reviewPoints: number; ratedShifts: number };
  levelName: string; levelIndex: number;
  next: RewardLevel | null; pctToNext: number; pointsIntoLevel: number; pointsForNext: number;
}

const inputCls = 'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:ring-2 focus:ring-[#C8F542]/20 focus:outline-none transition-all text-sm';

export default function RewardsView({ user }: { user: { id?: string } }) {
  const [tab, setTab] = useState<'board' | 'settings'>('board');
  const [standings, setStandings] = useState<Standing[]>([]);
  const [levels, setLevels] = useState<RewardLevel[]>([]);
  const [points, setPoints] = useState<PointsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState<Standing | null>(null); // employee being rated

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/rewards').then(r => r.json()).then(d => {
      if (d && !d.error) {
        setStandings(Array.isArray(d.standings) ? d.standings : []);
        setLevels(d.levels ?? []);
        setPoints(d.points ?? null);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-3xl mx-auto w-full space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <Icon name="award" size={22} className="text-[#16181A]" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#16181A]">Odměny a hodnocení</h1>
            <p className="text-black/50 text-sm">Úrovně, body a hodnocení směn zaměstnanců.</p>
          </div>
        </div>
        <div className="flex gap-1 rounded-full glass border border-black/[0.07] p-1 shrink-0">
          {([['board', 'Žebříček'], ['settings', 'Nastavení']] as const).map(([v, lbl]) => (
            <button key={v} onClick={() => setTab(v)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${tab === v ? 'bg-[#16181A] text-white' : 'text-black/55 hover:text-black'}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="glass-card h-24 animate-pulse" />)}</div>
      ) : tab === 'board' ? (
        <StandingsBoard standings={standings} onRate={setRating} />
      ) : (
        <SettingsPanel levels={levels} points={points} onSaved={load} />
      )}

      {rating && (
        <ShiftReviewModal
          employee={{ id: rating.id, name: rating.name, avatar: rating.avatar }}
          onClose={() => setRating(null)}
          onSaved={() => { setRating(null); load(); }}
        />
      )}
    </div>
  );
}

function StandingsBoard({ standings, onRate }: { standings: Standing[]; onRate: (s: Standing) => void }) {
  if (standings.length === 0) {
    return <div className="glass-card p-8 text-center text-black/45">Zatím žádní zaměstnanci k hodnocení.</div>;
  }
  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`);
  return (
    <div className="space-y-3">
      {standings.map((s, i) => (
        <div key={s.id} className="glass-card p-4">
          <div className="flex items-center gap-3">
            <span className="w-7 text-center text-sm font-bold text-black/50 tabular-nums shrink-0">{medal(i)}</span>
            <span className="text-xl flex h-11 w-11 items-center justify-center rounded-full ring-1 ring-black/10 bg-white/60 shrink-0">{s.avatar || '👤'}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-[#16181A] truncate">{s.name}</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#16181A] text-[#C8F542] px-2.5 py-0.5 text-[11px] font-bold">{s.levelName}</span>
              </div>
              <p className="text-xs text-black/45 mt-0.5 tabular-nums">
                {s.points} bodů
                {s.next && <span className="text-black/35"> · do {s.next.name} zbývá {Math.max(0, s.pointsForNext - s.pointsIntoLevel)}</span>}
              </p>
              {s.next && (
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-black/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-[#C8F542]" style={{ width: `${s.pctToNext}%` }} />
                </div>
              )}
            </div>
            <button onClick={() => onRate(s)}
              className="rounded-full bg-[#C8F542] text-black font-semibold px-4 py-2 text-xs hover:brightness-110 transition whitespace-nowrap shrink-0">
              Ohodnotit
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[
              ['Úkoly', s.breakdown.tasks],
              ['Postupy', s.breakdown.procedures],
              ['Uzávěrky', s.breakdown.closings],
              ['Body z hodnocení', s.breakdown.reviewPoints],
            ].map(([label, val]) => (
              <span key={label as string} className="inline-flex items-center gap-1 rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-medium text-black/55 tabular-nums">
                {label}: <strong className="text-[#16181A]">{val}</strong>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SettingsPanel({ levels: initLevels, points: initPoints, onSaved }:
  { levels: RewardLevel[]; points: PointsConfig | null; onSaved: () => void }) {
  const [levels, setLevels] = useState<RewardLevel[]>(initLevels);
  const [pts, setPts] = useState<PointsConfig>(initPoints ?? { task: 5, procedure: 10, closing: 15, ratingStar: 4 });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const setLevel = (i: number, patch: Partial<RewardLevel>) =>
    setLevels(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLevel = () => setLevels(ls => [...ls, { name: 'Nová úroveň', minPoints: (ls[ls.length - 1]?.minPoints ?? 0) + 300, perks: '' }]);
  const removeLevel = (i: number) => setLevels(ls => ls.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      const res = await fetch('/api/teams', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          levelsConfig: levels.map(l => ({ name: l.name.trim() || 'Úroveň', minPoints: Math.max(0, Math.round(l.minPoints) || 0), perks: l.perks.trim() })),
          pointsConfig: pts,
        }),
      });
      if (res.ok) { setSaved(true); onSaved(); setTimeout(() => setSaved(false), 2000); }
    } finally { setSaving(false); }
  };

  const numField = (label: string, key: keyof PointsConfig, hint: string) => (
    <div>
      <label className="block text-xs uppercase tracking-wider text-black/45 mb-2">{label}</label>
      <input type="number" min={0} value={pts[key]} onChange={e => setPts(p => ({ ...p, [key]: Math.max(0, parseInt(e.target.value) || 0) }))} className={`${inputCls} !py-2.5 tabular-nums`} />
      <p className="text-[11px] text-black/40 mt-1">{hint}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Points per action */}
      <div className="glass-card p-5">
        <h3 className="font-bold tracking-tight text-[#16181A] mb-1">Body za činnost</h3>
        <p className="text-sm text-black/50 mb-4">Kolik bodů zaměstnanec získá za každou akci.</p>
        <div className="grid grid-cols-2 gap-4">
          {numField('Za úkol', 'task', 'Za každý splněný úkol')}
          {numField('Za postup', 'procedure', 'Za každý dokončený postup')}
          {numField('Za uzávěrku', 'closing', 'Za vyplněnou uzávěrku')}
          {numField('Za hvězdu', 'ratingStar', 'Návrh bodů = hvězdy × tohle')}
        </div>
      </div>

      {/* Levels */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold tracking-tight text-[#16181A]">Úrovně a výhody</h3>
          <button onClick={addLevel} className="inline-flex items-center gap-1 rounded-full bg-black/[0.05] text-black/60 px-3 py-1.5 text-xs font-medium hover:bg-black/[0.09] transition">
            <Icon name="plus" size={14} /> Přidat
          </button>
        </div>
        <p className="text-sm text-black/50 mb-4">Od kolika bodů úroveň platí a co za ni zaměstnanec dostane.</p>
        <div className="space-y-3">
          {levels.map((l, i) => (
            <div key={i} className="rounded-2xl bg-black/[0.03] border border-black/[0.05] p-3.5 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#16181A] text-[#C8F542] text-xs font-bold">{i + 1}</span>
                <input value={l.name} onChange={e => setLevel(i, { name: e.target.value })} placeholder="Název úrovně" className={`${inputCls} !py-2 flex-1`} />
                <button onClick={() => removeLevel(i)} disabled={levels.length <= 1} title="Smazat úroveň"
                  className="rounded-full w-8 h-8 flex items-center justify-center text-black/40 hover:text-red-600 hover:bg-red-500/10 disabled:opacity-30 shrink-0">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /></svg>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-black/45 shrink-0">Od bodů</label>
                <input type="number" min={0} value={l.minPoints} onChange={e => setLevel(i, { minPoints: Math.max(0, parseInt(e.target.value) || 0) })}
                  className={`${inputCls} !py-2 max-w-[120px] tabular-nums`} disabled={i === 0} />
                {i === 0 && <span className="text-[11px] text-black/35">základní úroveň (vždy od 0)</span>}
              </div>
              <textarea value={l.perks} onChange={e => setLevel(i, { perks: e.target.value })} rows={2} placeholder="Výhody — např. Sleva 10 %, bonus k výplatě…" className={`${inputCls} !py-2 resize-none`} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="rounded-full bg-[#C8F542] text-black font-semibold px-6 py-2.5 text-sm hover:brightness-110 disabled:opacity-50 transition">
          {saving ? 'Ukládám…' : 'Uložit nastavení'}
        </button>
        {saved && <span className="text-sm text-[#5B7A08] font-medium">Uloženo ✓</span>}
      </div>
    </div>
  );
}
