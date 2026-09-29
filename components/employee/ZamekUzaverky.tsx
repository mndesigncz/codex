'use client';

// Zámek uzávěrky — co ještě chybí, než půjde uzávěrka odeslat.
//
// Dřív se o povinných postupech dozvěděl člověk až po spočítání kasy, z
// červené hlášky pod formulářem, a nevedlo z ní nic dál. Teď je zámek nad
// formulářem hned od začátku: klidná oranžová karta, co přesně chybí, kolik
// je hotovo a z každé věci cesta tam, kde se udělá. Kasa se mezitím dá
// počítat dál — zamčené je jen odeslání.
//
// Pravidla (co zamyká, pro koho, za který den) počítá server
// (/api/closings/povinne, stejný kontext jako POST /api/closings). Tady se
// jen kreslí; když se stav nenačte, zámek se nekreslí a rozhodne až POST.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Button, Card } from '../ui';
import { okJson, apiMessage } from '@/lib/api';
import { czCount, type CzNoun } from '@/lib/czech';
import type { PovinnaPolozka, TypPovinne } from '@/lib/povinnePredUzaverkou';
import { URL_POSTUPY, vyberPostupy, jeSchvaleny } from '@/lib/postupyPrehled';
import { vyberUkoly, type Ukol } from '@/lib/ukolyPrehled';
import { useNavigace, useSmi } from '../widgety/NavigaceKontext';
import { useDataWidgetu, obnovDataWidgetu } from '../widgety/useDataWidgetu';
import { useProcedures } from '../procedures/ProcedureProvider';

export { URL_POVINNE_PRED_UZAVERKOU as URL_POVINNE } from '../PredUzaverkou';

/** Odpověď GET /api/closings/povinne (viz app/api/closings/povinne/route.ts). */
export interface StavZamku {
  den: string;
  zamceno: boolean;
  polozky: PovinnaPolozka[];
  vsechny: PovinnaPolozka[];
  neznamo: TypPovinne[];
  smiObejit: boolean;
  duvodVolna: 'akce' | 'mimo_smenu' | null;
  celkem: number;
  hotovo: number;
}

/** Nečekaný tvar je chyba (formulář pak nezamyká), ne „nic nechybí". */
export function vyberStavZamku(raw: any): StavZamku {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.vsechny) || !Array.isArray(raw.polozky)) {
    throw new Error('Povinné věci přišly v nečekaném tvaru.');
  }
  const vsechny = raw.vsechny as PovinnaPolozka[];
  return {
    den: String(raw.den ?? ''),
    zamceno: raw.zamceno === true,
    polozky: raw.polozky as PovinnaPolozka[],
    vsechny,
    neznamo: Array.isArray(raw.neznamo) ? raw.neznamo : [],
    smiObejit: raw.smiObejit === true,
    duvodVolna: raw.duvodVolna === 'akce' || raw.duvodVolna === 'mimo_smenu' ? raw.duvodVolna : null,
    celkem: Number(raw.celkem) || vsechny.length,
    hotovo: Number(raw.hotovo) || vsechny.filter(x => x.hotovo).length,
  };
}

/**
 * 400 z POST /api/closings s `kod: 'POVINNE_NESPLNENO'` — mezi načtením a
 * odesláním se něco „od-hotovilo" (nebo se zámek nenačetl). Server je pravda:
 * formulář se přepne do zámku s tím, co server poslal.
 */
export function stavZOdmitnuti(predtim: StavZamku | null, chybi: PovinnaPolozka[]): StavZamku {
  const klic = (p: PovinnaPolozka) => `${p.typ}:${p.id}`;
  const chybiKlice = new Set(chybi.map(klic));
  const hotove = (predtim?.vsechny ?? []).filter(p => !chybiKlice.has(klic(p))).map(p => ({ ...p, hotovo: true }));
  const vsechny = [...hotove, ...chybi.map(p => ({ ...p, hotovo: false }))];
  return {
    den: predtim?.den ?? '',
    zamceno: true,
    polozky: chybi,
    vsechny,
    neznamo: [],
    // Server bránu uplatní jen tomu, kdo obejít nesmí — odmítnutí to potvrzuje.
    smiObejit: false,
    duvodVolna: null,
    celkem: vsechny.length,
    hotovo: hotove.length,
  };
}

export const VEC: CzNoun = { one: 'věc', few: 'věci', many: 'věcí' };

const SKUPINY: { typ: TypPovinne; nadpis: string }[] = [
  { typ: 'postup', nadpis: 'Postupy' },
  { typ: 'ukol', nadpis: 'Úkoly' },
  { typ: 'navod', nadpis: 'Návody' },
];

const ikonaPolozky = (p: PovinnaPolozka) =>
  p.typ === 'postup' ? (p.ikona || 'clipboard') : p.typ === 'ukol' ? 'calendarCheck' : 'book';

export function ZamekUzaverky({ stav, actingAs, proKoho, onZmena, predOdchodem, pulz }: {
  stav: StavZamku | null;
  /** Za koho se úkol odškrtne (tablet: člověk, za kterého se zavírá). */
  actingAs: number | null;
  /** Čí je uzávěrka — úkol přidělený někomu jinému z osádky je „čeká na kolegu". */
  proKoho: number | null;
  /** Něco se tu udělalo — ať formulář stav načte znovu. */
  onZmena: () => void;
  /** Těsně před odchodem na jiný pohled (formulář si uloží rozepsanou kasu). */
  predOdchodem: () => void;
  /** Roste, když někdo zkusil odeslat zamčenou uzávěrku — zámek se ukáže a zazvoní. */
  pulz: number;
}) {
  const nav = useNavigace();
  const smi = useSmi();
  const { active, startRun, starting } = useProcedures();
  const kartaRef = useRef<HTMLDivElement>(null);
  const hlavniRef = useRef<HTMLButtonElement>(null);
  const [chyba, setChyba] = useState('');
  const [odskrtavam, setOdskrtavam] = useState<number | null>(null);

  const chybi = stav?.polozky ?? [];
  const chybiPostup = chybi.some(p => p.typ === 'postup');
  const chybiUkol = chybi.some(p => p.typ === 'ukol');
  const smiSpustit = smi('postupy.spoustet');
  // Postup se spustí přímo tady (plovoucí běžec nad formulářem), aby člověk
  // neodcházel od napočítané kasy. K tomu je potřeba celý postup i s kroky.
  const postupy = useDataWidgetu(stav?.zamceno && chybiPostup && smiSpustit ? URL_POSTUPY : null, vyberPostupy);
  // Úkol bez checklistu jde odškrtnout rovnou v zámku; s checklistem ne —
  // ten se odškrtává po krocích v Úkolech.
  const ukoly = useDataWidgetu<Ukol[]>(stav?.zamceno && chybiUkol ? '/api/tasks' : null, vyberUkoly);

  // Doběhl postup (běžec se zavřel) → stav znovu, jinak by zámek visel dál.
  const bezelo = useRef<number | null>(null);
  const aktivniId = active?.id ?? null;
  useEffect(() => {
    if (bezelo.current !== null && aktivniId === null) {
      const t = setTimeout(onZmena, 500);
      bezelo.current = aktivniId;
      return () => clearTimeout(t);
    }
    bezelo.current = aktivniId;
  }, [aktivniId, onZmena]);

  // Pokus o odeslání zamčené uzávěrky: ukázat proč, zazvonit zámkem a dát
  // fokus hlavní akci, ať klávesnice skončí tam, kde se dá pokračovat.
  useEffect(() => {
    if (!pulz) return;
    const tise = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    kartaRef.current?.scrollIntoView({ behavior: tise ? 'auto' : 'smooth', block: 'start' });
    hlavniRef.current?.focus({ preventScroll: true });
  }, [pulz]);

  // Odemčení během téhle návštěvy si zaslouží viditelný okamžik (fajfka
  // „pop"), trvalé „všechno hotovo" při otevření stačí tiše.
  const bylZamcen = useRef(false);
  const [praveOdemceno, setPraveOdemceno] = useState(false);
  useEffect(() => {
    if (!stav) return;
    if (stav.zamceno) { bylZamcen.current = true; setPraveOdemceno(false); return; }
    if (bylZamcen.current) { bylZamcen.current = false; setPraveOdemceno(true); }
  }, [stav]);

  const ukolPodleId = useMemo(() => new Map((ukoly.data ?? []).map(u => [u.id, u])), [ukoly.data]);
  const postupPodleId = useMemo(() => new Map((postupy.data?.postupy ?? []).map(p => [p.id, p])), [postupy.data]);

  if (!stav || stav.vsechny.length === 0 || stav.duvodVolna) return null;

  if (!stav.zamceno) {
    return (
      <p className={`note note-ok text-sm flex items-center gap-2 ${praveOdemceno ? 'rise-in' : ''}`} role="status">
        <Icon name="check" size={17} className="shrink-0" motion={praveOdemceno ? 'pop' : undefined} />
        Vše povinné je hotové — uzávěrka je odemčená.
      </p>
    );
  }

  const spustitelny = (p: PovinnaPolozka) => {
    if (p.typ !== 'postup' || !smiSpustit) return null;
    const cely = postupPodleId.get(p.id);
    return cely && jeSchvaleny(cely) ? cely : null;
  };
  const bezi = (p: PovinnaPolozka) => p.typ === 'postup' && active?.procedureId === p.id;
  // Jiný běžící postup: nový by ho přebil, tak se radši nespouští.
  const jinyBezi = (p: PovinnaPolozka) => p.typ === 'postup' && active != null && active.procedureId !== p.id;
  const odskrtnutelny = (p: PovinnaPolozka) => {
    if (p.typ !== 'ukol') return false;
    const u = ukolPodleId.get(p.id);
    // Výrobní úkol odškrtnutím naskladní dávku — to se dělá vědomě v Úkolech.
    return !!u && u.status !== 'done' && u.checklist.length === 0 && u.source !== 'production';
  };
  const odkazJde = (p: PovinnaPolozka) => nav.smiPohled(p.odkaz.pohled);
  // Úkol kolegy ze směny: server ho do zámku počítá (osádka), ale v Úkolech ho
  // zaměstnanec bez širších práv nevidí — klik by vedl do prázdna a formulář
  // by se zbytečně odmontoval. Kdo ho v seznamu úkolů má (vedení), otevře ho.
  const cizi = (p: PovinnaPolozka) =>
    p.typ === 'ukol' && p.kdoId != null && p.kdoId !== proKoho && !ukolPodleId.has(p.id);

  const otevri = (p: PovinnaPolozka) => {
    setChyba('');
    if (bezi(p)) return;
    const cely = spustitelny(p);
    if (cely && !jinyBezi(p)) {
      if (!starting) void startRun(cely as any);
      return;
    }
    predOdchodem();
    if (!odkazJde(p)) { window.location.assign(p.odkaz.href); return; }
    // Konkrétní postup otevře layout (navigate s id → otevriPostupPoPrechodu).
    nav.onNavigate(p.odkaz.pohled, p.odkaz.arg);
  };

  const hotovo = async (p: PovinnaPolozka) => {
    setChyba('');
    setOdskrtavam(p.id);
    try {
      await fetch('/api/tasks', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, status: 'done', ...(actingAs != null ? { actingAs } : {}) }),
      }).then(okJson);
      // Seznam úkolů a widgety na ploše čtou tutéž URL; formulář se
      // přepočítá přes onZmena (událost by ho jen zavolala podruhé).
      obnovDataWidgetu('/api/tasks');
      onZmena();
    } catch (e) {
      setChyba(apiMessage(e, 'Úkol se nepodařilo odškrtnout.'));
    }
    setOdskrtavam(null);
  };

  const napoveda = (p: PovinnaPolozka): string | null => {
    if (p.typ === 'postup') {
      if (bezi(p)) return 'Běží — dokonči ho v okně postupu.';
      if (spustitelny(p) && !jinyBezi(p)) return 'Klepnutím spustíš tady.';
      if (jinyBezi(p) && active) return `Nejdřív dokonči běžící postup ${active.name}.`;
      return 'Otevře se v Postupech.';
    }
    if (cizi(p)) return `Čeká na: ${p.kdo || 'kolegu'} — odškrtne ho ve svém účtu.`;
    if (p.typ === 'ukol') return p.kdo ? `Pro: ${p.kdo}` : null;
    return 'Přečti a potvrď, že máš přečteno.';
  };

  // Hlavní akce jen na to, co jde udělat odsud — ne na kolegův úkol.
  const mojeChybi = chybi.filter(p => !cizi(p));
  const prvni = mojeChybi.find(p => !bezi(p)) ?? mojeChybi[0];
  const pct = stav.celkem > 0 ? Math.round((stav.hotovo / stav.celkem) * 100) : 0;
  const zbyva = chybi.length;

  return (
    <div ref={kartaRef} className="scroll-mt-4">
    <Card tone="wait" pad="md" className="rise-in space-y-4" aria-labelledby="zamek-uzaverky-titulek">
      <div className="flex items-start gap-4">
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-wait/20 text-wait-ink">
          {/* Nový klíč = animace znovu: zámek „zazvoní" při každém pokusu o odeslání. */}
          <Icon key={pulz} name="lock" size={24} motion="ring" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="zamek-uzaverky-titulek" className="t-card">Uzávěrka je zamčená</h2>
          <p className="t-meta mt-0.5 text-pretty">
            {mojeChybi.length > 0
              ? <>Nejdřív dokonči {czCount(zbyva, VEC)}. Pak se odemkne sama.</>
              : <>Zbývá {czCount(zbyva, VEC)} na kolezích ze směny. Až je odškrtnou, odemkne se sama.</>}
          </p>
        </div>
      </div>

      {stav.celkem > 1 && (
        <div className="space-y-1.5">
          <p className="t-meta tabular-nums">Hotovo {stav.hotovo} z {stav.celkem}</p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]" role="progressbar"
            aria-valuenow={stav.hotovo} aria-valuemin={0} aria-valuemax={stav.celkem} aria-label="Hotové povinné věci">
            <div className="h-full rounded-full bg-ok transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {SKUPINY.map(({ typ, nadpis }) => {
        const vSkupine = stav.vsechny.filter(p => p.typ === typ);
        if (vSkupine.length === 0) return null;
        return (
          <div key={typ}>
            <p className="t-label" id={`zamek-${typ}`}>{nadpis}</p>
            <ul className="list mt-1" aria-labelledby={`zamek-${typ}`}>
              {vSkupine.map(p => {
                const kruh = (
                  <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                    p.hotovo ? 'bg-ok on-accent' : 'border-2 border-wait-ink/40'}`}>
                    {p.hotovo && <Icon name="check" size={12} strokeWidth={2.6} />}
                  </span>
                );
                if (p.hotovo) {
                  // Hotové tiše: jen fajfka a tlumený název, žádná akce.
                  return (
                    <li key={`${p.typ}:${p.id}`} className="list-row !min-h-0 !py-2">
                      {kruh}
                      <span className="t-meta min-w-0 flex-1 truncate"><span className="sr-only">Hotovo: </span>{p.nazev}</span>
                    </li>
                  );
                }
                const hint = napoveda(p);
                if (cizi(p)) {
                  // Jen informace: žádná šipka ani tlačítko, nic k otevření.
                  return (
                    <li key={`${p.typ}:${p.id}`} className="list-row !py-2 gap-3">
                      {kruh}
                      <Icon name="users" size={17} className="shrink-0 text-black/45" />
                      <span className="min-w-0 flex-1">
                        <span className="t-card block text-pretty">{p.nazev}</span>
                        {hint && <span className="t-meta block text-pretty">{hint}</span>}
                      </span>
                    </li>
                  );
                }
                const obsah = (
                  <>
                    {kruh}
                    <Icon name={ikonaPolozky(p)} size={17} className="shrink-0 text-black/45" />
                    <span className="min-w-0 flex-1">
                      <span className="t-card block text-pretty">{p.nazev}</span>
                      {hint && <span className="t-meta block text-pretty">{hint}</span>}
                    </span>
                    {bezi(p)
                      ? <Icon name="play" size={14} motion="pulse" className="shrink-0 text-wait-ink" />
                      : <Icon name="chevronRight" size={16} className="shrink-0 text-black/30" />}
                  </>
                );
                const tridaRadku = 'flex min-w-0 flex-1 items-center gap-3 rounded-[var(--r-md)] -mx-2 px-2 py-2 text-left transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime';
                // Bez navigace (formulář vložený mimo layout) a bez spuštění na
                // místě vede řádek obyčejným odkazem.
                const jenOdkaz = !odkazJde(p) && !(spustitelny(p) && !jinyBezi(p));
                return (
                  <li key={`${p.typ}:${p.id}`} className="list-row !py-1 gap-2">
                    {jenOdkaz ? (
                      <a href={p.odkaz.href} onClick={predOdchodem} className={tridaRadku}>{obsah}</a>
                    ) : (
                      <button type="button" onClick={() => otevri(p)} disabled={bezi(p)} className={`${tridaRadku} disabled:cursor-default`}>{obsah}</button>
                    )}
                    {odskrtnutelny(p) && (
                      <Button size="sm" variant="secondary" icon="check" loading={odskrtavam === p.id}
                        onClick={() => hotovo(p)} aria-label={`Hotovo: ${p.nazev}`}>
                        Hotovo
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}

      {prvni && (
        // Jediná limetka obrazovky, dokud je zamčeno — odeslání je mezitím šedé.
        <Button ref={hlavniRef} variant="accent" size="lg" block iconAfter="chevronRight"
          loading={starting && !!spustitelny(prvni)} disabled={bezi(prvni)}
          onClick={() => otevri(prvni)} className="!w-full min-w-0">
          <span className="min-w-0 truncate">Dokončit: {prvni.nazev}</span>
        </Button>
      )}
      {stav.smiObejit && (
        <p className="t-meta text-pretty">Máš právo odeslat uzávěrku i tak — při odeslání se tě ještě zeptáme.</p>
      )}
    </Card>
    </div>
  );
}

export default ZamekUzaverky;
