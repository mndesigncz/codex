'use client';

// Widgety oblasti „Návody" — komponenty (kolo 68, doplněno v kole 69; spec §2.5, §2.6, §6.2).
//
// Vlastník v kole 69: balík B6b (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/navody.ts,
// výběry (povinné nepřečtené, nově upravené, návrhy, připnutý k uzávěrce, kdo nečetl)
// v lib/navodyPrehled.ts, kde je hlídají testy scripts/testy/k69-b6b.ts. Klíč v KOMPONENTY
// = id widgetu a musí sedět se `stav: 'hotovo'` v katalogu — test AK-20 čte klíče z textu.
//
// Kontrakt (spec §2.6): data jen přes useDataWidgetu (URL null, dokud neplatí brána),
// navigace přes useNavigace, v náhledu (`nahled`) žádné zápisy ani otevírání.
//
// Z čeho widgety vznikly (Guides a CashClosing do kola 68):
//  - Návrhy návodů — ApproveAllBar nad kartami a „Schválit" v titulku každé karty.
//  - Povinné čtení — štítek „povinné čtení" (červeně) na kartě; kolik takových zbývá,
//    se nikde nedalo zjistit bez projití celé knihovny.
//  - Kdo nečetl — „Kdo četl (3)" ve čtečce, po jednom návodu. Teď všechny povinné naráz
//    z jednoho dotazu (GET /api/guides/ctenari).
//  - Návod k uzávěrce — CashClosing si ho hledal sám v /api/guides; tady je vidět i mimo krok kasy.

import { useMemo, useState, type ComponentProps } from 'react';
import { Button, Chip, ListRow, Stat, runBulk } from '../../ui';
import type { KomponentaWidgetu, Navigace, WidgetProps } from '@/lib/widgety/typy';
import { Widget, type StavNacteni } from '../Widget';
import { obnovDataWidgetu, useDataWidgetu } from '../useDataWidgetu';
import { useNavigace } from '../NavigaceKontext';
import { useOpravneni } from '../../role/useOpravneni';
import { czCount, czForm, type CzNoun } from '@/lib/czech';
import { apiMessage, okJson } from '@/lib/api';
import {
  URL_NAVODY, URL_CTENARI, UDALOST_OTEVRIT_NAVOD,
  vyberNavody, vyberCtenare, povinneNeprectene, noveUpravene, navrhyNavodu, navodKUzaverce, kdoNecetl, kdyUpraveno,
} from '@/lib/navodyPrehled';

// ---------------------------------------------------------------------------
// Pomocníci
// ---------------------------------------------------------------------------

/** Brána widgetu (spec §1.5) — všechny klíče; bez načtených oprávnění kostra a žádný dotaz. */
function useBrana(klice: readonly string[]): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  return { ok: nacteno ? klice.every(k => ma(k)) : chyba, ceka: !nacteno && !chyba };
}

const CEKA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

// Klikací řádek v `.list` musí být vlastní <li> s ListRow as="div": ListRow s onClick se jinak
// obalí <li className="contents"> a na prvku s display:contents pravidlo `.list > * + *`
// linku nenakreslí — řádky splynou (DP §3.6). Neklikací řádek zůstává obyčejným ListRow.
function Radek({ onClick, ...p }: ComponentProps<typeof ListRow>) {
  return onClick ? <li><ListRow as="div" {...p} onClick={onClick} /></li> : <ListRow {...p} />;
}
const NAVOD: CzNoun = { one: 'návod', few: 'návody', many: 'návodů' };
const NAVRH: CzNoun = { one: 'návrh', few: 'návrhy', many: 'návrhů' };

function ADalsich({ n }: { n: number }) {
  return n > 0 ? <p className="t-meta mt-2">…a dalších {n.toLocaleString('cs-CZ')}</p> : null;
}

/**
 * Otevře čtečku návodu — na stránce Návody hned událostí (nástroj ji „vezme"),
 * jinak přechodem na pohled Návody s id návodu (layout ho předá jako openGuideId).
 */
export function otevriNavodZWidgetu(nav: Navigace, id: number): void {
  const detail = { id, prijato: false };
  window.dispatchEvent(new CustomEvent(UDALOST_OTEVRIT_NAVOD, { detail }));
  if (!detail.prijato && nav.smiPohled('guides')) nav.onNavigate('guides', String(id));
}

// ---------------------------------------------------------------------------
// Povinné čtení
// ---------------------------------------------------------------------------

function PovinneCteni({ velikost, nahled }: WidgetProps) {
  const { ok, ceka } = useBrana(['navody.zobrazit']);
  const nav = useNavigace();
  const data = useDataWidgetu(ok ? URL_NAVODY : null, vyberNavody);
  const seznam = useMemo(() => povinneNeprectene(data.data ?? []), [data.data]);

  if (!ok && !ceka) return <Widget prazdno={null} />;

  const muze = !nahled && nav.smiPohled('guides');
  const S = velikost === 'S';
  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      doplnek={!S && seznam.length > 0 ? <Chip tone="wait" size="sm">{seznam.length}</Chip> : undefined}
      otevrit={S && muze && seznam[0] ? () => otevriNavodZWidgetu(nav, seznam[0].id) : undefined}
      prazdno={seznam.length === 0 ? <p className="t-meta text-pretty">{S ? 'Vše přečteno.' : 'Povinné čtení máš hotové.'}</p> : undefined}
    >
      {S ? (
        <Stat label="Zbývá" value={seznam.length.toLocaleString('cs-CZ')} note={czForm(seznam.length, NAVOD)} />
      ) : (
        <>
          <ul className="list">
            {seznam.slice(0, 5).map(g => (
              <Radek key={g.id} title={g.title} meta={g.excerpt || undefined}
                onClick={muze ? () => otevriNavodZWidgetu(nav, g.id) : undefined} />
            ))}
          </ul>
          <ADalsich n={seznam.length - Math.min(seznam.length, 5)} />
        </>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Kdo nečetl
// ---------------------------------------------------------------------------

function KdoNecetl({ velikost, nahled }: WidgetProps) {
  const { ok, ceka } = useBrana(['navody.povinne_cteni']);
  const nav = useNavigace();
  const data = useDataWidgetu(ok ? URL_CTENARI : null, vyberCtenare);
  const radky = useMemo(() => kdoNecetl(data.data ?? []), [data.data]);

  if (!ok && !ceka) return <Widget prazdno={null} />;

  const muze = !nahled && nav.smiPohled('guides');
  const L = velikost === 'L';
  const limit = L ? 10 : 5;
  const chybi = radky.reduce((s, r) => s + (r.celkem - r.precetlo), 0);
  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      doplnek={chybi > 0 ? <Chip tone="wait" size="sm">{chybi}</Chip> : undefined}
      prazdno={radky.length === 0 ? <p className="t-meta text-pretty">Žádný návod není povinné čtení.</p> : undefined}
    >
      <ul className="list">
        {radky.slice(0, limit).map(r => {
          const vsichni = r.precetlo >= r.celkem;
          const jmena = r.neprecetli.map(p => p.name).filter(Boolean);
          return (
            <Radek key={r.id}
              title={r.title}
              // Jména jen ve velké velikosti — ve střední by se řádek lámal na telefonu.
              meta={L && !vsichni && jmena.length ? `Chybí: ${jmena.slice(0, 4).join(', ')}${jmena.length > 4 ? ` +${jmena.length - 4}` : ''}` : undefined}
              value={<span className="tabular-nums">{r.precetlo} z {r.celkem}</span>}
              valueMeta="přečetlo"
              right={vsichni ? <Chip tone="ok" size="sm" icon="check">Všichni</Chip> : undefined}
              chevron={false}
              onClick={muze ? () => otevriNavodZWidgetu(nav, r.id) : undefined} />
          );
        })}
      </ul>
      <ADalsich n={radky.length - Math.min(radky.length, limit)} />
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Nově upravené návody
// ---------------------------------------------------------------------------

function NoveUpravene({ nastaveni, nahled }: WidgetProps<{ pocet?: string }>) {
  const { ok, ceka } = useBrana(['navody.zobrazit']);
  const nav = useNavigace();
  const data = useDataWidgetu(ok ? URL_NAVODY : null, vyberNavody);
  const pocet = Math.min(10, Math.max(1, Number(nastaveni.pocet) || 5));
  const seznam = useMemo(() => noveUpravene(data.data ?? [], pocet), [data.data, pocet]);

  if (!ok && !ceka) return <Widget prazdno={null} />;

  const muze = !nahled && nav.smiPohled('guides');
  return (
    <Widget nacteni={ceka ? CEKA : data}
      prazdno={seznam.length === 0 ? <p className="t-meta text-pretty">Zatím tu nejsou žádné návody.</p> : undefined}>
      <ul className="list">
        {seznam.map(g => (
          <Radek key={g.id} title={g.title} meta={g.excerpt || undefined}
            aside={kdyUpraveno(g.updatedAt)}
            onClick={muze ? () => otevriNavodZWidgetu(nav, g.id) : undefined} />
        ))}
      </ul>
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Návrhy návodů
// ---------------------------------------------------------------------------

function NavrhyNavodu({ velikost, nahled }: WidgetProps) {
  const { ok, ceka } = useBrana(['navody.schvalovat']);
  const nav = useNavigace();
  const data = useDataWidgetu(ok ? URL_NAVODY : null, vyberNavody);
  const navrhy = useMemo(() => navrhyNavodu(data.data ?? []), [data.data]);
  const [pracuji, setPracuji] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  if (!ok && !ceka) return <Widget prazdno={null} />;

  const schval = async () => {
    setPracuji(true); setChyba(null);
    try {
      const { failed } = await runBulk(navrhy.map(g => g.id), async id => {
        const res = await fetch(`/api/guides/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approve: true }),
        });
        await okJson(res);
      });
      obnovDataWidgetu(URL_NAVODY);
      if (failed.length) setChyba(`${czCount(failed.length, NAVRH)} se neschválilo. Zkus to znovu.`);
    } catch (e) {
      setChyba(apiMessage(e, 'Návrhy se neschválily.'));
    }
    setPracuji(false);
  };

  const muze = !nahled && nav.smiPohled('guides');
  const S = velikost === 'S';
  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      doplnek={!S && navrhy.length > 0 ? <Chip tone="wait" size="sm">{navrhy.length}</Chip> : undefined}
      // Fronta: bez návrhů se v klidu nekreslí.
      prazdno={navrhy.length === 0 ? null : undefined}
      otevrit={S && muze && navrhy[0] ? () => otevriNavodZWidgetu(nav, navrhy[0].id) : undefined}
    >
      {S ? (
        <Stat label="Čeká" value={navrhy.length.toLocaleString('cs-CZ')} note={czForm(navrhy.length, NAVRH)} />
      ) : (
        <div className="space-y-3">
          {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
          <ul className="list">
            {navrhy.slice(0, 5).map(g => (
              <Radek key={g.id} title={g.title} meta={g.excerpt || undefined} aside={kdyUpraveno(g.updatedAt)}
                onClick={muze ? () => otevriNavodZWidgetu(nav, g.id) : undefined} />
            ))}
          </ul>
          <ADalsich n={navrhy.length - Math.min(navrhy.length, 5)} />
          {!nahled && (
            <Button variant="primary" size="sm" icon="check" loading={pracuji} onClick={schval}>
              {navrhy.length > 1 ? `Schválit vše (${navrhy.length})` : 'Schválit'}
            </Button>
          )}
        </div>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Návod k uzávěrce
// ---------------------------------------------------------------------------

function KUzaverce({ nahled }: WidgetProps) {
  const { ok, ceka } = useBrana(['navody.zobrazit']);
  const nav = useNavigace();
  const data = useDataWidgetu(ok ? URL_NAVODY : null, vyberNavody);
  const g = useMemo(() => navodKUzaverce(data.data ?? []), [data.data]);

  if (!ok && !ceka) return <Widget prazdno={null} />;

  const muze = !nahled && nav.smiPohled('guides');
  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      // Nic připnutého = nic k ukázání; v úpravách „Teď tu nic není" (připíná se ve čtečce návodu).
      prazdno={g ? undefined : null}
      otevrit={g && muze ? () => otevriNavodZWidgetu(nav, g.id) : undefined}
    >
      {g && (
        <div>
          <p className="text-[15px] font-medium leading-snug text-[#16181A] line-clamp-2 text-pretty">{g.title}</p>
          <p className="t-meta mt-1">Co dělat, když kasa nesedí</p>
        </div>
      )}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'navody.povinne_cteni': PovinneCteni,
  'navody.kdo_necetl': KdoNecetl,
  'navody.nove': NoveUpravene,
  'navody.navrhy': NavrhyNavodu,
  'navody.k_uzaverce': KUzaverce,
};
