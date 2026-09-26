'use client';

// Widgety oblasti „Sklad a výroba" — komponenty (kolo 68 a 69, spec §2.5, §2.6 a §6.3).
//
// Vlastník: balík B3 (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/sklad.ts,
// výpočty (co dochází, co koupit, hodnota zásob, chybějící údaje) v lib/skladPrehled.ts;
// tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — test AK-20 v scripts/testy/k68-widgety.ts klíče čte z textu, proto bez spreadu.
//
// Kolo 69: bloky, které stránka Sklad kreslila natvrdo nad seznamem (návrhy od týmu,
// chybějící údaje, souhrn „kriticky/dochází", K výrobě, objednávky) a okna schovaná
// v menu (hlášení, inventura) jsou widgety. Dřív byly až čtyři tónované karty nad sebou
// (DP §6.3), řádky návrhů jako boxy v tónované kartě (karta v kartě) a každé potvrzení
// přes confirm(). Teď bílé karty s `.list`, schválení v řádku `primary`, zamítnutí
// přes <Modal> s `danger-solid` a potvrzení Toastem.
//
// Oprávnění (spec §1.5, katalog): widget se kreslí a ptá serveru, až když
// `nacteno && vse (všechny) && nektere (aspoň jedno)`; tlačítka a pole podle
// `opravneni.pole` přes useSmi. Dotazy jen přes useDataWidgetu (sdílená mezipaměť —
// Sklad, nástroj i náhledy čtou tentýž /api/inventory jednou). V náhledu (galerie)
// se nic nezapisuje, nenaviguje ani neotevírá.

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DefiniceWidgetu, KomponentaWidgetu, Navigace, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { apiMessage, okJson } from '@/lib/api';
import { POLOZKA, czCount, czForm, type CzNoun } from '@/lib/czech';
import { pragueToday } from '@/lib/pragueTime';
import {
  KLIC_NAKUP, KLIC_UPRAVIT, UDALOST_NAKUP, UDALOST_UPRAVIT,
  chybiUdaje, cekajiciObjednavky, historieObjednavek, hodnotaZasob, utrataZaMesic, jeAktivni, nakupniSeznam, podstrom, poDodavatelich,
  souhrnKategorie, stavInventury, stavZasoby, vyberHlaseni, vyberKategorie, vyberPohyby,
  type DruhPohybu, type HodnotaZasob, type Hlaseni, type KategorieSkladu, type Objednavka, type PolozkaSkladu, type Pohyb,
} from '@/lib/skladPrehled';
import { Icon } from '../../Icons';
import { Avatar, BulkBar, Button, Chip, Field, Input, ListRow, Modal, SearchField, SelectBox, Stat, Textarea, Toast, Well, useSelection } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { useMoney } from '../../CurrencyProvider';
import type { ToMake } from '../../inventory/ProductionBoard';
import NewStockEntry from '../../inventory/NewStockEntry';
import StocktakeModal from '../../inventory/Stocktake';
import { Widget, useWidget, type StavNacteni } from '../Widget';
import { obnovDataWidgetu, useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';

// ---------------------------------------------------------------------------
// Společné drobnosti
// ---------------------------------------------------------------------------

const URL_SKLAD = '/api/inventory';
const URL_KATEGORIE = '/api/inventory/categories';

const seznam = (x: unknown): any[] => (Array.isArray(x) ? x : []);
const cislo = (n: number) => n.toLocaleString('cs-CZ');
/** Množství skladu: až tři desetinná místa (0,125 kg), celé bez čárky. */
const mnozstvi = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 3 });
/** „…a další 2" / „…a dalších 5" — strop seznamu se nesmí zamlčet (DP §3.6). */
const aDalsich = (n: number) => `…a ${czForm(n, { one: 'další', few: 'další', many: 'dalších' })} ${cislo(n)}`;

const SUROVINA: CzNoun = { one: 'surovina', few: 'suroviny', many: 'surovin' };
const HLASENI: CzNoun = { one: 'hlášení', few: 'hlášení', many: 'hlášení' };
const OBJEDNAVKA: CzNoun = { one: 'objednávka', few: 'objednávky', many: 'objednávek' };
const NAVRH: CzNoun = { one: 'návrh', few: 'návrhy', many: 'návrhů' };

/** Položky skladu z odpovědi /api/inventory (surově, filtruje se až v komponentě podle nastavení). */
const vyberSklad = (raw: unknown): PolozkaSkladu[] => seznam(raw) as PolozkaSkladu[];

/** „před 5 min", „před 2 h", „před 3 dny" — pro řádky, kde přesný čas nic neřekne. */
function pred(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'právě teď';
  if (min < 60) return `před ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `před ${h} h`;
  const dny = Math.round(h / 24);
  return `před ${czCount(dny, { one: 'dnem', few: 'dny', many: 'dny' })}`;
}

const datumKratce = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '');

/**
 * Brána widgetu (spec §1.5): přísně `nacteno && všechny z vse && aspoň jedno
 * z nektere`. Samotné `ma()` před načtením oprávnění vrací ANO a dotaz by
 * odešel dřív, než víme, jestli na data divák má; `ma(pole)` navíc znamená
 * „stačí kterékoli", takže widget se dvěma povinnými klíči (Suroviny bez
 * ceny: receptury + ceny, N4) by prošel i s jedním. Když /api/teams/mine
 * selže, rozhodl už server — widget je na ploše jen tehdy, když ho vrátil.
 */
function useBrana(id: string): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  const o = widget(id)?.opravneni ?? { vse: ['sklad.zobrazit'], nektere: [] };
  if (!nacteno) return { ok: chyba, ceka: !chyba };
  const ok = o.vse.every(k => ma(k)) && (o.nektere.length === 0 || o.nektere.some(k => ma(k)));
  return { ok, ceka: false };
}

/** Klíč tlačítka nebo pole z katalogu (`opravneni.pole`). */
const pole = (def: DefiniceWidgetu | undefined, klic: string): string | string[] | undefined => def?.opravneni.pole?.[klic];

/**
 * Klikací řádek bez čísla a akcí (jen titulek, meta a šipka). ListRow kreslí
 * ocas `.list-tail` vždy, i prázdný, a na telefonu mu globals.css dává
 * `flex: 1 1 100%` — prázdný ocas tak odlomí šipku na samostatný řádek pod
 * položku. Prázdný ocas proto skryjeme; plný (s číslem nebo akcí) zůstává.
 * Patří to opravit v ListRow (zamčený soubor, balík B0) — pak tahle třída odpadne.
 */
const BEZ_PRAZDNEHO_OCASU = '[&>.list-tail:empty]:hidden';

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

/** Potvrzení nevratné akce (zamítnout návrh, zrušit objednávku) — místo confirm() (DP §3.10). */
function Potvrzeni({ titulek, text, akce, onPotvrdit, onZavrit }: {
  titulek: string; text: string; akce: string; onPotvrdit: () => Promise<void>; onZavrit: () => void;
}) {
  const [pracuji, setPracuji] = useState(false);
  const [chyba, setChyba] = useState('');
  return (
    <NadPlochou>
      <Modal open onClose={onZavrit} size="sm" title={titulek}
        footer={<>
          <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
          <Button variant="danger-solid" loading={pracuji} onClick={async () => {
            setPracuji(true); setChyba('');
            try { await onPotvrdit(); onZavrit(); }
            catch (e) { setChyba(apiMessage(e, 'Nepodařilo se to uložit.')); setPracuji(false); }
          }}>{akce}</Button>
        </>}>
        <p className="t-meta">{text}</p>
        {chyba && <p className="note note-danger mt-3" role="alert">{chyba}</p>}
      </Modal>
    </NadPlochou>
  );
}

/** Pomíjivé potvrzení dokončené akce (DP §3.17); chyba akce `tone="bad"`. */
function useZprava() {
  const [zprava, setZprava] = useState<{ text: string; ton?: 'bad' } | null>(null);
  const toast = zprava ? (
    <NadPlochou><Toast message={zprava.text} tone={zprava.ton} onClose={() => setZprava(null)} /></NadPlochou>
  ) : null;
  return { toast, ok: (text: string) => setZprava({ text }), chyba: (text: string) => setZprava({ text, ton: 'bad' }) };
}

/**
 * Žádost na nástroj Skladu (otevřít nákupní seznam, upravit položku).
 * Nástroj na stránce Sklad událost přijme synchronně (`detail.prijato`);
 * jinde (Přehled) si žádost počká v sessionStorage a widget přejde na Sklad.
 */
function pozadejSklad(nav: Navigace, udalost: string, klic: string, data: Record<string, unknown> = {}) {
  const detail: Record<string, unknown> = { ...data, prijato: false };
  window.dispatchEvent(new CustomEvent(udalost, { detail }));
  if (detail.prijato) return;
  try { sessionStorage.setItem(klic, JSON.stringify(data)); } catch { /* soukromé okno: jen přejdeme */ }
  nav.onNavigate('inventory');
}

/** Po zápisu z widgetu: sklad a vše, co z něj počítá, ať to vidí hned (i nástroj Skladu). */
const obnovSklad = () => obnovDataWidgetu(URL_SKLAD);

// ---------------------------------------------------------------------------
// Docházející zásoby
// ---------------------------------------------------------------------------

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

function vyberPolozky(raw: unknown): Polozka[] {
  return (seznam(raw) as PolozkaSkladu[])
    // N7: stejně jako Sklad — archivované položky a neschválené návrhy
    // od týmu do zásob nepatří, jinak Přehled a Sklad hlásí jiná čísla.
    .filter(p => p && jeAktivni(p))
    .map(p => {
      const stav = stavZasoby(p);
      return {
        id: Number(p.id),
        nazev: String(p.name ?? ''),
        mnozstvi: Number(p.quantity) || 0,
        jednotka: String(p.unit ?? ''),
        kriticke: stav === 'critical',
        dochazi: stav !== 'ok',
        kategorieId: p.categoryId != null ? Number(p.categoryId) : null,
        kategorie: typeof p.category === 'string' && p.category ? p.category : null,
        vyroba: p.madeInHouse === true,
      };
    });
}

type NastaveniDochazi = { kategorie: number | string | null; jen_kriticke: boolean; vyroba: boolean };

const idKategorie = (v: unknown): number | null =>
  v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);

function Dochazi({ velikost, nastaveni, nahled }: WidgetProps<NastaveniDochazi>) {
  const nav = useNavigace();
  const { ok, ceka } = useBrana('sklad.dochazi');
  const katId = idKategorie(nastaveni.kategorie);

  const sklad = useDataWidgetu<Polozka[]>(ok ? URL_SKLAD : null, vyberPolozky);
  // Kategorie jen s vybranou kategorií: kvůli podkategoriím a jménu do odkazu.
  // Stejná URL jako výběr v nastavení widgetu, takže dotaz se sdílí.
  const kategorie = useDataWidgetu<KategorieSkladu[]>(ok && katId != null ? URL_KATEGORIE : null, vyberKategorie);

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
        className={BEZ_PRAZDNEHO_OCASU}
        lead={<span className={`w-2 h-2 rounded-full shrink-0 ${p.kriticke ? 'bg-bad' : 'bg-wait'}`} aria-hidden />}
        title={p.nazev}
        // Množství jde do meta tónovaným textem, ne jako chip do ocasu: na
        // telefonu se ocas s chipem i šipkou zalamoval každý na vlastní
        // řádek a tři položky zabraly přes 400 px (viz BEZ_PRAZDNEHO_OCASU).
        meta={<>
          <span className={`font-medium tabular-nums ${p.kriticke ? 'text-bad-ink' : 'text-wait-ink'}`}>{mnozstvi(p.mnozstvi)} {p.jednotka}</span>
          {metaKategorie && p.kategorie ? ` · ${p.kategorie}` : ''}
        </>}
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
// Nákupní seznam
// ---------------------------------------------------------------------------

type NastaveniNakupu = { dodavatel: string | number | null; jen_kriticke: boolean };

function NakupniSeznam({ velikost, nastaveni, nahled }: WidgetProps<NastaveniNakupu>) {
  const nav = useNavigace();
  const smi = useSmi();
  const money = useMoney();
  const def = widget('sklad.nakupni_seznam');
  const { ok, ceka } = useBrana('sklad.nakupni_seznam');
  const sklad = useDataWidgetu<PolozkaSkladu[]>(ok ? URL_SKLAD : null, vyberSklad);
  const smiCeny = smi(pole(def, 'odhad_ceny') ?? 'sklad.ceny');
  const smiObjednat = smi(pole(def, 'akce:sestavit_objednavku') ?? 'nakup.vytvorit') && nav.smiPohled('inventory');
  const dodavatel = nastaveni.dodavatel == null || nastaveni.dodavatel === '' ? null : String(nastaveni.dodavatel);

  const radky = useMemo(
    () => nakupniSeznam(sklad.data ?? [], { dodavatel, jenKriticke: nastaveni.jen_kriticke }),
    [sklad.data, dodavatel, nastaveni.jen_kriticke],
  );
  const L = velikost === 'L';
  const strop = L ? 20 : 5;
  const ukazat = radky.slice(0, strop);
  const odhad = smiCeny ? radky.reduce((s, r) => s + (r.cena ?? 0), 0) : 0;

  const radek = (r: (typeof radky)[number], sDodavatelem: boolean) => {
    const meta = [
      sDodavatelem ? r.dodavatel : null,
      r.naVyrobu.length > 0 ? `na výrobu: ${r.naVyrobu.join(', ')}` : null,
    ].filter(Boolean).join(' · ');
    return (
      <ListRow key={r.id} title={r.nazev} meta={meta || undefined}
        value={L && smiCeny && r.cena != null ? money(r.cena) : undefined}
        right={<Chip tone={r.kriticke ? 'bad' : 'wait'} size="sm" className="tabular-nums">{mnozstvi(r.mnozstvi)} {r.jednotka}</Chip>} />
    );
  };

  return (
    <Widget
      nacteni={ceka ? CEKA : sklad}
      kostra="seznam"
      doplnek={radky.length > 0 ? <Chip tone={radky.some(r => r.kriticke) ? 'bad' : 'wait'} size="sm">{cislo(radky.length)}</Chip> : undefined}
      odkaz={{ popisek: 'Sklad', pohled: 'inventory' }}
      prazdno={sklad.data && radky.length === 0
        ? <p className="t-meta">{dodavatel ? `Od dodavatele ${dodavatel} teď nic nechybí.` : 'Není co kupovat — všechno je nad limitem.'}</p>
        : undefined}
    >
      {L ? (
        <div className="space-y-4">
          {poDodavatelich(ukazat).map(s => (
            <section key={s.dodavatel ?? '-'} aria-label={s.dodavatel ?? 'Bez dodavatele'}>
              <p className="t-label">{s.dodavatel ?? 'Bez dodavatele'}</p>
              <ul className="list mt-1">{s.radky.map(r => radek(r, false))}</ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="list">{ukazat.map(r => radek(r, !dodavatel))}</ul>
      )}
      {radky.length > strop && <p className="t-meta mt-2">{aDalsich(radky.length - strop)}</p>}
      {(L || smiObjednat) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {L && smiCeny && odhad > 0 ? <p className="t-meta">Odhad nákupu {money(odhad)}</p> : <span />}
          {smiObjednat && (
            <Button variant="secondary" size="sm" icon="cart"
              onClick={() => { if (!nahled) pozadejSklad(nav, UDALOST_NAKUP, KLIC_NAKUP, { dodavatel }); }}>
              Objednat
            </Button>
          )}
        </div>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Hodnota zásob (N8)
// ---------------------------------------------------------------------------

const vyberHodnotuSkladu = (raw: unknown): HodnotaZasob => hodnotaZasob(seznam(raw) as PolozkaSkladu[]);
const vyberHodnotuFinanci = (raw: any): HodnotaZasob => ({
  hodnota: Number(raw?.summary?.stockValue) || 0,
  top: seznam(raw?.summary?.stockTop).map((x: any) => ({ nazev: String(x?.name ?? ''), hodnota: Number(x?.value) || 0 })),
  bezCeny: 0,
});

function HodnotaZasobW({ velikost, nahled }: WidgetProps) {
  const nav = useNavigace();
  const smi = useSmi();
  const money = useMoney();
  const { ok, ceka } = useBrana('sklad.hodnota_zasob');
  // N8: jeden výpočet. Se sklad.ceny z položek skladu (stejný vzorec jako
  // /api/finance, lib/skladPrehled.ts — a dotaz se sdílí s ostatními widgety);
  // vlastní role jen s finance.zobrazit ceny ve skladu nevidí (unitCost null),
  // tak dostane číslo z Financí, které ho počítají na serveru.
  const zeSkladu = ok && smi('sklad.ceny');
  const sklad = useDataWidgetu<HodnotaZasob>(zeSkladu ? URL_SKLAD : null, vyberHodnotuSkladu);
  const finance = useDataWidgetu<HodnotaZasob>(ok && !zeSkladu ? `/api/finance?month=${pragueToday().slice(0, 7)}` : null, vyberHodnotuFinanci);
  const data = zeSkladu ? sklad.data : finance.data;
  const smiSklad = nav.smiPohled('inventory');
  const note = data && data.bezCeny > 0 ? `${czCount(data.bezCeny, POLOZKA)} bez ceny` : 'podle nákupních cen';

  return (
    <Widget
      nacteni={ceka ? CEKA : [sklad, finance]}
      kostra={velikost === 'S' ? 'cislo' : 'seznam'}
      otevrit={velikost === 'S' && smiSklad && !nahled ? () => nav.onNavigate('inventory') : undefined}
      odkaz={velikost === 'M' ? { popisek: 'Sklad', pohled: 'inventory' } : undefined}
      prazdno={data && data.hodnota === 0 ? <p className="t-meta">Položky zatím nemají nákupní cenu.</p> : undefined}
    >
      {data && (
        <>
          <Stat label="Na regálech" value={money(data.hodnota)} note={note} />
          {velikost === 'M' && data.top.length > 0 && (
            <ul className="list mt-2">
              {data.top.slice(0, 3).map(t => <ListRow key={t.nazev} title={t.nazev} value={money(t.hodnota)} />)}
            </ul>
          )}
        </>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Nové věci od týmu (návrhy)
// ---------------------------------------------------------------------------

const vyberNavrhy = (raw: unknown): PolozkaSkladu[] => (seznam(raw) as PolozkaSkladu[]).filter(p => p.approved === false);

// okJson vyhodí u odpovědi, která není ok — volající chybu ukáže (Toast / okno).
const schvalNavrh = (id: number) => fetch(`/api/inventory/${id}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approve: true }),
}).then(okJson);
const zamitniNavrh = (id: number) => fetch(`/api/inventory/${id}`, { method: 'DELETE' }).then(okJson);

function Navrhy({ velikost, nahled }: WidgetProps) {
  const nav = useNavigace();
  const smi = useSmi();
  const { upravy } = useWidget();
  const def = widget('sklad.navrhy');
  const { ok, ceka } = useBrana('sklad.navrhy');
  const data = useDataWidgetu<PolozkaSkladu[]>(ok ? URL_SKLAD : null, vyberNavrhy);
  const smiSchvalit = smi(pole(def, 'akce:schvalit') ?? 'sklad.schvalovat');
  const smiZamitnout = smi(pole(def, 'akce:zamitnout') ?? 'sklad.schvalovat');
  const [pracuji, setPracuji] = useState<number | 'vse' | null>(null);
  const [zamitam, setZamitam] = useState<PolozkaSkladu[] | null>(null);
  // Hromadné schválení a zamítnutí (kolo 8): po inventuře přijde třicet návrhů
  // a po jednom by to byla práce navíc. Stejná lišta jako ve všech frontách.
  const vyber = useSelection<number>();
  const z = useZprava();
  useEffect(() => { if (upravy || nahled) { setZamitam(null); vyber.exit(); } }, [upravy, nahled, vyber.exit]);

  const navrhy = data.data ?? [];
  // Ve výběru se ukážou všechny návrhy — zaškrtnout jde jen to, co je vidět.
  const strop = vyber.selecting ? 50 : 5;

  const schval = async (ids: number[]) => {
    setPracuji(ids.length > 1 ? 'vse' : ids[0]);
    const vysledky = await Promise.allSettled(ids.map(schvalNavrh));
    setPracuji(null);
    obnovSklad();
    const selhalo = vysledky.filter(v => v.status === 'rejected').length;
    if (selhalo) z.chyba(selhalo === ids.length ? 'Schválení se nepodařilo.' : `${selhalo} z ${cislo(ids.length)} se neuložilo — zkus to znovu.`);
    else { z.ok(ids.length > 1 ? `Schváleno: ${czCount(ids.length, NAVRH)}.` : 'Schváleno — položka je ve skladu.'); vyber.exit(); }
  };
  const zamitni = async (polozky: PolozkaSkladu[]) => {
    const vysledky = await Promise.allSettled(polozky.map(x => zamitniNavrh(x.id)));
    obnovSklad();
    const selhalo = vysledky.filter(v => v.status === 'rejected').length;
    if (selhalo === polozky.length) throw new Error('Zamítnutí se nepodařilo.');
    if (selhalo) z.chyba(`${selhalo} z ${cislo(polozky.length)} se nezamítlo — zkus to znovu.`);
    else z.ok(polozky.length > 1 ? `Zamítnuto: ${czCount(polozky.length, NAVRH)}.` : 'Návrh zamítnut.');
    vyber.exit();
  };

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : data} kostra="cislo" prazdno={data.data && navrhy.length === 0 ? null : undefined}
        otevrit={nav.smiPohled('inventory') && !nahled ? () => nav.onNavigate('inventory') : undefined}>
        <Stat label="Čeká na schválení" value={cislo(navrhy.length)} note={czForm(navrhy.length, NAVRH)} />
      </Widget>
    );
  }

  return (
    <>
      <Widget
        nacteni={ceka ? CEKA : data}
        kostra="seznam"
        doplnek={navrhy.length > 0 ? <Chip tone="wait" size="sm">{cislo(navrhy.length)}</Chip> : undefined}
        odkaz={{ popisek: 'Sklad', pohled: 'inventory' }}
        // Nic nečeká = dobrá zpráva; v klidu se karta nekreslí (dřív taky ne).
        prazdno={data.data && navrhy.length === 0 ? null : undefined}
      >
        <ul className="list">
          {navrhy.slice(0, strop).map(p => (
            <li key={p.id}>
              <ListRow as="div"
                lead={vyber.selecting ? (
                  <SelectBox checked={vyber.has(p.id)} onChange={() => vyber.toggle(p.id)} label={`Vybrat návrh — ${p.name}`} />
                ) : p.photoUrl ? (
                  <a href={p.photoUrl} target="_blank" rel="noreferrer" className="block shrink-0" aria-label={`Fotka: ${p.name}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.photoUrl} alt="" className="h-9 w-9 rounded-xl object-cover" />
                  </a>
                ) : (
                  <span className="well h-9 w-9 grid place-items-center text-black/55"><Icon name="box" size={16} /></span>
                )}
                title={p.name}
                meta={[
                  `${mnozstvi(Number(p.quantity) || 0)} ${p.unit ?? ''}`.trim(),
                  p.category || 'bez kategorie',
                  p.submittedByName ? `zapsal/a ${p.submittedByName}` : 'zapsal někdo z týmu',
                ].join(' · ')}
                actions={vyber.selecting ? undefined : <>
                  {smiSchvalit && (
                    <Button variant="primary" size="sm" loading={pracuji === p.id} disabled={pracuji != null}
                      onClick={() => { if (!nahled) void schval([p.id]); }}>Schválit</Button>
                  )}
                  {smiZamitnout && (
                    <Button variant="danger" size="sm" disabled={pracuji != null}
                      onClick={() => { if (!nahled) setZamitam([p]); }}>Zamítnout</Button>
                  )}
                </>}
              />
            </li>
          ))}
        </ul>
        {navrhy.length > strop && <p className="t-meta mt-2">{aDalsich(navrhy.length - strop)}</p>}
        {/* „Vybrat víc" se ukáže, až je co vybírat (DP §3.19). */}
        {(smiSchvalit || smiZamitnout) && navrhy.length > 1 && !vyber.selecting && (
          <div className="mt-3 flex justify-end">
            <Button variant="secondary" size="sm" icon="check" disabled={pracuji != null}
              onClick={() => { if (!nahled) vyber.start(); }}>Vybrat víc</Button>
          </div>
        )}
      </Widget>
      {vyber.selecting && !nahled && (
        <NadPlochou>
          <BulkBar
            count={vyber.count}
            totalLabel={`Vybrat vše (${navrhy.length})`}
            onSelectAll={() => vyber.selectAll(navrhy.map(p => p.id))}
            onExit={vyber.exit}
            actions={[
              ...(smiSchvalit ? [{ label: 'Schválit', primary: true, onClick: () => { void schval(Array.from(vyber.selected)); } }] : []),
              ...(smiZamitnout ? [{ label: 'Zamítnout', danger: true, onClick: () => setZamitam(navrhy.filter(p => vyber.has(p.id))) }] : []),
            ]}
          />
        </NadPlochou>
      )}
      {zamitam && zamitam.length > 0 && (
        <Potvrzeni titulek={zamitam.length === 1 ? `Zamítnout „${zamitam[0].name}"?` : `Zamítnout ${czCount(zamitam.length, NAVRH)}?`} akce="Zamítnout"
          text="Návrh se smaže ze skladu. Kdo ho zapsal, ho uvidí zmizet."
          onZavrit={() => setZamitam(null)}
          onPotvrdit={() => zamitni(zamitam)} />
      )}
      {z.toast}
    </>
  );
}

// ---------------------------------------------------------------------------
// Hlášení ze skladu
// ---------------------------------------------------------------------------

const URL_HLASENI = '/api/inventory/reports';

function HlaseniW({ velikost, nahled }: WidgetProps) {
  const nav = useNavigace();
  const { ok, ceka } = useBrana('sklad.hlaseni');
  const data = useDataWidgetu<Hlaseni[]>(ok ? URL_HLASENI : null, vyberHlaseni);
  const [pracuji, setPracuji] = useState<number | null>(null);
  const z = useZprava();
  const nova = (data.data ?? []).filter(h => h.nove);

  const vyrizeno = async (h: Hlaseni) => {
    setPracuji(h.id);
    try {
      await fetch(URL_HLASENI, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: h.id, status: 'done' }),
      }).then(okJson);
      data.set(prev => (prev ?? []).map(x => (x.id === h.id ? { ...x, nove: false } : x)));
      obnovDataWidgetu(URL_HLASENI);
      z.ok('Hlášení vyřízeno.');
    } catch (e) {
      z.chyba(apiMessage(e, 'Nepodařilo se to uložit.'));
    }
    setPracuji(null);
  };

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : data} kostra="cislo"
        otevrit={nav.smiPohled('inventory') && !nahled ? () => nav.onNavigate('inventory') : undefined}>
        <Stat label="Nevyřízeno" value={cislo(nova.length)} note={nova.length === 0 ? 'vše vyřízeno' : `${czForm(nova.length, HLASENI)} od týmu`} />
      </Widget>
    );
  }

  const strop = 5;
  return (
    <>
      <Widget
        nacteni={ceka ? CEKA : data}
        kostra="seznam"
        doplnek={nova.length > 0 ? <Chip tone="wait" size="sm">{cislo(nova.length)}</Chip> : undefined}
        odkaz={{ popisek: 'Sklad', pohled: 'inventory' }}
        prazdno={data.data && nova.length === 0 ? <p className="t-meta">Žádné nové hlášení — tým nic nehlásí.</p> : undefined}
      >
        <ul className="list">
          {nova.slice(0, strop).map(h => (
            <li key={h.id}>
              <ListRow as="div"
                lead={<Avatar emoji={h.avatar} size="sm" />}
                title={h.polozky.length > 0 ? h.polozky.join(', ') : 'Bez položek'}
                meta={[h.autor, pred(h.kdy), h.poznamka ? `„${h.poznamka}"` : null].filter(Boolean).join(' · ')}
                actions={
                  <Button variant="primary" size="sm" loading={pracuji === h.id} disabled={pracuji != null}
                    onClick={() => { if (!nahled) void vyrizeno(h); }}>Vyřízeno</Button>
                }
              />
            </li>
          ))}
        </ul>
        {nova.length > strop && <p className="t-meta mt-2">{aDalsich(nova.length - strop)}</p>}
      </Widget>
      {z.toast}
    </>
  );
}

// ---------------------------------------------------------------------------
// Objednávky u dodavatelů
// ---------------------------------------------------------------------------

const URL_OBJEDNAVKY = '/api/orders';

/**
 * Okno příjmu objednávky: co v ní je, volitelná celková cena a Přijmout /
 * Zrušit. Dřív to uměl panel Objednávky na Skladu (tlačítko „Přišlo" a pole
 * ceny); cena jde do orders.total_cost a z ní počítá výdaje /api/finance
 * („Objednávka — dodavatel"). Bez ní by Finance příjem zboží neviděly.
 * Pole ceny jen pro `sklad.ceny_upravit` — server cenu bez něj odmítne 403.
 */
function OknoPrijmu({ o, smiCenu, onPrijmout, onZrusit, onZavrit }: {
  o: Objednavka;
  smiCenu: boolean;
  onPrijmout: (cena: number | null) => Promise<void>;
  onZrusit: () => void;
  onZavrit: () => void;
}) {
  const money = useMoney();
  const [cena, setCena] = useState('');
  const [pracuji, setPracuji] = useState(false);
  const [chyba, setChyba] = useState('');
  const castka = cena.trim() === '' ? null : Number(cena.replace(/\s/g, '').replace(',', '.'));
  const spatne = castka != null && (!Number.isFinite(castka) || castka < 0);
  const potvrdit = async () => {
    if (spatne) return;
    setPracuji(true); setChyba('');
    try { await onPrijmout(castka); onZavrit(); }
    catch (e) { setChyba(apiMessage(e, 'Příjem se nepodařil.')); setPracuji(false); }
  };
  return (
    <NadPlochou>
      <Modal open onClose={onZavrit} size="sm"
        title={o.dodavatel ? `Přišlo od ${o.dodavatel}?` : 'Přišla objednávka?'}
        subtitle={`Objednáno ${pred(o.vytvoreno)}${o.autor ? ` · ${o.autor}` : ''}`}
        footer={<>
          <Button variant="secondary" disabled={pracuji} onClick={onZavrit}>Zavřít</Button>
          <Button variant="primary" loading={pracuji} disabled={spatne} onClick={potvrdit}>Přijmout a naskladnit</Button>
        </>}>
        <div className="space-y-4">
          <ul className="list" aria-label="Položky objednávky">
            {o.polozky.map((p, i) => (
              <ListRow key={i} title={p.nazev} value={`${mnozstvi(p.mnozstvi)} ${p.jednotka}`.trim()} />
            ))}
          </ul>
          {smiCenu && (
            <Field id={`sklad-prijem-cena-${o.id}`} label="Celková cena (nepovinné)"
              hint={spatne ? undefined : 'Z ceny počítají Finance výdaje za zboží.'}
              error={spatne ? 'Zadej částku, například 1 250.' : undefined}>
              <Input id={`sklad-prijem-cena-${o.id}`} inputMode="decimal" value={cena} placeholder={`např. ${money(1250)}`}
                onChange={e => setCena(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void potvrdit(); } }} />
            </Field>
          )}
          <p className="t-meta">Přijetí přičte objednané množství ke skladu.</p>
          {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
          {/* Zrušení je destruktivní a vzácné — stranou pod obsahem, ne vedle
              hlavní akce v patičce (na telefonu by se tři tlačítka nevešla). */}
          <Button variant="danger" size="sm" icon="close" disabled={pracuji} onClick={onZrusit}>Zrušit objednávku…</Button>
        </div>
      </Modal>
    </NadPlochou>
  );
}

function Objednavky({ velikost, nahled }: WidgetProps) {
  const nav = useNavigace();
  const smi = useSmi();
  const money = useMoney();
  const { upravy } = useWidget();
  const def = widget('sklad.objednavky');
  const { ok, ceka } = useBrana('sklad.objednavky');
  const data = useDataWidgetu<Objednavka[]>(ok ? URL_OBJEDNAVKY : null, cekajiciObjednavky);
  // Stejná URL = tatáž odpověď z mezipaměti, jen jiný výběr (žádný druhý dotaz).
  const historie = useDataWidgetu<Objednavka[]>(ok && velikost === 'L' ? URL_OBJEDNAVKY : null, historieObjednavek);
  const smiCenu = smi(pole(def, 'totalcost') ?? 'sklad.ceny');
  const smiZapsatCenu = smi(pole(def, 'pole:cena_prijmu') ?? 'sklad.ceny_upravit');
  const smiMazat = smi(pole(def, 'akce:smazat_historii') ?? 'nakup.prijmout');
  const smiPrijmout = smi(pole(def, 'akce:prijmout_zrusit') ?? 'nakup.prijmout');
  const [prijimam, setPrijimam] = useState<Objednavka | null>(null);
  const [rusim, setRusim] = useState<Objednavka | null>(null);
  const [mazu, setMazu] = useState<Objednavka | null>(null);
  const [ukazHistorii, setUkazHistorii] = useState(false);
  const z = useZprava();
  useEffect(() => { if (upravy || nahled) { setPrijimam(null); setRusim(null); setMazu(null); } }, [upravy, nahled]);

  const cekajici = data.data ?? [];
  const zmen = async (o: Objednavka, action: 'received' | 'cancelled', cena: number | null = null) => {
    const res = await fetch(URL_OBJEDNAVKY, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: o.id, action, ...(action === 'received' && cena != null ? { totalCost: cena } : {}) }),
    });
    const d = await okJson(res);
    obnovDataWidgetu(URL_OBJEDNAVKY);
    // Příjem naskladňuje — sklad a všechno, co z něj počítá, ať to vidí hned.
    // Cena příjmu mění výdaje ve Financích.
    if (action === 'received') { obnovSklad(); obnovDataWidgetu('/api/finance'); }
    return d as { restocked?: number } | null;
  };
  const prijmout = async (o: Objednavka, cena: number | null) => {
    const d = await zmen(o, 'received', cena);
    const n = typeof d?.restocked === 'number' ? d.restocked : o.polozky.length;
    z.ok(`Přijato${o.dodavatel ? ` od ${o.dodavatel}` : ''} — naskladněno ${czCount(n, POLOZKA)}.`);
  };
  const smazat = async (o: Objednavka) => {
    const res = await fetch(`${URL_OBJEDNAVKY}?id=${o.id}`, { method: 'DELETE' });
    await okJson(res);
    obnovDataWidgetu(URL_OBJEDNAVKY);
    obnovDataWidgetu('/api/finance');
    z.ok('Objednávka smazána z historie.');
  };

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : data} kostra="cislo"
        otevrit={nav.smiPohled('inventory') && !nahled ? () => nav.onNavigate('inventory') : undefined}>
        <Stat label="Čeká na příjem" value={cislo(cekajici.length)} note={cekajici.length === 0 ? 'nic nečeká' : czForm(cekajici.length, OBJEDNAVKA)} />
      </Widget>
    );
  }

  const L = velikost === 'L';
  const strop = L ? 10 : 5;
  const hist = historie.data ?? [];
  const utrata = smiCenu ? utrataZaMesic(hist) : 0;
  const stropHistorie = 10;
  return (
    <>
      <Widget
        nacteni={ceka ? CEKA : data}
        kostra="seznam"
        doplnek={cekajici.length > 0 ? <Chip tone="muted" size="sm">{cislo(cekajici.length)}</Chip> : undefined}
        odkaz={{ popisek: 'Sklad', pohled: 'inventory' }}
        // Prázdno jen ve středním: velký má pod tím historii a útratu.
        prazdno={!L && data.data && cekajici.length === 0 ? <p className="t-meta">Žádná objednávka nečeká na příjem.</p> : undefined}
      >
        {cekajici.length === 0 && L && <p className="t-meta">Žádná objednávka nečeká na příjem.</p>}
        <ul className="list">
          {cekajici.slice(0, strop).map(o => {
            const obsah = L
              ? o.polozky.map(p => `${p.nazev} ${mnozstvi(p.mnozstvi)} ${p.jednotka}`.trim()).join(', ')
              : czCount(o.polozky.length, POLOZKA);
            return (
              <li key={o.id}>
                {/* Přijmout je v řádku i ve středním widgetu — výchozí Sklad vedení
                    ho má ve velikosti M a příjem je hlavní důvod, proč tu widget je
                    (dřív tlačítko „Přišlo" přímo na stránce). Zrušit je v okně
                    příjmu, ať řádek nese nejvýš jednu akci a vejde se na telefon. */}
                <ListRow as="div"
                  title={o.dodavatel ?? 'Bez dodavatele'}
                  meta={[pred(o.vytvoreno), obsah].filter(Boolean).join(' · ')}
                  value={smiCenu && o.cena != null ? money(o.cena) : undefined}
                  actions={smiPrijmout ? (
                    <Button variant="primary" size="sm" onClick={() => { if (!nahled) setPrijimam(o); }}>Přijmout</Button>
                  ) : undefined}
                />
              </li>
            );
          })}
        </ul>
        {cekajici.length > strop && <p className="t-meta mt-2">{aDalsich(cekajici.length - strop)}</p>}
        {L && utrata > 0 && (
          <p className="t-meta mt-3">Tento měsíc utraceno za zboží: <span className="font-semibold text-[#16181A] tabular-nums">{money(utrata)}</span></p>
        )}
        {L && hist.length > 0 && (
          <div className="mt-3">
            <Button variant="ghost" size="sm" iconAfter="chevron" aria-expanded={ukazHistorii}
              className={ukazHistorii ? '[&>svg]:rotate-180' : ''}
              onClick={() => setUkazHistorii(v => !v)}>
              Historie ({cislo(hist.length)})
            </Button>
            {ukazHistorii && (
              <>
                <ul className="list mt-1" aria-label="Historie objednávek">
                  {hist.slice(0, stropHistorie).map(o => (
                    <li key={o.id}>
                      <ListRow as="div"
                        title={o.dodavatel ?? 'Bez dodavatele'}
                        meta={<>
                          <span className={o.stav === 'received' ? 'text-ok-ink' : 'text-bad-ink'}>{o.stav === 'received' ? 'Přijato' : 'Zrušeno'}</span>
                          {` · ${datumKratce(o.prijata ?? o.vytvoreno)}`}
                        </>}
                        value={smiCenu && o.cena != null && o.cena > 0 ? money(o.cena) : undefined}
                        actions={smiMazat ? (
                          <Button variant="ghost" size="sm" iconOnly icon="trash" className="tap-target-sm"
                            aria-label={`Smazat z historie: ${o.dodavatel ?? 'objednávka bez dodavatele'} ${datumKratce(o.prijata ?? o.vytvoreno)}`}
                            onClick={() => { if (!nahled) setMazu(o); }} />
                        ) : undefined}
                      />
                    </li>
                  ))}
                </ul>
                {hist.length > stropHistorie && <p className="t-meta mt-2">{aDalsich(hist.length - stropHistorie)}</p>}
              </>
            )}
          </div>
        )}
      </Widget>
      {prijimam && (
        <OknoPrijmu o={prijimam} smiCenu={smiZapsatCenu}
          onPrijmout={cena => prijmout(prijimam, cena)}
          onZrusit={() => { setRusim(prijimam); setPrijimam(null); }}
          onZavrit={() => setPrijimam(null)} />
      )}
      {rusim && (
        <Potvrzeni titulek={`Zrušit objednávku${rusim.dodavatel ? ` u ${rusim.dodavatel}` : ''}?`} akce="Zrušit objednávku"
          text="Nic se nenaskladní. Dodavateli dej vědět sám — aplikace mu nic neposílá."
          onZavrit={() => setRusim(null)}
          onPotvrdit={async () => { await zmen(rusim, 'cancelled'); z.ok('Objednávka zrušena.'); }} />
      )}
      {mazu && (
        <Potvrzeni titulek="Smazat objednávku z historie?" akce="Smazat"
          text={mazu.stav === 'received' && mazu.cena ? 'Zmizí i z výdajů ve Financích. Naskladněné zboží ve skladu zůstane.' : 'Záznam zmizí z historie. Sklad se nemění.'}
          onZavrit={() => setMazu(null)}
          onPotvrdit={() => smazat(mazu)} />
      )}
      {z.toast}
    </>
  );
}

// ---------------------------------------------------------------------------
// Suroviny bez ceny nebo balení (N4)
// ---------------------------------------------------------------------------

const vyberUsage = (raw: any): Record<string, unknown[]> => (raw?.usage && typeof raw.usage === 'object' ? raw.usage : {});

function ChybiUdaje({ velikost, nahled }: WidgetProps) {
  const nav = useNavigace();
  const smi = useSmi();
  const def = widget('sklad.chybi_udaje');
  // N4: brána chce receptury.zobrazit I sklad.ceny (useBrana čte `vse` jako
  // „všechny"). Bez cen je unitCost maskovaný null a widget by hlásil
  // chybějící cenu u každé suroviny z receptur.
  const { ok, ceka } = useBrana('sklad.chybi_udaje');
  const sklad = useDataWidgetu<PolozkaSkladu[]>(ok ? URL_SKLAD : null, vyberSklad);
  const usage = useDataWidgetu<Record<string, unknown[]>>(ok ? '/api/pos/usage' : null, vyberUsage);
  const radky = useMemo(() => chybiUdaje(sklad.data ?? [], usage.data), [sklad.data, usage.data]);
  const smiDoplnit = smi(pole(def, 'akce:doplnit') ?? ['sklad.upravit', 'sklad.ceny_upravit']) && nav.smiPohled('inventory');
  const hotovo = sklad.data != null && usage.data != null;

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : [sklad, usage]} kostra="cislo" prazdno={hotovo && radky.length === 0 ? null : undefined}
        otevrit={nav.smiPohled('inventory') && !nahled ? () => nav.onNavigate('inventory') : undefined}>
        <Stat label="K doplnění" value={cislo(radky.length)} note={czForm(radky.length, SUROVINA)} />
      </Widget>
    );
  }

  const strop = 6;
  return (
    <Widget
      nacteni={ceka ? CEKA : [sklad, usage]}
      kostra="seznam"
      doplnek={radky.length > 0 ? <Chip tone="wait" size="sm">{cislo(radky.length)}</Chip> : undefined}
      odkaz={{ popisek: 'Sklad', pohled: 'inventory' }}
      // Všechno doplněné = dobrá zpráva, karta se v klidu nekreslí (jako dřív blok).
      prazdno={hotovo && radky.length === 0 ? null : undefined}
    >
      <ul className="list">
        {radky.slice(0, strop).map(r => (
          <li key={r.id}>
            <ListRow as="div" className={BEZ_PRAZDNEHO_OCASU} title={r.nazev}
              meta={<>
                <span className="font-medium text-wait-ink">chybí {r.chybi}</span>
                {` · kasa ho používá v ${czCount(r.produktu, { one: 'produktu', few: 'produktech', many: 'produktech' })}`}
              </>}
              onClick={smiDoplnit && !nahled ? () => pozadejSklad(nav, UDALOST_UPRAVIT, KLIC_UPRAVIT, { id: r.id }) : undefined} />
          </li>
        ))}
      </ul>
      {radky.length > strop && <p className="t-meta mt-2">{aDalsich(radky.length - strop)}</p>}
      <p className="t-meta mt-2">Dokud chybí, nespočítá se marže produktů, které je používají, a odpis nebere z načatého balení.</p>
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Poslední pohyby skladu
// ---------------------------------------------------------------------------

type NastaveniPohybu = { druh: DruhPohybu };

function PosledniPohyby({ velikost, nastaveni }: WidgetProps<NastaveniPohybu>) {
  const { ok, ceka } = useBrana('sklad.posledni_pohyby');
  const data = useDataWidgetu<Pohyb[]>(ok ? '/api/inventory/log' : null, raw => vyberPohyby(raw));
  const druh: DruhPohybu = nastaveni.druh === 'rucni' || nastaveni.druh === 'prodej_z_kasy' ? nastaveni.druh : 'vse';
  const pohyby = useMemo(() => (data.data ?? []).filter(p => druh === 'vse' || (druh === 'prodej_z_kasy' ? p.zKasy : !p.zKasy)), [data.data, druh]);
  const strop = velikost === 'L' ? 20 : 5;
  const zmena = (p: Pohyb) => {
    // Pohyb jen v načatém balení (odpis 0,04 l z lahve): počet kusů se nezmění.
    const n = p.zmena !== 0 ? p.zmena : p.zmenaNacate ?? 0;
    return `${n > 0 ? '+' : n < 0 ? '−' : ''}${mnozstvi(Math.abs(n))}${p.zmena === 0 && p.zmenaNacate != null ? ' z načatého' : ` ${p.jednotka}`}`;
  };

  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      kostra="seznam"
      prazdno={data.data && pohyby.length === 0 ? <p className="t-meta">Zatím žádné pohyby.</p> : undefined}
    >
      <ul className="list">
        {pohyby.slice(0, strop).map(p => (
          <ListRow key={p.id} title={p.polozka}
            meta={[p.kdo ?? (p.zKasy ? 'kasa' : null), pred(p.kdy), p.poznamka].filter(Boolean).join(' · ')}
            value={<span className={p.zmena > 0 ? 'text-ok-ink' : undefined}>{zmena(p)}</span>} />
        ))}
      </ul>
      {pohyby.length > strop && <p className="t-meta mt-2">{aDalsich(pohyby.length - strop)}</p>}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Inventura
// ---------------------------------------------------------------------------

const URL_INVENTURA = '/api/stocktake';

function Inventura({ velikost, nahled }: WidgetProps) {
  const smi = useSmi();
  const { upravy } = useWidget();
  const def = widget('sklad.inventura');
  const { ok, ceka } = useBrana('sklad.inventura');
  const data = useDataWidgetu(ok ? URL_INVENTURA : null, stavInventury);
  const [okno, setOkno] = useState(false);
  useEffect(() => { if (upravy || nahled) setOkno(false); }, [upravy, nahled]);
  const smiZahajit = smi(pole(def, 'akce:zahajit_zrusit') ?? 'inventura.spravovat');
  const smiDokoncit = smi(pole(def, 'akce:dokoncit') ?? 'inventura.dokoncit');
  const s = data.data;
  const otevri = () => { if (!nahled) setOkno(true); };
  const zavri = () => { setOkno(false); data.reload(); };

  const akce = s && (s.bezi
    ? <Button variant="secondary" size="sm" icon="clipboard" onClick={otevri}>Pokračovat v počítání</Button>
    : smiZahajit ? <Button variant="secondary" size="sm" icon="clipboard" onClick={otevri}>Zahájit inventuru</Button> : null);

  return (
    <>
      <Widget
        nacteni={ceka ? CEKA : data}
        kostra={velikost === 'S' ? 'cislo' : 'text'}
        // Malý widget je celý proklik (bez dalšího tlačítka v těle).
        otevrit={velikost === 'S' && s && (s.bezi || smiZahajit) && !nahled ? otevri : undefined}
      >
        {s && (velikost === 'S' ? (
          s.bezi
            ? <Stat label="Inventura běží" value={`${cislo(s.spocitano)}/${cislo(s.celkem)}`} note="spočítáno" />
            : <Stat label="Poslední inventura" value={s.posledni ? datumKratce(s.posledni) : 'Zatím žádná'} />
        ) : (
          <div className="space-y-3">
            {s.bezi ? (
              <>
                <p className="text-[15px] text-[#16181A]">
                  Běží inventura · spočítáno <span className="font-semibold tabular-nums">{cislo(s.spocitano)} z {cislo(s.celkem)}</span>
                </p>
                <div className="h-2 rounded-full bg-black/[0.06] overflow-hidden" role="progressbar" aria-label="Spočítáno"
                  aria-valuemin={0} aria-valuemax={s.celkem} aria-valuenow={s.spocitano}>
                  <div className="h-full rounded-full bg-[#16181A]" style={{ width: `${s.celkem ? Math.round((s.spocitano / s.celkem) * 100) : 0}%` }} />
                </div>
                <p className="t-meta">Zahájena {pred(s.zahajena)}.{smiDokoncit ? ' Po spočítání zapiš rozdíly do skladu.' : ' Rozdíly do skladu zapíše vedení.'}</p>
              </>
            ) : (
              <p className="t-meta">{s.posledni ? `Poslední inventura byla ${datumKratce(s.posledni)}.` : 'Inventura ještě nebyla.'}{smiZahajit ? '' : ' Zahajuje ji vedení.'}</p>
            )}
            {akce && <div>{akce}</div>}
          </div>
        ))}
      </Widget>
      {okno && (
        <NadPlochou>
          <StocktakeModal smiZahajit={smiZahajit} smiDokoncit={smiDokoncit} smiZtraty={smi('finance.ztraty')} onClose={zavri} onApplied={() => { obnovSklad(); data.reload(); }} />
        </NadPlochou>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Zapsat novou věc
// ---------------------------------------------------------------------------

function ZapsatNovou({ velikost, nahled }: WidgetProps) {
  const smi = useSmi();
  const { upravy } = useWidget();
  const { ok, ceka } = useBrana('sklad.zapsat_novou');
  const [okno, setOkno] = useState(false);
  const z = useZprava();
  useEffect(() => { if (upravy || nahled) setOkno(false); }, [upravy, nahled]);
  // Bez sklad.pridat jde zápis jako návrh ke schválení (server rozhoduje stejně).
  const navrh = !smi('sklad.pridat');

  return (
    <>
      <Widget nacteni={ceka ? CEKA : undefined} kostra="text">
        <div className={velikost === 'S' ? 'flex flex-col justify-end h-full' : 'space-y-3'}>
          {velikost === 'M' && (
            <p className="t-meta">Přišlo zboží? Vyfoť ho a napiš kolik.{navrh ? ' Vedení zápis jen potvrdí.' : ''}</p>
          )}
          <Button variant="secondary" size="sm" icon="plus" className={velikost === 'S' ? 'w-full justify-center' : ''}
            onClick={() => { if (!nahled) setOkno(true); }}>
            Zapsat novou věc
          </Button>
        </div>
      </Widget>
      {okno && (
        <NadPlochou>
          <Modal open onClose={() => setOkno(false)} size="md" title="Nová věc do skladu"
            subtitle={navrh ? 'Počítá se hned, vedení ji jen potvrdí.' : 'Položka se hned objeví ve skladu.'}>
            <NewStockEntry
              onSaved={() => { setOkno(false); obnovSklad(); z.ok(navrh ? 'Zapsáno do skladu — vedení to potvrdí.' : 'Zapsáno do skladu.'); }}
              onCancel={() => setOkno(false)} />
          </Modal>
        </NadPlochou>
      )}
      {z.toast}
    </>
  );
}

// ---------------------------------------------------------------------------
// Nahlásit chybějící
// ---------------------------------------------------------------------------

function OknoNahlasit({ onClose, onOdeslano }: { onClose: () => void; onOdeslano: (n: number) => void }) {
  const sklad = useDataWidgetu<PolozkaSkladu[]>(URL_SKLAD, vyberSklad);
  const [hledat, setHledat] = useState('');
  const [vybrane, setVybrane] = useState<number[]>([]);
  const [poznamka, setPoznamka] = useState('');
  const [pracuji, setPracuji] = useState(false);
  const [chyba, setChyba] = useState('');

  // Docházející nahoře (ty se hlásí nejčastěji), pak podle abecedy.
  const polozky = useMemo(() => {
    const q = hledat.trim().toLocaleLowerCase('cs');
    return (sklad.data ?? [])
      .filter(jeAktivni)
      .filter(p => !q || p.name.toLocaleLowerCase('cs').includes(q))
      .sort((a, b) => Number(stavZasoby(a) === 'ok') - Number(stavZasoby(b) === 'ok') || a.name.localeCompare(b.name, 'cs'));
  }, [sklad.data, hledat]);

  const prepni = (id: number) => setVybrane(v => (v.includes(id) ? v.filter(x => x !== id) : [...v, id]));
  const odeslat = async () => {
    setPracuji(true); setChyba('');
    try {
      await fetch('/api/inventory/reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: JSON.stringify(vybrane.map(id => ({ id, name: sklad.data?.find(p => p.id === id)?.name ?? `#${id}` }))),
          note: poznamka,
        }),
      }).then(okJson);
      onOdeslano(vybrane.length);
    } catch (e) {
      setChyba(apiMessage(e, 'Hlášení se nepodařilo odeslat.'));
      setPracuji(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="md" title="Nahlásit chybějící" subtitle="Vedení dostane upozornění se seznamem."
      footer={<>
        <Button variant="secondary" onClick={onClose}>Zrušit</Button>
        <Button variant="primary" loading={pracuji} disabled={vybrane.length === 0} onClick={odeslat}>
          {vybrane.length > 0 ? `Odeslat (${czCount(vybrane.length, POLOZKA)})` : 'Odeslat hlášení'}
        </Button>
      </>}>
      <div className="space-y-4">
        <SearchField value={hledat} onChange={setHledat} placeholder="Hledat položku…" ariaLabel="Hledat položku k nahlášení" />
        {sklad.error ? (
          <p className="note note-danger" role="alert">Sklad se nenačetl. Zavři okno a zkus to znovu.</p>
        ) : sklad.data == null ? (
          <p className="t-meta">Načítám sklad…</p>
        ) : polozky.length === 0 ? (
          <p className="t-meta">Nic neodpovídá hledání.</p>
        ) : (
          <ul className="list max-h-72 overflow-y-auto scrollbar-thin" aria-label="Položky">
            {polozky.slice(0, 60).map(p => {
              const stav = stavZasoby(p);
              return (
                <ListRow key={p.id}
                  lead={<SelectBox checked={vybrane.includes(p.id)} onChange={() => prepni(p.id)} label={`Nahlásit ${p.name}`} />}
                  title={p.name} meta={p.category || undefined}
                  right={stav !== 'ok'
                    ? <Chip tone={stav === 'critical' ? 'bad' : 'wait'} size="sm" className="tabular-nums">{mnozstvi(Number(p.quantity) || 0)} {p.unit ?? ''}</Chip>
                    : undefined} />
              );
            })}
          </ul>
        )}
        <Field id="sklad-nahlasit-poznamka" label="Poznámka (volitelné)">
          <Textarea id="sklad-nahlasit-poznamka" rows={2} value={poznamka} onChange={e => setPoznamka(e.target.value)} />
        </Field>
        {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
      </div>
    </Modal>
  );
}

function Nahlasit({ velikost, nahled }: WidgetProps) {
  const { upravy } = useWidget();
  const { ok, ceka } = useBrana('sklad.nahlasit');
  // M ukáže, co dochází (sdílený dotaz se skladem), S je jen tlačítko.
  const sklad = useDataWidgetu<PolozkaSkladu[]>(ok && velikost === 'M' ? URL_SKLAD : null, vyberSklad);
  const [okno, setOkno] = useState(false);
  const z = useZprava();
  useEffect(() => { if (upravy || nahled) setOkno(false); }, [upravy, nahled]);
  const nizke = (sklad.data ?? []).filter(p => jeAktivni(p) && stavZasoby(p) !== 'ok');

  return (
    <>
      <Widget nacteni={ceka ? CEKA : sklad} kostra="text">
        <div className={velikost === 'S' ? 'flex flex-col justify-end h-full' : 'space-y-3'}>
          {velikost === 'M' && (
            <p className="t-meta">
              {nizke.length > 0
                ? `Dochází ${czCount(nizke.length, POLOZKA)}: ${nizke.slice(0, 3).map(p => p.name).join(', ')}${nizke.length > 3 ? '…' : ''}`
                : 'Něco došlo? Vyber, co chybí, a vedení dostane upozornění.'}
            </p>
          )}
          <Button variant="secondary" size="sm" icon="send" className={velikost === 'S' ? 'w-full justify-center' : ''}
            onClick={() => { if (!nahled) setOkno(true); }}>
            Nahlásit chybějící
          </Button>
        </div>
      </Widget>
      {okno && (
        <NadPlochou>
          <OknoNahlasit onClose={() => setOkno(false)}
            onOdeslano={n => { setOkno(false); z.ok(`Nahlášeno: ${czCount(n, POLOZKA)}. Vedení dostalo upozornění.`); }} />
        </NadPlochou>
      )}
      {z.toast}
    </>
  );
}

// ---------------------------------------------------------------------------
// Stav kategorie
// ---------------------------------------------------------------------------

type NastaveniKategorie = { kategorie: number | string | null };

function StavKategorie({ velikost, nastaveni, nahled }: WidgetProps<NastaveniKategorie>) {
  const nav = useNavigace();
  const { ok, ceka } = useBrana('sklad.stav_kategorie');
  const katId = idKategorie(nastaveni.kategorie);
  const sklad = useDataWidgetu<PolozkaSkladu[]>(ok && katId != null ? URL_SKLAD : null, vyberSklad);
  const kategorie = useDataWidgetu<KategorieSkladu[]>(ok && katId != null ? URL_KATEGORIE : null, vyberKategorie);
  const vybrana = katId != null ? kategorie.data?.find(k => k.id === katId) ?? null : null;
  const souhrn = useMemo(
    () => (katId != null && sklad.data && kategorie.data ? souhrnKategorie(sklad.data, kategorie.data, katId) : null),
    [sklad.data, kategorie.data, katId],
  );
  const smiSklad = nav.smiPohled('inventory');
  const doKategorie = () => { if (!nahled && smiSklad && vybrana) nav.onNavigate('inventory', vybrana.nazev); };

  const prazdno = katId == null
    ? <p className="t-meta">Vyber kategorii v nastavení widgetu.</p>
    : kategorie.data && !vybrana
      ? <p className="t-meta">Vybraná kategorie už ve skladu není. Vyber jinou v nastavení widgetu.</p>
      : undefined;

  if (velikost === 'S') {
    return (
      <Widget titulek={vybrana?.nazev} nacteni={ceka ? CEKA : [sklad, kategorie]} kostra="cislo"
        otevrit={vybrana && smiSklad && !nahled ? doKategorie : undefined} prazdno={prazdno}>
        {souhrn && (souhrn.kriticke > 0
          ? <Stat label="Kriticky málo" value={cislo(souhrn.kriticke)} note={`z ${czCount(souhrn.polozek, POLOZKA)}`} />
          : <Stat label="Dochází" value={cislo(souhrn.dochazi)} note={`z ${czCount(souhrn.polozek, POLOZKA)}`} />)}
      </Widget>
    );
  }

  const strop = 5;
  return (
    <Widget
      titulek={vybrana?.nazev}
      nacteni={ceka ? CEKA : [sklad, kategorie]}
      kostra="seznam"
      doplnek={souhrn && souhrn.nizke.length > 0 ? <Chip tone={souhrn.kriticke > 0 ? 'bad' : 'wait'} size="sm">{cislo(souhrn.nizke.length)}</Chip> : undefined}
      odkaz={vybrana ? { popisek: 'Otevřít', pohled: 'inventory', arg: vybrana.nazev } : undefined}
      prazdno={prazdno ?? (souhrn && souhrn.nizke.length === 0
        ? <p className="t-meta">{souhrn.polozek === 0 ? 'V kategorii zatím nic není.' : `Všeho je dost (${czCount(souhrn.polozek, POLOZKA)}).`}</p>
        : undefined)}
    >
      {souhrn && (
        <>
          <ul className="list">
            {souhrn.nizke.slice(0, strop).map(p => (
              <ListRow key={p.id} title={p.nazev}
                right={<Chip tone={p.kriticke ? 'bad' : 'wait'} size="sm" className="tabular-nums">{mnozstvi(p.mnozstvi)} {p.jednotka}</Chip>} />
            ))}
          </ul>
          {souhrn.nizke.length > strop && <p className="t-meta mt-2">{aDalsich(souhrn.nizke.length - strop)}</p>}
        </>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// K výrobě
// ---------------------------------------------------------------------------

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
  const { ok, ceka } = useBrana('vyroba.k_vyrobe');
  const data = useDataWidgetu<ToMake[]>(ok ? '/api/production' : null, vyberVyrobu);
  const [okno, setOkno] = useState<ToMake | null>(null);
  const [rozbaleno, setRozbaleno] = useState<number | null>(null);
  const z = useZprava();

  // Okno nesmí přežít vstup do úprav (karta je pak `inert`) ani náhled.
  useEffect(() => { if (upravy || nahled) setOkno(null); }, [upravy, nahled]);

  const seznamVyroby = data.data ?? [];
  const L = velikost === 'L';
  const strop = L ? 10 : 5;
  const ukazat = seznamVyroby.slice(0, strop);

  const hotovo = (text: string) => {
    setOkno(null);
    z.ok(text);
    data.reload();
    // Naskladnění změnilo sklad: Docházející zásoby a Sklad ať to vidí hned.
    obnovSklad();
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
      {z.toast}
    </>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'sklad.dochazi': Dochazi,
  'sklad.nakupni_seznam': NakupniSeznam,
  'sklad.hodnota_zasob': HodnotaZasobW,
  'sklad.navrhy': Navrhy,
  'sklad.hlaseni': HlaseniW,
  'sklad.objednavky': Objednavky,
  'vyroba.k_vyrobe': KVyrobe,
  'sklad.chybi_udaje': ChybiUdaje,
  'sklad.posledni_pohyby': PosledniPohyby,
  'sklad.inventura': Inventura,
  'sklad.zapsat_novou': ZapsatNovou,
  'sklad.nahlasit': Nahlasit,
  'sklad.stav_kategorie': StavKategorie,
};
