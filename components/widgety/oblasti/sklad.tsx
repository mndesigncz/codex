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
import { pragueToday } from '@/lib/pragueTime';
import { useT, type PrekladFn } from '@/lib/i18n/client';
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
import { Widget, useVyrizeno, useWidget, type StavNacteni } from '../Widget';
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
const aDalsich = (n: number, t: PrekladFn) => t('…a {n, plural, one {# další} few {# další} other {# dalších}}', { n });

/** Položky skladu z odpovědi /api/inventory (surově, filtruje se až v komponentě podle nastavení). */
const vyberSklad = (raw: unknown): PolozkaSkladu[] => seznam(raw) as PolozkaSkladu[];

/** „před 5 min", „před 2 h", „před 3 dny" — pro řádky, kde přesný čas nic neřekne. */
function pred(iso: string | null | undefined, t: PrekladFn): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return t('právě teď');
  if (min < 60) return t('před {n} min', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('před {n} h', { n: h });
  const dny = Math.round(h / 24);
  return t('před {n, plural, one {# dnem} few {# dny} other {# dny}}', { n: dny });
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
  const t = useT('widgety');
  const [pracuji, setPracuji] = useState(false);
  const [chyba, setChyba] = useState('');
  return (
    <NadPlochou>
      <Modal open onClose={onZavrit} size="sm" title={titulek}
        footer={<>
          <Button variant="secondary" onClick={onZavrit}>{t('Zrušit', undefined, 'dialog')}</Button>
          <Button variant="danger-solid" loading={pracuji} onClick={async () => {
            setPracuji(true); setChyba('');
            try { await onPotvrdit(); onZavrit(); }
            catch (e) { setChyba(apiMessage(e, t('Nepodařilo se to uložit.'))); setPracuji(false); }
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
  const t = useT('widgety');
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

  // Nic nedochází = vyřízeno: plocha widget v klidu minimalizuje (kolo 71).
  // Prázdný sklad NENÍ vyřízeno (to je nezačaté nastavení podniku) a se
  // zvolenou kategorií se čeká i na seznam kategorií (bez něj se nefiltruje).
  useVyrizeno(
    sklad.data != null && sklad.data.length > 0 && !ztracena && (katId == null || kategorie.data != null) && polozky.length === 0,
    nastaveni.jen_kriticke ? t('Nic není kriticky málo') : vybrana ? t('V kategorii {nazev} je všeho dost', { nazev: vybrana.nazev }) : t('Zásoby jsou v pořádku'),
  );

  // Odkaz vede do vybrané kategorie (Sklad ji hledá podle jména), jinak na celý sklad.
  const smiSklad = nav.smiPohled('inventory');
  const doSkladu = (kat?: string | null) => { if (!nahled && smiSklad) nav.onNavigate('inventory', kat ?? undefined); };

  const prazdno = ztracena
    ? <p className="t-meta">{t('Vybraná kategorie už ve skladu není. Vyber jinou v nastavení widgetu.')}</p>
    : sklad.data && sklad.data.length === 0
      ? <p className="t-meta">{t('Ve skladu zatím nic není.')}</p>
      : sklad.data && polozky.length === 0
        ? <p className="t-meta">{nastaveni.jen_kriticke ? t('Nic není kriticky málo.') : vybrana ? t('V kategorii {nazev} je všeho dost.', { nazev: vybrana.nazev }) : t('Zásoby jsou v pořádku.')}</p>
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
          ? <Stat label={t('Kriticky málo')} value={cislo(kritickych)} note={dochazi > 0 ? t('dochází dalších {n}', { n: cislo(dochazi) }) : undefined} />
          : <Stat label={t('Dochází')} value={cislo(dochazi)} note={t('{n, plural, one {položka} few {položky} other {položek}}', { n: dochazi })} />}
      </Widget>
    );
  }

  const strop = velikost === 'M' ? 5 : 15;
  const ukazat = polozky.slice(0, strop);
  const radek = (p: Polozka, metaKategorie: boolean) => (
    <li key={p.id}>
      <ListRow
        as="div"
        lead={<span className={`w-2 h-2 rounded-full shrink-0 ${p.kriticke ? 'bg-bad' : 'bg-wait'}`} aria-hidden />}
        title={p.nazev}
        // Množství jde do meta tónovaným textem, ne jako chip do ocasu: na
        // telefonu se ocas s chipem i šipkou zalamoval každý na vlastní
        // řádek a tři položky zabraly přes 400 px.
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
      const nazev = p.kategorie ?? t('Bez kategorie');
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
      odkaz={{ popisek: vybrana?.nazev ?? t('Sklad'), pohled: 'inventory', arg: vybrana?.nazev }}
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
      {polozky.length > strop && <p className="t-meta mt-2">{aDalsich(polozky.length - strop, t)}</p>}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Nákupní seznam
// ---------------------------------------------------------------------------

type NastaveniNakupu = { dodavatel: string | number | null; jen_kriticke: boolean };

function NakupniSeznam({ velikost, nastaveni, nahled }: WidgetProps<NastaveniNakupu>) {
  const t = useT('widgety');
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
      r.naVyrobu.length > 0 ? t('na výrobu: {suroviny}', { suroviny: r.naVyrobu.join(', ') }) : null,
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
      odkaz={{ popisek: t('Sklad'), pohled: 'inventory' }}
      prazdno={sklad.data && radky.length === 0
        ? <p className="t-meta">{dodavatel ? t('Od dodavatele {dodavatel} teď nic nechybí.', { dodavatel }) : t('Není co kupovat — všechno je nad limitem.')}</p>
        : undefined}
    >
      {L ? (
        <div className="space-y-4">
          {poDodavatelich(ukazat).map(s => (
            <section key={s.dodavatel ?? '-'} aria-label={s.dodavatel ?? t('Bez dodavatele')}>
              <p className="t-label">{s.dodavatel ?? t('Bez dodavatele')}</p>
              <ul className="list mt-1">{s.radky.map(r => radek(r, false))}</ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="list">{ukazat.map(r => radek(r, !dodavatel))}</ul>
      )}
      {radky.length > strop && <p className="t-meta mt-2">{aDalsich(radky.length - strop, t)}</p>}
      {(L || smiObjednat) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {L && smiCeny && odhad > 0 ? <p className="t-meta">{t('Odhad nákupu {castka}', { castka: money(odhad) })}</p> : <span />}
          {smiObjednat && (
            <Button variant="secondary" size="sm" icon="cart"
              onClick={() => { if (!nahled) pozadejSklad(nav, UDALOST_NAKUP, KLIC_NAKUP, { dodavatel }); }}>
              {t('Objednat')}
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
  const t = useT('widgety');
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
  const note = data && data.bezCeny > 0 ? t('{n, plural, one {# položka} few {# položky} other {# položek}} bez ceny', { n: data.bezCeny }) : t('podle nákupních cen');

  return (
    <Widget
      nacteni={ceka ? CEKA : [sklad, finance]}
      kostra={velikost === 'S' ? 'cislo' : 'seznam'}
      otevrit={velikost === 'S' && smiSklad && !nahled ? () => nav.onNavigate('inventory') : undefined}
      odkaz={velikost === 'M' ? { popisek: t('Sklad'), pohled: 'inventory' } : undefined}
      prazdno={data && data.hodnota === 0 ? <p className="t-meta">{t('Položky zatím nemají nákupní cenu.')}</p> : undefined}
    >
      {data && (
        <>
          <Stat label={t('Na regálech')} value={money(data.hodnota)} note={note} />
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
  const t = useT('widgety');
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
    if (selhalo) z.chyba(selhalo === ids.length ? t('Schválení se nepodařilo.') : t('{selhalo} z {celkem} se neuložilo — zkus to znovu.', { selhalo, celkem: cislo(ids.length) }));
    else { z.ok(ids.length > 1 ? t('Schváleno: {n, plural, one {# návrh} few {# návrhy} other {# návrhů}}.', { n: ids.length }) : t('Schváleno — položka je ve skladu.')); vyber.exit(); }
  };
  const zamitni = async (polozky: PolozkaSkladu[]) => {
    const vysledky = await Promise.allSettled(polozky.map(x => zamitniNavrh(x.id)));
    obnovSklad();
    const selhalo = vysledky.filter(v => v.status === 'rejected').length;
    if (selhalo === polozky.length) throw new Error(t('Zamítnutí se nepodařilo.'));
    if (selhalo) z.chyba(t('{selhalo} z {celkem} se nezamítlo — zkus to znovu.', { selhalo, celkem: cislo(polozky.length) }));
    else z.ok(polozky.length > 1 ? t('Zamítnuto: {n, plural, one {# návrh} few {# návrhy} other {# návrhů}}.', { n: polozky.length }) : t('Návrh zamítnut.'));
    vyber.exit();
  };

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : data} kostra="cislo" prazdno={data.data && navrhy.length === 0 ? null : undefined}
        otevrit={nav.smiPohled('inventory') && !nahled ? () => nav.onNavigate('inventory') : undefined}>
        <Stat label={t('Čeká na schválení')} value={cislo(navrhy.length)} note={t('{n, plural, one {návrh} few {návrhy} other {návrhů}}', { n: navrhy.length })} />
      </Widget>
    );
  }

  return (
    <>
      <Widget
        nacteni={ceka ? CEKA : data}
        kostra="seznam"
        doplnek={navrhy.length > 0 ? <Chip tone="wait" size="sm">{cislo(navrhy.length)}</Chip> : undefined}
        odkaz={{ popisek: t('Sklad'), pohled: 'inventory' }}
        // Nic nečeká = dobrá zpráva; v klidu se karta nekreslí (dřív taky ne).
        prazdno={data.data && navrhy.length === 0 ? null : undefined}
      >
        <ul className="list">
          {navrhy.slice(0, strop).map(p => (
            <li key={p.id}>
              <ListRow as="div"
                lead={vyber.selecting ? (
                  <SelectBox checked={vyber.has(p.id)} onChange={() => vyber.toggle(p.id)} label={t('Vybrat návrh — {nazev}', { nazev: p.name })} />
                ) : p.photoUrl ? (
                  <a href={p.photoUrl} target="_blank" rel="noreferrer" className="block shrink-0" aria-label={t('Fotka: {nazev}', { nazev: p.name })}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.photoUrl} alt="" className="h-9 w-9 rounded-xl object-cover" />
                  </a>
                ) : (
                  <span className="well h-9 w-9 grid place-items-center text-black/55"><Icon name="box" size={16} /></span>
                )}
                title={p.name}
                meta={[
                  `${mnozstvi(Number(p.quantity) || 0)} ${p.unit ?? ''}`.trim(),
                  p.category || t('bez kategorie'),
                  p.submittedByName ? t('zapsal/a {jmeno}', { jmeno: p.submittedByName }) : t('zapsal někdo z týmu'),
                ].join(' · ')}
                actions={vyber.selecting ? undefined : <>
                  {smiSchvalit && (
                    <Button variant="primary" size="sm" loading={pracuji === p.id} disabled={pracuji != null}
                      onClick={() => { if (!nahled) void schval([p.id]); }}>{t('Schválit')}</Button>
                  )}
                  {smiZamitnout && (
                    <Button variant="danger" size="sm" disabled={pracuji != null}
                      onClick={() => { if (!nahled) setZamitam([p]); }}>{t('Zamítnout')}</Button>
                  )}
                </>}
              />
            </li>
          ))}
        </ul>
        {navrhy.length > strop && <p className="t-meta mt-2">{aDalsich(navrhy.length - strop, t)}</p>}
        {/* „Vybrat víc" se ukáže, až je co vybírat (DP §3.19). */}
        {(smiSchvalit || smiZamitnout) && navrhy.length > 1 && !vyber.selecting && (
          <div className="mt-3 flex justify-end">
            <Button variant="secondary" size="sm" icon="check" disabled={pracuji != null}
              onClick={() => { if (!nahled) vyber.start(); }}>{t('Vybrat víc')}</Button>
          </div>
        )}
      </Widget>
      {vyber.selecting && !nahled && (
        <NadPlochou>
          <BulkBar
            count={vyber.count}
            totalLabel={t('Vybrat vše ({n})', { n: navrhy.length })}
            onSelectAll={() => vyber.selectAll(navrhy.map(p => p.id))}
            onExit={vyber.exit}
            actions={[
              ...(smiSchvalit ? [{ label: t('Schválit'), primary: true, onClick: () => { void schval(Array.from(vyber.selected)); } }] : []),
              ...(smiZamitnout ? [{ label: t('Zamítnout'), danger: true, onClick: () => setZamitam(navrhy.filter(p => vyber.has(p.id))) }] : []),
            ]}
          />
        </NadPlochou>
      )}
      {zamitam && zamitam.length > 0 && (
        <Potvrzeni titulek={zamitam.length === 1 ? t('Zamítnout „{nazev}"?', { nazev: zamitam[0].name }) : t('Zamítnout {n, plural, one {# návrh} few {# návrhy} other {# návrhů}}?', { n: zamitam.length })} akce={t('Zamítnout')}
          text={t('Návrh se smaže ze skladu. Kdo ho zapsal, ho uvidí zmizet.')}
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
  const t = useT('widgety');
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
      z.ok(t('Hlášení vyřízeno.'));
    } catch (e) {
      z.chyba(apiMessage(e, t('Nepodařilo se to uložit.')));
    }
    setPracuji(null);
  };

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : data} kostra="cislo"
        otevrit={nav.smiPohled('inventory') && !nahled ? () => nav.onNavigate('inventory') : undefined}>
        <Stat label={t('Nevyřízeno')} value={cislo(nova.length)} note={nova.length === 0 ? t('vše vyřízeno') : t('{n, plural, one {hlášení} few {hlášení} other {hlášení}} od týmu', { n: nova.length })} />
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
        odkaz={{ popisek: t('Sklad'), pohled: 'inventory' }}
        prazdno={data.data && nova.length === 0 ? <p className="t-meta">{t('Žádné nové hlášení — tým nic nehlásí.')}</p> : undefined}
      >
        <ul className="list">
          {nova.slice(0, strop).map(h => (
            <li key={h.id}>
              <ListRow as="div"
                lead={<Avatar emoji={h.avatar} name={h.autor} size="sm" />}
                title={h.polozky.length > 0 ? h.polozky.join(', ') : t('Bez položek')}
                meta={[h.autor, pred(h.kdy, t), h.poznamka ? `„${h.poznamka}"` : null].filter(Boolean).join(' · ')}
                actions={
                  <Button variant="primary" size="sm" loading={pracuji === h.id} disabled={pracuji != null}
                    onClick={() => { if (!nahled) void vyrizeno(h); }}>{t('Vyřízeno')}</Button>
                }
              />
            </li>
          ))}
        </ul>
        {nova.length > strop && <p className="t-meta mt-2">{aDalsich(nova.length - strop, t)}</p>}
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
  const t = useT('widgety');
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
    catch (e) { setChyba(apiMessage(e, t('Příjem se nepodařil.'))); setPracuji(false); }
  };
  return (
    <NadPlochou>
      <Modal open onClose={onZavrit} size="sm"
        title={o.dodavatel ? t('Přišlo od {dodavatel}?', { dodavatel: o.dodavatel }) : t('Přišla objednávka?')}
        subtitle={`${t('Objednáno {kdy}', { kdy: pred(o.vytvoreno, t) })}${o.autor ? ` · ${o.autor}` : ''}`}
        footer={<>
          <Button variant="secondary" disabled={pracuji} onClick={onZavrit}>{t('Zavřít')}</Button>
          <Button variant="primary" loading={pracuji} disabled={spatne} onClick={potvrdit}>{t('Přijmout a naskladnit')}</Button>
        </>}>
        <div className="space-y-4">
          <ul className="list" aria-label={t('Položky objednávky')}>
            {o.polozky.map((p, i) => (
              <ListRow key={i} title={p.nazev} value={`${mnozstvi(p.mnozstvi)} ${p.jednotka}`.trim()} />
            ))}
          </ul>
          {smiCenu && (
            <Field id={`sklad-prijem-cena-${o.id}`} label={t('Celková cena (nepovinné)')}
              hint={spatne ? undefined : t('Z ceny počítají Finance výdaje za zboží.')}
              error={spatne ? t('Zadej částku, například 1 250.') : undefined}>
              <Input id={`sklad-prijem-cena-${o.id}`} inputMode="decimal" value={cena} placeholder={t('např. {castka}', { castka: money(1250) })}
                onChange={e => setCena(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void potvrdit(); } }} />
            </Field>
          )}
          <p className="t-meta">{t('Přijetí přičte objednané množství ke skladu.')}</p>
          {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
          {/* Zrušení je destruktivní a vzácné — stranou pod obsahem, ne vedle
              hlavní akce v patičce (na telefonu by se tři tlačítka nevešla). */}
          <Button variant="danger" size="sm" icon="close" disabled={pracuji} onClick={onZrusit}>{t('Zrušit objednávku…')}</Button>
        </div>
      </Modal>
    </NadPlochou>
  );
}

function Objednavky({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
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
    z.ok(o.dodavatel
      ? t('Přijato od {dodavatel} — naskladněno {n, plural, one {# položka} few {# položky} other {# položek}}.', { dodavatel: o.dodavatel, n })
      : t('Přijato — naskladněno {n, plural, one {# položka} few {# položky} other {# položek}}.', { n }));
  };
  const smazat = async (o: Objednavka) => {
    const res = await fetch(`${URL_OBJEDNAVKY}?id=${o.id}`, { method: 'DELETE' });
    await okJson(res);
    obnovDataWidgetu(URL_OBJEDNAVKY);
    obnovDataWidgetu('/api/finance');
    z.ok(t('Objednávka smazána z historie.'));
  };

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : data} kostra="cislo"
        otevrit={nav.smiPohled('inventory') && !nahled ? () => nav.onNavigate('inventory') : undefined}>
        <Stat label={t('Čeká na příjem')} value={cislo(cekajici.length)} note={cekajici.length === 0 ? t('nic nečeká') : t('{n, plural, one {objednávka} few {objednávky} other {objednávek}}', { n: cekajici.length })} />
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
        odkaz={{ popisek: t('Sklad'), pohled: 'inventory' }}
        // Prázdno jen ve středním: velký má pod tím historii a útratu.
        prazdno={!L && data.data && cekajici.length === 0 ? <p className="t-meta">{t('Žádná objednávka nečeká na příjem.')}</p> : undefined}
      >
        {cekajici.length === 0 && L && <p className="t-meta">{t('Žádná objednávka nečeká na příjem.')}</p>}
        <ul className="list">
          {cekajici.slice(0, strop).map(o => {
            const obsah = L
              ? o.polozky.map(p => `${p.nazev} ${mnozstvi(p.mnozstvi)} ${p.jednotka}`.trim()).join(', ')
              : t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: o.polozky.length });
            return (
              <li key={o.id}>
                {/* Přijmout je v řádku i ve středním widgetu — výchozí Sklad vedení
                    ho má ve velikosti M a příjem je hlavní důvod, proč tu widget je
                    (dřív tlačítko „Přišlo" přímo na stránce). Zrušit je v okně
                    příjmu, ať řádek nese nejvýš jednu akci a vejde se na telefon. */}
                <ListRow as="div"
                  title={o.dodavatel ?? t('Bez dodavatele')}
                  meta={[pred(o.vytvoreno, t), obsah].filter(Boolean).join(' · ')}
                  value={smiCenu && o.cena != null ? money(o.cena) : undefined}
                  actions={smiPrijmout ? (
                    <Button variant="primary" size="sm" onClick={() => { if (!nahled) setPrijimam(o); }}>{t('Přijmout')}</Button>
                  ) : undefined}
                />
              </li>
            );
          })}
        </ul>
        {cekajici.length > strop && <p className="t-meta mt-2">{aDalsich(cekajici.length - strop, t)}</p>}
        {L && utrata > 0 && (
          <p className="t-meta mt-3">{t('Tento měsíc utraceno za zboží:')} <span className="font-semibold text-[#16181A] tabular-nums">{money(utrata)}</span></p>
        )}
        {L && hist.length > 0 && (
          <div className="mt-3">
            <Button variant="ghost" size="sm" iconAfter="chevron" aria-expanded={ukazHistorii}
              className={ukazHistorii ? '[&>svg]:rotate-180' : ''}
              onClick={() => setUkazHistorii(v => !v)}>
              {t('Historie ({n})', { n: cislo(hist.length) })}
            </Button>
            {ukazHistorii && (
              <>
                <ul className="list mt-1" aria-label={t('Historie objednávek')}>
                  {hist.slice(0, stropHistorie).map(o => (
                    <li key={o.id}>
                      <ListRow as="div"
                        title={o.dodavatel ?? t('Bez dodavatele')}
                        meta={<>
                          <span className={o.stav === 'received' ? 'text-ok-ink' : 'text-bad-ink'}>{o.stav === 'received' ? t('Přijato') : t('Zrušeno')}</span>
                          {` · ${datumKratce(o.prijata ?? o.vytvoreno)}`}
                        </>}
                        value={smiCenu && o.cena != null && o.cena > 0 ? money(o.cena) : undefined}
                        actions={smiMazat ? (
                          <Button variant="ghost" size="sm" iconOnly icon="trash" className="tap-target-sm"
                            aria-label={t('Smazat z historie: {kdo} {datum}', { kdo: o.dodavatel ?? t('objednávka bez dodavatele'), datum: datumKratce(o.prijata ?? o.vytvoreno) })}
                            onClick={() => { if (!nahled) setMazu(o); }} />
                        ) : undefined}
                      />
                    </li>
                  ))}
                </ul>
                {hist.length > stropHistorie && <p className="t-meta mt-2">{aDalsich(hist.length - stropHistorie, t)}</p>}
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
        <Potvrzeni titulek={rusim.dodavatel ? t('Zrušit objednávku u {dodavatel}?', { dodavatel: rusim.dodavatel }) : t('Zrušit objednávku?')} akce={t('Zrušit objednávku')}
          text={t('Nic se nenaskladní. Dodavateli dej vědět sám — aplikace mu nic neposílá.')}
          onZavrit={() => setRusim(null)}
          onPotvrdit={async () => { await zmen(rusim, 'cancelled'); z.ok(t('Objednávka zrušena.')); }} />
      )}
      {mazu && (
        <Potvrzeni titulek={t('Smazat objednávku z historie?')} akce={t('Smazat')}
          text={mazu.stav === 'received' && mazu.cena ? t('Zmizí i z výdajů ve Financích. Naskladněné zboží ve skladu zůstane.') : t('Záznam zmizí z historie. Sklad se nemění.')}
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
  const t = useT('widgety');
  const nav = useNavigace();
  const smi = useSmi();
  const def = widget('sklad.chybi_udaje');
  // N4: brána chce receptury.zobrazit I sklad.ceny (useBrana čte `vse` jako
  // „všechny"). Bez cen je unitCost maskovaný null a widget by hlásil
  // chybějící cenu u každé suroviny z receptur.
  const { ok, ceka } = useBrana('sklad.chybi_udaje');
  const sklad = useDataWidgetu<PolozkaSkladu[]>(ok ? URL_SKLAD : null, vyberSklad);
  const CHYBI_TEXT: Record<string, string> = { 'cena i balení': t('cena i balení'), 'cena': t('cena'), 'velikost balení': t('velikost balení') }; // i18n-ok: klíče jsou české popisky z lib/skladPrehled
  const usage = useDataWidgetu<Record<string, unknown[]>>(ok ? '/api/pos/usage' : null, vyberUsage);
  const radky = useMemo(() => chybiUdaje(sklad.data ?? [], usage.data), [sklad.data, usage.data]);
  const smiDoplnit = smi(pole(def, 'akce:doplnit') ?? ['sklad.upravit', 'sklad.ceny_upravit']) && nav.smiPohled('inventory');
  const hotovo = sklad.data != null && usage.data != null;

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : [sklad, usage]} kostra="cislo" prazdno={hotovo && radky.length === 0 ? null : undefined}
        otevrit={nav.smiPohled('inventory') && !nahled ? () => nav.onNavigate('inventory') : undefined}>
        <Stat label={t('K doplnění')} value={cislo(radky.length)} note={t('{n, plural, one {surovina} few {suroviny} other {surovin}}', { n: radky.length })} />
      </Widget>
    );
  }

  const strop = 6;
  return (
    <Widget
      nacteni={ceka ? CEKA : [sklad, usage]}
      kostra="seznam"
      doplnek={radky.length > 0 ? <Chip tone="wait" size="sm">{cislo(radky.length)}</Chip> : undefined}
      odkaz={{ popisek: t('Sklad'), pohled: 'inventory' }}
      // Všechno doplněné = dobrá zpráva, karta se v klidu nekreslí (jako dřív blok).
      prazdno={hotovo && radky.length === 0 ? null : undefined}
    >
      <ul className="list">
        {radky.slice(0, strop).map(r => (
          <li key={r.id}>
            <ListRow as="div" title={r.nazev}
              meta={<>
                <span className="font-medium text-wait-ink">{t('chybí {co}', { co: CHYBI_TEXT[r.chybi] })}</span>
                {` · ${t('kasa ho používá v {n, plural, one {# produktu} few {# produktech} other {# produktech}}', { n: r.produktu })}`}
              </>}
              onClick={smiDoplnit && !nahled ? () => pozadejSklad(nav, UDALOST_UPRAVIT, KLIC_UPRAVIT, { id: r.id }) : undefined} />
          </li>
        ))}
      </ul>
      {radky.length > strop && <p className="t-meta mt-2">{aDalsich(radky.length - strop, t)}</p>}
      <p className="t-meta mt-2">{t('Dokud chybí, nespočítá se marže produktů, které je používají, a odpis nebere z načatého balení.')}</p>
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Poslední pohyby skladu
// ---------------------------------------------------------------------------

type NastaveniPohybu = { druh: DruhPohybu };

function PosledniPohyby({ velikost, nastaveni }: WidgetProps<NastaveniPohybu>) {
  const t = useT('widgety');
  const { ok, ceka } = useBrana('sklad.posledni_pohyby');
  const data = useDataWidgetu<Pohyb[]>(ok ? '/api/inventory/log' : null, raw => vyberPohyby(raw));
  const druh: DruhPohybu = nastaveni.druh === 'rucni' || nastaveni.druh === 'prodej_z_kasy' ? nastaveni.druh : 'vse';
  const pohyby = useMemo(() => (data.data ?? []).filter(p => druh === 'vse' || (druh === 'prodej_z_kasy' ? p.zKasy : !p.zKasy)), [data.data, druh]);
  const strop = velikost === 'L' ? 20 : 5;
  const zmena = (p: Pohyb) => {
    // Pohyb jen v načatém balení (odpis 0,04 l z lahve): počet kusů se nezmění.
    const n = p.zmena !== 0 ? p.zmena : p.zmenaNacate ?? 0;
    return `${n > 0 ? '+' : n < 0 ? '−' : ''}${mnozstvi(Math.abs(n))}${p.zmena === 0 && p.zmenaNacate != null ? ` ${t('z načatého')}` : ` ${p.jednotka}`}`;
  };

  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      kostra="seznam"
      prazdno={data.data && pohyby.length === 0 ? <p className="t-meta">{t('Zatím žádné pohyby.')}</p> : undefined}
    >
      <ul className="list">
        {pohyby.slice(0, strop).map(p => (
          <ListRow key={p.id} title={p.polozka}
            meta={[p.kdo ?? (p.zKasy ? t('kasa') : null), pred(p.kdy, t), p.poznamka].filter(Boolean).join(' · ')}
            value={<span className={p.zmena > 0 ? 'text-ok-ink' : undefined}>{zmena(p)}</span>} />
        ))}
      </ul>
      {pohyby.length > strop && <p className="t-meta mt-2">{aDalsich(pohyby.length - strop, t)}</p>}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Inventura
// ---------------------------------------------------------------------------

const URL_INVENTURA = '/api/stocktake';

function Inventura({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
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
    ? <Button variant="secondary" size="sm" icon="clipboard" onClick={otevri}>{t('Pokračovat v počítání')}</Button>
    : smiZahajit ? <Button variant="secondary" size="sm" icon="clipboard" onClick={otevri}>{t('Zahájit inventuru')}</Button> : null);

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
            ? <Stat label={t('Inventura běží')} value={`${cislo(s.spocitano)}/${cislo(s.celkem)}`} note={t('spočítáno')} />
            : <Stat label={t('Poslední inventura')} value={s.posledni ? datumKratce(s.posledni) : t('Zatím žádná')} />
        ) : (
          <div className="space-y-3">
            {s.bezi ? (
              <>
                <p className="text-[15px] text-[#16181A]">
                  {t('Běží inventura · spočítáno')} <span className="font-semibold tabular-nums">{t('{spocitano} z {celkem}', { spocitano: cislo(s.spocitano), celkem: cislo(s.celkem) })}</span>
                </p>
                <div className="h-2 rounded-full bg-black/[0.06] overflow-hidden" role="progressbar" aria-label={t('Spočítáno')}
                  aria-valuemin={0} aria-valuemax={s.celkem} aria-valuenow={s.spocitano}>
                  <div className="h-full rounded-full bg-[#16181A]" style={{ width: `${s.celkem ? Math.round((s.spocitano / s.celkem) * 100) : 0}%` }} />
                </div>
                <p className="t-meta">{t('Zahájena {kdy}.', { kdy: pred(s.zahajena, t) })}{smiDokoncit ? ` ${t('Po spočítání zapiš rozdíly do skladu.')}` : ` ${t('Rozdíly do skladu zapíše vedení.')}`}</p>
              </>
            ) : (
              <p className="t-meta">{s.posledni ? t('Poslední inventura byla {datum}.', { datum: datumKratce(s.posledni) }) : t('Inventura ještě nebyla.')}{smiZahajit ? '' : ` ${t('Zahajuje ji vedení.')}`}</p>
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
  const t = useT('widgety');
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
            <p className="t-meta">{t('Přišlo zboží? Vyfoť ho a napiš kolik.')}{navrh ? ` ${t('Vedení zápis jen potvrdí.')}` : ''}</p>
          )}
          <Button variant="secondary" size="sm" icon="plus" className={velikost === 'S' ? 'w-full justify-center' : ''}
            onClick={() => { if (!nahled) setOkno(true); }}>
            {t('Zapsat novou věc')}
          </Button>
        </div>
      </Widget>
      {okno && (
        <NadPlochou>
          <Modal open onClose={() => setOkno(false)} size="md" title={t('Nová věc do skladu')}
            subtitle={navrh ? t('Počítá se hned, vedení ji jen potvrdí.') : t('Položka se hned objeví ve skladu.')}>
            <NewStockEntry
              onSaved={() => { setOkno(false); obnovSklad(); z.ok(navrh ? t('Zapsáno do skladu — vedení to potvrdí.') : t('Zapsáno do skladu.')); }}
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
  const t = useT('widgety');
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
      setChyba(apiMessage(e, t('Hlášení se nepodařilo odeslat.')));
      setPracuji(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="md" title={t('Nahlásit chybějící')} subtitle={t('Vedení dostane upozornění se seznamem.')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Zrušit', undefined, 'dialog')}</Button>
        <Button variant="primary" loading={pracuji} disabled={vybrane.length === 0} onClick={odeslat}>
          {vybrane.length > 0 ? t('Odeslat ({n, plural, one {# položka} few {# položky} other {# položek}})', { n: vybrane.length }) : t('Odeslat hlášení')}
        </Button>
      </>}>
      <div className="space-y-4">
        <SearchField value={hledat} onChange={setHledat} placeholder={t('Hledat položku…')} ariaLabel={t('Hledat položku k nahlášení')} />
        {sklad.error ? (
          <p className="note note-danger" role="alert">{t('Sklad se nenačetl. Zavři okno a zkus to znovu.')}</p>
        ) : sklad.data == null ? (
          <p className="t-meta">{t('Načítám sklad…')}</p>
        ) : polozky.length === 0 ? (
          <p className="t-meta">{t('Nic neodpovídá hledání.')}</p>
        ) : (
          <ul className="list max-h-72 overflow-y-auto scrollbar-thin" aria-label={t('Položky')}>
            {polozky.slice(0, 60).map(p => {
              const stav = stavZasoby(p);
              return (
                <ListRow key={p.id}
                  lead={<SelectBox checked={vybrane.includes(p.id)} onChange={() => prepni(p.id)} label={t('Nahlásit {nazev}', { nazev: p.name })} />}
                  title={p.name} meta={p.category || undefined}
                  right={stav !== 'ok'
                    ? <Chip tone={stav === 'critical' ? 'bad' : 'wait'} size="sm" className="tabular-nums">{mnozstvi(Number(p.quantity) || 0)} {p.unit ?? ''}</Chip>
                    : undefined} />
              );
            })}
          </ul>
        )}
        <Field id="sklad-nahlasit-poznamka" label={t('Poznámka (volitelné)')}>
          <Textarea id="sklad-nahlasit-poznamka" rows={2} value={poznamka} onChange={e => setPoznamka(e.target.value)} />
        </Field>
        {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
      </div>
    </Modal>
  );
}

function Nahlasit({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
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
                ? t('Dochází {n, plural, one {# položka} few {# položky} other {# položek}}: {seznam}', { n: nizke.length, seznam: `${nizke.slice(0, 3).map(p => p.name).join(', ')}${nizke.length > 3 ? '…' : ''}` })
                : t('Něco došlo? Vyber, co chybí, a vedení dostane upozornění.')}
            </p>
          )}
          <Button variant="secondary" size="sm" icon="send" className={velikost === 'S' ? 'w-full justify-center' : ''}
            onClick={() => { if (!nahled) setOkno(true); }}>
            {t('Nahlásit chybějící')}
          </Button>
        </div>
      </Widget>
      {okno && (
        <NadPlochou>
          <OknoNahlasit onClose={() => setOkno(false)}
            onOdeslano={n => { setOkno(false); z.ok(t('Nahlášeno: {n, plural, one {# položka} few {# položky} other {# položek}}. Vedení dostalo upozornění.', { n })); }} />
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
  const t = useT('widgety');
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
    ? <p className="t-meta">{t('Vyber kategorii v nastavení widgetu.')}</p>
    : kategorie.data && !vybrana
      ? <p className="t-meta">{t('Vybraná kategorie už ve skladu není. Vyber jinou v nastavení widgetu.')}</p>
      : undefined;

  if (velikost === 'S') {
    return (
      <Widget titulek={vybrana?.nazev} nacteni={ceka ? CEKA : [sklad, kategorie]} kostra="cislo"
        otevrit={vybrana && smiSklad && !nahled ? doKategorie : undefined} prazdno={prazdno}>
        {souhrn && (souhrn.kriticke > 0
          ? <Stat label={t('Kriticky málo')} value={cislo(souhrn.kriticke)} note={t('z {n, plural, one {# položky} few {# položek} other {# položek}}', { n: souhrn.polozek })} />
          : <Stat label={t('Dochází')} value={cislo(souhrn.dochazi)} note={t('z {n, plural, one {# položky} few {# položek} other {# položek}}', { n: souhrn.polozek })} />)}
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
      odkaz={vybrana ? { popisek: t('Otevřít'), pohled: 'inventory', arg: vybrana.nazev } : undefined}
      prazdno={prazdno ?? (souhrn && souhrn.nizke.length === 0
        ? <p className="t-meta">{souhrn.polozek === 0 ? t('V kategorii zatím nic není.') : t('Všeho je dost ({n, plural, one {# položka} few {# položky} other {# položek}}).', { n: souhrn.polozek })}</p>
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
          {souhrn.nizke.length > strop && <p className="t-meta mt-2">{aDalsich(souhrn.nizke.length - strop, t)}</p>}
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

function metaVyroby(e: ToMake, t: PrekladFn): string {
  const casti = [t('{n}× dávka', { n: cislo(e.batches) }), t('zbývá {mnozstvi} {jednotka}', { mnozstvi: mnozstvi(e.item.available), jednotka: e.item.recipeUnit })];
  if (e.lines.length > 0) casti.push(e.ready ? t('suroviny jsou') : t('chybí {n, plural, one {# surovina} few {# suroviny} other {# surovin}}', { n: e.missing.length }));
  return casti.join(' · ');
}

function OknoVyrobeno({ polozka, onClose, onHotovo }: { polozka: ToMake; onClose: () => void; onHotovo: (zprava: string) => void }) {
  const t = useT('widgety');
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
      const odepsano = seznam(d?.consumed).length > 0;
      const hodnoty = { nazev: item.name, pridano: Number.isFinite(pridano) ? `+${mnozstvi(pridano)} ${d?.unit ?? item.unit}` : '' };
      onHotovo(Number.isFinite(pridano)
        ? (odepsano ? t('{nazev}: {pridano} naskladněno, suroviny odepsány.', hodnoty) : t('{nazev}: {pridano} naskladněno.', hodnoty))
        : (odepsano ? t('{nazev}: naskladněno, suroviny odepsány.', hodnoty) : t('{nazev}: naskladněno.', hodnoty)));
    } catch (e) {
      setChyba(apiMessage(e, t('Nepodařilo se zapsat.')));
      setPracuji(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="md" title={t('Vyrobeno: {nazev}', { nazev: item.name })} subtitle={t('Naskladní se dávka a suroviny se odepíšou.')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Zrušit', undefined, 'dialog')}</Button>
        <Button variant="primary" onClick={potvrdit} loading={pracuji}>{t('Vyrobeno, naskladnit')}</Button>
      </>}>
      <div className="space-y-4">
        <Well pad="md" className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="t-label">{t('Dávek')}</p>
            <p className="t-meta mt-0.5">
              {polozka.batchYield
                ? t('{davka} {jednotka} na dávku, celkem +{celkem} {jednotka}', { davka: mnozstvi(polozka.batchYield), jednotka: item.unit, celkem: mnozstvi(polozka.batchYield * davek) })
                : `+${cislo(davek)} ${item.unit}`}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="secondary" size="sm" iconOnly icon="minus" aria-label={t('Méně dávek')}
              disabled={davek <= 1} onClick={() => setDavek(b => Math.max(1, b - 1))} />
            <span className="w-10 text-center text-[18px] font-semibold tabular-nums" aria-live="polite">{davek}</span>
            <Button variant="secondary" size="sm" iconOnly icon="plus" aria-label={t('Více dávek')}
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
                  meta={t('odepíše se {odepise} {jednotka} · ve skladu {sklad} {jednotka}', { odepise: mnozstvi(odepise), jednotka: l.unit, sklad: mnozstvi(l.available) })}
                  right={<Chip tone={chybi ? 'bad' : 'ok'} size="sm">{chybi ? t('nestačí') : t('je')}</Chip>} />
              );
            })}
          </ul>
        )}
        {nestaci.length > 0 && (
          <p className="note note-wait text-[13px]">{t('Některé suroviny nestačí. Jestli se vyrobilo i tak, sklad se u nich jen vynuluje — přesné množství doplň u položky.')}</p>
        )}
        {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
      </div>
    </Modal>
  );
}

/** Rozbalený detail ve velkém widgetu: suroviny a postup (návod má přednost před textem). */
function DetailVyroby({ e, nahled }: { e: ToMake; nahled: boolean }) {
  const t = useT('widgety');
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
              <span className="shrink-0 text-black/55 tabular-nums">{t('ve skladu {mnozstvi} {jednotka}', { mnozstvi: mnozstvi(l.available), jednotka: l.unit })}</span>
              <span className="sr-only">{l.missing > 0 ? t('chybí') : t('je')}</span>
            </li>
          ))}
        </ul>
      )}
      {/* Návod má přednost před textem: je schválený, má kroky a dá se
          u něj potvrdit přečtení. */}
      {smiNavod ? (
        <Button variant="secondary" size="sm" icon="book"
          onClick={() => { if (!nahled) nav.onNavigate('guides', String(e.guideId)); }}>
          {e.guideTitle ? t('Návod: {nazev}', { nazev: e.guideTitle }) : t('Otevřít návod')}
        </Button>
      ) : e.steps ? (
        <p className="text-[13px] text-black/60 whitespace-pre-wrap">{e.steps}</p>
      ) : e.lines.length === 0 ? (
        <p className="t-meta">{t('Bez receptury — vedení ji nastaví u položky ve skladu.')}</p>
      ) : null}
    </Well>
  );
}

function KVyrobe({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
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
        odkaz={{ popisek: t('Úkoly'), pohled: 'tasks' }}
        // Není co vyrábět = dobrá zpráva a dřív se karta nekreslila vůbec;
        // v klidu tak zůstane, v úpravách ukáže „Teď tu nic není."
        prazdno={data.data && seznamVyroby.length === 0 ? null : undefined}
      >
        <ul className="list">
          {ukazat.map(e => {
            const otevreno = L && rozbaleno === e.taskId;
            const vyrobeno = (
              <Button variant="secondary" size="sm" onClick={() => { if (!nahled) setOkno(e); }}>{t('Vyrobeno')}</Button>
            );
            return (
              <li key={e.taskId}>
                <ListRow
                  as="div"
                  title={e.title}
                  meta={metaVyroby(e, t)}
                  right={L ? <Chip tone={e.ready ? 'ok' : 'wait'} size="sm">{e.ready ? t('lze vyrobit') : t('do nákupu')}</Chip> : undefined}
                  actions={L ? (
                    <>
                      <Button variant="ghost" size="sm" iconOnly icon="chevron"
                        aria-label={otevreno ? t('Skrýt postup: {nazev}', { nazev: e.title }) : t('Ukázat postup: {nazev}', { nazev: e.title })}
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
        {seznamVyroby.length > strop && <p className="t-meta mt-2">{aDalsich(seznamVyroby.length - strop, t)}</p>}
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
