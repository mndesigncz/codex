'use client';

// Ceník na landingu: tři tarify s přepínačem měsíc/rok a srovnání.
// i18n: ceník, ceny a srovnání tarifů zůstávají česky (právně citlivé, projde je člověk);
// překládají se jen ovládací prvky a v cizím jazyce je pod přepínačem věta o tom.
// Klientská komponenta kvůli přepínači; texty a ceny bere z lib/plan,
// aby seděly s Nastavením. Mluví jazykem jeviště prodejní stránky (landing.css).

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icons';
import Prepinac from './landing/Prepinac';
import { PLAN_FEATURES, PLAN_NAMES, PRICES, TRIAL_DAYS } from '@/lib/plan';
import { useJazyk, useT } from '@/lib/i18n/client';

// Úspora se počítá, ne opisuje: 12 × měsíční cena mínus roční. Dřív tu stála
// přeškrtnutá „srovnávací" cena (4 990 Kč), kterou nikdo nikdy neúčtoval, a štítek
// „2 měsíce zdarma" neodpovídal ani jí (roční platba stojí 8 měsíců, ne 10).
const uspora = (p: 'pro' | 'max') => 12 * PRICES[p].month - PRICES[p].year;
const USPORA_MESICU = Math.floor(Math.min(uspora('pro') / PRICES.pro.month, uspora('max') / PRICES.max.month));

type Interval = 'month' | 'year';

function Bunka({ v, svetle = false }: { v: string | boolean; svetle?: boolean }) {
  const t = useT('predplatne');
  if (v === true) {
    return (
      <span role="img" className={`ld-tarif-tecka ${svetle ? 'bg-[#C8F542] text-[#16181A]' : 'bg-[rgba(243,244,240,0.12)] text-[#F3F4F0]'}`} aria-label={t('ano')}>
        <Icon name="check" size={12} />
      </span>
    );
  }
  if (v === false) return <span role="img" className="inline-block h-1.5 w-1.5 rounded-full bg-[rgba(243,244,240,0.22)]" aria-label={t('ne')} />;
  return <span className="text-xs font-semibold">{v}</span>;
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
  const t = useT('predplatne');
  const { jazyk } = useJazyk();
  const [interval, setInterval_] = useState<Interval>('month');
  const cena = (p: 'pro' | 'max') => {
    const pr = PRICES[p];
    return interval === 'year'
      ? { hlavni: `${pr.year.toLocaleString('cs-CZ')} Kč`, pod: 'ročně za podnik', usetrite: `${uspora(p).toLocaleString('cs-CZ')} Kč` }
      : { hlavni: `${pr.month} Kč`, pod: 'měsíčně za podnik', usetrite: null };
  };
  const mesicne = (p: 'pro' | 'max') => `${Math.round(PRICES[p][interval === 'year' ? 'year' : 'month'] / (interval === 'year' ? 12 : 1))} Kč/měs`;

  return (
    <section id="cenik" className="ld-sekce" aria-labelledby="nadpis-cenik">
      <div className="ld-obsah">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-x-16 gap-y-6 items-end">
          <h2 id="nadpis-cenik" className="ld-h2">Jednoduchý ceník</h2>
          <div className="flex flex-col items-start gap-5">
            <p className="ld-perex max-w-[40ch]">
              Zdarma napořád pro malý tým. Pro a Max si vyzkoušíte {TRIAL_DAYS} dní zdarma, karta se strhne až po měsíci.
            </p>
            <Prepinac ton="tichy" velikost="sm" popis={t('Období')} hodnota={interval} onZmena={v => setInterval_(v as Interval)}
              moznosti={[{ id: 'month', label: t('Měsíčně') }, { id: 'year', label: t('Ročně · ušetříte {mesice}', { mesice: t('{n, plural, one {# měsíc} few {# měsíce} other {# měsíců}}', { n: USPORA_MESICU }) }) }]} />
            {jazyk !== 'cs' && <p className="ld-meta">{t('Ceník a platební podmínky jsou zatím jen česky.')}</p>}
          </div>
        </div>

        {/* Tarify. Pro je jediná světlá karta: na jevišti svítí jen to, co
            doporučujeme, stejně jako nahoře svítí jen aplikace. */}
        <div className="mt-14 sm:mt-20 grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5 items-stretch">
          {KARTY.map(k => {
            const pro = k.id === 'pro';
            const c = k.id === 'free' ? null : cena(k.id);
            return (
              <div key={k.id} data-tarif={k.id} className="ld-tarif relative flex flex-col p-7 lg:p-8">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold tracking-tight">{PLAN_NAMES[k.id]}</h3>
                  {pro && <span className="rounded-full bg-[#16181A] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#F3F4F0]">{t('Doporučeno')}</span>}
                </div>
                <p className="mt-6 ld-cislo text-[clamp(2.5rem,3.6vw,3.25rem)] font-bold leading-none tracking-[-0.035em]">{c ? c.hlavni : '0 Kč'}</p>
                <p className={`mt-2 text-sm ${pro ? 'text-black/60' : 'text-[color:var(--ld-text-3)]'}`}>{c ? c.pod : 'navždy, až 3 lidé'}</p>
                {c?.usetrite && <p className={`text-sm ${pro ? 'text-black/60' : 'text-[color:var(--ld-text-3)]'}`}>Ušetříte {c.usetrite} oproti měsíčnímu placení, vychází na {mesicne(k.id as 'pro' | 'max')}</p>}
                <p className="mt-6 text-[0.9375rem] font-semibold text-pretty">{k.veta}</p>
                <ul className={`mt-4 space-y-2.5 text-[0.9375rem] ${pro ? 'text-black/70' : 'text-[color:var(--ld-text-2)]'}`}>
                  {k.body.map(b => (
                    <li key={b} className="flex items-start gap-2.5">
                      <span className={`ld-tarif-tecka mt-0.5 ${pro ? 'bg-[#C8F542] text-[#16181A]' : 'bg-[rgba(243,244,240,0.12)] text-[#F3F4F0]'}`}><Icon name="check" size={11} /></span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                {/* Odsazení nese obal, ne odkaz: prstenec fokusu má sedět těsně kolem pilulky. */}
                <div className="mt-auto pt-8">
                  <Link href={k.id === 'free' ? '/register?plan=free' : `/register?plan=${k.id}&interval=${interval}`} className="flex rounded-full">
                    <span className={pro ? 'btn btn-accent w-full' : 'ld-btn ld-btn-obrys w-full'}>
                      {t('Zvolit {plan}', { plan: PLAN_NAMES[k.id] })}
                    </span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Srovnání: od 768 px tabulka se sloupcem Pro podbarveným v celé výšce,
            na telefonu seznam (u každé funkce tři tarify pod sebou), protože tři
            sloupce v 390 px by uřízly Max. */}
        <div className="mt-16">
          <h3 className="text-lg font-semibold tracking-tight">Srovnání tarifů</h3>
          <table className="ld-srovnani mt-6 hidden md:table w-full text-[0.9375rem] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="text-left text-sm font-semibold text-[color:var(--ld-text-3)] py-4 pr-4 border-t-0" scope="col">Funkce</th>
                <th scope="col" className="py-4 px-4 w-36 text-left border-t-0">
                  <span className="block text-sm font-semibold text-[color:var(--ld-text-2)]">Zdarma</span>
                  <span className="block mt-0.5 font-bold ld-cislo">0 Kč</span>
                </th>
                <th scope="col" className="ld-sloupec-pro rounded-t-2xl py-4 px-4 w-40 text-left border-t-0">
                  <span className="block text-sm font-semibold text-[color:var(--ld-papir)]">Pro</span>
                  <span className="block mt-0.5 font-bold ld-cislo">{cena('pro').hlavni}</span>
                </th>
                <th scope="col" className="py-4 px-4 w-40 text-left border-t-0">
                  <span className="block text-sm font-semibold text-[color:var(--ld-text-2)]">Max</span>
                  <span className="block mt-0.5 font-bold ld-cislo">{cena('max').hlavni}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {skupiny.filter(sk => sk.radky.length).map(sk => (
                <SkupinaRadku key={sk.nazev} nazev={sk.nazev} radky={sk.radky} />
              ))}
            </tbody>
          </table>

          <div className="md:hidden mt-4">
            {skupiny.filter(sk => sk.radky.length).map(sk => (
              <div key={sk.nazev} className="mt-6">
                <p className="text-sm font-semibold text-[color:var(--ld-text-3)]">{sk.nazev}</p>
                <ul className="mt-2 list-none">
                  {sk.radky.map(f => (
                    <li key={f.label} className="border-t border-[color:var(--ld-linka)] py-3.5">
                      <p className="text-[0.9375rem]">{f.label}</p>
                      <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs text-[color:var(--ld-text-3)]">
                        {(['free', 'pro', 'max'] as const).map(id => (
                          <span key={id} className="flex items-center gap-2">{PLAN_NAMES[id]} <Bunka v={f[id]} svetle={id === 'pro'} /></span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="ld-meta mt-6">Ceny bez DPH. Doporučte Managero dalšímu podniku a získejte měsíc zdarma, až tři za měsíc.</p>
        </div>
      </div>
    </section>
  );
}

function SkupinaRadku({ nazev, radky }: { nazev: string; radky: typeof PLAN_FEATURES }) {
  return (
    <>
      <tr>
        <th scope="rowgroup" colSpan={2} className="text-left pt-8 pb-2 pr-4 text-sm font-semibold text-[color:var(--ld-text-3)] border-t-0">{nazev}</th>
        <td className="ld-sloupec-pro pt-8 pb-2 border-t-0" aria-hidden />
        <td className="pt-8 pb-2 border-t-0" aria-hidden />
      </tr>
      {radky.map(f => (
        <tr key={f.label}>
          <th scope="row" className="text-left font-normal py-3.5 pr-4">{f.label}</th>
          <td className="py-3.5 px-4"><Bunka v={f.free} /></td>
          <td className="ld-sloupec-pro py-3.5 px-4"><Bunka v={f.pro} svetle /></td>
          <td className="py-3.5 px-4"><Bunka v={f.max} /></td>
        </tr>
      ))}
    </>
  );
}
