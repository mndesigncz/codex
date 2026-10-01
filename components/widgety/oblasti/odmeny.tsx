'use client';

// Widgety oblasti „Odměny a hodnocení" — komponenty (kolo 68, doplněno v kole 69; spec §2.5, §2.6, §6.2).
//
// Vlastník v kole 69: balík B7 (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/odmeny.ts,
// výpočty (body po zdrojích, dny hodnocení, volné body, nehodnocené dny) v
// lib/odmenyPrehled.ts, kde je hlídají testy scripts/testy/k69-b7.ts. Tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — test AK-20 (scripts/testy/k68-widgety.ts) klíče čte z textu, proto bez spreadu.
//
// Co z dřívějšího Přehledu opravují (audit Přehledu vedení a Domů zaměstnance):
//  - Ohodnotit směny: Segmented Včera/Dnes s počtem místo ručně psaného
//    přepínače, `.list` + ListRow místo šedých jamek, stav Chipem místo dvou
//    ručních pilulek s různým písmem, „Vše ohodnoceno" jako `.note note-ok`
//    místo limetkového panelu, bez ikony v kolečku u nadpisu. Tlačítko jen
//    s hodnoceni.hodnotit; okno hodnocení (ShiftReviewModal) se stahuje až
//    na klepnutí a kreslí se nad plochou, ne do karty.
//  - Zpětná vazba: hvězdy ikonou (Chip se star), ne znakem „★"; „Beru na
//    vědomí" `primary sm`; bez tónované karty a inkoustového kolečka.
//  - Tenhle měsíc: StatRow tří čísel místo ručních štítků verzálkami a čísel
//    20 px; odpracované hodiny jen z uzavřených záznamů do 24 h (zapomenutý
//    příchod se nepřičítá — dřív z něj bylo 433 h) a jen vlastní, i když
//    vedení dostává záznamy celého týmu.
//
// Kolo 69 (B7) — widgety z bloků stránek Odměny (RewardsView, MyRewards):
//  - Žádosti o odměny: karta s ručně limetkovým okrajem, řádky jako jamky, avatar
//    jako emoji v textu s náhradou 👤, ruční „Zamítnout" a „Vybrat víc". Teď `.list`
//    s Avatarem, Schválit `primary sm`, Zamítnout `danger sm`, výběr přes BulkBar.
//  - Žebříček: karta na člověka, medaile 🥇🥈🥉, ruční inkoustová pilulka úrovně.
//    Teď jeden seznam s pořadím číslem a body v pevném sloupci.
//  - Katalog odměn: ruční tmavá/jantarová/šedá tlačítka, confirm(), „✓" v hlášce.
//    Teď Vyměnit `primary sm` (zakázané, když chybí volné body), potvrzení v Modal,
//    Toast; „Vyměnit" počítá s body, které už drží čekající žádost (server by odmítl).
//  - Odkud mám body: čtyři jamky s kolečkem ikony a čísly 24 px — a počty úkolů
//    vydávané za body. Teď body po zdrojích (počet × sazba) a součet sedí s celkem.
//  - Úrovně: rámované boxy, limetkově tónovaná aktuální, „TEĎ" verzálkami. Teď `.list`
//    a Chip „Teď".
//  - Hodnocení mých směn: šedé dlaždice dnů s ručními štítky a vlastními hvězdami
//    (SVG s hexy). Teď řádek na den s Chipy a detail dne v okně.
//  - Nové: Nehodnocené směny, Výtky v týmu, Moje úroveň a body.
//
// Data jen přes useDataWidgetu (sdílená mezipaměť — /api/rewards i /api/rewards/catalog
// čte víc widgetů i stránka jedním dotazem), dotaz až při `nacteno && ma(klíč)` (spec §1.5).
// V náhledu (galerie) se nic nezapisuje ani neotevírá.

import React, { Suspense, createContext, lazy, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import type { KomponentaWidgetu, Navigace, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { parseDbTime, pragueDayOf, pragueToday } from '@/lib/pragueTime';
import { apiMessage, okJson } from '@/lib/api';
import {
  KLIC_KALENDAR, UDALOST_KALENDAR,
  bodyDne, cekajiciZadosti, dnyHodnoceni, minulyMesic, nabidka, nehodnocene, odkudBody, vyberKatalog, vyberOdmeny,
  vyberPoradi, vytkyTymu, zbyvaDoDalsi,
  type DenHodnoceni, type MojeUroven, type NabidkaOdmeny, type Zadost,
} from '@/lib/odmenyPrehled';
import { Icon } from '../../Icons';
import {
  Avatar, BulkBar, Button, Chip, EmptyState, Field, Input, ListRow, Modal, Segmented, SelectBox, Stat, StatRow, Toast, Well,
  runBulk, useSelection,
} from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { Widget, useWidget, type StavNacteni } from '../Widget';
import { obnovDataWidgetu, useDataWidgetu } from '../useDataWidgetu';
import { NavigaceKontext, useNavigace, useSmi } from '../NavigaceKontext';

// Okno hodnocení je velké (detail směny, úkoly, uzávěrka) a potřebuje ho jen
// ten, kdo zrovna hodnotí — do části aplikace s widgety se nestahuje předem.
const ShiftReviewModal = lazy(() => import('../../employer/ShiftReviewModal'));

// ---------------------------------------------------------------------------
// Společné drobnosti
// ---------------------------------------------------------------------------

type Klic = string | readonly string[];

const seznam = (x: unknown): any[] => (Array.isArray(x) ? x : []);
const cislo = (n: number) => n.toLocaleString('cs-CZ');
const aDalsich = (t: PrekladFn, n: number) => t('…a {n, plural, one {# další} few {# další} other {# dalších}}', { n });
/** „3 body": počet i tvar dohromady (číslo bez formátu, jako czCount). */
const bodu = (t: PrekladFn, n: number) => t('{n, plural, one {# bod} few {# body} other {# bodů}}', { n });
/** Tvar slova „bod" po číslovce, bez čísla (jako czForm). */
const bodTvar = (t: PrekladFn, n: number) => t('{n, plural, one {bod} few {body} other {bodů}}', { n });
/** Věta se zvýrazněnou částí: klíč má `{tucne}`, text kolem se přeloží a zvýrazněné se vloží doprostřed. */
function sTucnym(t: PrekladFn, klic: string, tucne: React.ReactNode, className: string): React.ReactNode {
  const [pred, po = ''] = t(klic, { tucne: '\u0001' }).split('\u0001');
  return <>{pred}<b className={className}>{tucne}</b>{po}</>;
}
const sZnamenkem = (n: number) => `${n > 0 ? '+' : ''}${cislo(n)}`;

/** Klíč části widgetu z katalogu (`opravneni.pole`) — jeden zdroj pravdy s galerií a serverem. */
function klicCasti(idWidgetu: string, cast: string): Klic | null {
  return widget(idWidgetu)?.opravneni.pole?.[cast] ?? null;
}

/**
 * Brána widgetu (spec §1.5): přísně `nacteno && ma()` — `ma()` před načtením
 * oprávnění vrací ANO a dotaz by odešel dřív, než víme, jestli na data divák
 * má. S načtenými oprávněními musí platit VŠECHNY klíče (`opravneni.vse` —
 * Výtky v týmu chtějí žebříček i hodnocení; `ma(pole)` by stačilo kterékoli).
 * Když /api/teams/mine selže, rozhodl už server seznamem v rozložení.
 */
function useBrana(klice: readonly string[]): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  return { ok: nacteno ? klice.every(k => ma(k)) : chyba, ceka: !nacteno && !chyba };
}

/** Brána podle katalogu (`opravneni.vse`) — jeden zdroj pravdy s galerií a serverem. */
const useBranaWidgetu = (id: string, zaloha: readonly string[]) => useBrana(widget(id)?.opravneni.vse ?? zaloha);

/** Vlastní id z relace (vedení s oprávněním na žádosti dostává žádosti celého týmu). */
function useJa(): { ja: number | null; nacitam: boolean } {
  const { data: session, status } = useSession();
  return { ja: Number((session?.user as { id?: string } | undefined)?.id) || null, nacitam: status === 'loading' };
}

const URL_KATALOG = '/api/rewards/catalog';

/**
 * Plocha stránky Odměny (RewardsView, MyRewards) to oznamuje widgetům: odkaz „Odměny ›"
 * by tam vedl na tutéž stránku a klepnutí by nic neudělalo — mrtvý prvek a matoucí
 * slib pro odečítač. Rámec (Widget) stránku plochy nezná, proto kontext oblasti
 * stejně jako ObdobiStrankyDochazky u Docházky.
 */
export const NaStranceOdmen = createContext(false);

/** Odkaz na stránku Odměny, jen když na ní divák už není. */
function useOdkazOdmeny(): { popisek: string; pohled: 'rewards' } | undefined {
  const t = useT('widgety');
  const naStrance = useContext(NaStranceOdmen);
  return useMemo(() => (naStrance ? undefined : { popisek: t('Odměny'), pohled: 'rewards' as const }), [naStrance, t]);
}

/** Jamka s ikonou jako `lead` řádku (DP §3.6: 36px jamka, ikona 16). */
function Jamka({ children }: { children: React.ReactNode }) {
  return <span aria-hidden className="well grid h-9 w-9 shrink-0 place-items-center text-black/55 text-lg leading-none">{children}</span>;
}

/** Ikona odměny: emoji od vedení je obsah (DP §3.18), bez něj ikona dárku, ne náhradní 🎁. */
function IkonaOdmeny({ ikona }: { ikona: string | null }) {
  return <Jamka>{ikona ?? <Icon name="gift" size={16} />}</Jamka>;
}

/** Pokrok k další úrovni: tenký pruh, limetka bez záře = stav (DP §0, tah 1). */
function Pokrok({ procento, popis }: { procento: number; popis: string }) {
  return (
    <span role="progressbar" aria-label={popis} aria-valuemin={0} aria-valuemax={100} aria-valuenow={procento}
      className="block h-1.5 w-full rounded-full bg-black/[0.06] overflow-hidden">
      <span className="block h-full rounded-full bg-[#C8F542]" style={{ width: `${procento}%` }} />
    </span>
  );
}

/** „Ještě nevíme, jestli smí": kostra a žádný dotaz. */
const CEKA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

/**
 * Okno z widgetu se kreslí do <body>, ne do karty: buňka mřížky dostává
 * transformace (FLIP, promáčknutí) a pod transformovaným předkem by `fixed`
 * počítalo od karty. `data-plocha-chrom` říká ploše, že klepnutí a podržení
 * v okně nejsou gesta nad widgetem (React události z portálu bublají až do plochy).
 */
function NadPlochou({ children }: { children: React.ReactNode }) {
  const [cil, setCil] = useState<HTMLElement | null>(null);
  useEffect(() => { setCil(document.body); }, []);
  return cil ? createPortal(<div data-plocha-chrom="">{children}</div>, cil) : null;
}

/** Datum větou pro řádek seznamu: „Čtvrtek 24. září" (velké písmeno jako cz-sentence). */
function denVetou(datum: string): string {
  // Poledne: datum bez času se nepřehoupne do vedlejšího dne v žádné zóně.
  const d = new Date(`${datum}T12:00:00`);
  if (Number.isNaN(d.getTime())) return datum;
  const s = d.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toLocaleUpperCase('cs-CZ') + s.slice(1);
}

// ---------------------------------------------------------------------------
// Ohodnotit směny
// ---------------------------------------------------------------------------

const ID_HODNOTIT = 'hodnoceni.ohodnotit_smeny';

interface Soupiska {
  id: number;
  jmeno: string;
  avatar: string | null;
  hodnoceno: boolean;
  hvezdy: number;
  vytka: boolean;
  smena: string | null;
  od: string | null;
  do: string | null;
}

/** Jen kdo ten den pracoval — soupiska ze serveru nese celý tým. */
function vyberSoupisku(raw: any): Soupiska[] {
  return seznam(raw?.list).filter((r: any) => r?.worked === true).map((r: any) => ({
    id: Number(r.id),
    jmeno: String(r.name ?? ''),
    avatar: typeof r.avatar === 'string' ? r.avatar : null,
    hodnoceno: r.reviewed === true,
    hvezdy: Number(r.rating) || 0,
    vytka: r.flagged === true,
    smena: typeof r.shiftLabel === 'string' ? r.shiftLabel : null,
    od: typeof r.startTime === 'string' ? r.startTime.slice(0, 5) : null,
    do: typeof r.endTime === 'string' ? r.endTime.slice(0, 5) : null,
  }));
}

const metaSmeny = (r: Soupiska, t: PrekladFn) => {
  const cas = r.od && r.do ? `${r.od}–${r.do}` : '';
  return [r.smena, cas].filter(Boolean).join(' · ') || t('Bez naplánované směny');
};

function OhodnotitSmeny({ velikost }: WidgetProps) {
  const t = useT('widgety');
  const smi = useSmi();
  const { nahled } = useWidget();
  const { ok, ceka } = useBranaWidgetu(ID_HODNOTIT, ['hodnoceni.zobrazit']);
  const dnes = pragueToday();
  const vcera = pragueToday(-1);
  const sVcera = useDataWidgetu(ok ? `/api/shift-reviews?date=${vcera}` : null, vyberSoupisku);
  const sDnes = useDataWidgetu(ok ? `/api/shift-reviews?date=${dnes}` : null, vyberSoupisku);
  const klic = klicCasti(ID_HODNOTIT, 'akce:hodnotit');
  // Tlačítko jen s hodnoceni.hodnotit — kdo hodnocení jen vidí, dostane přehled.
  const hodnoti = !!klic && smi(klic);
  const cekaVcera = (sVcera.data ?? []).filter(r => !r.hodnoceno).length;
  const cekaDnes = (sDnes.data ?? []).filter(r => !r.hodnoceno).length;
  // Vedení hodnotí nejčastěji předchozí den — začne se tam, dokud tam někdo čeká.
  const [den, setDen] = useState<'vcera' | 'dnes' | null>(null);
  const vybrany = den ?? (cekaVcera > 0 ? 'vcera' : 'dnes');
  const datum = vybrany === 'vcera' ? vcera : dnes;
  const radky = [...((vybrany === 'vcera' ? sVcera.data : sDnes.data) ?? [])]
    .sort((a, b) => Number(a.hodnoceno) - Number(b.hodnoceno) || a.jmeno.localeCompare(b.jmeno, 'cs'));
  const videt = velikost === 'M' ? radky.slice(0, 5) : radky;
  const [hodnotim, setHodnotim] = useState<{ r: Soupiska; datum: string } | null>(null);
  // „Kalendář ›" slibuje kalendář hodnocení na vybraném dni. Obyčejný odkaz by jen přešel na
  // pohled rewards — na stránce Odměny by se nestalo nic a z Přehledu by se otevřel žebříček.
  // Navigaci proto widget předá otevriKalendar (událost pro nástroj, jinak sessionStorage
  // a přechod) — stejně jako Nehodnocené směny. Rámec umí jen odkaz na pohled, tak jen
  // podstrčí vlastní onNavigate; práva na pohled (smiPohled) zůstávají.
  const nav = useNavigace();
  const navKalendar = useMemo<Navigace>(() => ({
    ...nav,
    onNavigate: (pohled, arg) => (pohled === 'rewards' ? otevriKalendar(nav, datum) : nav.onNavigate(pohled, arg)),
  }), [nav, datum]);

  return (
    <>
      <NavigaceKontext.Provider value={navKalendar}>
      <Widget nacteni={ceka ? CEKA : [sVcera, sDnes]} odkaz={{ popisek: t('Kalendář'), pohled: 'rewards' }}>
        <Segmented size="sm" ariaLabel={t('Den')} value={vybrany} onChange={setDen}
          options={[{ id: 'vcera', label: t('Včera'), count: cekaVcera }, { id: 'dnes', label: t('Dnes'), count: cekaDnes }]} />
        <div className="mt-3 space-y-3">
          {radky.length === 0 ? (
            <p className="t-meta">{vybrany === 'dnes' ? t('Dnes zatím nikdo nepracoval.') : t('Včera nikdo nepracoval.')}</p>
          ) : (
            <>
              {radky.every(r => r.hodnoceno) && (
                <p className="note note-ok flex items-center gap-2"><Icon name="check" size={15} className="shrink-0" />{t('Vše ohodnoceno')}</p>
              )}
              <ul className="list">
                {videt.map(r => (
                  <ListRow key={r.id} lead={<Avatar emoji={r.avatar} size="sm" />} title={r.jmeno} meta={metaSmeny(r, t)}
                    right={!r.hodnoceno ? <Chip tone="wait" size="sm">{t('Čeká')}</Chip>
                      : r.vytka ? <Chip tone="bad" size="sm" icon="warning">{t('Výtka')}</Chip>
                      : <Chip tone="ok" size="sm" icon="star">{r.hvezdy > 0 ? `${r.hvezdy}/5` : t('Hodnoceno')}</Chip>}
                    actions={hodnoti ? (
                      // Jméno v přístupném názvu: „Upravit" je i tlačítko hlavičky stránky a odečítač
                      // by jinak přečetl pět stejných tlačítek za sebou.
                      <Button variant={r.hodnoceno ? 'ghost' : 'primary'} size="sm" onClick={() => setHodnotim({ r, datum })}
                        aria-label={r.hodnoceno ? t('Upravit hodnocení: {jmeno}', { jmeno: r.jmeno }) : t('Ohodnotit: {jmeno}', { jmeno: r.jmeno })}>
                        {r.hodnoceno ? t('Upravit') : t('Ohodnotit')}
                      </Button>
                    ) : undefined} />
                ))}
              </ul>
              {radky.length > videt.length && <p className="t-meta">{aDalsich(t, radky.length - videt.length)}</p>}
            </>
          )}
        </div>
      </Widget>
      </NavigaceKontext.Provider>
      {hodnotim && !nahled && (
        <NadPlochou>
          <Suspense fallback={null}>
            <ShiftReviewModal
              employee={{ id: hodnotim.r.id, name: hodnotim.r.jmeno, avatar: hodnotim.r.avatar ?? undefined }}
              initialDate={hodnotim.datum}
              onClose={() => setHodnotim(null)}
              onSaved={() => { setHodnotim(null); sVcera.reload(); sDnes.reload(); }} />
          </Suspense>
        </NadPlochou>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Moje odměny: /api/rewards (Zpětná vazba a Tenhle měsíc)
// ---------------------------------------------------------------------------

const URL_ODMENY = '/api/rewards';

interface Hodnoceni {
  den: string;
  hvezdy: number;
  poznamka: string | null;
  body: number;
  vytka: boolean;
  videno: boolean;
  celaSmena: boolean;
}

interface MojeOdmeny {
  /**
   * Nese odpověď vlastní hodnocení? S odmeny.zebricek vrací server žebříček
   * celého týmu a vlastní hodnocení vynechá (katalog: triviální backend pro B7).
   */
  vlastni: boolean;
  hodnoceni: Hodnoceni[];
  nepotvrzenychVytek: number;
}

function vyberMojeOdmeny(raw: any): MojeOdmeny {
  return {
    vlastni: Array.isArray(raw?.reviews),
    hodnoceni: seznam(raw?.reviews).map((r: any) => ({
      den: String(r.work_date ?? '').slice(0, 10),
      hvezdy: Number(r.rating) || 0,
      poznamka: typeof r.note === 'string' && r.note.trim() ? r.note.trim() : null,
      body: Number(r.points) || 0,
      vytka: r.flagged === true,
      videno: !!r.seen_at,
      celaSmena: r.scope === 'shift',
    })).sort((a, b) => b.den.localeCompare(a.den)),
    nepotvrzenychVytek: Number(raw?.unseenFlagged) || 0,
  };
}

// ---------------------------------------------------------------------------
// Zpětná vazba
// ---------------------------------------------------------------------------

function ZpetnaVazba({ velikost }: WidgetProps) {
  const t = useT('widgety');
  const { nahled } = useWidget();
  const { ok, ceka } = useBrana([]);
  const data = useDataWidgetu(ok ? URL_ODMENY : null, vyberMojeOdmeny);
  const odkaz = useOdkazOdmeny();
  const [potvrzuji, setPotvrzuji] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const vse = data.data?.hodnoceni ?? [];
  // Nová = nepotvrzená za poslední týden; strop chrání databázi bez sloupce
  // seen_at, kde by jinak karta visela navždy (stejně jako dřív na Přehledu).
  const tyden = pragueToday(-7);
  const nove = vse.filter(r => !r.videno && r.den >= tyden);
  const posledni = nove[0] ?? null;
  const vytka = (data.data?.nepotvrzenychVytek ?? 0) > 0 || nove.some(r => r.vytka);
  const neco = !!posledni || vytka;

  const beruNaVedomi = async () => {
    if (nahled || potvrzuji) return;
    setPotvrzuji(true);
    setChyba(null);
    try {
      const res = await fetch(URL_ODMENY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markSeen: true }) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setChyba(typeof d?.error === 'string' ? d.error : t('Potvrzení se neuložilo.'));
        return;
      }
      obnovDataWidgetu(URL_ODMENY);
    } catch {
      setChyba(t('Potvrzení se neuložilo — zkontroluj připojení.'));
    } finally {
      setPotvrzuji(false);
    }
  };

  const noveHodnoceni = neco && (
    <div className="space-y-3">
      <div>
        <p className="text-[15px] font-medium leading-snug text-[#16181A] text-balance">
          {vytka ? t('U tvé směny je něco k nápravě') : t('Vedení ohodnotilo tvou směnu')}
        </p>
        <p className="t-meta mt-0.5 text-pretty">
          {vytka ? t('Podívej se, co je potřeba probrat, a potvrď, že to víš.')
            : posledni ? t('{den} — přečti si, co vedení napsalo.', { den: denVetou(posledni.den) }) : ''}
        </p>
      </div>
      {posledni && (posledni.hvezdy > 0 || posledni.body !== 0 || posledni.vytka) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {posledni.hvezdy > 0 && <Chip tone="ok" size="sm" icon="star">{posledni.hvezdy}/5</Chip>}
          {posledni.body !== 0 && (
            <Chip tone={posledni.body > 0 ? 'ok' : 'bad'} size="sm">{sZnamenkem(posledni.body)} {bodTvar(t, posledni.body)}</Chip>
          )}
          {posledni.vytka && <Chip tone="bad" size="sm" icon="warning">{t('Výtka')}</Chip>}
        </div>
      )}
      {posledni?.poznamka && <p className="text-sm text-black/70 text-pretty line-clamp-3">„{posledni.poznamka}“</p>}
      {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
      <Button variant="primary" size="sm" loading={potvrzuji} onClick={beruNaVedomi}>{t('Beru na vědomí')}</Button>
    </div>
  );

  if (velikost === 'M') {
    // Nic nového = nic k řešení: v klidu se střední widget nekreslí (jako dřív karta na Přehledu).
    return (
      <Widget nacteni={ceka ? CEKA : data} odkaz={odkaz} prazdno={neco ? undefined : null}>
        {noveHodnoceni}
      </Widget>
    );
  }
  // Velký: nové nahoře a pod ním historie hodnocení.
  return (
    <Widget nacteni={ceka ? CEKA : data} odkaz={odkaz}
      prazdno={vse.length === 0 ? <p className="t-meta">{t('Zatím žádné hodnocení směn.')}</p> : undefined}>
      {noveHodnoceni}
      <div className={neco ? 'mt-5' : ''}>
        <p className="t-label">{t('Poslední hodnocení')}</p>
        <ul className="list mt-1">
          {vse.slice(0, 5).map(r => (
            <ListRow key={`${r.den}-${r.celaSmena ? 's' : 'i'}`} title={denVetou(r.den)}
              meta={r.poznamka ?? (r.celaSmena ? t('Hodnocení celé směny') : t('Bez poznámky'))}
              value={r.body !== 0 ? sZnamenkem(r.body) : undefined}
              valueMeta={r.body !== 0 ? bodTvar(t, r.body) : undefined}
              right={(
                <>
                  {!r.videno && <Chip tone="info" size="sm">{t('Nové')}</Chip>}
                  {r.vytka ? <Chip tone="bad" size="sm" icon="warning">{t('Výtka')}</Chip>
                    : r.hvezdy > 0 ? <Chip tone="ok" size="sm" icon="star">{r.hvezdy}/5</Chip> : null}
                </>
              )} />
          ))}
        </ul>
        {vse.length > 5 && <p className="t-meta mt-2">{aDalsich(t, vse.length - 5)}</p>}
      </div>
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Tenhle měsíc
// ---------------------------------------------------------------------------

interface Zaznam { clovek: number; prichod: string | null; odchod: string | null }

function vyberZaznamy(raw: any): Zaznam[] {
  return seznam(raw?.entries).map((e: any) => ({
    clovek: Number(e.employeeId),
    prichod: typeof e.clockIn === 'string' ? e.clockIn : null,
    odchod: typeof e.clockOut === 'string' ? e.clockOut : null,
  }));
}

function TentoMesic(_: WidgetProps) {
  const t = useT('widgety');
  const smi = useSmi();
  const { data: session, status } = useSession();
  const meId = Number((session?.user as { id?: string } | undefined)?.id) || null;
  const brana = useBrana([]);
  const { ok } = brana;
  // Bez vlastního id se hodiny nedají spočítat (vedení dostává záznamy celého
  // týmu) — než se relace načte, kreslí se kostra, ne „–".
  const ceka = brana.ceka || status === 'loading';
  // Kdo má jen tablet docházky (bez dochazka.zobrazit), tomu server místo
  // vlastních záznamů vrátí soupisku týmu bez záznamů — hodiny tak neznáme.
  const bezZaznamu = smi('dochazka.tablet') && !smi('dochazka.zobrazit');
  // days=31: vedení dostává záznamy celého týmu za posledních N dní a měsíc jich má až 31.
  const dochazka = useDataWidgetu(ok && !bezZaznamu && meId != null ? '/api/attendance?days=31' : null, vyberZaznamy);
  const odmeny = useDataWidgetu(ok ? URL_ODMENY : null, vyberMojeOdmeny);

  // Čas z databáze přes parseDbTime (UTC bez zóny) a měsíc podle pražského dne.
  const mesic = pragueToday().slice(0, 7);
  const hodiny = dochazka.vypnuto ? null : (dochazka.data ?? []).reduce((soucet, z) => {
    if (z.clovek !== meId) return soucet;
    const od = parseDbTime(z.prichod);
    const doo = parseDbTime(z.odchod);
    // Jen uzavřené záznamy do 24 h: zapomenutý příchod se nepřičítá, dopíše ho docházka.
    if (!od || !doo || pragueDayOf(od).slice(0, 7) !== mesic) return soucet;
    const h = (doo.getTime() - od.getTime()) / 3_600_000;
    return h > 0 && h < 24 ? soucet + h : soucet;
  }, 0);
  const vlastni = odmeny.data?.vlastni ?? false;
  const hodnocene = (odmeny.data?.hodnoceni ?? []).filter(r => r.den.slice(0, 7) === mesic && r.hvezdy > 0);
  const prumer = hodnocene.length ? hodnocene.reduce((s, r) => s + r.hvezdy, 0) / hodnocene.length : null;
  const desetinne = (n: number) => n.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <Widget nacteni={ceka ? CEKA : [dochazka, odmeny]}>
      <StatRow>
        <Stat label={t('Odpracováno')} value={hodiny == null ? '–' : desetinne(hodiny)} unit={hodiny == null ? undefined : 'h'} />
        <Stat label={t('Hodnocených směn')} value={vlastni ? cislo(hodnocene.length) : '–'} />
        <Stat label={t('Průměr hodnocení')} value={vlastni && prumer != null ? desetinne(prumer) : '–'}
          unit={vlastni && prumer != null ? '/ 5' : undefined} />
      </StatRow>
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Moje úroveň a body (widget moje.uroven a nástroj stránky Odměny zaměstnance)
// ---------------------------------------------------------------------------

/**
 * Úroveň, body, pokrok a výhody. Dřív „hero" karta s rozmazanou limetkovou
 * skvrnou, štítkem verzálkami nad nadpisem, názvem úrovně 30 px, body
 * v inkoustové pilulce a výhodami v limetkovém boxu. Teď Stat (28 px, jako
 * každé rozhodující číslo), pruh pokroku a výhody ve Well s t-label.
 * Exportuje se i pro nástroj stránky (MyRewards) — stejná podoba na obou místech.
 */
export function MojeUrovenObsah({ ja, velikost }: { ja: MojeUroven; velikost: 'S' | 'M' | 'L' }) {
  const t = useT('widgety');
  const zbyva = zbyvaDoDalsi(ja);
  if (velikost === 'S') {
    return <Stat label={t('Úroveň')} value={<span className="block truncate">{ja.uroven}</span>} note={bodu(t, ja.body)} />;
  }
  return (
    <div className="space-y-4">
      <Stat label={t('Tvoje úroveň')} value={ja.uroven} note={t('{body} celkem', { body: `${cislo(ja.body)} ${bodTvar(t, ja.body)}` })} />
      {ja.dalsi ? (
        <div>
          <p className="flex items-center justify-between gap-3 text-[13px] text-black/55">
            <span className="min-w-0 truncate">{sTucnym(t, 'Do úrovně {tucne}', ja.dalsi.nazev, 'font-semibold text-[#16181A]')}</span>
            <span className="shrink-0 tabular-nums">{cislo(ja.vUrovni)} / {cislo(ja.naDalsi)}</span>
          </p>
          <div className="mt-1.5"><Pokrok procento={ja.procento} popis={t('Pokrok do úrovně {nazev}', { nazev: ja.dalsi.nazev })} /></div>
          <p className="t-meta mt-1.5">{t('Ještě {body} a postupuješ výš.', { body: bodu(t, zbyva) })}</p>
        </div>
      ) : (
        <p className="note note-ok flex items-center gap-2"><Icon name="award" size={15} className="shrink-0" />{t('Máš nejvyšší úroveň — skvělá práce.')}</p>
      )}
      {ja.vyhody && (
        <Well>
          <p className="t-label">{t('Tvoje výhody')}</p>
          <p className="mt-1 text-sm text-[#16181A] whitespace-pre-line text-pretty">{ja.vyhody}</p>
        </Well>
      )}
    </div>
  );
}

function MojeUrovenWidget({ velikost }: WidgetProps) {
  const t = useT('widgety');
  const { ok, ceka } = useBrana([]);
  const data = useDataWidgetu(ok ? URL_ODMENY : null, vyberOdmeny);
  const ja = data.data?.ja ?? null;
  const odkaz = useOdkazOdmeny();
  return (
    <Widget nacteni={ceka ? CEKA : data} odkaz={odkaz} kostra={velikost === 'S' ? 'cislo' : 'text'}
      prazdno={data.data && !ja ? <p className="t-meta">{t('Tenhle účet body nesbírá.')}</p> : undefined}>
      {ja && <MojeUrovenObsah ja={ja} velikost={velikost === 'S' ? 'S' : 'M'} />}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Odkud mám body
// ---------------------------------------------------------------------------

/** Počet položek, za které jsou body („5 splněných úkolů"); null = pro klíč není tvar. */
function pocetZaBody(t: PrekladFn, klic: string, n: number): string | null {
  switch (klic) {
    case 'ukoly': return t('{n, plural, one {# splněný úkol} few {# splněné úkoly} other {# splněných úkolů}}', { n });
    case 'postupy': return t('{n, plural, one {# dokončený postup} few {# dokončené postupy} other {# dokončených postupů}}', { n });
    case 'uzaverky': return t('{n, plural, one {# uzávěrka} few {# uzávěrky} other {# uzávěrek}}', { n });
    case 'hodnoceni': return t('{n, plural, one {# hodnocená směna} few {# hodnocené směny} other {# hodnocených směn}}', { n });
    default: return null;
  }
}

/** Názvy řádků rozpadu bodů z lib/odmenyPrehled.ts (RadekBodu.nazev). */
function nazevRadkuBodu(t: PrekladFn, klic: string, nazev: string): string {
  switch (klic) {
    case 'ukoly': return t('Úkoly');
    case 'postupy': return t('Postupy');
    case 'uzaverky': return t('Uzávěrky');
    case 'hodnoceni': return t('Z hodnocení směn');
    case 'polozky': return t('U položek a za odměny');
    default: return nazev;
  }
}

function OdkudBody(_: WidgetProps) {
  const t = useT('widgety');
  const { ok, ceka } = useBrana([]);
  const data = useDataWidgetu(ok ? URL_ODMENY : null, vyberOdmeny);
  const ja = data.data?.ja ?? null;
  const radky = ja && data.data ? odkudBody(ja.rozpad, data.data.sazebnik).filter(r => r.body !== 0 || (r.pocet ?? 0) > 0) : [];
  return (
    <Widget nacteni={ceka ? CEKA : data}
      prazdno={data.data && radky.length === 0
        ? <p className="t-meta text-pretty">{t('Zatím žádné body. Přibývají za úkoly, postupy, uzávěrky a hodnocení směn.')}</p>
        : undefined}>
      <ul className="list">
        {radky.map(r => (
          <ListRow key={r.klic} lead={<Jamka><Icon name={r.ikona} size={16} /></Jamka>} title={nazevRadkuBodu(t, r.klic, r.nazev)}
            meta={(r.pocet != null ? pocetZaBody(t, r.klic, r.pocet) : null) ?? t('Body od vedení a odečtené odměny')}
            value={sZnamenkem(r.body)} valueMeta={bodTvar(t, r.body)} />
        ))}
        {ja && <ListRow title={t('Celkem')} value={cislo(ja.body)} valueMeta={bodTvar(t, ja.body)} />}
      </ul>
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Úrovně
// ---------------------------------------------------------------------------

function Urovne(_: WidgetProps) {
  const t = useT('widgety');
  const { ok, ceka } = useBrana([]);
  const data = useDataWidgetu(ok ? URL_ODMENY : null, vyberOdmeny);
  const urovne = data.data?.urovne ?? [];
  const moje = data.data?.ja?.index ?? -1;
  return (
    <Widget nacteni={ceka ? CEKA : data} prazdno={data.data && urovne.length === 0 ? <p className="t-meta">{t('Úrovně zatím nejsou nastavené.')}</p> : undefined}>
      <ul className="list">
        {urovne.map((u, i) => (
          <ListRow key={`${i}-${u.nazev}`}
            lead={<Jamka>{i <= moje ? <Icon name="check" size={16} /> : <span className="text-sm font-semibold tabular-nums">{i + 1}</span>}</Jamka>}
            title={u.nazev} meta={u.vyhody || t('Bez výhod')}
            value={cislo(u.odBodu)} valueMeta={bodTvar(t, u.odBodu)}
            right={i === moje ? <Chip tone="ok" size="sm">{t('Teď')}</Chip> : undefined} />
        ))}
      </ul>
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Hodnocení mých směn
// ---------------------------------------------------------------------------

/** Druh hodnocené položky (task / procedure / closing), jinak obecné „Hodnocení". */
function druhPolozky(t: PrekladFn, druh: string): string {
  switch (druh) {
    case 'task': return t('Úkol');
    case 'procedure': return t('Postup');
    case 'closing': return t('Uzávěrka');
    default: return t('Hodnocení', undefined, 'widgety');
  }
}

function stavDne(d: DenHodnoceni, t: PrekladFn): React.ReactNode {
  return (
    <>
      {!d.videno && <Chip tone="info" size="sm">{t('Nové')}</Chip>}
      {d.vytka ? <Chip tone="bad" size="sm" icon="warning">{t('Výtka')}</Chip>
        : d.hvezdy > 0 ? <Chip tone="ok" size="sm" icon="star">{d.hvezdy}/5</Chip> : null}
    </>
  );
}

/** Detail dne: celkové hodnocení a všechno, co vedení označilo u položek. */
function DetailDne({ den, onZavrit }: { den: DenHodnoceni; onZavrit: () => void }) {
  const t = useT('widgety');
  const body = bodyDne(den);
  return (
    <NadPlochou>
      <Modal open onClose={onZavrit} size="md" title={denVetou(den.den)}
        subtitle={den.celaSmena ? t('Hodnocení celé směny') : t('Hodnocení směny')}
        footer={<Button variant="secondary" onClick={onZavrit}>{t('Zavřít')}</Button>}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {stavDne(den, t)}
            {body !== 0 && <Chip tone={body > 0 ? 'ok' : 'bad'} size="sm">{sZnamenkem(body)} {bodTvar(t, body)}</Chip>}
            {den.automaticke !== 0 && <Chip tone="muted" size="sm">{t('z toho automaticky {body}', { body: sZnamenkem(den.automaticke) })}</Chip>}
          </div>
          {den.poznamka && <p className="text-sm text-black/70 whitespace-pre-line text-pretty">„{den.poznamka}“</p>}
          {den.polozky.length > 0 && (
            <div>
              <p className="t-label">{t('Hodnocené položky')}</p>
              <ul className="list mt-1">
                {den.polozky.map(p => (
                  <li key={`${p.druh}-${p.id}`} className="py-3">
                    <p className="flex items-start gap-2">
                      {p.vytka && <Icon name="warning" size={15} className="mt-0.5 shrink-0 text-wait-ink" />}
                      <span className="min-w-0 flex-1">
                        <span className="t-label block">{druhPolozky(t, p.druh)}</span>
                        <span className="block text-[15px] font-medium text-[#16181A] text-pretty">{p.nazev}</span>
                      </span>
                      {p.body !== 0 && <Chip tone={p.body > 0 ? 'ok' : 'bad'} size="sm">{sZnamenkem(p.body)}</Chip>}
                    </p>
                    {p.poznamka && <p className="mt-1 text-[13px] text-black/60 whitespace-pre-line text-pretty">{p.poznamka}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!den.poznamka && den.polozky.length === 0 && <p className="t-meta">{t('Bez poznámky.')}</p>}
        </div>
      </Modal>
    </NadPlochou>
  );
}

function HodnoceniSmen({ velikost, nastaveni, nahled }: WidgetProps<{ pocet?: string }>) {
  const t = useT('widgety');
  const { ok, ceka } = useBrana([]);
  const data = useDataWidgetu(ok ? URL_ODMENY : null, dnyHodnoceni);
  const [detail, setDetail] = useState<DenHodnoceni | null>(null);
  const dny = data.data ?? [];
  // Počet z nastavení; střední se víc než pět řádků nevejde.
  const pocet = Math.max(1, Number(nastaveni.pocet) || 5);
  const videt = dny.slice(0, velikost === 'M' ? Math.min(pocet, 5) : pocet);
  return (
    <>
      <Widget nacteni={ceka ? CEKA : data}
        prazdno={data.data && dny.length === 0
          ? <EmptyState compact illustration="odmeny" title={t('Zatím žádné hodnocení')} hint={t('Vedení hodnotí směny průběžně — body za úkoly, postupy a uzávěrky se přičítají samy.')} />
          : undefined}>
        <ul className="list">
          {videt.map(d => {
            const body = bodyDne(d);
            const meta = d.poznamka ?? (d.polozky.length ? t('{n, plural, one {# hodnocená položka} few {# hodnocené položky} other {# hodnocených položek}}', { n: d.polozky.length }) : d.celaSmena ? t('Hodnocení celé směny') : t('Bez poznámky'));
            return (
              <li key={d.den}>
                <ListRow as="div" title={denVetou(d.den)} meta={meta}
                  value={body !== 0 ? sZnamenkem(body) : undefined} valueMeta={body !== 0 ? bodTvar(t, body) : undefined}
                  right={stavDne(d, t)} onClick={nahled ? undefined : () => setDetail(d)} />
              </li>
            );
          })}
        </ul>
        {dny.length > videt.length && <p className="t-meta mt-2">{aDalsich(t, dny.length - videt.length)}</p>}
      </Widget>
      {detail && !nahled && <DetailDne den={detail} onZavrit={() => setDetail(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Katalog odměn
// ---------------------------------------------------------------------------

type Zprava = { text: string; ton: 'ok' | 'bad' } | null;

/** Nová odměna do katalogu (odmeny.katalog) — dřív čtyři ruční pole v řádku a ručně psaná limetka. */
function NovaOdmena({ onZavrit, onHotovo }: { onZavrit: () => void; onHotovo: () => void }) {
  const t = useT('widgety');
  const [nazev, setNazev] = useState('');
  const [cena, setCena] = useState('');
  const [ikona, setIkona] = useState('');
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const cenaCislo = Math.round(Number(cena));
  const jde = nazev.trim().length > 0 && Number.isFinite(cenaCislo) && cenaCislo >= 1;
  const ulozit = async () => {
    if (!jde || ukladam) return;
    setUkladam(true);
    setChyba(null);
    try {
      await fetch(URL_KATALOG, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manage: true, title: nazev.trim(), cost: cenaCislo, icon: ikona.trim() || null }),
      }).then(okJson);
      onHotovo();
    } catch (e) {
      setChyba(apiMessage(e, t('Odměnu se nepodařilo přidat.')));
    } finally {
      setUkladam(false);
    }
  };
  return (
    <NadPlochou>
      <Modal open onClose={onZavrit} size="sm" title={t('Přidat odměnu')} subtitle={t('Za co si tým může vyměnit body')}
        footer={<>
          <Button variant="secondary" onClick={onZavrit}>{t('Zrušit', undefined, 'dialog')}</Button>
          <Button variant="primary" icon="plus" onClick={ulozit} loading={ukladam} disabled={!jde}>{t('Přidat odměnu')}</Button>
        </>}>
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); void ulozit(); }}>
          <Field id="odmena-nazev" label={t('Název')}>
            <Input id="odmena-nazev" value={nazev} onChange={e => setNazev(e.target.value)} maxLength={120} placeholder={t('Např. Směna končí o hodinu dřív')} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="odmena-cena" label={t('Cena v bodech')}>
              <Input id="odmena-cena" type="number" inputMode="numeric" min={1} value={cena} onChange={e => setCena(e.target.value)} className="tabular-nums" />
            </Field>
            <Field id="odmena-ikona" label={t('Emoji (nepovinné)')} hint={t('Třeba dárek nebo kávu.')}>
              <Input id="odmena-ikona" value={ikona} onChange={e => setIkona(e.target.value)} maxLength={4} />
            </Field>
          </div>
          {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      </Modal>
    </NadPlochou>
  );
}

const stavZadosti = (t: PrekladFn): Record<Zadost['stav'], { text: string; ton: 'wait' | 'ok' | 'muted' }> => ({
  pending: { text: t('Čeká'), ton: 'wait' },
  approved: { text: t('Schváleno'), ton: 'ok' },
  declined: { text: t('Zamítnuto'), ton: 'muted' },
});

function KatalogOdmen({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
  const stavy = stavZadosti(t);
  const smi = useSmi();
  const { ok, ceka } = useBrana([]);
  const { ja, nacitam } = useJa();
  const katalog = useDataWidgetu(ok ? URL_KATALOG : null, vyberKatalog);
  const odmeny = useDataWidgetu(ok ? URL_ODMENY : null, vyberOdmeny);
  const klic = klicCasti('odmeny.katalog', 'akce:spravovat_katalog');
  const spravuje = !!klic && smi(klic);
  const moje = odmeny.data?.ja ?? null;
  const { volne, odmeny: nabizene, moje: zadosti } = katalog.data
    ? nabidka(katalog.data, moje?.body ?? 0, ja)
    : { volne: 0, odmeny: [] as NabidkaOdmeny[], moje: [] as Zadost[] };
  const videt = velikost === 'M' ? nabizene.slice(0, 3) : nabizene;
  const [vymena, setVymena] = useState<NabidkaOdmeny | null>(null);
  const [odesilam, setOdesilam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [pridat, setPridat] = useState(false);
  const [zprava, setZprava] = useState<Zprava>(null);

  const vymenit = async () => {
    if (!vymena || odesilam || nahled) return;
    setOdesilam(true);
    setChyba(null);
    try {
      await fetch(URL_KATALOG, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rewardId: vymena.id }) }).then(okJson);
      setVymena(null);
      setZprava({ text: t('Žádost odeslána — počká na schválení vedením.'), ton: 'ok' });
      obnovDataWidgetu(URL_KATALOG);
    } catch (e) {
      setChyba(apiMessage(e, t('Žádost se nepodařilo odeslat.')));
    } finally {
      setOdesilam(false);
    }
  };

  const tlacitkoPridat = spravuje && !nahled ? (
    <Button variant="secondary" size="sm" icon="plus" onClick={() => setPridat(true)}>{t('Přidat odměnu')}</Button>
  ) : null;

  return (
    <>
      <Widget nacteni={ceka || nacitam ? CEKA : [katalog, odmeny]}
        prazdno={katalog.data && nabizene.length === 0 ? (
          <EmptyState compact icon="gift" title={t('Katalog je zatím prázdný')}
            hint={spravuje ? t('Přidej první odměnu, ať mají body smysl.') : t('Vedení zatím žádné odměny nenabízí.')}
            action={tlacitkoPridat ?? undefined} />
        ) : undefined}>
        {moje && <p className="t-meta">{sTucnym(t, volne !== moje.body ? 'Máš k dispozici {tucne} (zbytek drží čekající žádosti).' : 'Máš k dispozici {tucne}.', bodu(t, volne), 'font-semibold text-[#16181A] tabular-nums')}</p>}
        <ul className={`list ${moje ? 'mt-1' : ''}`}>
          {videt.map(o => (
            <ListRow key={o.id} lead={<IkonaOdmeny ikona={o.ikona} />} title={o.nazev}
              meta={o.ceka ? t('{cena} · čeká na schválení', { cena: `${cislo(o.cena)} ${bodTvar(t, o.cena)}` })
                : moje && !o.dosahnu ? t('{cena} · chybí {chybi}', { cena: `${cislo(o.cena)} ${bodTvar(t, o.cena)}`, chybi: cislo(o.chybi) })
                : `${cislo(o.cena)} ${bodTvar(t, o.cena)}`}
              right={o.ceka ? <Chip tone="wait" size="sm">{t('Čeká')}</Chip> : undefined}
              actions={!o.ceka && moje ? (
                <Button variant="primary" size="sm" disabled={!o.dosahnu || nahled} aria-label={t('Vyměnit body za {nazev}', { nazev: o.nazev })}
                  onClick={() => { setChyba(null); setVymena(o); }}>
                  {t('Vyměnit')}
                </Button>
              ) : undefined} />
          ))}
        </ul>
        {nabizene.length > videt.length && <p className="t-meta mt-2">{aDalsich(t, nabizene.length - videt.length)}</p>}
        {velikost === 'L' && zadosti.length > 0 && (
          <div className="mt-4">
            <p className="t-label">{t('Moje žádosti')}</p>
            <ul className="list mt-1">
              {zadosti.slice(0, 3).map(z => (
                <ListRow key={z.id} title={z.nazev} meta={`${cislo(z.cena)} ${bodTvar(t, z.cena)}`}
                  right={<Chip tone={stavy[z.stav].ton} size="sm">{stavy[z.stav].text}</Chip>} />
              ))}
            </ul>
          </div>
        )}
        {tlacitkoPridat && <div className="mt-3">{tlacitkoPridat}</div>}
      </Widget>
      {vymena && !nahled && (
        <NadPlochou>
          <Modal open onClose={() => setVymena(null)} size="sm" title={t('Vyměnit {body}?', { body: bodu(t, vymena.cena) })} subtitle={vymena.nazev}
            footer={<>
              <Button variant="secondary" onClick={() => setVymena(null)}>{t('Zrušit', undefined, 'dialog')}</Button>
              <Button variant="primary" onClick={vymenit} loading={odesilam}>{t('Vyměnit')}</Button>
            </>}>
            <p className="text-sm text-black/70 text-pretty">{t('Žádost schválí vedení a body se pak odečtou. Do té doby je držíme stranou.')}</p>
            {chyba && <p className="note note-danger mt-3" role="alert">{chyba}</p>}
          </Modal>
        </NadPlochou>
      )}
      {pridat && !nahled && (
        <NovaOdmena onZavrit={() => setPridat(false)}
          onHotovo={() => { setPridat(false); setZprava({ text: t('Odměna přidána do katalogu.'), ton: 'ok' }); obnovDataWidgetu(URL_KATALOG); }} />
      )}
      {zprava && <NadPlochou><Toast message={zprava.text} tone={zprava.ton} onClose={() => setZprava(null)} /></NadPlochou>}
    </>
  );
}

// ---------------------------------------------------------------------------
// Žádosti o odměny (fronta ke schválení)
// ---------------------------------------------------------------------------

/** Vyřídí žádost; odpověď serveru se čte (okJson vyhodí jeho hlášku), volající ji ukáže. */
async function vyrid(id: number, akce: 'approve' | 'decline'): Promise<void> {
  const res = await fetch(URL_KATALOG, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: akce }) });
  await okJson(res);
}

function ZadostiOOdmeny({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
  const { ok, ceka } = useBranaWidgetu('odmeny.zadosti', ['odmeny.schvalovat']);
  const data = useDataWidgetu(ok ? URL_KATALOG : null, vyberKatalog);
  const fronta = data.data ? cekajiciZadosti(data.data) : [];
  const vyber = useSelection<number>();
  // Fronta se nesmí useknout: dřív stránka ukazovala všechny žádosti a „Vybrat vše" bralo
  // celou frontu. Velký widget kreslí všechno, střední pět a zbytek rozbalí na klepnutí;
  // při hromadném výběru je vidět celá fronta, ať člověk vidí, co schvaluje.
  const [rozbaleno, setRozbaleno] = useState(false);
  const vseVidet = velikost === 'L' || rozbaleno || vyber.selecting;
  const videt = vseVidet ? fronta : fronta.slice(0, 5);
  const [pracuji, setPracuji] = useState<number | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);

  const hotovo = () => { obnovDataWidgetu(URL_KATALOG); obnovDataWidgetu(URL_ODMENY); };
  // Po jednom: zámek jen na ten řádek — schválení odečítá body a dvojklik by
  // poslal dva požadavky (server je sice odmítne, ale člověk by viděl chybu).
  const jedna = async (z: Zadost, akce: 'approve' | 'decline') => {
    if (nahled || pracuji != null) return;
    setPracuji(z.id);
    setChyba(null);
    try { await vyrid(z.id, akce); hotovo(); }
    catch (e) { setChyba(apiMessage(e, t('Žádost se nepodařilo vyřídit.'))); }
    finally { setPracuji(null); }
  };
  const hromadne = async (akce: 'approve' | 'decline') => {
    const ids = Array.from(vyber.selected);
    if (!ids.length) return;
    setChyba(null);
    const { failed } = await runBulk(ids, id => vyrid(id, akce));
    hotovo();
    if (failed.length) {
      setChyba(failed.length === ids.length ? t('Nepodařilo se to uložit. Zkus to znovu.') : t('{failed} z {total} se neuložilo — zkus to znovu.', { failed: failed.length, total: ids.length }));
      return;
    }
    vyber.exit();
  };

  if (velikost === 'S') {
    const nejstarsi = fronta[0];
    return (
      <Widget nacteni={ceka ? CEKA : data} kostra="cislo">
        <Stat label={t('Čeká')} value={cislo(fronta.length)} note={nejstarsi ? `${nejstarsi.jmeno ?? t('Někdo')} · ${nejstarsi.nazev}` : t('Nic nečeká')} />
      </Widget>
    );
  }
  return (
    <>
      <Widget nacteni={ceka ? CEKA : data}
        doplnek={fronta.length > 0 ? <Chip tone="wait" size="sm">{cislo(fronta.length)}</Chip> : undefined}
        prazdno={data.data && fronta.length === 0 ? <p className="t-meta">{t('Žádná žádost nečeká.')}</p> : undefined}>
        <ul className="list">
          {videt.map(z => (
            <ListRow key={z.id}
              lead={vyber.selecting
                ? <SelectBox checked={vyber.has(z.id)} onChange={() => vyber.toggle(z.id)} label={t('Vybrat žádost — {jmeno}, {nazev}', { jmeno: z.jmeno ?? '', nazev: z.nazev })} />
                : <Avatar emoji={z.avatar} size="sm" />}
              title={z.jmeno ?? t('Člen týmu')} meta={`${z.nazev} · ${cislo(z.cena)} ${bodTvar(t, z.cena)}`}
              actions={vyber.selecting ? undefined : (
                <>
                  <Button variant="primary" size="sm" loading={pracuji === z.id} disabled={pracuji != null && pracuji !== z.id}
                    aria-label={t('Schválit: {jmeno}, {nazev}', { jmeno: z.jmeno ?? '', nazev: z.nazev })} onClick={() => jedna(z, 'approve')}>{t('Schválit')}</Button>
                  <Button variant="danger" size="sm" disabled={pracuji != null}
                    aria-label={t('Zamítnout: {jmeno}, {nazev}', { jmeno: z.jmeno ?? '', nazev: z.nazev })} onClick={() => jedna(z, 'decline')}>{t('Zamítnout')}</Button>
                </>
              )} />
          ))}
        </ul>
        {fronta.length > videt.length && (
          <div className="mt-2">
            <Button variant="ghost" size="sm" iconAfter="chevron" onClick={() => setRozbaleno(true)}>
              {t('Ukázat všech {pocet}', { pocet: cislo(fronta.length) })}
            </Button>
          </div>
        )}
        {chyba && <p className="note note-danger mt-3" role="alert">{chyba}</p>}
        {/* „Vybrat víc" se ukáže, až je co vybírat (DP §3.19). */}
        {fronta.length > 1 && !vyber.selecting && (
          <div className="mt-3 flex justify-end">
            <Button variant="secondary" size="sm" icon="check" disabled={pracuji != null} onClick={() => { if (!nahled) vyber.start(); }}>{t('Vybrat víc')}</Button>
          </div>
        )}
      </Widget>
      {vyber.selecting && !nahled && (
        <NadPlochou>
          <BulkBar count={vyber.count} totalLabel={t('Vybrat vše ({pocet})', { pocet: cislo(fronta.length) })}
            onSelectAll={() => vyber.selectAll(fronta.map(z => z.id))}
            onExit={() => { vyber.exit(); setChyba(null); }}
            note={chyba ?? undefined}
            actions={[
              { label: t('Schválit'), primary: true, onClick: () => { void hromadne('approve'); } },
              { label: t('Zamítnout'), danger: true, onClick: () => { void hromadne('decline'); } },
            ]} />
        </NadPlochou>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Žebříček
// ---------------------------------------------------------------------------

function Zebricek({ velikost, nastaveni }: WidgetProps<{ pocet?: string }>) {
  const t = useT('widgety');
  const { ok, ceka } = useBranaWidgetu('odmeny.zebricek', ['odmeny.zebricek']);
  const data = useDataWidgetu(ok ? URL_ODMENY : null, vyberPoradi);
  const poradi = data.data ?? [];
  const odkaz = useOdkazOdmeny();
  const strop = velikost === 'S' ? 3 : velikost === 'M' ? Math.max(1, Number(nastaveni.pocet) || 5) : poradi.length;
  const videt = poradi.slice(0, strop);
  return (
    <Widget nacteni={ceka ? CEKA : data} odkaz={velikost === 'S' ? undefined : odkaz}
      prazdno={data.data && poradi.length === 0 ? <p className="t-meta">{t('V týmu zatím nikdo není.')}</p> : undefined}>
      <ul className="list">
        {videt.map((s, i) => (
          <ListRow key={s.id}
            lead={velikost === 'S' ? <span className="t-label w-5 text-right tabular-nums">{i + 1}.</span> : (
              <span className="flex items-center gap-2">
                <span className="t-label w-5 text-right tabular-nums">{i + 1}.</span>
                <Avatar emoji={s.avatar} size="sm" />
              </span>
            )}
            title={s.jmeno}
            meta={velikost === 'L' ? (
              <>
                <span className="block truncate">{s.uroven}{s.dalsi ? ` · ${t('do {dalsi} zbývá {zbyva}', { dalsi: s.dalsi, zbyva: cislo(s.zbyva) })}` : ''}</span>
                {s.dalsi && <span className="mt-1.5 block max-w-xs"><Pokrok procento={s.procento} popis={t('{jmeno}: pokrok do úrovně {dalsi}', { jmeno: s.jmeno, dalsi: s.dalsi })} /></span>}
              </>
            ) : velikost === 'S' ? undefined : s.uroven}
            value={cislo(s.body)} valueMeta={velikost === 'S' ? undefined : bodTvar(t, s.body)} />
        ))}
      </ul>
      {poradi.length > videt.length && velikost !== 'S' && <p className="t-meta mt-2">{aDalsich(t, poradi.length - videt.length)}</p>}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Výtky v týmu
// ---------------------------------------------------------------------------

function VytkyVTymu({ velikost }: WidgetProps) {
  const t = useT('widgety');
  const { ok, ceka } = useBranaWidgetu('odmeny.vytky_tymu', ['odmeny.zebricek', 'hodnoceni.zobrazit']);
  const data = useDataWidgetu(ok ? URL_ODMENY : null, vyberPoradi);
  const v = vytkyTymu(data.data ?? []);
  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : data} kostra="cislo">
        <Stat label={t('Výtky')} value={cislo(v.celkem)}
          note={v.celkem === 0 ? t('Žádné výtky') : v.nepotvrzenych > 0 ? t('{pocet} ještě nepotvrzeno', { pocet: cislo(v.nepotvrzenych) }) : t('Všechny potvrzené')} />
      </Widget>
    );
  }
  const videt = v.lide.slice(0, 5);
  return (
    <Widget nacteni={ceka ? CEKA : data}
      prazdno={data.data && v.lide.length === 0 ? <p className="t-meta">{t('V týmu nejsou žádné výtky.')}</p> : undefined}>
      <ul className="list">
        {videt.map(s => (
          <ListRow key={s.id} lead={<Avatar emoji={s.avatar} size="sm" />} title={s.jmeno}
            meta={s.nepotvrzenych > 0 ? t('Nepotvrzené: {pocet}', { pocet: cislo(s.nepotvrzenych) }) : t('Všechny potvrdil/a')}
            right={(
              <>
                {s.nepotvrzenych > 0 && <Chip tone="wait" size="sm">{t('Nepřečteno')}</Chip>}
                <Chip tone="bad" size="sm" icon="warning">{t('{n, plural, one {# výtka} few {# výtky} other {# výtek}}', { n: s.vytek })}</Chip>
              </>
            )} />
        ))}
      </ul>
      {v.lide.length > videt.length && <p className="t-meta mt-2">{aDalsich(t, v.lide.length - videt.length)}</p>}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Nehodnocené směny
// ---------------------------------------------------------------------------

/**
 * Otevře kalendář hodnocení na dni — na stránce Odměny hned událostí, jinak přes
 * sessionStorage po přechodu na pohled (stejně jako widgety uzávěrek). Nástroj
 * si událost „vezme" (`detail.prijato`), takže se na stejné stránce nikam nenaviguje.
 */
function otevriKalendar(nav: Navigace, den: string): void {
  const detail = { hodnota: den, prijato: false };
  window.dispatchEvent(new CustomEvent(UDALOST_KALENDAR, { detail }));
  if (detail.prijato || !nav.smiPohled('rewards')) return;
  try { sessionStorage.setItem(KLIC_KALENDAR, den); } catch { /* soukromé okno: kalendář se otevře na dnešku */ }
  nav.onNavigate('rewards');
}

const denKratce = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' });

function NehodnoceneSmeny({ velikost, nastaveni, nahled }: WidgetProps<{ mesic?: 'tento' | 'minuly' }>) {
  const t = useT('widgety');
  const nav = useNavigace();
  const { ok, ceka } = useBranaWidgetu('hodnoceni.nehodnocene', ['hodnoceni.zobrazit']);
  const dnes = pragueToday();
  const mesic = nastaveni.mesic === 'minuly' ? minulyMesic(dnes.slice(0, 7)) : dnes.slice(0, 7);
  const data = useDataWidgetu(ok ? `/api/shift-reviews?month=${mesic}` : null, raw => nehodnocene(raw, dnes));
  const n = data.data ?? { celkem: 0, nejstarsi: null, dny: [] };
  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : data} kostra="cislo"
        otevrit={!nahled && n.nejstarsi ? () => otevriKalendar(nav, n.nejstarsi!) : undefined}>
        <Stat label={t('Čeká na hodnocení')} value={cislo(n.celkem)} note={n.nejstarsi ? t('nejstarší {den}', { den: denKratce(n.nejstarsi) }) : t('Vše ohodnoceno')} />
      </Widget>
    );
  }
  const videt = n.dny.slice(0, 5);
  return (
    <Widget nacteni={ceka ? CEKA : data}
      doplnek={n.celkem > 0 ? <Chip tone="wait" size="sm">{cislo(n.celkem)}</Chip> : undefined}
      prazdno={data.data && n.dny.length === 0 ? <p className="t-meta">{nastaveni.mesic === 'minuly' ? t('Všechny směny minulého měsíce jsou ohodnocené.') : t('Všechny směny tohoto měsíce jsou ohodnocené.')}</p> : undefined}>
      <ul className="list">
        {videt.map(d => (
          <li key={d.den}>
            <ListRow as="div" title={denVetou(d.den)} meta={t('Na směně: {pocet}', { pocet: cislo(d.lidi) })}
              right={<Chip tone="wait" size="sm">{t('{n, plural, one {# nehodnocená směna} few {# nehodnocené směny} other {# nehodnocených směn}}', { n: d.ceka })}</Chip>}
              onClick={nahled ? undefined : () => otevriKalendar(nav, d.den)} />
          </li>
        ))}
      </ul>
      {n.dny.length > videt.length && <p className="t-meta mt-2">{aDalsich(t, n.dny.length - videt.length)}</p>}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'hodnoceni.ohodnotit_smeny': OhodnotitSmeny,
  'hodnoceni.nehodnocene': NehodnoceneSmeny,
  'odmeny.zebricek': Zebricek,
  'odmeny.zadosti': ZadostiOOdmeny,
  'odmeny.vytky_tymu': VytkyVTymu,
  'odmeny.katalog': KatalogOdmen,
  'odmeny.urovne': Urovne,
  'moje.uroven': MojeUrovenWidget,
  'moje.zpetna_vazba': ZpetnaVazba,
  'moje.hodnoceni_smen': HodnoceniSmen,
  'moje.odkud_body': OdkudBody,
  'moje.tento_mesic': TentoMesic,
};
