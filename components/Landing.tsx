import Link from 'next/link';
import { LogoMark, Icon } from '@/components/Icons';
import { TRIAL_DAYS } from '@/lib/plan';
import Pricing from './Pricing';
import Tilt from './landing/Tilt';
import Reveal from './landing/Reveal';
import HeroMedia from './landing/HeroMedia';
import SpinShowcase from './landing/SpinShowcase';
import ForceLight from './landing/ForceLight';

// Prodejní stránka pro nepřihlášené — co Managero je, co umí a co stojí.
// Přihlášení ji nikdy nevidí (jdou rovnou do aplikace).
//
// Vizuální jazyk: světlé „tekuté sklo" (viz DESIGN.md → Landing je světlý
// ostrov), krémová s limetkou, hravé 3D objekty z clay renderů a skutečné
// produktové momenty ve skleněných kartách — žádné vymyšlené grafy ani
// loga zákazníků, která nemáme.

const B = '/brand/landing';

// ——— Funkce: dvanáct karet, každá jedna schopnost aplikace ————————————
const FEATURES: { icon: string; title: string; text: string; big?: boolean }[] = [
  { icon: 'calendar', big: true, title: 'Rozvrh a směny', text: 'Generátor rozvrhu podle dostupnosti a typů směn. Výměny, žádosti o volno, export do kalendáře v telefonu i tisk na nástěnku.' },
  { icon: 'clock', title: 'Docházka', text: 'Příchody a odchody z telefonu nebo tabletu. Hodiny a mzdové náklady bez excelu.' },
  { icon: 'coins', title: 'Uzávěrky', text: 'Bankovky, pohyby v kase, odvod — a férové vysvětlení každého rozdílu.' },
  { icon: 'box', big: true, title: 'Sklad, který hlídá zásoby', text: 'Minima, otevřená balení, inventura i ztráty. Když něco dochází, objednávka dodavateli odejde e-mailem rovnou z aplikace.' },
  { icon: 'cup', title: 'Receptury a marže', text: 'Cena každé položky spočítaná ze surovin. Víte, na čem vyděláváte.' },
  { icon: 'clipboard', title: 'Úkoly a postupy', text: 'Denní úkoly, otevírací a zavírací checklisty, návody pro nováčky.' },
  { icon: 'chat', title: 'Týmový chat', text: 'Kanály, přímé zprávy, přílohy i ankety. Všechno k podniku na jednom místě.' },
  { icon: 'play', title: 'Kiosk pro tablet', text: 'Jeden sdílený tablet za barem: docházka, úkoly, sklad. Velká tlačítka, žádná hesla.' },
  { icon: 'leaf', big: true, title: 'Stránka pro hosty', text: 'Menu přes QR, rezervace, objednávky od stolu, věrnostní kartičky a kupony. Ve vašich barvách a s vaším logem.' },
  { icon: 'tent', title: 'Akce a catering', text: 'Plánování akcí s balicími seznamy a týmem na místě.' },
  { icon: 'chart', title: 'Finance', text: 'Výdaje a přehledy. Export pro účetní na jedno kliknutí.' },
  { icon: 'sparkle', title: 'Poctivost v detailu', text: 'Když vypadne wifi, aplikace nelže: řekne, co se neuložilo, a rozepsané nezahodí.' },
];

// ——— Den s podnikem: čtyři momenty, v každém kousek skutečné aplikace ———
const DAY: { time: string; title: string; text: string; img: string; alt: string; card: React.ReactNode }[] = [
  {
    time: '7:30', title: 'Otevření bez přemýšlení',
    text: 'Otevírací checklist se odškrtává na tabletu. Kdo má dnes směnu, visí na nástěnce v aplikaci — a každému v kalendáři v telefonu.',
    img: `${B}/clock.webp`, alt: 'Hravý 3D budík',
    card: (
      <ul className="space-y-1.5 text-sm text-[#16181A]">
        <li className="flex items-center gap-2"><Icon name="check" size={14} className="text-[#5B7A08] shrink-0" />Otevírací postup 6/6</li>
        <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#C8F542] ring-2 ring-[#C8F542]/30 shrink-0" />Směna: Eva 8–16, Martin od 12</li>
        <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-black/25 ring-2 ring-black/10 shrink-0" />Dnes 2 úkoly na baru</li>
      </ul>
    ),
  },
  {
    time: '11:00', title: 'Sklad se hlídá sám',
    text: 'Mléko kleslo pod minimum, tak o sobě dalo vědět. Objednávka dodavateli je poskládaná — stačí ji odeslat. A příjem zboží zvládne kdokoli z tabletu.',
    img: `${B}/crate.webp`, alt: 'Hravá 3D bedýnka se zbožím',
    card: (
      <ul className="space-y-1.5 text-sm text-[#16181A]">
        <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 ring-2 ring-amber-400/30 shrink-0" />Mléko: zbývá na dnešek</li>
        <li className="flex items-center gap-2"><Icon name="mail" size={14} className="text-black/45 shrink-0" />Objednávka pro dodavatele připravená</li>
        <li className="flex items-center gap-2"><Icon name="check" size={14} className="text-[#5B7A08] shrink-0" />Odesláno a potvrzeno</li>
      </ul>
    ),
  },
  {
    time: '15:00', title: 'Hosté si objednají sami',
    text: 'QR na stole otevře menu ve vašich barvách. Objednávka od stolu, rezervace i věrnostní kartička — bez fronty u baru a bez další aplikace ke stažení.',
    img: `${B}/croissant.webp`, alt: 'Hravý 3D croissant',
    card: (
      <ul className="space-y-1.5 text-sm text-[#16181A]">
        <li className="flex items-center gap-2"><Icon name="bell" size={14} className="text-black/45 shrink-0" />Stůl 4: cappuccino a croissant</li>
        <li className="flex items-center gap-2"><Icon name="calendar" size={14} className="text-black/45 shrink-0" />Rezervace 18:00 potvrzená</li>
        <li className="flex items-center gap-2"><Icon name="gift" size={14} className="text-[#5B7A08] shrink-0" />Věrnostní kartička: 9. káva zdarma</li>
      </ul>
    ),
  },
  {
    time: '22:00', title: 'Uzávěrka, která sedí',
    text: 'Kasa se počítá po bankovkách, každý pohyb má vysvětlení. Ráno vidíte tržby, mzdové náklady dne i to, co se večer dopočítalo.',
    img: `${B}/till.webp`, alt: 'Hravá 3D pokladna s účtenkou',
    card: (
      <ul className="space-y-1.5 text-sm text-[#16181A]">
        <li className="flex items-center gap-2"><Icon name="coins" size={14} className="text-black/45 shrink-0" />Spočítáno po bankovkách</li>
        <li className="flex items-center gap-2"><Icon name="check" size={14} className="text-[#5B7A08] shrink-0" />Uzávěrka sedí na korunu</li>
        <li className="flex items-center gap-2"><Icon name="trend" size={14} className="text-black/45 shrink-0" />Přehled dne poslaný vedení</li>
      </ul>
    ),
  },
];

const FAQ: { q: string; a: string }[] = [
  { q: 'Potřebuju k vyzkoušení kartu?', a: `Ne. Registrace je bez karty a prvních ${TRIAL_DAYS} dní máte všechny funkce. Malý tým může zůstat na tarifu Zdarma napořád.` },
  { q: 'Jak se připojí zaměstnanci?', a: 'Jedním kódem nebo pozvánkou e-mailem. Připojí se z telefonu za minutu a hned vidí svůj rozvrh.' },
  { q: 'Funguje to na telefonu?', a: 'Ano — celá aplikace je stavěná pro telefon, tablet i počítač. Na tablet za barem je zvláštní kioskový režim s velkými tlačítky.' },
  { q: 'Máme ceny v eurech.', a: 'Měnu podniku si zvolíte a všechno — menu, uzávěrky, přehledy — počítá v ní.' },
  { q: 'Co se stane po zkušební době?', a: 'Vyberete si tarif, nebo zůstanete na Zdarma s menším týmem. Data zůstávají vaše, nic nemizí.' },
];

export default function Landing() {
  return (
    <div className="relative min-h-[100dvh] overflow-x-clip">
      <ForceLight />
      {/* Barevné skvrny pod sklem — celá stránka stojí na jedné vrstvě pozadí. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[130vh] overflow-hidden" aria-hidden>
        <div className="lg-blob lg-blob-lime w-[46rem] h-[46rem] -top-40 -right-40" />
        <div className="lg-blob lg-blob-peach w-[34rem] h-[34rem] top-[38rem] -left-52" />
        <div className="lg-blob lg-blob-sky w-[30rem] h-[30rem] top-[16rem] left-[38%]" />
      </div>

      {/* Header — skleněná lišta držící se horní hrany. */}
      <header className="sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 pt-3">
          <div className="lgx rounded-full px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <LogoMark size={32} />
              <span className="text-lg font-bold tracking-tight text-[#16181A] truncate">Managero</span>
            </div>
            <nav className="flex items-center gap-1 sm:gap-2 shrink-0">
              <a href="#funkce" className="hidden md:inline rounded-full px-3 py-2 text-sm font-medium text-black/60 hover:text-black transition-colors">Funkce</a>
              <a href="#cenik" className="hidden md:inline rounded-full px-3 py-2 text-sm font-medium text-black/60 hover:text-black transition-colors">Ceník</a>
              <Link href="/login" className="rounded-full px-2.5 sm:px-4 py-2 text-sm font-medium text-black/60 hover:text-black transition-colors whitespace-nowrap">
                Přihlásit
              </Link>
              <Link href="/register" className="rounded-full bg-[#C8F542] on-accent px-3.5 sm:px-5 py-2 text-sm font-semibold hover:brightness-105 transition-colors whitespace-nowrap">
                <span className="sm:hidden">Zdarma</span>
                <span className="hidden sm:inline">Vyzkoušet zdarma</span>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero: text vlevo, živá scéna vpravo. Scéna se naklání za kurzorem
          a kolem ní se vznášejí vystřižené objekty — ten „3D" dojem, ale
          obsah nesou skleněné karty se skutečnými momenty z aplikace. */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-10 sm:pt-16 pb-16 sm:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-12 lg:gap-8 items-center">
          <div className="max-w-xl rise-in">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/50">Pro kavárny, restaurace a bary</p>
            <h1 className="mt-4 text-[2.6rem] leading-[1.02] sm:text-6xl lg:text-[4.25rem] font-bold tracking-[-0.03em] text-[#16181A] text-balance">
              Provoz podniku na jednom místě.
            </h1>
            <p className="mt-6 text-base sm:text-lg text-black/60 leading-relaxed max-w-[46ch] text-pretty">
              Směny, docházka, uzávěrky, sklad, receptury, úkoly i chat — místo pěti aplikací
              a papírků jedna, které rozumí celý tým od první směny.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Link href="/register" className="pressable w-full sm:w-auto btn btn-accent btn-lg hover:brightness-105 active:scale-[0.97] shadow-[0_8px_24px_rgba(200,245,66,0.35)] inline-flex items-center justify-center gap-2">
                Vyzkoušet {TRIAL_DAYS} dní zdarma <Icon name="chevron" size={15} className="-rotate-90" />
              </Link>
              <a href="#funkce" className="pressable w-full sm:w-auto lgx rounded-full px-7 py-3.5 text-sm font-semibold text-black/70 hover:text-black active:scale-[0.97] inline-flex items-center justify-center">
                Co všechno umí?
              </a>
            </div>
            <p className="mt-4 text-xs text-black/45">Bez karty. Tým se připojí jedním kódem. Malý podnik zdarma napořád.</p>
          </div>

          <div className="relative rise-in" style={{ animationDelay: '120ms' }}>
            <Tilt>
              <figure className="relative">
                <div className="relative overflow-hidden rounded-[2rem] border border-white/70 shadow-[0_40px_90px_rgba(25,35,15,0.18)]">
                  <HeroMedia poster={`${B}/hero.webp`} video={`${B}/hero.mp4`}
                    alt="Hravá 3D scéna kavárenského pultu: kávovar, hrníčky, croissant a tablet v krémové a limetkové" />
                </div>
                {/* Skleněné karty se skutečnými momenty z aplikace. */}
                <figcaption className="absolute -bottom-6 left-3 sm:-left-8 lgx-strong rounded-3xl px-4 py-3 shadow-[0_18px_44px_rgba(25,35,15,0.16)]" style={{ transform: 'translateZ(46px)' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-black/50">Dnes ráno</p>
                  <ul className="mt-1.5 space-y-1 text-sm text-[#16181A]">
                    <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#C8F542] ring-2 ring-[#C8F542]/30 i-pulse shrink-0" />Směna: Eva 8–16, Martin od 12</li>
                    <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 ring-2 ring-amber-400/30 shrink-0" />Dochází mléko — objednávka připravená</li>
                    <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-black/25 ring-2 ring-black/10 shrink-0" />Včerejší uzávěrka sedí na korunu</li>
                  </ul>
                </figcaption>
                <div className="absolute -top-8 -right-4 sm:-right-8 w-24 sm:w-32 lg-float-a drop-shadow-[0_18px_24px_rgba(25,35,15,0.18)]" style={{ transform: 'translateZ(70px)' }} aria-hidden>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${B}/cup.webp`} alt="" width={256} height={256} loading="lazy" className="w-full h-auto" />
                </div>
                <div className="hidden sm:block absolute top-[58%] sm:-left-7 w-28 lg-float-b drop-shadow-[0_16px_22px_rgba(25,35,15,0.16)]" style={{ transform: 'translateZ(56px)' }} aria-hidden>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${B}/croissant.webp`} alt="" width={224} height={224} loading="lazy" className="w-full h-auto" />
                </div>
              </figure>
            </Tilt>
          </div>
        </div>

        {/* Fakta místo vymyšlených čísel: tři věci, které o produktu platí. */}
        <Reveal className="mt-20 sm:mt-24">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              ['1 aplikace', 'místo rozvrhu v excelu, skladu v sešitě a skupinového chatu jinde'],
              [`${TRIAL_DAYS} dní zdarma`, 'všechny funkce, bez karty — a malý tým zdarma napořád'],
              ['1 kód', 'tolik stačí, aby se připojil celý tým i s rozvrhem v telefonu'],
            ].map(([n, t]) => (
              <div key={n} className="lgx rounded-3xl px-6 py-5">
                <p className="text-2xl font-bold tracking-tight text-[#16181A]">{n}</p>
                <p className="mt-1 text-sm text-black/55 text-pretty">{t}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Den s podnikem: čtyři momenty. Střídavé řazení, v každé kartě
          kousek skutečného rozhraní — ať je vidět produkt, ne jen slova. */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24">
        <div className="max-w-xl">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#16181A]">Jeden den s Managerem</h2>
          <p className="mt-3 text-base text-black/55 text-pretty">Od otevření po uzávěrku — takhle vypadá den, kdy nic nedrží na papírku.</p>
        </div>
        <div className="mt-10 space-y-6">
          {DAY.map((d, i) => (
            <Reveal key={d.time} delay={i % 2 ? 80 : 0}>
              <div className={`lgx rounded-[2rem] p-6 sm:p-8 grid grid-cols-1 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 items-center ${i % 2 ? 'md:[&>*:first-child]:order-2' : ''}`}>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/45">{d.time}</p>
                  <h3 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-[#16181A]">{d.title}</h3>
                  <p className="mt-3 text-sm sm:text-base text-black/60 leading-relaxed max-w-[52ch] text-pretty">{d.text}</p>
                  <div className="mt-5 lgx-strong rounded-2xl px-4 py-3 inline-block">{d.card}</div>
                </div>
                <div className="flex justify-center md:justify-end">
                  <div className={`w-40 sm:w-52 ${['lg-float-a', 'lg-float-b', 'lg-float-c'][i % 3]} drop-shadow-[0_22px_30px_rgba(25,35,15,0.16)]`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.img} alt={d.alt} width={416} height={416} loading="lazy" className="w-full h-auto" />
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Funkce: bento mřížka. Velké karty mají prostor na větu, malé heslo. */}
      <section id="funkce" className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24 scroll-mt-24">
        <div className="max-w-xl">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#16181A]">Všechno, co provoz potřebuje</h2>
          <p className="mt-3 text-base text-black/55 text-pretty">Dvanáct věcí, které jinak děláte ve třech aplikacích, dvou sešitech a jedné hlavě.</p>
        </div>
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-6 gap-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 70} className={f.big ? 'sm:col-span-4' : 'sm:col-span-2'}>
              <div className="lgx rounded-3xl p-6 sm:p-7 flex flex-col h-full">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#C8F542]/25 text-[#5B7A08]">
                  <Icon name={f.icon} size={22} />
                </div>
                <h3 className={`mt-5 font-bold tracking-tight text-[#16181A] ${f.big ? 'text-2xl' : 'text-lg'}`}>{f.title}</h3>
                <p className={`mt-2 text-black/60 leading-relaxed text-pretty ${f.big ? 'text-base max-w-[52ch]' : 'text-sm'}`}>{f.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Hosté: druhá polovina produktu — to, co vidí zákazník. */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24">
        <Reveal>
          <div className="lgx rounded-[2rem] p-6 sm:p-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/45">Managero client</p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-[#16181A]">Vlastní stránka podniku, kterou hosté opravdu použijí</h2>
              <ul className="mt-5 space-y-3 text-sm sm:text-base text-black/60">
                <li className="flex items-start gap-2.5"><Icon name="check" size={16} className="text-[#5B7A08] mt-0.5 shrink-0" /><span><strong className="text-[#16181A] font-semibold">Menu přes QR</strong> — vždycky aktuální, ve vašich barvách, bez cen ze skladu.</span></li>
                <li className="flex items-start gap-2.5"><Icon name="check" size={16} className="text-[#5B7A08] mt-0.5 shrink-0" /><span><strong className="text-[#16181A] font-semibold">Rezervace s potvrzením</strong> — host hned ví, že místo má.</span></li>
                <li className="flex items-start gap-2.5"><Icon name="check" size={16} className="text-[#5B7A08] mt-0.5 shrink-0" /><span><strong className="text-[#16181A] font-semibold">Objednávka od stolu</strong> — s ověřením, že host sedí u vás, ne přes ulici.</span></li>
                <li className="flex items-start gap-2.5"><Icon name="check" size={16} className="text-[#5B7A08] mt-0.5 shrink-0" /><span><strong className="text-[#16181A] font-semibold">Věrnostní kartičky a kupony</strong> — v telefonu, bez razítek a bez tisku.</span></li>
              </ul>
            </div>
            {/* Telefon ve skle: mini-náhled hostovské stránky. */}
            <div className="flex justify-center">
              <div className="lgx-strong rounded-[2rem] p-4 w-64 shadow-[0_30px_70px_rgba(25,35,15,0.16)]">
                <div className="rounded-3xl bg-white/80 border border-black/[0.05] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-black/45">Kavárna U Lípy</p>
                  <p className="mt-1 text-lg font-bold tracking-tight text-[#16181A]">Dobrý den ☀️</p>
                  <div className="mt-3 space-y-2">
                    <div className="rounded-2xl bg-[#C8F542]/20 px-3 py-2.5 text-sm font-semibold text-[#3E5406] flex items-center gap-2"><Icon name="menu" size={14} className="shrink-0" />Nabídka</div>
                    <div className="rounded-2xl bg-black/[0.04] px-3 py-2.5 text-sm font-medium text-[#16181A] flex items-center gap-2"><Icon name="calendar" size={14} className="text-black/45 shrink-0" />Rezervovat stůl</div>
                    <div className="rounded-2xl bg-black/[0.04] px-3 py-2.5 text-sm font-medium text-[#16181A] flex items-center gap-2"><Icon name="gift" size={14} className="text-black/45 shrink-0" />Kartička · 7/10</div>
                  </div>
                  <p className="mt-3 text-[11px] text-black/45">Objednávka od stolu 4 přijatá ✓</p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Malý moment radosti: hrníček vytočený dokola. Dekorace s obsahem —
          říká, že detailům věnujeme péči. */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24">
        <Reveal>
          <div className="lgx rounded-[2rem] p-6 sm:p-10 grid grid-cols-1 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-8 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#16181A]">Ze všech stran dobré.</h2>
              <p className="mt-3 text-base text-black/60 leading-relaxed max-w-[52ch] text-pretty">
                Hrníček jsme si vytočili dokola, protože detaily nás baví. Se stejnou péčí hlídáme
                každou korunu v uzávěrce, každé balení ve skladu a každou směnu v rozvrhu.
              </p>
            </div>
            <SpinShowcase video={`${B}/cup-spin.mp4`} fallback={`${B}/cup.webp`} alt="Hrníček na espresso s limetkovým okrajem v pomalé otočce" />
          </div>
        </Reveal>
      </section>

      {/* Pricing */}
      <Pricing />

      {/* FAQ: nativní <details> — funguje bez skriptu a s klávesnicí. */}
      <section className="relative max-w-3xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#16181A]">Časté otázky</h2>
        <div className="mt-6 space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="lgx rounded-3xl px-6 py-4 group">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-sm sm:text-base font-semibold text-[#16181A] tap-target">
                {f.q}
                <Icon name="chevron" size={16} className="text-black/40 transition-transform group-open:rotate-180 shrink-0" />
              </summary>
              <p className="mt-3 text-sm text-black/60 leading-relaxed text-pretty">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Závěrečné CTA */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-20">
        <Reveal>
          <div className="lgx-strong rounded-[2rem] px-6 sm:px-12 py-10 sm:py-14 text-center relative overflow-hidden">
            <div className="lg-blob lg-blob-lime w-72 h-72 -top-24 -right-16" aria-hidden />
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#16181A] text-balance">Zítřejší směna už může viset v aplikaci.</h2>
            <p className="mt-3 text-base text-black/55 max-w-md mx-auto text-pretty">Registrace bez karty. Tým se připojí jedním kódem a hned vidí, kdy jde do práce.</p>
            <Link href="/register" className="pressable mt-7 btn btn-accent btn-lg hover:brightness-105 active:scale-[0.97] shadow-[0_8px_24px_rgba(200,245,66,0.4)] inline-flex items-center justify-center gap-2">
              Vyzkoušet {TRIAL_DAYS} dní zdarma <Icon name="chevron" size={15} className="-rotate-90" />
            </Link>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/[0.06] relative">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-black/40">
          <div className="flex items-center gap-2">
            <LogoMark size={22} />
            <span>Managero — systém pro správu podniku</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#funkce" className="tap-target-sm inline-flex items-center hover:text-black transition-colors">Funkce</a>
            <Link href="/login" className="tap-target-sm inline-flex items-center hover:text-black transition-colors">Přihlášení</Link>
            <Link href="/register" className="tap-target-sm inline-flex items-center hover:text-black transition-colors">Registrace</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
