'use client';

// Widgety oblasti „Odměny a hodnocení" — komponenty (kolo 68, spec §2.5, §2.6 a §6.1).
//
// Vlastník v kole 69: balík B7 (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/odmeny.ts,
// tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
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
// Data jen přes useDataWidgetu (sdílená mezipaměť — /api/rewards čtou oba
// osobní widgety jedním dotazem), dotaz až při `nacteno && ma(klíč)` (spec §1.5).
// V náhledu (galerie) se nic nezapisuje ani neotevírá.

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { czForm, type CzNoun } from '@/lib/czech';
import { parseDbTime, pragueDayOf, pragueToday } from '@/lib/pragueTime';
import { Icon } from '../../Icons';
import { Avatar, Button, Chip, ListRow, Segmented, Stat, StatRow } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { Widget, useWidget, type StavNacteni } from '../Widget';
import { obnovDataWidgetu, useDataWidgetu } from '../useDataWidgetu';
import { useSmi } from '../NavigaceKontext';

// Okno hodnocení je velké (detail směny, úkoly, uzávěrka) a potřebuje ho jen
// ten, kdo zrovna hodnotí — do části aplikace s widgety se nestahuje předem.
const ShiftReviewModal = lazy(() => import('../../employer/ShiftReviewModal'));

// ---------------------------------------------------------------------------
// Společné drobnosti
// ---------------------------------------------------------------------------

type Klic = string | readonly string[];

const seznam = (x: unknown): any[] => (Array.isArray(x) ? x : []);
const cislo = (n: number) => n.toLocaleString('cs-CZ');
const aDalsich = (n: number) => `…a ${czForm(n, { one: 'další', few: 'další', many: 'dalších' })} ${cislo(n)}`;
const BOD: CzNoun = { one: 'bod', few: 'body', many: 'bodů' };
const sZnamenkem = (n: number) => `${n > 0 ? '+' : ''}${cislo(n)}`;

/** Klíč části widgetu z katalogu (`opravneni.pole`) — jeden zdroj pravdy s galerií a serverem. */
function klicCasti(idWidgetu: string, cast: string): Klic | null {
  return widget(idWidgetu)?.opravneni.pole?.[cast] ?? null;
}

/**
 * Brána widgetu (spec §1.5): přísně `nacteno && ma()` — `ma()` před načtením
 * oprávnění vrací ANO a dotaz by odešel dřív, než víme, jestli na data divák
 * má. Když /api/teams/mine selže, rozhodl už server seznamem v rozložení.
 */
function useBrana(klic: Klic): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  return { ok: nacteno ? ma(klic) : chyba, ceka: !nacteno && !chyba };
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

const metaSmeny = (r: Soupiska) => {
  const cas = r.od && r.do ? `${r.od}–${r.do}` : '';
  return [r.smena, cas].filter(Boolean).join(' · ') || 'Bez naplánované směny';
};

function OhodnotitSmeny({ velikost }: WidgetProps) {
  const smi = useSmi();
  const { nahled } = useWidget();
  const { ok, ceka } = useBrana(widget(ID_HODNOTIT)?.opravneni.vse ?? ['hodnoceni.zobrazit']);
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

  return (
    <>
      <Widget nacteni={ceka ? CEKA : [sVcera, sDnes]} odkaz={{ popisek: 'Kalendář', pohled: 'rewards' }}>
        <Segmented size="sm" ariaLabel="Den" value={vybrany} onChange={setDen}
          options={[{ id: 'vcera', label: 'Včera', count: cekaVcera }, { id: 'dnes', label: 'Dnes', count: cekaDnes }]} />
        <div className="mt-3 space-y-3">
          {radky.length === 0 ? (
            <p className="t-meta">{vybrany === 'dnes' ? 'Dnes zatím nikdo nepracoval.' : 'Včera nikdo nepracoval.'}</p>
          ) : (
            <>
              {radky.every(r => r.hodnoceno) && (
                <p className="note note-ok flex items-center gap-2"><Icon name="check" size={15} className="shrink-0" />Vše ohodnoceno</p>
              )}
              <ul className="list">
                {videt.map(r => (
                  <ListRow key={r.id} lead={<Avatar emoji={r.avatar} size="sm" />} title={r.jmeno} meta={metaSmeny(r)}
                    right={!r.hodnoceno ? <Chip tone="wait" size="sm">Čeká</Chip>
                      : r.vytka ? <Chip tone="bad" size="sm" icon="warning">Výtka</Chip>
                      : <Chip tone="ok" size="sm" icon="star">{r.hvezdy > 0 ? `${r.hvezdy}/5` : 'Hodnoceno'}</Chip>}
                    actions={hodnoti ? (
                      // Jméno v přístupném názvu: „Upravit" je i tlačítko hlavičky stránky a odečítač
                      // by jinak přečetl pět stejných tlačítek za sebou.
                      <Button variant={r.hodnoceno ? 'ghost' : 'primary'} size="sm" onClick={() => setHodnotim({ r, datum })}
                        aria-label={`${r.hodnoceno ? 'Upravit hodnocení' : 'Ohodnotit'}: ${r.jmeno}`}>
                        {r.hodnoceno ? 'Upravit' : 'Ohodnotit'}
                      </Button>
                    ) : undefined} />
                ))}
              </ul>
              {radky.length > videt.length && <p className="t-meta">{aDalsich(radky.length - videt.length)}</p>}
            </>
          )}
        </div>
      </Widget>
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
  const { nahled } = useWidget();
  const { ok, ceka } = useBrana([]);
  const data = useDataWidgetu(ok ? URL_ODMENY : null, vyberMojeOdmeny);
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
        setChyba(typeof d?.error === 'string' ? d.error : 'Potvrzení se neuložilo.');
        return;
      }
      obnovDataWidgetu(URL_ODMENY);
    } catch {
      setChyba('Potvrzení se neuložilo — zkontroluj připojení.');
    } finally {
      setPotvrzuji(false);
    }
  };

  const noveHodnoceni = neco && (
    <div className="space-y-3">
      <div>
        <p className="text-[15px] font-medium leading-snug text-[#16181A] text-balance">
          {vytka ? 'U tvé směny je něco k nápravě' : 'Vedení ohodnotilo tvou směnu'}
        </p>
        <p className="t-meta mt-0.5 text-pretty">
          {vytka ? 'Podívej se, co je potřeba probrat, a potvrď, že to víš.'
            : posledni ? `${denVetou(posledni.den)} — přečti si, co vedení napsalo.` : ''}
        </p>
      </div>
      {posledni && (posledni.hvezdy > 0 || posledni.body !== 0 || posledni.vytka) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {posledni.hvezdy > 0 && <Chip tone="ok" size="sm" icon="star">{posledni.hvezdy}/5</Chip>}
          {posledni.body !== 0 && (
            <Chip tone={posledni.body > 0 ? 'ok' : 'bad'} size="sm">{sZnamenkem(posledni.body)} {czForm(posledni.body, BOD)}</Chip>
          )}
          {posledni.vytka && <Chip tone="bad" size="sm" icon="warning">Výtka</Chip>}
        </div>
      )}
      {posledni?.poznamka && <p className="text-sm text-black/70 text-pretty line-clamp-3">„{posledni.poznamka}"</p>}
      {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
      <Button variant="primary" size="sm" loading={potvrzuji} onClick={beruNaVedomi}>Beru na vědomí</Button>
    </div>
  );

  if (velikost === 'M') {
    // Nic nového = nic k řešení: v klidu se střední widget nekreslí (jako dřív karta na Přehledu).
    return (
      <Widget nacteni={ceka ? CEKA : data} odkaz={{ popisek: 'Odměny', pohled: 'rewards' }} prazdno={neco ? undefined : null}>
        {noveHodnoceni}
      </Widget>
    );
  }
  // Velký: nové nahoře a pod ním historie hodnocení.
  return (
    <Widget nacteni={ceka ? CEKA : data} odkaz={{ popisek: 'Odměny', pohled: 'rewards' }}
      prazdno={vse.length === 0 ? <p className="t-meta">Zatím žádné hodnocení směn.</p> : undefined}>
      {noveHodnoceni}
      <div className={neco ? 'mt-5' : ''}>
        <p className="t-label">Poslední hodnocení</p>
        <ul className="list mt-1">
          {vse.slice(0, 5).map(r => (
            <ListRow key={`${r.den}-${r.celaSmena ? 's' : 'i'}`} title={denVetou(r.den)}
              meta={r.poznamka ?? (r.celaSmena ? 'Hodnocení celé směny' : 'Bez poznámky')}
              value={r.body !== 0 ? sZnamenkem(r.body) : undefined}
              valueMeta={r.body !== 0 ? czForm(r.body, BOD) : undefined}
              right={(
                <>
                  {!r.videno && <Chip tone="info" size="sm">Nové</Chip>}
                  {r.vytka ? <Chip tone="bad" size="sm" icon="warning">Výtka</Chip>
                    : r.hvezdy > 0 ? <Chip tone="ok" size="sm" icon="star">{r.hvezdy}/5</Chip> : null}
                </>
              )} />
          ))}
        </ul>
        {vse.length > 5 && <p className="t-meta mt-2">{aDalsich(vse.length - 5)}</p>}
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
        <Stat label="Odpracováno" value={hodiny == null ? '–' : desetinne(hodiny)} unit={hodiny == null ? undefined : 'h'} />
        <Stat label="Hodnocených směn" value={vlastni ? cislo(hodnocene.length) : '–'} />
        <Stat label="Průměr hodnocení" value={vlastni && prumer != null ? desetinne(prumer) : '–'}
          unit={vlastni && prumer != null ? '/ 5' : undefined} />
      </StatRow>
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'hodnoceni.ohodnotit_smeny': OhodnotitSmeny,
  'moje.zpetna_vazba': ZpetnaVazba,
  'moje.tento_mesic': TentoMesic,
};
