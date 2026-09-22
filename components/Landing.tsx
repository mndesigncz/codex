import Link from 'next/link';
import { LogoMark, Icon } from '@/components/Icons';
import { TRIAL_DAYS } from '@/lib/plan';
import Pricing from './Pricing';
import Reveal from './landing/Reveal';
import Foto from './landing/Foto';
import Pas from './landing/Pas';
import HeroVideo from './landing/HeroVideo';
import Zarizeni from './landing/Zarizeni';
import FeatureShowcase, { type Funkce } from './landing/FeatureShowcase';
import ForceLight from './landing/ForceLight';
import LandingHeader from './landing/LandingHeader';
import Naklon from './landing/Naklon';
import Stena from './landing/Stena';
import type { FotoId } from './landing/foto';

// Prodejní stránka pro nepřihlášené — co Managero je, co umí a co stojí.
// Přihlášení ji nikdy nevidí (jdou rovnou do aplikace).
//
// Vizuální jazyk: světlé „tekuté sklo" (viz DESIGN.md → Landing je světlý
// ostrov), krémová s limetkou — a nově skutečná fotografie podniků.
//
// Co odsud zmizelo a proč: uprostřed hero stála živá 3D scéna s hrnkem.
// Technicky to bylo v pořádku (procedurální geometrie, nula bajtů modelu),
// ale prodávala špatnou věc. Návštěvník téhle stránky nekupuje hrnek, kupuje
// klid v provozu — a ten je vidět na lidech v zástěrách, ne na renderu.
// Fotka podniku navíc odpoví na otázku „je to pro mě?" dřív, než kdo dočte
// nadpis.

// ——— Funkce: dvanáct karet, každá jedna schopnost aplikace ————————————
const FEATURES: Funkce[] = [
  { id: 'rozvrh', icon: 'calendar', title: 'Rozvrh a směny', text: 'Generátor rozvrhu podle dostupnosti a typů směn. Kolize si najde sám a řekne o ní dřív, než ji podepíšeš. Výměny, žádosti o volno, export do kalendáře v telefonu i tisk na nástěnku.' },
  { id: 'dochazka', icon: 'clock', title: 'Docházka', text: 'Příchody a odchody z telefonu nebo z tabletu za barem. Odpracované hodiny a mzdové náklady se počítají samy, bez excelu a bez dohadování na konci měsíce.' },
  { id: 'uzaverky', icon: 'coins', title: 'Uzávěrky', text: 'Bankovky, pohyby v kase, odvod do trezoru. Rozdíl se nezamlčí ani nezaokrouhlí: aplikace ukáže, kde vznikl, a nechá ho vysvětlit.' },
  { id: 'sklad', icon: 'box', title: 'Sklad, který hlídá zásoby', text: 'Minima, otevřená balení, inventura i ztráty. Když něco klesne pod minimum, objednávka pro dodavatele je poskládaná. Stačí ji odeslat a odejde e-mailem rovnou z aplikace.' },
  { id: 'receptury', icon: 'cup', title: 'Receptury a marže', text: 'Cena každé položky spočítaná ze surovin až na gramy. Víte, na čem vyděláváte a co se vyplatí přecenit dřív, než to udělá dodavatel za vás.' },
  { id: 'ukoly', icon: 'clipboard', title: 'Úkoly a postupy', text: 'Denní úkoly, otevírací a zavírací checklisty, návody pro nováčky. Odškrtává se na mobilu i na tabletu a je vidět, co se dodělalo a co ne.' },
  { id: 'chat', icon: 'chat', title: 'Týmový chat', text: 'Kanály, přímé zprávy, přílohy i ankety. Všechno k podniku na jednom místě, ne rozeseté ve třech skupinách na sociálních sítích.' },
  { id: 'kiosk', icon: 'play', title: 'Kiosk pro tablet', text: 'Jeden sdílený tablet za barem: docházka, úkoly, sklad. Velká tlačítka, klepnutí na jméno, žádná hesla u baru, kde má člověk mokré ruce.' },
  { id: 'hoste', icon: 'leaf', title: 'Stránka pro hosty', text: 'Menu přes QR, rezervace, objednávky od stolu, věrnostní kartičky a kupony. Ve vašich barvách a s vaším logem, na vlastní adrese.' },
  { id: 'akce', icon: 'tent', title: 'Akce a catering', text: 'Plánování akcí s balicími seznamy a týmem na místě. Co se má naložit, kdo jede a co se tam bude podávat, na jednom papíře, který se neztratí.' },
  { id: 'finance', icon: 'chart', title: 'Finance', text: 'Tržby, nákupy a mzdy měsíce pohromadě, s hrubým výsledkem. Export pro účetní na jedno kliknutí, ve formátu, který si nebude stěžovat.' },
  { id: 'poctivost', icon: 'sparkle', title: 'Poctivost v detailu', text: 'Když vypadne wifi, aplikace nelže: řekne, co se neuložilo, rozepsané nezahodí a po návratu spojení to dopíše. Drobnost, která rozhoduje o důvěře.' },
];

// ——— Den s podnikem: čtyři momenty. Fotka říká kde, karta co ————————
const DAY: { time: string; title: string; text: string; foto: FotoId; card: React.ReactNode }[] = [
  {
    time: '7:30', title: 'Otevření bez přemýšlení', foto: 'kavarna',
    text: 'Otevírací checklist se odškrtává na tabletu. Kdo má dnes směnu, visí na nástěnce v aplikaci a každému v kalendáři v telefonu.',
    card: (
      <ul className="space-y-1.5 text-sm text-[#16181A]">
        <li className="flex items-center gap-2"><Icon name="check" size={14} className="text-[#5B7A08] shrink-0" />Otevírací postup 6/6</li>
        <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full dot-ok shrink-0" />Směna: Eva 8-16, Martin od 12</li>
        <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full dot-muted shrink-0" />Dnes 2 úkoly na baru</li>
      </ul>
    ),
  },
  {
    time: '11:00', title: 'Sklad se hlídá sám', foto: 'pekarna',
    text: 'Mléko kleslo pod minimum, tak o sobě dalo vědět. Objednávka dodavateli je poskládaná, stačí ji odeslat. A příjem zboží zvládne kdokoli z tabletu.',
    card: (
      <ul className="space-y-1.5 text-sm text-[#16181A]">
        <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full dot-wait shrink-0" />Mléko: zbývá na dnešek</li>
        <li className="flex items-center gap-2"><Icon name="mail" size={14} className="text-black/45 shrink-0" />Objednávka pro dodavatele připravená</li>
        <li className="flex items-center gap-2"><Icon name="check" size={14} className="text-[#5B7A08] shrink-0" />Odesláno a potvrzeno</li>
      </ul>
    ),
  },
  {
    time: '15:00', title: 'Hosté si objednají sami', foto: 'host',
    text: 'QR na stole otevře menu ve vašich barvách. Objednávka od stolu, rezervace i věrnostní kartička, bez fronty u baru a bez další aplikace ke stažení.',
    card: (
      <ul className="space-y-1.5 text-sm text-[#16181A]">
        <li className="flex items-center gap-2"><Icon name="bell" size={14} className="text-black/45 shrink-0" />Stůl 4: cappuccino a croissant</li>
        <li className="flex items-center gap-2"><Icon name="calendar" size={14} className="text-black/45 shrink-0" />Rezervace 18:00 potvrzená</li>
        <li className="flex items-center gap-2"><Icon name="gift" size={14} className="text-[#5B7A08] shrink-0" />Věrnostní kartička: 9. káva zdarma</li>
      </ul>
    ),
  },
  {
    time: '22:00', title: 'Uzávěrka, která sedí', foto: 'bar',
    text: 'Kasa se počítá po bankovkách, každý pohyb má vysvětlení. Ráno vidíte tržby, mzdové náklady dne i to, co se večer dopočítalo.',
    card: (
      <ul className="space-y-1.5 text-sm text-[#16181A]">
        <li className="flex items-center gap-2"><Icon name="coins" size={14} className="text-black/45 shrink-0" />Spočítáno po bankovkách</li>
        <li className="flex items-center gap-2"><Icon name="check" size={14} className="text-[#5B7A08] shrink-0" />Uzávěrka sedí na korunu</li>
        <li className="flex items-center gap-2"><Icon name="trend" size={14} className="text-black/45 shrink-0" />Přehled dne poslaný vedení</li>
      </ul>
    ),
  },
];

// ——— Místo čeho. Nejpoctivější prodejní argument, jaký tahle stránka má:
//     nevyjmenovat funkce, ale ukázat, co konkrétně z provozu zmizí. ———
const MISTO: { pryc: string; misto: string }[] = [
  { pryc: 'Rozvrh v tabulce, kterou má každý jinak starou', misto: 'Jeden rozvrh, který má celý tým v telefonu a v kalendáři' },
  { pryc: 'Docházka na papírku u kasy', misto: 'Příchod klepnutím, hodiny i mzdové náklady se sečtou samy' },
  { pryc: 'Sklad v sešitě, který po měsíci nikdo nevede', misto: 'Minima hlídá aplikace a objednávku dodavateli poskládá' },
  { pryc: 'Uzávěrka zapsaná do bloku pod kasou', misto: 'Kasa po bankovkách a rozdíl, který se nezamlčí' },
  { pryc: 'Ceny nápojů odhadem „tak nějak to vychází"', misto: 'Marže spočítaná ze surovin na gramy' },
  { pryc: 'Skupinový chat, kde zapadne i důležitá věc', misto: 'Kanály podniku, ankety a oznámení, která dojdou všem' },
  { pryc: 'Rezervace v e-mailu, na papíře a v hlavě', misto: 'Potvrzení hostovi hned a přehled na jednom místě' },
  { pryc: 'Objednávka dodavateli po telefonu, na kterou si nikdo nevzpomene', misto: 'Objednávka z aplikace e-mailem, s potvrzením, že došla' },
];
// Osm, ne sedm: mřížka má dva sloupce a lichý počet nechá poslední řádek zet.

// ——— Jak začít. Tři kroky, ne pět — pátý krok nikdo nedočte. ————————
const KROKY: { n: string; icon: string; title: string; text: string }[] = [
  { n: '1', icon: 'plus', title: 'Založ podnik', text: 'Název, měna, otevírací doba. Dvě minuty a máš prázdný, ale hotový podnik, bez schůzky s obchodníkem a bez implementace.' },
  { n: '2', icon: 'users', title: 'Pozvi tým jedním kódem', text: 'Kód nebo pozvánka e-mailem. Lidé se připojí z vlastního telefonu a hned vidí, kdy jdou do práce. Nic se neinstaluje.' },
  { n: '3', icon: 'calendar', title: 'Pověs první rozvrh', text: 'Generátor rozvrh navrhne podle dostupnosti, ty ho projdeš a zveřejníš. Od té chvíle nikdo nevolá, „kdy mám zítra".' },
];

// ——— Jistoty. Čtyři otázky, na které se majitel ptá dřív než na cenu. —
const JISTOTY: { icon: string; title: string; text: string }[] = [
  { icon: 'archive', title: 'Data jsou vaše', text: 'Export kdykoli: rozvrh, docházka i finance ve formátu, který účetní otevře. Nic se nemaže ani po konci předplatného.' },
  { icon: 'lock', title: 'Každý vidí jen své', text: 'Vlastník, manažer, brigádník. Kdo nemá vidět mzdy, nevidí je, ani omylem přes odkaz.' },
  { icon: 'key', title: 'Tablet za barem bez hesel', text: 'Kioskový režim: klepnutí na jméno místo přihlášení. Sdílené zařízení nemá komu vyzradit heslo, když žádné nemá.' },
  { icon: 'warning', title: 'Výpadek wifi nelže', text: 'Aplikace řekne, co neprošlo, rozepsané nezahodí a po návratu spojení to dopíše. Neukáže starý stav jako nový.' },
];

const FAQ: { q: string; a: string }[] = [
  { q: 'Potřebuju k vyzkoušení kartu?', a: `Nemusíte. Při zakládání podniku si vyberete: buď kartu zadáte rovnou a po ${TRIAL_DAYS} dnech se předplatné samo spustí, nebo ji přeskočíte a zůstanete na tarifu Zdarma. Malý tým na něm může zůstat napořád.` },
  { q: 'Jak se připojí zaměstnanci?', a: 'Jedním kódem nebo pozvánkou e-mailem. Připojí se z telefonu za minutu a hned vidí svůj rozvrh. Nic se neinstaluje, je to webová aplikace, která si jde připnout na plochu.' },
  { q: 'Funguje to na telefonu?', a: 'Ano, celá aplikace je stavěná pro telefon, tablet i počítač. Na tablet za barem je zvláštní kioskový režim s velkými tlačítky.' },
  { q: 'Máme ceny v eurech.', a: 'Měnu podniku si zvolíte a všechno (menu, uzávěrky, přehledy) počítá v ní. Host vidí ceny v měně podniku, ne v korunách.' },
  { q: 'Co se stane po zkušební době?', a: 'Vyberete si tarif, nebo zůstanete na Zdarma s menším týmem. Data zůstávají vaše, nic nemizí.' },
  { q: 'Máme víc poboček.', a: 'Každá pobočka má vlastní rozvrh, sklad i uzávěrky, a vedení vidí všechny pohromadě. Člověk může patřit do víc poboček a přepíná se mezi nimi.' },
  { q: 'Nahradí to pokladnu?', a: 'Ne a nechce. Managero řeší provoz kolem pokladny: lidi, sklad, receptury, uzávěrky a hosty. Tržby se do něj dají přenést, samotné účtování zůstává na pokladně.' },
  { q: 'Kolik to zabere času na začátku?', a: 'Podnik založíte za pár minut, tým se připojí kódem. Sklad a receptury se dají doplňovat postupně. Na to, aby začal fungovat rozvrh a docházka, je čekat nemusíte.' },
  { q: 'Co když to týmu nesedne?', a: 'Zrušíte předplatné, data si vyexportujete a nic dalšího neřešíte. Žádná výpovědní lhůta a žádný telefonát s retencí.' },
];

// Tlačítko hlavní akce. Na telefonu přes celou šířku — pravidlo z DESIGN.md,
// které tahle stránka v závěrečném CTA porušovala: pilulka končila v 79 %
// šířky obrazovky a vedle ní zbyl prázdný pruh.
function Zkusit({ className = '' }: { className?: string }) {
  return (
    <Link href="/register" className={`pressable w-full sm:w-auto btn btn-accent btn-lg hover:brightness-105 active:scale-[0.97] shadow-[0_8px_24px_rgba(200,245,66,0.35)] inline-flex items-center justify-center gap-2 ${className}`}>
      Vyzkoušet {TRIAL_DAYS} dní zdarma <Icon name="chevron" size={15} className="-rotate-90" />
    </Link>
  );
}

export default function Landing() {
  return (
    <div className="relative min-h-[100dvh] overflow-x-clip">
      <ForceLight />
      {/* Barevné skvrny pod sklem — celá stránka stojí na jedné vrstvě pozadí. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[130vh] overflow-hidden" aria-hidden>
        <div className="lg-blob lg-blob-lime w-[46rem] h-[46rem] -top-40 -right-40" />
        <div className="lg-blob lg-blob-cream w-[34rem] h-[34rem] top-[38rem] -left-52" />
        <div className="lg-blob lg-blob-lime-2 w-[30rem] h-[30rem] top-[16rem] left-[38%]" />
      </div>

      <LandingHeader />

      {/* Hero: text vlevo, fotka podniku vpravo. Karta s dnešním ránem leží
          na telefonu POD fotkou a teprve od 640 px na ní — plovoucí prvek
          na 360 px vždycky něco zakryje. */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-10 sm:pt-16 pb-10 sm:pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-10 lg:gap-12 items-center">
          <div className="max-w-xl rise-in">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/50">Pro kavárny, restaurace a bary</p>
            <h1 className="mt-4 text-[2.6rem] leading-[1.02] sm:text-5xl lg:text-[3.5rem] font-bold tracking-[-0.03em] text-[#16181A] text-balance">
              Provoz podniku na jednom místě.
            </h1>
            <p className="mt-6 text-base sm:text-lg text-black/60 leading-relaxed max-w-[46ch] text-pretty">
              Směny, docházka, uzávěrky, sklad, receptury, úkoly i chat. Jedna aplikace
              místo pěti a papírků, které rozumí celý tým od první směny.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Zkusit />
              <a href="#funkce" className="pressable w-full sm:w-auto btn btn-secondary btn-lg active:scale-[0.97] inline-flex items-center justify-center">
                Co všechno umí?
              </a>
            </div>
          </div>

          <div className="relative rise-in" style={{ animationDelay: '120ms' }}>
            <Naklon className="relative mx-auto w-full max-w-[34rem]">
              <div className="lg-blob lg-blob-lime-2 absolute inset-8 -z-10" aria-hidden />
              {/* Jediná fotka, která se načítá hned. Od 768 px nad ní ožije
                  video vyrobené z téže fotky — na telefonu zůstane fotka. */}
              <div className="naklon-vrstva foto-ramec aspect-[4/5]" style={{ ['--hloubka' as string]: -0.35 }}>
                <Foto id="barista" bezRamu sizes="(max-width: 1024px) 92vw, 34rem" priority />
                <HeroVideo src="/brand/landing/foto/barista" />
              </div>
              {/* Produkt v prostoru: skutečná scéna rozvrhu v tabletu, lehce
                  natočená nad fotkou. Na telefonu leží pod fotkou — schovat
                  produkt na nejčastější obrazovce by popřelo smysl hero. */}
              <div className="naklon-vrstva mt-4 sm:mt-0 sm:absolute sm:-top-6 sm:-right-3 lg:-right-5 xl:-right-8 w-full sm:w-[17rem] lg:w-[19.5rem]" style={{ ['--hloubka' as string]: 1.7 }}>
                <Zarizeni scena="rozvrh" />
              </div>
              <div className="naklon-vrstva hidden sm:block sm:absolute sm:bottom-4 sm:-left-4 lgx-strong rounded-3xl px-4 py-3 shadow-[0_18px_44px_rgba(25,35,15,0.16)]" style={{ ['--hloubka' as string]: 1.1 }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-black/50">Dnes ráno</p>
                <ul className="mt-1.5 space-y-1 text-sm text-[#16181A]">
                  <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full dot-ok i-pulse shrink-0" />Směna: Eva 8-16, Martin od 12</li>
                  <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full dot-wait shrink-0" />Dochází mléko, objednávka připravená</li>
                  <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full dot-muted shrink-0" />Včerejší uzávěrka sedí na korunu</li>
                </ul>
              </div>
            </Naklon>
          </div>
        </div>
      </section>

      {/* Pás podniků — jede přes celou šířku okna, proto stojí mimo mřížku. */}
      <section className="relative pb-14 sm:pb-20" aria-labelledby="pas-nadpis">
        <h2 id="pas-nadpis" className="sr-only">Pro jaké podniky je Managero</h2>
        <Pas />
      </section>

      {/* Fakta místo vymyšlených čísel: čtyři věci, které o produktu platí.
          Bez karet: čtyři stejné bílé dlaždice vedle sebe jsou šablona, ne
          sdělení. Číslo, věta, linka mezi nimi. */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-y-6 sm:gap-x-8 lg:divide-x lg:divide-black/[0.08]">
          {[
            ['1 aplikace', 'místo rozvrhu v excelu, skladu v sešitě a skupinového chatu jinde'],
            [`${TRIAL_DAYS} dní zdarma`, 'všechny funkce; kartu můžeš zadat hned, nebo vůbec'],
            ['1 kód', 'tolik stačí, aby se připojil celý tým i s rozvrhem v telefonu'],
            ['Zdarma napořád', 'malý tým zůstává na bezplatném tarifu, ne jen na zkoušku'],
          ].map(([n, t], i) => (
            <Reveal key={n} delay={i * 70} className="lg:px-8 first:lg:pl-0 last:lg:pr-0">
              <p className="text-2xl lg:text-[1.7rem] font-bold tracking-tight text-[#16181A] whitespace-nowrap">{n}</p>
              <p className="mt-1.5 text-sm text-black/55 text-pretty max-w-[28ch]">{t}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Stěna obrazovek: celá aplikace v prostoru, ne jedna obrazovka. */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24">
        <div className="max-w-xl">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#16181A]">Celá aplikace, ne jedna obrazovka</h2>
          <p className="mt-3 text-base text-black/55 text-pretty">Sklad, kasa a peníze vedle sebe. Tři sešity, které v podniku obvykle nikdo nevede do konce. Tady se vedou samy a navzájem si sedí.</p>
        </div>
        <Stena />
      </section>

      {/* Den s podnikem: čtyři momenty. Fotka podniku, kus skutečného
          rozhraní a věta, co se v tu hodinu doopravdy děje. */}
      <section id="den" className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24 scroll-mt-24">
        <div className="max-w-xl">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#16181A]">Jeden den s Managerem</h2>
          <p className="mt-3 text-base text-black/55 text-pretty">Od otevření po uzávěrku. Takhle vypadá den, kdy nic nedrží na papírku.</p>
        </div>
        {/* Čtyři karty ve dvou sloupcích, fotka nahoře a moment z aplikace
            přesahující přes její spodní hranu. Dřív čtyři cik-cak splity pod
            sebou, po nich kiosk a hosté v témže tvaru: šest stejných řádků. */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
          {DAY.map((d, i) => (
            <Reveal key={d.time} delay={(i % 2) * 80} className="h-full">
              <article className="lgx rounded-[2rem] p-3 sm:p-4 h-full flex flex-col">
                <Foto id={d.foto} pomer="aspect-[16/10]" sizes="(max-width: 768px) 90vw, 34rem" />
                <div className="relative z-10 -mt-8 mx-3 sm:mx-5 w-fit max-w-full lgx-strong rounded-2xl px-4 py-3.5 shadow-[0_18px_44px_rgba(25,35,15,0.16)]">{d.card}</div>
                <div className="px-3 sm:px-5 pt-5 pb-3 sm:pb-4 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="chip chip-ink tabular-nums">{d.time}</span>
                    <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-[#16181A]">{d.title}</h3>
                  </div>
                  <p className="mt-3 text-sm sm:text-base text-black/60 leading-relaxed text-pretty">{d.text}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Funkce: výběr vlevo, přehrávaná scéna vpravo. */}
      <section id="funkce" className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24 scroll-mt-24">
        <div className="max-w-xl">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#16181A]">Všechno, co provoz potřebuje</h2>
          <p className="mt-3 text-base text-black/55 text-pretty">Vyber si funkci a podívej se, jak se používá. Dvanáct věcí, které jinak děláte ve třech aplikacích, dvou sešitech a jedné hlavě.</p>
        </div>
        <FeatureShowcase funkce={FEATURES} />
      </section>

      {/* Místo čeho: co z provozu doopravdy zmizí. Pruh přes celou šířku
          v tónu limetky, osm dvojic bez karet. Karta kolem dvou řádků textu
          nic nesděluje; barva pod celou sekcí říká, že tohle je jiný druh
          argumentu než seznam funkcí. */}
      <section className="relative pb-16 sm:pb-24">
        <div className="bg-[#C8F542]/15 py-14 sm:py-20">
          <div className="max-w-6xl mx-auto px-5 sm:px-8">
            <div className="max-w-xl">
              <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#16181A]">Místo čeho</h2>
              <p className="mt-3 text-base text-black/55 text-pretty">Managero se neměří tím, kolik toho umí, ale tím, co po jeho zapnutí z provozu zmizí.</p>
            </div>
            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-7">
              {MISTO.map((m, i) => (
                <Reveal key={m.pryc} delay={(i % 2) * 60}>
                  <p className="flex items-start gap-2.5 text-sm text-black/50 line-through decoration-black/30">
                    <Icon name="close" size={15} className="mt-0.5 shrink-0 text-black/35" aria-hidden />
                    <span className="no-underline">{m.pryc}</span>
                  </p>
                  <p className="mt-2 flex items-start gap-2.5 text-base sm:text-lg font-semibold text-[#16181A]">
                    <Icon name="check" size={17} className="mt-1 shrink-0 text-[#5B7A08]" aria-hidden />
                    <span>{m.misto}</span>
                  </p>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Kiosk: tablet za barem. Fotka vlevo, skutečná obrazovka vpravo. */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24">
        <Reveal>
          <div className="lgx rounded-[2rem] p-5 sm:p-10 grid grid-cols-1 md:grid-cols-2 gap-8 md:items-stretch">
            <Foto id="tablet" pomer="aspect-[4/3]" className="foto-vypln md:min-h-[18rem]" sizes="(max-width: 768px) 90vw, 28rem" />
            <div className="flex flex-col justify-center">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#16181A]">Jeden tablet za barem, celá směna bez hesel</h2>
              <p className="mt-4 text-sm sm:text-base text-black/60 leading-relaxed text-pretty">
                Sdílené zařízení nemá komu vyzradit heslo, když žádné nemá. Klepnutím na jméno
                se člověk přihlásí ke směně, odškrtne postup a zapíše příjem zboží. Po pár
                minutách nečinnosti se obrazovka sama vrátí na výběr jména.
              </p>
              <div className="mt-5 lgx-strong rounded-2xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-black/45">Kdo je na baru</p>
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  {[['EV', 'Eva', true], ['MA', 'Martin', true], ['TE', 'Tereza', false]].map(([z, jm, tady]) => (
                    <div key={jm as string} className={`rounded-2xl px-2 py-3 text-center ${tady ? 'bg-[#C8F542]/25' : 'bg-black/[0.04]'}`}>
                      <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${tady ? 'bg-[#16181A] text-white' : 'bg-black/10 text-black/50'}`}>{z as string}</div>
                      <p className="mt-1.5 text-xs font-semibold text-[#16181A]">{jm as string}</p>
                      <p className="text-[11px] text-black/50">{tady ? 'na směně' : 'od 16:00'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Hosté: druhá polovina produktu — to, co vidí zákazník. */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24">
        <Reveal>
          <div className="lgx rounded-[2rem] p-5 sm:p-10 grid grid-cols-1 md:grid-cols-2 gap-8 md:items-stretch">
            <div className="flex flex-col justify-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/45">Managero client</p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-[#16181A]">Vlastní stránka podniku, kterou hosté opravdu použijí</h2>
              <ul className="mt-5 space-y-3 text-sm sm:text-base text-black/60">
                <li className="flex items-start gap-2.5"><Icon name="check" size={16} className="text-[#5B7A08] mt-0.5 shrink-0" aria-hidden /><span><strong className="text-[#16181A] font-semibold">Menu přes QR</strong>: vždycky aktuální, ve vašich barvách, bez cen ze skladu.</span></li>
                <li className="flex items-start gap-2.5"><Icon name="check" size={16} className="text-[#5B7A08] mt-0.5 shrink-0" aria-hidden /><span><strong className="text-[#16181A] font-semibold">Rezervace s potvrzením</strong>: host hned ví, že místo má.</span></li>
                <li className="flex items-start gap-2.5"><Icon name="check" size={16} className="text-[#5B7A08] mt-0.5 shrink-0" aria-hidden /><span><strong className="text-[#16181A] font-semibold">Objednávka od stolu</strong>: s ověřením, že host sedí u vás, ne přes ulici.</span></li>
                <li className="flex items-start gap-2.5"><Icon name="check" size={16} className="text-[#5B7A08] mt-0.5 shrink-0" aria-hidden /><span><strong className="text-[#16181A] font-semibold">Věrnostní kartičky a kupony</strong>: v telefonu, bez razítek a bez tisku.</span></li>
              </ul>
            </div>
            {/* Telefon ve skle položený na fotku hosta — produkt v ruce, ne
                na bílém pozadí. */}
            <div className="relative md:min-h-[22rem]">
              <Foto id="host" pomer="aspect-[4/5]" className="foto-vypln" sizes="(max-width: 768px) 90vw, 24rem" />
              <div className="mt-4 md:mt-0 md:absolute md:-bottom-4 md:-right-2 lgx-strong rounded-[2rem] p-4 md:w-56 shadow-[0_30px_70px_rgba(25,35,15,0.20)]">
                <div className="rounded-3xl bg-white/85 border border-black/[0.05] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-black/45">Kavárna U Lípy</p>
                  <p className="mt-1 text-lg font-bold tracking-tight text-[#16181A]">Dobrý den</p>
                  <div className="mt-3 space-y-2">
                    <div className="rounded-2xl bg-[#C8F542]/20 px-3 py-2.5 text-sm font-semibold text-[#3E5406] flex items-center gap-2"><Icon name="menu" size={14} className="shrink-0" aria-hidden />Nabídka</div>
                    <div className="rounded-2xl bg-black/[0.04] px-3 py-2.5 text-sm font-medium text-[#16181A] flex items-center gap-2"><Icon name="calendar" size={14} className="text-black/45 shrink-0" aria-hidden />Rezervovat stůl</div>
                    <div className="rounded-2xl bg-black/[0.04] px-3 py-2.5 text-sm font-medium text-[#16181A] flex items-center gap-2"><Icon name="gift" size={14} className="text-black/45 shrink-0" aria-hidden />Kartička · 7/10</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Jak začít — tři kroky. */}
      <section id="zacatek" className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24 scroll-mt-24">
        <div className="max-w-xl">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#16181A]">Jak se začíná</h2>
          <p className="mt-3 text-base text-black/55 text-pretty">Bez schůzky, bez implementace a bez toho, aby se celý tým musel něco učit.</p>
        </div>
        {/* Jeden panel, tři kroky oddělené linkou. Tři stejné karty vedle
            sebe jsou nejčastější šablona na webu; číslo velké a tlumené,
            aby pořadí bylo vidět, ne aby křičelo. */}
        <Reveal>
          <ol className="mt-10 lgx rounded-[2rem] grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-black/[0.07]">
            {KROKY.map(k => (
              <li key={k.n} className="p-6 sm:p-8 list-none">
                <div className="flex items-center justify-between">
                  <span className="text-5xl font-bold tracking-tight text-black/15 tabular-nums" aria-hidden>{k.n}</span>
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#C8F542]/25 text-[#5B7A08]"><Icon name={k.icon} size={20} aria-hidden /></span>
                </div>
                <h3 className="mt-5 text-lg font-bold tracking-tight text-[#16181A]">{k.title}</h3>
                <p className="mt-2 text-sm text-black/60 leading-relaxed text-pretty">{k.text}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      {/* Jistoty — otázky, které padnou dřív než cena. */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24">
        <div className="max-w-xl">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#16181A]">Než se zeptáš na cenu</h2>
          <p className="mt-3 text-base text-black/55 text-pretty">Čtyři věci, kvůli kterým podniky software mění a kvůli kterým ho zase opouštějí.</p>
        </div>
        <Reveal>
          <div className="mt-10 lgx rounded-[2rem] p-6 sm:p-10 grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-10">
            {JISTOTY.map(j => (
              <div key={j.title} className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#C8F542]/25 text-[#5B7A08]">
                  <Icon name={j.icon} size={20} aria-hidden />
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-[#16181A]">{j.title}</h3>
                  <p className="mt-1.5 text-sm text-black/60 leading-relaxed text-pretty">{j.text}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Pricing */}
      <Pricing />

      {/* FAQ: nativní <details> — funguje bez skriptu a s klávesnicí. */}
      <section id="otazky" className="relative max-w-3xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24 scroll-mt-24">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#16181A]">Časté otázky</h2>
        <div className="mt-6 space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="lgx rounded-3xl px-6 py-4 group">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-sm sm:text-base font-semibold text-[#16181A] tap-target">
                {f.q}
                <Icon name="chevron" size={16} className="text-black/40 transition-transform group-open:rotate-180 shrink-0" aria-hidden />
              </summary>
              <p className="mt-3 text-sm text-black/60 leading-relaxed text-pretty">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Závěrečné CTA — tmavý blok s fotkou týmu. Jediné místo na stránce,
          kde je text na fotce; proto je pod ním plné ztmavení, ne jen tón. */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-20">
        <Reveal>
          <div className="relative rounded-[2rem] overflow-hidden">
            <Foto
              id="tym"
              pomer="aspect-[4/5] sm:aspect-[21/9]"
              sizes="(max-width: 1280px) 92vw, 72rem"
              paralax={false}
              prekryv="scrim"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-5 sm:px-12 py-10">
              <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-white text-balance">Zítřejší směna už může viset v aplikaci.</h2>
              <p className="mt-3 text-base text-white/80 max-w-md text-pretty">Registrace bez karty. Tým se připojí jedním kódem a hned vidí, kdy jde do práce.</p>
              <div className="mt-7 w-full sm:w-auto flex justify-center">
                <Zkusit />
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Patička. Tři sloupce, ne jeden řádek odkazů: kdo dojel až sem
          a nekoupil, hledá buď funkci, kterou přehlédl, nebo cestu dovnitř. */}
      <footer className="border-t border-black/[0.06] relative">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-8">
            <div>
              <div className="flex items-center gap-2.5">
                <LogoMark size={26} />
                <span className="text-base font-bold tracking-tight text-[#16181A]">Managero</span>
              </div>
              <p className="mt-3 text-sm text-black/55 max-w-sm text-pretty">Provoz podniku na jednom místě: směny, docházka, uzávěrky, sklad, receptury, úkoly, chat a stránka pro hosty.</p>
              <div className="mt-5">
                <Zkusit />
              </div>
            </div>
            <div>
              <p className="t-label text-black/45">Na stránce</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                <li><a href="#funkce" className="tap-target-sm inline-flex items-center text-black/65 hover:text-[#16181A] transition-colors">Funkce</a></li>
                <li><a href="#den" className="tap-target-sm inline-flex items-center text-black/65 hover:text-[#16181A] transition-colors">Jeden den s Managerem</a></li>
                <li><a href="#zacatek" className="tap-target-sm inline-flex items-center text-black/65 hover:text-[#16181A] transition-colors">Jak začít</a></li>
                <li><a href="#cenik" className="tap-target-sm inline-flex items-center text-black/65 hover:text-[#16181A] transition-colors">Ceník</a></li>
                <li><a href="#otazky" className="tap-target-sm inline-flex items-center text-black/65 hover:text-[#16181A] transition-colors">Časté otázky</a></li>
                <li><Link href="/login" className="tap-target-sm inline-flex items-center text-black/65 hover:text-[#16181A] transition-colors">Přihlášení</Link></li>
              </ul>
            </div>
          </div>
          {/* Poctivost i tady: fotky nejsou snímky konkrétních zákazníků
              a stránka to nikde netvrdí. Napsat to je levnější než se toho
              jednou doprošovat. */}
          <p className="mt-10 pt-6 border-t border-black/[0.06] text-xs text-black/40 max-w-2xl text-pretty">
            Fotografie na této stránce jsou ilustrační a nezobrazují konkrétní podniky ani
            zákazníky. Obrazovky aplikace jsou skutečné.
          </p>
        </div>
      </footer>
    </div>
  );
}
