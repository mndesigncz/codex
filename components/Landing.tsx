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
    <div className="min-h-[100dvh]">
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
          <Link href="/register" className="rounded-full bg-[#C8F542] on-accent px-3.5 sm:px-5 py-2 text-sm font-semibold hover:brightness-105 transition-colors whitespace-nowrap">
            <span className="sm:hidden">Zdarma</span>
            <span className="hidden sm:inline">Vyzkoušet zdarma</span>
          </Link>
        </nav>
      </header>

      {/* Hero: text vlevo, fotka vpravo vybíhá za okraj kontejneru. Souměrný
          střed s obrázkem pod sebou vypadal jako každá druhá šablona; tady
          má stránka těžiště a směr — čte se zleva doprava, do fotky. */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-8 sm:pt-16 pb-12 sm:pb-20 overflow-x-clip">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-10 lg:gap-8 items-center">
          <div className="max-w-xl rise-in">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/50">Pro čajovny, kavárny a malé podniky</p>
            <h1 className="mt-4 text-[2.6rem] leading-[1.02] sm:text-6xl lg:text-[4.25rem] font-bold tracking-[-0.03em] text-[#16181A] text-balance">
              Provoz podniku na jednom místě.
            </h1>
            <p className="mt-6 text-base sm:text-lg text-black/60 leading-relaxed max-w-[46ch] text-pretty">
              Směny, uzávěrky, sklad, úkoly i týmový chat — místo pěti aplikací a papírků jedna,
              které rozumí celý tým od první směny.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Link href="/register" className="pressable w-full sm:w-auto rounded-full bg-[#C8F542] on-accent px-7 py-3.5 text-sm font-semibold hover:brightness-105 active:scale-[0.97] shadow-[0_8px_24px_rgba(200,245,66,0.35)] inline-flex items-center justify-center gap-2">
                Vyzkoušet {TRIAL_DAYS} dní zdarma <Icon name="chevron" size={15} className="-rotate-90" />
              </Link>
              <a href="#cenik" className="pressable w-full sm:w-auto rounded-full glass border border-black/[0.08] px-7 py-3.5 text-sm font-semibold text-black/70 hover:text-black active:scale-[0.97] inline-flex items-center justify-center">
                Kolik to stojí?
              </a>
            </div>
            <p className="mt-4 text-xs text-black/45">Bez karty. Zaměstnanci se připojí jedním kódem.</p>
          </div>

          <figure className="relative lg:-mr-[14vw] xl:-mr-[10vw] rise-in" style={{ animationDelay: '120ms' }}>
            <div className="relative overflow-hidden rounded-[32px] border border-black/[0.06] shadow-[0_40px_90px_rgba(25,35,15,0.18)]">
              <img
                src="/brand/hero-tea-bar.webp"
                srcSet="/brand/hero-tea-bar-sm.webp 800w, /brand/hero-tea-bar.webp 1600w"
                sizes="(min-width: 1024px) 60vw, 100vw"
                alt="Pult čajovny: skleněná konvice nalévá čaj do limetkového šálku, v pozadí černé dózy v ranním světle"
                width={1600} height={900} loading="eager" fetchPriority="high"
                className="w-full aspect-[16/10] lg:aspect-[16/11] object-cover object-left ken-burns"
              />
            </div>
            {/* Plovoucí lístek z aplikace přes roh fotky — jediný kousek UI na
                celé stránce, a je to to, co ráno otevřete jako první. */}
            <figcaption className="absolute -bottom-5 left-4 sm:left-8 lg:-left-10 glass-strong rounded-[22px] px-4 py-3 shadow-[0_18px_44px_rgba(25,35,15,0.16)] rise-in" style={{ animationDelay: '320ms' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-black/50">Dnes ráno</p>
              <ul className="mt-1.5 space-y-1 text-sm text-[#16181A]">
                <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#C8F542] ring-2 ring-[#C8F542]/30 i-pulse" />Směna: Eva 8–16, Martin od 12</li>
                <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 ring-2 ring-amber-400/30" />Dochází sencha — objednávka připravená</li>
                <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-black/25 ring-2 ring-black/10" />Včerejší uzávěrka sedí na korunu</li>
              </ul>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Features: jedno velké téma a pak menší vedle sebe — bento místo tří
          stejných sloupců. První karta má prostor říct větu, ostatní heslo. */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-8 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-4 stagger">
          {FEATURES.map((f, i) => {
            const big = i === 0 || i === 3;
            // Řádky 4+2 / 2+4 / 3+3 — mřížka se nikde neopakuje a nikde nezůstane díra.
            const span = big ? 'sm:col-span-4' : i >= 4 ? 'sm:col-span-3' : 'sm:col-span-2';
            return (
              <div key={f.title} className={`glass-card p-6 sm:p-7 flex flex-col ${span} ${i === 3 ? 'sm:col-start-3' : ''}`}>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#C8F542]/20 text-[#5B7A08]">
                  <Icon name={f.icon} size={22} />
                </div>
                <h3 className={`mt-5 font-bold tracking-tight text-[#16181A] ${big ? 'text-2xl' : 'text-lg'}`}>{f.title}</h3>
                <p className={`mt-2 text-black/60 leading-relaxed text-pretty ${big ? 'text-base max-w-[52ch]' : 'text-sm'}`}>{f.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pricing */}
      <section id="cenik" className="max-w-4xl mx-auto px-5 sm:px-8 pb-16">
        {/* Nadpis vlevo nad souměrnými kartami — stránka drží těžiště vlevo od
            hero až dolů, ceník se nevrací do středu jako u šablon. */}
        <div className="max-w-xl">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#16181A]">Jednoduchý ceník</h2>
          <p className="mt-2 text-sm text-black/55 text-pretty">
            Během beta období je všechno odemčené zdarma. Nový podnik navíc dostane {TRIAL_DAYS} dní plné verze.
          </p>
        </div>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
          <div className="glass-card p-7 flex flex-col">
            <h3 className="font-bold tracking-tight text-[#16181A]">Zdarma</h3>
            <p className="mt-2 text-3xl font-bold tracking-tight text-[#16181A]">0 Kč</p>
            <p className="text-xs text-black/40 mt-1">navždy</p>
            <p className="mt-4 text-sm text-black/55">Základ pro malý tým: směny, úkoly, chat, uzávěrky a sklad.</p>
            <Link href="/register" className="mt-6 rounded-full glass border border-black/[0.08] px-6 py-3 text-sm font-semibold text-black/70 hover:text-black transition-colors text-center">
              Začít zdarma
            </Link>
          </div>
          <div className="glass-card p-7 flex flex-col relative overflow-hidden border-2 !border-[#C8F542]/60">
            <span className="absolute top-4 right-4 rounded-full bg-[#C8F542] text-black text-[11px] font-bold uppercase tracking-wider px-2.5 py-1">Doporučeno</span>
            <h3 className="font-bold tracking-tight text-[#16181A]">Pro</h3>
            <p className="mt-2 text-3xl font-bold tracking-tight text-[#16181A]">{PRO_PRICE.monthly} {PRO_PRICE.currency}</p>
            <p className="text-xs text-black/40 mt-1">{PRO_PRICE.per}</p>
            <p className="mt-4 text-sm text-black/55">Všechno bez limitů: neomezený tým, kiosk pro tablet, odměny, exporty a sdílené menu ve vašich barvách.</p>
            <Link href="/register" className="mt-6 rounded-full bg-[#16181A] text-white px-6 py-3 text-sm font-semibold hover:bg-black transition-colors text-center">
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
