'use client';

// Ceník na landingu: tři tarify s přepínačem měsíc/rok. Klientská komponenta
// kvůli přepínači; texty a ceny bere z lib/plan, aby seděly s Nastavením.

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icons';
import { Segmented } from './ui';
import { PLAN_FEATURES, PLAN_NAMES, PRICES, TRIAL_DAYS } from '@/lib/plan';

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <Icon name="check" size={16} className="text-[#5B7A08]" />;
  if (v === false) return <span className="text-black/25">—</span>;
  return <>{v}</>;
}

export default function Pricing() {
  const [interval, setInterval_] = useState<'month' | 'year'>('month');
  return (
      <section id="cenik" className="max-w-5xl mx-auto px-5 sm:px-8 pb-16">
        {/* Nadpis vlevo nad souměrnými kartami — stránka drží těžiště vlevo od
            hero až dolů, ceník se nevrací do středu jako u šablon. */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#16181A]">Jednoduchý ceník</h2>
            <p className="mt-2 text-sm text-black/55 text-pretty">
              Zdarma napořád pro malý tým. Pro a Max si vyzkoušíte {TRIAL_DAYS} dní zdarma — karta se strhne až po měsíci.
            </p>
          </div>
          <Segmented size="sm" ariaLabel="Období" value={interval} onChange={v => setInterval_(v as 'month' | 'year')}
            options={[{ id: 'month', label: 'Měsíčně' }, { id: 'year', label: 'Ročně · 2 měsíce zdarma' }]} />
        </div>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
          <div className="card p-7 flex flex-col">
            <h3 className="t-card">Zdarma</h3>
            <p className="mt-2 text-3xl font-bold tracking-tight text-[#16181A]">0 Kč</p>
            <p className="text-xs text-black/40 mt-1">navždy · až 3 lidé</p>
            <p className="mt-4 text-sm text-black/55">Základ pro malý tým: směny, úkoly, chat, uzávěrky a sklad.</p>
            <Link href="/register" className="mt-auto pt-6 block">
              <span className="btn btn-secondary w-full">Začít zdarma</span>
            </Link>
          </div>
          {(['pro', 'max'] as const).map(p => {
            const pr = PRICES[p];
            return (
              <div key={p} className={`card p-7 flex flex-col relative overflow-hidden ${p === 'pro' ? 'card-accent border-2 !border-[#C8F542]/60' : 'card-info'}`}>
                {p === 'pro' && <span className="absolute top-4 right-4 chip chip-sm chip-ok uppercase tracking-wider">Doporučeno</span>}
                <h3 className="t-card">{PLAN_NAMES[p]}</h3>
                {interval === 'year' ? (
                  <>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-[#16181A]">{pr.year.toLocaleString('cs-CZ')} Kč</p>
                    <p className="text-xs text-black/40 mt-1">ročně za podnik · <s>{pr.yearCompare.toLocaleString('cs-CZ')} Kč</s></p>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-[#16181A]">{pr.month} Kč</p>
                    <p className="text-xs text-black/40 mt-1">měsíčně za podnik</p>
                  </>
                )}
                <p className="mt-4 text-sm text-black/55">
                  {p === 'pro'
                    ? 'Všechno bez limitů: neomezený tým, kiosk pro tablet, odměny, exporty a sdílené menu ve vašich barvách.'
                    : 'Vše z Pro a navíc Managero client pro hosty (věrnost, rezervace, objednávky od stolu), pokladna Storyous a výroba vlastních produktů.'}
                </p>
                <Link href="/register" className="mt-auto pt-6 block">
                  <span className={`btn w-full ${p === 'pro' ? 'btn-accent' : 'btn-primary'}`}>Vyzkoušet {TRIAL_DAYS} dní zdarma</span>
                </Link>
              </div>
            );
          })}
        </div>

        {/* Comparison */}
        <div className="card p-6 mt-6 overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left t-label">
                <th className="py-2 pr-3">Funkce</th>
                <th className="py-2 px-3 w-24">Zdarma</th>
                <th className="py-2 px-3 w-36 text-[#5B7A08]">Pro</th>
                <th className="py-2 pl-3 w-36 text-[#0A5CC0]">Max</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {PLAN_FEATURES.map(f => (
                <tr key={f.label}>
                  <td className="py-2.5 pr-3 text-[#16181A]">{f.label}</td>
                  <td className="py-2.5 px-3 text-black/55"><Cell v={f.free} /></td>
                  <td className="py-2.5 px-3 text-black/70"><Cell v={f.pro} /></td>
                  <td className="py-2.5 pl-3 text-black/70"><Cell v={f.max} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-black/40">Ceny bez DPH. Doporučte Managero dalšímu podniku a získejte měsíc zdarma — až tři za měsíc.</p>
        </div>
      </section>
  );
}
