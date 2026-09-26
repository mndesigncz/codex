'use client';

// Widgety oblasti „Sklad a výroba" — komponenty (kolo 68, spec §2.5, §2.6 a §6.1).
//
// Vlastník v kole 69: balík B3 (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/sklad.ts;
// tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — test AK-20 v scripts/testy/k68-widgety.ts klíče čte z textu, proto bez spreadu.
//
// Co z dřívějšího Přehledu a Domů opravují (audit Přehledu vedení a Domů zaměstnance):
//  - Docházející zásoby (dřív „Nízké zásoby" u vedení a „Zásoby, které
//    docházejí" u zaměstnance — dvě kopie s jinými čísly):
//      · N7: Přehled počítal i archivované položky a neschválené návrhy,
//        Sklad je vynechává, takže čísla nesouhlasila. Teď stejný filtr jako
//        Sklad (`archived !== true && approved !== false`);
//      · seznam je jedna karta s linkami (`.list` + ListRow) místo jamky
//        na každou položku, množství je Chip bad/wait v pevném sloupci místo
//        ruční pilulky s tap-target na neklikacím prvku;
//      · odkaz „Sklad" je ghost s chevronem z obalu místo zeleného „Sklad →";
//        řádek vede rovnou do své kategorie;
//      · widget chce sklad.zobrazit (dřív zaměstnancům bez klíče jen tiše
//        spadl dotaz a blok zmizel).
//  - K výrobě (dřív ProductionBoard natvrdo mimo rozložení): bez modré
//    tónované karty (`card-info`), bez nadpisu jako t-label v #0A5CC0 a bez
//    „v úkolech →"; limetkový odkaz na návod je tlačítko secondary; okno
//    „Vyrobeno" je <Modal> s patičkou Zrušit / primary místo ručního překryvu
//    s limetkou a znaků −/+ bez popisku. Prázdný seznam se v klidu nekreslí,
//    stejně jako dřív. ProductionBoard sám upraví B3 v kole 69; tady se nemění,
//    widget bere jen jeho typ ToMake.
//
// Data jen přes useDataWidgetu (sdílená mezipaměť — Sklad, První kroky i náhled
// v galerii čtou tentýž /api/inventory), dotaz až při `nacteno && ma(klíč)`
// (spec §1.5). V náhledu (galerie) se nic nezapisuje ani nenaviguje.

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { apiMessage, okJson } from '@/lib/api';
import { POLOZKA, czCount, czForm, type CzNoun } from '@/lib/czech';
import { Icon } from '../../Icons';
import { Button, Chip, ListRow, Modal, Stat, Toast, Well } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import type { ToMake } from '../../inventory/ProductionBoard';
import { Widget, useWidget, type StavNacteni } from '../Widget';
import { obnovDataWidgetu, useDataWidgetu } from '../useDataWidgetu';
import { useNavigace } from '../NavigaceKontext';

// ---------------------------------------------------------------------------
// Společné drobnosti
// ---------------------------------------------------------------------------

type Klic = string | readonly string[];

const seznam = (x: unknown): any[] => (Array.isArray(x) ? x : []);
const cislo = (n: number) => n.toLocaleString('cs-CZ');
/** Množství skladu: až tři desetinná místa (0,125 kg), celé bez čárky. */
const mnozstvi = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 3 });
/** „…a další 2" / „…a dalších 5" — strop seznamu se nesmí zamlčet (DP §3.6). */
const aDalsich = (n: number) => `…a ${czForm(n, { one: 'další', few: 'další', many: 'dalších' })} ${cislo(n)}`;

const SUROVINA: CzNoun = { one: 'surovina', few: 'suroviny', many: 'surovin' };

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
 * Okno a toast z widgetu se kreslí do <body>, ne do karty. Buňka mřížky
 * dostává transformace (FLIP, promáčknutí při podržení) a pod transformovaným
 * předkem by `position: fixed` počítalo od karty, ne od okna prohlížeče.
 * `data-plocha-chrom` říká ploše, že klepnutí a podržení v okně nejsou gesta
 * nad widgetem — React události z portálu bublají stromem až do plochy.
 */
function NadPlochou({ children }: { children: React.ReactNode }) {
  const [cil, setCil] = useState<HTMLElement | null>(null);
  useEffect(() => { setCil(document.body); }, []);
  return cil ? createPortal(<div data-plocha-chrom="">{children}</div>, cil) : null;
}

// ---------------------------------------------------------------------------
// Docházející zásoby
// ---------------------------------------------------------------------------

const ID_DOCHAZI = 'sklad.dochazi';

interface Polozka {
  id: number;
  nazev: string;
  mnozstvi: number;
  jednotka: string;
  kriticke: boolean;
  dochazi: boolean;
  kategorieId: number | null;
  kategorie: string | null;
  vyroba: boolean;
}

interface Kategorie { id: number; nazev: string; rodic: number | null }

function vyberPolozky(raw: unknown): Polozka[] {
  return seznam(raw)
    // N7: stejně jako Sklad — archivované položky a neschválené návrhy
    // od týmu do zásob nepatří, jinak Přehled a Sklad hlásí jiná čísla.
    .filter(p => p && p.archived !== true && p.approved !== false)
    .map(p => {
      const q = Number(p.quantity) || 0;
      // Stav počítá server (balení, prahy kategorie). Náhradní výpočet jen
      // pro odpověď bez něj, ať widget nehlásí „v pořádku" z neznalosti.
      const stav: string = typeof p.status === 'string' ? p.status
        : q <= (Number(p.criticalQuantity) || 0) ? 'critical' : q <= (Number(p.minQuantity) || 0) ? 'low' : 'ok';
      return {
        id: Number(p.id),
        nazev: String(p.name ?? ''),
        mnozstvi: q,
        jednotka: String(p.unit ?? ''),
        kriticke: stav === 'critical',
        dochazi: stav !== 'ok',
        kategorieId: p.categoryId != null ? Number(p.categoryId) : null,
        kategorie: typeof p.category === 'string' && p.category ? p.category : null,
        vyroba: p.madeInHouse === true,
      };
    });
}

function vyberKategorie(raw: unknown): Kategorie[] {
  return seznam(raw).map(k => ({
    id: Number(k.id),
    nazev: String(k.name ?? ''),
    rodic: k.parentId != null ? Number(k.parentId) : null,
  }));
}

/** Kategorie a všechny její podkategorie — „Sirupy" zahrnuje i „Sirupy / Ovocné". */
function podstrom(kategorie: readonly Kategorie[], koren: number): Set<number> {
  const ids = new Set<number>([koren]);
  // Pár průchodů místo rekurze: hloubka stromu je malá a cyklus v datech
  // (rodič sám sobě) tu nemůže zacyklit vykreslení.
  for (let i = 0; i < 5; i++) {
    let pribylo = false;
    for (const k of kategorie) if (k.rodic != null && ids.has(k.rodic) && !ids.has(k.id)) { ids.add(k.id); pribylo = true; }
    if (!pribylo) break;
  }
  return ids;
}

type NastaveniDochazi = { kategorie: number | string | null; jen_kriticke: boolean; vyroba: boolean };

function Dochazi({ velikost, nastaveni, nahled }: WidgetProps<NastaveniDochazi>) {
  const nav = useNavigace();
  const { ok, ceka } = useBrana(widget(ID_DOCHAZI)?.opravneni.vse ?? ['sklad.zobrazit']);
  const katId = nastaveni.kategorie == null || nastaveni.kategorie === '' || !Number.isFinite(Number(nastaveni.kategorie))
    ? null : Number(nastaveni.kategorie);

  const sklad = useDataWidgetu<Polozka[]>(ok ? '/api/inventory' : null, vyberPolozky);
  // Kategorie jen s vybranou kategorií: kvůli podkategoriím a jménu do odkazu.
  // Stejná URL jako výběr v nastavení widgetu, takže dotaz se sdílí.
  const kategorie = useDataWidgetu<Kategorie[]>(ok && katId != null ? '/api/inventory/categories' : null, vyberKategorie);

  const vybrana = katId != null ? kategorie.data?.find(k => k.id === katId) ?? null : null;
  const ztracena = katId != null && kategorie.data != null && !vybrana;

  const polozky = useMemo(() => {
    const ids = katId != null && kategorie.data ? podstrom(kategorie.data, katId) : null;
    return (sklad.data ?? [])
      .filter(p => nastaveni.vyroba || !p.vyroba)
      .filter(p => !ids || (p.kategorieId != null && ids.has(p.kategorieId)))
      .filter(p => (nastaveni.jen_kriticke ? p.kriticke : p.dochazi))
      // Nejdřív kriticky málo, pak podle abecedy — nejhorší nahoře.
      .sort((a, b) => Number(b.kriticke) - Number(a.kriticke) || a.nazev.localeCompare(b.nazev, 'cs'));
  }, [sklad.data, kategorie.data, katId, nastaveni.vyroba, nastaveni.jen_kriticke]);

  const kritickych = polozky.filter(p => p.kriticke).length;
  const dochazi = polozky.length - kritickych;

  // Odkaz vede do vybrané kategorie (Sklad ji hledá podle jména), jinak na celý sklad.
  const smiSklad = nav.smiPohled('inventory');
  const doSkladu = (kat?: string | null) => { if (!nahled && smiSklad) nav.onNavigate('inventory', kat ?? undefined); };

  const prazdno = ztracena
    ? <p className="t-meta">Vybraná kategorie už ve skladu není. Vyber jinou v nastavení widgetu.</p>
    : sklad.data && sklad.data.length === 0
      ? <p className="t-meta">Ve skladu zatím nic není.</p>
      : sklad.data && polozky.length === 0
        ? <p className="t-meta">{nastaveni.jen_kriticke ? 'Nic není kriticky málo.' : vybrana ? `V kategorii ${vybrana.nazev} je všeho dost.` : 'Zásoby jsou v pořádku.'}</p>
        : undefined;

  if (velikost === 'S') {
    return (
      <Widget
        nacteni={ceka ? CEKA : [sklad, kategorie]}
        kostra="cislo"
        otevrit={smiSklad && !nahled ? () => doSkladu(vybrana?.nazev) : undefined}
        prazdno={prazdno}
      >
        {/* Malý widget = jedno číslo (DP §3.5). Kriticky málo má přednost,
            zbytek jde do poznámky; bez kritických ukáže, kolik dochází. */}
        {kritickych > 0
          ? <Stat label="Kriticky málo" value={cislo(kritickych)} note={dochazi > 0 ? `dochází dalších ${cislo(dochazi)}` : undefined} />
          : <Stat label="Dochází" value={cislo(dochazi)} note={czForm(dochazi, POLOZKA)} />}
      </Widget>
    );
  }

  const strop = velikost === 'M' ? 5 : 15;
  const ukazat = polozky.slice(0, strop);
  const radek = (p: Polozka, metaKategorie: boolean) => (
    <li key={p.id}>
      <ListRow
        as="div"
        title={p.nazev}
        meta={metaKategorie ? p.kategorie ?? undefined : undefined}
        right={<Chip tone={p.kriticke ? 'bad' : 'wait'} size="sm" className="tabular-nums">{mnozstvi(p.mnozstvi)} {p.jednotka}</Chip>}
        onClick={smiSklad && !nahled ? () => doSkladu(p.kategorie) : undefined}
      />
    </li>
  );

  // Velký widget seskupí položky podle kategorie (v pořadí, jak přišly po řazení).
  const skupiny: { nazev: string; polozky: Polozka[] }[] = [];
  if (velikost === 'L') {
    for (const p of ukazat) {
      const nazev = p.kategorie ?? 'Bez kategorie';
      const s = skupiny.find(x => x.nazev === nazev);
      if (s) s.polozky.push(p); else skupiny.push({ nazev, polozky: [p] });
    }
  }

  return (
    <Widget
      nacteni={ceka ? CEKA : [sklad, kategorie]}
      kostra="seznam"
      doplnek={polozky.length > 0 ? <Chip tone={kritickych > 0 ? 'bad' : 'wait'} size="sm">{cislo(polozky.length)}</Chip> : undefined}
      // Popisek odkazu je jméno cíle (DP §5.1): s vybranou kategorií její
      // jméno — dvě instance pro dvě kategorie se tak na ploše rozliší.
      odkaz={{ popisek: vybrana?.nazev ?? 'Sklad', pohled: 'inventory', arg: vybrana?.nazev }}
      prazdno={prazdno}
    >
      {velikost === 'L' ? (
        <div className="space-y-4">
          {skupiny.map(s => (
            <section key={s.nazev} aria-label={s.nazev}>
              <p className="t-label">{s.nazev}</p>
              <ul className="list mt-1">{s.polozky.map(p => radek(p, false))}</ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="list">{ukazat.map(p => radek(p, !vybrana))}</ul>
      )}
      {polozky.length > strop && <p className="t-meta mt-2">{aDalsich(polozky.length - strop)}</p>}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// K výrobě
// ---------------------------------------------------------------------------

const ID_VYROBA = 'vyroba.k_vyrobe';
/** Strop dávek v okně — stejný jako dřív v ProductionBoard (překlep 100 místo 10 by odepsal celý sklad). */
const MAX_DAVEK = 10;

const vyberVyrobu = (raw: any): ToMake[] => seznam(raw?.toMake);

function metaVyroby(e: ToMake): string {
  const casti = [`${cislo(e.batches)}× dávka`, `zbývá ${mnozstvi(e.item.available)} ${e.item.recipeUnit}`];
  if (e.lines.length > 0) casti.push(e.ready ? 'suroviny jsou' : `chybí ${czCount(e.missing.length, SUROVINA)}`);
  return casti.join(' · ');
}

function OknoVyrobeno({ polozka, onClose, onHotovo }: { polozka: ToMake; onClose: () => void; onHotovo: (zprava: string) => void }) {
  const [davek, setDavek] = useState(Math.max(1, Math.min(MAX_DAVEK, polozka.batches || 1)));
  const [pracuji, setPracuji] = useState(false);
  const [chyba, setChyba] = useState('');
  const { item } = polozka;
  const nestaci = polozka.lines.filter(l => l.amount * davek > l.available);

  const potvrdit = async () => {
    setPracuji(true); setChyba('');
    try {
      const d = await fetch(`/api/inventory/${item.id}/produce`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batches: davek, taskId: polozka.taskId }),
      }).then(okJson);
      const pridano = Number(d?.added);
      onHotovo(`${item.name}: ${Number.isFinite(pridano) ? `+${mnozstvi(pridano)} ${d?.unit ?? item.unit} ` : ''}naskladněno${seznam(d?.consumed).length ? ', suroviny odepsány' : ''}.`);
    } catch (e) {
      setChyba(apiMessage(e, 'Nepodařilo se zapsat.'));
      setPracuji(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="md" title={`Vyrobeno: ${item.name}`} subtitle="Naskladní se dávka a suroviny se odepíšou."
      footer={<>
        <Button variant="secondary" onClick={onClose}>Zrušit</Button>
        <Button variant="primary" onClick={potvrdit} loading={pracuji}>Vyrobeno, naskladnit</Button>
      </>}>
      <div className="space-y-4">
        <Well pad="md" className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="t-label">Dávek</p>
            <p className="t-meta mt-0.5">
              {polozka.batchYield
                ? `${mnozstvi(polozka.batchYield)} ${item.unit} na dávku, celkem +${mnozstvi(polozka.batchYield * davek)} ${item.unit}`
                : `+${cislo(davek)} ${item.unit}`}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="secondary" size="sm" iconOnly icon="minus" aria-label="Méně dávek"
              disabled={davek <= 1} onClick={() => setDavek(b => Math.max(1, b - 1))} />
            <span className="w-10 text-center text-[18px] font-semibold tabular-nums" aria-live="polite">{davek}</span>
            <Button variant="secondary" size="sm" iconOnly icon="plus" aria-label="Více dávek"
              disabled={davek >= MAX_DAVEK} onClick={() => setDavek(b => Math.min(MAX_DAVEK, b + 1))} />
          </div>
        </Well>

        {polozka.lines.length > 0 && (
          <ul className="list">
            {polozka.lines.map(l => {
              const odepise = l.amount * davek;
              const chybi = odepise > l.available;
              return (
                <ListRow key={l.ingredientId} title={l.name}
                  meta={`odepíše se ${mnozstvi(odepise)} ${l.unit} · ve skladu ${mnozstvi(l.available)} ${l.unit}`}
                  right={<Chip tone={chybi ? 'bad' : 'ok'} size="sm">{chybi ? 'nestačí' : 'je'}</Chip>} />
              );
            })}
          </ul>
        )}
        {nestaci.length > 0 && (
          <p className="note note-wait text-[13px]">Některé suroviny nestačí. Jestli se vyrobilo i tak, sklad se u nich jen vynuluje — přesné množství doplň u položky.</p>
        )}
        {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
      </div>
    </Modal>
  );
}

/** Rozbalený detail ve velkém widgetu: suroviny a postup (návod má přednost před textem). */
function DetailVyroby({ e, nahled }: { e: ToMake; nahled: boolean }) {
  const nav = useNavigace();
  const smiNavod = !!e.guideId && nav.smiPohled('guides');
  return (
    <Well className="mb-3 space-y-2">
      {e.lines.length > 0 && (
        <ul className="space-y-1">
          {e.lines.map(l => (
            <li key={l.ingredientId} className="flex items-center gap-2 text-[13px]">
              <Icon name={l.missing > 0 ? 'close' : 'check'} size={14} className={`shrink-0 ${l.missing > 0 ? 'text-bad-ink' : 'text-ok-ink'}`} />
              <span className="min-w-0 flex-1 truncate text-[#16181A]">{l.name} {mnozstvi(l.need)} {l.unit}</span>
              <span className="shrink-0 text-black/55 tabular-nums">ve skladu {mnozstvi(l.available)} {l.unit}</span>
              <span className="sr-only">{l.missing > 0 ? 'chybí' : 'je'}</span>
            </li>
          ))}
        </ul>
      )}
      {/* Návod má přednost před textem: je schválený, má kroky a dá se
          u něj potvrdit přečtení. */}
      {smiNavod ? (
        <Button variant="secondary" size="sm" icon="book"
          onClick={() => { if (!nahled) nav.onNavigate('guides', String(e.guideId)); }}>
          {e.guideTitle ? `Návod: ${e.guideTitle}` : 'Otevřít návod'}
        </Button>
      ) : e.steps ? (
        <p className="text-[13px] text-black/60 whitespace-pre-wrap">{e.steps}</p>
      ) : e.lines.length === 0 ? (
        <p className="t-meta">Bez receptury — vedení ji nastaví u položky ve skladu.</p>
      ) : null}
    </Well>
  );
}

function KVyrobe({ velikost, nahled }: WidgetProps) {
  const { upravy } = useWidget();
  const { ok, ceka } = useBrana(widget(ID_VYROBA)?.opravneni.vse ?? ['vyroba.vyrabet']);
  const data = useDataWidgetu<ToMake[]>(ok ? '/api/production' : null, vyberVyrobu);
  const [okno, setOkno] = useState<ToMake | null>(null);
  const [rozbaleno, setRozbaleno] = useState<number | null>(null);
  const [zprava, setZprava] = useState<string | null>(null);

  // Okno nesmí přežít vstup do úprav (karta je pak `inert`) ani náhled.
  useEffect(() => { if (upravy || nahled) setOkno(null); }, [upravy, nahled]);

  const seznamVyroby = data.data ?? [];
  const L = velikost === 'L';
  const strop = L ? 10 : 5;
  const ukazat = seznamVyroby.slice(0, strop);

  const hotovo = (text: string) => {
    setOkno(null);
    setZprava(text);
    data.reload();
    // Naskladnění změnilo sklad: Docházející zásoby a Sklad ať to vidí hned.
    obnovDataWidgetu('/api/inventory');
  };

  return (
    <>
      <Widget
        nacteni={ceka ? CEKA : data}
        kostra="seznam"
        doplnek={seznamVyroby.length > 0 ? <Chip tone="muted" size="sm">{cislo(seznamVyroby.length)}</Chip> : undefined}
        odkaz={{ popisek: 'Úkoly', pohled: 'tasks' }}
        // Není co vyrábět = dobrá zpráva a dřív se karta nekreslila vůbec;
        // v klidu tak zůstane, v úpravách ukáže „Teď tu nic není."
        prazdno={data.data && seznamVyroby.length === 0 ? null : undefined}
      >
        <ul className="list">
          {ukazat.map(e => {
            const otevreno = L && rozbaleno === e.taskId;
            const vyrobeno = (
              <Button variant="secondary" size="sm" onClick={() => { if (!nahled) setOkno(e); }}>Vyrobeno</Button>
            );
            return (
              <li key={e.taskId}>
                <ListRow
                  as="div"
                  title={e.title}
                  meta={metaVyroby(e)}
                  right={L ? <Chip tone={e.ready ? 'ok' : 'wait'} size="sm">{e.ready ? 'lze vyrobit' : 'do nákupu'}</Chip> : undefined}
                  actions={L ? (
                    <>
                      <Button variant="ghost" size="sm" iconOnly icon="chevron"
                        aria-label={otevreno ? `Skrýt postup: ${e.title}` : `Ukázat postup: ${e.title}`}
                        aria-expanded={otevreno}
                        className={otevreno ? '[&_svg]:rotate-180' : ''}
                        onClick={() => setRozbaleno(otevreno ? null : e.taskId)} />
                      {vyrobeno}
                    </>
                  ) : vyrobeno}
                />
                {otevreno && <DetailVyroby e={e} nahled={nahled} />}
              </li>
            );
          })}
        </ul>
        {seznamVyroby.length > strop && <p className="t-meta mt-2">{aDalsich(seznamVyroby.length - strop)}</p>}
      </Widget>
      {okno && (
        <NadPlochou>
          <OknoVyrobeno polozka={okno} onClose={() => setOkno(null)} onHotovo={hotovo} />
        </NadPlochou>
      )}
      {zprava && (
        <NadPlochou>
          <Toast message={zprava} onClose={() => setZprava(null)} />
        </NadPlochou>
      )}
    </>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'sklad.dochazi': Dochazi,
  'vyroba.k_vyrobe': KVyrobe,
};
