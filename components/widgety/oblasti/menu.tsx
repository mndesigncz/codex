'use client';

// Widgety oblasti „Menu" — komponenty (kolo 68 a 69, spec §2.5, §2.6 a §6.3).
//
// Vlastník: balík B4 (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/menu.ts, výběr
// a výpočty (hlavní menu, co je vyprodané, bez ceny, nespárované) v lib/recepturyPrehled.ts;
// tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — test AK-20 v scripts/testy/k68-widgety.ts klíče čte z textu, proto bez spreadu.
//
// Kolo 69: stránka Menu dřív žádné bloky neměla a všechno bylo až v editoru — jestli menu
// hosté vidí, co je vyprodané, Wi-Fi. Teď jsou tři widgety nad editorem. Vyprodáno čte
// slabou odpověď /api/menu?jen=vyprodano, kterou smí i Barista a tablet (jen menu.vyprodano):
// bez cen, Wi-Fi a vzhledu. Přepnutí jde na veřejný endpoint od stánku (hlídá menu.vyprodano)
// a pošle událost, ať si ho editor na téže stránce propíše do rozpracované kopie — jinak by
// další „Uložit" v editoru vrátilo starý stav.
//
// Oprávnění (spec §1.5): widget se kreslí a ptá serveru, až když `nacteno && vse && nektere`;
// tlačítka podle `opravneni.pole` přes useSmi. Dotazy jen přes useDataWidgetu. V náhledu
// (galerie) se nic nezapisuje ani nekopíruje.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { apiMessage, okJson } from '@/lib/api';
import { czCount, czForm, POLOZKA } from '@/lib/czech';
import {
  hlavniDeska, nesparovano, pocetVyprodanych, radkyVyprodano, vyberMenu, wifiMenu,
  UDALOST_VYPRODANO, URL_MENU, URL_VYPRODANO, type DataMenu, type DeskaMenu, type RadekVyprodano,
} from '@/lib/recepturyPrehled';
import { Icon } from '../../Icons';
import { Button, Chip, EmptyState, ListRow, SearchField, Stat, Switch, Toast } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { Widget, type StavNacteni } from '../Widget';
import { obnovDataWidgetu, useDataWidgetu } from '../useDataWidgetu';
import { useSmi } from '../NavigaceKontext';

/** Menu se zapnulo nebo vypnulo jinde (widget Stav menu) — editor si to propíše. */
export const UDALOST_MENU_ZAPNUTO = 'managero:menu-zapnuto';

const cislo = (n: number) => n.toLocaleString('cs-CZ');

/** „Ještě nevíme, jestli smí": kostra a žádný dotaz. */
const CEKA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

/** Brána: všechny klíče z `vse` a aspoň jeden z `nektere`, až po načtení oprávnění (viz sklad.tsx). */
function useBrana(id: string): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  const o = widget(id)?.opravneni ?? { vse: ['menu.zobrazit'], nektere: [] };
  if (!nacteno) return { ok: chyba, ceka: !chyba };
  const ok = o.vse.every(k => ma(k)) && (o.nektere.length === 0 || o.nektere.some(k => ma(k)));
  return { ok, ceka: false };
}

/**
 * Toast z widgetu se kreslí do <body>, ne do karty: buňka mřížky dostává
 * transformace (FLIP, promáčknutí) a pod nimi by `position: fixed` počítalo
 * od karty. `data-plocha-chrom` říká ploše, že klepnutí v něm není gesto.
 */
function NadPlochou({ children }: { children: React.ReactNode }) {
  const [cil, setCil] = useState<HTMLElement | null>(null);
  useEffect(() => { setCil(document.body); }, []);
  return cil ? createPortal(<div data-plocha-chrom="">{children}</div>, cil) : null;
}

function useZprava() {
  const [zprava, setZprava] = useState<{ text: string; ton?: 'bad' } | null>(null);
  const toast = zprava ? <NadPlochou><Toast message={zprava.text} tone={zprava.ton} onClose={() => setZprava(null)} /></NadPlochou> : null;
  return { toast, ok: (text: string) => setZprava({ text }), chyba: (text: string) => setZprava({ text, ton: 'bad' }) };
}

/** Po zápisu z widgetu obnovit obě adresy, ze kterých widgety menu čtou. */
const obnovMenu = () => { obnovDataWidgetu(URL_MENU); obnovDataWidgetu(URL_VYPRODANO); };

const cestaMenu = (slug: string) => `/menu-akce.html?menu=${encodeURIComponent(slug)}`;

// ---------------------------------------------------------------------------
// Stav menu
// ---------------------------------------------------------------------------

function metaDesky(d: DeskaMenu): string {
  const casti = [`/${d.slug}`, czCount(d.polozek, POLOZKA)];
  if (d.bezCeny > 0) casti.push(`${cislo(d.bezCeny)} bez ceny`);
  const n = nesparovano(d);
  if (n > 0) casti.push(`${cislo(n)} bez vazby na kasu`);
  return casti.join(' · ');
}

function StavMenu({ velikost, nahled }: WidgetProps) {
  const smi = useSmi();
  const def = widget('menu.stav');
  const { ok, ceka } = useBrana('menu.stav');
  const data = useDataWidgetu<DataMenu>(ok ? URL_MENU : null, vyberMenu);
  const zprava = useZprava();
  const [pracuji, setPracuji] = useState<number | null>(null);
  const smiZverejnit = smi(def?.opravneni.pole?.['akce:zverejnit'] ?? 'menu.zverejnit') && !nahled;
  const desky = data.data?.desky ?? [];
  const hlavni = hlavniDeska(desky);

  const zverejnit = async (d: DeskaMenu) => {
    setPracuji(d.id);
    try {
      await fetch(URL_MENU, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: d.id, castecne: true, enabled: true }),
      }).then(okJson);
      window.dispatchEvent(new CustomEvent(UDALOST_MENU_ZAPNUTO, { detail: { id: d.id, enabled: true } }));
      obnovMenu();
      zprava.ok(`Menu „${d.nazev}" je zveřejněné.`);
    } catch (e) {
      zprava.chyba(apiMessage(e, 'Menu se nepodařilo zveřejnit.'));
    } finally { setPracuji(null); }
  };

  const prazdno = data.data?.nezmigrovano
    ? <p className="t-meta">Tabulky pro menu ještě nejsou v databázi.</p>
    : data.data && desky.length === 0
      ? <EmptyState compact icon="clipboard" title="Zatím žádné menu" hint="Založ ho v editoru — z pokladny nebo z dnešní nabídky." />
      : undefined;

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : data} kostra="cislo" prazdno={prazdno}>
        {hlavni && (
          <div className="space-y-2">
            <Chip tone={hlavni.zapnuto ? 'ok' : 'muted'} icon={hlavni.zapnuto ? 'check' : 'close'}>
              {hlavni.zapnuto ? 'Hosté ho vidí' : 'Vypnuté'}
            </Chip>
            <p className="t-meta truncate">{hlavni.nazev} · {czCount(hlavni.polozek, POLOZKA)}</p>
            {!hlavni.zapnuto && smiZverejnit && (
              <Button variant="secondary" size="sm" loading={pracuji === hlavni.id} onClick={() => zverejnit(hlavni)}>Zveřejnit</Button>
            )}
          </div>
        )}
        {zprava.toast}
      </Widget>
    );
  }

  const zobrazeno = desky.slice(0, 5);
  const qr = hlavni?.zapnuto ? hlavni : null;
  return (
    <Widget nacteni={ceka ? CEKA : data} kostra="seznam" prazdno={prazdno}
      doplnek={desky.length > 1 ? <Chip tone="muted" size="sm">{cislo(desky.length)}</Chip> : undefined}>
      <div className="flex flex-col sm:flex-row gap-4">
        <ul className="list min-w-0 flex-1">
          {zobrazeno.map(d => (
            <ListRow key={d.id} title={d.nazev} meta={metaDesky(d)}
              right={<Chip tone={d.zapnuto ? 'ok' : 'muted'} size="sm">{d.zapnuto ? 'zveřejněné' : 'vypnuté'}</Chip>}
              actions={!d.zapnuto && smiZverejnit
                ? <Button variant="secondary" size="sm" loading={pracuji === d.id} onClick={() => zverejnit(d)}>Zveřejnit</Button>
                : undefined} />
          ))}
        </ul>
        {qr && (
          // QR se vydá jen pro zapnuté menu (server ho jinak odmítne) — u vypnutého by byl rozbitý obrázek.
          <div className="shrink-0 flex sm:flex-col items-center gap-3">
            <img src={`/api/menu/public/${encodeURIComponent(qr.slug)}/qr`} alt={`QR kód menu ${qr.nazev}`} width={96} height={96}
              className="h-24 w-24 rounded-xl bg-white p-1.5 border border-black/[0.08]" />
            {!nahled && (
              <a href={cestaMenu(qr.slug)} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                <Icon name="external" size={15} className="shrink-0" />Otevřít
              </a>
            )}
          </div>
        )}
      </div>
      {desky.length > zobrazeno.length && <p className="t-meta mt-2">…a {czCount(desky.length - zobrazeno.length, { one: 'další menu', few: 'další menu', many: 'dalších menu' })}</p>}
      {zprava.toast}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Vyprodáno
// ---------------------------------------------------------------------------

function Vyprodano({ velikost, nahled }: WidgetProps) {
  const smi = useSmi();
  const def = widget('menu.vyprodano');
  const { ok, ceka } = useBrana('menu.vyprodano');
  const data = useDataWidgetu<DataMenu>(ok ? URL_VYPRODANO : null, vyberMenu);
  const zprava = useZprava();
  const [dotaz, setDotaz] = useState('');
  const smiPrepnout = smi(def?.opravneni.pole?.['akce:prepnout_vyprodano'] ?? 'menu.vyprodano') && !nahled;
  const desky = data.data?.desky ?? [];
  const vyprodanych = pocetVyprodanych(desky);
  const zadneZapnute = data.data != null && !desky.some(d => d.zapnuto && d.polozek > 0);

  /** Optimisticky: přepínač se hne hned (u baru se nečeká), při chybě se vrátí. */
  const prepnout = async (r: RadekVyprodano, soldOut: boolean) => {
    const zmen = (hodnota: boolean) => data.set(prev => ({
      nezmigrovano: false, ...prev,
      desky: (prev?.desky ?? []).map(d => d.slug !== r.slug ? d : { ...d, polozky: d.polozky.map(p => p.id === r.id ? { ...p, vyprodano: hodnota } : p) }),
    }));
    zmen(soldOut);
    try {
      await fetch(`/api/menu/public/${encodeURIComponent(r.slug)}/soldout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: r.id, soldOut }),
      }).then(okJson);
      window.dispatchEvent(new CustomEvent(UDALOST_VYPRODANO, { detail: { itemId: r.id, soldOut } }));
      // Obě adresy: `data.set` platí jen v téhle instanci, sdílená mezipaměť URL_VYPRODANO by
      // jinak další instanci (návrat na stránku, Domů zaměstnance) 30 s ukazovala starý stav.
      obnovMenu();
      zprava.ok(soldOut ? `${r.nazev}: vyprodáno` : `${r.nazev}: zpátky v nabídce`);
    } catch (e) {
      zmen(!soldOut);
      zprava.chyba(apiMessage(e, 'Vyprodáno se nepodařilo uložit.'));
    }
  };

  const prazdno = data.data?.nezmigrovano
    ? <p className="t-meta">Tabulky pro menu ještě nejsou v databázi.</p>
    : zadneZapnute ? <p className="t-meta">Žádné zveřejněné menu s položkami — není co označit.</p> : undefined;

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : data} kostra="cislo" prazdno={prazdno}>
        <Stat label="Teď vyprodáno" value={cislo(vyprodanych)}
          note={vyprodanych === 0 ? 'všechno je v nabídce' : `${czForm(vyprodanych, POLOZKA)} v menu`} />
        {zprava.toast}
      </Widget>
    );
  }

  const radky = radkyVyprodano(desky, dotaz);
  const strop = 5;
  const viceMenu = desky.filter(d => d.zapnuto).length > 1;
  return (
    <Widget nacteni={ceka ? CEKA : data} kostra="seznam" prazdno={prazdno}
      doplnek={vyprodanych > 0 ? <Chip tone="bad" size="sm">{cislo(vyprodanych)}</Chip> : undefined}>
      {smiPrepnout && (
        <SearchField value={dotaz} onChange={setDotaz} placeholder="Najít položku a označit…" ariaLabel="Najít položku menu" className="mb-2" />
      )}
      {radky.length === 0 ? (
        <p className="t-meta">{dotaz ? 'V menu nic takového není.' : smiPrepnout ? 'Nic není vyprodané. Až něco dojde, najdi to a přepni.' : 'Nic není vyprodané.'}</p>
      ) : (
        <ul className="list">
          {radky.slice(0, strop).map(r => (
            <ListRow key={`${r.slug}-${r.id}`} title={r.nazev} meta={viceMenu ? `${r.menu} · ${r.sekce}` : r.sekce}
              right={smiPrepnout
                ? <Switch checked={r.vyprodano} label={`Vyprodáno: ${r.nazev}`} onChange={v => prepnout(r, v)} />
                : <Chip tone="bad" size="sm">vyprodáno</Chip>} />
          ))}
        </ul>
      )}
      {radky.length > strop && <p className="t-meta mt-2">…a {czCount(radky.length - strop, { one: 'další', few: 'další', many: 'dalších' })}{dotaz ? '' : ' vyprodané'}</p>}
      {zprava.toast}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Wi-Fi pro hosty
// ---------------------------------------------------------------------------

function Wifi({ nahled }: WidgetProps) {
  const { ok, ceka } = useBrana('menu.wifi');
  const data = useDataWidgetu<DataMenu>(ok ? URL_MENU : null, vyberMenu);
  const [zkopirovano, setZkopirovano] = useState(false);
  const d = data.data ? wifiMenu(data.data.desky) : null;

  useEffect(() => {
    if (!zkopirovano) return;
    const t = setTimeout(() => setZkopirovano(false), 2000);
    return () => clearTimeout(t);
  }, [zkopirovano]);

  const kopirovat = async () => {
    if (!d?.wifiHeslo) return;
    try { await navigator.clipboard.writeText(d.wifiHeslo); setZkopirovano(true); } catch { /* bez schránky: heslo je vidět a dá se opsat */ }
  };

  return (
    <Widget nacteni={ceka ? CEKA : data} kostra="text"
      prazdno={data.data && !d ? <p className="t-meta">Wi-Fi zatím není vyplněná — doplníš ji v editoru menu.</p> : undefined}>
      {d && (
        <div className="space-y-1.5 min-w-0">
          <p className="t-meta truncate">Síť <span className="font-semibold text-[#16181A]">{d.wifiSsid}</span></p>
          {d.wifiHeslo ? (
            <div className="flex items-center gap-1 min-w-0">
              <code className="font-mono text-[15px] font-semibold text-[#16181A] truncate min-w-0" aria-label={`Heslo ${d.wifiHeslo}`}>{d.wifiHeslo}</code>
              {!nahled && (
                <Button variant="ghost" size="sm" iconOnly icon={zkopirovano ? 'check' : 'copy'} onClick={kopirovat}
                  aria-label={zkopirovano ? 'Heslo zkopírováno' : 'Zkopírovat heslo Wi-Fi'} className="shrink-0" />
              )}
              <span className="sr-only" aria-live="polite">{zkopirovano ? 'Heslo zkopírováno' : ''}</span>
            </div>
          ) : <p className="t-meta">bez hesla</p>}
        </div>
      )}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'menu.stav': StavMenu,
  'menu.vyprodano': Vyprodano,
  'menu.wifi': Wifi,
};
