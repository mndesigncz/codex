'use client';

// Widgety oblasti „Uzávěrky" — komponenty (kolo 68, doplněno v kole 69; spec §2.5, §2.6, §6.2).
//
// Vlastník v kole 69: balík B5a (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/uzaverky.ts,
// výpočty (součty, rozdíl kasy, trend, kalendář) v lib/uzaverkyPrehled.ts, kde je hlídají
// testy scripts/testy/k69-b5a.ts. Tady je jen kreslení. Klíč v KOMPONENTY = id widgetu
// a musí sedět se `stav: 'hotovo'` v katalogu — test AK-20 čte klíče z textu, proto bez spreadu.
//
// Kontrakt (spec §2.6): data jen přes useDataWidgetu (URL null, dokud neplatí brána
// a u polí useSmi), navigace přes useNavigace, v náhledu (`nahled`) žádné zápisy.
//
// Z čeho widgety vznikly (ClosingsOverview a CashClosing do kola 68):
//  - Chybějící uzávěrky — červená tónovaná karta s bílými kartami dnů uvnitř (karta v kartě)
//    a ručně psanou tmavou pilulkou „Vyplnit". Teď jeden `.list`, lidé jako PersonChip,
//    řádek sám vede k vyplnění. Dnešní běžící směna už nesvítí (N9).
//  - Ke schválení — žlutá karta s limetkovým „Schválit" v každém řádku (druhá, třetí limetka
//    na obrazovce). Teď `primary sm` v řádku (DP §3.1) a mazání v „···" za Modal.
//  - Souhrn — čtyři dlaždice s ručními štítky, které bez finance.trzby ukazovaly „0 Kč"
//    a červený „Rozdíl kasy 0 Kč" (N3). Teď Stat/StatRow a bez tržeb se widget nekreslí.
//  - Trendy a Měsíc v číslech — schované za sbalovacím pásem „Přehledy a trendy". Měsíc
//    v číslech počítal nákupy jen z přijatých objednávek, takže se lišil od Financí; teď
//    bere /api/finance jako Finance (poznámka katalogu).
//  - Kalendář — tónované buňky (limetka, červená, žlutá přes celý měsíc) a vlastní šipky.
//    Teď neutrální buňky s tečkou stavu a MonthNav; klepnutí zúží seznam uzávěrek.
//  - Moje uzávěrky — karta na každou uzávěrku pod formulářem, ruční štítky, `confirm()`.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Chip, ListRow, Menu, Modal, MonthNav, PersonChip, Stat, StatRow, posunMesic } from '../../ui';
import { Icon } from '../../Icons';
import type { KomponentaWidgetu, Navigace, WidgetProps } from '@/lib/widgety/typy';
import { Widget, type StavNacteni } from '../Widget';
import { obnovDataWidgetu, useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';
import { useOpravneni } from '../../role/useOpravneni';
import { useCurrency, useMoney } from '../../CurrencyProvider';
import { czCount, czForm, DEN, type CzNoun } from '@/lib/czech';
import { pragueDaySafe, pragueToday } from '@/lib/pragueTime';
import { zkratkyDnu, zacatekTydne } from '@/lib/week';
import { apiMessage, okJson } from '@/lib/api';
import {
  KLIC_DEN, KLIC_VYPLNIT, UDALOST_DEN, UDALOST_VYPLNIT, DNY_V_TYDNU,
  bunkyMesice, chybejiciDny, denUzaverky, keSchvaleni, mesicPred, mojeUzaverky, rozdilKasy, rozdilUzaverky,
  souhrnUzaverek, stavDne, trendyTrzeb,
  type ChybejiciDen, type DenKalendare, type ObdobiSouhrnu, type RadekUzaverky, type StavDne,
} from '@/lib/uzaverkyPrehled';

// ---------------------------------------------------------------------------
// Pomocníci (záměrně v souboru — oblast je samostatný líný kus s jedním vlastníkem)
// ---------------------------------------------------------------------------

/**
 * Hlavní brána widgetu (spec §1.5): s načtenými oprávněními musí platit VŠECHNY
 * klíče (tak čte `opravneni.vse` i server — `ma(pole)` by stačilo kterékoli).
 * Když /api/teams/mine selhal, rozhodl za nás server — plocha widget připojila
 * jen proto, že ho vrátil v rozložení. Dokud se neví, `ceka` drží kostru.
 */
function useBrana(klice: readonly string[]): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  return { ok: nacteno ? klice.every(k => ma(k)) : chyba, ceka: !nacteno && !chyba };
}

/** „Ještě nevíme, jestli smí": kostra a žádný dotaz. */
const CEKA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

/** Den z databáze: „2026-09-26" i ISO s časem; jinak pražský den z časové značky. */
const den = (v: unknown): string => (/^\d{4}-\d{2}-\d{2}/.test(String(v ?? '')) ? String(v).slice(0, 10) : pragueDaySafe(v));
const hm = (t: unknown) => String(t ?? '').slice(0, 5);
const denVetou = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
const denKratce = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });
function kdyVetou(d: string): string {
  if (d === pragueToday()) return 'dnes';
  if (d === pragueToday(-1)) return 'včera';
  return denVetou(d);
}
const cislo = (n: number) => n.toLocaleString('cs-CZ');
const UZAVERKA: CzNoun = { one: 'uzávěrka', few: 'uzávěrky', many: 'uzávěrek' };

/** Ikona v jamce 36 px jako `lead` řádku (DP §3.6). */
function Jamka({ ikona }: { ikona: string }) {
  return (
    <span aria-hidden className="well grid h-9 w-9 shrink-0 place-items-center">
      <Icon name={ikona} size={16} className="text-black/55" />
    </span>
  );
}

/** Rozdíl kasy jako stav: sedí / přebytek / manko (tón nese stav, ne ozdobu). */
function RozdilChip({ rozdil, money }: { rozdil: number; money: (n: number) => string }) {
  if (rozdil === 0) return <Chip tone="ok" size="sm">Sedí</Chip>;
  return <Chip tone={rozdil > 0 ? 'info' : 'bad'} size="sm">{rozdil > 0 ? '+' : ''}{money(rozdil)}</Chip>;
}

/** „…a dalších N" pod useknutým seznamem (DP §3.6: tichý strop seznamu je zákaz). */
function ADalsich({ n }: { n: number }) {
  return n > 0 ? <p className="t-meta mt-2">…a dalších {cislo(n)}</p> : null;
}

/**
 * Předá žádost nástroji (formulář, seznam) — na stejné stránce hned událostí,
 * jinak přes sessionStorage po přechodu na pohled. Posluchač nástroje si
 * událost „vezme" (`detail.prijato`), takže se na stejné stránce nikam nenaviguje.
 */
function predejNastroji(nav: Navigace, udalost: string, klic: string, hodnota: string, pohled: string | null): void {
  const detail = { hodnota, prijato: false };
  window.dispatchEvent(new CustomEvent(udalost, { detail }));
  if (detail.prijato || !pohled || !nav.smiPohled(pohled)) return;
  try { sessionStorage.setItem(klic, hodnota); } catch { /* soukromé okno: nástroj se otevře bez předvyplnění */ }
  nav.onNavigate(pohled);
}

/** Tvar /api/closings, který widgety čtou (sdílená mezipaměť — jeden dotaz pro všechny). */
interface SeznamUzaverek {
  radky: RadekUzaverky[];
  meId: number | null;
  payDailyCash: boolean;
  raw: any;
}
function vyberSeznam(raw: any): SeznamUzaverek {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.closings)) throw new Error('Uzávěrky přišly v nečekaném tvaru.');
  return { radky: raw.closings, meId: typeof raw.meId === 'number' ? raw.meId : null, payDailyCash: raw.payDailyCash === true, raw };
}
const URL_SEZNAM = '/api/closings';

// ---------------------------------------------------------------------------
// Předávka
// ---------------------------------------------------------------------------

interface Predavka {
  todo: string | null;
  runningOut: string | null;
  message: string | null;
  den: string;
  autor: string | null;
}

function vyberPredavku(raw: any): Predavka | null {
  if (!raw || typeof raw !== 'object' || !('handover' in raw)) throw new Error('Předávka přišla v nečekaném tvaru.');
  const h = raw.handover;
  if (!h || typeof h !== 'object') return null;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const p = { todo: text(h.todo), runningOut: text(h.runningOut), message: text(h.message) };
  if (!p.todo && !p.runningOut && !p.message) return null;
  return { ...p, den: den(raw.date), autor: text(raw.authorName) };
}

/** Pořadí řádků: co udělat, co dokoupit, pak vzkaz — tak, jak je formulář uzávěrky vyplňuje. */
const RADKY_PREDAVKY: { klic: 'todo' | 'runningOut' | 'message'; ikona: string; popisek: string }[] = [
  { klic: 'todo', ikona: 'check', popisek: 'Co dodělat' },
  { klic: 'runningOut', ikona: 'box', popisek: 'Co dochází' },
  { klic: 'message', ikona: 'chat', popisek: 'Vzkaz' },
];

function PredavkaWidget({ velikost }: WidgetProps) {
  const { ok, ceka } = useBrana(['uzaverky.predavka']);
  // „Žádná předávka" (handover: null) je platná odpověď, ne načítání: useDataWidgetu
  // čte data === null jako „ještě nedorazilo", proto obal { p }.
  const data = useDataWidgetu<{ p: Predavka | null }>(ok ? '/api/closings/handover' : null, raw => ({ p: vyberPredavku(raw) }));
  const p = data.data?.p ?? null;

  // Bez oprávnění ho plocha vůbec nepřipojí; kdyby přece, nesmí tvrdit „nic nepředala".
  if (!ok && !ceka) return <Widget prazdno={null} />;

  const od = p ? [p.autor && `Od: ${p.autor}`, p.den && kdyVetou(p.den)].filter(Boolean).join(' · ') : '';
  return (
    <Widget nacteni={ceka ? CEKA : data} prazdno={p || ceka ? undefined : <p className="t-meta">Minulá směna nic nepředala.</p>}>
      {p && (
        <>
          {od && <p className="t-meta cz-sentence">{od}</p>}
          <ul className="list mt-1">
            {RADKY_PREDAVKY.filter(r => p[r.klic]).map(r => (
              <ListRow key={r.klic}
                lead={<Jamka ikona={r.ikona} />}
                // Text předávky se zalamuje (ListRow jinak řádek zkracuje) — ve střední
                // velikosti nejvýš na čtyři řádky, ve velké celý.
                title={<span className={`whitespace-normal text-pretty ${velikost === 'L' ? '' : 'line-clamp-4'}`}>{p[r.klic]}</span>}
                meta={r.popisek}
              />
            ))}
          </ul>
        </>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Moje uzávěrka
// ---------------------------------------------------------------------------

interface NeuzavrenaSmena { id: number; den: string; od: string; do: string }

function vyberNeuzavrene(raw: any): { smeny: NeuzavrenaSmena[]; zaJineho: boolean } {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.eligibleShifts)) throw new Error('Uzávěrky přišly v nečekaném tvaru.');
  return {
    smeny: raw.eligibleShifts.map((s: any, i: number) => ({ id: Number(s.id ?? i), den: den(s.date), od: hm(s.startTime), do: hm(s.endTime) })),
    // `isEmployer` = smí zavírat za jiné s volným datem; takovému API vlastní seznam nevrací.
    zaJineho: raw.isEmployer === true,
  };
}

const SMENA_NEUZAVRENA: CzNoun = { one: 'neuzavřená směna', few: 'neuzavřené směny', many: 'neuzavřených směn' };

function MojeUzaverka({ velikost, nahled }: WidgetProps) {
  const { ok, ceka } = useBrana(['uzaverky.vytvorit']);
  const smi = useSmi();
  const nav = useNavigace();
  // Kdo smí zavírat za jiné (typicky vedení), vybírá den i směnu sám a API mu
  // seznam vlastních neuzavřených směn nevrací (eligibleShifts = []). Ptát se
  // by stálo celou historii uzávěrek a „všechno máš hotové" by byla lež —
  // widget je pak jen rychlý vstup do vyplnění. Když oprávnění nevíme, řekne to odpověď.
  const zaJinehoPredem = !ceka && smi('uzaverky.za_jineho');
  const data = useDataWidgetu(ok && !zaJinehoPredem ? URL_SEZNAM : null, vyberNeuzavrene);
  const zaJineho = zaJinehoPredem || data.data?.zaJineho === true;
  // Nejnovější nahoře (jako v API a ve formuláři uzávěrky) — ta se vyplňuje nejspíš teď.
  const smeny = useMemo(() => [...(data.data?.smeny ?? [])].sort((a, b) => b.den.localeCompare(a.den)), [data.data]);

  if (!ok && !ceka) return <Widget prazdno={null} />;

  // Zaměstnanec vyplňuje na své záložce Uzávěrka, vedení v přehledu uzávěrek („Nová uzávěrka").
  const pohled = nav.smiPohled('closing') ? 'closing' : 'reports';
  const muze = !nahled && nav.smiPohled(pohled);
  const vyplnitDen = (d: string) => predejNastroji(nav, UDALOST_VYPLNIT, KLIC_VYPLNIT, d, pohled);
  const vyplnit = muze ? (
    <Button variant="primary" size="sm" icon="coins" onClick={() => vyplnitDen(smeny[0]?.den ?? pragueToday())}>Vyplnit</Button>
  ) : null;
  const S = velikost === 'S';
  const n = smeny.length;

  let telo: ReactNode = null;
  let prazdno: ReactNode | undefined;
  if (zaJineho) {
    telo = S ? (
      <p className="t-meta text-pretty">Uzávěrku vyplníš za kteroukoli směnu.</p>
    ) : (
      <div className="space-y-3">
        <p className="t-meta text-pretty">Uzávěrku vyplníš za kteroukoli směnu a den — i za kolegu.</p>
        {vyplnit}
      </div>
    );
  } else if (n === 0) {
    prazdno = <p className="t-meta text-pretty">{S ? 'Uzávěrky máš hotové.' : 'Uzávěrky máš hotové. Na konci směny ji vyplníš tady.'}</p>;
  } else if (S) {
    telo = <Stat label="Chybí" value={cislo(n)} note={czForm(n, SMENA_NEUZAVRENA)} />;
  } else {
    telo = (
      <div className="space-y-3">
        <p className="text-[15px] font-medium leading-snug text-[#16181A] text-pretty">
          {n === 1 ? 'Vyplň uzávěrku ze své směny.' : `Máš ${czCount(n, SMENA_NEUZAVRENA)}.`}
        </p>
        {/* Řádek vede rovnou do formuláře na ten den (dřív jen obecný proklik). */}
        <ul className="list">
          {smeny.slice(0, 5).map(s => (
            <li key={`${s.id}-${s.den}`}>
              <ListRow as="div" title={<span className="cz-sentence block truncate">{denVetou(s.den)}</span>}
                value={s.od ? `${s.od}–${s.do}` : undefined}
                onClick={muze ? () => vyplnitDen(s.den) : undefined} />
            </li>
          ))}
        </ul>
        <ADalsich n={n - 5} />
        {vyplnit}
      </div>
    );
  }

  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      otevrit={S && muze ? () => vyplnitDen(smeny[0]?.den ?? pragueToday()) : undefined}
      prazdno={prazdno}
    >
      {telo}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Chybějící uzávěrky
// ---------------------------------------------------------------------------

function Chybejici({ velikost, nastaveni, nahled }: WidgetProps<{ dnes?: boolean }>) {
  const { ok, ceka } = useBrana(['uzaverky.zobrazit_vse']);
  const smi = useSmi();
  const nav = useNavigace();
  const data = useDataWidgetu(ok ? URL_SEZNAM : null, raw => {
    if (!raw || typeof raw !== 'object') throw new Error('Uzávěrky přišly v nečekaném tvaru.');
    return raw as { missingClosings?: unknown; missingToday?: unknown };
  });
  const dnes = pragueToday();
  const { dny, dnes: dnesni } = useMemo(() => chybejiciDny(data.data ?? {}, dnes, nastaveni.dnes === true), [data.data, dnes, nastaveni.dnes]);

  if (!ok && !ceka) return <Widget prazdno={null} />;

  // Vyplnit za směnu smí jen ten, kdo zavírá za jiné (uzaverky.za_jineho) — a jen
  // tam, kam smí (Uzávěrky). Bez toho je řádek jen informace, ne tlačítko.
  const muze = !nahled && smi('uzaverky.za_jineho') && nav.smiPohled('reports');
  const vyplnit = (d: string) => predejNastroji(nav, UDALOST_VYPLNIT, KLIC_VYPLNIT, d, 'reports');
  const vse: (ChybejiciDen & { dnesni?: boolean })[] = [...(dnesni ? [{ ...dnesni, dnesni: true }] : []), ...dny];
  const S = velikost === 'S';
  const limit = velikost === 'M' ? 3 : Infinity;

  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      doplnek={dny.length > 0 && !S ? <Chip tone="bad" size="sm">{cislo(dny.length)}</Chip> : undefined}
      otevrit={S && muze && vse[0] ? () => vyplnit(vse[0].date) : undefined}
      prazdno={vse.length === 0 ? <p className="t-meta text-pretty">{S ? 'Nic nechybí.' : 'Za posledních 30 dní nic nechybí.'}</p> : undefined}
    >
      {S ? (
        <Stat label="Chybí" value={cislo(dny.length)} note={dnesni ? `${czForm(dny.length, DEN)} · dnes čeká` : czForm(dny.length, DEN)} />
      ) : (
        <>
          {velikost === 'L' && <p className="t-meta text-pretty">Tyhle dny někdo pracoval, ale uzávěrku nikdo neudělal. Stačí jedna za celou směnu.</p>}
          <ul className="list">
            {vse.slice(0, limit).map(d => (
              <li key={d.date}>
                <ListRow as="div"
                  title={<span className="cz-sentence block truncate">{d.dnesni ? `Dnes · ${denVetou(d.date)}` : denVetou(d.date)}</span>}
                  meta={d.employees.length > 0 ? (
                    <span className="flex flex-wrap gap-1 pt-1 whitespace-normal">
                      {d.employees.slice(0, 4).map(e => <PersonChip key={e.id} name={e.name} avatar={e.avatar} size="sm" />)}
                      {d.employees.length > 4 && <span className="t-meta self-center">+{d.employees.length - 4}</span>}
                    </span>
                  ) : undefined}
                  right={d.dnesni ? <Chip tone="wait" size="sm">Čeká</Chip> : undefined}
                  onClick={muze ? () => vyplnit(d.date) : undefined} />
              </li>
            ))}
          </ul>
          <ADalsich n={vse.length - Math.min(vse.length, limit)} />
        </>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Ke schválení
// ---------------------------------------------------------------------------

function KeSchvaleni({ velikost, nahled }: WidgetProps) {
  const { ok, ceka } = useBrana(['uzaverky.zobrazit_vse']);
  const smi = useSmi();
  const money = useMoney();
  const data = useDataWidgetu(ok ? URL_SEZNAM : null, vyberSeznam);
  const [pracuji, setPracuji] = useState<number | null>(null);
  const [mazat, setMazat] = useState<RadekUzaverky | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const cekaji = useMemo(() => keSchvaleni(data.data?.radky ?? []), [data.data]);

  if (!ok && !ceka) return <Widget prazdno={null} />;

  const smiSchvalit = !nahled && smi('uzaverky.schvalovat');
  const smiMazat = !nahled && smi('uzaverky.mazat');
  // Rozdíl kasy je peněžní pole (finance.trzby) — bez něj ho API nedá spočítat a chip se nekreslí.
  const smiRozdil = smi('finance.trzby');

  const zapis = async (c: RadekUzaverky, metoda: 'PATCH' | 'DELETE') => {
    setPracuji(c.id); setChyba(null);
    try {
      const res = await fetch(`/api/closings/${c.id}`, { method: metoda });
      await okJson(res);
      // Stejná URL jako seznam na stránce Uzávěrky — obnoví se všem, kdo ji ukazují.
      obnovDataWidgetu(URL_SEZNAM);
      setMazat(null);
    } catch (e) {
      setChyba(apiMessage(e, metoda === 'PATCH' ? 'Uzávěrka se neschválila.' : 'Uzávěrka se nesmazala.'));
    }
    setPracuji(null);
  };

  const S = velikost === 'S';
  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      doplnek={cekaji.length > 0 && !S ? <Chip tone="wait" size="sm">{cislo(cekaji.length)}</Chip> : undefined}
      prazdno={cekaji.length === 0 ? <p className="t-meta">Nic nečeká na schválení.</p> : undefined}
    >
      {S ? (
        <Stat label="Čeká" value={cislo(cekaji.length)} note={czForm(cekaji.length, UZAVERKA)} />
      ) : (
        <>
          {chyba && <p className="note note-danger text-sm mb-2" role="alert">{chyba}</p>}
          <ul className="list">
            {cekaji.slice(0, 5).map(c => {
              const r = smiRozdil ? rozdilUzaverky(c) : null;
              return (
                <ListRow key={c.id}
                  title={c.author_name ?? 'Neznámý'}
                  meta={<span className="cz-sentence">{denKratce(denUzaverky(c))} · odesláno bez směny</span>}
                  right={r != null ? <RozdilChip rozdil={r} money={money} /> : undefined}
                  actions={(smiSchvalit || smiMazat) ? (
                    <>
                      {smiSchvalit && (
                        <Button variant="primary" size="sm" icon="check" loading={pracuji === c.id && !mazat}
                          onClick={() => zapis(c, 'PATCH')}>Schválit</Button>
                      )}
                      {smiMazat && (
                        <Menu size="sm" label={`Další akce s uzávěrkou od ${c.author_name ?? 'neznámého'}`}
                          items={[{ label: 'Smazat uzávěrku…', icon: 'trash', danger: true, hint: 'Nenávratně smaže odeslané hodnoty.', onClick: () => setMazat(c) }]} />
                      )}
                    </>
                  ) : undefined}
                />
              );
            })}
          </ul>
          <ADalsich n={cekaji.length - 5} />
        </>
      )}
      {mazat && (
        <Modal open onClose={() => setMazat(null)} size="sm" title="Smazat uzávěrku?"
          subtitle={`${mazat.author_name ?? 'Neznámý'} · ${denVetou(denUzaverky(mazat))}`}
          footer={<>
            <Button variant="secondary" onClick={() => setMazat(null)}>Zrušit</Button>
            <Button variant="danger-solid" icon="trash" loading={pracuji === mazat.id} onClick={() => zapis(mazat, 'DELETE')}>Smazat</Button>
          </>}>
          <p className="text-sm text-black/60">Odeslané hodnoty se nenávratně smažou. Autor pak může uzávěrku vyplnit znovu.</p>
        </Modal>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Souhrn uzávěrek
// ---------------------------------------------------------------------------

type Metrika = 'trzba' | 'odvedeno' | 'vyplaceno' | 'spropitne' | 'rozdil_kasy';
const NAZEV_OBDOBI: Record<ObdobiSouhrnu, string> = { tento_mesic: 'tento měsíc', minuly_mesic: 'minulý měsíc', vse: 'celkem' };

function Souhrn({ velikost, nastaveni }: WidgetProps<{ obdobi?: ObdobiSouhrnu; metrika?: Metrika }>) {
  const { ok, ceka } = useBrana(['uzaverky.zobrazit_vse', 'finance.trzby']);
  const money = useMoney();
  const data = useDataWidgetu(ok ? URL_SEZNAM : null, vyberSeznam);
  const obdobi = nastaveni.obdobi ?? 'tento_mesic';
  const s = useMemo(() => (data.data ? souhrnUzaverek(data.data.radky, obdobi, pragueToday()) : null), [data.data, obdobi]);

  if (!ok && !ceka) return <Widget prazdno={null} />;
  // N3: bez tržeb (starší odpověď, role změněná za běhu) se nekreslí ani nula.
  if (s?.skryto) return <Widget prazdno={null} />;

  const vyplata = data.data?.payDailyCash === true;
  const rozdil = s ? <span className={s.rozdil === 0 ? '' : s.rozdil > 0 ? 'text-info-ink' : 'text-bad-ink'}>{s.rozdil > 0 ? '+' : ''}{money(s.rozdil)}</span> : null;
  const cisla: Record<Metrika, { label: string; value: ReactNode; note?: string }> = s ? {
    trzba: { label: 'Tržba', value: money(s.trzba), note: `hotově ${money(s.hotove)} · kartou ${money(s.kartou)}` },
    odvedeno: { label: 'Odvedeno', value: money(s.odvedeno), note: 'odloženo ven a odvody' },
    vyplaceno: { label: 'Vyplaceno', value: money(s.vyplaceno), note: 'v hotovosti z kasy' },
    spropitne: { label: 'Spropitné', value: money(s.spropitne) },
    rozdil_kasy: { label: 'Rozdíl kasy', value: rozdil, note: 'manko a přebytek dohromady' },
  } : ({} as any);
  const metrika = nastaveni.metrika ?? 'trzba';
  const obdobiNote = `${NAZEV_OBDOBI[obdobi]} · ${czCount(s?.pocet ?? 0, UZAVERKA)}`;
  // Třetí číslo podle toho, jak podnik platí: denní výplata z kasy, nebo spropitné.
  const treti: Metrika = vyplata ? 'vyplaceno' : 'spropitne';

  return (
    <Widget nacteni={ceka ? CEKA : data} kostra="cislo"
      prazdno={s && s.pocet === 0 ? <p className="t-meta">Za {NAZEV_OBDOBI[obdobi] === 'celkem' ? 'celé období' : NAZEV_OBDOBI[obdobi]} zatím žádná uzávěrka.</p> : undefined}>
      {s && (velikost === 'S' ? (
        <Stat label={cisla[metrika].label} value={cisla[metrika].value} note={NAZEV_OBDOBI[obdobi]} />
      ) : velikost === 'M' ? (
        <StatRow>
          <Stat label="Tržba" value={money(s.trzba)} note={obdobiNote} />
          <Stat label="Rozdíl kasy" value={rozdil} note="manko a přebytek" />
        </StatRow>
      ) : (
        <div className="space-y-2">
          <StatRow>
            <Stat label="Tržba" value={money(s.trzba)} note={cisla.trzba.note} />
            <Stat label="Odvedeno" value={money(s.odvedeno)} note="odloženo ven a odvody" />
            <Stat label={cisla[treti].label} value={cisla[treti].value} note={cisla[treti].note} />
            <Stat label="Rozdíl kasy" value={rozdil} note="manko a přebytek" />
          </StatRow>
          <p className="t-meta cz-sentence">{obdobiNote}</p>
        </div>
      ))}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Rozdíl pokladny
// ---------------------------------------------------------------------------

function RozdilPokladny({ velikost, nastaveni }: WidgetProps<{ obdobi?: '7_dni' | 'tento_mesic'; prah?: number }>) {
  const { ok, ceka } = useBrana(['uzaverky.zobrazit_vse', 'finance.trzby']);
  const smi = useSmi();
  const money = useMoney();
  const data = useDataWidgetu(ok ? URL_SEZNAM : null, vyberSeznam);
  const obdobi = nastaveni.obdobi ?? '7_dni';
  const prah = Number.isFinite(Number(nastaveni.prah)) ? Number(nastaveni.prah) : 50;
  const r = useMemo(() => (data.data ? rozdilKasy(data.data.radky, obdobi, prah, pragueToday()) : null), [data.data, obdobi, prah]);

  if (!ok && !ceka) return <Widget prazdno={null} />;
  if (r?.skryto && r.porovnano === 0) return <Widget prazdno={null} />;

  // Jméno u rozdílu je citlivější než číslo (kdo „dělá manko") — jen s finance.trzby_lide.
  const jmena = smi('finance.trzby_lide');
  const nazevObdobi = obdobi === '7_dni' ? 'za 7 dní' : 'tento měsíc';
  const barva = (n: number) => (n === 0 ? '' : n > 0 ? 'text-info-ink' : 'text-bad-ink');
  const hodnota = r ? <span className={barva(r.soucet)}>{r.soucet > 0 ? '+' : ''}{money(r.soucet)}</span> : null;
  const MIMO: CzNoun = { one: 'den nad práh', few: 'dny nad práh', many: 'dní nad práh' };

  return (
    <Widget nacteni={ceka ? CEKA : data} kostra="cislo"
      prazdno={r && r.porovnano === 0 ? <p className="t-meta">Za {obdobi === '7_dni' ? 'posledních 7 dní' : 'tento měsíc'} zatím žádná uzávěrka.</p> : undefined}>
      {r && (velikost === 'S' ? (
        <Stat label="Součet" value={hodnota} note={nazevObdobi} />
      ) : (
        <div className="space-y-3">
          <StatRow>
            <Stat label="Součet" value={hodnota} note={nazevObdobi} />
            <Stat label="Absolutně" value={money(r.absolutne)} note={czCount(r.dny.length, MIMO)} />
          </StatRow>
          {r.dny.length === 0 ? (
            <p className="t-meta">Kasa seděla — žádný den nepřesáhl práh {money(prah)}.</p>
          ) : (
            <>
              <ul className="list">
                {r.dny.slice(0, 5).map(d => (
                  <ListRow key={d.den} title={<span className="cz-sentence block truncate">{denVetou(d.den)}</span>}
                    meta={jmena && d.autor ? d.autor : undefined}
                    right={<RozdilChip rozdil={d.rozdil} money={money} />} />
                ))}
              </ul>
              <ADalsich n={r.dny.length - 5} />
            </>
          )}
        </div>
      ))}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Trendy tržeb
// ---------------------------------------------------------------------------

function Trendy({ velikost }: WidgetProps) {
  const { ok, ceka } = useBrana(['uzaverky.zobrazit_vse', 'finance.trzby']);
  const money = useMoney();
  const data = useDataWidgetu(ok ? URL_SEZNAM : null, vyberSeznam);
  const t = useMemo(() => (data.data ? trendyTrzeb(data.data.radky, pragueToday()) : null), [data.data]);

  if (!ok && !ceka) return <Widget prazdno={null} />;
  if (t?.skryto) return <Widget prazdno={null} />;

  const zmena = t?.zmena == null ? '—' : `${t.zmena >= 0 ? '+' : '−'}${Math.abs(Math.round(t.zmena))} %`;
  const tonZmeny = t?.zmena == null ? '' : t.zmena >= 0 ? 'text-ok-ink' : 'text-bad-ink';

  return (
    <Widget nacteni={ceka ? CEKA : data} kostra="cislo"
      prazdno={data.data && !t ? <p className="t-meta text-pretty">Trend půjde spočítat, až budou uzávěrky aspoň ze čtyř dní.</p> : undefined}>
      {t && (
        <StatRow>
          <Stat label="Tento týden" value={money(t.tentoTyden)} note="od pondělí do dneška" />
          <Stat label="Proti minulému" value={<span className={tonZmeny}>{zmena}</span>} note={`stejné dny: ${money(t.minulyTyden)}`} />
          {velikost === 'L' && <Stat label="Nejsilnější den" value={<span className="cz-sentence inline-block">{DNY_V_TYDNU[t.nejsilnejsiDen]}</span>} note={`průměr ${money(t.prumerNejsilnejsiho)}`} />}
          {velikost === 'L' && <Stat label="Rekordní den" value={money(t.rekord)} note={t.rekordDen ? new Date(`${t.rekordDen}T12:00:00`).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' }) : undefined} />}
        </StatRow>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Měsíc v číslech
// ---------------------------------------------------------------------------

interface MesicFinanci { trzby: number; nakupy: number; mzdy: number; vysledek: number; mzdySkryte: boolean }

function MesicVCislech({ velikost, nastaveni }: WidgetProps<{ mesic?: 'tento' | 'minuly' }>) {
  const { ok, ceka } = useBrana(['finance.zobrazit', 'finance.mzdy']);
  const money = useMoney();
  const { laborTargetPct } = useCurrency();
  const tento = pragueToday().slice(0, 7);
  const mesic = nastaveni.mesic === 'minuly' ? mesicPred(tento) : tento;
  // Stejný zdroj jako obrazovka Finance: nákupy z účtenek, objednávek i výdajů
  // z kasy. Dřív tu byly jen přijaté objednávky a čísla se s Financemi rozcházela.
  const data = useDataWidgetu<MesicFinanci>(ok ? `/api/finance?month=${mesic}` : null, raw => {
    const s = raw?.summary;
    if (!s || typeof s !== 'object') throw new Error('Finance přišly v nečekaném tvaru.');
    const n = (v: unknown) => Number(v) || 0;
    // Mzdy jako Finance: vyšší z odpracovaného a vyplaceného (jinak by se denní výplata počítala dvakrát nebo vůbec).
    const mzdy = Math.max(n(s.wagesWorked), n(s.wagesCash));
    return { trzby: n(s.revenue), nakupy: n(s.purchases), mzdy, vysledek: n(s.gross), mzdySkryte: s.mzdySkryte === true };
  });
  const f = data.data;

  if (!ok && !ceka) return <Widget prazdno={null} />;

  const podil = f && f.trzby > 0 && f.mzdy > 0 ? (f.mzdy / f.trzby) * 100 : null;
  const nadCilem = podil != null && laborTargetPct != null && podil > laborTargetPct;
  const vysledek = f ? <span className={f.vysledek >= 0 ? 'text-ok-ink' : 'text-bad-ink'}>{f.vysledek >= 0 ? '+' : '−'}{money(Math.abs(f.vysledek))}</span> : null;
  const podilText = podil == null ? '—' : `${Math.round(podil)} %`;
  const cil = laborTargetPct != null ? `cíl ${laborTargetPct} %` : 'mzdy z tržeb';

  return (
    <Widget nacteni={ceka ? CEKA : data} kostra="cislo"
      prazdno={f && f.trzby === 0 && f.nakupy === 0 && f.mzdy === 0 ? <p className="t-meta">Za tenhle měsíc zatím nejsou čísla.</p> : undefined}>
      {f && (
        <div className="space-y-2">
          <StatRow>
            <Stat label="Výsledek" value={vysledek} note="orientačně, bez DPH" />
            <Stat label="Podíl mezd" value={<span className={nadCilem ? 'text-bad-ink' : ''}>{podilText}</span>} note={cil} />
            {velikost === 'L' && <Stat label="Tržby" value={money(f.trzby)} />}
            {velikost === 'L' && <Stat label="Mzdy a nákupy" value={`−${money(f.mzdy + f.nakupy)}`} note={`mzdy ${money(f.mzdy)} · nákupy ${money(f.nakupy)}`} />}
          </StatRow>
          <p className="t-meta cz-sentence">{new Date(`${mesic}-01T12:00:00`).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })}</p>
        </div>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Kalendář uzávěrek
// ---------------------------------------------------------------------------

const TECKA: Record<StavDne, string> = {
  hotovo: 'bg-[#8FB811]',
  chybi: 'bg-bad',
  ceka: 'bg-wait',
  nic: 'bg-transparent',
};
const POPIS_STAVU: Record<StavDne, string> = {
  hotovo: 'uzávěrka hotová',
  chybi: 'chybí uzávěrka',
  ceka: 'uzávěrka zatím nevyplněná',
  nic: 'bez směny',
};

/** „12,4k" — buňka dne je malá, celá částka se do ní nevejde (celá je v popisku). */
const kratce = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')}k` : String(Math.round(n)));

function Kalendar({ velikost, nastaveni, nahled }: WidgetProps<{ mesic?: 'tento' | 'minuly'; rozsah?: 'moje' | 'tym' }>) {
  const smi = useSmi();
  const nav = useNavigace();
  const money = useMoney();
  const { weekStart } = useCurrency();
  const { nacteno, chyba: chybaOpravneni, role } = useOpravneni();
  const tento = pragueToday().slice(0, 7);
  const vychozi = nastaveni.mesic === 'minuly' ? mesicPred(tento) : tento;
  const [mesic, setMesic] = useState(vychozi);
  useEffect(() => setMesic(vychozi), [vychozi]);
  const [vybrany, setVybrany] = useState<string | null>(null);
  // Tým jen s uzaverky.zobrazit_vse (jinak server stejně vrátí jen vlastní dny).
  const tym = (nastaveni.rozsah ?? 'tym') === 'tym' && smi('uzaverky.zobrazit_vse');
  const ceka = !nacteno && !chybaOpravneni;
  // Tablet kalendář nemá (sdílená obrazovka) — server mu vrací prázdno, neptáme se.
  const tablet = role?.typ === 'kiosk';
  const data = useDataWidgetu(!ceka && !tablet ? `/api/closings/calendar?month=${mesic}${tym ? '' : '&scope=me'}` : null, raw => {
    if (!raw || typeof raw !== 'object' || typeof raw.days !== 'object') throw new Error('Kalendář přišel v nečekaném tvaru.');
    return raw.days as Record<string, DenKalendare>;
  });

  // Klepnutí na den zúží seznam uzávěrek (na stránce Uzávěrky hned, odjinud po přechodu).
  useEffect(() => {
    const zmena = (e: Event) => { setVybrany(((e as CustomEvent).detail?.hodnota as string) || null); };
    window.addEventListener(`${UDALOST_DEN}:stav`, zmena);
    return () => window.removeEventListener(`${UDALOST_DEN}:stav`, zmena);
  }, []);
  const muzeFiltrovat = !nahled && tym && nav.smiPohled('reports');

  if (tablet) return <Widget prazdno={null} />;

  const dny = data.data ?? {};
  const dnes = pragueToday();
  const bunky = bunkyMesice(mesic, zacatekTydne(weekStart));
  const zkratky = zkratkyDnu(zacatekTydne(weekStart));
  const vMesici = Object.keys(dny).filter(d => d.slice(0, 7) === mesic);
  const hotovych = vMesici.filter(d => dny[d].hasClosing).length;
  const chybi = vMesici.filter(d => stavDne(dny[d], d, dnes) === 'chybi').length;
  const trzba = vMesici.reduce((s, d) => s + (Number(dny[d].revenue) || 0), 0);
  const M = velikost === 'M';

  return (
    <Widget nacteni={ceka ? CEKA : data} kostra="graf">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthNav value={mesic} onChange={m => setMesic(m)} max={tento} />
        <p className="t-meta tabular-nums">
          {czCount(hotovych, UZAVERKA)}
          {chybi > 0 && <span className="text-bad-ink font-semibold"> · {chybi} chybí</span>}
          {trzba > 0 && !M && <span> · tržba {money(trzba)}</span>}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label="Uzávěrky po dnech">
        {zkratky.map(z => <div key={z} role="columnheader" className="text-center text-[11px] font-semibold text-black/45 pb-1">{z}</div>)}
        {bunky.map((d, i) => {
          if (!d) return <div key={`p${i}`} aria-hidden />;
          const den = dny[d];
          const stav = stavDne(den, d, dnes);
          const cisloDne = Number(d.slice(8, 10));
          const vybranyDen = vybrany === d;
          const revenue = Number(den?.revenue) || 0;
          const popis = `${cisloDne}. ${Number(d.slice(5, 7))}. — ${POPIS_STAVU[stav]}${stav === 'hotovo' && revenue > 0 ? `, tržba ${money(revenue)}` : ''}${den?.onShift?.length ? `, na směně ${den.onShift.map(p => p.name).join(', ')}` : ''}`;
          const obsah = (
            <>
              <span className={`text-[11px] font-semibold leading-none mt-0.5 tabular-nums ${d === dnes ? 'text-[#16181A] underline underline-offset-2' : 'text-black/55'}`}>{cisloDne}</span>
              {!M && stav === 'hotovo' && revenue > 0 && <span className="text-[11px] leading-none font-semibold text-ok-ink tabular-nums truncate max-w-full">{kratce(revenue)}</span>}
              {!M && stav !== 'hotovo' && (den?.onShift?.length ?? 0) > 0 && <span className="text-[11px] leading-none text-black/45 tabular-nums">{den!.onShift.length}×</span>}
              <span aria-hidden className={`mt-auto h-1.5 w-1.5 rounded-full ${TECKA[stav]}`} />
            </>
          );
          const tvar = `${M ? 'h-10' : 'aspect-square'} min-w-0 rounded-xl p-1 flex flex-col items-center justify-start gap-0.5 ${vybranyDen ? 'ring-2 ring-[#16181A]/40' : ''} ${den ? 'bg-black/[0.03]' : ''}`;
          return muzeFiltrovat ? (
            <button key={d} type="button" title={popis} aria-label={popis} aria-pressed={vybranyDen}
              onClick={() => predejNastroji(nav, UDALOST_DEN, KLIC_DEN, vybranyDen ? '' : d, vybranyDen ? null : 'reports')}
              className={`${tvar} transition-colors hover:bg-black/[0.06]`}>
              {obsah}
            </button>
          ) : (
            <div key={d} role="gridcell" title={popis} aria-label={popis} className={tvar}>{obsah}</div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 t-meta">
        <span className="flex items-center gap-1.5"><span aria-hidden className={`h-2 w-2 rounded-full ${TECKA.hotovo}`} /> Hotová</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className={`h-2 w-2 rounded-full ${TECKA.chybi}`} /> Chybí</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className={`h-2 w-2 rounded-full ${TECKA.ceka}`} /> Čeká</span>
      </div>
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Moje uzávěrky (historie)
// ---------------------------------------------------------------------------

function MojeHistorie({ velikost, nastaveni, nahled }: WidgetProps<{ pocet?: string }>) {
  const { ok, ceka } = useBrana(['uzaverky.vytvorit']);
  const smi = useSmi();
  const money = useMoney();
  const data = useDataWidgetu(ok ? URL_SEZNAM : null, vyberSeznam);
  const [mazat, setMazat] = useState<RadekUzaverky | null>(null);
  const [pracuji, setPracuji] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const moje = useMemo(() => mojeUzaverky(data.data?.radky ?? [], data.data?.meId ?? null), [data.data]);

  if (!ok && !ceka) return <Widget prazdno={null} />;

  // Nastavení „Kolik řádků"; M má strop 5 řádků (DP §3.6), L až 10.
  const pocet = Math.min(Number(nastaveni.pocet) || 3, velikost === 'M' ? 5 : 10);
  const smiMazat = !nahled && (smi('uzaverky.mazat_vlastni') || smi('uzaverky.mazat'));
  const vyplata = data.data?.payDailyCash === true;

  const smaz = async () => {
    if (!mazat) return;
    setPracuji(true); setChyba(null);
    try {
      await okJson(await fetch(`/api/closings/${mazat.id}`, { method: 'DELETE' }));
      obnovDataWidgetu(URL_SEZNAM);
      setMazat(null);
    } catch (e) { setChyba(apiMessage(e, 'Uzávěrka se nesmazala.')); }
    setPracuji(false);
  };

  return (
    <Widget nacteni={ceka ? CEKA : data}
      prazdno={moje.length === 0 ? <p className="t-meta text-pretty">Zatím žádná uzávěrka. Po směně ji vyplníš ve formuláři na téhle stránce.</p> : undefined}>
      {chyba && <p className="note note-danger text-sm mb-2" role="alert">{chyba}</p>}
      <ul className="list">
        {moje.slice(0, pocet).map(c => {
          const r = rozdilUzaverky(c);
          const castky = [
            `hotově ${money(Number(c.cash_revenue) || 0)}`,
            `kartou ${money(Number(c.card_revenue) || 0)}`,
            (Number(c.cash_removed) || 0) > 0 ? `odloženo ${money(Number(c.cash_removed))}` : null,
            vyplata && (Number(c.self_payout) || 0) > 0 ? `výplata ${money(Number(c.self_payout))}` : null,
          ].filter(Boolean).join(' · ');
          return (
            <ListRow key={c.id}
              title={<span className="cz-sentence block truncate">{denVetou(denUzaverky(c))}{c.shift_label ? ` · ${c.shift_label}` : ''}</span>}
              meta={castky}
              right={<>
                {c.approved === false && <Chip tone="wait" size="sm">Čeká na schválení</Chip>}
                {r != null && <RozdilChip rozdil={r} money={money} />}
              </>}
              actions={smiMazat ? (
                <Menu size="sm" label={`Další akce s uzávěrkou ${denVetou(denUzaverky(c))}`}
                  items={[{ label: 'Smazat uzávěrku…', icon: 'trash', danger: true, hint: 'Pak ji můžeš vyplnit znovu správně.', onClick: () => setMazat(c) }]} />
              ) : undefined}
            />
          );
        })}
      </ul>
      <ADalsich n={moje.length - pocet} />
      {mazat && (
        <Modal open onClose={() => setMazat(null)} size="sm" title="Smazat uzávěrku?" subtitle={denVetou(denUzaverky(mazat))}
          footer={<>
            <Button variant="secondary" onClick={() => setMazat(null)}>Zrušit</Button>
            <Button variant="danger-solid" icon="trash" loading={pracuji} onClick={smaz}>Smazat</Button>
          </>}>
          <p className="text-sm text-black/60">Po smazání ji můžeš vyplnit znovu správně.</p>
        </Modal>
      )}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'uzaverky.predavka': PredavkaWidget,
  'uzaverky.moje_uzaverka': MojeUzaverka,
  'uzaverky.chybejici': Chybejici,
  'uzaverky.ke_schvaleni': KeSchvaleni,
  'uzaverky.souhrn': Souhrn,
  'uzaverky.rozdil_kasy': RozdilPokladny,
  'uzaverky.trendy': Trendy,
  'uzaverky.mesic_v_cislech': MesicVCislech,
  'uzaverky.kalendar': Kalendar,
  'uzaverky.moje_historie': MojeHistorie,
};
