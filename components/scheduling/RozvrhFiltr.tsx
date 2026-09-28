'use client';

// Filtr plánovače rozvrhu: pás lidí, pás typů s „Jen dny s dírou", přehled
// „Směny podle lidí" a lišta zapnutého filtru. Logika (počty, vytížení,
// popis) je v lib/rozvrhFiltr.ts; tady je jen to, jak to vypadá.
//
// Proč pás pilulek a ne výběr ze seznamu: Martin chce vidět, kolik má kdo
// směn, ještě než na někoho klikne — pilulka proto nese počet („Eva 12",
// DESIGN.md → Filtrovací pás). Vybraná pilulka je tmavá jako v Segmented,
// nikdy limetková: limetka na obrazovce patří jediné akci (Vygenerovat /
// Uložit a publikovat).

import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../Icons';
import { Avatar, Button, Chip, Segmented } from '../ui';
import { czCount, czForm, SMENA, DEN } from '@/lib/czech';
import { hodinyText } from '@/lib/rozvrhPrehled';
import type { ClovekPasu, RadekVytizeni, RazeniVytizeni, TypPasu, Vytizeni } from '@/lib/rozvrhFiltr';

/** Šířka vyblednutí okraje pásu, když za ním ještě něco je (jako Segmented). */
const FADE = 24;

/**
 * Vodorovně posuvný pás. Na telefonu se pilulky nezalamují (dva řádky
 * pilulek vypadají jako hromádka textu a odsunou mřížku dolů); že je kus
 * mimo, prozradí vyblednutý okraj.
 */
function PosuvnyPas({ ariaLabel, children, data }: { ariaLabel: string; children: ReactNode; data?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [okraje, setOkraje] = useState({ vlevo: false, vpravo: false });
  const zmer = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const vlevo = el.scrollLeft > 1;
    const vpravo = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setOkraje(o => (o.vlevo === vlevo && o.vpravo === vpravo ? o : { vlevo, vpravo }));
  }, []);
  // Jednou při připojení, ne po každém vykreslení: plánovač se překresluje
  // při každé úpravě návrhu a nové pozorovatele + čtení scrollWidth by
  // pokaždé vynutily přepočet rozvržení. Změnu šířky hlídá ResizeObserver,
  // změnu obsahu (počty v pilulkách, přibyl člověk) MutationObserver.
  useLayoutEffect(() => {
    zmer();
    const el = ref.current;
    if (!el) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(zmer) : null;
    ro?.observe(el);
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(zmer) : null;
    mo?.observe(el, { childList: true, subtree: true, characterData: true });
    return () => { ro?.disconnect(); mo?.disconnect(); };
  }, [zmer]);
  const maska = okraje.vlevo || okraje.vpravo
    ? `linear-gradient(to right, ${okraje.vlevo ? 'transparent' : '#000'} 0, #000 ${okraje.vlevo ? FADE : 0}px, #000 calc(100% - ${okraje.vpravo ? FADE : 0}px), ${okraje.vpravo ? 'transparent' : '#000'} 100%)`
    : undefined;
  return (
    <div ref={ref} role="group" aria-label={ariaLabel} onScroll={zmer} data-pas={data}
      style={maska ? { WebkitMaskImage: maska, maskImage: maska } : undefined}
      // py-1: dotyková plocha 44 px (tap-target) přesahuje pilulku nahoru
      // i dolů a overflow by ji jinak uřízl. px-1 (s -mx-1, ať pás sedí na
      // ose): obrys fokusu první a poslední pilulky by overflow uřízl taky.
      // Fokus z klávesnice vyblednutí okraje vypne — jinak by maska obrys
      // pilulky u okraje schovala a nebylo by vidět, kde fokus je.
      className="flex gap-1.5 min-w-0 max-w-[calc(100%+0.5rem)] -mx-1 px-1 overflow-x-auto overscroll-x-contain snap-x snap-proximity scroll-px-1 scrollbar-none py-1 [&:has(:focus-visible)]:![mask-image:none] [&:has(:focus-visible)]:![-webkit-mask-image:none]">
      {children}
    </div>
  );
}

/** Počet v pilulce — stejný tvar jako v Segmented. */
function Pocet({ n, on }: { n: number; on: boolean }) {
  return (
    <span aria-hidden className={`rounded-full px-1.5 min-w-[1.25rem] text-center text-[11px] font-semibold tabular-nums ${
      on ? 'bg-white/20 text-white' : 'bg-black/[0.08] text-[#16181A]'}`}>{n}</span>
  );
}

const pilulka = (on: boolean) => `filter-pill tap-target snap-start ${on ? 'seg-on' : 'seg-off glass'}`;

/** Pás lidí: „Všichni" + člověk s počtem směn. Víc lidí najednou, druhý klik výběr zruší. */
export function PasLidi({ lide, vybrani, celkem, navrh, onPrepni, onVsichni }: {
  lide: ClovekPasu[];
  vybrani: number[];
  celkem: number;
  navrh: boolean;
  onPrepni: (id: number) => void;
  onVsichni: () => void;
}) {
  const vNavrhu = navrh ? ' v návrhu' : '';
  return (
    <PosuvnyPas ariaLabel="Filtr podle lidí" data="lide">
      <button type="button" aria-pressed={vybrani.length === 0} onClick={onVsichni}
        aria-label={`Všichni, ${czCount(celkem, SMENA)}${vNavrhu}`} className={pilulka(vybrani.length === 0)}>
        <span aria-hidden>Všichni</span><Pocet n={celkem} on={vybrani.length === 0} />
      </button>
      {lide.map(c => {
        const on = vybrani.includes(c.id);
        return (
          <button key={c.id} type="button" aria-pressed={on} onClick={() => onPrepni(c.id)} data-clovek={c.id}
            aria-label={`${c.jmeno}, ${czCount(c.smen, SMENA)}${vNavrhu}`} title={c.jmeno}
            // Avatar vlevo zmenší odsazení pilulky, ať kruh nesedí v díře.
            className={`${pilulka(on)} !pl-1.5`}>
            <Avatar emoji={c.avatar} name={c.jmeno} size="xs" ring={false} className={on ? '!bg-white/20 !text-white' : ''} />
            <span aria-hidden>{c.kratce}</span>
            <Pocet n={c.smen} on={on} />
          </button>
        );
      })}
    </PosuvnyPas>
  );
}

/** Pás typů (tečka kategorie jako v legendě) a „Jen dny s dírou". */
export function PasTypu({ typy, vybrane, tecka, onPrepni, diry, jenDiry, onJenDiry, navrh }: {
  typy: TypPasu[];
  vybrane: string[];
  tecka: (barva: string | null) => string;
  onPrepni: (nazev: string) => void;
  /** Kolik dní v měsíci má díru; null = pilulku nekreslit (žádná díra a filtr vypnutý). */
  diry: number | null;
  jenDiry: boolean;
  onJenDiry: () => void;
  navrh: boolean;
}) {
  return (
    <PosuvnyPas ariaLabel="Filtr podle typu směny a dnů s dírou" data="typy">
      {typy.map(t => {
        const on = vybrane.includes(t.nazev);
        return (
          <button key={t.nazev} type="button" aria-pressed={on} onClick={() => onPrepni(t.nazev)} data-typ={t.nazev}
            aria-label={`${t.nazev}, ${czCount(t.smen, SMENA)}${navrh ? ' v návrhu' : ''}`} className={pilulka(on)}>
            <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${tecka(t.barva)}`} />
            <span aria-hidden>{t.nazev}</span>
            <Pocet n={t.smen} on={on} />
          </button>
        );
      })}
      {diry != null && (
        <button type="button" aria-pressed={jenDiry} onClick={onJenDiry} data-jen-diry
          aria-label={`Jen dny s dírou, ${czCount(diry, DEN)}`} className={pilulka(jenDiry)}>
          <Icon name="warning" size={13} className="shrink-0" />
          <span aria-hidden>Jen dny s dírou</span>
          <Pocet n={diry} on={jenDiry} />
        </button>
      )}
    </PosuvnyPas>
  );
}

/**
 * Lišta zapnutého filtru nad mřížkou. Bez ní by plánovač po návratu na
 * stránku (filtr se pamatuje) viděl půlku měsíce prázdnou a myslel si, že
 * v rozvrhu nic není.
 */
export function ListaFiltru({ popis, vysledek, onZrusit }: { popis: string; vysledek: string; onZrusit: () => void }) {
  // Bez aria-live: oblast vložená do stránky i s obsahem se neohlásí a při
  // změnách by se četla i věta o exportu. Výsledek hlásí StavFiltru.
  return (
    <div className="note note-info text-sm flex flex-wrap items-center justify-between gap-x-3 gap-y-1" data-filtr-lista>
      <p className="min-w-0 text-pretty">
        <span className="font-semibold">Filtr: {popis}</span>
        <span> — {vysledek}</span>
        {/* Export, tisk i publikování filtr nepoužijí — ať nikdo nečeká, že
            pošle jen směny Evy, a ostatním nepřijde rozvrh. */}
        <span className="block text-xs mt-0.5">Export, tisk i publikování berou vždy celý měsíc.</span>
      </p>
      <Button variant="ghost" size="sm" icon="close" onClick={onZrusit} className="shrink-0 -my-1">Zrušit filtr</Button>
    </div>
  );
}

/**
 * Stále přítomná (skrytá) živá oblast s výsledkem filtru. Odečítač ohlásí
 * jen změnu obsahu oblasti, která už v DOM byla — lišta filtru se ale
 * připojuje až se zapnutým filtrem, takže první „Eva — 5 směn" by zaniklo.
 */
export function StavFiltru({ text }: { text: string }) {
  return <p className="sr-only" role="status" aria-live="polite" data-stav-filtru>{text}</p>;
}

// „Co řešit", ne „Odchylka": majitel neví, že odchylka je nejlepší pohled
// na problémy — řadí se nahoru nad max., kdo chce pracovat a nemá, pak
// nejdál od průměru.
const RAZENI: { id: RazeniVytizeni; label: string }[] = [
  { id: 'smeny', label: 'Počet' },
  { id: 'jmeno', label: 'Jméno' },
  { id: 'odchylka', label: 'Co řešit' },
];

/** Text upozornění — stejný na chipu i v přístupném jménu řádku (i s číslem). */
function textUpozorneni(u: RadekVytizeni['upozorneni'][number], r: RadekVytizeni): string {
  if (u === 'nad_max') return `o ${czCount(r.smen - (r.max ?? 0), SMENA)} nad maximem`;
  if (u === 'bez_smeny') return 'chce pracovat, nemá směnu';
  return u === 'nad_prumerem' ? 'výrazně nad průměrem' : 'výrazně pod průměrem';
}

/** Upozornění řádku přehledu — stav (bad/wait), srovnání s průměrem jen info. */
function Upozorneni({ r }: { r: RadekVytizeni }) {
  if (r.upozorneni.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {r.upozorneni.map(u => (
        <Chip key={u} tone={u === 'nad_max' ? 'bad' : u === 'bez_smeny' ? 'wait' : 'info'} size="sm">{textUpozorneni(u, r)}</Chip>
      ))}
    </span>
  );
}

/** Na telefonu tolik řádků přehledu, zbytek za „Ukázat všech N" — ať mřížka neodjede o obrazovku. */
const RADKU_NA_TELEFONU = 6;

/**
 * Pruh vytížení: plný = počet směn, modrá čárka = průměr týmu, oranžová =
 * kolik si člověk v dostupnosti řekl nejvýš. Prostý pruh, ne graf — jde
 * o to, kdo vyčnívá, ne o přesná čísla (ta stojí vedle).
 */
function Pruh({ r, prumer, stupnice }: { r: RadekVytizeni; prumer: number; stupnice: number }) {
  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / stupnice) * 100))}%`;
  const nad = r.upozorneni.includes('nad_max');
  return (
    <span aria-hidden className="relative block h-1.5 my-1.5 rounded-full bg-black/[0.06]">
      {r.smen > 0 && <span className={`absolute inset-y-0 left-0 rounded-full ${nad ? 'bg-bad' : 'spark-sloupek-hl'}`} style={{ width: pct(r.smen) }} />}
      {prumer > 0 && <span className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-info" style={{ left: pct(prumer) }} />}
      {r.max != null && <span className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-wait" style={{ left: pct(r.max) }} />}
    </span>
  );
}

/**
 * „Směny podle lidí" — sbalovací karta pod pásem lidí. Na telefonu je to
 * lepší než okno: po klepnutí na člověka se mřížka vyfiltruje přímo pod
 * rukou a přehled zůstane, kde byl, bez zavírání a znovuotevírání.
 */
export function PrehledLidi({ v, radky, razeni, onRazeni, otevreno, onOtevreno, vybrani, onVyber, navrh, dostupnostViditelna, bezFiltru }: {
  v: Vytizeni;
  radky: RadekVytizeni[];
  razeni: RazeniVytizeni;
  onRazeni: (r: RazeniVytizeni) => void;
  otevreno: boolean;
  onOtevreno: (o: boolean) => void;
  vybrani: number[];
  onVyber: (id: number) => void;
  navrh: boolean;
  /** Role vidí dostupnost — jinak se o stropech a „nemá směnu" mlčí. */
  dostupnostViditelna: boolean;
  /**
   * Co z filtru mřížky přehled NEpočítá („všechny typy směn"). Přehled je
   * o vytížení lidí za měsíc — stropy „chce nejvýš" platí na všechny směny,
   * ne na ranní. Bez poznámky by vedle „Eva 3" v pásu stálo „Eva 12"
   * a nebylo by jasné, kterému číslu věřit.
   */
  bezFiltru?: string | null;
}) {
  const uid = useId();
  const [vse, setVse] = useState(false);
  const upozorneni = v.radky.filter(r => r.upozorneni.some(u => u === 'nad_max' || u === 'bez_smeny')).length;
  const souhrn = [
    navrh ? 'v návrhu' : null,
    bezFiltru || null,
    // „5,3 směny" — desetinné číslo bere v češtině vždy 2. pád jednotného čísla.
    v.prumer > 0 ? `průměr ${hodinyText(v.prumer)} ${Number.isInteger(v.prumer) ? czForm(v.prumer, SMENA) : 'směny'} na člověka` : 'zatím bez směn',
    upozorneni > 0 ? czCount(upozorneni, { one: 'upozornění', few: 'upozornění', many: 'upozornění' }) : null,
  ].filter(Boolean).join(' · ');
  return (
    <section aria-labelledby={`${uid}-n`} className="rounded-2xl border border-black/[0.08]" data-prehled-lidi>
      <button type="button" aria-expanded={otevreno} aria-controls={`${uid}-o`} onClick={() => onOtevreno(!otevreno)}
        className="w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2.5 text-left rounded-2xl hover:bg-black/[0.03]">
        <span className="min-w-0">
          <span id={`${uid}-n`} className="block text-sm font-semibold text-[#16181A]">Směny podle lidí</span>
          <span className="block t-meta text-pretty">{souhrn}</span>
        </span>
        <Icon name="chevron" size={18} className={`shrink-0 text-black/45 transition-transform duration-200 ${otevreno ? 'rotate-180' : ''}`} />
      </button>
      {otevreno && (
        <div id={`${uid}-o`} className="px-3 pb-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented ariaLabel="Řadit lidi podle" size="sm" value={razeni} onChange={onRazeni} options={RAZENI} />
            <p className="t-meta flex items-center gap-2">
              <span className="inline-flex items-center gap-1"><span aria-hidden className="h-3 w-0.5 rounded-full bg-info" /> průměr</span>
              {dostupnostViditelna && <span className="inline-flex items-center gap-1"><span aria-hidden className="h-3 w-0.5 rounded-full bg-wait" /> chce nejvýš</span>}
            </p>
          </div>
          <ul className="list" data-prehled-radky>
            {radky.map((r, i) => {
              // Stisknutý je každý, kdo filtruje — i když je vybraných víc.
              const vybran = vybrani.includes(r.id);
              // Klik na jediného vybraného filtr zruší; jinak mřížka jen na něj.
              const jediny = vybrani.length === 1 && vybrani[0] === r.id;
              // Vybraný zůstane vidět i za hranicí telefonu — jinak by nešel odkliknout.
              const skryt = !vse && i >= RADKU_NA_TELEFONU && !vybran;
              // Strop platí na měsíc (formulář dostupnosti je za měsíc).
              const strop = r.max != null ? `chce nejvýš ${czCount(r.max, SMENA)} za měsíc` : null;
              const meta = [
                `${hodinyText(r.hodiny)} h`,
                r.vikend > 0 ? `${r.vikend}× víkend` : null,
                v.zavreniZname && r.zaviraci > 0 ? `${r.zaviraci}× zavírá` : null,
                strop,
              ].filter(Boolean).join(' · ');
              return (
                <li key={r.id} data-radek-clovek={r.id} className={skryt ? 'max-sm:hidden' : undefined}>
                  {/* Klepnutí na člověka vyfiltruje mřížku jen na něj. */}
                  <button type="button" onClick={() => onVyber(r.id)} aria-pressed={vybran}
                    aria-label={`${r.jmeno}: ${czCount(r.smen, SMENA)}, ${hodinyText(r.hodiny)} h${strop ? `, ${strop}` : ''}${r.upozorneni.length ? `, ${r.upozorneni.map(u => textUpozorneni(u, r)).join(', ')}` : ''}. ${jediny ? `Zrušit filtr na ${r.jmeno}.` : 'Ukázat v rozvrhu jen tyhle směny, všech typů.'}`}
                    className={`w-full text-left flex items-start gap-3 py-2.5 px-1.5 -mx-1.5 rounded-xl ${vybran ? 'bg-black/[0.05]' : 'hover:bg-black/[0.03]'}`}>
                    <Avatar emoji={r.avatar} name={r.jmeno} size="sm" />
                    <span className="min-w-0 flex-1" aria-hidden>
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-[15px] leading-snug text-[#16181A] truncate">{r.jmeno}</span>
                        <span className="shrink-0 tabular-nums">
                          <span className="text-[15px] font-bold text-[#16181A]">{r.smen}</span>
                          <span className="text-[13px] text-black/55"> {czForm(r.smen, SMENA)}</span>
                        </span>
                      </span>
                      <Pruh r={r} prumer={v.prumer} stupnice={v.stupnice} />
                      <span className="block text-[13px] text-black/55 leading-snug">{meta}</span>
                      <span className="block mt-1 empty:hidden"><Upozorneni r={r} /></span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!vse && radky.length > RADKU_NA_TELEFONU && (
            // Jen na telefonu: na širší obrazovce se vejdou všichni vedle mřížky.
            <Button variant="ghost" size="sm" className="sm:hidden w-full" onClick={() => setVse(true)} data-ukazat-vsechny>
              Ukázat všech {radky.length}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
