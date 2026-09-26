'use client';

// Widgety oblasti „Tržby a pokladna" — komponenty (kolo 68 a 69, spec §2.5, §2.6, §6.3).
//
// Vlastník v kole 69: balík B5b (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/trzby.ts;
// tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — test AK-20 v scripts/testy/k68-widgety.ts klíče čte z textu, proto bez spreadu.
//
// Co z dřívějšího Přehledu opravuje (audit Přehledu vedení):
//  - Pokladna dnes: dřív se kreslila bez kontroly oprávnění. /api/pos/summary
//    pouští dnešní souhrn i roli s uzaverky.vytvorit (potřebuje ho k uzávěrce),
//    takže Provozní bez finance.trzby na Přehledu viděla tržbu, hotovost
//    i spropitné (N2). Teď se dotaz pošle až při `nacteno && ma('finance.trzby')`
//    a bez klíče se widget nekreslí ani nenabízí.
//  - Hlavička už není ruční `p.font-bold` s vlastní ikonou a číslo 20 px vpravo;
//    tělo je Stat/StatRow (hotově, kartou, spropitné) místo řádku textu s tečkami.
//  - Nepropojená nebo nedostupná pokladna už widget tiše neschová (dřív
//    `catch(() => {})` a blok zmizel): nepropojená je prázdný stav s větou,
//    výpadek pokladny je ErrorState se „Zkusit znovu".
//
// Kolo 69 (B5b) přidalo zbytek oblasti. Většina widgetů čte /api/pos/daily za
// zvolené období; stejné období = stejná URL = jeden dotaz pro všechny widgety
// na ploše (useDataWidgetu). Každý widget chce finance.trzby (N2 platí pro celou
// oblast, ne jen pro Pokladnu dnes) a části s dalšími klíči (lidé, marže,
// rozbor měsíce) si hlídá přes useSmi — bez klíče se část nekreslí a její dotaz
// neodejde. Co nahrazuje:
//  - Živě z pokladny: panel LiveRevenue z Financí (vlastní fetch, ruční předvolby,
//    kolečko, sedm ručních štítků) → části z ../../employer/LiveRevenue ve widgetu;
//  - Tržba po dnech: týdenní sloupce z tmavého hero TO GO (inline gradient, zář,
//    #D8FF6B mimo paletu) → BarSpark na bílé kartě, dnešek zvýrazněný;
//  - Top produkty, Tržby po obsluze, Platby, Špičky dne, Kasa proti uzávěrkám:
//    menší části LiveRevenue a analytiky Uzávěrek jako samostatné widgety.
//
// Data jen přes useDataWidgetu (sdílená mezipaměť), v náhledu nic nenaviguje ani nezapisuje.

import { useEffect, useMemo, useState } from 'react';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { czCount, czForm } from '@/lib/czech';
import { dbTimeHM, pragueToday } from '@/lib/pragueTime';
import { apiMessage, okJson } from '@/lib/api';
import { useMoney } from '../../CurrencyProvider';
import { BarSpark, Button, Chip, ListRow, Stat, StatRow } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { Widget, useWidget, type StavNacteni } from '../Widget';
import { useDataWidgetu, obnovDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';
import {
  DnyPokladny, HodinyPokladny, ObsluhaPokladny, ProdanoPokladny, RadyJakoSeznam,
  UCTENKA, kratkeDatum, obdobiPokladny, pismenoDne, popisUctenek, vyberDenniPokladnu, type DenniPokladna,
} from '../../employer/LiveRevenue';

// ---------------------------------------------------------------------------
// Společné drobnosti
// ---------------------------------------------------------------------------

const cislo = (n: number) => n.toLocaleString('cs-CZ');

/**
 * Brána widgetu (spec §1.5): přísně `nacteno && ma()`. Samotné `ma()` před
 * načtením oprávnění vrací ANO a dotaz na tržby by odešel dřív, než víme,
 * jestli na ně divák má — skončil by 403 jako falešná chyba. Když
 * /api/teams/mine selže, rozhodl už server: widget je na ploše jen tehdy,
 * když ho vrátil v rozložení.
 */
function useBrana(klic: string | readonly string[]): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  return { ok: nacteno ? ma(klic) : chyba, ceka: !nacteno && !chyba };
}

/** Všechny klíče `vse` z registru — brána se tak nemůže rozjet s katalogem. */
function klice(id: string, zaloha: string[]): string[] {
  const d = widget(id);
  return d ? [...d.opravneni.vse] : zaloha;
}

/** „Ještě nevíme, jestli smí": kostra a žádný dotaz. */
const CEKA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

/** Věta pro nepropojenou pokladnu; s oprávněním na nastavení i cesta, kde ji propojit. */
function NepropojenaPokladna({ kratce = false }: { kratce?: boolean }) {
  const nav = useNavigace();
  const smi = useSmi();
  const { nahled } = useWidget();
  const muze = !kratce && !nahled && smi('pokladna.nastavit') && nav.smiPohled('settings');
  return (
    <div className="space-y-3">
      <p className="t-meta text-pretty">{kratce ? 'Pokladna není propojená.' : 'Pokladna není propojená — tržby se ukážou po propojení se Storyous.'}</p>
      {muze && <Button variant="secondary" size="sm" icon="settings" onClick={() => nav.onNavigate('settings', 'pos')}>Propojit pokladnu</Button>}
    </div>
  );
}

/**
 * Tržby za období z /api/pos/daily. Dnešek se mění pod rukama: když je
 * vybraný, obnoví se každé dvě minuty (jako dřív panel na Financích) —
 * v náhledu galerie ne, ten se jen dívá.
 */
function useDenniPokladna(ok: boolean, obdobi: unknown) {
  const { nahled } = useWidget();
  const o = obdobiPokladny(obdobi);
  const data = useDataWidgetu<DenniPokladna>(ok ? `/api/pos/daily?from=${o.from}&to=${o.to}` : null, vyberDenniPokladnu);
  const zive = ok && !nahled && o.from === o.to && o.to === pragueToday();
  const { reload } = data;
  useEffect(() => {
    if (!zive) return;
    const t = setInterval(reload, 120_000);
    return () => clearInterval(t);
  }, [zive, reload]);
  return { data, obdobi: o };
}

// ---------------------------------------------------------------------------
// Pokladna dnes
// ---------------------------------------------------------------------------

const ID_POKLADNA = 'pokladna.dnes';

interface SouhrnPokladny {
  propojeno: boolean;
  misto: string | null;
  celkem: number;
  uctenek: number;
  hotove: number;
  kartou: number;
  spropitne: number;
}

function vyberSouhrn(raw: any): SouhrnPokladny {
  const n = (v: unknown) => Number(v) || 0;
  return {
    // Propojená pokladna bez čísel (bills null) je pro widget totéž co
    // nepropojená — nemá co ukázat a nula by lhala.
    propojeno: raw?.connected === true && raw?.bills != null,
    misto: typeof raw?.placeName === 'string' && raw.placeName.trim() ? raw.placeName.trim() : null,
    celkem: n(raw?.total),
    uctenek: n(raw?.bills),
    hotove: n(raw?.cash),
    // „Kartou" dřív sčítalo kartu a ostatní bezhotovostní platby — zůstává,
    // ať číslo sedí s tím, co lidé znají z uzávěrky.
    kartou: n(raw?.card) + n(raw?.other),
    spropitne: n(raw?.tips),
  };
}

function PokladnaDnes({ velikost }: WidgetProps) {
  const money = useMoney();
  const { inkoust } = useWidget();
  const { ok, ceka } = useBrana(klice(ID_POKLADNA, ['finance.trzby']));
  // Den podle Prahy, ne podle hodin prohlížeče — tablet v jiném pásmu by
  // po půlnoci UTC ukazoval zítřek.
  const data = useDataWidgetu<SouhrnPokladny>(ok ? `/api/pos/summary?date=${pragueToday()}` : null, vyberSouhrn);
  const s = data.data;
  const uctenky = s ? `${cislo(s.uctenek)} ${czForm(s.uctenek, UCTENKA)}` : '';
  const poznamka = s ? [uctenky, s.misto].filter(Boolean).join(' · ') : '';

  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      kostra="cislo"
      odkaz={velikost === 'S' ? undefined : { popisek: 'Finance', pohled: 'finance' }}
      prazdno={s && !s.propojeno ? <p className="t-meta">Pokladna není propojená. Propojí ji majitel v Nastavení.</p> : undefined}
    >
      {s && (velikost === 'S' ? (
        <Stat label="Tržba" value={money(s.celkem)} note={uctenky} />
      ) : inkoust ? (
        // Inkoustová plocha (DP §2.10): jediné tmavé místo v obsahu. Stat
        // má barvy pro bílou kartu, tady by číslo zmizelo — proto stejná
        // stavba v bílé: štítek white/55, číslo 40 tučně, poznámka white/60.
        <div className="min-w-0">
          <p className="t-label !text-white/55">Tržba</p>
          <p className="mt-1.5 text-[2.5rem] leading-none font-bold tracking-tight tabular-nums text-white">{money(s.celkem)}</p>
          {poznamka && <p className="mt-1.5 text-[13px] text-white/60 truncate">{poznamka}</p>}
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-white/10 pt-3">
            {([['Hotově', s.hotove], ['Kartou', s.kartou], ['Spropitné', s.spropitne]] as const).map(([stitek, castka]) => (
              <div key={stitek} className="min-w-0">
                <dt className="t-label !text-white/55 truncate">{stitek}</dt>
                <dd className="mt-1 text-[15px] font-semibold tabular-nums text-white truncate">{money(castka)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <div className="space-y-4">
          <Stat label="Tržba" value={money(s.celkem)} note={poznamka} />
          <StatRow className="border-t border-[var(--surface-line)] pt-4">
            <Stat label="Hotově" value={money(s.hotove)} />
            <Stat label="Kartou" value={money(s.kartou)} />
            <Stat label="Spropitné" value={money(s.spropitne)} />
          </StatRow>
        </div>
      ))}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Živě z pokladny
// ---------------------------------------------------------------------------

function ZivePokladna({ velikost, nastaveni }: WidgetProps<{ obdobi: string }>) {
  const money = useMoney();
  const { ok, ceka } = useBrana(klice('pokladna.zive', ['finance.trzby']));
  const { data, obdobi } = useDenniPokladna(ok, nastaveni.obdobi);
  const d = data.data;
  const L = velikost === 'L';
  const t = d?.soucty;
  const kontext = d ? [obdobi.popis, d.posledniSynchronizace && `synchronizováno ${dbTimeHM(d.posledniSynchronizace)}`].filter(Boolean).join(' · ') : '';
  const podil = (v: number) => (t && t.total > 0 ? `${Math.round((v / t.total) * 100)} % tržby` : undefined);

  return (
    <Widget nacteni={ceka ? CEKA : data} kostra="cislo"
      odkaz={L ? undefined : { popisek: 'Finance', pohled: 'finance' }}
      prazdno={d && !d.propojeno ? <NepropojenaPokladna /> : undefined}>
      {d && t && (
        <div className="space-y-4">
          <p className="t-meta cz-sentence">{kontext}</p>
          {L ? (
            <StatRow>
              <Stat label="Tržba" value={money(t.total)} note={popisUctenek(t.bills, t.avgBill, money)} />
              <Stat label="Hotově" value={money(t.cash)} note={podil(t.cash)} />
              <Stat label="Kartou" value={money(t.card)} note={podil(t.card)} />
              <Stat label="Spropitné" value={money(t.tips)}
                note={t.refundCount > 0 ? `${t.refundCount}× refundace ${money(t.refundTotal)}` : 'bez refundací'} />
            </StatRow>
          ) : (
            <>
              <Stat label="Tržba" value={money(t.total)} note={popisUctenek(t.bills, t.avgBill, money)} />
              <StatRow className="border-t border-[var(--surface-line)] pt-4">
                <Stat label="Hotově" value={money(t.cash)} />
                <Stat label="Kartou" value={money(t.card)} />
                <Stat label="Spropitné" value={money(t.tips)} />
              </StatRow>
            </>
          )}
          {/* Co není hotově ani kartou (stravenky, kredit, faktura). Dřív se to
              schovalo do „jinak" a uzávěrka proti kase nesedela. */}
          {L && t.methods.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="t-label">Jinak zaplaceno</span>
              {t.methods.map(m => (
                <Chip key={m.id} tone="muted" size="sm"><span className="cz-sentence">{m.label}</span> <span className="tabular-nums">{money(m.amount)}</span></Chip>
              ))}
            </div>
          )}
          {d.poznamky.length > 0 && <RadyJakoSeznam rady={d.poznamky} limit={L ? Infinity : 2} />}
          {L && d.hodiny.some(v => v > 0) && (
            <div>
              <p className="t-label mb-2">Kdy se protáčelo</p>
              <HodinyPokladny hodiny={d.hodiny} />
            </div>
          )}
          {L && d.polozky.length > 0 && (
            <div>
              <p className="t-label mb-1">Co se prodalo · {czCount(Math.round(t.soldQty), { one: 'kus', few: 'kusy', many: 'kusů' })}</p>
              <ProdanoPokladny polozky={d.polozky} limit={10} />
            </div>
          )}
          {L && d.obsluha.length > 0 && (
            <div>
              <p className="t-label mb-1">Kdo markoval</p>
              <ObsluhaPokladny obsluha={d.obsluha} celkem={t.total} limit={10} />
            </div>
          )}
          {L && d.dny.length > 1 && <DnyPokladny dny={d.dny} />}
          {L && d.poznamka && <p className="t-meta">{d.poznamka}</p>}
        </div>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Tržba po dnech (pokladna, nebo uzávěrky — funguje i bez pokladny)
// ---------------------------------------------------------------------------

interface DenTrzby { den: string; trzba: number }

/** Dny od–do včetně (pražské „RRRR-MM-DD", poledne UTC, ať přechod času nevadí). */
function dnyObdobi(od: string, doDne: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${od}T12:00:00Z`), konec = Date.parse(`${doDne}T12:00:00Z`); t <= konec; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Z /api/closings/calendar vybere tržby po dnech; bez tržeb (role bez finance.trzby) je to chyba, ne nuly. */
function vyberKalendar(raw: any): Record<string, number> {
  if (!raw || typeof raw !== 'object' || typeof raw.days !== 'object') throw new Error('Uzávěrky přišly v nečekaném tvaru.');
  if (raw.selfOnly === true) throw new Error('Tržby z uzávěrek vidí jen ten, kdo smí vidět všechny uzávěrky.');
  const out: Record<string, number> = {};
  for (const [den, v] of Object.entries(raw.days as Record<string, any>)) if (v && v.revenue != null) out[den] = Number(v.revenue) || 0;
  return out;
}

function PoDnech({ velikost, nastaveni }: WidgetProps<{ obdobi: string; zdroj: string }>) {
  const money = useMoney();
  const smi = useSmi();
  const { ok, ceka } = useBrana(klice('trzby.po_dnech', ['finance.trzby']));
  const smiUzaverky = ok && smi('uzaverky.zobrazit_vse');
  const chceUzaverky = nastaveni.zdroj === 'uzaverky' && smiUzaverky;
  const { data: pos, obdobi } = useDenniPokladna(ok && !chceUzaverky, nastaveni.obdobi);
  // Bez pokladny (nepropojená, nebo tarif bez ní) spadne na uzávěrky, když na ně divák smí.
  const zUzaverek = chceUzaverky || (smiUzaverky && pos.data?.propojeno === false);
  const mesice = useMemo(() => [...new Set([obdobi.from.slice(0, 7), obdobi.to.slice(0, 7)])], [obdobi.from, obdobi.to]);
  const kal1 = useDataWidgetu(zUzaverek ? `/api/closings/calendar?month=${mesice[0]}` : null, vyberKalendar);
  const kal2 = useDataWidgetu(zUzaverek && mesice[1] ? `/api/closings/calendar?month=${mesice[1]}` : null, vyberKalendar);

  const dny: DenTrzby[] | null = useMemo(() => {
    const vsechny = dnyObdobi(obdobi.from, obdobi.to);
    if (zUzaverek) {
      if (!kal1.data || (mesice[1] && !kal2.data)) return null;
      const m = { ...kal1.data, ...(kal2.data ?? {}) };
      return vsechny.map(den => ({ den, trzba: m[den] ?? 0 }));
    }
    const p = pos.data;
    if (!p || !p.propojeno) return null;
    const m = new Map(p.dny.map(x => [x.day, x.total]));
    return vsechny.map(den => ({ den, trzba: m.get(den) ?? 0 }));
  }, [zUzaverek, kal1.data, kal2.data, mesice, pos.data, obdobi.from, obdobi.to]);

  const dnes = pragueToday();
  const celkem = (dny ?? []).reduce((s, x) => s + x.trzba, 0);
  const sTrzbou = (dny ?? []).filter(x => x.trzba > 0);
  const prumer = sTrzbou.length ? Math.round(celkem / sTrzbou.length) : 0;
  const rekord = sTrzbou.reduce<DenTrzby | null>((m, x) => (!m || x.trzba > m.trzba ? x : m), null);
  const L = velikost === 'L';
  const nacteni = ceka ? CEKA : zUzaverek ? [kal1, kal2] : pos;
  const prazdno = !zUzaverek && pos.data?.propojeno === false ? <NepropojenaPokladna /> : undefined;

  return (
    <Widget nacteni={nacteni} kostra="graf" prazdno={prazdno}
      odkaz={nastaveni.zdroj === 'uzaverky' || zUzaverek ? { popisek: 'Uzávěrky', pohled: 'reports' } : { popisek: 'Finance', pohled: 'finance' }}>
      {dny && (
        <div className="space-y-3">
          <Stat label={obdobi.popis} value={money(celkem)}
            note={`${zUzaverek ? 'z uzávěrek' : 'z pokladny'}${prumer > 0 ? ` · průměr ${money(prumer)} za den` : ''}`} />
          <BarSpark height={L ? 96 : 56} showLabels={dny.length <= 14 || L}
            highlight={dny.findIndex(x => x.den === dnes) >= 0 ? dny.findIndex(x => x.den === dnes) : undefined}
            label={`Tržba po dnech: ${obdobi.popis.toLowerCase()}`}
            data={dny.map(x => ({
              value: x.den > dnes ? null : x.trzba,
              label: dny.length <= 14 ? pismenoDne(x.den) : (Number(x.den.slice(8)) % 5 === 1 ? String(Number(x.den.slice(8))) : ''),
              tip: `${pismenoDne(x.den)} ${kratkeDatum(x.den)}: ${money(x.trzba)}`,
            }))} />
          {L && rekord && (
            <p className="t-meta">Nejsilnější den {pismenoDne(rekord.den)} {kratkeDatum(rekord.den)} · {money(rekord.trzba)}</p>
          )}
        </div>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Špičky během dne
// ---------------------------------------------------------------------------

interface Obsazeni { hodiny: number[]; rady: { tone: 'good' | 'warn' | 'info'; title: string; text: string }[]; propojeno: boolean }

function vyberObsazeni(raw: any): Obsazeni {
  if (!raw || typeof raw !== 'object') throw new Error('Rozbor měsíce přišel v nečekaném tvaru.');
  return {
    propojeno: raw.connected === true,
    hodiny: Array.isArray(raw.hours) ? raw.hours.map((v: unknown) => Number(v) || 0) : [],
    rady: Array.isArray(raw.staffingAdvice) ? raw.staffingAdvice
      .filter((r: any) => r && typeof r.title === 'string')
      .map((r: any) => ({ tone: r.tone === 'warn' || r.tone === 'good' ? r.tone : 'info', title: r.title, text: String(r.text ?? '') })) : [],
  };
}

function Hodiny({ velikost, nastaveni }: WidgetProps<{ obdobi: string }>) {
  const smi = useSmi();
  const { ok, ceka } = useBrana(klice('trzby.hodiny', ['finance.trzby']));
  // Měsíc s obsazením potřebuje rozbor (finance.analyza); bez něj se ukáže 30 dní z pokladny.
  const sObsazenim = nastaveni.obdobi === 'mesic_s_obsazenim' && ok && smi('finance.analyza');
  const { data: pos, obdobi } = useDenniPokladna(ok && !sObsazenim, nastaveni.obdobi === 'mesic_s_obsazenim' ? '30_dni' : nastaveni.obdobi);
  const mesic = useDataWidgetu(sObsazenim ? `/api/pos/insights?month=${pragueToday().slice(0, 7)}` : null, vyberObsazeni);
  const hodiny = sObsazenim ? mesic.data?.hodiny : pos.data?.propojeno ? pos.data.hodiny : undefined;
  const propojeno = sObsazenim ? mesic.data?.propojeno : pos.data?.propojeno;
  const max = (hodiny ?? []).reduce((m, v) => Math.max(m, v), 0);
  const spicka = max > 0 ? (hodiny ?? []).indexOf(max) : -1;
  const L = velikost === 'L';

  return (
    <Widget nacteni={ceka ? CEKA : sObsazenim ? mesic : pos} kostra="graf"
      prazdno={propojeno === false ? <NepropojenaPokladna /> : hodiny && max === 0 ? <p className="t-meta">Za tohle období pokladna nic nenamarkovala.</p> : undefined}>
      {hodiny && max > 0 && (
        <div className="space-y-3">
          <p className="t-meta cz-sentence">
            {sObsazenim ? 'Tento měsíc' : obdobi.popis} · nejvíc se protáčí kolem {spicka}:00
          </p>
          <HodinyPokladny hodiny={hodiny} vyska={L ? 96 : 56} />
          {L && sObsazenim && (mesic.data?.rady.length ?? 0) > 0 && <RadyJakoSeznam rady={mesic.data!.rady} />}
        </div>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Top produkty
// ---------------------------------------------------------------------------

interface PolozkaMarze { name: string; qty: number; revenue: number | null; marginPct: number | null }

function vyberMarzeProdukty(raw: any): { propojeno: boolean; polozky: PolozkaMarze[] } {
  if (!raw || typeof raw !== 'object') throw new Error('Marže přišly v nečekaném tvaru.');
  return {
    propojeno: raw.connected === true && raw.ready !== false,
    polozky: Array.isArray(raw.items) ? raw.items.map((i: any) => ({
      name: String(i?.name ?? 'Bez názvu'), qty: Number(i?.qty) || 0,
      revenue: i?.revenue == null ? null : Number(i.revenue) || 0,
      marginPct: i?.marginPct == null ? null : Number(i.marginPct),
    })) : [],
  };
}

function TopProdukty({ velikost, nastaveni }: WidgetProps<{ obdobi: string; razeni: string; pocet: string }>) {
  const money = useMoney();
  const smi = useSmi();
  const { ok, ceka } = useBrana(klice('trzby.top_produkty', ['finance.trzby']));
  // Řazení podle marže jde z měsíčních marží (finance.marze); bez klíče se řadí podle tržby.
  const podleMarze = nastaveni.razeni === 'marze' && ok && smi('finance.marze');
  const { data: pos, obdobi } = useDenniPokladna(ok && !podleMarze, nastaveni.obdobi);
  const marze = useDataWidgetu(podleMarze ? `/api/pos/margins?month=${pragueToday().slice(0, 7)}` : null, vyberMarzeProdukty);
  const pocet = Math.max(3, Math.min(10, Number(nastaveni.pocet) || 5));
  const limit = velikost === 'M' ? Math.min(5, pocet) : pocet;
  const propojeno = podleMarze ? marze.data?.propojeno : pos.data?.propojeno;

  let obsah: React.ReactNode = null;
  let prazdno: React.ReactNode | undefined;
  if (propojeno === false) prazdno = <NepropojenaPokladna />;
  else if (podleMarze && marze.data) {
    const s = marze.data.polozky.filter(p => p.marginPct != null).sort((a, b) => (b.marginPct ?? 0) - (a.marginPct ?? 0));
    if (!s.length) prazdno = <p className="t-meta">Marže se počítá jen u položek s recepturou — zatím žádná není.</p>;
    else obsah = (
      <>
        <p className="t-meta">Tento měsíc · podle marže</p>
        <ul className="list mt-1">
          {s.slice(0, limit).map(p => (
            <ListRow key={p.name} title={p.name} meta={czCount(Math.round(p.qty), { one: 'kus', few: 'kusy', many: 'kusů' })}
              value={<span className="tabular-nums">{p.marginPct} %</span>} valueMeta={p.revenue != null ? money(p.revenue) : undefined} />
          ))}
        </ul>
      </>
    );
  } else if (pos.data?.propojeno) {
    if (!pos.data.polozky.length) prazdno = <p className="t-meta">Za tohle období se nic neprodalo.</p>;
    else obsah = (
      <>
        <p className="t-meta cz-sentence">{obdobi.popis} · podle {nastaveni.razeni === 'trzba' || nastaveni.razeni === 'marze' ? 'tržby' : 'kusů'}</p>
        <div className="mt-1"><ProdanoPokladny polozky={pos.data.polozky} limit={limit} razeni={nastaveni.razeni === 'kusy' ? 'kusy' : 'trzba'} /></div>
      </>
    );
  }

  return (
    <Widget nacteni={ceka ? CEKA : podleMarze ? marze : pos} prazdno={prazdno}>
      {obsah}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Tržby po obsluze
// ---------------------------------------------------------------------------

function PoObsluze({ velikost, nastaveni }: WidgetProps<{ obdobi: string }>) {
  const { ok, ceka } = useBrana(klice('trzby.po_obsluze', ['finance.trzby', 'finance.trzby_lide']));
  const { data, obdobi } = useDenniPokladna(ok, nastaveni.obdobi);
  const d = data.data;
  return (
    <Widget nacteni={ceka ? CEKA : data}
      prazdno={d && !d.propojeno ? <NepropojenaPokladna /> : d && !d.obsluha.length ? <p className="t-meta">Za tohle období nikdo nemarkoval.</p> : undefined}>
      {d?.propojeno && d.obsluha.length > 0 && (
        <>
          <p className="t-meta cz-sentence">{obdobi.popis}</p>
          <div className="mt-1"><ObsluhaPokladny obsluha={d.obsluha} celkem={d.soucty.total} limit={velikost === 'M' ? 5 : 10} /></div>
        </>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Platby a spropitné
// ---------------------------------------------------------------------------

function Platby({ velikost, nastaveni }: WidgetProps<{ obdobi: string }>) {
  const money = useMoney();
  const { ok, ceka } = useBrana(klice('trzby.platby', ['finance.trzby']));
  const { data, obdobi } = useDenniPokladna(ok, nastaveni.obdobi);
  const d = data.data;
  const t = d?.soucty;
  const pct = (v: number) => (t && t.total > 0 ? Math.round((v / t.total) * 100) : 0);

  return (
    <Widget nacteni={ceka ? CEKA : data} kostra={velikost === 'S' ? 'cislo' : 'seznam'}
      prazdno={d && !d.propojeno ? <NepropojenaPokladna kratce={velikost === 'S'} /> : undefined}>
      {d?.propojeno && t && (velikost === 'S' ? (
        <Stat label="Kartou" value={`${pct(t.card)} %`} note={`Spropitné ${money(t.tips)}`} />
      ) : (
        <>
          <p className="t-meta cz-sentence">{obdobi.popis}</p>
          <ul className="list mt-1">
            <ListRow title="Hotově" value={<span className="tabular-nums">{money(t.cash)}</span>} valueMeta={`${pct(t.cash)} %`} />
            <ListRow title="Kartou" value={<span className="tabular-nums">{money(t.card)}</span>} valueMeta={`${pct(t.card)} %`} />
            {t.methods.length > 0
              ? t.methods.slice(0, 3).map(m => (
                <ListRow key={m.id} title={<span className="cz-sentence">{m.label}</span>}
                  value={<span className="tabular-nums">{money(m.amount)}</span>} valueMeta={`${pct(m.amount)} %`} />
              ))
              : t.other > 0 && <ListRow title="Jinak" value={<span className="tabular-nums">{money(t.other)}</span>} valueMeta={`${pct(t.other)} %`} />}
            <ListRow title="Spropitné" meta={`hotově ${money(t.tipsCash)} · kartou ${money(t.tipsCard)}`}
              value={<span className="tabular-nums">{money(t.tips)}</span>} />
          </ul>
        </>
      ))}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Průměrná účtenka
// ---------------------------------------------------------------------------

function PrumernaUctenka({ nastaveni }: WidgetProps<{ obdobi: string }>) {
  const money = useMoney();
  const { ok, ceka } = useBrana(klice('trzby.prumerna_uctenka', ['finance.trzby']));
  const { data, obdobi } = useDenniPokladna(ok, nastaveni.obdobi);
  const d = data.data;
  return (
    <Widget nacteni={ceka ? CEKA : data} kostra="cislo"
      prazdno={d && !d.propojeno ? <NepropojenaPokladna kratce /> : d && d.soucty.bills === 0 ? <p className="t-meta">Zatím žádná účtenka.</p> : undefined}>
      {d?.propojeno && d.soucty.bills > 0 && (
        <Stat label={obdobi.popis} value={money(d.soucty.avgBill)} note={czCount(d.soucty.bills, UCTENKA)} />
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Kasa proti uzávěrkám
// ---------------------------------------------------------------------------

function KasaVsUzaverky({ velikost, nastaveni }: WidgetProps<{ obdobi: string; prah: number }>) {
  const money = useMoney();
  const { ok, ceka } = useBrana(klice('trzby.kasa_vs_uzaverky', ['finance.trzby']));
  const { data, obdobi } = useDenniPokladna(ok, nastaveni.obdobi);
  const d = data.data;
  const prah = Math.max(0, Number(nastaveni.prah) || 0);
  const dnes = pragueToday();
  // Dnešek se nepočítá: uzávěrka se píše až na konci směny a „rozdíl" by byl celá tržba.
  const dny = (d?.dny ?? []).filter(x => x.day < dnes);
  const mimo = dny.filter(x => x.diff != null && Math.abs(x.diff) > prah);
  const bezUzaverky = dny.filter(x => x.closings === 0 && x.total > 0);
  const cisty = dny.reduce((s, x) => s + (x.diff ?? 0), 0);
  const vse = [...mimo, ...bezUzaverky].sort((a, b) => b.day.localeCompare(a.day));
  const L = velikost === 'L';

  return (
    <Widget nacteni={ceka ? CEKA : data} odkaz={{ popisek: 'Uzávěrky', pohled: 'reports' }}
      prazdno={d && !d.propojeno ? <NepropojenaPokladna /> : undefined}>
      {d?.propojeno && (
        <div className="space-y-3">
          <p className="t-meta cz-sentence">{obdobi.popis} · práh {money(prah)}</p>
          <StatRow>
            <Stat label="Dny mimo" value={cislo(mimo.length)} note={bezUzaverky.length ? `${czCount(bezUzaverky.length, { one: 'den', few: 'dny', many: 'dní' })} bez uzávěrky` : 'všechny dny mají uzávěrku'} />
            <Stat label="Čistý rozdíl" value={`${cisty > 0 ? '+' : cisty < 0 ? '−' : ''}${money(Math.abs(cisty))}`} />
          </StatRow>
          {vse.length === 0 ? (
            <p className="t-meta">Kasa sedí s uzávěrkami.</p>
          ) : (
            <>
              <ul className="list">
                {vse.slice(0, L ? 31 : 3).map(x => (
                  <ListRow key={x.day}
                    title={<span className="tabular-nums">{pismenoDne(x.day)} {kratkeDatum(x.day)}</span>}
                    meta={`pokladna ${money(x.total)}${x.declared != null ? ` · uzávěrka ${money(x.declared)}` : ''}`}
                    right={x.closings === 0
                      ? <Chip tone="bad" size="sm">bez uzávěrky</Chip>
                      : <Chip tone="wait" size="sm">{(x.diff ?? 0) > 0 ? '+' : '−'}{money(Math.abs(x.diff ?? 0))}</Chip>} />
                ))}
              </ul>
              {!L && vse.length > 3 && <p className="t-meta">…a dalších {cislo(vse.length - 3)}</p>}
            </>
          )}
        </div>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Stav pokladny
// ---------------------------------------------------------------------------

interface StavPokladnyData {
  propojeno: boolean; misto: string | null; posledni: string | null; chyba: string | null;
  cekaNaPolozky: number; uctenek: number;
}

function vyberStav(raw: any): StavPokladnyData {
  if (!raw || typeof raw !== 'object') throw new Error('Stav pokladny přišel v nečekaném tvaru.');
  return {
    propojeno: raw.connected === true,
    misto: typeof raw.placeName === 'string' && raw.placeName.trim() ? raw.placeName.trim() : null,
    posledni: typeof raw.lastSyncAt === 'string' ? raw.lastSyncAt : null,
    chyba: typeof raw.lastError === 'string' && raw.lastError.trim() ? raw.lastError.trim() : null,
    cekaNaPolozky: Number(raw.itemsPending) || 0,
    uctenek: Number(raw.billsCount) || 0,
  };
}

const URL_STAV = '/api/pos/status';

function StavPokladny({ velikost, nahled }: WidgetProps) {
  const smi = useSmi();
  const { ok, ceka } = useBrana(klice('pokladna.stav', ['pokladna.stav']));
  const data = useDataWidgetu(ok ? URL_STAV : null, vyberStav);
  const s = data.data;
  const [bezi, setBezi] = useState(false);
  const [hlaska, setHlaska] = useState<{ ton: 'ok' | 'bad'; text: string } | null>(null);
  const smiSynchronizovat = ok && smi('pokladna.synchronizovat') && !nahled;

  const synchronizuj = async () => {
    setBezi(true); setHlaska(null);
    try {
      await fetch(URL_STAV, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync' }) }).then(okJson);
      setHlaska({ ton: 'ok', text: 'Synchronizováno.' });
      obnovDataWidgetu(URL_STAV);
    } catch (e) {
      setHlaska({ ton: 'bad', text: apiMessage(e, 'Synchronizace se nepovedla.') });
    }
    setBezi(false);
  };

  const S = velikost === 'S';
  return (
    <Widget nacteni={ceka ? CEKA : data} kostra={S ? 'cislo' : 'text'}
      prazdno={s && !s.propojeno ? <NepropojenaPokladna kratce={S} /> : undefined}>
      {s?.propojeno && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {s.chyba
              ? <Chip tone="bad" size={S ? 'sm' : 'md'} icon="warning">Chyba synchronizace</Chip>
              : s.cekaNaPolozky > 0
                ? <Chip tone="wait" size={S ? 'sm' : 'md'}>Dotahuje položky</Chip>
                : <Chip tone="ok" size={S ? 'sm' : 'md'} icon="check">V pořádku</Chip>}
          </div>
          <p className="t-meta">
            {s.posledni ? `Naposledy ${dbTimeHM(s.posledni)}` : 'Ještě nesynchronizováno'}
            {!S && s.misto ? ` · ${s.misto}` : ''}
          </p>
          {!S && (
            <>
              {s.cekaNaPolozky > 0 && <p className="t-meta">{czCount(s.cekaNaPolozky, UCTENKA)} čeká na položky.</p>}
              {s.chyba && <p className="note note-danger text-[13px]">{s.chyba}</p>}
              {hlaska && <p role="status" className={`note ${hlaska.ton === 'ok' ? 'note-ok' : 'note-danger'} text-[13px]`}>{hlaska.text}</p>}
              {smiSynchronizovat && (
                <Button variant="secondary" size="sm" icon="refresh" loading={bezi} onClick={synchronizuj}>Synchronizovat teď</Button>
              )}
            </>
          )}
        </div>
      )}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'pokladna.dnes': PokladnaDnes,
  'pokladna.zive': ZivePokladna,
  'trzby.po_dnech': PoDnech,
  'trzby.hodiny': Hodiny,
  'trzby.top_produkty': TopProdukty,
  'trzby.po_obsluze': PoObsluze,
  'trzby.platby': Platby,
  'trzby.prumerna_uctenka': PrumernaUctenka,
  'trzby.kasa_vs_uzaverky': KasaVsUzaverky,
  'pokladna.stav': StavPokladny,
};
