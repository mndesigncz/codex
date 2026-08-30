'use client';

// Doporučení ve Financích — čtyři podokna podle toho, čeho se rada týká.
//
// Přehled výš říká, kolik se vydělalo. Tohle říká, co s tím. Každá karta má
// tři patra: co se stalo, co to znamená, a co udělat. Kde jde spočítat cena
// toho, co se neděje, je u toho i částka — „slabý čtvrtek stojí 12 400 Kč
// měsíčně" se čte jinak než „čtvrtky jsou slabší".
//
// Podokna se zobrazují jedno pod druhým, ne ve stovkách záložek: doporučení,
// které si člověk musí najít, nikdo nečte. Přepínač nahoře je jen filtr.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { useMoney } from '../CurrencyProvider';

type Group = 'revenue' | 'products' | 'people' | 'stock';

interface Advice {
  group: Group;
  tone: 'good' | 'warn' | 'info';
  icon: string;
  title: string;
  text: string;
  action?: string;
  impact?: number;
  evidence?: string;
}

const GROUPS: { id: Group; label: string; icon: string; hint: string }[] = [
  { id: 'revenue', label: 'Tržby', icon: 'trend', hint: 'Trend, dny v týdnu, útrata na hosta.' },
  { id: 'products', label: 'Co se prodává', icon: 'box', hint: 'Co roste, co padá, co jen zabírá místo v menu.' },
  { id: 'people', label: 'Provoz a lidé', icon: 'users', hint: 'Mzdy proti tržbě, hodiny, kasa.' },
  { id: 'stock', label: 'Nákup a sklad', icon: 'clipboard', hint: 'Dodavatelé, zásoby, peníze, které leží.' },
];

const TONES = {
  good: { card: 'border-[#C8F542]/40 bg-[#C8F542]/[0.09]', icon: 'text-[#5B7A08]', title: 'text-[#3E5406]' },
  warn: { card: 'border-amber-500/30 bg-amber-500/[0.07]', icon: 'text-amber-700', title: 'text-amber-900' },
  info: { card: 'border-[#0A84FF]/22 bg-[#0A84FF]/[0.05]', icon: 'text-[#0A6FE0]', title: 'text-[#0A5FC4]' },
} as const;

export default function FinanceAdvice({ month }: { month: string }) {
  const money = useMoney();
  const [advice, setAdvice] = useState<Advice[] | null>(null);
  const [blind, setBlind] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [only, setOnly] = useState<Group | 'all'>('all');

  useEffect(() => {
    let alive = true;
    setAdvice(null); setErr(null);
    fetch(`/api/finance/advice?month=${month}`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return;
        if (d.error) { setErr(d.error); return; }
        setAdvice(d.advice ?? []);
        setBlind(d.blind ?? []);
      })
      .catch(() => { if (alive) setErr('Doporučení se teď nepodařilo spočítat.'); });
    return () => { alive = false; };
  }, [month]);

  const byGroup = useMemo(() => {
    const m = new Map<Group, Advice[]>();
    for (const g of GROUPS) m.set(g.id, []);
    for (const a of advice ?? []) m.get(a.group)?.push(a);
    return m;
  }, [advice]);

  // Součet toho, co se dá vyčíslit. Neříká „tolik vyděláš" — říká, o kolik
  // peněz se v těch doporučeních mluví.
  const totalImpact = (advice ?? []).reduce((s, a) => s + (a.impact ?? 0), 0);
  const shown = GROUPS.filter(g => only === 'all' || g.id === only);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 px-1">
        <div className="min-w-0">
          <h3 className="text-sm font-bold uppercase tracking-wider text-black/55">Co zlepšit</h3>
          {advice && advice.length > 0 && (
            <p className="text-xs text-black/45 mt-0.5">
              {advice.length} {advice.length === 1 ? 'pozorování' : advice.length < 5 ? 'pozorování' : 'pozorování'} z čísel tohohle měsíce
              {totalImpact > 0 && <> · dohromady se tu mluví o <strong className="text-[#16181A] tabular-nums">{money(totalImpact)}</strong></>}
            </p>
          )}
        </div>
        {advice && advice.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none scroll-fade-x -mx-1 px-1 max-w-full">
            <button onClick={() => setOnly('all')}
              className={`tap-target-sm shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                only === 'all' ? 'bg-[#16181A] text-white' : 'glass border border-black/10 text-black/60 hover:bg-black/[0.04]'}`}>
              Vše
            </button>
            {GROUPS.map(g => {
              const n = byGroup.get(g.id)?.length ?? 0;
              if (!n) return null;
              return (
                <button key={g.id} onClick={() => setOnly(only === g.id ? 'all' : g.id)}
                  className={`tap-target-sm shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                    only === g.id ? 'bg-[#16181A] text-white' : 'glass border border-black/10 text-black/60 hover:bg-black/[0.04]'}`}>
                  {g.label} <span className="opacity-60 tabular-nums">{n}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {err && <p className="text-sm text-black/45 px-1">{err}</p>}
      {!advice && !err && (
        <div className="glass-card p-6 text-center"><p className="text-sm text-black/40">Počítám doporučení…</p></div>
      )}
      {advice && advice.length === 0 && !err && (
        <div className="glass-card p-6 text-center">
          <p className="text-sm text-black/45">Za tenhle měsíc zatím není dost dat na doporučení.</p>
          <p className="text-xs text-black/35 mt-1">Uzávěrky, docházka a prodeje z pokladny — z každého vzniknou další.</p>
        </div>
      )}

      {advice && advice.length > 0 && shown.map(g => {
        const list = byGroup.get(g.id) ?? [];
        if (!list.length) return null;
        return (
          <section key={g.id} className="glass-card p-4 sm:p-5">
            <div className="flex items-baseline gap-2 mb-3 min-w-0">
              <Icon name={g.icon as any} size={15} className="text-black/45 shrink-0 translate-y-0.5" />
              <h4 className="text-sm font-bold text-[#16181A] shrink-0">{g.label}</h4>
              <p className="text-xs text-black/40 truncate min-w-0">{g.hint}</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {list.map((a, i) => {
                const t = TONES[a.tone];
                return (
                  <article key={i} className={`rounded-2xl border p-4 ${t.card}`}>
                    <div className="flex items-start gap-2">
                      <Icon name={a.icon as any} size={15} className={`shrink-0 mt-0.5 ${t.icon}`} />
                      <p className={`text-sm font-bold leading-snug min-w-0 ${t.title}`}>{a.title}</p>
                    </div>
                    <p className="text-[13px] text-black/60 mt-1.5 leading-relaxed">{a.text}</p>
                    {a.action && (
                      <p className="text-[13px] text-[#16181A] mt-2 leading-relaxed flex gap-1.5">
                        <span className="shrink-0 font-bold opacity-40">→</span>
                        <span className="min-w-0">{a.action}</span>
                      </p>
                    )}
                    {(a.impact != null || a.evidence) && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                        {a.impact != null && a.impact > 0 && (
                          <span className="rounded-full bg-white/70 border border-black/[0.07] px-2.5 py-1 text-[11px] font-bold tabular-nums text-[#16181A]">
                            jde o {money(a.impact)}
                          </span>
                        )}
                        {a.evidence && (
                          <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] text-black/50">{a.evidence}</span>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Slepá místa. Když se něco nedá spočítat, je to informace, ne mlčení. */}
      {blind.length > 0 && (
        <div className="rounded-2xl border border-black/[0.07] bg-black/[0.02] p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-black/40 mb-1.5">Co se nepodařilo spočítat</p>
          <ul className="space-y-1">
            {blind.map((b, i) => <li key={i} className="text-[13px] text-black/50 leading-snug">{b}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
