'use client';

// Motion ukázky funkcí.
//
// Bento mřížka s ikonou a větou říkala, že funkce existuje. Neřekla, jak
// vypadá, když ji člověk používá — a to je přesně to, na základě čeho se
// kupuje. Každá funkce tu proto má scénu, která předvede její mechaniku:
// směny spadnou do rozvrhu a kolize zčervená, zásoba klesne pod minimum
// a objednávka odejde, checklist se odškrtá do konce.
//
// Scény nejsou screenshoty ani smyčkované video. Jsou to naše vlastní
// komponenty ve stejných tokenech jako aplikace, takže když se změní
// vzhled aplikace, změní se i ukázka — nemůže se rozejít s pravdou jako
// obrázek, který někdo vyfotil před rokem.
//
// Nic z toho není interaktivní: scéna proběhne jednou při otevření funkce
// a zastaví se. Nekonečná smyčka vedle textu se čte hůř než text sám.

import { formatMoney } from '@/lib/money';
import { Icon } from '@/components/Icons';

const kc = (n: number) => formatMoney(n, 'CZK');

/** Zpoždění ve stylu — scéna se skládá po částech, ne najednou. */
const za = (ms: number) => ({ animationDelay: `${ms}ms` });

// ——— společné kousky ————————————————————————————————————————————————

function Ram({ children, popisek }: { children: React.ReactNode; popisek: string }) {
  return (
    <div className="rounded-3xl bg-white/70 border border-black/[0.06] p-4 sm:p-5 shadow-[0_20px_50px_rgba(25,35,15,0.10)] h-full flex flex-col">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/40 mb-3">{popisek}</p>
      <div className="flex-1 flex flex-col justify-center gap-2">{children}</div>
    </div>
  );
}

function Radek({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <div className={`sc flex items-center gap-2.5 rounded-2xl bg-black/[0.03] px-3 py-2 ${className}`} style={za(delay)}>
      {children}
    </div>
  );
}

function Fajfka({ delay }: { delay: number }) {
  return (
    <span className="sc-pop grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#C8F542] text-[#3E5406]" style={za(delay)}>
      <Icon name="check" size={12} />
    </span>
  );
}

// ——— scény ——————————————————————————————————————————————————————————

/** Rozvrh: prázdný týden, směny spadnou na místo, jedna kolize se vyřeší. */
function Rozvrh() {
  const dny = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
  const smeny: { den: number; kdo: string; delka: number; kolize?: boolean }[] = [
    { den: 0, kdo: 'Eva', delka: 2 }, { den: 1, kdo: 'Martin', delka: 1 },
    { den: 2, kdo: 'Eva', delka: 1 }, { den: 3, kdo: 'Jana', delka: 2 },
    { den: 4, kdo: 'Martin', delka: 2, kolize: true }, { den: 5, kdo: 'Jana', delka: 1 },
  ];
  return (
    <Ram popisek="Rozvrh · říjen">
      <div className="grid grid-cols-7 gap-1">
        {dny.map(d => <p key={d} className="text-[11px] font-semibold text-black/40 text-center">{d}</p>)}
        {dny.map((d, i) => {
          const s = smeny.find(x => x.den === i);
          return (
            <div key={d} className="h-16 rounded-xl bg-black/[0.035] p-1 flex flex-col gap-1">
              {s && (
                <div className={`sc-drop rounded-lg px-1 py-1 text-[11px] font-bold leading-tight text-center ${
                  s.kolize ? 'bg-bad/20 text-bad-ink sc-flash' : 'bg-[#C8F542]/45 text-[#3E5406]'
                }`} style={{ ...za(260 + i * 90), height: `${s.delka * 40}%` }}>
                  {s.kdo}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Radek delay={1150} className="!bg-[#C8F542]/15">
        <Fajfka delay={1250} />
        <p className="text-xs font-semibold text-[#16181A]">Kolize vyřešená — Martin má po směně 11 hodin volna</p>
      </Radek>
    </Ram>
  );
}

/** Docházka: píchnutí, běžící čas, hodiny a mzdové náklady. */
function Dochazka() {
  return (
    <Ram popisek="Docházka · dnes">
      <div className="sc-pop mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#C8F542] text-[#3E5406] shadow-[0_8px_24px_rgba(200,245,66,0.45)]" style={za(120)}>
        <Icon name="clock" size={26} />
      </div>
      <p className="sc text-center text-xs text-black/50" style={za(320)}>Příchod odpíchnutý v 8:02</p>
      <div className="sc mx-auto rounded-2xl bg-black/[0.04] px-4 py-2 text-center" style={za(620)}>
        <p className="text-2xl font-bold tabular-nums tracking-tight text-[#16181A]">06:38:12</p>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-1">
        <div className="sc rounded-2xl bg-black/[0.03] px-3 py-2" style={za(900)}>
          <p className="text-[11px] uppercase tracking-wider text-black/40">Hodiny</p>
          <p className="text-base font-bold tabular-nums text-[#16181A]">142,5</p>
        </div>
        <div className="sc rounded-2xl bg-black/[0.03] px-3 py-2" style={za(1020)}>
          <p className="text-[11px] uppercase tracking-wider text-black/40">Mzdy</p>
          <p className="text-base font-bold tabular-nums text-[#16181A]">{kc(48200)}</p>
        </div>
      </div>
    </Ram>
  );
}

/** Uzávěrka i receptura: řádky se sečtou a padne verdikt. */
function Soucet({ popisek, radky, soucet, verdikt, tonVerdiktu = 'ok' }: {
  popisek: string;
  radky: [string, string][];
  soucet: [string, string];
  verdikt: string;
  tonVerdiktu?: 'ok' | 'wait';
}) {
  return (
    <Ram popisek={popisek}>
      {radky.map(([co, kolik], i) => (
        <Radek key={co} delay={140 + i * 130}>
          <span className="flex-1 min-w-0 truncate text-xs text-black/60">{co}</span>
          <span className="text-xs font-bold tabular-nums text-[#16181A]">{kolik}</span>
        </Radek>
      ))}
      <div className="sc mt-1 flex items-center gap-2.5 rounded-2xl bg-[#16181A] px-3 py-2.5" style={za(160 + radky.length * 130 + 180)}>
        <span className="flex-1 text-xs font-semibold text-white/70">{soucet[0]}</span>
        <span className="text-sm font-bold tabular-nums text-[#C8F542]">{soucet[1]}</span>
      </div>
      <Radek delay={160 + radky.length * 130 + 420} className={tonVerdiktu === 'ok' ? '!bg-[#C8F542]/15' : '!bg-wait/15'}>
        <Fajfka delay={160 + radky.length * 130 + 520} />
        <p className="text-xs font-semibold text-[#16181A]">{verdikt}</p>
      </Radek>
    </Ram>
  );
}

/** Sklad: zásoby klesají, jedna pod minimum, objednávka odejde. */
function Zasoby() {
  const polozky: { co: string; do_: number; malo?: boolean }[] = [
    { co: 'Mléko', do_: 0.14, malo: true },
    { co: 'Zrnková káva', do_: 0.58 },
    { co: 'Croissanty', do_: 0.33, malo: true },
    { co: 'Sirup vanilka', do_: 0.72 },
  ];
  return (
    <Ram popisek="Sklad · minima">
      {polozky.map((p, i) => (
        <div key={p.co} className="sc" style={za(120 + i * 120)}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-black/60">{p.co}</span>
            {p.malo && <span className="text-[11px] font-bold text-wait-ink">pod minimem</span>}
          </div>
          <div className="mt-1 h-2 rounded-full bg-black/[0.06] overflow-hidden">
            <div className={`sc-drain h-full rounded-full ${p.malo ? 'bg-wait' : 'bg-[#C8F542]'}`}
              style={{ ['--do' as any]: p.do_, animationDelay: `${300 + i * 120}ms` }} />
          </div>
        </div>
      ))}
      <Radek delay={1150} className="!bg-[#C8F542]/15">
        <Icon name="mail" size={14} className="shrink-0 text-[#5B7A08]" />
        <span className="flex-1 text-xs font-semibold text-[#16181A]">Objednávka dodavateli odeslaná</span>
        <Fajfka delay={1450} />
      </Radek>
    </Ram>
  );
}

/** Úkoly i akce: checklist se odškrtá a dojede na konec. */
function Seznam({ popisek, polozky, patka }: { popisek: string; polozky: string[]; patka: string }) {
  return (
    <Ram popisek={popisek}>
      {polozky.map((p, i) => (
        <Radek key={p} delay={120 + i * 150}>
          <Fajfka delay={420 + i * 220} />
          <span className="flex-1 min-w-0 truncate text-xs text-black/60">{p}</span>
        </Radek>
      ))}
      <div className="mt-1">
        <div className="h-2 rounded-full bg-black/[0.06] overflow-hidden">
          <div className="sc-grow h-full rounded-full bg-[#C8F542]" style={za(420 + polozky.length * 220)} />
        </div>
        <p className="sc mt-1.5 text-[11px] font-semibold text-[#5B7A08]" style={za(600 + polozky.length * 220)}>{patka}</p>
      </div>
    </Ram>
  );
}

/** Chat: zprávy naskáčou, někdo píše, anketa se sečte. */
function Chat() {
  return (
    <Ram popisek="Tým · #bar">
      <div className="sc flex justify-start" style={za(120)}>
        <p className="max-w-[80%] rounded-2xl rounded-bl-md bg-black/[0.05] px-3 py-2 text-xs text-[#16181A]">Kdo si vezme sobotní ranní?</p>
      </div>
      <div className="sc flex justify-end" style={za(420)}>
        <p className="max-w-[80%] rounded-2xl rounded-br-md bg-[#C8F542]/40 px-3 py-2 text-xs text-[#3E5406]">Já můžu, mám ranní i tak.</p>
      </div>
      <div className="sc flex items-center gap-1.5 px-1" style={za(760)} aria-hidden>
        <span className="h-1.5 w-1.5 rounded-full bg-black/25 i-pulse" />
        <span className="h-1.5 w-1.5 rounded-full bg-black/25 i-pulse" style={za(150)} />
        <span className="h-1.5 w-1.5 rounded-full bg-black/25 i-pulse" style={za(300)} />
        <span className="text-[11px] text-black/35">Jana píše…</span>
      </div>
      <div className="sc rounded-2xl bg-black/[0.03] px-3 py-2.5" style={za(1050)}>
        <p className="text-[11px] font-semibold text-[#16181A]">Anketa: firemní večírek?</p>
        <div className="mt-2 h-2 rounded-full bg-black/[0.06] overflow-hidden">
          <div className="sc-grow h-full w-[72%] rounded-full bg-[#C8F542]" style={za(1250)} />
        </div>
        <p className="sc mt-1 text-[11px] text-black/45" style={za(1450)}>8 z 11 hlasovalo pro</p>
      </div>
    </Ram>
  );
}

/** Hostovská stránka: QR se načte, menu se ukáže, kartička přibude razítko. */
function Telefon() {
  return (
    <Ram popisek="Stránka pro hosty">
      <div className="relative mx-auto w-[196px] overflow-hidden rounded-[1.6rem] border border-black/[0.08] bg-white/90 p-3 shadow-[0_18px_40px_rgba(25,35,15,0.14)]">
        {/* Přejezd čtečky přes obsah — jediný okamžik, který host vidí. */}
        <div className="sc-sweep pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-transparent via-[#C8F542]/45 to-transparent" aria-hidden />
        <p className="sc text-[11px] font-semibold uppercase tracking-wider text-black/40" style={za(600)}>Kavárna U Lípy</p>
        <div className="mt-2 space-y-1.5">
          {['Espresso · 59', 'Cappuccino · 79', 'Croissant · 55'].map((m, i) => (
            <div key={m} className="sc rounded-xl bg-black/[0.04] px-2 py-1.5 text-[11px] font-medium text-[#16181A]" style={za(760 + i * 120)}>{m}</div>
          ))}
        </div>
        <div className="sc mt-2 rounded-xl bg-[#C8F542]/25 px-2 py-2" style={za(1180)}>
          <p className="text-[11px] font-semibold text-[#3E5406]">Kartička · 8/10</p>
          <div className="mt-1.5 flex gap-1">
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className={`sc-pop h-2 flex-1 rounded-full ${i < 8 ? 'bg-[#5B7A08]' : 'bg-black/10'}`} style={za(1280 + i * 45)} />
            ))}
          </div>
        </div>
      </div>
      <p className="sc text-center text-[11px] text-black/45" style={za(1800)}>Host naskenuje QR u stolu — menu i kartička v jednom</p>
    </Ram>
  );
}

/** Kiosk: velká tlačítka na tabletu, bez hesel. */
function Kiosk() {
  return (
    <Ram popisek="Kiosk · tablet za barem">
      <div className="grid grid-cols-2 gap-2">
        {[['clock', 'Příchod'], ['clipboard', 'Úkoly'], ['box', 'Sklad'], ['coins', 'Uzávěrka']].map(([ik, lb], i) => (
          <div key={lb} className={`sc-pop flex flex-col items-center justify-center gap-1.5 rounded-2xl py-4 ${
            i === 0 ? 'bg-[#C8F542] text-[#3E5406]' : 'bg-black/[0.04] text-[#16181A]'
          }`} style={za(140 + i * 130)}>
            <Icon name={ik} size={20} />
            <span className="text-[11px] font-bold">{lb}</span>
          </div>
        ))}
      </div>
      <div className="sc flex flex-wrap gap-1.5 justify-center mt-1" style={za(760)}>
        {['Eva', 'Martin', 'Jana'].map((j, i) => (
          <span key={j} className="sc-pop rounded-full bg-white/80 border border-black/[0.07] px-2.5 py-1 text-[11px] font-semibold text-[#16181A]" style={za(860 + i * 110)}>{j}</span>
        ))}
      </div>
      <p className="sc text-center text-[11px] text-black/45" style={za(1250)}>Klepnutí na jméno stačí — žádná hesla u baru</p>
    </Ram>
  );
}

/** Finance: sloupce vyrostou, export odejde účetní. */
function Graf() {
  const v = [46, 62, 38, 71, 55, 83, 68];
  return (
    <Ram popisek="Finance · tento měsíc">
      <div className="flex items-end justify-between gap-1.5 h-24">
        {v.map((h, i) => (
          <div key={i} className="sc-rise flex-1 rounded-t-lg bg-[#C8F542]"
            style={{ height: `${h}%`, animationDelay: `${160 + i * 90}ms` }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="sc rounded-2xl bg-black/[0.03] px-3 py-2" style={za(900)}>
          <p className="text-[11px] uppercase tracking-wider text-black/40">Tržby</p>
          <p className="text-sm font-bold tabular-nums text-[#16181A]">{kc(184320)}</p>
        </div>
        <div className="sc rounded-2xl bg-black/[0.03] px-3 py-2" style={za(1020)}>
          <p className="text-[11px] uppercase tracking-wider text-black/40">Hrubý výsledek</p>
          <p className="text-sm font-bold tabular-nums text-[#5B7A08]">{kc(74280)}</p>
        </div>
      </div>
      <Radek delay={1200} className="!bg-[#C8F542]/15">
        <Icon name="download" size={14} className="shrink-0 text-[#5B7A08]" />
        <span className="flex-1 text-xs font-semibold text-[#16181A]">Export pro účetní</span>
        <Fajfka delay={1450} />
      </Radek>
    </Ram>
  );
}

/** Poctivost: spojení spadne, rozepsané zůstane, po návratu se uloží. */
function Poctivost() {
  return (
    <Ram popisek="Když vypadne wifi">
      <Radek delay={120} className="!bg-bad/12">
        <Icon name="warning" size={14} className="shrink-0 text-bad-ink" />
        <p className="text-xs font-semibold text-bad-ink">Nepodařilo se uložit — jsi offline</p>
      </Radek>
      <div className="sc rounded-2xl border border-black/[0.08] bg-white/80 px-3 py-2.5" style={za(520)}>
        <p className="text-[11px] uppercase tracking-wider text-black/40">Rozepsaná uzávěrka</p>
        <p className="mt-1 text-xs text-[#16181A]">Rozdíl 120 v kase — spropitné z pátku, doplním ráno…</p>
      </div>
      <p className="sc text-[11px] text-black/45" style={za(820)}>Text zůstal. Aplikace ho nezahodila a netvrdila, že je uložený.</p>
      <Radek delay={1200} className="!bg-[#C8F542]/15">
        <Fajfka delay={1320} />
        <p className="text-xs font-semibold text-[#16181A]">Spojení zpátky — uloženo</p>
      </Radek>
    </Ram>
  );
}

// ——— rozcestník ——————————————————————————————————————————————————————

export type ScenaId =
  | 'rozvrh' | 'dochazka' | 'uzaverky' | 'sklad' | 'receptury'
  | 'ukoly' | 'chat' | 'kiosk' | 'hoste' | 'akce' | 'finance' | 'poctivost';

export function Scena({ id }: { id: ScenaId }) {
  switch (id) {
    case 'rozvrh': return <Rozvrh />;
    case 'dochazka': return <Dochazka />;
    case 'uzaverky': return <Soucet popisek="Uzávěrka · včera"
      radky={[['Tržba za den', kc(18450)], ['Hotovost v kase', kc(6120)], ['Kartou', kc(12330)], ['Odvod do trezoru', kc(5000)]]}
      soucet={['Rozdíl', kc(0)]} verdikt="Sedí na korunu" />;
    case 'receptury': return <Soucet popisek="Receptura · Cappuccino"
      radky={[['Zrnková káva 18 g', kc(7)], ['Mléko 150 ml', kc(5)], ['Kelímek a víčko', kc(3)]]}
      soucet={['Náklad na porci', kc(15)]} verdikt="Marže 81 % při ceně 79" />;
    case 'sklad': return <Zasoby />;
    case 'ukoly': return <Seznam popisek="Zavírací postup" patka="6 z 6 hotovo · 21:48"
      polozky={['Vypnout kávovar', 'Umýt napěňovač', 'Odvod do trezoru', 'Zkontrolovat zadní dveře']} />;
    case 'akce': return <Seznam popisek="Svatba · balicí seznam" patka="Naloženo · odjezd 9:00"
      polozky={['2× termonádoba', 'Kelímky 120 ks', 'Mlýnek a tamper', 'Prodlužovačka 10 m']} />;
    case 'chat': return <Chat />;
    case 'kiosk': return <Kiosk />;
    case 'hoste': return <Telefon />;
    case 'finance': return <Graf />;
    case 'poctivost': return <Poctivost />;
  }
}

export default Scena;
