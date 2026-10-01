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
//    Z StaffInbox je převzatá i sbalená „Kartička hosta u kasy" (CardScan):
//    Domů zaměstnance dřív kreslilo StaffInbox vždy a obsluha tam kartičku
//    načítala z telefonu — bez ní by denní úkon u kasy zmizel ze
//    zaměstnaneckého rozhraní úplně (review kola 68). Jen s vernost.karta,
//    jen od M výš a nikdy v náhledu.
//
// Data jen přes useDataWidgetu (sdílená mezipaměť — „Čeká na tebe" čte tentýž
// příjem), dotaz až při `nacteno && ma(klíč)` (spec §1.5). V náhledu (galerie)
// se nic nezapisuje, neobnovuje ani nepípá.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { apiMessage } from '@/lib/api';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { dbTimeDayHM, dbTimeHM, parseDbTime } from '@/lib/pragueTime';
import { useCurrency, useMoney } from '../../CurrencyProvider';
import { BarSpark, Button, Checklist, Chip, EmptyState, ListRow, Menu, Modal, Stat, StatRow, type MenuItem } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { Widget, useWidget, type StavNacteni } from '../Widget';
import { obnovDataWidgetu, useDataWidgetu } from '../useDataWidgetu';
import {
  RAZENI_CLENU, TON_REZERVACE, hlavniKrok, klicPrechodu, krokyPropojeni, muzeDo, nejvernejsi, prumerCesky, seradDnes, souhrnDne,
  vyberCleny, vyberHodnoceni, vyberRezervace, vyberVernost, type RazeniClenu, type Rezervace, type StavRezervace, type KrokPropojeni,
} from '@/lib/klientPrehled';
import { RES_STATUS, czDay } from '@/lib/clientSlots';
import { useNavigace, useSmi } from '../NavigaceKontext';
import { Icon } from '../../Icons';
import CardScan from '../../client/CardScan';

// ---------------------------------------------------------------------------
// Společné drobnosti
// ---------------------------------------------------------------------------

type Klic = string | readonly string[];

const seznam = (x: unknown): any[] => (Array.isArray(x) ? x : []);
const cislo = (n: number) => n.toLocaleString('cs-CZ');
const aDalsich = (n: number, t: PrekladFn) => t('…a {n, plural, one {# další} few {# další} other {# dalších}}', { n });

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

// Tvary po číslovce (dřív CzNoun + czCount): jedna věta s plurálem, ať jde přeložit celá.
const nizke = (n: number, t: PrekladFn) => t('{n, plural, one {# nízké} few {# nízká} other {# nízkých}}', { n });
const cekajiciObjednavka = (n: number, t: PrekladFn) => t('{n, plural, one {# nová čeká} few {# nové čekají} other {# nových čeká}}', { n });
const cekajiciRezervace = (n: number, t: PrekladFn) => t('{n, plural, one {# čeká na potvrzení} few {# čekají na potvrzení} other {# čeká na potvrzení}}', { n });
const osoby = (n: number, t: PrekladFn) => t('{n, plural, one {# osoba} few {# osoby} other {# osob}}', { n });
const hodnoceniPocet = (n: number, t: PrekladFn) => t('{n, plural, one {# hodnocení} few {# hodnocení} other {# hodnocení}}', { n });

function HosteAVernost({ velikost }: WidgetProps) {
  const t = useT('widgety');
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
      cisla.push(<Stat key="clenove" label={t('Členů')} value={cislo(s.clenu)} note={t('+{n} za 30 dní', { n: cislo(s.novychClenu30) })} />);
    }
    if (vidi.objednavky) {
      const poznamka = s.objednavkyNove > 0 ? cekajiciObjednavka(s.objednavkyNove, t)
        : !L && vidi.rezervace ? t('{n, plural, one {# rezervace} few {# rezervace} other {# rezervací}} dnes', { n: s.rezervaceDnes })
        : t('vše vyřízeno');
      cisla.push(<Stat key="objednavky" label={t('Od stolu dnes')} value={cislo(s.objednavkyDnes)} note={poznamka} />);
    }
    if (vidi.rezervace && (L || !vidi.objednavky)) {
      cisla.push(
        <Stat key="rezervace" label={t('Rezervace dnes')} value={cislo(s.rezervaceDnes)}
          note={s.rezervaceCekaji > 0 ? cekajiciRezervace(s.rezervaceCekaji, t) : t('vše potvrzeno')} />,
      );
    }
    if (vidi.hodnoceni) {
      cisla.push(
        <Stat key="hodnoceni" label={t('Hodnocení')}
          value={s.prumer != null ? s.prumer.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–'}
          unit={s.prumer != null ? '/ 5' : undefined}
          note={s.nizkych7 > 0
            ? <span className="text-wait-ink">{t('{n, plural, one {# nízké} few {# nízká} other {# nízkých}} za týden', { n: s.nizkych7 })}</span>
            : t('{n, plural, one {# nové} few {# nová} other {# nových}} za týden', { n: s.hodnoceni7 })} />,
      );
    }
  }

  let prazdno: React.ReactNode | null | undefined;
  if (s && !s.zapnuto) {
    // Vypnutý Client není chyba ani „nula hostů" — řekne, co zapnutí přinese.
    const nastavi = smi('klient.nastaveni') && nav.smiPohled('klient:settings');
    prazdno = (
      <EmptyState compact icon="cup" title={t('Managero client je vypnutý')}
        hint={t('Když ho zapneš, hosté si objednají od stolu, rezervují si místo a sbírají body.')}
        action={nastavi ? <Button variant="secondary" size="sm" onClick={() => nav.onNavigate('klient:settings')}>{t('Nastavit Managero client')}</Button> : undefined} />
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
function kdy(iso: string, t: PrekladFn): string {
  const d = parseDbTime(iso);
  if (!d) return '';
  const minut = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (minut < 1) return t('právě teď');
  if (minut < 2) return t('před minutou');
  if (minut < 60) return t('před {n} min', { n: minut });
  return t('v {cas}', { cas: dbTimeHM(iso) });
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

function hlaskaPoZmene(z: Zmena, x: any, t: PrekladFn): Hlaska {
  const poznamkaKasy = typeof x?.posNote === 'string' && x.posNote ? x.posNote : null;
  if ('action' in z) {
    return x?.ok ? { text: poznamkaKasy ?? t('Objednávka je v pokladně.'), ton: 'ok' } : { text: poznamkaKasy ?? t('Do pokladny to nešlo.'), ton: 'bad' };
  }
  if (poznamkaKasy) return { text: poznamkaKasy, ton: 'ok' };
  if (z.status === 'done') {
    return { text: x?.loyalty?.stamp?.rewarded ? t('Hotovo. Host nasbíral všechna razítka a má odměnu.') : t('Hotovo. Body připsány.'), ton: 'ok' };
  }
  if (z.status === 'declined') return { text: t('Objednávka odmítnuta — host dostane zprávu.'), ton: 'ok' };
  return { text: t('Objednávka přijata.'), ton: 'ok' };
}

function RadekFronty({ o, kasa, vyridi, pracuje, onZmena, onOdmitnout }: {
  o: Objednavka;
  kasa: boolean;
  vyridi: boolean;
  pracuje: boolean;
  onZmena: (z: Zmena) => void;
  onOdmitnout: () => void;
}) {
  const t = useT('widgety');
  const money = useMoney();
  const polozky = o.polozky.map(p => `${p.count}× ${p.name}`).join(', ');
  const meta = [polozky || t('Bez položek'), kdy(o.vytvoreno, t), kasa && !o.vKase ? t('není v kase') : null].filter(Boolean).join(' · ');
  // Nejvýš dvě akce v řádku: hlavní vidět, zbytek (a nebezpečné na konci) v nabídce (DP §3.6).
  const dalsi: MenuItem[] = [
    ...(kasa && !o.vKase ? [{ label: t('Poslat do kasy'), icon: 'receipt', onClick: () => onZmena({ action: 'pos' }) }] : []),
    ...(o.stav === 'new' ? [{ label: t('Odmítnout…'), icon: 'close', danger: true, onClick: onOdmitnout }] : []),
  ];
  return (
    <ListRow
      title={`${o.stul ?? t('Bez stolu')} · ${o.host}`}
      meta={meta}
      value={money(o.celkem)}
      // Stav řekne tlačítko (Přijmout / Hotovo); kdo objednávky jen vidí, dostane ho Chipem.
      right={!vyridi ? <Chip tone={o.stav === 'new' ? 'wait' : 'ok'} size="sm">{o.stav === 'new' ? t('Nová') : t('Připravuje se')}</Chip> : undefined}
      actions={vyridi ? (
        <>
          {/* Stůl v přístupném názvu — tři „Přijmout" za sebou by odečítač nerozlišil. */}
          {o.stav === 'new'
            ? <Button variant="primary" size="sm" icon="check" loading={pracuje} onClick={() => onZmena({ status: 'confirmed' })}
                aria-label={t('Přijmout: {stul}, {host}', { stul: o.stul ?? t('bez stolu'), host: o.host })}>{t('Přijmout')}</Button>
            : <Button variant="primary" size="sm" loading={pracuje} onClick={() => onZmena({ status: 'done' })}
                aria-label={t('Hotovo: {stul}, {host}', { stul: o.stul ?? t('bez stolu'), host: o.host })}>{t('Hotovo')}</Button>}
          {dalsi.length > 0 && <Menu size="sm" label={t('Další akce s objednávkou {nazev}', { nazev: o.stul ?? o.host })} items={dalsi} />}
        </>
      ) : undefined} />
  );
}

function ObjednavkyOdStolu({ velikost }: WidgetProps) {
  const t = useT('widgety');
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
  const klicKarty = klicCasti(ID_OBJEDNAVKY, 'akce:karta');
  const kartu = !nahled && !!klicKarty && smi(klicKarty);
  const [pracuji, setPracuji] = useState<number | null>(null);
  const [hlaska, setHlaska] = useState<Hlaska | null>(null);
  const [odmitam, setOdmitam] = useState<Objednavka | null>(null);

  // Obnova: příjem se jinak dozví o nové objednávce až za 30 s (mezipaměť) nebo po
  // návratu do karty. Jen na viditelné kartě a nikdy v náhledu galerie.
  useEffect(() => {
    if (nahled || !url) return;
    const casovac = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, OBNOVA_PRIJMU_MS);
    const naNavrat = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', naNavrat);
    return () => { clearInterval(casovac); document.removeEventListener('visibilitychange', naNavrat); };
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
    const casovac = setTimeout(() => setHlaska(null), 4500);
    return () => clearTimeout(casovac);
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
      if (!res.ok) throw new Error(typeof x?.error === 'string' ? x.error : t('Stav objednávky se nepodařilo změnit.'));
      setHlaska(hlaskaPoZmene(z, x, t));
    } catch (e) {
      setHlaska({ text: apiMessage(e, t('Spojení se serverem selhalo.')), ton: 'bad' });
    } finally {
      setPracuji(null);
      reload();
      // Odznak „Objednávky N" v doku Clientu čte souhrn — bez obnovy by svítil dál.
      obnovDataWidgetu('/api/client/admin/summary');
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
        <Stat label={t('Nové')} value={cislo(nove.length)} note={vPriprave.length > 0 ? t('{n} v přípravě', { n: cislo(vPriprave.length) }) : t('od stolu')} />
      </Widget>
    );
  }

  const M = velikost === 'M';
  const videt = M ? fronta.slice(0, 5) : fronta;
  // Vyhledání kartičky je nástroj pro chvíli, kdy ji někdo drží v ruce — jeden
  // sbalený řádek, ne obsah, který by objednávkám bral první pohled.
  const karta = kartu ? (
    <details className="group">
      <summary className="tap-target-sm inline-flex items-center gap-2 text-sm font-semibold text-black/60 cursor-pointer hover:text-black list-none">
        <Icon name="card" size={16} />{t('Kartička hosta u kasy')}<Icon name="chevron" size={14} className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2"><CardScan onToast={text => setHlaska({ text, ton: 'ok' })} /></div>
    </details>
  ) : null;
  return (
    <>
      <Widget nacteni={ceka ? CEKA : data} odkaz={{ popisek: t('Objednávky'), pohled: 'klient:orders' }}
        doplnek={nove.length > 0 ? <Chip tone="wait" size="sm">{cislo(nove.length)}</Chip> : undefined}
        // S kartičkou se prázdný stav kreslí v těle: přepnutí mezi `prazdno`
        // a tělem by CardScan odpojilo a načtený host by po hlášce zmizel.
        prazdno={fronta.length === 0 && !hlaska && !karta ? <p className="t-meta">{t('Žádná objednávka od stolu teď nečeká.')}</p> : undefined}>
        <div className="space-y-3">
          {fronta.length === 0 && <p className="t-meta">{t('Žádná objednávka od stolu teď nečeká.')}</p>}
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
          {M && fronta.length > 5 && <p className="t-meta">{aDalsich(fronta.length - 5, t)}</p>}
          {karta}
        </div>
      </Widget>
      {odmitam && !nahled && (
        <NadPlochou>
          <Modal open onClose={() => setOdmitam(null)} size="sm" title={t('Odmítnout objednávku?')}
            footer={<>
              <Button variant="secondary" onClick={() => setOdmitam(null)}>{t('Zrušit', undefined, 'dialog')}</Button>
              <Button variant="danger-solid" onClick={() => { const o = odmitam; setOdmitam(null); void zmenit(o, { status: 'declined' }); }}>{t('Odmítnout')}</Button>
            </>}>
            <p className="text-sm text-black/70 text-pretty">
              {odmitam.stul
                ? t('Host u stolu {stul} dostane zprávu, že objednávka nebyla přijata.', { stul: odmitam.stul })
                : t('Host dostane zprávu, že objednávka nebyla přijata.')}
            </p>
          </Modal>
        </NadPlochou>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Dnešní rezervace
// ---------------------------------------------------------------------------
//
// Dřív blok Přehledu Clientu: ruční seznam `divide-y` s iniciálami 28 px,
// stav jako ručně barvená pilulka a prázdno jako holá věta. Teď `.list`
// + ListRow (čas v pevném sloupci čísel), stav Chipem a akce jen ve velké
// velikosti: Potvrdit (rezervace.schvalovat) a Usadit / Hotovo
// (rezervace.usadit) tmavě `primary` — limetka je na ploše jen „Hotovo"
// v úpravách. Odmítnutí přes okno, ne confirm().

const ID_REZERVACE = 'klient.dnesni_rezervace';
const URL_REZERVACE_DNES = '/api/client/admin/reservations?range=today';

/** Meta řádek rezervace: počet osob, stůl, e-mail (jen když ho API poslalo — zakaznici.kontakty). */
function metaRezervace(r: Rezervace, t: PrekladFn): string {
  return [osoby(r.osob, t), r.stul ?? t('bez stolu'), r.email].filter(Boolean).join(' · ');
}

/** Stav rezervace slovy (RES_STATUS nese české popisky, tady se překládají při vykreslení). */
function stavText(stav: string, t: PrekladFn): string {
  switch (stav) {
    case 'requested': return t('Čeká na potvrzení');
    case 'confirmed': return t('Potvrzeno');
    case 'seated': return t('Usazeni');
    case 'done': return t('Proběhlo');
    case 'declined': return t('Nepřijato');
    case 'cancelled': return t('Zrušeno');
    default: return RES_STATUS[stav]?.label ?? stav;
  }
}

/** Popisek hlavního kroku rezervace (hlavniKrok vrací české slovo). */
function popisekKroku(na: StavRezervace, t: PrekladFn): string {
  return na === 'confirmed' ? t('Potvrdit') : na === 'seated' ? t('Usadit') : t('Hotovo');
}

function DnesniRezervace({ velikost }: WidgetProps) {
  const t = useT('widgety');
  const smi = useSmi();
  const nav = useNavigace();
  const { nahled } = useWidget();
  const { ok, ceka } = useBrana(widget(ID_REZERVACE)?.opravneni.vse ?? ['rezervace.zobrazit']);
  const data = useDataWidgetu(ok ? URL_REZERVACE_DNES : null, vyberRezervace);
  const { reload } = data;
  const [pracuji, setPracuji] = useState<number | null>(null);
  const [hlaska, setHlaska] = useState<Hlaska | null>(null);
  const [odmitam, setOdmitam] = useState<Rezervace | null>(null);
  // Akce z katalogu (pole akce:*) — jeden zdroj pravdy se serverem.
  const smiKrok = (klic: string) => {
    const k = klicCasti(ID_REZERVACE, klic === 'rezervace.schvalovat' ? 'akce:potvrdit_odmitnout' : 'akce:usadit');
    return !!k && smi(k);
  };

  useEffect(() => {
    if (!hlaska) return;
    const casovac = setTimeout(() => setHlaska(null), 4500);
    return () => clearTimeout(casovac);
  }, [hlaska]);

  const zmenit = async (r: Rezervace, na: StavRezervace) => {
    if (nahled || pracuji != null) return;
    setPracuji(r.id);
    setHlaska(null);
    try {
      const res = await fetch('/api/client/admin/reservations', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, status: na }),
      });
      const x = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof x?.error === 'string' ? x.error : t('Rezervaci se nepodařilo změnit.'));
      setHlaska({
        text: typeof x?.posNote === 'string' && x.posNote ? x.posNote
          : x?.loyalty?.rewarded ? t('Hotovo. Host nasbíral všechna razítka a má odměnu.')
          : `${r.host}: ${stavText(x?.status ?? na, t).toLocaleLowerCase('cs-CZ')}.`,
        ton: 'ok',
      });
    } catch (e) {
      setHlaska({ text: apiMessage(e, t('Spojení se serverem selhalo.')), ton: 'bad' });
    } finally {
      setPracuji(null);
      reload();
      // Čísla v „Hosté a věrnost", „Čeká na tebe" a odznaku Clientu stojí na souhrnu.
      obnovDataWidgetu('/api/client/admin/summary');
    }
  };

  const vse = seradDnes(data.data?.rezervace ?? []);
  const souhrn = souhrnDne(vse);
  const naRezervace = nav.smiPohled('klient:reservations');

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : data} otevrit={naRezervace ? () => nav.onNavigate('klient:reservations') : undefined}>
        <Stat label={t('Dnes')} value={cislo(souhrn.dnes)}
          note={souhrn.ceka > 0 ? <span className="text-wait-ink">{cekajiciRezervace(souhrn.ceka, t)}</span> : osoby(souhrn.osob, t)} />
      </Widget>
    );
  }

  const L = velikost === 'L';
  const videt = L ? vse : vse.slice(0, 5);
  return (
    <>
      <Widget nacteni={ceka ? CEKA : data} odkaz={{ popisek: t('Rezervace'), pohled: 'klient:reservations' }}
        doplnek={souhrn.ceka > 0 ? <Chip tone="wait" size="sm">{cislo(souhrn.ceka)}</Chip> : undefined}
        prazdno={vse.length === 0 && !hlaska ? <p className="t-meta">{t('Dnes nikdo rezervovaný. Klid, nebo prostor pro hosty bez rezervace.')}</p> : undefined}>
        <div className="space-y-3">
          {hlaska && (
            <p className={`note ${hlaska.ton === 'ok' ? 'note-ok' : 'note-danger'}`} role={hlaska.ton === 'ok' ? 'status' : 'alert'}>{hlaska.text}</p>
          )}
          <ul className="list">
            {videt.map(r => {
              const krok = L && !nahled ? hlavniKrok(r.stav, smiKrok) : null;
              const dalsi: MenuItem[] = L && !nahled ? [
                ...(krok?.na === 'seated' && muzeDo(r.stav, 'done') && smiKrok(klicPrechodu('done'))
                  ? [{ label: t('Rovnou hotovo'), icon: 'check', onClick: () => { void zmenit(r, 'done'); } }] : []),
                ...(muzeDo(r.stav, 'declined') && smiKrok(klicPrechodu('declined'))
                  ? [{ label: t('Odmítnout rezervaci…'), icon: 'close', danger: true, onClick: () => setOdmitam(r) }] : []),
              ] : [];
              const stav = <Chip tone={TON_REZERVACE[r.stav]} size="sm">{stavText(r.stav, t)}</Chip>;
              return (
                <ListRow key={r.id} title={r.host} meta={metaRezervace(r, t)} value={r.cas}
                  // Stav zůstává vidět i na telefonu (aside by se pod `lg` schoval).
                  right={stav}
                  actions={krok || dalsi.length ? (
                    <>
                      {krok && (
                        <Button variant="primary" size="sm" loading={pracuji === r.id} onClick={() => { void zmenit(r, krok.na); }}
                          aria-label={t('{krok}: {host}, {cas}', { krok: popisekKroku(krok.na, t), host: r.host, cas: r.cas })}>{popisekKroku(krok.na, t)}</Button>
                      )}
                      {dalsi.length > 0 && <Menu size="sm" label={t('Další akce s rezervací {host}', { host: r.host })} items={dalsi} />}
                    </>
                  ) : undefined} />
              );
            })}
          </ul>
          {!L && vse.length > 5 && <p className="t-meta">{aDalsich(vse.length - 5, t)}</p>}
        </div>
      </Widget>
      {odmitam && !nahled && (
        <NadPlochou>
          <Modal open onClose={() => setOdmitam(null)} size="sm" title={t('Odmítnout rezervaci?')}
            footer={<>
              <Button variant="secondary" onClick={() => setOdmitam(null)}>{t('Zrušit', undefined, 'dialog')}</Button>
              <Button variant="danger-solid" onClick={() => { const r = odmitam; setOdmitam(null); void zmenit(r, 'declined'); }}>{t('Odmítnout')}</Button>
            </>}>
            <p className="text-sm text-black/70 text-pretty">{t('{host} ({cas}, {osoby}) dostane zprávu, že se rezervace nepovedla.', { host: odmitam.host, cas: odmitam.cas, osoby: osoby(odmitam.osob, t) })}</p>
          </Modal>
        </NadPlochou>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Hodnocení od hostů
// ---------------------------------------------------------------------------
//
// Dřív Zákazníci → Hodnocení: průměr 36 px (mimo škálu), hvězdy jako znaky
// „★" a rozložení v ručně kreslených pruzích. Teď Stat s „/ 5" a desetinnou
// čárkou, rozložení BarSpark (jedna podoba sloupků v celé aplikaci), hvězdy
// ikonou a tři poslední komentáře v `.list`.

const ID_HODNOCENI = 'klient.hodnoceni';
const TYDEN_MS = 7 * 24 * 3600 * 1000;

function Hodnoceni({ velikost }: WidgetProps) {
  const t = useT('widgety');
  const nav = useNavigace();
  const { ok, ceka } = useBrana(widget(ID_HODNOCENI)?.opravneni.vse ?? ['zakaznici.recenze']);
  const data = useDataWidgetu(ok ? '/api/client/admin/reviews' : null, vyberHodnoceni);
  const h = data.data;
  const slabych = (h?.posledni ?? []).filter(v => v.hvezdy <= 2 && Date.now() - (parseDbTime(v.kdy)?.getTime() ?? 0) < TYDEN_MS).length;
  const prazdno = h && h.pocet === 0 ? <p className="t-meta">{t('Zatím žádné hodnocení. Host dostane výzvu po hotové návštěvě.')}</p> : undefined;

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : data} prazdno={prazdno}
        otevrit={nav.smiPohled('klient:customers') ? () => nav.onNavigate('klient:customers') : undefined}>
        <Stat label={t('Průměr')} value={prumerCesky(h?.prumer ?? null)} unit="/ 5"
          note={slabych > 0 ? <span className="text-wait-ink">{t('{n, plural, one {# nízké} few {# nízká} other {# nízkých}} za týden', { n: slabych })}</span> : hodnoceniPocet(h?.pocet ?? 0, t)} />
      </Widget>
    );
  }

  return (
    <Widget nacteni={ceka ? CEKA : data} prazdno={prazdno} odkaz={{ popisek: t('Zákazníci'), pohled: 'klient:customers' }}
      doplnek={slabych > 0 ? <Chip tone="wait" size="sm">{nizke(slabych, t)}</Chip> : undefined}>
      {h && (
        <div className="space-y-4">
          <div className="flex items-end gap-5">
            <Stat label={t('Průměr')} value={prumerCesky(h.prumer)} unit="/ 5" note={hodnoceniPocet(h.pocet, t)} className="shrink-0" />
            <BarSpark className="flex-1 min-w-0 max-w-[12rem]" height={40} showLabels label={t('Rozložení hodnocení od jedné do pěti hvězd')}
              data={h.rozlozeni.map((n, i) => ({ value: n, label: String(i + 1), tip: t('{i} z 5: {n, plural, one {# hodnocení} few {# hodnocení} other {# hodnocení}}', { i: i + 1, n }) }))} />
          </div>
          {h.posledni.length > 0 && (
            <ul className="list">
              {h.posledni.slice(0, 3).map(v => (
                <ListRow key={v.id} title={v.poznamka ? `„${v.poznamka}"` : t('Bez komentáře')}
                  meta={`${v.host} · ${dbTimeDayHM(v.kdy)}`}
                  value={<span className="inline-flex items-center gap-1" aria-label={t('{n} z 5', { n: v.hvezdy })}>{v.hvezdy}<Icon name="star" size={14} className={v.hvezdy <= 2 ? 'text-wait-ink' : 'text-black/40'} /></span>} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Členové klubu
// ---------------------------------------------------------------------------
//
// Počet členů a noví za 30 dní jsou souhrn (klient.prehled), jména až od M
// a jen se zakaznici.zobrazit — kdo smí do Clientu, nemusí znát hosty jménem.

const ID_CLENOVE = 'klient.clenove';

function ClenoveKlubu({ velikost, nastaveni }: WidgetProps<{ razeni?: unknown }>) {
  const t = useT('widgety');
  const smi = useSmi();
  const nav = useNavigace();
  const { ok, ceka } = useBrana(widget(ID_CLENOVE)?.opravneni.vse ?? ['klient.prehled']);
  const souhrn = useDataWidgetu(ok ? '/api/client/admin/summary' : null, vyberSouhrn);
  const klicJmen = klicCasti(ID_CLENOVE, 'jmena');
  const jmena = velikost !== 'S' && !!klicJmen && smi(klicJmen);
  const razeni: RazeniClenu = RAZENI_CLENU.includes(nastaveni.razeni as RazeniClenu) ? nastaveni.razeni as RazeniClenu : 'navstevy';
  const lide = useDataWidgetu(ok && jmena ? `/api/client/admin/customers?sort=${razeni}&limit=5` : null, vyberCleny);
  const s = souhrn.data;
  const cisla = s ? <Stat label={t('Členů')} value={cislo(s.clenu)} note={t('+{n} za 30 dní', { n: cislo(s.novychClenu30) })} /> : null;

  if (!jmena) {
    return (
      <Widget nacteni={ceka ? CEKA : souhrn}
        otevrit={velikost === 'S' && nav.smiPohled('klient:customers') ? () => nav.onNavigate('klient:customers') : undefined}
        odkaz={velikost === 'S' ? undefined : { popisek: t('Zákazníci'), pohled: 'klient:customers' }}>
        {cisla}
      </Widget>
    );
  }
  const top = nejvernejsi(lide.data?.clenove ?? [], razeni);
  return (
    <Widget nacteni={ceka ? CEKA : [souhrn, lide]} odkaz={{ popisek: t('Zákazníci'), pohled: 'klient:customers' }}>
      <div className="space-y-4">
        {cisla}
        {top.length === 0
          ? <p className="t-meta">{t('Zatím žádní členové. Přidají se sami na stránce pro hosty.')}</p>
          : (
            <ul className="list">
              {top.map(c => (
                <ListRow key={c.id} title={c.jmeno}
                  meta={razeni === 'nejnovejsi' && c.clenOd ? t('člen od {datum}', { datum: czDay(c.clenOd) }) : t('{n, plural, one {# návštěva} few {# návštěvy} other {# návštěv}}', { n: c.navstev })}
                  value={<>{cislo(c.body)} <span className="text-xs font-medium text-black/50">{t('b.')}</span></>} />
              ))}
            </ul>
          )}
      </div>
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Věrnost za 30 dní
// ---------------------------------------------------------------------------
//
// Dřív jen ve Věrnosti jako „Za posledních 30 dní" (dl s čísly 20 px) a vlastní
// sloupky Spark. Teď StatRow (tři čísla ve střední, čtyři ve velké) a BarSpark.

const ID_VERNOST = 'klient.vernost_30dni';

function Vernost30({ velikost }: WidgetProps) {
  const t = useT('widgety');
  const { ok, ceka } = useBrana(widget(ID_VERNOST)?.opravneni.vse ?? ['vernost.zobrazit']);
  const data = useDataWidgetu(ok ? '/api/client/admin/loyalty' : null, vyberVernost);
  const v = data.data;
  const L = velikost === 'L';
  const aktivnich = (v?.poDnech ?? []).some(d => d.aktivnich > 0);
  return (
    <Widget nacteni={ceka ? CEKA : data} odkaz={{ popisek: t('Věrnost'), pohled: 'klient:loyalty' }}>
      {v && (
        <div className="space-y-4">
          <StatRow>
            <Stat label={t('Rozdáno')} value={cislo(v.rozdano)} unit={t('b.')} />
            <Stat label={t('Utraceno')} value={cislo(v.utraceno)} unit={t('b.')} />
            <Stat label={t('Noví členové')} value={cislo(v.noviClenove)} />
            {L && <Stat label={t('Kupony')} value={cislo(v.kuponu)} note={t('uplatněné')} />}
          </StatRow>
          {!L && <p className="t-meta">{t('Uplatněno {n, plural, one {# kupon} few {# kupony} other {# kuponů}} za 30 dní.', { n: v.kuponu })}</p>}
          {L && aktivnich && (
            <div>
              <p className="t-label mb-2">{t('Aktivní hosté po dnech')}</p>
              <BarSpark height={56} label={t('Aktivní hosté po dnech za posledních 30 dní')} highlight={v.poDnech.length - 1}
                data={v.poDnech.map(d => ({ value: d.aktivnich, tip: `${d.den}: ${cislo(d.aktivnich)}` }))} />
            </div>
          )}
        </div>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Propojení Clientu
// ---------------------------------------------------------------------------
//
// Dřív ručně opsaný checklist (druhá kopie „Prvních kroků" s limetkovými
// jamkami). Teď sdílený Checklist; krok vede do záložky, kde se nastaví,
// jen tomu, kdo ho smí nastavit (pole akce:nastavit), a nikdy v náhledu.

const ID_PROPOJENI = 'klient.propojeni';

/** Popisek kroku slovy; krokyPropojeni (lib) vrací českou větu, tady se skládá z přeložitelných vět. */
function popisekPropojeni(k: KrokPropojeni, su: any, t: PrekladFn): string {
  const cis = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  switch (k.id) {
    case 'zapnuto': return k.hotovo ? t('Stránka pro hosty je zapnutá') : t('Zapnout stránku pro hosty');
    case 'menu': return k.hotovo ? t('Hosté vidí nabídku z Menu') : t('Vybrat menu pro hosty');
    case 'stoly': {
      if (!k.hotovo) return t('Přidat stoly pro rezervace a objednávky');
      const stolu = cis(su?.tables);
      const sparovano = cis(su?.tablesPaired);
      const zaklad = t('{n, plural, one {# stůl} few {# stoly} other {# stolů}}', { n: stolu });
      return sparovano ? `${zaklad}, ${t('{n, plural, one {# spárovaný} few {# spárované} other {# spárovaných}} s pokladnou', { n: sparovano })}` : zaklad;
    }
    case 'pokladna': return k.hotovo ? t('Pokladna napojená, objednávky jdou na stůl v kase') : t('Napojit pokladnu');
    case 'poloha': return k.hotovo ? t('Poloha podniku nastavená') : t('Nastavit polohu podniku pro ochranu objednávek');
    case 'vernost': return k.hotovo ? t('Věrnost běží: {n} b. za 100 {mena}', { n: cis(su?.pointsPer100), mena: su?.__mena }) : t('Zapnout věrnost');
    default: return k.popisek;
  }
}

function Propojeni(_: WidgetProps) {
  const t = useT('widgety');
  const smi = useSmi();
  const nav = useNavigace();
  const { nahled } = useWidget();
  const mena = useCurrency().symbol;
  const { ok, ceka } = useBrana(widget(ID_PROPOJENI)?.opravneni.vse ?? ['klient.prehled']);
  const data = useDataWidgetu(ok ? '/api/client/admin/summary' : null, (raw: any) => ({ kroky: krokyPropojeni(raw?.setup, mena), setup: { ...(raw?.setup ?? {}), __mena: mena } }));
  const kroky = data.data?.kroky ?? [];
  const hotovo = kroky.filter(k => k.hotovo).length;
  return (
    <Widget nacteni={ceka ? CEKA : data}
      doplnek={kroky.length ? <Chip tone={hotovo === kroky.length ? 'ok' : 'muted'} size="sm">{hotovo}/{kroky.length}</Chip> : undefined}>
      <Checklist label={t('Co je v Managero client nastavené')} items={kroky.map(k => {
        const pohled = `klient:${k.zalozka}`;
        const vede = !nahled && smi(k.klic) && nav.smiPohled(pohled);
        return { id: k.id, label: popisekPropojeni(k, data.data?.setup, t), done: k.hotovo, onClick: vede ? () => nav.onNavigate(pohled) : undefined };
      })} />
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'klient.hoste_vernost': HosteAVernost,
  'klient.objednavky_od_stolu': ObjednavkyOdStolu,
  'klient.dnesni_rezervace': DnesniRezervace,
  'klient.hodnoceni': Hodnoceni,
  'klient.clenove': ClenoveKlubu,
  'klient.vernost_30dni': Vernost30,
  'klient.propojeni': Propojeni,
};
