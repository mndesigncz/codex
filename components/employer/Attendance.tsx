'use client';

// Docházka (vedení) — plocha s widgety (kolo 69, balík B2, spec §6.2).
//
// Dřív jedna dlouhá stránka: „Právě na směně" v limetkových kartách, dvě
// dlaždice mezd s ručními štítky, mřížka karet „Souhrn hodin" a pod tím
// záznamy. Teď jsou bloky widgety (Právě na směně, Mzdy za období, Souhrn
// hodin, Otevřené příchody, Chybí sazba) a tahle komponenta nese jen
// hlavičku a nástroj: záznamy po dnech s hledáním, úpravou, přidáním
// a exportem — v jedné kartě s .list (DP §4 B), ne karta na den.
//
// Období 7/30/90 v hlavičce řídí nástroj i widgety s volbou „Podle stránky"
// (ObdobiStrankyDochazky). Nástroj čte záznamy přes useDataWidgetu na téže
// adrese jako tyto widgety, takže plocha pošle jediný dotaz a po úpravě
// záznamu (obnovDochazku) se překreslí obojí najednou.
//
// Oprávnění (kolo 67, katalog): přidat a opravit čas jen s dochazka.upravit,
// smazat s dochazka.mazat, export s dochazka.exportovat (sloupec Mzda jen
// s finance.mzdy). Dřív se tlačítka ukazovala všem, kdo docházku vidí,
// a končila 403.

import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Card, Chip, ErrorState, Field, Input, ListRow, Modal, SearchField, Segmented, Select, Skeleton } from '../ui';
import { PersonLink } from './ProfileLinkProvider';
import { useSymbol } from '../CurrencyProvider';
import { usePlan, UpgradeModal } from '../Pro';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { useSmi } from '../widgety/NavigaceKontext';
import { ObdobiStrankyDochazky, obnovDochazku } from '../widgety/oblasti/dochazka';
import { dbTimeHM, parseDbTime, pragueDayOf } from '@/lib/pragueTime';
import { earnedFor } from '@/lib/wages';
import { apiMessage, okJson } from '@/lib/api';
import { obsahuje } from '@/lib/hledani';
import { hodinyMinuty, rozeberZaznam, sazbyZRosteru, type ClenRosteru, type ZaznamDochazky } from '@/lib/dochazkaPrehled';

type Zaznam = ZaznamDochazky & { id: number | string; employeeId: number | string };
interface Data { roster: ClenRosteru[]; entries: Zaznam[] }

function vyberData(raw: any): Data {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.roster)) throw new Error('Docházka přišla v nečekaném tvaru.');
  return { roster: raw.roster, entries: Array.isArray(raw.entries) ? raw.entries : [] };
}

const OBDOBI = [7, 30, 90] as const;
type Obdobi = (typeof OBDOBI)[number];
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

/** Datum na vstup datetime-local v místním čase prohlížeče. */
function doVstupu(v: string | Date | null | undefined): string {
  const d = v instanceof Date ? v : parseDbTime(v ?? null);
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** „H:MM" pro CSV (účetní sčítá sloupec). */
function hMM(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

const ZDROJ: Record<string, string> = { kiosk: 'tablet', closing: 'z uzávěrky', self: 'sám', manual: 'ručně' };

export default function Attendance({ user: _user }: { user: { id?: string | number } }) {
  const smi = useSmi();
  const smiUpravit = smi('dochazka.upravit');
  const smiMazat = smi('dochazka.mazat');
  const smiExport = smi('dochazka.exportovat');
  const vidiMzdy = smi('finance.mzdy');
  const symbol = useSymbol();
  const { pro } = usePlan();
  const [upgradeFor, setUpgradeFor] = useState<string | null>(null);

  const [dni, setDni] = useState<Obdobi>(30);
  const data = useDataWidgetu<Data>(`/api/attendance?days=${dni}`, vyberData);
  const entries = data.data?.entries ?? [];
  const roster = data.data?.roster ?? [];
  // Hledání zúží patnáct lidí krát devadesát dní (přes tisíc řádků) na jednoho člověka.
  const [q, setQ] = useState('');

  // Běžící směny tikají po půl minutě — sekundy v seznamu nikdo nečte a
  // překreslovat tisíc řádků každou vteřinu je zbytečné.
  const [ted, setTed] = useState(() => Date.now());
  const nekdoBezi = entries.some(e => !e.clockOut);
  useEffect(() => {
    if (!nekdoBezi) return;
    const t = setInterval(() => setTed(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [nekdoBezi]);

  const sazby = useMemo(() => sazbyZRosteru(roster), [roster]);
  const zobrazene = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? entries.filter(e => obsahuje(e.employeeName, n)) : entries;
  }, [entries, q]);
  // Po dnech podle pražského dne příchodu (API řadí od nejnovějšího).
  const dny = useMemo(() => {
    const m = new Map<string, Zaznam[]>();
    for (const e of zobrazene) {
      const d = parseDbTime(e.clockIn);
      const k = d ? pragueDayOf(d) : '';
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()].map(([den, list]) => ({
      den,
      nazev: den ? new Date(`${den}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Bez data',
      list,
    }));
  }, [zobrazene]);

  // ---- Úprava a ukončení ----
  const [uprava, setUprava] = useState<{ e: Zaznam; od: string; do: string } | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const [chybaUpravy, setChybaUpravy] = useState<string | null>(null);
  const otevriUpravu = (e: Zaznam, ukoncit = false) => {
    setChybaUpravy(null);
    setUprava({ e, od: doVstupu(e.clockIn), do: ukoncit ? doVstupu(new Date()) : doVstupu(e.clockOut) });
  };
  const ulozUpravu = async () => {
    if (!uprava) return;
    setUkladam(true); setChybaUpravy(null);
    try {
      await fetch('/api/attendance', {
        method: 'PATCH', headers: JSON_HLAVICKA,
        body: JSON.stringify({
          id: uprava.e.id,
          clockIn: uprava.od ? new Date(uprava.od).toISOString() : undefined,
          clockOut: uprava.do ? new Date(uprava.do).toISOString() : null,
        }),
      }).then(okJson);
      setUprava(null);
      obnovDochazku();
    } catch (err) {
      setChybaUpravy(apiMessage(err, 'Změnu se nepodařilo uložit.'));
    } finally {
      setUkladam(false);
    }
  };

  // ---- Přidání záznamu (někdo se zapomněl odpíchnout úplně) ----
  const [pridat, setPridat] = useState(false);
  const [novy, setNovy] = useState<{ kdo: string; od: string; do: string }>({ kdo: '', od: '', do: '' });
  const [pridavam, setPridavam] = useState(false);
  const [chybaPridani, setChybaPridani] = useState<string | null>(null);
  const ulozNovy = async () => {
    if (!novy.kdo || !novy.od || !novy.do) { setChybaPridani('Vyplň člověka i oba časy.'); return; }
    setPridavam(true); setChybaPridani(null);
    try {
      await fetch('/api/attendance', {
        method: 'POST', headers: JSON_HLAVICKA,
        body: JSON.stringify({ employeeId: Number(novy.kdo), clockIn: new Date(novy.od).toISOString(), clockOut: new Date(novy.do).toISOString() }),
      }).then(okJson);
      setPridat(false);
      setNovy({ kdo: '', od: '', do: '' });
      obnovDochazku();
    } catch (err) {
      setChybaPridani(apiMessage(err, 'Záznam se nepodařilo přidat.'));
    } finally {
      setPridavam(false);
    }
  };

  // ---- Smazání (potvrzení v okně, ne confirm()) ----
  const [smazat, setSmazat] = useState<Zaznam | null>(null);
  const [mazu, setMazu] = useState(false);
  const [chybaSmazani, setChybaSmazani] = useState<string | null>(null);
  const potvrdSmazani = async () => {
    if (!smazat) return;
    setMazu(true); setChybaSmazani(null);
    try {
      await fetch(`/api/attendance?id=${smazat.id}`, { method: 'DELETE' }).then(okJson);
      data.set(d => ({ roster: d?.roster ?? [], entries: (d?.entries ?? []).filter(x => x.id !== smazat.id) }));
      setSmazat(null);
      obnovDochazku();
    } catch (err) {
      setChybaSmazani(apiMessage(err, 'Záznam se nepodařilo smazat.'));
    } finally {
      setMazu(false);
    }
  };

  const exportCsv = () => {
    if (!pro) { setUpgradeFor('Export CSV'); return; }
    const hlava = ['Datum', 'Zaměstnanec', 'Příchod', 'Odchod', 'Odpracováno', 'Zdroj', ...(vidiMzdy ? [`Mzda (${symbol})`] : [])];
    const radky = entries.map(e => {
      const od = parseDbTime(e.clockIn);
      const z = rozeberZaznam(e, Date.now());
      const sazba = sazby.get(String(e.employeeId));
      return [
        od ? od.toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague' }) : '',
        e.employeeName ?? 'Neznámý',
        dbTimeHM(e.clockIn),
        e.clockOut ? dbTimeHM(e.clockOut) : '',
        hMM(z.delka),
        ZDROJ[e.source ?? ''] ?? 'ručně',
        // Stejné pravidlo jako součty (lib/wages): mzda po záznamu, záznam nad 24 h 0.
        ...(vidiMzdy ? [sazba ? String(earnedFor(z.ms, sazba)) : ''] : []),
      ];
    });
    const csv = [hlava, ...radky].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `dochazka-${dni}dni.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pocet = zobrazene.length;
  const nastroj = (
    <Card pad="none" aria-labelledby="dochazka-zaznamy-t">
      <div className="px-5 pt-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="dochazka-zaznamy-t" className="t-card flex items-center gap-2">
            Záznamy docházky
            {data.data && (
              <Chip tone="muted" size="sm">{q.trim() && pocet !== entries.length ? `${pocet.toLocaleString('cs-CZ')} z ${entries.length.toLocaleString('cs-CZ')}` : pocet.toLocaleString('cs-CZ')}</Chip>
            )}
          </h2>
        </div>
        {entries.length > 10 && (
          <SearchField value={q} onChange={setQ} storageKey="dochazka" placeholder="Hledat člověka…" ariaLabel="Hledat člověka v docházce" />
        )}
      </div>
      <div className="px-5 pb-3 pt-2">
        {data.loading ? (
          <div className="space-y-2 pb-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div>
        ) : data.error ? (
          <ErrorState compact title="Záznamy se nenačetly" detail={data.error} onRetry={data.reload} />
        ) : entries.length === 0 ? (
          <p className="t-meta py-4">Za {dni} dní nejsou žádné záznamy docházky.</p>
        ) : pocet === 0 ? (
          <p className="t-meta py-4">Nikdo takový za tohle období nic neodpíchl.</p>
        ) : dny.map(d => (
          <section key={d.den} aria-label={d.nazev} className="pt-2">
            <p className="t-label cz-sentence pt-2">{d.nazev}</p>
            <ul className="list">
              {d.list.map(e => {
                const z = rozeberZaznam(e, ted);
                const bezi = z.druh === 'bezi';
                const zapomenuty = z.druh === 'zapomenuty';
                const cas = `${dbTimeHM(e.clockIn)} – ${e.clockOut ? dbTimeHM(e.clockOut) : '…'}`;
                const meta = [cas, ZDROJ[e.source ?? ''] ?? 'ručně', e.note].filter(Boolean).join(' · ');
                const akce = (
                  <>
                    {smiUpravit && (zapomenuty
                      ? <Button variant="secondary" size="sm" onClick={() => otevriUpravu(e, true)} aria-label={`Ukončit příchod: ${e.employeeName ?? ''}`}>Ukončit</Button>
                      : <Button variant="ghost" size="sm" iconOnly icon="pencil" onClick={() => otevriUpravu(e)} aria-label={`Upravit čas: ${e.employeeName ?? ''}`} />)}
                    {smiMazat && (
                      <Button variant="ghost" size="sm" iconOnly icon="trash" onClick={() => { setChybaSmazani(null); setSmazat(e); }} aria-label={`Smazat záznam: ${e.employeeName ?? ''}`} />
                    )}
                  </>
                );
                return (
                  <ListRow key={e.id}
                    lead={<PersonLink id={Number(e.employeeId)}><Avatar emoji={e.employeeAvatar} size="sm" /></PersonLink>}
                    title={e.employeeName ?? 'Neznámý'}
                    meta={meta}
                    value={zapomenuty ? undefined : bezi ? `běží ${hodinyMinuty(z.delka)}` : hodinyMinuty(z.delka)}
                    right={zapomenuty ? <Chip tone="wait" size="sm" icon="warning">Zapomenutý odchod?</Chip>
                      : e.note ? <Chip tone="wait" size="sm">Zkontrolovat</Chip>
                      : z.druh === 'dlouhy' ? <Chip tone="wait" size="sm">Nad 24 h</Chip> : undefined}
                    actions={smiUpravit || smiMazat ? akce : undefined}
                  />
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );

  return (
    <ObdobiStrankyDochazky.Provider value={dni}>
      <PlochaWidgetu
        stranka="vedeni.dochazka"
        hlavicka={{
          title: 'Docházka',
          subtitle: 'Kdo je na směně, odpracované hodiny a mzdy za období.',
          hintId: 'attendance',
          primary: smiUpravit ? (
            <Button variant="accent" icon="plus" onClick={() => { setChybaPridani(null); setPridat(true); }}>Přidat záznam</Button>
          ) : undefined,
          secondary: smiExport && entries.length > 0 ? <Button variant="secondary" icon="download" onClick={exportCsv}>Export CSV</Button> : undefined,
          aside: (
            <Segmented size="sm" ariaLabel="Období" value={String(dni)} onChange={v => setDni(Number(v) as Obdobi)}
              options={OBDOBI.map(p => ({ id: String(p), label: `${p} dní` }))} />
          ),
        }}
        nastroj={nastroj}
      />

      {pridat && (
        <Modal open onClose={() => setPridat(false)} size="sm" title="Přidat záznam docházky" subtitle="Když se někdo zapomněl odpíchnout úplně."
          footer={<>
            <Button variant="secondary" onClick={() => setPridat(false)}>Zrušit</Button>
            <Button variant="primary" icon="plus" loading={pridavam} onClick={ulozNovy}>Přidat záznam</Button>
          </>}>
          <div className="space-y-3">
            <Field id="dochazka-novy-kdo" label="Kdo">
              <Select id="dochazka-novy-kdo" value={novy.kdo} onChange={e => setNovy(n => ({ ...n, kdo: e.target.value }))}>
                <option value="">Vyber člověka</option>
                {roster.map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
              </Select>
            </Field>
            <Field id="dochazka-novy-od" label="Příchod">
              <Input id="dochazka-novy-od" type="datetime-local" value={novy.od} onChange={e => setNovy(n => ({ ...n, od: e.target.value }))} />
            </Field>
            <Field id="dochazka-novy-do" label="Odchod" error={chybaPridani}>
              <Input id="dochazka-novy-do" type="datetime-local" value={novy.do} onChange={e => setNovy(n => ({ ...n, do: e.target.value }))} />
            </Field>
          </div>
        </Modal>
      )}

      {uprava && (
        <Modal open onClose={() => setUprava(null)} size="sm" title="Upravit čas na směně" subtitle={uprava.e.employeeName ?? undefined}
          footer={<>
            <Button variant="secondary" onClick={() => setUprava(null)}>Zrušit</Button>
            <Button variant="primary" icon="check" loading={ukladam} onClick={ulozUpravu}>Uložit</Button>
          </>}>
          <div className="space-y-3">
            <Field id="dochazka-uprava-od" label="Příchod">
              <Input id="dochazka-uprava-od" type="datetime-local" value={uprava.od} onChange={e => setUprava(u => (u ? { ...u, od: e.target.value } : u))} />
            </Field>
            <Field id="dochazka-uprava-do" label="Odchod" hint="Prázdné pole = pořád na směně." error={chybaUpravy}>
              <Input id="dochazka-uprava-do" type="datetime-local" value={uprava.do} onChange={e => setUprava(u => (u ? { ...u, do: e.target.value } : u))} />
            </Field>
          </div>
        </Modal>
      )}

      {smazat && (
        <Modal open onClose={() => setSmazat(null)} size="sm" title="Smazat záznam?"
          subtitle={`${smazat.employeeName ?? 'Neznámý'} · ${dbTimeHM(smazat.clockIn)} – ${smazat.clockOut ? dbTimeHM(smazat.clockOut) : '…'}`}
          footer={<>
            <Button variant="secondary" onClick={() => setSmazat(null)}>Zrušit</Button>
            <Button variant="danger-solid" loading={mazu} onClick={potvrdSmazani}>Smazat</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">Odpracované hodiny ze záznamu zmizí i ze mzdy. Vrátit to nejde.</p>
          {chybaSmazani && <p className="note note-danger mt-3" role="alert">{chybaSmazani}</p>}
        </Modal>
      )}

      {upgradeFor && <UpgradeModal feature={upgradeFor} onClose={() => setUpgradeFor(null)} />}
    </ObdobiStrankyDochazky.Provider>
  );
}
