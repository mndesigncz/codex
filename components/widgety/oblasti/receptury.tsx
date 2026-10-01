'use client';

// Widgety oblasti „Receptury" — komponenty (kolo 68 a 69, spec §2.5, §2.6 a §6.3).
//
// Vlastník: balík B4 (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/receptury.ts,
// výpočet pokrytí a fronty prodejů bez receptury v lib/recepturyPrehled.ts; tady je jen
// kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'` v katalogu —
// test AK-20 v scripts/testy/k68-widgety.ts klíče čte z textu, proto bez spreadu.
//
// Kolo 69: Receptury měly nad seznamem natvrdo tři dlaždice s čísly (šablona „hero metrik",
// ruční štítky a čísla 30 px) a ručně tónovaný pás „Prodává se, ale neodepisuje" s pilulkami
// místo tlačítek. Teď jsou to dva widgety: čísla ve StatRow v jedné kartě, fronta jako .list
// s číslem v pevném sloupci. Klepnutí na řádek otevře editor receptury v nástroji stránky.
//
// Oprávnění (spec §1.5): widget se kreslí a ptá serveru, až když `nacteno && vse`; tlačítka
// podle `opravneni.pole` přes useSmi. Dotazy jen přes useDataWidgetu — nástroj Receptur čte
// tentýž /api/pos/products, takže stránka se ptá jednou. V náhledu se nic neotevírá.

import type { KomponentaWidgetu, Navigace, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { pokryti, prodejeBezReceptury, vyberReceptury, type DataReceptur } from '@/lib/recepturyPrehled';
import { Button, Chip, EmptyState, ListRow, Stat, StatRow } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { Widget, type StavNacteni } from '../Widget';
import { useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';

/** Tutéž adresu čte nástroj Receptur (RecipesView) — sdílená mezipaměť, jeden dotaz. */
export const URL_RECEPTURY = '/api/pos/products';
const URL_SKLAD = '/api/inventory';

/** Nástroj Receptur na téže stránce přijme žádost synchronně (`detail.prijato`). */
export const UDALOST_OTEVRIT_RECEPTURU = 'managero:otevrit-recepturu';

const cislo = (n: number) => n.toLocaleString('cs-CZ');
const aDalsich = (n: number, t: PrekladFn) => t('…a {n, plural, one {# další} few {# další} other {# dalších}}', { n });

/** „Ještě nevíme, jestli smí": kostra a žádný dotaz. */
const CEKA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

/**
 * Brána widgetu: všechny klíče z `vse` a aspoň jeden z `nektere`, až po
 * načtení oprávnění. Samotné `ma()` před načtením vrací ANO a dotaz by
 * odešel dřív, než víme, jestli divák na data má. Když /api/teams/mine
 * selže, rozhodl už server — widget je na ploše jen tehdy, když ho vrátil.
 */
function useBrana(id: string): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  const o = widget(id)?.opravneni ?? { vse: ['receptury.zobrazit'], nektere: [] };
  if (!nacteno) return { ok: chyba, ceka: !chyba };
  const ok = o.vse.every(k => ma(k)) && (o.nektere.length === 0 || o.nektere.some(k => ma(k)));
  return { ok, ceka: false };
}

/**
 * Otevře editor receptury: na stránce Receptury ho nástroj otevře hned,
 * jinde (Sklad) widget přejde na Receptury s produktem v argumentu.
 */
function otevriRecepturu(nav: Navigace, productId: string, nazev: string) {
  const detail: Record<string, unknown> = { productId, nazev, prijato: false };
  window.dispatchEvent(new CustomEvent(UDALOST_OTEVRIT_RECEPTURU, { detail }));
  if (!detail.prijato) nav.onNavigate('recipes', productId);
}

/** Nepřipojená pokladna: bez ní receptury nemají z čeho brát. */
function BezPokladny({ nahled }: { nahled: boolean }) {
  const t = useT('widgety');
  const nav = useNavigace();
  const smiNastavit = nav.smiPohled('settings') && !nahled;
  return (
    <EmptyState compact icon="receipt" title={t('Pokladna není připojená')}
      hint={t('Receptury se skládají k položkám z kasy. Propoj ji v Nastavení.')}
      action={smiNastavit ? <Button variant="secondary" size="sm" onClick={() => nav.onNavigate('settings', 'pos')}>{t('Nastavit pokladnu')}</Button> : undefined} />
  );
}

// ---------------------------------------------------------------------------
// Pokrytí recepturou
// ---------------------------------------------------------------------------

function Pokryti({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
  const smi = useSmi();
  const { ok, ceka } = useBrana('receptury.pokryti');
  const data = useDataWidgetu<DataReceptur>(ok ? URL_RECEPTURY : null, vyberReceptury);
  // Počet položek skladu je doplněk: bez sklad.zobrazit se nečte a číslo se nekreslí.
  const sklad = useDataWidgetu<unknown[]>(ok && velikost !== 'S' && smi('sklad.zobrazit') ? URL_SKLAD : null, raw => (Array.isArray(raw) ? raw : []));
  const d = data.data;
  // Chyba skladu nesmí shodit celé pokrytí: čísla z kasy dorazila, jen „Ve skladu" chybí.
  // Proto v `nacteni` jen data kasy a sklad se použije, jen když opravdu přišel.
  const p = d ? pokryti(d, sklad.vypnuto || sklad.error ? null : sklad.data) : null;

  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      kostra={velikost === 'S' ? 'cislo' : 'seznam'}
      prazdno={d && !d.propojeno ? <BezPokladny nahled={nahled} /> : d && d.produkty.length === 0
        ? <p className="t-meta">{d.chyba ?? t('Katalog kasy je zatím prázdný.')}</p> : undefined}
    >
      {p && (velikost === 'S' ? (
        <Stat label={t('Pokryto')} value={`${p.procento ?? 0} %`} note={t('{a} z {b} položek menu', { a: cislo(p.sRecepturou), b: cislo(p.produktu) })} />
      ) : (
        // Tři čísla v M (dvě buňky mřížky): štítky a poznámky krátké, jinak se na
        // 1280 px ořízly na „Pokryto recept…" a „ze skladu se neod…".
        <StatRow>
          <Stat label={t('Pokryto')} value={`${p.procento ?? 0} %`} note={t('{a} z {b} položek', { a: cislo(p.sRecepturou), b: cislo(p.produktu) })} />
          <Stat label={t('Bez receptury')} value={cislo(p.prodavaSeBez)}
            note={p.prodavaSeBez > 0 ? <span className="text-wait-ink">{t('neodepíšou se')}</span> : t('vše se odepisuje')} />
          {p.polozekSkladu != null && (
            <Stat label={t('Ve skladu')} value={cislo(p.polozekSkladu)} note={t('{n, plural, one {položka} few {položky} other {položek}}', { n: p.polozekSkladu })} />
          )}
        </StatRow>
      ))}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Prodává se, ale neodepisuje
// ---------------------------------------------------------------------------

function BezReceptury({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
  const nav = useNavigace();
  const smi = useSmi();
  const def = widget('receptury.bez_receptury');
  const { ok, ceka } = useBrana('receptury.bez_receptury');
  const data = useDataWidgetu<DataReceptur>(ok ? URL_RECEPTURY : null, vyberReceptury);
  const d = data.data;
  const vse = d ? prodejeBezReceptury(d) : [];
  const strop = velikost === 'L' ? 20 : 5;
  const klic = def?.opravneni.pole?.['akce:doplnit_recepturu'] ?? 'receptury.upravit';
  const smiDoplnit = smi(klic) && !nahled;

  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      kostra="seznam"
      doplnek={vse.length > 0 ? <Chip tone="wait" size="sm">{cislo(vse.length)}</Chip> : undefined}
      // Nepřipojenou pokladnu vysvětluje Pokrytí recepturou; tady by stejná věta jen opakovala.
      // Katalog kasy se nenačetl (`chyba`): prázdná fronta pak nic neznamená a klidná
      // věta „všechno má recepturu" by lhala — ukázat, že data nedorazila.
      prazdno={d && !d.propojeno ? null : d && d.chyba
        ? <p className="t-meta">{d.chyba}</p>
        : d && vse.length === 0
          ? <p className="t-meta">{t('Všechno, co se na kase prodává, má recepturu — sklad se odepisuje sám.')}</p> : undefined}
    >
      <ul className="list">
        {vse.slice(0, strop).map(u => (
          <li key={u.productId}>
            <ListRow as="div" title={u.productName}
              meta={smiDoplnit ? t('Doplnit recepturu') : t('bez receptury')}
              value={`${cislo(u.prodano)}×`} valueMeta={t('{n, plural, one {prodej} few {prodeje} other {prodejů}}', { n: u.prodano })}
              onClick={smiDoplnit ? () => otevriRecepturu(nav, u.productId, u.productName) : undefined} />
          </li>
        ))}
      </ul>
      {vse.length > strop && <p className="t-meta mt-2">{aDalsich(vse.length - strop, t)}</p>}
      <p className="t-meta mt-2">{t('Tyhle prodeje se ze skladu neodepíšou, dokud položka nemá recepturu.')}</p>
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'receptury.pokryti': Pokryti,
  'receptury.bez_receptury': BezReceptury,
};
