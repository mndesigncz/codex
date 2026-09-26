'use client';

// Rozložení plochy v klientu (kolo 68, spec §4.7).
//
// Jeden háček pro obě podoby: osobní rozložení stránky (/api/rozlozeni)
// a výchozí rozložení podniku pro rozsah (/api/rozlozeni/vychozi, editor
// v Nastavení → Stránky). Drží model, zásobník „Vrátit" a frontu zápisů.
//
// Proč optimisticky a průběžně: každá operace (přesun, odebrání, velikost)
// se na ploše projeví hned, a teprve pak jde na server. Člověk skládá plochu
// jako ikony na telefonu — kdyby čekal na odpověď po každém tahu, působilo
// by to jako formulář. Zápisy se slučují 400 ms a v jednu chvíli běží nejvýš
// jeden (vyhrává poslední stav), takže rychlé přeskládání pěti widgetů je
// jeden PUT, ne pět souběžných, které by se srazily o verzi.
//
// Když zápis selže na síti, model zůstává: změna je záměr člověka a vrátit
// ji potichu by bylo horší než ukázat „Neuloženo · Zkusit znovu" (nález N6:
// starý přehled se po 403 tiše vracel a člověk nevěděl proč).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiMessage, okJson } from '@/lib/api';
import type { IdStranky, PolozkaRozlozeni, Rozsah, RozsahVolba, Tarif, Velikost, Zdroj } from '@/lib/widgety/typy';
import { klicPoslednihoRozlozeni } from '@/lib/widgety/rozlozeni';
import { stranka as definiceStranky } from '@/lib/widgety/stranky';
import { NASTROJ } from '@/lib/widgety/konstanty';
import { idZWidgetu } from '@/lib/widgety/hash';
import { OPAKOVANI_ZAPISU_MS, SLUCOVANI_ZAPISU_MS, VRATIT_KROKU } from '@/lib/widgety/konstanty';

/** Co se se zápisem stalo — plocha z toho dělá toasty a hlášení. */
export type UdalostRozlozeni =
  | { typ: 'ulozeno' }
  /** 409: jiné okno bylo rychlejší; model teď ukazuje novější stav serveru. */
  | { typ: 'konflikt' }
  /** 403 se zámkem: vedení mezitím rozložení zamklo. */
  | { typ: 'zamceno' }
  /** Síť nebo 5xx: model zůstal, zkouší se znovu (hlásí se jednou za sérii). */
  | { typ: 'neulozeno' }
  /** Odmítnutí, které opakování nespraví (400, 403, 413) — hláška serveru doslova. */
  | { typ: 'chyba'; zprava: string };

export type StavUkladani = 'ulozeno' | 'ceka' | 'uklada' | 'chyba';

export interface VolbyRozlozeni {
  /** Rozsah výchozího rozložení (Nastavení → Stránky); bez něj osobní rozložení. */
  rozsah?: Rozsah | null;
  /** Háček nic nenačítá ani neukládá — plocha dostala řízení zvenku (`rizeni`). */
  vypnuto?: boolean;
}

export interface Rozlozeni {
  stranka: IdStranky;
  /** Rozsah výchozího (jen v editoru výchozích), jinak null. */
  rozsahVychoziho: Rozsah | null;
  /** 'nacitam' do první odpovědi, 'chyba' když GET selhal (plocha ukáže výchozí z kódu). */
  nacteni: 'nacitam' | 'ok' | 'chyba';
  chybaNacteni: string | null;
  /** Model v pořadí — po GET skutečný, předtím případně poslední známý (kostry). */
  polozky: PolozkaRozlozeni[];
  /** `polozky` jsou jen poslední známé z localStorage (id a velikosti), GET ještě nedorazil. */
  predbezne: boolean;
  dostupne: string[];
  tarifem: { widget: string; tarif: Tarif }[];
  zdroj: Zdroj;
  /** Odkud je výchozí, ze kterého se vychází (null = aplikace). */
  rozsah: Rozsah | null;
  zamceno: boolean;
  smiUpravit: boolean;
  smiVychozi: boolean;
  verze: number;
  /** Editor výchozích: volby „Pro koho" s počty lidí. */
  rozsahy: RozsahVolba[];
  /** Editor výchozích: kdy výchozí naposledy někdo změnil (ISO), null = z aplikace. */
  upraveno: string | null;
  ukladani: StavUkladani;
  lzeVratit: boolean;
  /** Nový model (optimisticky) + naplánovaný zápis; předchozí stav jde do „Vrátit". */
  zmen: (nove: PolozkaRozlozeni[], volby?: { bezVratit?: boolean }) => void;
  /** Vrátí předchozí stav (tlačítko v toastu, Ctrl/Cmd+Z). */
  vratit: () => boolean;
  /** Odešle frontu hned (odchod z úprav). Vrátí, jestli je uloženo. */
  ulozHned: () => Promise<boolean>;
  /** „Zkusit znovu" v liště po nepovedeném zápisu. */
  zkusitZnovu: () => void;
  nactiZnovu: () => void;
  /** Osobní: smaže vlastní rozložení (DELETE); výchozí: vrátí výchozí z aplikace. */
  obnovVychozi: () => Promise<boolean>;
  /** Editor výchozích: zámek (ukládá se hned jako každá jiná změna). */
  nastavZamceno: (zamknout: boolean) => void;
  /** Kdo poslouchá události zápisu (plocha — toasty). Jeden posluchač. */
  nastavPosluchace: (f: ((u: UdalostRozlozeni) => void) | null) => void;
}

interface Meta {
  dostupne: string[];
  tarifem: { widget: string; tarif: Tarif }[];
  zdroj: Zdroj;
  rozsah: Rozsah | null;
  smiUpravit: boolean;
  smiVychozi: boolean;
  rozsahy: RozsahVolba[];
  upraveno: string | null;
}

const PRAZDNA_META: Meta = { dostupne: [], tarifem: [], zdroj: 'aplikace', rozsah: null, smiUpravit: false, smiVychozi: false, rozsahy: [], upraveno: null };

const VELIKOSTI = new Set<string>(['S', 'M', 'L']);

/** Poslední známé rozložení: jen id instancí, widgetů a velikosti — žádná nastavení, žádná data. */
function prectiPosledni(klic: string): PolozkaRozlozeni[] {
  try {
    const pole = JSON.parse(localStorage.getItem(klic) ?? 'null');
    if (!Array.isArray(pole)) return [];
    return pole
      .filter((x: any) => x && typeof x.i === 'string' && typeof x.w === 'string' && VELIKOSTI.has(x.v))
      .slice(0, 40)
      .map((x: any): PolozkaRozlozeni => ({ id: x.i, widget: x.w, velikost: x.v as Velikost }));
  } catch { return []; }
}

function zapisPosledni(klic: string, polozky: readonly PolozkaRozlozeni[]) {
  try { localStorage.setItem(klic, JSON.stringify(polozky.map(p => ({ i: p.id, w: p.widget, v: p.velikost })))); }
  catch { /* soukromé okno — kostry se pak kreslí jen obecné */ }
}

const stejne = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Nástroj stránky nejde odebrat, takže v modelu musí být vždycky. Server ho
 * doplňuje sám (normalizujRozlozeni), ale odpověď bez `polozky` nebo z cache
 * či podvrhu by jinak nechala stránku bez hlavní práce.
 */
function doplnNastroj(id: IdStranky, pol: PolozkaRozlozeni[]): PolozkaRozlozeni[] {
  if (!definiceStranky(id)?.nastroj || pol.some(p => p.widget === NASTROJ)) return pol;
  return [{ id: idZWidgetu(NASTROJ), widget: NASTROJ, velikost: 'L' }, ...pol];
}

/**
 * Rozložení stránky: GET, model, fronta zápisů a „Vrátit" (spec §4.7).
 * S `rozsah` pracuje s výchozím rozložením podniku (Nastavení → Stránky).
 */
export function useRozlozeni(stranka: IdStranky, volby: VolbyRozlozeni = {}): Rozlozeni {
  const rozsahVychoziho = volby.rozsah ?? null;
  const vychozi = rozsahVychoziho != null;
  const vypnuto = volby.vypnuto === true;
  const url = vychozi
    ? `/api/rozlozeni/vychozi?stranka=${encodeURIComponent(stranka)}&rozsah=${encodeURIComponent(rozsahVychoziho!)}`
    : `/api/rozlozeni?stranka=${encodeURIComponent(stranka)}`;
  const { data: relace } = useSession();
  const teamId = (relace?.user as { teamId?: number | null } | undefined)?.teamId ?? null;
  const klicPosledniho = teamId != null && !vychozi ? klicPoslednihoRozlozeni(teamId, stranka) : null;

  const [nacteni, setNacteni] = useState<'nacitam' | 'ok' | 'chyba'>('nacitam');
  const [chybaNacteni, setChybaNacteni] = useState<string | null>(null);
  const [polozky, setPolozkyStav] = useState<PolozkaRozlozeni[]>([]);
  const [predbezne, setPredbezne] = useState(false);
  const [meta, setMeta] = useState<Meta>(PRAZDNA_META);
  const [zamceno, setZamcenoStav] = useState(false);
  const [verzeStav, setVerzeStav] = useState(0);
  const [ukladani, setUkladani] = useState<StavUkladani>('ulozeno');
  const [lzeVratit, setLzeVratit] = useState(false);

  // Refy pro obsluhu událostí a zápisů: ty běží mimo vykreslení a musí vidět
  // poslední stav, ne ten, se kterým vznikla jejich uzávěra.
  const model = useRef<PolozkaRozlozeni[]>([]);
  const verze = useRef(0);
  const zamcenoRef = useRef(false);
  /** Editor výchozích: id v poslední odpovědi serveru — z nich se počítá `odebrane`. */
  const idServeru = useRef<Set<string>>(new Set());
  const zasobnik = useRef<PolozkaRozlozeni[][]>([]);
  const casovac = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bezi = useRef<Promise<boolean> | null>(null);
  const znovu = useRef(false);
  const ceka = useRef(false);
  const pokus = useRef(0);
  const nahlasenoNeulozeno = useRef(false);
  const posluchac = useRef<((u: UdalostRozlozeni) => void) | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;
  const klicPoslednihoRef = useRef(klicPosledniho);
  klicPoslednihoRef.current = klicPosledniho;
  const zije = useRef(true);
  const generace = useRef(0);
  /**
   * Verze z poslední úspěšné odpovědi na PUT podle adresy — zapisuje se i po
   * odmontování. Dopsání fronty v úklidu čeká na běžící zápis a potřebuje
   * verzi z JEHO odpovědi; `verze.current` by byla stará a server by dopsání
   * odmítl 409 (review kola 68, rev-fyz8).
   */
  const verzePodleUrl = useRef(new Map<string, number>());
  /** Stránka se zavírá (pagehide): selhání fetch je pak konec stránky, ne síť — žádné opakování. */
  const odchod = useRef(false);

  const udalost = (u: UdalostRozlozeni) => posluchac.current?.(u);

  const nastavModel = useCallback((p: PolozkaRozlozeni[]) => {
    model.current = p;
    setPolozkyStav(p);
  }, []);

  /** Převezme tvar GET (osobní i výchozí; také `aktualni` u 409 a odpověď DELETE). */
  const prevezmi = useCallback((d: any) => {
    const pol: PolozkaRozlozeni[] = doplnNastroj(stranka, Array.isArray(d?.polozky) ? d.polozky : []);
    nastavModel(pol);
    verze.current = Number.isInteger(d?.verze) ? d.verze : 0;
    setVerzeStav(verze.current);
    const z = d?.zamceno === true;
    zamcenoRef.current = z;
    setZamcenoStav(z);
    if (vychozi) idServeru.current = new Set(pol.map(p => p.id));
    setMeta({
      dostupne: Array.isArray(d?.dostupne) ? d.dostupne : [],
      tarifem: Array.isArray(d?.tarifem) ? d.tarifem : [],
      zdroj: d?.zdroj === 'osobni' || d?.zdroj === 'podnik' ? d.zdroj : 'aplikace',
      rozsah: typeof d?.rozsah === 'string' ? d.rozsah : null,
      // Editor výchozích upravuje vždy (bránu správce hlídá server).
      smiUpravit: vychozi ? true : d?.smiUpravit === true,
      smiVychozi: vychozi ? true : d?.smiVychozi === true,
      rozsahy: Array.isArray(d?.rozsahy) ? d.rozsahy : [],
      upraveno: typeof d?.upraveno === 'string' ? d.upraveno : null,
    });
    setPredbezne(false);
    setChybaNacteni(null);
    setNacteni('ok');
    if (klicPoslednihoRef.current) zapisPosledni(klicPoslednihoRef.current, pol);
  }, [stranka, vychozi, nastavModel]);

  const nactiRef = useRef<() => void>(() => {});
  const nacti = useCallback(() => {
    const g = ++generace.current;
    fetch(urlRef.current, { cache: 'no-store' })
      .then(okJson)
      .then(d => { if (g === generace.current && zije.current) prevezmi(d); })
      .catch(e => {
        if (g !== generace.current || !zije.current) return;
        setChybaNacteni(apiMessage(e, 'Rozložení se nenačetlo.'));
        setNacteni('chyba');
      });
  }, [prevezmi]);
  nactiRef.current = nacti;

  const teloZapisu = () => {
    if (!vychozi) return { polozky: model.current, verze: verze.current };
    const vModelu = new Set(model.current.map(p => p.id));
    // Editor výchozích ukazuje výchozí nefiltrované, takže správce v něm
    // odebere i widget, který sám nevidí. Server by ho jinak vrátil zpátky
    // (zachovává skryté) — proto se vyjmenuje (nález z review jádra).
    const odebrane = [...idServeru.current].filter(id => !vModelu.has(id));
    return { polozky: model.current, zamceno: zamcenoRef.current, verze: verze.current, odebrane };
  };

  const odesli = useCallback(async (): Promise<boolean> => {
    if (casovac.current) { clearTimeout(casovac.current); casovac.current = null; }
    if (bezi.current) { znovu.current = true; return bezi.current; }
    if (!ceka.current) return true;
    const u = urlRef.current;
    const beh = (async (): Promise<boolean> => {
      ceka.current = false;
      const odeslano = model.current;
      if (zije.current) setUkladani('uklada');
      let res: Response | null = null;
      let d: any = {};
      try {
        // keepalive vždy: když člověk zavře kartu uprostřed zápisu, prohlížeč
        // by obyčejný fetch zrušil a dopsání s verzí +1 (dopisHned) by pak
        // narazilo na 409.
        res = await fetch(u, {
          method: 'PUT', keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(teloZapisu()),
        });
        d = await res.json().catch(() => ({}));
      } catch { res = null; }
      if (res?.ok && Number.isInteger(d?.verze)) verzePodleUrl.current.set(u, d.verze);
      // Odpověď pro stránku (rozsah), která už není na obrazovce, se jen zahodí.
      if (!zije.current || u !== urlRef.current) return !!res?.ok;
      if (res?.ok) {
        // Nejvýš: souběžné dopsání (dopisHned) mohlo verzi posunout dál, než
        // o jakou se ví z téhle odpovědi. Verze na serveru jen roste.
        verze.current = Number.isInteger(d?.verze) ? Math.max(verze.current, d.verze) : verze.current;
        setVerzeStav(verze.current);
        pokus.current = 0;
        nahlasenoNeulozeno.current = false;
        const vraceno: PolozkaRozlozeni[] | null = Array.isArray(d?.polozky) ? d.polozky : null;
        if (vychozi && vraceno) idServeru.current = new Set(vraceno.map(p => p.id));
        // Server mohl něco zahodit (neznámý widget, limit). Model se nahradí
        // jen tehdy, když se mezitím nic dalšího nezměnilo — jinak by odpověď
        // na starší zápis přepsala tah, který člověk udělal během jeho letu.
        if (vraceno && model.current === odeslano && !ceka.current && !stejne(vraceno, odeslano)) nastavModel(vraceno);
        if (klicPoslednihoRef.current) zapisPosledni(klicPoslednihoRef.current, model.current);
        // Po prvním zápisu řádek existuje: osobní rozložení je teď „osobní"
        // (nabídne se Obnovit výchozí), výchozí podniku „z podniku".
        setMeta(m => ({ ...m, zdroj: vychozi ? 'podnik' : 'osobni', upraveno: vychozi ? new Date().toISOString() : m.upraveno }));
        setUkladani(ceka.current ? 'ceka' : 'ulozeno');
        udalost({ typ: 'ulozeno' });
        return true;
      }
      if (res?.status === 409) {
        ceka.current = false;
        zasobnik.current = [];
        setLzeVratit(false);
        if (d?.aktualni) prevezmi(d.aktualni); else nactiRef.current();
        setUkladani('ulozeno');
        udalost({ typ: 'konflikt' });
        return false;
      }
      if (res?.status === 403 && d?.zamceno === true) {
        ceka.current = false;
        zasobnik.current = [];
        setLzeVratit(false);
        nactiRef.current();
        setUkladani('ulozeno');
        udalost({ typ: 'zamceno' });
        return false;
      }
      if (res && res.status !== 429 && res.status < 500) {
        // Odmítnutí, které opakování nespraví: hláška serveru doslova, model zůstává.
        ceka.current = true;
        setUkladani('chyba');
        udalost({ typ: 'chyba', zprava: typeof d?.error === 'string' && d.error ? d.error : 'Rozložení se nepodařilo uložit.' });
        return false;
      }
      // Síť, 429, 5xx, 503 před migrací: model zůstává a zkusí se to znovu po 2, 5 a 15 s.
      ceka.current = true;
      setUkladani('chyba');
      if (!nahlasenoNeulozeno.current) { nahlasenoNeulozeno.current = true; udalost({ typ: 'neulozeno' }); }
      const i = pokus.current++;
      if (i < OPAKOVANI_ZAPISU_MS.length) casovac.current = setTimeout(() => { void odesliRef.current(); }, OPAKOVANI_ZAPISU_MS[i]);
      return false;
    })();
    bezi.current = beh;
    try { return await beh; }
    finally {
      bezi.current = null;
      if (znovu.current) { znovu.current = false; if (ceka.current) void odesliRef.current(); }
    }
  // teloZapisu a udalost čtou jen refy.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vychozi, nastavModel, prevezmi]);
  const odesliRef = useRef(odesli);
  odesliRef.current = odesli;

  /**
   * Dopsání fronty při odchodu (pagehide, skrytí karty): pošle se HNED
   * s keepalive, nečeká se za běžícím zápisem — stránka mezitím skončí a na
   * `znovu` z odesli() by nikdo nedošel (spec §4.7). Běžící zápis A
   * (keepalive, takže doběhne i po zavření) zvedne verzi o jedna, proto
   * dopsání nese verzi + 1 a celý model: vyhrát má poslední stav.
   * Když stránka žije dál (jen skrytá karta) a dopsání přesto dostane 409
   * (A neprošel), zkusí se to po doběhnutí A běžnou cestou znovu.
   */
  const dopisHned = useCallback((u: string) => {
    if (!ceka.current || urlRef.current !== u) return;
    if (!bezi.current) { void odesliRef.current(); return; }
    if (casovac.current) { clearTimeout(casovac.current); casovac.current = null; }
    const odeslano = model.current;
    const telo = { ...teloZapisu(), verze: verze.current + 1 };
    ceka.current = false;
    fetch(u, { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(telo) })
      .then(async res => {
        const d = await res.json().catch(() => ({}));
        if (res.ok && Number.isInteger(d?.verze)) {
          verzePodleUrl.current.set(u, d.verze);
          if (zije.current && urlRef.current === u) { verze.current = Math.max(verze.current, d.verze); setVerzeStav(verze.current); }
          return;
        }
        if (!res.ok && zije.current && urlRef.current === u && model.current === odeslano) {
          ceka.current = true;
          const pred = bezi.current;
          if (pred) znovu.current = true; else void odesliRef.current();
        }
      })
      .catch(() => {
        // Při zavírání stránky prohlížeč sliby fetch odmítne, i když keepalive
        // požadavek doběhne — opakování by poslalo starou verzi a skončilo 409.
        if (odchod.current) return;
        if (zije.current && urlRef.current === u && model.current === odeslano) { ceka.current = true; if (!bezi.current) void odesliRef.current(); else znovu.current = true; }
      });
  // teloZapisu čte jen refy.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const naplanuj = useCallback(() => {
    ceka.current = true;
    pokus.current = 0;
    setUkladani('ceka');
    if (casovac.current) clearTimeout(casovac.current);
    casovac.current = setTimeout(() => { void odesliRef.current(); }, SLUCOVANI_ZAPISU_MS);
  }, []);

  // Načtení a změna stránky nebo rozsahu. Úklid efektu odešle, co zbylo
  // neuložené, ještě na STAROU adresu — přepnutí „Pro koho" v editoru
  // výchozích nesmí poslat rozložení jedné role do rozsahu jiné.
  useEffect(() => {
    if (vypnuto) return;
    zije.current = true;
    setNacteni('nacitam');
    zasobnik.current = [];
    setLzeVratit(false);
    nacti();
    const u = url;
    const pryc = () => { odchod.current = true; dopisHned(u); };
    // Stránka z bfcache (zpět v historii) žije dál — opakování zase platí.
    const navrat = () => { odchod.current = false; };
    const skryti = () => { if (document.visibilityState === 'hidden') dopisHned(u); };
    window.addEventListener('pagehide', pryc);
    window.addEventListener('pageshow', navrat);
    document.addEventListener('visibilitychange', skryti);
    return () => {
      window.removeEventListener('pagehide', pryc);
      window.removeEventListener('pageshow', navrat);
      document.removeEventListener('visibilitychange', skryti);
      if (casovac.current) { clearTimeout(casovac.current); casovac.current = null; }
      if (ceka.current) {
        // Odmontování plochy (navigace v bočním pásu) nebo jiný rozsah: dopsat
        // s keepalive, ať zápis přežije i zavření stránky. Když ještě běží
        // předchozí zápis, počká se na něj a pošle se s verzí z JEHO odpovědi —
        // s `verze.current` by server dopsání odmítl 409 a poslední změna by se
        // potichu ztratila (review kola 68). Aplikace (SPA) mezitím žije dál,
        // takže počkat jde; zavření karty řeší pagehide (dopisHned).
        const telo = teloZapisu();
        const verzeTed = verze.current;
        ceka.current = false;
        // Stará hodnota by po „Obnovit výchozí" (DELETE, verze od nuly) lhala —
        // platí jen verze z odpovědi, která přijde teď.
        verzePodleUrl.current.delete(u);
        const posli = () => {
          const v = verzePodleUrl.current.get(u) ?? verzeTed;
          fetch(u, { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...telo, verze: v }) })
            .catch(() => { /* stránka už je pryč; při dalším otevření platí poslední uložený stav */ });
        };
        const pred = bezi.current;
        if (pred) void pred.catch(() => false).then(posli); else posli();
      }
      generace.current++;
    };
  // teloZapisu čte jen refy; nacti se mění jen s prevezmi.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, vypnuto]);

  useEffect(() => () => { zije.current = false; }, []);

  // Kostry podle posledního známého rozložení, dokud nedorazí GET (spec §3.1).
  useEffect(() => {
    if (vypnuto || !klicPosledniho || nacteni !== 'nacitam' || model.current.length) return;
    const pol = prectiPosledni(klicPosledniho);
    if (!pol.length) return;
    model.current = pol;
    setPolozkyStav(pol);
    setPredbezne(true);
  }, [klicPosledniho, nacteni, vypnuto]);

  const zmen = useCallback((nove: PolozkaRozlozeni[], v?: { bezVratit?: boolean }) => {
    if (!v?.bezVratit) {
      zasobnik.current.push(model.current);
      if (zasobnik.current.length > VRATIT_KROKU) zasobnik.current.shift();
      setLzeVratit(true);
    }
    nastavModel(nove);
    naplanuj();
  }, [nastavModel, naplanuj]);

  const vratit = useCallback(() => {
    const p = zasobnik.current.pop();
    if (!p) return false;
    setLzeVratit(zasobnik.current.length > 0);
    nastavModel(p);
    naplanuj();
    return true;
  }, [nastavModel, naplanuj]);

  const ulozHned = useCallback(async () => {
    if (!ceka.current && !bezi.current) return true;
    return odesliRef.current();
  }, []);

  const zkusitZnovu = useCallback(() => {
    pokus.current = 0;
    ceka.current = true;
    void odesliRef.current();
  }, []);

  const obnovVychozi = useCallback(async (): Promise<boolean> => {
    if (casovac.current) { clearTimeout(casovac.current); casovac.current = null; }
    if (bezi.current) await bezi.current.catch(() => false);
    ceka.current = false;
    const pred = model.current;
    try {
      const res = await fetch(urlRef.current, { method: 'DELETE' });
      const d = await okJson(res);
      if (!zije.current) return true;
      // „Vrátit" pak pošle PUT s předchozím rozložením a verzí 0 — řádek po
      // DELETE neexistuje, takže se založí znovu (spec §4.6).
      zasobnik.current.push(pred);
      if (zasobnik.current.length > VRATIT_KROKU) zasobnik.current.shift();
      setLzeVratit(true);
      prevezmi(d);
      setUkladani('ulozeno');
      return true;
    } catch (e) {
      udalost({ typ: 'chyba', zprava: apiMessage(e, 'Výchozí rozložení se nepodařilo obnovit.') });
      return false;
    }
  // udalost čte jen ref.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevezmi]);

  const nastavZamceno = useCallback((zamknout: boolean) => {
    zamcenoRef.current = zamknout;
    setZamcenoStav(zamknout);
    naplanuj();
  }, [naplanuj]);

  const nastavPosluchace = useCallback((f: ((u: UdalostRozlozeni) => void) | null) => { posluchac.current = f; }, []);
  const nactiZnovu = useCallback(() => { setNacteni(n => (n === 'ok' ? n : 'nacitam')); nactiRef.current(); }, []);

  return useMemo<Rozlozeni>(() => ({
    stranka,
    rozsahVychoziho,
    nacteni,
    chybaNacteni,
    polozky,
    predbezne,
    ...meta,
    zamceno,
    verze: verzeStav,
    ukladani,
    lzeVratit,
    zmen,
    vratit,
    ulozHned,
    zkusitZnovu,
    nactiZnovu,
    obnovVychozi,
    nastavZamceno,
    nastavPosluchace,
  }), [stranka, rozsahVychoziho, nacteni, chybaNacteni, polozky, predbezne, meta, zamceno, verzeStav, ukladani, lzeVratit,
    zmen, vratit, ulozHned, zkusitZnovu, nactiZnovu, obnovVychozi, nastavZamceno, nastavPosluchace]);
}

export default useRozlozeni;
