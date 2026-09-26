'use client';

// Widgety oblasti „Postupy" — komponenty (kolo 68, doplněno v kole 69; spec §2.5, §2.6, §6.2).
//
// Vlastník v kole 69: balík B6b (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/postupy.ts,
// výpočty (povinné dnes, poslední průběhy, přeskočené kroky, připomínky) v lib/postupyPrehled.ts,
// kde je hlídají testy scripts/testy/k69-b6b.ts. Tady je jen kreslení. Klíč v KOMPONENTY = id
// widgetu a musí sedět se `stav: 'hotovo'` v katalogu — test AK-20 čte klíče z textu, proto bez spreadu.
//
// Kontrakt (spec §2.6): data jen přes useDataWidgetu (URL null, dokud neplatí brána
// a u polí useSmi), navigace přes useNavigace, v náhledu (`nahled`) žádné zápisy ani spouštění.
//
// Z čeho widgety vznikly (Procedures a KioskHomeExtras do kola 68):
//  - Návrhy postupů — ApproveAllBar nad mřížkou a „Schválit" limetkově v každé kartě.
//    Teď fronta, která se bez návrhů nekreslí, a jedno „Schválit vše".
//  - Poslední průběhy — seznam pod mřížkou s emoji avatarem v kroužku (a 👤 jako náhradou),
//    ručními chipy „nedokončeno" a limetkovou délkou, u běžícího pulzující tečka.
//    Teď `.list`, Avatar, Chip v tónu stavu, délka v pravém sloupci, běžící bez pulzu.
//  - Povinné postupy dnes — do kola 68 jen na tabletu; poslední běh se hledal podle
//    NÁZVU postupu, takže přejmenovaný postup vypadal jako neudělaný. Teď podle ID.
//  - Přeskočené kroky, Připomínky dnes a Spustit postup jsou nové z dat, která API už vracelo.

import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Avatar, Button, Chip, ListRow, Stat, runBulk } from '../../ui';
import { Icon } from '../../Icons';
import type { KomponentaWidgetu, Navigace, WidgetProps } from '@/lib/widgety/typy';
import { Widget, type StavNacteni } from '../Widget';
import { obnovDataWidgetu, useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';
import { useOpravneni } from '../../role/useOpravneni';
import { useProcedures } from '../../procedures/ProcedureProvider';
import DetailPrubehu from '../../procedures/DetailPrubehu';
import { czCount, czForm, type CzNoun } from '@/lib/czech';
import { parseDbTime, dbTimeHM, pragueHM, pragueToday } from '@/lib/pragueTime';
import { parseSteps, totalMinutes, fmtMinutes } from '@/lib/steps';
import { skipReasonLabel } from '@/lib/procedureScoring';
import { apiMessage, okJson } from '@/lib/api';
import {
  URL_POSTUPY, URL_PRUBEHY, URL_PRUBEHY_DNES, UDALOST_OTEVRIT_POSTUP,
  vyberPostupy, vyberPrubehy, povinneDnes, posledniPrubehy, posledniDokonceni, preskoceneKroky, pripominkyDnes,
  navrhyPostupu, delka, type PostupApi, type PrubehApi,
} from '@/lib/postupyPrehled';

// ---------------------------------------------------------------------------
// Pomocníci (záměrně v souboru — oblast je samostatný líný kus s jedním vlastníkem)
// ---------------------------------------------------------------------------

/**
 * Hlavní brána widgetu (spec §1.5): s načtenými oprávněními musí platit všechny
 * klíče z `vse` a aspoň jeden z `nektere`. Když /api/teams/mine selhal, rozhodl
 * za nás server — plocha widget připojila jen proto, že ho vrátil v rozložení.
 * Dokud se neví, `ceka` drží kostru a žádný dotaz neodejde (403 by byl falešná chyba).
 */
function useBrana(vse: readonly string[], nektere: readonly string[] = []): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  const plati = vse.every(k => ma(k)) && (nektere.length === 0 || nektere.some(k => ma(k)));
  return { ok: nacteno ? plati : chyba, ceka: !nacteno && !chyba };
}

/** „Ještě nevíme, jestli smí": kostra a žádný dotaz. */
const CEKA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

// Klikací řádek v `.list` musí být vlastní <li> s ListRow as="div": ListRow s onClick se jinak
// obalí <li className="contents"> a na prvku s display:contents pravidlo `.list > * + *`
// linku nenakreslí — řádky splynou (DP §3.6). Neklikací řádek zůstává obyčejným ListRow.
function Radek({ onClick, ...p }: ComponentProps<typeof ListRow>) {
  return onClick ? <li><ListRow as="div" {...p} onClick={onClick} /></li> : <ListRow {...p} />;
}

const NAVRH: CzNoun = { one: 'návrh', few: 'návrhy', many: 'návrhů' };
const KROK: CzNoun = { one: 'krok', few: 'kroky', many: 'kroků' };
const PRESKOCENI: CzNoun = { one: 'přeskočení', few: 'přeskočení', many: 'přeskočení' };

/** Ikona v jamce 36 px jako `lead` řádku (DP §3.6). */
function Jamka({ ikona }: { ikona: string }) {
  return (
    <span aria-hidden className="well grid h-9 w-9 shrink-0 place-items-center">
      <Icon name={ikona} size={16} className="text-black/55" />
    </span>
  );
}

/** „…a dalších N" pod useknutým seznamem (DP §3.6: tichý strop seznamu je zákaz). */
function ADalsich({ n }: { n: number }) {
  return n > 0 ? <p className="t-meta mt-2">…a dalších {n.toLocaleString('cs-CZ')}</p> : null;
}

/** Kdy průběh skončil: „dnes 7:40", jinak „12. 3. 7:40" (pražský den, ne den prohlížeče). */
export function kdyPrubehu(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = parseDbTime(iso);
  if (!d) return '';
  const den = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
  if (den(d) === pragueToday()) return `dnes ${dbTimeHM(d)}`;
  if (den(d) === pragueToday(-1)) return `včera ${dbTimeHM(d)}`;
  return `${d.toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric' })} ${dbTimeHM(d)}`;
}

/**
 * Po doběhnutí postupu (runner se zavře) obnoví průběhy všem, kdo je ukazují:
 * „Povinné dnes" musí přeskočit na hotovo a „Poslední průběhy" dostat nový řádek,
 * jinak by plocha do minuty tvrdila, že se nic nestalo.
 */
export function useObnovaPoPrubehu(): void {
  const { active } = useProcedures();
  const bylo = useRef<number | null>(null);
  const id = active?.id ?? null;
  useEffect(() => {
    if (bylo.current !== null && id === null) {
      const t = setTimeout(() => { obnovDataWidgetu(URL_PRUBEHY); obnovDataWidgetu(URL_PRUBEHY_DNES); }, 500);
      bylo.current = id;
      return () => clearTimeout(t);
    }
    bylo.current = id;
  }, [id]);
}

/**
 * Otevře detail postupu v nástroji stránky Postupy — na stejné stránce hned událostí
 * (nástroj ji „vezme" přes `detail.prijato`), jinak přechodem na pohled Postupy.
 */
function otevriPostup(nav: Navigace, id: number): void {
  const detail = { id, prijato: false };
  window.dispatchEvent(new CustomEvent(UDALOST_OTEVRIT_POSTUP, { detail }));
  if (!detail.prijato && nav.smiPohled('procedures')) nav.onNavigate('procedures', String(id));
}

/** Schválí návrhy postupů najednou (PATCH po jednom, jako ApproveAllBar) a obnoví seznam. */
async function schvalPostupy(ids: number[]): Promise<number> {
  const { failed } = await runBulk(ids, async id => {
    const res = await fetch(`/api/procedures/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approve: true }),
    });
    await okJson(res);
  });
  obnovDataWidgetu(URL_POSTUPY);
  return failed.length;
}

// ---------------------------------------------------------------------------
// Povinné postupy dnes
// ---------------------------------------------------------------------------

function PovinneDnes({ velikost, nahled }: WidgetProps) {
  const { ok, ceka } = useBrana(['postupy.zobrazit'], ['uzaverky.vytvorit', 'postupy.prubehy_tymu']);
  const smi = useSmi();
  const { active, startRun, starting } = useProcedures();
  useObnovaPoPrubehu();
  const postupy = useDataWidgetu(ok ? URL_POSTUPY : null, vyberPostupy);
  const behy = useDataWidgetu(ok ? URL_PRUBEHY_DNES : null, vyberPrubehy);
  const seznam = useMemo(() => povinneDnes(postupy.data?.postupy ?? [], behy.data ?? []), [postupy.data, behy.data]);

  if (!ok && !ceka) return <Widget prazdno={null} />;

  const smiSpustit = !nahled && smi('postupy.spoustet');
  const podleId = new Map((postupy.data?.postupy ?? []).map(p => [p.id, p]));
  const spust = (id: number) => { const p = podleId.get(id); if (p && !starting) void startRun(p as any); };
  const cekaji = seznam.filter(p => !p.hotovo);
  const prvni = cekaji.find(p => active?.procedureId !== p.id);
  const S = velikost === 'S';

  return (
    <Widget
      nacteni={ceka ? CEKA : [postupy, behy]}
      doplnek={!S && cekaji.length > 0 ? <Chip tone="wait" size="sm">{cekaji.length}</Chip> : undefined}
      // Bez povinných postupů nemá widget co hlídat — v klidu se nekreslí (v úpravách „Teď tu nic není").
      prazdno={seznam.length === 0 ? null : undefined}
      otevrit={S && smiSpustit && prvni ? () => spust(prvni.id) : undefined}
    >
      {S ? (
        <Stat label="Hotovo" value={`${seznam.length - cekaji.length} z ${seznam.length}`}
          note={cekaji.length === 0 ? 'Uzávěrka může jít' : `čeká ${czCount(cekaji.length, { one: 'postup', few: 'postupy', many: 'postupů' })}`} />
      ) : (
        <>
          {cekaji.length > 0 && <p className="t-meta text-pretty">Bez nich nepůjde odeslat uzávěrka.</p>}
          <ul className="list">
            {seznam.map(p => {
              const bezi = active?.procedureId === p.id;
              const klik = smiSpustit && !p.hotovo && !bezi ? () => spust(p.id) : undefined;
              return (
                <Radek key={p.id}
                  lead={<Jamka ikona={p.ikona} />}
                  title={p.nazev}
                  meta={p.hotovo ? (p.kdo ? `Dokončil(a) ${p.kdo}` : 'Dnes dokončeno') : klik ? 'Klepnutím spustíš' : undefined}
                  right={p.hotovo ? <Chip tone="ok" size="sm" icon="check">Hotovo</Chip>
                    : bezi ? <Chip tone="info" size="sm">Probíhá</Chip>
                    : <Chip tone="wait" size="sm">Čeká</Chip>}
                  chevron={false}
                  onClick={klik} />
              );
            })}
          </ul>
        </>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Poslední průběhy
// ---------------------------------------------------------------------------

function PosledniPrubehy({ velikost, nastaveni, nahled }: WidgetProps<{ pocet?: string }>) {
  // Vlastní průběhy vidí každý (API bez postupy.prubehy_tymu vrací jen je), tým jen s polem.
  const { ok, ceka } = useBrana([]);
  const smi = useSmi();
  useObnovaPoPrubehu();
  const behy = useDataWidgetu(ok ? URL_PRUBEHY : null, vyberPrubehy);
  // Kroky postupu pro detail průběhu (průběh nese jen indexy) — sdílená mezipaměť s nástrojem.
  const postupy = useDataWidgetu(ok && smi('postupy.zobrazit') ? URL_POSTUPY : null, vyberPostupy);
  const [detail, setDetail] = useState<PrubehApi | null>(null);
  const tym = smi('postupy.prubehy_tymu');
  const pocet = Math.min(20, Math.max(1, Number(nastaveni.pocet) || 5));
  const limit = velikost === 'L' ? pocet * 2 : pocet;
  const radky = useMemo(() => posledniPrubehy(behy.data ?? [], limit), [behy.data, limit]);

  if (!ok && !ceka) return <Widget prazdno={null} />;

  const L = velikost === 'L';
  const kroky = (id: number | null) => (postupy.data?.postupy ?? []).find(p => p.id === id)?.items ?? [];
  const surovy = (id: number) => (behy.data ?? []).find(r => Number(r.id) === id) ?? null;

  return (
    <Widget
      titulek={tym ? undefined : 'Moje průběhy'}
      nacteni={ceka ? CEKA : behy}
      prazdno={radky.length === 0 ? <p className="t-meta text-pretty">{tym ? 'Zatím nikdo žádný postup neprošel.' : 'Zatím jsi žádný postup neprošel.'}</p> : undefined}
    >
      <ul className="list">
        {radky.map(r => {
          const detailOk = !nahled && r.hotovo;
          return (
            <Radek key={r.id}
              lead={tym ? <Avatar emoji={r.avatar} size="sm" /> : <Jamka ikona="clipboard" />}
              title={r.nazev}
              meta={[tym ? r.kdo : null, r.hotovo ? kdyPrubehu(r.kdy) : 'probíhá'].filter(Boolean).join(' · ')}
              value={r.hotovo ? delka(r.sekund) || undefined : undefined}
              right={!r.hotovo
                ? <Chip tone="info" size="sm">{r.odskrtano}/{r.celkem}</Chip>
                : r.nedokonceno > 0
                  ? <Chip tone="wait" size="sm" icon="warning">{L ? `${r.nedokonceno} nedokončeno` : r.nedokonceno}</Chip>
                  : undefined}
              chevron={false}
              onClick={detailOk ? () => setDetail(surovy(r.id)) : undefined} />
          );
        })}
      </ul>
      {detail && (
        <DetailPrubehu prubeh={detail} kroky={kroky(detail.procedure_id != null ? Number(detail.procedure_id) : null)}
          kdy={kdyPrubehu(detail.completed_at || detail.started_at)} onClose={() => setDetail(null)} />
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Přeskočené kroky
// ---------------------------------------------------------------------------

function PreskoceneKroky({ nastaveni }: WidgetProps<{ obdobi?: string }>) {
  const { ok, ceka } = useBrana(['postupy.prubehy_tymu']);
  const behy = useDataWidgetu(ok ? URL_PRUBEHY : null, vyberPrubehy);
  const postupy = useDataWidgetu(ok ? URL_POSTUPY : null, vyberPostupy);
  const dni = nastaveni.obdobi === '30_dni' ? 30 : 7;
  const radky = useMemo(() => preskoceneKroky(behy.data ?? [], postupy.data?.postupy ?? [], dni, pragueToday()), [behy.data, postupy.data, dni]);

  if (!ok && !ceka) return <Widget prazdno={null} />;

  const LIMIT = 5;
  return (
    <Widget
      nacteni={ceka ? CEKA : [behy, postupy]}
      prazdno={radky.length === 0 ? <p className="t-meta text-pretty">Za posledních {dni} dní se žádný krok nepřeskočil.</p> : undefined}
    >
      <ul className="list">
        {radky.slice(0, LIMIT).map(k => (
          <ListRow key={`${k.postupId ?? k.postup}-${k.index}`}
            title={k.krok}
            meta={[k.postup, k.duvod ? skipReasonLabel(k.duvod) : null, k.lide.length ? k.lide.slice(0, 2).join(', ') + (k.lide.length > 2 ? ` +${k.lide.length - 2}` : '') : null].filter(Boolean).join(' · ')}
            value={`${k.pocet}×`}
            valueMeta={czForm(k.pocet, PRESKOCENI)} />
        ))}
      </ul>
      <ADalsich n={radky.length - Math.min(radky.length, LIMIT)} />
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Spustit postup
// ---------------------------------------------------------------------------

function SpustitPostup({ velikost, nastaveni, nahled }: WidgetProps<{ postup?: number | string | null }>) {
  const { ok, ceka } = useBrana(['postupy.spoustet']);
  const { active, startRun, starting } = useProcedures();
  useObnovaPoPrubehu();
  const postupy = useDataWidgetu(ok ? URL_POSTUPY : null, vyberPostupy);
  const M = velikost === 'M';
  const behy = useDataWidgetu(ok && M ? URL_PRUBEHY : null, vyberPrubehy);
  const id = Number(nastaveni.postup);
  const p: PostupApi | null = Number.isFinite(id) && id > 0 ? (postupy.data?.postupy ?? []).find(x => x.id === id) ?? null : null;

  if (!ok && !ceka) return <Widget prazdno={null} />;

  const bezi = !!p && active?.procedureId === p.id;
  const smi = !nahled && !!p && p.approved !== false && !bezi;
  const spust = () => { if (p && !starting) void startRun(p as any); };
  const kroky = p ? parseSteps(p.items) : [];
  const min = totalMinutes(kroky);
  const naposledy = p && M ? posledniDokonceni(behy.data ?? [], p.id) : null;

  let prazdno: ReactNode | undefined;
  if (!Number.isFinite(id) || id <= 0) prazdno = <p className="t-meta text-pretty">Vyber postup v nastavení widgetu.</p>;
  else if (postupy.data && !p) prazdno = <p className="t-meta text-pretty">Postup už neexistuje. Vyber jiný v nastavení widgetu.</p>;

  return (
    <Widget
      // Dlaždice jednoho postupu nese jeho jméno — „Spustit postup" by na ploše se třemi
      // takovými nerozlišilo, který je který (výjimka z titulku z registru, spec §3.3).
      titulek={p?.name}
      nacteni={ceka ? CEKA : M ? [postupy, behy] : postupy}
      prazdno={prazdno}
      otevrit={!M && smi ? spust : undefined}
    >
      {p && (
        <div className={M ? 'space-y-3' : ''}>
          <p className="t-meta">
            {czCount(kroky.length, KROK)}{min > 0 ? ` · ${fmtMinutes(min)}` : ''}
          </p>
          {M && naposledy && (
            <p className="t-meta cz-sentence">Naposledy {kdyPrubehu(naposledy.completed_at || naposledy.started_at)}{naposledy.user_name ? ` · ${naposledy.user_name}` : ''}</p>
          )}
          {bezi && <Chip tone="info" size="sm" className={M ? '' : 'mt-2'}>Probíhá</Chip>}
          {M && smi && <Button variant="primary" size="sm" icon="play" loading={starting} onClick={spust}>Spustit</Button>}
        </div>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Návrhy postupů
// ---------------------------------------------------------------------------

function NavrhyPostupu({ velikost, nahled }: WidgetProps) {
  const { ok, ceka } = useBrana(['postupy.schvalovat']);
  const nav = useNavigace();
  const postupy = useDataWidgetu(ok ? URL_POSTUPY : null, vyberPostupy);
  const navrhy = useMemo(() => navrhyPostupu(postupy.data?.postupy ?? []), [postupy.data]);
  const [pracuji, setPracuji] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  if (!ok && !ceka) return <Widget prazdno={null} />;

  const schval = async () => {
    setPracuji(true); setChyba(null);
    try {
      const selhalo = await schvalPostupy(navrhy.map(p => p.id));
      if (selhalo) setChyba(`${czCount(selhalo, NAVRH)} se neschválilo. Zkus to znovu.`);
    } catch (e) {
      setChyba(apiMessage(e, 'Návrhy se neschválily.'));
    }
    setPracuji(false);
  };

  const S = velikost === 'S';
  return (
    <Widget
      nacteni={ceka ? CEKA : postupy}
      doplnek={!S && navrhy.length > 0 ? <Chip tone="wait" size="sm">{navrhy.length}</Chip> : undefined}
      // Fronta: bez návrhů se v klidu nekreslí.
      prazdno={navrhy.length === 0 ? null : undefined}
      otevrit={S && !nahled && navrhy[0] ? () => otevriPostup(nav, navrhy[0].id) : undefined}
    >
      {S ? (
        <Stat label="Čeká" value={navrhy.length.toLocaleString('cs-CZ')} note={czForm(navrhy.length, NAVRH)} />
      ) : (
        <div className="space-y-3">
          {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
          <ul className="list">
            {navrhy.slice(0, 5).map(p => (
              <Radek key={p.id}
                lead={<Jamka ikona={p.icon || 'clipboard'} />}
                title={p.name}
                meta={czCount(parseSteps(p.items).length, KROK)}
                onClick={nahled ? undefined : () => otevriPostup(nav, p.id)} />
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
// Připomínky dnes
// ---------------------------------------------------------------------------

const KOTVA: Record<'time' | 'open' | 'close', string> = { time: 'V pevný čas', open: 'Při otevření', close: 'Při zavření' };

function PripominkyDnes(_props: WidgetProps) {
  const { ok, ceka } = useBrana(['postupy.zobrazit']);
  const { role } = useOpravneni();
  const postupy = useDataWidgetu(ok ? URL_POSTUPY : null, vyberPostupy);
  const d = postupy.data;
  const radky = useMemo(() => (d ? pripominkyDnes(d.postupy, d.oteviraciDoba, pragueToday(), pragueHM()) : []), [d]);

  if (!ok && !ceka) return <Widget prazdno={null} />;

  // Připomínka chodí jen tomu, kdo má dnes směnu (tablet vždy) — bez směny to má vědět,
  // jinak čeká na upozornění, které nepřijde.
  const bezSmeny = !!d && !d.maSmenuDnes && role?.typ !== 'kiosk';
  return (
    <Widget
      nacteni={ceka ? CEKA : postupy}
      prazdno={radky.length === 0
        ? <p className="t-meta text-pretty">{d?.oteviraciDoba.closed ? 'Dnes je zavřeno, žádný postup nepřipomíná.' : 'Dnes žádný postup nepřipomíná.'}</p>
        : undefined}
    >
      {bezSmeny && <p className="t-meta text-pretty">Upozornění chodí jen tomu, kdo má dnes směnu.</p>}
      <ul className="list">
        {radky.map(r => (
          <ListRow key={r.id}
            title={<span className={r.minula ? 'text-black/45' : undefined}>{r.nazev}</span>}
            meta={r.kotva === 'time' ? (r.minula ? 'Už proběhla' : undefined) : KOTVA[r.kotva]}
            value={<span className={`tabular-nums ${r.minula ? 'text-black/45' : ''}`}>{r.cas}</span>} />
        ))}
      </ul>
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'postupy.povinne_dnes': PovinneDnes,
  'postupy.posledni_prubehy': PosledniPrubehy,
  'postupy.preskocene_kroky': PreskoceneKroky,
  'postupy.spustit': SpustitPostup,
  'postupy.navrhy': NavrhyPostupu,
  'postupy.pripominky': PripominkyDnes,
};
