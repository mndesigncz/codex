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

import { useState } from 'react';
import type { KomponentaWidgetu, Navigace, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { LOCALE_PRO_JAZYK } from '@/lib/i18n/config';
import { fmtDatum } from '@/lib/i18n/format';
import { apiMessage, okJson } from '@/lib/api';
import { pokryti, prodejeBezReceptury, vyberReceptury, type DataReceptur } from '@/lib/recepturyPrehled';
import {
  cekajiciNavrhy, dopadNaPorci, marzeProcenta, mnozstviText, recepturZmenenychZaDni, rozdilVerzi, vyberHistorii, vyberNavrhy,
  MAX_DELKA_DUVODU, type NavrhReceptury, type RozdilVerzi, type VerzeReceptury,
} from '@/lib/recepturyVerze';
import { useCost } from '../../CurrencyProvider';
import { Avatar, Button, Chip, EmptyState, ListRow, Modal, Stat, StatRow, Textarea, Well } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { Widget, type StavNacteni } from '../Widget';
import { obnovDataWidgetu, useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';

/** Tutéž adresu čte nástroj Receptur (RecipesView) — sdílená mezipaměť, jeden dotaz. */
export const URL_RECEPTURY = '/api/pos/products';
const URL_SKLAD = '/api/inventory';
/** Historie verzí a návrhy úprav (kolo 8, R8-5) — čte je i editor receptury. */
export const URL_HISTORIE = '/api/pos/recipe-history';
export const URL_NAVRHY = '/api/pos/recipe-proposals';

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
  const nav = useNavigace();
  const { ok, ceka } = useBrana('receptury.pokryti');
  const data = useDataWidgetu<DataReceptur>(ok ? URL_RECEPTURY : null, vyberReceptury);
  // Počet položek skladu je doplněk: bez sklad.zobrazit se nečte a číslo se nekreslí.
  const sklad = useDataWidgetu<unknown[]>(ok && velikost !== 'S' && smi('sklad.zobrazit') ? URL_SKLAD : null, raw => (Array.isArray(raw) ? raw : []));
  // Kolo 8 (R8-5): co se změnilo tento týden a návrhy ke schválení — jen v M, S je jedno číslo.
  const def = widget('receptury.pokryti');
  const klicSchvalit = def?.opravneni.pole?.['akce:schvalit_navrh'] ?? 'receptury.upravit';
  const klicNavrhnout = def?.opravneni.pole?.['akce:navrhnout'] ?? 'receptury.navrhnout';
  const schvaluje = smi(klicSchvalit);
  const historie = useDataWidgetu<VerzeReceptury[]>(ok && velikost !== 'S' ? URL_HISTORIE : null, vyberHistorii);
  const navrhy = useDataWidgetu<NavrhReceptury[]>(ok && velikost !== 'S' && (schvaluje || smi(klicNavrhnout)) ? URL_NAVRHY : null, vyberNavrhy);
  const [okno, setOkno] = useState(false);
  const d = data.data;
  // Chyba skladu nesmí shodit celé pokrytí: čísla z kasy dorazila, jen „Ve skladu" chybí.
  // Proto v `nacteni` jen data kasy a sklad se použije, jen když opravdu přišel.
  const p = d ? pokryti(d, sklad.vypnuto || sklad.error ? null : sklad.data) : null;
  const zmeneno = historie.data ? recepturZmenenychZaDni(historie.data, Date.now()) : null;
  const ceka2 = navrhy.data ? cekajiciNavrhy(navrhy.data) : [];
  const moje = navrhy.data ? navrhy.data.filter(n => n.muj) : [];
  const naReceptury = !nahled && nav.smiPohled('recipes') ? () => nav.onNavigate('recipes') : undefined;

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
        <>
          {/* Tři čísla v M (dvě buňky mřížky): štítky a poznámky krátké, jinak se na
              1280 px ořízly na „Pokryto recept…" a „ze skladu se neod…". */}
          <StatRow>
            <Stat label={t('Pokryto')} value={`${p.procento ?? 0} %`} note={t('{a} z {b} položek', { a: cislo(p.sRecepturou), b: cislo(p.produktu) })} />
            <Stat label={t('Bez receptury')} value={cislo(p.prodavaSeBez)}
              note={p.prodavaSeBez > 0 ? <span className="text-wait-ink">{t('neodepíšou se')}</span> : t('vše se odepisuje')} />
            {p.polozekSkladu != null && (
              <Stat label={t('Ve skladu')} value={cislo(p.polozekSkladu)} note={t('{n, plural, one {položka} few {položky} other {položek}}', { n: p.polozekSkladu })} />
            )}
          </StatRow>
          {/* Historie a návrhy: řádky pod čísly, ať je vidět, že se receptury hýbou a kdo čeká na rozhodnutí. */}
          {(historie.data || navrhy.data) && (
            <ul className="list mt-3" data-receptury-radky>
              {zmeneno != null && (
                <ListRow as="li" title={t('Změněno tento týden')} meta={t('kdo co kdy změnil najdeš v editoru receptury pod Historie')}
                  value={cislo(zmeneno)} valueMeta={t('{n, plural, one {receptura} few {receptury} other {receptur}}', { n: zmeneno })}
                  chevron={!!naReceptury} onClick={naReceptury} />
              )}
              {navrhy.data && schvaluje && (
                <ListRow as="li" title={t('Návrhy ke schválení')} meta={ceka2.length ? t('zaměstnanci navrhli změnu — rozhodni') : t('nic nečeká')}
                  value={cislo(ceka2.length)}
                  right={ceka2.length > 0 ? <Chip tone="wait" size="sm">{t('čeká')}</Chip> : undefined}
                  chevron={!nahled} onClick={nahled ? undefined : () => setOkno(true)} />
              )}
              {navrhy.data && !schvaluje && moje.length > 0 && (
                <ListRow as="li" title={t('Moje návrhy')}
                  meta={[
                    moje.filter(n => n.status === 'ceka').length ? t('{n} čeká', { n: moje.filter(n => n.status === 'ceka').length }) : null,
                    moje.filter(n => n.status === 'schvaleno').length ? t('{n} schváleno', { n: moje.filter(n => n.status === 'schvaleno').length }) : null,
                    moje.filter(n => n.status === 'vraceno').length ? t('{n} vráceno', { n: moje.filter(n => n.status === 'vraceno').length }) : null,
                  ].filter(Boolean).join(' · ')}
                  value={cislo(moje.length)} chevron={!nahled} onClick={nahled ? undefined : () => setOkno(true)} />
              )}
            </ul>
          )}
          {okno && navrhy.data && (
            <NavrhyReceptur navrhy={schvaluje ? navrhy.data : moje} schvaluje={schvaluje} produkty={d?.produkty ?? []} onClose={() => setOkno(false)} />
          )}
        </>
      ))}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Návrhy úprav receptur — okno s rozdílem a rozhodnutím (kolo 8, R8-5)
// ---------------------------------------------------------------------------

/** Řádky rozdílu: „Káva 18 g → 22 g", „+ Sirup 10 ml", „− Mléko". Společné pro widget i editor. */
export function RadkyRozdilu({ rozdil, locale, t }: { rozdil: RozdilVerzi; locale: string; t: PrekladFn }) {
  const jmeno = (s: { itemName: string | null; itemId: number }) => s.itemName ?? `#${s.itemId}`;
  const radky = [
    ...rozdil.zmeneno.map(z => ({ k: `z${z.itemId}`, text: `${jmeno(z)}: ${mnozstviText(z.pred, z.unit, locale)} → ${mnozstviText(z.po, z.unit, locale)}`, ton: 'text-[#16181A]' })),
    ...rozdil.pridano.map(x => ({ k: `p${x.itemId}`, text: `+ ${jmeno(x)} ${mnozstviText(x.amount, x.unit, locale)}`, ton: 'text-ok-ink' })),
    ...rozdil.odebrano.map(x => ({ k: `o${x.itemId}`, text: `− ${jmeno(x)}`, ton: 'text-bad-ink' })),
  ];
  if (radky.length === 0) return <p className="t-meta">{t('beze změny')}</p>;
  return (
    <ul className="space-y-0.5 text-sm tabular-nums">
      {radky.map(r => <li key={r.k} className={r.ton}>{r.text}</li>)}
    </ul>
  );
}

const TON_STAVU: Record<NavrhReceptury['status'], 'wait' | 'ok' | 'bad'> = { ceka: 'wait', schvaleno: 'ok', vraceno: 'bad' };
export const stavNavrhuText = (t: PrekladFn, s: NavrhReceptury['status']) => (s === 'ceka' ? t('Čeká') : s === 'schvaleno' ? t('Schváleno') : t('Vráceno'));

function NavrhyReceptur({ navrhy, schvaluje, produkty, onClose }: {
  navrhy: NavrhReceptury[]; schvaluje: boolean; produkty: { productId: string; price: number | null }[]; onClose: () => void;
}) {
  const t = useT('widgety');
  // Náklad porce může mít haléře (sirup za 0,40 Kč) — useCost je nezaokrouhlí na celé koruny.
  const cena = useCost();
  const locale = LOCALE_PRO_JAZYK[t.jazyk];
  const [vracim, setVracim] = useState<number | null>(null);
  const [poznamka, setPoznamka] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [chyba, setChyba] = useState('');
  const cenaVKase = (productId: string) => produkty.find(p => p.productId === productId)?.price ?? null;
  const serazene = [...navrhy].sort((a, b) => (a.status === 'ceka' ? 0 : 1) - (b.status === 'ceka' ? 0 : 1) || b.createdAt.localeCompare(a.createdAt));

  const rozhodni = async (n: NavrhReceptury, akce: 'schvalit' | 'vratit') => {
    setBusy(n.id); setChyba('');
    try {
      await fetch(URL_NAVRHY, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id, akce, note: akce === 'vratit' ? poznamka.trim() : undefined }) }).then(okJson);
      setVracim(null); setPoznamka('');
      obnovDataWidgetu(URL_NAVRHY); obnovDataWidgetu(URL_RECEPTURY); obnovDataWidgetu(URL_HISTORIE);
    } catch (e) {
      setChyba(apiMessage(e, t('Rozhodnutí se nepodařilo uložit.')));
    } finally { setBusy(null); }
  };

  return (
    <Modal open onClose={onClose} size="md" title={schvaluje ? t('Návrhy ke schválení') : t('Moje návrhy')}
      subtitle={schvaluje ? t('Staré → nové, dopad na cenu porce a marži. Schval, nebo vrať s poznámkou.') : undefined}
      footer={<Button variant="secondary" onClick={onClose}>{t('Zavřít')}</Button>}>
      {chyba && <p className="note note-danger text-sm mb-3" role="alert">{chyba}</p>}
      {serazene.length === 0 ? (
        <EmptyState compact icon="leaf" title={t('Žádné návrhy')} hint={t('Až někdo navrhne změnu receptury, uvidíš ji tady.')} />
      ) : (
        <ul className="space-y-3" data-navrhy-receptur>
          {serazene.map(n => {
            const rozdil = rozdilVerzi(n.puvodni, n.ingredients);
            const dopad = dopadNaPorci(n.puvodniCost, n.costPerPortion);
            const c = cenaVKase(n.productId);
            const mPred = marzeProcenta(c, n.puvodniCost), mPo = marzeProcenta(c, n.costPerPortion);
            return (
              <Well as="li" key={n.id} className="space-y-2" data-navrh={n.id}>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="t-card truncate">{n.productName ?? n.productId}</p>
                    <p className="t-meta flex items-center gap-1.5 flex-wrap">
                      {n.author && <><Avatar emoji={n.author.avatar} name={n.author.name} size="xs" ring={false} /><span>{n.author.name}</span></>}
                      <span>· {fmtDatum(n.createdAt, { jazyk: t.jazyk, styl: 'kratce' })}</span>
                    </p>
                  </div>
                  <Chip tone={TON_STAVU[n.status]} size="sm">{stavNavrhuText(t, n.status)}</Chip>
                </div>
                <p className="text-sm text-[#16181A] whitespace-pre-wrap text-pretty">{n.reason}</p>
                <RadkyRozdilu rozdil={rozdil} locale={locale} t={t} />
                {(n.puvodniCost != null || n.costPerPortion != null) && (
                  <p className="t-meta tabular-nums">
                    {t('Suroviny na porci')}: {n.puvodniCost != null ? cena(n.puvodniCost) : '—'} → {n.costPerPortion != null ? cena(n.costPerPortion) : '—'}
                    {dopad != null && <span className={dopad > 0 ? 'text-bad-ink' : dopad < 0 ? 'text-ok-ink' : ''}> ({dopad > 0 ? '+' : ''}{cena(dopad)})</span>}
                    {mPred != null && mPo != null && <span> · {t('marže')} {mPred} % → {mPo} %</span>}
                  </p>
                )}
                {n.reviewNote && <p className="note note-wait text-sm">{n.reviewer?.name ? `${n.reviewer.name}: ` : ''}{n.reviewNote}</p>}
                {schvaluje && n.status === 'ceka' && (vracim === n.id ? (
                  <div className="space-y-2">
                    <Textarea rows={2} value={poznamka} maxLength={MAX_DELKA_DUVODU} autoFocus aria-label={t('Proč návrh vracíš')}
                      placeholder={t('Proč návrh vracíš — navrhovatel to uvidí')} onChange={e => setPoznamka(e.target.value)} />
                    <div className="flex flex-wrap gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => { setVracim(null); setPoznamka(''); }}>{t('Zrušit')}</Button>
                      <Button variant="primary" size="sm" loading={busy === n.id} disabled={!poznamka.trim()} onClick={() => { void rozhodni(n, 'vratit'); }}>{t('Vrátit s poznámkou')}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 justify-end">
                    <Button variant="secondary" size="sm" disabled={busy != null} onClick={() => { setVracim(n.id); setPoznamka(''); }}>{t('Vrátit')}</Button>
                    <Button variant="primary" size="sm" icon="check" loading={busy === n.id} disabled={busy != null && busy !== n.id} onClick={() => { void rozhodni(n, 'schvalit'); }}>{t('Schválit')}</Button>
                  </div>
                ))}
              </Well>
            );
          })}
        </ul>
      )}
    </Modal>
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
