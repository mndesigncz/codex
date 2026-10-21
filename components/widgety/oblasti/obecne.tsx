'use client';

// Widgety oblasti „Obecné" — komponenty (kolo 68, spec §2.5, §2.6 a §6.1).
//
// Oblast patří kolu 68 a v kole 69 je zamčená (spec §6.2). Metadata (název,
// velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/obecne.ts, tady je
// jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — test AK-20 (scripts/testy/k68-widgety.ts) klíče čte z textu,
// proto jsou napsané obyčejně, bez spreadu.
//
// Co z dřívějšího Přehledu tyhle widgety opravují (audit Přehledu vedení
// a Domů zaměstnance):
//  - Čeká na tebe: každá fronta jen se svým klíčem a každý dotaz jen s ním.
//    Dřív hlídalo volno i výměny `smi('shifts')`, které projde už s náhledem
//    rozvrhu, a role bez práva schvalovat viděla vlastní žádosti jako „5×
//    žádost o volno" k rozhodnutí. Chipy objednávek a rezervací z „Hosté
//    a věrnost" jsou teď fronty tady.
//  - První kroky: sdílený Checklist místo ručních jamek a přeškrtnutí; krok
//    jen se svým klíčem; hotové se v klidu nekreslí. „Skrýt" je obyčejné
//    Odebrat widget z menu plochy (s Vrátit), starý klíč v prohlížeči platí dál.
//  - Odkaz: cíle z navigace role (dřív pevný seznam záložek bez filtru),
//    postup a návod podle id, na cíl bez oprávnění se dlaždice nekreslí.
//  - Připnutá nabídka: řádek seznamu a skutečný odkaz „Otevřít" místo
//    limetkové karty s falešným tlačítkem.
//  - Nástěnka: jeden seznam s autorem a časem v meta, akce v nabídce řádku,
//    formulář z Field a Textarea; psaní a správa jen s oznameni.spravovat
//    (dřív ji UI nabízelo každému a zápis skončil 403). Bez jantarových panelů,
//    bez ručních ikonových tlačítek a bez confirm().
//  - Nepřečtené zprávy: číslo, u větší velikosti vlákna s proklikem rovnou do
//    konverzace (dřív se nepřečtené stahovaly a nikde neukázaly).
//
// Společná pravidla (spec §2.6): data jen přes useDataWidgetu a URL je null,
// dokud neplatí brána; každá část widgetu se svým klíčem; prokliky jen tam,
// kam divák smí (obal i smiPohled); v náhledu (galerie) se nic nezapisuje.

import React, { Suspense, useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KomponentaWidgetu, Navigace, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { ZDROJE_FRONT } from '@/lib/widgety/katalog/obecne';
import { vyberNavic } from '@/lib/navic';
import { otevriCastNavic } from '../../navic-vedeni/cast';
import { cekaSpor, vyberTresty } from '@/lib/tresty';
import { otevriCastTresty } from '../../tresty-vedeni/cast';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { dbTimeDayHM, parseDbTime } from '@/lib/pragueTime';
import { useDraft } from '@/lib/useDraft';
import { Icon } from '../../Icons';
import {
  Avatar, Button, Checklist, Chip, DraftNote, Field, ListRow, Menu, Modal, Skeleton, Sloupec, Stat, SwitchRow,
  Textarea, Well, type ChecklistItem, type MenuItem,
} from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { KontextWidgetuCtx, PojistkaWidgetu, Widget, useWidget, type KontextWidgetu, type StavNacteni } from '../Widget';
import { lineWidget } from '../registr';
import { sNastavenimVychozimi } from '@/lib/widgety/rozlozeni';
import type { DefiniceWidgetu } from '@/lib/widgety/typy';
import { PrazdnoWidgetu } from '../PrazdnoWidgetu';
import { obnovDataWidgetu, useDataWidgetu } from '../useDataWidgetu';
import { navigaceCile, rozeberCil, useNavigace, useSmi, type CilOdkazu } from '../NavigaceKontext';

// ---------------------------------------------------------------------------
// Společné drobnosti
// ---------------------------------------------------------------------------

type Klic = string | readonly string[];

const seznam = (x: unknown): any[] => (Array.isArray(x) ? x : []);
const cislo = (n: number) => n.toLocaleString('cs-CZ');
/** „…a dalších 5" — strop seznamu se nesmí zamlčet (DP §3.6). */
const aDalsich = (t: PrekladFn, n: number) => t('…a dalších {n}', { n: cislo(n) });

/** Klíč části widgetu z katalogu (`opravneni.pole`) — jeden zdroj pravdy s galerií a serverem. */
function klicCasti(idWidgetu: string, cast: string): Klic | null {
  return widget(idWidgetu)?.opravneni.pole?.[cast] ?? null;
}

/**
 * Brána widgetu (spec §1.5): přísně `nacteno && ma()`. Samotné `ma()` před
 * načtením oprávnění vrací ANO a dotaz by odešel dřív, než víme, jestli na
 * data divák má. Když /api/teams/mine selže, rozhodl už server — widget je
 * na ploše jen tehdy, když ho vrátil v rozložení.
 */
function useBrana(klic: Klic): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  return { ok: nacteno ? ma(klic) : chyba, ceka: !nacteno && !chyba };
}

/** „Ještě nevíme, jestli smí": kostra a žádný dotaz. */
const CEKA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

/**
 * Okno otevřené z widgetu se kreslí do <body>, ne do karty. Buňka mřížky
 * dostává transformace (FLIP, promáčknutí při podržení) a pod transformovaným
 * předkem by `position: fixed` okna počítalo od karty, ne od okna prohlížeče;
 * v úpravách je navíc karta `inert`. `data-plocha-chrom` říká ploše, že
 * podržení a klepnutí v okně nejsou gesta nad widgetem — React události
 * z portálu bublají stromem komponent až do plochy.
 */
function NadPlochou({ children }: { children: React.ReactNode }) {
  const [cil, setCil] = useState<HTMLElement | null>(null);
  useEffect(() => { setCil(document.body); }, []);
  return cil ? createPortal(<div data-plocha-chrom="">{children}</div>, cil) : null;
}

/** Jamka 36 px s ikonou 16 — levý okraj řádku, když člověk nemá avatar (DP §3.6). */
function JamkaIkony({ ikona }: { ikona: string }) {
  return (
    <span className="well grid h-9 w-9 shrink-0 place-items-center text-black/55">
      <Icon name={ikona} size={16} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Čeká na tebe
// ---------------------------------------------------------------------------

const ID_CEKA = 'prehled.ceka_na_tebe';

type IdFronty =
  | 'volno' | 'vymeny' | 'uzaverky' | 'navrhy_skladu' | 'hlaseni' | 'odmeny'
  | 'postupy' | 'navody' | 'rezervace' | 'objednavky' | 'slaba_hodnoceni' | 'navic' | 'tresty';

interface Fronta {
  id: IdFronty;
  /** Počet i tvar po číslovce: „1 žádost o volno", „3 žádosti o volno", „5 žádostí o volno". */
  text: (t: PrekladFn, n: number) => string;
  ikona: string;
  /** Kam proklik vede — na obrazovku, kde se o frontě rozhoduje. */
  pohled: string;
  /** Kolik v odpovědi čeká na rozhodnutí. Odkud se čte, určuje ZDROJE_FRONT v katalogu. */
  pocet: (raw: any) => number;
  /** Vlastní otevření (místo holého onNavigate) — fronta, která cílí na část stránky. */
  otevri?: (nav: Navigace) => void;
}

const FRONTY: readonly Fronta[] = [
  {
    id: 'volno', ikona: 'calendar', pohled: 'shifts',
    text: (t, n) => t('{n, plural, one {# žádost o volno} few {# žádosti o volno} other {# žádostí o volno}}', { n }),
    // Bez volno.zobrazit vrací server jen vlastní žádosti (isEmployer: false).
    // Ty nejsou k rozhodnutí — dřív se tak ukazovaly a proklik vedl do Rozvrhu,
    // kde člověk nic schválit nemohl.
    pocet: raw => (raw?.isEmployer === false ? 0 : seznam(raw?.requests).filter(r => r?.status === 'pending').length),
  },
  {
    id: 'vymeny', ikona: 'swap', pohled: 'shifts',
    text: (t, n) => t('{n, plural, one {# výměna směny} few {# výměny směn} other {# výměn směn}}', { n }),
    // `isEmployer` tu znamená „smí schvalovat" — zabraná výměna čeká jen na toho, kdo ji potvrdí.
    pocet: raw => (raw?.isEmployer === false ? 0 : seznam(raw?.offers).filter(o => o?.status === 'claimed').length),
  },
  {
    id: 'uzaverky', ikona: 'trend', pohled: 'reports',
    text: (t, n) => t('{n, plural, one {# uzávěrka ke schválení} few {# uzávěrky ke schválení} other {# uzávěrek ke schválení}}', { n }),
    // Uzávěrka pokrytá jinou (covered_by) se neschvaluje zvlášť.
    pocet: raw => seznam(raw?.closings).filter(c => c?.approved === false && !c?.covered_by).length,
  },
  {
    id: 'navrhy_skladu', ikona: 'box', pohled: 'inventory',
    text: (t, n) => t('{n, plural, one {# návrh do skladu} few {# návrhy do skladu} other {# návrhů do skladu}}', { n }),
    pocet: raw => seznam(raw).filter(i => i?.approved === false && i?.archived !== true).length,
  },
  {
    id: 'hlaseni', ikona: 'bell', pohled: 'inventory',
    text: (t, n) => t('{n, plural, one {# hlášení ze skladu} few {# hlášení ze skladu} other {# hlášení ze skladu}}', { n }),
    pocet: raw => seznam(raw?.reports).filter(r => r?.status !== 'done').length,
  },
  {
    id: 'odmeny', ikona: 'award', pohled: 'rewards',
    text: (t, n) => t('{n, plural, one {# žádost o odměnu} few {# žádosti o odměnu} other {# žádostí o odměnu}}', { n }),
    pocet: raw => seznam(raw?.redemptions).filter(r => r?.status === 'pending').length,
  },
  {
    id: 'postupy', ikona: 'clipboard', pohled: 'procedures',
    text: (t, n) => t('{n, plural, one {# návrh postupu} few {# návrhy postupů} other {# návrhů postupů}}', { n }),
    pocet: raw => seznam(raw?.procedures).filter(p => p?.approved === false).length,
  },
  {
    id: 'navody', ikona: 'book', pohled: 'guides',
    text: (t, n) => t('{n, plural, one {# návrh návodu} few {# návrhy návodů} other {# návrhů návodů}}', { n }),
    pocet: raw => seznam(raw?.guides).filter(g => g?.approved === false).length,
  },
  {
    id: 'rezervace', ikona: 'calendarCheck', pohled: 'klient:reservations',
    text: (t, n) => t('{n, plural, one {# rezervace ke schválení} few {# rezervace ke schválení} other {# rezervací ke schválení}}', { n }),
    pocet: raw => seznam(raw?.reservations).filter(r => r?.status === 'requested').length,
  },
  {
    id: 'objednavky', ikona: 'cup', pohled: 'klient:orders',
    text: (t, n) => t('{n, plural, one {# objednávka od stolu} few {# objednávky od stolu} other {# objednávek od stolu}}', { n }),
    pocet: raw => Number(raw?.newCount) || 0,
  },
  {
    id: 'slaba_hodnoceni', ikona: 'star', pohled: 'klient:customers',
    text: (t, n) => t('{n, plural, one {# slabé hodnocení za týden} few {# slabá hodnocení za týden} other {# slabých hodnocení za týden}}', { n }),
    pocet: raw => Number(raw?.reviews?.low7) || 0,
  },
  {
    // Kolo 9 (N1): zápisy „navíc" čekající na uznání — proklik otevře Odměny › Navíc (otevriCastNavic).
    id: 'navic', ikona: 'star', pohled: 'rewards',
    text: (t, n) => t('{n, plural, one {# zápis navíc k uznání} few {# zápisy navíc k uznání} other {# zápisů navíc k uznání}}', { n }),
    pocet: raw => vyberNavic(raw).filter(z => z.status === 'ceka').length,
    otevri: nav => otevriCastNavic(nav),
  },
  {
    // Kolo 10: člověk s trestem nesouhlasí — proklik otevře Odměny › Tresty (otevriCastTresty), widget Tresty v týmu
    // má sporné nahoře s Trest platí dál / Zrušit trest.
    id: 'tresty', ikona: 'warning', pohled: 'rewards',
    text: (t, n) => t('{n, plural, one {# nesouhlas s trestem} few {# nesouhlasy s trestem} other {# nesouhlasů s trestem}}', { n }),
    pocet: raw => vyberTresty(raw).filter(cekaSpor).length,
    otevri: nav => otevriCastTresty(nav),
  },
];

/** Názvy front z nastavení widgetu — do věty „Nenačetly se: …". */
const NAZVY_FRONT: ReadonlyMap<string, string> = (() => {
  const pole = widget(ID_CEKA)?.nastaveni?.find(p => p.klic === 'fronty');
  return new Map(pole && pole.typ === 'vicevyber' ? pole.moznosti.map(m => [m.id, m.nazev] as const) : []);
})();

/**
 * Schránka ke schválení (audit 2026-10 V09, vzor Homebase „Requests" / Deputy „Approvals"):
 * fronta → widget, který o ní umí rozhodnout na místě (schválit, uznat, hromadně přes
 * BulkBar). Okno skládá tyhle widgety pod sebe, takže volno, výměny, uzávěrky, navíc
 * i nesouhlasy s tresty se vyřídí bez přecházení mezi pěti stránkami — a každý widget
 * přitom drží svou logiku, oprávnění i „Vrátit". Hostovské fronty (rezervace, objednávky,
 * hodnocení) sem nepatří: vyřizují se v Managero client.
 */
const WIDGET_FRONTY: Partial<Record<IdFronty, string>> = {
  volno: 'rozvrh.zadosti_volno', vymeny: 'rozvrh.vymeny', uzaverky: 'uzaverky.ke_schvaleni',
  navic: 'odmeny.navic_tymu', tresty: 'odmeny.tresty_tymu', odmeny: 'odmeny.zadosti',
  navrhy_skladu: 'sklad.navrhy', hlaseni: 'sklad.hlaseni', postupy: 'postupy.navrhy', navody: 'navody.navrhy',
};

const NIC = () => {};

/** Widget fronty vložený do okna schránky: bez karty a hlavičky, se všemi sloty (vOkne). */
function VlozenyWidget({ def }: { def: DefiniceWidgetu }) {
  const k = useWidget();
  const Komponenta = useMemo(() => lineWidget(def.id, 0), [def.id]);
  const nastaveni = useMemo(() => sNastavenimVychozimi(def.nastaveni, undefined), [def]);
  const instance = `schranka-${def.id}`;
  const kontext = useMemo<KontextWidgetu>(() => ({
    instance, velikost: 'L', definice: def, nahled: false, upravy: false, inkoust: false, nahlasSkryti: NIC,
    nahlasVyrizeno: NIC, mini: null, rozbal: NIC, pohledStranky: k.pohledStranky, rozhraniStranky: k.rozhraniStranky,
    sbaleno: false, prepniSbaleni: NIC, zvetsit: null, vOkne: true, tarif: k.tarif,
  }), [instance, def, k.pohledStranky, k.rozhraniStranky, k.tarif]);
  return (
    <KontextWidgetuCtx.Provider value={kontext}>
      <PojistkaWidgetu resetKey={instance} onZnovu={NIC}>
        <Suspense fallback={<Skeleton className="h-24" />}>
          <Komponenta instance={instance} velikost="L" nastaveni={nastaveni} nahled={false} />
        </Suspense>
      </PojistkaWidgetu>
    </KontextWidgetuCtx.Provider>
  );
}

function SchrankaOkno({ fronty, onClose }: { fronty: { f: Fronta; pocet: number; def: DefiniceWidgetu }[]; onClose: () => void }) {
  const t = useT('widgety');
  const celkem = fronty.reduce((s, x) => s + x.pocet, 0);
  const podtitul = celkem > 0
    ? t('{n, plural, one {# věc čeká} few {# věci čekají} other {# věcí čeká}} na tvoje rozhodnutí — vyřídíš je tady, bez přecházení mezi stránkami.', { n: celkem })
    : t('Všechno je vyřízené.');
  return (
    <NadPlochou>
      <Modal open onClose={onClose} size="xl" title={t('Ke schválení')}
        subtitle={podtitul}>
        <Sloupec mezera={8}>
          {fronty.map(({ f, pocet, def }) => (
            <section key={f.id} aria-labelledby={`schranka-${f.id}`} data-schranka-fronta={f.id}>
              <h3 id={`schranka-${f.id}`} className="t-section flex items-center gap-2 mb-3">
                <Icon name={f.ikona} size={18} className="shrink-0 text-black/55" />
                <span className="min-w-0 truncate">{t(def.nazev)}</span>
                {pocet > 0 ? <Chip tone="wait" size="sm">{pocet}</Chip> : <Chip tone="ok" size="sm" icon="check">{t('vyřízeno')}</Chip>}
              </h3>
              <VlozenyWidget def={def} />
            </section>
          ))}
        </Sloupec>
      </Modal>
    </NadPlochou>
  );
}

function useFronta(f: Fronta, zapnuto: boolean) {
  return useDataWidgetu<number>(zapnuto ? ZDROJE_FRONT[f.id] ?? null : null, f.pocet);
}

function CekaNaTebe({ nastaveni, nahled }: WidgetProps<{ fronty?: unknown }>) {
  const t = useT('widgety');
  const smi = useSmi();
  const nav = useNavigace();
  // Fronty v otevřené schránce se zafixují při otevření: vyřízená fronta zůstane v okně
  // s „vyřízeno" (a s Vrátit svého widgetu), místo aby pod prstem zmizela.
  const [schranka, setSchranka] = useState<IdFronty[] | null>(null);
  const { ceka } = useBrana([]);
  const vybrane = new Set(Array.isArray(nastaveni.fronty) ? nastaveni.fronty.map(String) : []);
  // Fronta se ptá serveru jen s vlastním klíčem (každá jiný, spec §6.1) a jen
  // když ji člověk v nastavení nechal. Volba bez oprávnění v nastavení není
  // a uložená se ignoruje (spec §2.3).
  const zap = (f: Fronta) => {
    const k = klicCasti(ID_CEKA, f.id);
    return !!k && vybrane.has(f.id) && smi(k);
  };
  // Háčky v pevném pořadí, třináct front — každá má vlastní dotaz a mezipaměť
  // sdílenou s ostatními widgety (objednávky i sklad se tak neptají dvakrát).
  const stavy = [
    useFronta(FRONTY[0], zap(FRONTY[0])),
    useFronta(FRONTY[1], zap(FRONTY[1])),
    useFronta(FRONTY[2], zap(FRONTY[2])),
    useFronta(FRONTY[3], zap(FRONTY[3])),
    useFronta(FRONTY[4], zap(FRONTY[4])),
    useFronta(FRONTY[5], zap(FRONTY[5])),
    useFronta(FRONTY[6], zap(FRONTY[6])),
    useFronta(FRONTY[7], zap(FRONTY[7])),
    useFronta(FRONTY[8], zap(FRONTY[8])),
    useFronta(FRONTY[9], zap(FRONTY[9])),
    useFronta(FRONTY[10], zap(FRONTY[10])),
    useFronta(FRONTY[11], zap(FRONTY[11])),
    useFronta(FRONTY[12], zap(FRONTY[12])),
  ];
  const aktivni = FRONTY.map((f, i) => ({ f, s: stavy[i] })).filter(x => !x.s.vypnuto);
  const selhane = aktivni.filter(x => x.s.error);
  const nacitaSe = aktivni.some(x => x.s.loading);
  const cekaji = aktivni.filter(x => (x.s.data ?? 0) > 0);
  // Chybu celého widgetu obal ukáže, jen když selhalo všechno — jedna
  // nedostupná fronta nesmí schovat ty ostatní. Jinak ji řekne věta dole.
  const vsechnoSelhalo = selhane.length > 0 && selhane.length === aktivni.length;
  const nacteni: readonly StavNacteni[] = ceka ? [CEKA]
    : vsechnoSelhalo ? selhane.map(x => x.s)
    : aktivni.filter(x => !x.s.error).map(x => x.s);
  // Když nic nečeká, v klidu se widget nekreslí (spec O5) — pojistkou zůstávají odznaky v navigaci.
  const prazdno = !ceka && !nacitaSe && cekaji.length === 0 && selhane.length === 0 ? null : undefined;
  const celkem = cekaji.reduce((s, x) => s + (x.s.data ?? 0), 0);
  // Fronty, které jdou vyřídit přímo ve schránce: mají svůj widget a divák na něj smí.
  const smiWidget = (d: DefiniceWidgetu) => d.opravneni.vse.every(k => smi(k)) && (d.opravneni.nektere.length === 0 || d.opravneni.nektere.some(k => smi(k)));
  const doSchranky = cekaji.flatMap(({ f, s }) => {
    const id = WIDGET_FRONTY[f.id];
    const def = id ? widget(id) : undefined;
    return def && def.stav === 'hotovo' && smiWidget(def) ? [{ f, pocet: s.data ?? 0, def }] : [];
  });
  const patka = !nahled && doSchranky.length > 0 ? (
    <Button variant="secondary" icon="check" onClick={() => setSchranka(doSchranky.map(x => x.f.id))} data-schranka-otevrit="">
      {t('Vyřídit na jednom místě')}
    </Button>
  ) : undefined;

  // Bílá karta, ne `ton="wait"`: jantarový podklad na velikosti L zabral na Přehledu 15–20 %
  // obsahu a na telefonu přes polovinu okna (ds/pokryti.py, kolo 69), přitom DP §5 dává tónům
  // celkem do ~5 %. Stav „něco čeká" nese jantarový chip s počtem u titulku — ten je vidět
  // i v menší velikosti a nepřebije jedinou limetku ani inkoustový widget peněz.
  const vSchrance = schranka ? schranka.flatMap(id => {
    const i = FRONTY.findIndex(f => f.id === id);
    const def = widget(WIDGET_FRONTY[id] ?? '');
    return i >= 0 && def ? [{ f: FRONTY[i], pocet: stavy[i].data ?? 0, def }] : [];
  }) : [];
  return (
    <>
    {schranka && <SchrankaOkno fronty={vSchrance} onClose={() => setSchranka(null)} />}
    <Widget nacteni={nacteni} prazdno={prazdno} patka={patka}
      doplnek={celkem > 0 ? (
        // Holé „5" by nikdo nepřečetl: sčítá různé fronty (směny, objednávky…)
        // a odečítač by po titulku řekl jen „pět". Vidící dostanou „5 čeká",
        // odečítač celou větu se skloněným podstatným jménem (stejně jako Badge).
        <Chip tone="wait" size="sm">
          <span aria-hidden>{t('{n} čeká', { n: celkem })}</span>
          <span className="sr-only">{t('{n, plural, one {Celkem # položka čeká} few {Celkem # položky čekají} other {Celkem # položek čeká}}', { n: celkem })}</span>
        </Chip>
      ) : undefined}>
      <Sloupec mezera={3}>
        {/* v4 (V08, V4): fronty jako ŘÁDKY SEZNAMU přes celou šířku (jamka s ikonou, věta s počtem, šipka
            na R) — dřív pilulky podle délky textu pod sebou: šest tlačítek, šest pravých hran. */}
        {cekaji.length > 0 && (
          <ul className="list" data-ceka-fronty>
            {cekaji.map(({ f, s }) => {
              const text = f.text(t, s.data ?? 0);
              // Proklik jen tam, kam divák smí; jinak číslo zůstane jako stav, bez odkazu (a bez šipky).
              const smi = nav.smiPohled(f.pohled);
              return (
                <li key={f.id}>
                  <ListRow as="div" lead={<JamkaIkony ikona={f.ikona} />} title={text}
                    onClick={smi ? () => (f.otevri ? f.otevri(nav) : nav.onNavigate(f.pohled)) : undefined} />
                </li>
              );
            })}
          </ul>
        )}
        {selhane.length > 0 && !vsechnoSelhalo && (
          <p className="note note-wait text-[13px]">
            {t('Nenačetly se: {seznam}.', { seznam: selhane.map(x => t(NAZVY_FRONT.get(x.f.id) ?? x.f.id)).join(', ') })}{' '}
            <button type="button" onClick={() => selhane.forEach(x => x.s.reload())}
              className="tap-target-sm font-semibold underline underline-offset-2">{t('Zkusit znovu')}</button>
          </p>
        )}
      </Sloupec>
    </Widget>
    </>
  );
}

// ---------------------------------------------------------------------------
// První kroky
// ---------------------------------------------------------------------------

const ID_KROKY = 'prehled.prvni_kroky';
/** Klíč z dřívějšího Přehledu: kdo si kroky skryl, nechce je vidět ani na ploše. */
const KLIC_SKRYTO_STARY = 'managero-onboarding-dismissed';

/** Kroky, jejichž data se ještě načítají: řádek průvodce se ukáže až s nimi, ať seznam neposkakuje. */
const nacitaSeKroky = (kroky: { s: { loading: boolean } }[]) => kroky.some(k => k.s.loading);

function PrvniKroky({ velikost }: WidgetProps) {
  const t = useT('widgety');
  const smi = useSmi();
  const nav = useNavigace();
  const { ceka } = useBrana([]);
  // Čte se hned při prvním vykreslení, ne v efektu: skrytý widget se nemá
  // na nic ptát (widget se kreslí až v prohlížeči, na serveru nikdy).
  const [skryto] = useState(() => {
    try { return typeof window !== 'undefined' && window.localStorage.getItem(KLIC_SKRYTO_STARY) === '1'; } catch { return false; }
  });
  const smiKrok = (cast: string) => { const k = klicCasti(ID_KROKY, cast); return !skryto && !!k && smi(k); };
  const tym = useDataWidgetu<number>(smiKrok('tym') ? '/api/teams' : null,
    raw => seznam(raw?.members).filter(m => m?.role === 'employee').length);
  const smeny = useDataWidgetu<number>(smiKrok('smeny') ? '/api/shifts' : null,
    raw => (Array.isArray(raw?.shifts) ? raw.shifts : seznam(raw)).length);
  const sklad = useDataWidgetu<number>(smiKrok('sklad') ? '/api/inventory' : null, raw => seznam(raw).length);
  const uzaverka = useDataWidgetu<number>(smiKrok('uzaverka') ? '/api/closings' : null, raw => seznam(raw?.closings).length);
  // Průvodce prvotním nastavením: přerušený nebo rozdělaný se tu připomene jako první řádek.
  // GET /api/onboarding vrací ostatním členům a podnikům bez průvodce 200 se stavem
  // `nedostupny`, takže se tu ptá každý, kdo smí nastavení podniku. Dotaz je doplněk:
  // když selže, řádek prostě není (seznam kroků se kvůli němu nerozbije).
  const onboarding = useDataWidgetu<string | null>(!skryto && smi('podnik.nastaveni') ? '/api/onboarding' : null,
    raw => (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.stav === 'string' ? raw.stav : null));
  const nedokonceno = onboarding.data === 'rozpracovano' || onboarding.data === 'preskoceno';

  const L = velikost === 'L';
  const kroky = [
    { id: 'tym', s: tym, pohled: 'team-settings', label: t('Přidat prvního zaměstnance'), hint: t('Kód pro připojení nebo pozvánku najdeš v Nastavení týmu.') },
    { id: 'smeny', s: smeny, pohled: 'shifts', label: t('Naplánovat první směny'), hint: t('Rozvrh sestavíš ručně, nebo podle dostupnosti týmu.') },
    { id: 'sklad', s: sklad, pohled: 'inventory', label: t('Založit sklad'), hint: t('Kategorie a položky — pak uvidíš, co dochází.') },
    { id: 'uzaverka', s: uzaverka, pohled: 'reports', label: t('Vyplnit první uzávěrku'), hint: t('Na konci směny se spočítá kasa a vedení ji uvidí hned.') },
  ].filter(k => !k.s.vypnuto);
  const polozky: ChecklistItem[] = kroky.map(k => {
    const done = (k.s.data ?? 0) > 0;
    return {
      id: k.id, label: k.label, done,
      hint: L && !done ? k.hint : undefined,
      // Krok vede tam, kde se udělá — jen když tam divák smí.
      onClick: !done && nav.smiPohled(k.pohled) ? () => nav.onNavigate(k.pohled) : undefined,
    };
  });
  if (nedokonceno && !nacitaSeKroky(kroky)) {
    polozky.unshift({
      id: 'nastaveni', label: t('Dokončit nastavení podniku'), done: false,
      hint: L ? t('Průvodce se zeptá na typ podniku, otevírací dobu a cíle a podle toho poskládá Přehled.') : undefined,
      onClick: () => window.location.assign('/employer/start'),
    });
  }
  const hotovo = polozky.filter(p => p.done).length;
  const nacitaSe = kroky.some(k => k.s.loading);
  const vseHotovo = !nacitaSe && kroky.every(k => !k.s.error) && hotovo === polozky.length && !nedokonceno;

  return (
    <Widget nacteni={ceka ? CEKA : kroky.map(k => k.s)}
      doplnek={polozky.length > 0 && !nacitaSe ? <Chip tone="muted" size="sm">{hotovo}/{polozky.length}</Chip> : undefined}
      prazdno={!ceka && (skryto || kroky.length === 0 || vseHotovo) ? null : undefined}>
      {/* Audit 2026-10 (V44, vzor Shopify setup guide / Toast „Jsi nastaven z 55 %"): pruh postupu nad
          kroky — kolik zbývá, je vidět dřív, než člověk kroky přečte. Inkoust, ne limetka (stav, ne akce). */}
      <Sloupec mezera={3}>
        {polozky.length > 0 && !nacitaSe && (
          <div className="flex items-center gap-3" data-prvni-kroky-postup>
            <div className="h-1.5 flex-1 rounded-full bg-black/[0.07] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={polozky.length} aria-valuenow={hotovo}
              aria-label={t('Nastaveno {hotovo} z {celkem}', { hotovo, celkem: polozky.length })}>
              <div className="h-full rounded-full bg-[#16181A] dark:bg-white/80 transition-[width] duration-300" style={{ width: `${Math.round((hotovo / polozky.length) * 100)}%` }} />
            </div>
            <span className="t-meta tabular-nums shrink-0">{t('Nastaveno z {pct} %', { pct: Math.round((hotovo / polozky.length) * 100) })}</span>
          </div>
        )}
        <Checklist items={polozky} />
      </Sloupec>
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Odkaz
// ---------------------------------------------------------------------------

/** Ikona podle druhu cíle, když si člověk žádnou nevybral (stejně jako v nastavení widgetu). */
const IKONA_DRUHU: Record<CilOdkazu['druh'], string> = { pohled: 'overview', kategorie: 'box', postup: 'clipboard', navod: 'book' };

function popisCile(cil: CilOdkazu, t: PrekladFn): string {
  switch (cil.druh) {
    case 'pohled': return t('Záložka');
    case 'kategorie': return t('Sklad · {nazev}', { nazev: cil.nazev });
    case 'postup': return t('Postup');
    case 'navod': return t('Návod');
  }
}

function Odkaz({ velikost, nastaveni }: WidgetProps<{ cil?: unknown; popisek?: unknown; ikona?: unknown }>) {
  const t = useT('widgety');
  const nav = useNavigace();
  const { upravy, nahled } = useWidget();
  const cil = rozeberCil(nastaveni.cil);
  const kam = cil ? navigaceCile(cil) : null;
  // Na cíl, kam role nesmí, se dlaždice nekreslí (katalog: cíle podle KLICE_POHLEDU).
  const smi = !!kam && nav.smiPohled(kam.pohled);
  const zaznam = cil?.druh === 'pohled' ? nav.pohledy.find(p => p.id === cil.pohled) : undefined;
  const vlastni = typeof nastaveni.popisek === 'string' ? nastaveni.popisek.trim() : '';
  const popisek = vlastni || zaznam?.label
    || (cil?.druh === 'kategorie' ? cil.nazev : null)
    || ((cil?.druh === 'postup' || cil?.druh === 'navod') ? cil.nazev : null)
    || t('Odkaz');
  const ikona = (typeof nastaveni.ikona === 'string' && nastaveni.ikona) || zaznam?.icon || IKONA_DRUHU[cil?.druh ?? 'pohled'];

  let prazdno: React.ReactNode | null | undefined;
  if (!cil) {
    prazdno = (
      <p className="t-meta">
        {upravy ? t('Klepni na widget a vyber, kam má vést.')
          : nahled ? t('Vybereš, kam vede — záložku, kategorii skladu, postup nebo návod.')
          : t('Kam vede, vybereš v úpravách stránky.')}
      </p>
    );
  } else if (!smi) {
    // V klidu se nekreslí vůbec; v úpravách musí jít najít a odebrat, tak řekne proč.
    prazdno = upravy || nahled ? <p className="t-meta">{t('Na tenhle cíl tvoje role nemá.')}</p> : null;
  }

  return (
    <Widget titulek={popisek} ikona={ikona} prazdno={prazdno}
      otevrit={smi && kam ? () => nav.onNavigate(kam.pohled, kam.arg) : undefined}>
      {cil && (
        <p className="t-meta flex min-w-0 items-center gap-1">
          <span className={velikost === 'S' ? 'truncate' : 'min-w-0'}>{popisCile(cil, t)}</span>
          <Icon name="chevronRight" size={16} className="shrink-0 text-black/40" />
        </p>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Připnutá nabídka
// ---------------------------------------------------------------------------

const ID_NABIDKA = 'sdileni.pripnuta_nabidka';

interface Sdileni { token: string; title: string | null; kind: string }

/** Obal kvůli mezipaměti: `null` z výběru by useDataWidgetu bral jako „pořád se načítá". */
function vyberSdileni(raw: any): { sdileni: Sdileni | null } {
  const p = raw?.pinnedShare;
  if (!p || typeof p.token !== 'string' || !p.token) return { sdileni: null };
  return { sdileni: { token: p.token, title: typeof p.title === 'string' ? p.title : null, kind: String(p.kind ?? '') } };
}

/** QR sdílené stránky (jen velký widget): hosté si ji načtou telefonem přímo z obrazovky. */
function QrNabidky({ adresa }: { adresa: string }) {
  const t = useT('widgety');
  const [plna, setPlna] = useState('');
  const [obrazek, setObrazek] = useState<string | null>(null);
  useEffect(() => {
    let platne = true;
    const url = `${window.location.origin}${adresa}`;
    setPlna(url);
    // Knihovna se stáhne až tady — jen velký widget ji potřebuje.
    import('qrcode')
      .then(m => m.toDataURL(url, { width: 320, margin: 1 }))
      .then(d => { if (platne) setObrazek(d); }, () => { if (platne) setObrazek(null); });
    return () => { platne = false; };
  }, [adresa]);
  return (
    <Well className="flex items-center gap-4">
      {obrazek
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={obrazek} alt={t('QR kód sdílené stránky')} width={128} height={128} className="h-32 w-32 shrink-0 rounded-xl" />
        : <Skeleton className="h-32 w-32 shrink-0" />}
      <div className="min-w-0">
        <p className="text-sm text-black/70 text-pretty">{t('Hosté si kód načtou telefonem. Nebo jim pošli odkaz:')}</p>
        <p className="mt-1 text-[13px] font-medium text-[#16181A] break-all select-all">{plna}</p>
      </div>
    </Well>
  );
}

function PripnutaNabidka({ velikost }: WidgetProps) {
  const t = useT('widgety');
  const smi = useSmi();
  const nav = useNavigace();
  const { ok, ceka } = useBrana([]);
  const data = useDataWidgetu(ok ? '/api/teams' : null, vyberSdileni);
  const s = data.data?.sdileni ?? null;
  const klic = klicCasti(ID_NABIDKA, 'akce:spravovat');
  // Sdílení se spravuje v Nastavení týmu — odkaz jen s klíčem i s přístupem na tu obrazovku.
  const spravuje = !!klic && smi(klic) && nav.smiPohled('team-settings');
  const S = velikost === 'S';
  const nazev = s ? (s.title?.trim() || (s.kind === 'guides' ? t('Naše nabídka') : t('Co máme skladem'))) : '';
  const adresa = s ? `/s/${encodeURIComponent(s.token)}` : '';

  let prazdno: React.ReactNode | null | undefined;
  if (!s) {
    // Kdo sdílení nespravuje, s prázdným widgetem nic neudělá — v klidu se nekreslí.
    prazdno = !spravuje ? null
      : S ? <p className="t-meta">{t('Nic není připnuté.')}</p>
      : (
        // v4 (V11, V16): prázdný stav na levé ose karty, akce přes celou šířku (L→R × 44).
        <PrazdnoWidgetu titul={t('Nic není připnuté')}
          text={t('Připni sdílenou stránku a tým ji tu otevře jedním ťuknutím.')}
          akce={<Button variant="secondary" onClick={() => nav.onNavigate('team-settings')}>{t('Nastavit sdílení')}</Button>} />
      );
  }

  return (
    <Widget nacteni={ceka ? CEKA : data} prazdno={prazdno}
      otevrit={S && s ? () => { window.open(adresa, '_blank', 'noopener,noreferrer'); } : undefined}>
      {s && (S ? (
        <p className="t-meta flex min-w-0 items-center gap-1">
          <span className="truncate">{nazev}</span>
          <Icon name="external" size={15} className="shrink-0 text-black/40" />
        </p>
      ) : (
        <Sloupec mezera={3}>
          <ul className="list">
            <ListRow lead={<JamkaIkony ikona={s.kind === 'guides' ? 'book' : 'box'} />}
              title={nazev} meta={t('Sdílená stránka pro zákazníky')}
              // Odkaz do nové karty je <a> s třídami tlačítka — ne <span>, který
              // vypadal jako tlačítko uvnitř klikací karty (audit Přehledu).
              actions={(
                <a href={adresa} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                  {t('Otevřít')}<Icon name="external" size={15} className="shrink-0" />
                </a>
              )} />
          </ul>
          {velikost === 'L' && <QrNabidky adresa={adresa} />}
        </Sloupec>
      ))}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Nástěnka
// ---------------------------------------------------------------------------

const ID_NASTENKA = 'oznameni.nastenka';
const URL_OZNAMENI = '/api/announcements';
const MAX_OZNAMENI = 1000;

interface Oznameni {
  id: number;
  content: string;
  pinned: boolean;
  createdAt: string;
  authorName: string | null;
  authorAvatar: string | null;
  /** Kolo 8: oznámení chce od každého „Rozumím". */
  requireAck: boolean;
  /** Já (na tabletu člověk u něj) jsem potvrdil. */
  acked: boolean;
  /** Kolik lidí potvrdilo; `memberCount` jen pro správu nástěnky (z kolika). */
  ackCount: number;
  memberCount: number | null;
}

function vyberOznameni(raw: any): Oznameni[] {
  // Nečekaný tvar je chyba, ne prázdná nástěnka — prázdno by lhalo, že nic nevisí.
  if (!Array.isArray(raw?.announcements)) throw new Error('Nástěnka přišla v nečekaném tvaru.');
  return raw.announcements.map((a: any) => ({
    id: Number(a.id),
    content: String(a.content ?? ''),
    pinned: a.pinned === true,
    createdAt: String(a.createdAt ?? ''),
    authorName: typeof a.authorName === 'string' ? a.authorName : null,
    authorAvatar: typeof a.authorAvatar === 'string' ? a.authorAvatar : null,
    requireAck: a.requireAck === true,
    acked: a.acked === true,
    ackCount: Number(a.ackCount) || 0,
    memberCount: Number.isFinite(Number(a.memberCount)) && a.memberCount != null ? Number(a.memberCount) : null,
  }));
}

/** Kdo oznámení potvrdil a kdo ještě ne (GET ?cteni=<id>, jen správa nástěnky). */
interface Cteni { potvrdili: { id: number; name: string; avatar: string | null; at: string }[]; ceka: { id: number; name: string; avatar: string | null }[] }
function vyberCteni(raw: any): Cteni {
  if (!Array.isArray(raw?.potvrdili) || !Array.isArray(raw?.ceka)) throw new Error('Stav přečtení přišel v nečekaném tvaru.');
  const clovek = (x: any) => ({ id: Number(x.id), name: String(x.name ?? ''), avatar: typeof x.avatar === 'string' ? x.avatar : null });
  return { potvrdili: raw.potvrdili.map((x: any) => ({ ...clovek(x), at: String(x.at ?? '') })), ceka: raw.ceka.map(clovek) };
}

/**
 * „Přečteno 5 z 8" → okno zdola se dvěma seznamy (potvrdili s časem / zatím ne)
 * a „Připomenout" — push těm, kdo ještě nepotvrdili. Connecteam tomu říká
 * „who has viewed your update"; tady je to pod stejným oznámením, kde se čte.
 */
function KdoCetlOkno({ oznameni, onClose }: { oznameni: Oznameni; onClose: () => void }) {
  const t = useT('widgety');
  const data = useDataWidgetu(`${URL_OZNAMENI}?cteni=${oznameni.id}`, vyberCteni);
  const [posilam, setPosilam] = useState(false);
  const [hlaska, setHlaska] = useState<{ text: string; chyba: boolean } | null>(null);
  const pripomenout = async () => {
    setPosilam(true);
    setHlaska(null);
    try {
      const res = await fetch(URL_OZNAMENI, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: oznameni.id, remind: true }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setHlaska({ text: typeof d?.error === 'string' ? d.error : t('Připomenutí se nepodařilo odeslat.'), chyba: true }); return; }
      setHlaska({ text: t('Připomenutí odešlo {n, plural, one {# člověku} few {# lidem} other {# lidem}}.', { n: Number(d?.reminded) || 0 }), chyba: false });
    } catch {
      setHlaska({ text: t('Připomenutí se nepodařilo odeslat — zkontroluj připojení.'), chyba: true });
    } finally {
      setPosilam(false);
    }
  };
  const d = data.data;
  const ceka = d?.ceka.length ?? 0;
  return (
    <Modal open onClose={onClose} size="sm" title={t('Kdo četl')}
      subtitle={d ? t('Přečteno {a} z {b}', { a: cislo(d.potvrdili.length), b: cislo(d.potvrdili.length + d.ceka.length) }) : undefined}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Zavřít')}</Button>
        <Button variant="primary" icon="bell" loading={posilam} disabled={!d || ceka === 0} onClick={pripomenout}>{t('Připomenout')}</Button>
      </>}>
      {data.loading && <p className="t-meta">{t('Načítám…')}</p>}
      {data.error && <p className="note note-danger" role="alert">{t('Stav přečtení se nenačetl.')}</p>}
      {d && (
        <div className="space-y-4">
          <div>
            <p className="t-label">{t('Potvrdili')}</p>
            {d.potvrdili.length === 0
              ? <p className="t-meta mt-1">{t('Nikdo zatím nepotvrdil.')}</p>
              : <ul className="list mt-1">{d.potvrdili.map(c => <ListRow key={c.id} lead={<Avatar emoji={c.avatar} name={c.name} size="sm" />} title={c.name} right={<span className="t-meta tabular-nums">{dbTimeDayHM(c.at)}</span>} />)}</ul>}
          </div>
          <div>
            <p className="t-label">{t('Zatím ne')}</p>
            {d.ceka.length === 0
              ? <p className="t-meta mt-1">{t('Všichni potvrdili.')}</p>
              : <ul className="list mt-1">{d.ceka.map(c => <ListRow key={c.id} lead={<Avatar emoji={c.avatar} name={c.name} size="sm" />} title={c.name} />)}</ul>}
          </div>
          {hlaska && <p className={`note ${hlaska.chyba ? 'note-danger' : 'note-ok'}`} role="status">{hlaska.text}</p>}
        </div>
      )}
    </Modal>
  );
}

/**
 * Nové oznámení: na velké nástěnce přímo nad seznamem, na střední v okně
 * (nabídka „···" v hlavičce). Rozepsané se drží v konceptu stejně jako dřív
 * v AnnouncementsManager (stejný klíč, takže se neztratí ani při přechodu).
 */
function NoveOznameni({ nahled, okno }: { nahled: boolean; okno?: { onClose: () => void } }) {
  const t = useT('widgety');
  const [text, setText] = useState('');
  const [doChatu, setDoChatu] = useState(false);
  // Kolo 8: „Vyžadovat potvrzení" — každý pod oznámením klepne na „Rozumím" a vedení vidí, kdo ještě ne.
  const [potvrzeni, setPotvrzeni] = useState(false);
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const id = useId();
  // V náhledu (galerie) koncept nečte ani nepíše — jinak by se přetahoval se skutečnou nástěnkou.
  const koncept = useDraft('oznameni', { content: text, alsoChat: doChatu, requireAck: potvrzeni }, v => { setText(v.content); setDoChatu(v.alsoChat); setPotvrzeni(v.requireAck === true); }, {
    vychozi: { content: '', alsoChat: false, requireAck: false }, aktivni: !nahled,
  });

  const pripnout = async () => {
    const obsah = text.trim();
    if (!obsah || ukladam || nahled) return;
    setUkladam(true);
    setChyba(null);
    try {
      const res = await fetch(URL_OZNAMENI, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: obsah, postToChat: doChatu, requireAck: potvrzeni }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d?.ok) { setChyba(typeof d?.error === 'string' ? d.error : t('Oznámení se nepodařilo připnout.')); return; }
      koncept.hotovo();
      setText('');
      setDoChatu(false);
      setPotvrzeni(false);
      obnovDataWidgetu(URL_OZNAMENI);
      okno?.onClose();
    } catch {
      setChyba(t('Oznámení se nepodařilo připnout — zkontroluj připojení.'));
    } finally {
      setUkladam(false);
    }
  };

  const pole = (
    <Sloupec mezera={3}>
      <DraftNote koncept={koncept} co="rozepsané oznámení" />
      <Field id={`${id}-text`} label={t('Nové oznámení')} hint={t('Připnuté oznámení uvidí celý tým a přijde mu upozornění.')}>
        <Textarea id={`${id}-text`} rows={okno ? 4 : 2} maxLength={MAX_OZNAMENI} value={text}
          onChange={e => setText(e.target.value)} />
      </Field>
      {/* v4 (V5): přepínače jako řádky seznamu (název vlevo, přepínač na R), ne volné ovládání pod polem. */}
      <ul className="list">
        <SwitchRow className="list-row" title={t('Poslat i do týmového chatu')} checked={doChatu} onChange={setDoChatu} />
        <SwitchRow className="list-row" title={t('Vyžadovat potvrzení')} hint={t('Každý pod oznámením klepne na „Rozumím" a uvidíš, kdo ještě ne.')} checked={potvrzeni} onChange={setPotvrzeni} />
      </ul>
      {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
    </Sloupec>
  );

  if (okno) {
    return (
      <Modal open onClose={okno.onClose} size="md" title={t('Nové oznámení')} subtitle={t('Nástěnka')}
        footer={<>
          <Button variant="secondary" onClick={okno.onClose}>{t('Zrušit', undefined, 'dialog')}</Button>
          <Button variant="primary" loading={ukladam} disabled={!text.trim()} onClick={pripnout}>{t('Připnout oznámení')}</Button>
        </>}>
        {pole}
      </Modal>
    );
  }
  return (
    <Sloupec mezera={4}>
      {pole}
      {/* v4 (P2, P17): „Připnout" přes celou šířku L→R × 44 jako akce formuláře, počítadlo znaků nad ním
          na pravé hraně (patří k poli) — dřív tlačítko obsahové šířky vpravo, na monitoru osamělé. */}
      <Sloupec mezera={2}>
        <p className="t-meta tabular-nums text-right">{cislo(text.length)}/{cislo(MAX_OZNAMENI)}</p>
        <div className="rada rada-rovne rada-m">
          <Button variant="primary" loading={ukladam} disabled={!text.trim()} onClick={pripnout}>{t('Připnout oznámení')}</Button>
        </div>
      </Sloupec>
    </Sloupec>
  );
}

function UpravaOznameni({ oznameni, onClose, onUlozit }: {
  oznameni: Oznameni;
  onClose: () => void;
  /** Vrátí chybovou hlášku, nebo null, když se uložilo. */
  onUlozit: (text: string) => Promise<string | null>;
}) {
  const [text, setText] = useState(oznameni.content);
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const id = useId();
  const t = useT('widgety');
  const ulozit = async () => {
    const obsah = text.trim();
    if (!obsah || ukladam) return;
    setUkladam(true);
    const e = await onUlozit(obsah);
    setUkladam(false);
    if (e) setChyba(e); else onClose();
  };
  return (
    <Modal open onClose={onClose} size="sm" title={t('Upravit oznámení')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Zrušit', undefined, 'dialog')}</Button>
        <Button variant="primary" loading={ukladam} disabled={!text.trim()} onClick={ulozit}>{t('Uložit')}</Button>
      </>}>
      <div className="space-y-3">
        <Field id={`${id}-text`} label={t('Text oznámení')}>
          <Textarea id={`${id}-text`} rows={5} maxLength={MAX_OZNAMENI} value={text} autoFocus onChange={e => setText(e.target.value)} />
        </Field>
        {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
      </div>
    </Modal>
  );
}

function Nastenka({ velikost, nastaveni, nahled }: WidgetProps<{ archiv?: unknown }>) {
  const t = useT('widgety');
  const smi = useSmi();
  const { ok, ceka } = useBrana([]);
  const klic = klicCasti(ID_NASTENKA, 'akce:spravovat');
  // Psaní, úpravy, odepnutí i archiv jen se správou nástěnky — dřív je UI nabízelo
  // každému a zápis skončil 403 (audit, oprávnění Přehledu).
  const spravuje = !!klic && smi(klic);
  const data = useDataWidgetu(ok ? URL_OZNAMENI : null, vyberOznameni);
  const [chyba, setChyba] = useState<string | null>(null);
  const [pisu, setPisu] = useState(false);
  const [upravuji, setUpravuji] = useState<Oznameni | null>(null);
  const [mazu, setMazu] = useState<Oznameni | null>(null);
  const [mazani, setMazani] = useState(false);
  // Kolo 8: potvrzení přečtení („Rozumím") a okno „Kdo četl".
  const [kdoCetl, setKdoCetl] = useState<Oznameni | null>(null);
  const [potvrzuji, setPotvrzuji] = useState<number | null>(null);

  const M = velikost === 'M';
  const vse = data.data ?? [];
  const pripnuta = vse.filter(a => a.pinned);
  // Dokud člověk nepotvrdí, nese nástěnka tečku: počet k potvrzení v doplňku hlavičky (tón wait).
  const kPotvrzeni = pripnuta.filter(a => a.requireAck && !a.acked).length;

  /** „Rozumím": za sebe; na tabletu za člověka vybraného PINem (cookie actingAs jako u úkolů). */
  const potvrdit = async (a: Oznameni) => {
    if (nahled || potvrzuji != null) return;
    setChyba(null);
    setPotvrzuji(a.id);
    try {
      const res = await fetch(URL_OZNAMENI, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setChyba(typeof d?.error === 'string' ? d.error : t('Potvrzení se nepodařilo uložit.'));
        return;
      }
      obnovDataWidgetu(URL_OZNAMENI);
    } catch {
      setChyba(t('Potvrzení se nepodařilo uložit — zkontroluj připojení.'));
    } finally {
      setPotvrzuji(null);
    }
  };
  // Odepnutá tým nevidí; správce si je zapne v nastavení widgetu („Ukázat i odepnutá").
  const odepnuta = spravuje && nastaveni.archiv === true ? vse.filter(a => !a.pinned) : [];

  /** PATCH; vrátí chybovou hlášku, nebo null. */
  const zapis = async (a: Oznameni, zmena: { pinned?: boolean; content?: string }): Promise<string | null> => {
    if (nahled) return null;
    try {
      const res = await fetch(URL_OZNAMENI, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id, ...zmena }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        return typeof d?.error === 'string' ? d.error : t('Uložení se nepodařilo.');
      }
      obnovDataWidgetu(URL_OZNAMENI);
      return null;
    } catch {
      return t('Uložení se nepodařilo — zkontroluj připojení.');
    }
  };
  const prepnoutPripnuti = async (a: Oznameni) => {
    setChyba(null);
    const e = await zapis(a, { pinned: !a.pinned });
    if (e) setChyba(e);
  };
  const smazat = async () => {
    if (!mazu || nahled) return;
    setMazani(true);
    setChyba(null);
    try {
      const res = await fetch(`${URL_OZNAMENI}?id=${mazu.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setChyba(typeof d?.error === 'string' ? d.error : t('Oznámení se nepodařilo smazat.'));
      } else {
        obnovDataWidgetu(URL_OZNAMENI);
      }
    } catch {
      setChyba(t('Oznámení se nepodařilo smazat — zkontroluj připojení.'));
    } finally {
      setMazani(false);
      setMazu(null);
    }
  };

  const akceRadku = (a: Oznameni): MenuItem[] => [
    { label: t('Upravit…'), icon: 'pencil', onClick: () => setUpravuji(a) },
    a.pinned
      ? { label: t('Odepnout'), icon: 'pin', hint: t('Tým ho přestane vidět, zůstane v archivu.'), onClick: () => { void prepnoutPripnuti(a); } }
      : { label: t('Znovu připnout'), icon: 'pin', onClick: () => { void prepnoutPripnuti(a); } },
    // Nebezpečné červeně a na konci; vede na potvrzení, protože se nedá vrátit.
    { label: t('Smazat…'), icon: 'trash', danger: true, onClick: () => setMazu(a) },
  ];

  /** Vpravo: stav potvrzení — správě nástěnky „Přečteno 5 z 8" (klepnutí otevře, kdo), ostatním „K potvrzení" / „Potvrzeno". */
  const stavPotvrzeni = (a: Oznameni) => {
    if (!a.requireAck) return null;
    if (spravuje && a.memberCount != null) {
      const vsichni = a.ackCount >= a.memberCount;
      return (
        <button type="button" onClick={() => setKdoCetl(a)} aria-haspopup="dialog" data-kdo-cetl={a.id}
          className={`chip chip-sm tap-target-sm ${vsichni ? 'chip-ok' : 'chip-wait'} hover:brightness-95 transition`}>
          <Icon name={vsichni ? 'check' : 'users'} size={11} className="shrink-0" />
          {t('Přečteno {a} z {b}', { a: cislo(a.ackCount), b: cislo(a.memberCount) })}
        </button>
      );
    }
    return a.acked ? <Chip tone="ok" size="sm" icon="check">{t('Potvrzeno')}</Chip> : <Chip tone="wait" size="sm">{t('K potvrzení')}</Chip>;
  };
  const radek = (a: Oznameni) => (
    <ListRow key={a.id} className="items-start"
      lead={<Avatar emoji={a.authorAvatar} name={a.authorName} size="sm" />}
      // Text oznámení se zalamuje (ListRow jinak řádek ořízne); na střední nástěnce nejvýš tři řádky.
      // `line-clamp` si nastavuje vlastní display, proto ne zároveň s `block` (ten by ořez přebil).
      title={<span className={`whitespace-pre-wrap break-words ${M ? 'line-clamp-3' : 'block'}`}>{a.content}</span>}
      meta={[a.authorName, dbTimeDayHM(a.createdAt)].filter(Boolean).join(' · ')}
      // „Rozumím" pod textem (44 px, tmavé primary — widget nikdy limetku): dokud člověk nepotvrdí.
      detail={a.requireAck && !a.acked && a.pinned ? (
        <Button variant="primary" size="md" icon="check" className="mt-2" loading={potvrzuji === a.id} onClick={() => { void potvrdit(a); }}>{t('Rozumím')}</Button>
      ) : undefined}
      right={!a.pinned ? <Chip tone="muted" size="sm">{t('Odepnuto')}</Chip> : stavPotvrzeni(a) ?? undefined}
      // Na telefonu se akce odlomí na vlastní řádek a jediné „···" by skončilo vlevo pod
      // textem; obal ho drží u pravého okraje jako v ostatních řádcích.
      actions={spravuje ? <div className="flex justify-end"><Menu size="sm" label={t('Další akce s oznámením: {text}', { text: a.content.length > 40 ? `${a.content.slice(0, 40)}…` : a.content })} items={akceRadku(a)} /></div> : undefined} />
  );

  const nicNevisi = pripnuta.length === 0 && odepnuta.length === 0;
  let prazdno: React.ReactNode | null | undefined;
  if (nicNevisi && !spravuje) {
    // Týmu prázdná nástěnka nic neříká — v klidu se nekreslí, jako dřív pruh oznámení.
    prazdno = null;
  } else if (nicNevisi && M) {
    prazdno = (
      <PrazdnoWidgetu titul={t('Nástěnka je prázdná')} text={t('Připni oznámení a celý tým ho uvidí.')}
        akce={<Button variant="secondary" icon="plus" onClick={() => setPisu(true)}>{t('Nové oznámení')}</Button>} />
    );
  }

  const radkyM = [...pripnuta, ...odepnuta];
  // Chyba z výběru dat je česká věta bez přístupu k t — přeloží se až tady.
  const nacteniData: StavNacteni = data.error === 'Nástěnka přišla v nečekaném tvaru.'
    ? { ...data, error: t('Nástěnka přišla v nečekaném tvaru.') } : data;
  return (
    <>
      <Widget nacteni={ceka ? CEKA : nacteniData} prazdno={prazdno}
        // Velká nástěnka se nezkracuje pod „Zobrazit vše": formulář nahoře by jinak připnutá oznámení
        // (to hlavní, co tým čte) odsunul pod odlesk. Zkracuje se jen střední karta s pěti řádky.
        bezZkraceni={!M}
        // v4 (V16): na střední nástěnce je „Nové oznámení" akce widgetu v patce (L→R × 44), ne pilulka pod seznamem.
        patka={M && spravuje ? <Button variant="secondary" icon="plus" onClick={() => setPisu(true)}>{t('Nové oznámení')}</Button> : undefined}
        doplnek={kPotvrzeni > 0 ? <Chip tone="wait" size="sm" aria-label={t('{n, plural, one {# oznámení k potvrzení} few {# oznámení k potvrzení} other {# oznámení k potvrzení}}', { n: kPotvrzeni })}>{cislo(kPotvrzeni)}</Chip>
          : pripnuta.length > 0 ? <Chip tone="muted" size="sm">{cislo(pripnuta.length)}</Chip> : undefined}>
        <Sloupec mezera={6}>
          {spravuje && !M && <NoveOznameni nahled={nahled} />}
          {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
          {M ? (
            <Sloupec mezera={2}>
              <ul className="list">{radkyM.slice(0, 5).map(radek)}</ul>
              {radkyM.length > 5 && <p className="t-meta">{aDalsich(t, radkyM.length - 5)}</p>}
              {/* Střední nástěnka nemá místo na formulář — „Nové oznámení" v patce otevře okno.
                  Jedna položka v nabídce „···" v hlavičce by vedle „···" řádků jen mátla. */}
            </Sloupec>
          ) : (
            <>
              {pripnuta.length > 0
                ? <ul className="list">{pripnuta.map(radek)}</ul>
                : <p className="t-meta">{t('Na nástěnce zatím nic nevisí.')}</p>}
              {odepnuta.length > 0 && (
                <Sloupec mezera={1}>
                  <p className="t-label">{t('Odepnutá')}</p>
                  <ul className="list">{odepnuta.map(radek)}</ul>
                </Sloupec>
              )}
            </>
          )}
        </Sloupec>
      </Widget>
      {/* Okna mimo obal: když obal ukazuje prázdný stav, obsah se nekreslí —
          a „Nové oznámení" z prázdného stavu musí okno otevřít taky. */}
      {pisu && !nahled && (
        <NadPlochou><NoveOznameni nahled={false} okno={{ onClose: () => setPisu(false) }} /></NadPlochou>
      )}
      {upravuji && !nahled && (
        <NadPlochou>
          <UpravaOznameni oznameni={upravuji} onClose={() => setUpravuji(null)} onUlozit={txt => zapis(upravuji, { content: txt })} />
        </NadPlochou>
      )}
      {kdoCetl && !nahled && (
        <NadPlochou><KdoCetlOkno oznameni={kdoCetl} onClose={() => setKdoCetl(null)} /></NadPlochou>
      )}
      {mazu && !nahled && (
        <NadPlochou>
          <Modal open onClose={() => setMazu(null)} size="sm" title={t('Smazat oznámení?')}
            footer={<>
              <Button variant="secondary" onClick={() => setMazu(null)}>{t('Zrušit', undefined, 'dialog')}</Button>
              <Button variant="danger-solid" loading={mazani} onClick={smazat}>{t('Smazat')}</Button>
            </>}>
            <p className="text-sm text-black/70 text-pretty">
              {t('Oznámení zmizí z nástěnky i z archivu a vrátit ho nepůjde. Když ho má tým jen přestat vidět, stačí ho odepnout.')}
            </p>
          </Modal>
        </NadPlochou>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Nepřečtené zprávy
// ---------------------------------------------------------------------------

interface Vlakno {
  id: number;
  tym: boolean;
  nazev: string;
  avatar: string | null;
  posledni: string | null;
  cas: number;
  neprectenych: number;
}

function vyberVlakna(raw: any): Vlakno[] {
  const radky = Array.isArray(raw?.conversations) ? raw.conversations : seznam(raw);
  return radky.map((c: any) => ({
    id: Number(c.id),
    tym: c.type === 'team',
    nazev: String(c.name ?? 'Konverzace'),
    // Náhradní 👤 ze serveru ne — bez avataru kreslí Avatar siluetu (DP §3.18).
    avatar: typeof c.avatar === 'string' && c.avatar !== '👤' ? c.avatar : null,
    posledni: typeof c.lastMessage === 'string' ? c.lastMessage : null,
    cas: parseDbTime(c.lastTime)?.getTime() ?? 0,
    neprectenych: Number(c.unreadCount) || 0,
  }));
}

function NeprecteneZpravy({ velikost }: WidgetProps) {
  const t = useT('widgety');
  const nav = useNavigace();
  const { ok, ceka } = useBrana(widget('chat.neprectene')?.opravneni.vse ?? ['chat.pouzivat']);
  const data = useDataWidgetu(ok ? '/api/conversations' : null, vyberVlakna);
  const vlakna = (data.data ?? []).filter(v => v.neprectenych > 0).sort((a, b) => b.cas - a.cas);
  const celkem = vlakna.reduce((s, v) => s + v.neprectenych, 0);
  const doChatu = nav.smiPohled('chat');

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : data}
        // S jedním nepřečteným vláknem vede proklik rovnou do něj, jinak na seznam konverzací.
        otevrit={doChatu ? () => nav.onNavigate('chat', vlakna.length === 1 ? String(vlakna[0].id) : undefined) : undefined}>
        <Stat label={t('Nepřečtených')} value={cislo(celkem)} note={celkem === 0 ? t('Vše přečteno') : t('{n, plural, one {# vlákno} few {# vlákna} other {# vláken}}', { n: vlakna.length })} />
      </Widget>
    );
  }
  return (
    <Widget nacteni={ceka ? CEKA : data} odkaz={{ popisek: t('Chat', undefined, 'nav'), pohled: 'chat' }}
      doplnek={celkem > 0 ? <Chip tone="info" size="sm">{cislo(celkem)}</Chip> : undefined}
      prazdno={vlakna.length === 0 ? <p className="t-meta">{t('Všechno máš přečtené.')}</p> : undefined}>
      <ul className="list">
        {vlakna.slice(0, 3).map(v => (
          // Klikací řádek ve vlastním <li>, jinak by .list nad ním nekreslil linku (DP §3.6).
          <li key={v.id}>
            <ListRow as="div"
              lead={v.tym ? <JamkaIkony ikona="users" /> : <Avatar emoji={v.avatar} name={v.nazev} size="sm" />}
              title={v.nazev} meta={v.posledni ?? t('Příloha')}
              right={<Chip tone="info" size="sm">{cislo(v.neprectenych)}</Chip>}
              onClick={doChatu ? () => nav.onNavigate('chat', String(v.id)) : undefined} />
          </li>
        ))}
      </ul>
      {vlakna.length > 3 && <p className="t-meta mt-2">{aDalsich(t, vlakna.length - 3)}</p>}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'prehled.ceka_na_tebe': CekaNaTebe,
  'prehled.prvni_kroky': PrvniKroky,
  odkaz: Odkaz,
  'sdileni.pripnuta_nabidka': PripnutaNabidka,
  'oznameni.nastenka': Nastenka,
  'chat.neprectene': NeprecteneZpravy,
};
