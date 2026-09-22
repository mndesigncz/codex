'use client';

// Ceník na landingu: tři tarify s přepínačem měsíc/rok a srovnání.
// Klientská komponenta kvůli přepínači; texty a ceny bere z lib/plan,
// aby seděly s Nastavením.
//
// Srovnání bylo holá tabulka: třináct řádků, tři sloupce, fajfky
// a pomlčky. Správné, ale nic neříkalo o tom, KTERÝ sloupec si má člověk
// vybrat. Teď: řádky ve skupinách (provoz / pro rostoucí podnik / pro
// hosty / napojení), sloupec Pro podbarvený v celé výšce jako jeden pruh,
// v hlavičce cena vedle jména, fajfka v limetkovém kolečku a „nemá"
// jako tečka, ne pomlčka, která na malém písmu vypadá jako škrt.

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icons';
import { Segmented } from './ui';
import { PLAN_FEATURES, PLAN_NAMES, PRICES, TRIAL_DAYS } from '@/lib/plan';

type Interval = 'month' | 'year';

function Bunka({ v, zvyraznit = false }: { v: string | boolean; zvyraznit?: boolean }) {
  if (v === true) {
    return (
      <span className={`inline-grid h-6 w-6 place-items-center rounded-full ${zvyraznit ? 'bg-[#C8F542] text-[#3E5406]' : 'bg-[#C8F542]/40 text-[#3E5406]'}`} aria-label="ano">
        <Icon name="check" size={13} />
      </span>
    );
  }
  if (v === false) return <span className="inline-block h-1.5 w-1.5 rounded-full bg-black/15" aria-label="ne" />;
  return <span className="text-xs font-semibold text-[#16181A]">{v}</span>;
}

// Skupiny srovnání. Podle textu řádku, ne podle pořadí: když se v lib/plan
// přidá funkce, spadne do správné skupiny sama; co nesedí nikam, jde
// do poslední.
const SKUPINY: { nazev: string; sedi: (label: string) => boolean }[] = [
  { nazev: 'Provoz', sedi: l => /Členů|Směny|Úkoly|Uzávěrky|Sklad/.test(l) },
  { nazev: 'Pro rostoucí podnik', sedi: l => /Kiosk|Hodnocení|CSV|Měsíční/.test(l) },
  { nazev: 'Pro hosty', sedi: l => /menu|client/i.test(l) },
  { nazev: 'Napojení a výroba', sedi: () => true },
];
const skupiny = SKUPINY.map(sk => ({ ...sk, radky: [] as typeof PLAN_FEATURES }));
for (const f of PLAN_FEATURES) skupiny.find(sk => sk.sedi(f.label))!.radky.push(f);

const KARTY: { id: 'free' | 'pro' | 'max'; veta: string; body: string[] }[] = [
  { id: 'free', veta: 'Základ pro malý tým, a napořád zdarma.', body: ['Směny, docházka a žádosti', 'Úkoly, návody a chat', 'Uzávěrky a sklad'] },
  { id: 'pro', veta: 'Všechno bez limitů pro jeden podnik.', body: ['Neomezený tým', 'Kiosk pro tablet za barem', 'Odměny, exporty a měsíční přehled'] },
  { id: 'max', veta: 'Vše z Pro a k tomu druhá půlka: hosté.', body: ['Věrnost, rezervace a objednávky od stolu', 'Napojení na pokladnu Storyous', 'Výroba vlastních produktů'] },
];

export default function Pricing() {
  const [interval, setInterval_] = useState<Interval>('month');
  const cena = (p: 'pro' | 'max') => {
    const pr = PRICES[p];
    return interval === 'year'
      ? { hlavni: `${pr.year.toLocaleString('cs-CZ')} Kč`, pod: 'ročně za podnik', skrt: `${pr.yearCompare.toLocaleString('cs-CZ')} Kč` }
      : { hlavni: `${pr.month} Kč`, pod: 'měsíčně za podnik', skrt: null };
  };
  const mesicne = (p: 'pro' | 'max') => `${Math.round(PRICES[p][interval === 'year' ? 'year' : 'month'] / (interval === 'year' ? 12 : 1))} Kč/měs`;

  return (
    <section id="cenik" className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24 scroll-mt-24">
      {/* Nadpis vlevo nad souměrnými kartami — stránka drží těžiště vlevo od
          hero až dolů, ceník se nevrací do středu jako u šablon. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#16181A]">Jednoduchý ceník</h2>
          <p className="mt-3 text-base text-black/55 text-pretty">
            Zdarma napořád pro malý tým. Pro a Max si vyzkoušíte {TRIAL_DAYS} dní zdarma, karta se strhne až po měsíci.
          </p>
        </div>
        <Segmented size="sm" ariaLabel="Období" value={interval} onChange={v => setInterval_(v as Interval)}
          options={[{ id: 'month', label: 'Měsíčně' }, { id: 'year', label: 'Ročně · 2 měsíce zdarma' }]} />
      </div>

      {/* Karty. Pro je zvednutá a má stín — je to doporučená volba a má to
          být vidět dřív, než člověk dočte cenu. */}
      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 items-stretch">
        {KARTY.map(k => {
          const pro = k.id === 'pro';
          const max = k.id === 'max';
          const c = k.id === 'free' ? null : cena(k.id);
          return (
            <div key={k.id} className={`relative flex flex-col rounded-[2rem] p-7 ${
              pro ? 'lgx-strong md:-my-3 md:py-10 shadow-[0_30px_70px_rgba(25,35,15,0.16)] ring-2 ring-[#C8F542]' : 'lgx'
            }`}>
              {pro && <span className="absolute top-5 right-5 chip chip-sm chip-ok uppercase tracking-wider">Doporučeno</span>}
              <p className="t-label text-black/45">{PLAN_NAMES[k.id]}</p>
              <p className="mt-2 text-4xl font-bold tracking-tight text-[#16181A] tabular-nums">{c ? c.hlavni : '0 Kč'}</p>
              <p className="text-xs text-black/45 mt-1">{c ? c.pod : 'navždy, až 3 lidé'}</p>
              {c?.skrt && <p className="text-xs text-black/45"><s>{c.skrt}</s> ročně, vychází na {mesicne(k.id as 'pro' | 'max')}</p>}
              <p className="mt-4 text-sm font-semibold text-[#16181A] text-pretty">{k.veta}</p>
              <ul className="mt-4 space-y-2 text-sm text-black/65">
                {k.body.map(b => (
                  <li key={b} className="flex items-start gap-2.5">
                    <span className="mt-0.5 inline-grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#C8F542]/40 text-[#3E5406]"><Icon name="check" size={12} /></span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <Link href={k.id === 'free' ? '/register?plan=free' : `/register?plan=${k.id}&interval=${interval}`} className="mt-auto pt-7 block">
                <span className={`btn w-full ${pro ? 'btn-accent' : max ? 'btn-primary' : 'btn-secondary'}`}>
                  Zvolit {PLAN_NAMES[k.id]}
                </span>
              </Link>
            </div>
          );
        })}
      </div>

      {/* Srovnání. První sloupec drží na místě, když se tabulka na telefonu
          posouvá — jinak člověk vidí tři fajfky a neví, k čemu patří. */}
      <div className="lgx rounded-[2rem] p-3 sm:p-6 mt-8 overflow-x-auto">
        <table className="srov w-full text-sm min-w-[36rem] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] bg-white/85 md:bg-transparent text-left t-label text-black/45 py-3 pl-3 pr-3 rounded-l-2xl">Funkce</th>
              <th className="py-3 px-3 w-28 text-left">
                <p className="t-label text-black/45">Zdarma</p>
                <p className="mt-0.5 text-sm font-bold text-[#16181A] tabular-nums">0 Kč</p>
              </th>
              <th className="srov-pro py-3 px-3 w-36 text-left">
                <p className="t-label text-[#5B7A08]">Pro</p>
                <p className="mt-0.5 text-sm font-bold text-[#16181A] tabular-nums">{cena('pro').hlavni}</p>
              </th>
              <th className="py-3 px-3 w-36 text-left">
                <p className="t-label text-[#0A5CC0]">Max</p>
                <p className="mt-0.5 text-sm font-bold text-[#16181A] tabular-nums">{cena('max').hlavni}</p>
              </th>
            </tr>
          </thead>
          <tbody>
            {skupiny.filter(sk => sk.radky.length).map(sk => (
              <SkupinaRadku key={sk.nazev} nazev={sk.nazev} radky={sk.radky} />
            ))}
          </tbody>
        </table>
        <p className="mt-4 px-3 text-[11px] text-black/40">Ceny bez DPH. Doporučte Managero dalšímu podniku a získejte měsíc zdarma, až tři za měsíc.</p>
      </div>
    </section>
  );
}

function SkupinaRadku({ nazev, radky }: { nazev: string; radky: typeof PLAN_FEATURES }) {
  return (
    <>
      <tr>
        <th scope="rowgroup" colSpan={2} className="sticky left-0 z-[1] bg-white/85 md:bg-transparent text-left pt-5 pb-1.5 pl-3 pr-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40">{nazev}</th>
        <td className="srov-pro pt-5 pb-1.5" aria-hidden />
        <td className="pt-5 pb-1.5" aria-hidden />
      </tr>
      {radky.map(f => (
        <tr key={f.label} className="group">
          <th scope="row" className="sticky left-0 z-[1] bg-white/85 md:bg-transparent text-left font-normal text-[#16181A] py-2.5 pl-3 pr-3 border-t border-black/[0.05]">{f.label}</th>
          <td className="py-2.5 px-3 border-t border-black/[0.05]"><Bunka v={f.free} /></td>
          <td className="srov-pro py-2.5 px-3 border-t border-black/[0.05]"><Bunka v={f.pro} zvyraznit /></td>
          <td className="py-2.5 px-3 border-t border-black/[0.05]"><Bunka v={f.max} /></td>
        </tr>
      ))}
    </>
  );
}
