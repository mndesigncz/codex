'use client';

// Widgety oblasti „Managero client" — komponenty (kolo 68, spec §2.5, §2.6 a §6.1).
//
// Vlastník v kole 69: balík B8 (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/klient.ts,
// tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — test AK-20 (scripts/testy/k68-widgety.ts) klíče čte z textu, proto bez spreadu.
//
// Co z dřívějšího Přehledu opravují (audit Přehledu vedení a Domů zaměstnance):
//  - Hosté a věrnost: StatRow se Stat místo ručně skládané řady (štítky
//    `text-[11px] uppercase`, čísla 24 px, tlačítka s oblými rohy, které
//    ohýbaly dělicí linku). Čísla přes toLocaleString('cs-CZ') — dřív ruční
//    `replace('.', ',')` — a tvary po číslovce přes czCount („1 nízké", ne
//    „1 nízkých"). Každé číslo jen se svým klíčem (N13: /api/client/admin/summary
//    pošle všechno každému s klient.prehled, ale Hosty smí vidět jen ten, kdo
//    má zakaznici.zobrazit). Chipy „objednávka čeká" a „rezervace ke schválení"
//    se přestěhovaly do „Čeká na tebe"; proklik do Clientu jde přes navigaci
//    layoutu, ne přes window.location (celé nové načtení stránky).
//  - Objednávky od stolu: logika z StaffInbox (obnova po 20 s, pípnutí při
//    nové objednávce, přijmout / hotovo / odmítnout / poslat do kasy), ale
//    v jazyce plochy: `.list` + ListRow místo bílých boxů v oranžové kartě,
//    Chip místo ručně barvených pilulek, „Přijmout" `primary` místo limetky
//    (limetka je na ploše jen „Hotovo" v úpravách) a odmítnutí přes okno
//    místo confirm(). StaffInbox sám upraví B8; tady se nemění.
//
// Data jen přes useDataWidgetu (sdílená mezipaměť — „Čeká na tebe" čte tentýž
// příjem), dotaz až při `nacteno && ma(klíč)` (spec §1.5). V náhledu (galerie)
// se nic nezapisuje, neobnovuje ani nepípá.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { apiMessage } from '@/lib/api';
import { czCount, czForm, type CzNoun } from '@/lib/czech';
import { dbTimeHM, parseDbTime } from '@/lib/pragueTime';
import { useMoney } from '../../CurrencyProvider';
import { Button, Chip, EmptyState, ListRow, Menu, Modal, Stat, StatRow, type MenuItem } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { Widget, useWidget, type StavNacteni } from '../Widget';
import { useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';

// ---------------------------------------------------------------------------
// Společné drobnosti
// ---------------------------------------------------------------------------

type Klic = string | readonly string[];

const seznam = (x: unknown): any[] => (Array.isArray(x) ? x : []);
const cislo = (n: number) => n.toLocaleString('cs-CZ');
const aDalsich = (n: number) => `…a ${czForm(n, { one: 'další', few: 'další', many: 'dalších' })} ${cislo(n)}`;

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

// ---------------------------------------------------------------------------
// Hosté a věrnost
// ---------------------------------------------------------------------------

const ID_HOSTE = 'klient.hoste_vernost';

interface Souhrn {
  zapnuto: boolean;
  clenu: number;
  novychClenu30: number;
  objednavkyDnes: number;
  objednavkyNove: number;
  rezervaceDnes: number;
  rezervaceCekaji: number;
  prumer: number | null;
  hodnoceni7: number;
  nizkych7: number;
}

function vyberSouhrn(raw: any): Souhrn {
  const n = (v: unknown) => Number(v) || 0;
  const avg = raw?.reviews?.avg;
  return {
    zapnuto: raw?.enabled === true,
    clenu: n(raw?.members),
    novychClenu30: n(raw?.newMembers30),
    objednavkyDnes: n(raw?.orders?.today),
    objednavkyNove: n(raw?.orders?.new),
    rezervaceDnes: n(raw?.reservations?.today),
    rezervaceCekaji: n(raw?.reservations?.requested),
    prumer: avg == null || !Number.isFinite(Number(avg)) ? null : Number(avg),
    hodnoceni7: n(raw?.reviews?.new7),
    nizkych7: n(raw?.reviews?.low7),
  };
}

const NIZKE: CzNoun = { one: 'nízké', few: 'nízká', many: 'nízkých' };
const NOVE_HODNOCENI: CzNoun = { one: 'nové', few: 'nová', many: 'nových' };
const CEKAJICI_OBJEDNAVKA: CzNoun = { one: 'nová čeká', few: 'nové čekají', many: 'nových čeká' };
const CEKAJICI_REZERVACE: CzNoun = { one: 'čeká na potvrzení', few: 'čekají na potvrzení', many: 'čeká na potvrzení' };
const REZERVACE: CzNoun = { one: 'rezervace', few: 'rezervace', many: 'rezervací' };

function HosteAVernost({ velikost }: WidgetProps) {
  const smi = useSmi();
  const nav = useNavigace();
  const { ok, ceka } = useBrana(widget(ID_HOSTE)?.opravneni.vse ?? ['klient.prehled']);
  const data = useDataWidgetu(ok ? '/api/client/admin/summary' : null, vyberSouhrn);
  const smiCast = (cast: string) => { const k = klicCasti(ID_HOSTE, cast); return !!k && smi(k); };
  const vidi = { clenove: smiCast('clenove'), objednavky: smiCast('objednavky'), rezervace: smiCast('rezervace'), hodnoceni: smiCast('hodnoceni') };
  const s = data.data;
  const L = velikost === 'L';

  // Každé číslo jen se svým klíčem. Střední widget nese tři čísla (StatRow do tří,
  // DP §5.2) — rezervace pak jdou do poznámky pod objednávkami; velký má čtyři.
  const cisla: React.ReactNode[] = [];
  if (s) {
    if (vidi.clenove) {
      cisla.push(<Stat key="clenove" label="Členů" value={cislo(s.clenu)} note={`+${cislo(s.novychClenu30)} za 30 dní`} />);
    }
    if (vidi.objednavky) {
      const poznamka = s.objednavkyNove > 0 ? czCount(s.objednavkyNove, CEKAJICI_OBJEDNAVKA)
        : !L && vidi.rezervace ? `${czCount(s.rezervaceDnes, REZERVACE)} dnes`
        : 'vše vyřízeno';
      cisla.push(<Stat key="objednavky" label="Od stolu dnes" value={cislo(s.objednavkyDnes)} note={poznamka} />);
    }
    if (vidi.rezervace && (L || !vidi.objednavky)) {
      cisla.push(
        <Stat key="rezervace" label="Rezervace dnes" value={cislo(s.rezervaceDnes)}
          note={s.rezervaceCekaji > 0 ? czCount(s.rezervaceCekaji, CEKAJICI_REZERVACE) : 'vše potvrzeno'} />,
      );
    }
    if (vidi.hodnoceni) {
      cisla.push(
        <Stat key="hodnoceni" label="Hodnocení"
          value={s.prumer != null ? s.prumer.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–'}
          unit={s.prumer != null ? '/ 5' : undefined}
          note={s.nizkych7 > 0
            ? <span className="text-wait-ink">{czCount(s.nizkych7, NIZKE)} za týden</span>
            : `${czCount(s.hodnoceni7, NOVE_HODNOCENI)} za týden`} />,
      );
    }
  }

  let prazdno: React.ReactNode | null | undefined;
  if (s && !s.zapnuto) {
    // Vypnutý Client není chyba ani „nula hostů" — řekne, co zapnutí přinese.
    const nastavi = smi('klient.nastaveni') && nav.smiPohled('klient:settings');
    prazdno = (
      <EmptyState compact icon="cup" title="Managero client je vypnutý"
        hint="Když ho zapneš, hosté si objednají od stolu, rezervují si místo a sbírají body."
        action={nastavi ? <Button variant="secondary" size="sm" onClick={() => nav.onNavigate('klient:settings')}>Nastavit Managero client</Button> : undefined} />
    );
  } else if (s && cisla.length === 0) {
    // Klient.prehled bez jediného dalšího klíče: není co ukázat a nula by lhala.
    prazdno = null;
  }

  return (
    <Widget nacteni={ceka ? CEKA : data} odkaz={{ popisek: 'Managero client', pohled: 'klient:overview' }} prazdno={prazdno}>
      <StatRow>{cisla}</StatRow>
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Objednávky od stolu
// ---------------------------------------------------------------------------

const ID_OBJEDNAVKY = 'klient.objednavky_od_stolu';
const URL_PRIJEM = '/api/client/staff/inbox';
/** Objednávku je potřeba potvrdit do pár minut, jinak host zbytečně čeká — stejně jako dřív v StaffInbox. */
const OBNOVA_PRIJMU_MS = 20_000;

interface RadekObjednavky { name: string; count: number }

interface Objednavka {
  id: number;
  stav: string;
  polozky: RadekObjednavky[];
  celkem: number;
  vytvoreno: string;
  host: string;
  stul: string | null;
  vKase: boolean;
}

interface Prijem {
  objednavky: Objednavka[];
  /** Je připojená pokladna? Bez ní „není v kase" nic neznamená. */
  kasa: boolean;
}

function vyberPrijem(raw: any): Prijem {
  return {
    objednavky: seznam(raw?.orders).map((o: any) => ({
      id: Number(o.id),
      stav: String(o.status ?? 'new'),
      polozky: seznam(o.items).map((l: any) => ({ name: String(l?.name ?? ''), count: Number(l?.count) || 0 })),
      celkem: Number(o.total) || 0,
      vytvoreno: String(o.created_at ?? ''),
      host: String(o.customer_name ?? 'Host'),
      stul: typeof o.table_name === 'string' && o.table_name ? o.table_name : null,
      vKase: !!o.storyous_order_id,
    })),
    kasa: raw?.pos?.connected === true,
  };
}

/** „před 3 min", starší s časem. Čas z databáze přes parseDbTime — nese UTC bez zóny. */
function kdy(iso: string): string {
  const d = parseDbTime(iso);
  if (!d) return '';
  const minut = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (minut < 1) return 'právě teď';
  if (minut < 2) return 'před minutou';
  if (minut < 60) return `před ${minut} min`;
  return `v ${dbTimeHM(iso)}`;
}

// Pípnutí při nové objednávce (tablet na baru bývá bez očí). Viděné objednávky
// si pamatuje modul, ne komponenta: návrat na Přehled nemá pípat znovu za tutéž.
const zapipnute = new Set<number>();
let zvuk: AudioContext | null = null;
function pipni() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!zvuk) zvuk = new Ctx();
    const osc = zvuk.createOscillator();
    const hlasitost = zvuk.createGain();
    osc.frequency.value = 880;
    hlasitost.gain.value = 0.04;
    osc.connect(hlasitost);
    hlasitost.connect(zvuk.destination);
    osc.start();
    osc.stop(zvuk.currentTime + 0.18);
  } catch { /* bez zvuku — prohlížeč ho nepustil */ }
}

type Zmena = { status: 'confirmed' | 'done' | 'declined' } | { action: 'pos' };
interface Hlaska { text: string; ton: 'ok' | 'bad' }

function hlaskaPoZmene(z: Zmena, x: any): Hlaska {
  const poznamkaKasy = typeof x?.posNote === 'string' && x.posNote ? x.posNote : null;
  if ('action' in z) {
    return x?.ok ? { text: poznamkaKasy ?? 'Objednávka je v pokladně.', ton: 'ok' } : { text: poznamkaKasy ?? 'Do pokladny to nešlo.', ton: 'bad' };
  }
  if (poznamkaKasy) return { text: poznamkaKasy, ton: 'ok' };
  if (z.status === 'done') {
    return { text: x?.loyalty?.stamp?.rewarded ? 'Hotovo. Host nasbíral všechna razítka a má odměnu.' : 'Hotovo. Body připsány.', ton: 'ok' };
  }
  if (z.status === 'declined') return { text: 'Objednávka odmítnuta — host dostane zprávu.', ton: 'ok' };
  return { text: 'Objednávka přijata.', ton: 'ok' };
}

function RadekFronty({ o, kasa, vyridi, pracuje, onZmena, onOdmitnout }: {
  o: Objednavka;
  kasa: boolean;
  vyridi: boolean;
  pracuje: boolean;
  onZmena: (z: Zmena) => void;
  onOdmitnout: () => void;
}) {
  const money = useMoney();
  const polozky = o.polozky.map(p => `${p.count}× ${p.name}`).join(', ');
  const meta = [polozky || 'Bez položek', kdy(o.vytvoreno), kasa && !o.vKase ? 'není v kase' : null].filter(Boolean).join(' · ');
  // Nejvýš dvě akce v řádku: hlavní vidět, zbytek (a nebezpečné na konci) v nabídce (DP §3.6).
  const dalsi: MenuItem[] = [
    ...(kasa && !o.vKase ? [{ label: 'Poslat do kasy', icon: 'receipt', onClick: () => onZmena({ action: 'pos' }) }] : []),
    ...(o.stav === 'new' ? [{ label: 'Odmítnout…', icon: 'close', danger: true, onClick: onOdmitnout }] : []),
  ];
  return (
    <ListRow
      title={`${o.stul ?? 'Bez stolu'} · ${o.host}`}
      meta={meta}
      value={money(o.celkem)}
      // Stav řekne tlačítko (Přijmout / Hotovo); kdo objednávky jen vidí, dostane ho Chipem.
      right={!vyridi ? <Chip tone={o.stav === 'new' ? 'wait' : 'ok'} size="sm">{o.stav === 'new' ? 'Nová' : 'Připravuje se'}</Chip> : undefined}
      actions={vyridi ? (
        <>
          {/* Stůl v přístupném názvu — tři „Přijmout" za sebou by odečítač nerozlišil. */}
          {o.stav === 'new'
            ? <Button variant="primary" size="sm" icon="check" loading={pracuje} onClick={() => onZmena({ status: 'confirmed' })}
                aria-label={`Přijmout: ${o.stul ?? 'bez stolu'}, ${o.host}`}>Přijmout</Button>
            : <Button variant="primary" size="sm" loading={pracuje} onClick={() => onZmena({ status: 'done' })}
                aria-label={`Hotovo: ${o.stul ?? 'bez stolu'}, ${o.host}`}>Hotovo</Button>}
          {dalsi.length > 0 && <Menu size="sm" label={`Další akce s objednávkou ${o.stul ?? o.host}`} items={dalsi} />}
        </>
      ) : undefined} />
  );
}

function ObjednavkyOdStolu({ velikost }: WidgetProps) {
  const smi = useSmi();
  const nav = useNavigace();
  const { nahled } = useWidget();
  const { ok, ceka } = useBrana(widget(ID_OBJEDNAVKY)?.opravneni.vse ?? ['objednavky.zobrazit']);
  const url = ok ? URL_PRIJEM : null;
  const data = useDataWidgetu(url, vyberPrijem);
  const { reload } = data;
  const klic = klicCasti(ID_OBJEDNAVKY, 'akce:vyridit');
  // Přijmout, hotovo i odmítnutí jen s objednavky.vyridit — bez něj jen přehled.
  const vyridi = !!klic && smi(klic);
  const [pracuji, setPracuji] = useState<number | null>(null);
  const [hlaska, setHlaska] = useState<Hlaska | null>(null);
  const [odmitam, setOdmitam] = useState<Objednavka | null>(null);

  // Obnova: příjem se jinak dozví o nové objednávce až za 30 s (mezipaměť) nebo po
  // návratu do karty. Jen na viditelné kartě a nikdy v náhledu galerie.
  useEffect(() => {
    if (nahled || !url) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, OBNOVA_PRIJMU_MS);
    const naNavrat = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', naNavrat);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', naNavrat); };
  }, [nahled, url, reload]);

  useEffect(() => {
    if (nahled) return;
    let nova = false;
    for (const o of data.data?.objednavky ?? []) {
      if (o.stav === 'new' && !zapipnute.has(o.id)) { zapipnute.add(o.id); nova = true; }
    }
    if (nova) pipni();
  }, [data.data, nahled]);

  useEffect(() => {
    if (!hlaska) return;
    const t = setTimeout(() => setHlaska(null), 4500);
    return () => clearTimeout(t);
  }, [hlaska]);

  const zmenit = async (o: Objednavka, z: Zmena) => {
    if (nahled || pracuji != null) return;
    setPracuji(o.id);
    setHlaska(null);
    try {
      const res = await fetch(URL_PRIJEM, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: o.id, ...z }),
      });
      const x = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof x?.error === 'string' ? x.error : 'Stav objednávky se nepodařilo změnit.');
      setHlaska(hlaskaPoZmene(z, x));
    } catch (e) {
      setHlaska({ text: apiMessage(e, 'Spojení se serverem selhalo.'), ton: 'bad' });
    } finally {
      setPracuji(null);
      reload();
    }
  };

  const vse = data.data?.objednavky ?? [];
  const nove = vse.filter(o => o.stav === 'new');
  const vPriprave = vse.filter(o => o.stav === 'confirmed');
  const fronta = [...nove, ...vPriprave];
  const kasa = data.data?.kasa ?? false;

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : data}
        otevrit={nav.smiPohled('klient:orders') ? () => nav.onNavigate('klient:orders') : undefined}>
        <Stat label="Nové" value={cislo(nove.length)} note={vPriprave.length > 0 ? `${cislo(vPriprave.length)} v přípravě` : 'od stolu'} />
      </Widget>
    );
  }

  const M = velikost === 'M';
  const videt = M ? fronta.slice(0, 5) : fronta;
  return (
    <>
      <Widget nacteni={ceka ? CEKA : data} odkaz={{ popisek: 'Objednávky', pohled: 'klient:orders' }}
        doplnek={nove.length > 0 ? <Chip tone="wait" size="sm">{cislo(nove.length)}</Chip> : undefined}
        prazdno={fronta.length === 0 && !hlaska ? <p className="t-meta">Žádná objednávka od stolu teď nečeká.</p> : undefined}>
        <div className="space-y-3">
          {hlaska && (
            <p className={`note ${hlaska.ton === 'ok' ? 'note-ok' : 'note-danger'}`} role={hlaska.ton === 'ok' ? 'status' : 'alert'}>{hlaska.text}</p>
          )}
          {videt.length > 0 && (
            <ul className="list">
              {videt.map(o => (
                <RadekFronty key={o.id} o={o} kasa={kasa} vyridi={vyridi} pracuje={pracuji === o.id}
                  onZmena={z => { void zmenit(o, z); }} onOdmitnout={() => setOdmitam(o)} />
              ))}
            </ul>
          )}
          {M && fronta.length > 5 && <p className="t-meta">{aDalsich(fronta.length - 5)}</p>}
        </div>
      </Widget>
      {odmitam && !nahled && (
        <NadPlochou>
          <Modal open onClose={() => setOdmitam(null)} size="sm" title="Odmítnout objednávku?"
            footer={<>
              <Button variant="secondary" onClick={() => setOdmitam(null)}>Zrušit</Button>
              <Button variant="danger-solid" onClick={() => { const o = odmitam; setOdmitam(null); void zmenit(o, { status: 'declined' }); }}>Odmítnout</Button>
            </>}>
            <p className="text-sm text-black/70 text-pretty">
              {odmitam.stul ? `Host u stolu ${odmitam.stul}` : 'Host'} dostane zprávu, že objednávka nebyla přijata.
            </p>
          </Modal>
        </NadPlochou>
      )}
    </>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'klient.hoste_vernost': HosteAVernost,
  'klient.objednavky_od_stolu': ObjednavkyOdStolu,
};
