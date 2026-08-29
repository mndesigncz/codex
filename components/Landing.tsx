import Link from 'next/link';
import { LogoMark, Icon } from '@/components/Icons';
import { PLAN_FEATURES, PRO_PRICE, TRIAL_DAYS } from '@/lib/plan';

// Public storefront for logged-out visitors — what Managero is, what it does,
// and what it will cost. Signed-in users never see this (they're redirected
// straight into the app).

const FEATURES: { icon: string; title: string; text: string }[] = [
  { icon: 'calendar', title: 'Směny a docházka', text: 'Plán směn, žádosti o volno a výměny — zaměstnanci vidí svůj rozpis v telefonu.' },
  { icon: 'trend', title: 'Uzávěrky bez počítání z hlavy', text: 'Pohyby v kase, počítání bankovek, odvod na konci směny a férové vysvětlení každého rozdílu.' },
  { icon: 'box', title: 'Sklad, který hlídá zásoby', text: 'Kategorie do libovolné hloubky, otevřená balení, hlídání minim a rychlý zápis z tabletu.' },
  { icon: 'clipboard', title: 'Úkoly a návody', text: 'Denní úkoly, otevírací a zavírací postupy s odškrtáváním — nic se nezapomene.' },
  { icon: 'chat', title: 'Týmový chat', text: 'Kanály i přímé zprávy s přílohami. Všechno k podniku na jednom místě.' },
  { icon: 'leaf', title: 'Sdílené menu pro zákazníky', text: 'Odkaz s aktuální nabídkou ve vašich barvách a s logem — bez cen a stavů skladu.' },
];

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <Icon name="check" size={16} className="text-[#5B7A08] inline-block" />;
  if (v === false) return <span className="text-black/25">—</span>;
  return <>{v}</>;
}

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="max-w-6xl mx-auto px-5 sm:px-8 py-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <LogoMark size={36} />
          <span className="text-lg font-bold tracking-tight text-[#16181A] truncate">Managero</span>
        </div>
        {/* On a phone the full pair of labels overflows the viewport — the CTA
            keeps its meaning with one word, the sign-in link keeps its icon. */}
        <nav className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Link href="/login" className="rounded-full px-2.5 sm:px-4 py-2 text-sm font-medium text-black/60 hover:text-black transition-colors whitespace-nowrap">
            Přihlásit
          </Link>
          <Link href="/register" className="rounded-full bg-[#16181A] text-white px-3.5 sm:px-5 py-2 text-sm font-semibold hover:bg-black transition-colors whitespace-nowrap">
            <span className="sm:hidden">Zdarma</span>
            <span className="hidden sm:inline">Vyzkoušet zdarma</span>
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-10 sm:pt-20 pb-14 text-center">
        <p className="inline-flex items-center gap-2 rounded-full bg-[#C8F542]/15 border border-[#C8F542]/30 text-[#5B7A08] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider">
          Pro čajovny, kavárny a malé podniky
        </p>
        <h1 className="mt-5 text-4xl sm:text-6xl font-bold tracking-tight text-[#16181A] leading-[1.05] text-balance">
          Provoz vašeho podniku<br className="hidden sm:block" /> na jednom místě
        </h1>
        <p className="mt-5 max-w-2xl mx-auto text-base sm:text-lg text-black/55">
          Směny, uzávěrky, sklad, úkoly i týmový chat — místo pěti aplikací a papírků jedna,
          které rozumí celý tým od první směny.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/register" className="w-full sm:w-auto rounded-full bg-[#16181A] text-white px-8 py-3.5 text-sm font-semibold hover:bg-black transition-all inline-flex items-center justify-center gap-2">
            Vyzkoušet {TRIAL_DAYS} dní zdarma <Icon name="chevron" size={15} className="-rotate-90" />
          </Link>
          <a href="#cenik" className="w-full sm:w-auto rounded-full glass border border-black/[0.08] px-8 py-3.5 text-sm font-semibold text-black/70 hover:text-black transition-all inline-flex items-center justify-center">
            Kolik to stojí?
          </a>
        </div>
        <p className="mt-4 text-xs text-black/40">Bez karty. Zaměstnanci se připojí jedním kódem.</p>
      </section>

      {/* One quiet image instead of a wall of screenshots — the room the app is
          actually used in. 22 kB, so it costs the visitor nothing. */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 pb-14 sm:pb-20">
        <figure className="relative overflow-hidden rounded-[32px] border border-black/[0.06] shadow-[0_30px_80px_rgba(25,35,15,0.14)] rise-in">
          <img
            src="/brand/hero-tea-bar.webp"
            alt="Pult čajovny s konvicí, sklenicemi a čajovými dózami v ranním světle"
            width={1376} height={768} loading="eager" fetchPriority="high"
            className="w-full h-[220px] sm:h-[380px] object-cover"
          />
          <figcaption className="absolute inset-x-0 bottom-0 p-5 sm:p-8 bg-gradient-to-t from-black/60 via-black/20 to-transparent">
            <p className="text-white/95 text-sm sm:text-base font-semibold max-w-md leading-snug sm:ml-auto sm:pr-2">
              Ráno otevřete. Managero už ví, kdo má směnu, co došlo a co se má stihnout.
            </p>
          </figcaption>
        </figure>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {FEATURES.map(f => (
            <div key={f.title} className="glass-card p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#C8F542]/20 text-[#5B7A08]">
                <Icon name={f.icon} size={22} />
              </div>
              <h3 className="mt-4 font-bold tracking-tight text-[#16181A]">{f.title}</h3>
              <p className="mt-1.5 text-sm text-black/55 leading-relaxed">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="cenik" className="max-w-4xl mx-auto px-5 sm:px-8 pb-16">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#16181A] text-center">Jednoduchý ceník</h2>
        <p className="mt-2 text-sm text-black/50 text-center">
          Během beta období je všechno odemčené zdarma. Nový podnik navíc dostane {TRIAL_DAYS} dní plné verze.
        </p>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
          <div className="glass-card p-7 flex flex-col">
            <h3 className="font-bold tracking-tight text-[#16181A]">Zdarma</h3>
            <p className="mt-2 text-3xl font-bold tracking-tight text-[#16181A]">0 Kč</p>
            <p className="text-xs text-black/40 mt-1">navždy</p>
            <p className="mt-4 text-sm text-black/55">Základ pro malý tým: směny, úkoly, chat, uzávěrky a sklad.</p>
            <Link href="/register" className="mt-6 rounded-full glass border border-black/[0.08] px-6 py-3 text-sm font-semibold text-black/70 hover:text-black transition-all text-center">
              Začít zdarma
            </Link>
          </div>
          <div className="glass-card p-7 flex flex-col relative overflow-hidden border-2 !border-[#C8F542]/60">
            <span className="absolute top-4 right-4 rounded-full bg-[#C8F542] text-black text-[11px] font-bold uppercase tracking-wider px-2.5 py-1">Doporučeno</span>
            <h3 className="font-bold tracking-tight text-[#16181A]">Pro</h3>
            <p className="mt-2 text-3xl font-bold tracking-tight text-[#16181A]">{PRO_PRICE.monthly} {PRO_PRICE.currency}</p>
            <p className="text-xs text-black/40 mt-1">{PRO_PRICE.per}</p>
            <p className="mt-4 text-sm text-black/55">Všechno bez limitů: neomezený tým, kiosk pro tablet, odměny, exporty a sdílené menu ve vašich barvách.</p>
            <Link href="/register" className="mt-6 rounded-full bg-[#16181A] text-white px-6 py-3 text-sm font-semibold hover:bg-black transition-all text-center">
              Vyzkoušet {TRIAL_DAYS} dní zdarma
            </Link>
          </div>
        </div>

        {/* Comparison */}
        <div className="glass-card p-6 mt-6 overflow-x-auto">
          <table className="w-full text-sm min-w-[440px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-black/40">
                <th className="py-2 pr-3 font-semibold">Funkce</th>
                <th className="py-2 px-3 font-semibold w-28">Zdarma</th>
                <th className="py-2 pl-3 font-semibold w-44 text-[#5B7A08]">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {PLAN_FEATURES.map(f => (
                <tr key={f.label}>
                  <td className="py-2.5 pr-3 text-[#16181A]">{f.label}</td>
                  <td className="py-2.5 px-3 text-black/55"><Cell v={f.free} /></td>
                  <td className="py-2.5 pl-3 text-black/70"><Cell v={f.pro} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/[0.06]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-black/40">
          <div className="flex items-center gap-2">
            <LogoMark size={22} />
            <span>Managero — systém pro správu podniku</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-black transition-colors">Přihlášení</Link>
            <Link href="/register" className="hover:text-black transition-colors">Registrace</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
