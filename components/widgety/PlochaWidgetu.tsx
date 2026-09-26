'use client';

// Plocha s widgety (kolo 68, spec §3.1 a §4) — jedna pro každou stránku.
//
// Shora dolů: PageHeader (jediný h1) → rada při první návštěvě → mřížka
// widgetů. Plocha se skládá jako domovská obrazovka iOS: podržením widgetu
// se otevře menu, podržením prázdného místa nebo „Upravit" režim úprav,
// kde se widgety vlní, jdou přetáhnout, odebrat „−" (s Vrátit) a přidat
// z galerie. Každá změna se hned uloží (useRozlozeni).
//
// Co tu je a proč na jednom místě: stavový automat (klid → menu → úpravy →
// tah → galerie/nastavení, spec §4.1), klávesnice, hlášení pro odečítač
// a FLIP. Kdyby si to každá stránka skládala sama, vzniklo by v kole 69
// jedenáct různých režimů úprav — DP §6.24 to zakazuje. Stránka jen dodá
// hlavičku, případně hlavní nástroj, a zbytek je tady.
//
// Tři vrstvy transformací na každé položce (globals.css): <li> = FLIP a tah
// (JS píše style.transform), .w-mer = promáčknutí a zmenšení v úpravách
// (přechod), .w-kyv = vlnění (animace). Každá vrstva má svůj transform,
// takže se nepřepisují.

import React, { Suspense, lazy, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '../Icons';
import { Button, Card, EmptyState, ErrorState, Hint, PageHeader, Skeleton, Toast, Well, type MenuItem } from '../ui';
import { usePlan } from '../Pro';
import { obnovOpravneni, useOpravneni } from '../role/useOpravneni';
import type { DefiniceStranky, DefiniceWidgetu, IdStranky, PolozkaRozlozeni, Rozsah, Tarif, Velikost } from '@/lib/widgety/typy';
import { widget as najdiWidget } from '@/lib/widgety/katalog';
import { stranka as najdiStranku } from '@/lib/widgety/stranky';
import { filtrujViditelne, inkoustovaInstance, maOpravneniNaWidget, presun, sNastavenimVychozimi, vychoziZKodu } from '@/lib/widgety/rozlozeni';
import { rozvrhni, sloupcuProSirku, type Sloupcu } from '@/lib/widgety/mrizka';
import { delkaKyvu, fazeKyvu, idZWidgetu, uhelKyvu } from '@/lib/widgety/hash';
import { HYSTEREZE_PX, NASTROJ, TOAST_S_AKCI_MS } from '@/lib/widgety/konstanty';
import { PLAN_ENFORCED } from '@/lib/plan';
import { KontextWidgetuCtx, KostraWidgetu, PojistkaWidgetu, SchematickyWidget, type KontextWidgetu } from './Widget';
import { lineWidget, maCoNastavit, predstahni } from './registr';
import { useRozlozeni, type Rozlozeni, type UdalostRozlozeni } from './useRozlozeni';
import { usePodrzeni, vibruj, type Podrzeni } from './usePodrzeni';
import { KontextoveMenu, type OtevreneMenu, type PolozkaMenu, type ZdrojMenu } from './KontextoveMenu';
import { useSmi } from './NavigaceKontext';
import { Pohyb, useTazeni } from './upravy/useTazeni';
import { pustDucha } from './upravy/duch';

// Jádro úprav se stahuje líně (spec §2.5): první obrazovka po přihlášení
// nenese galerii, nastavení ani lištu. Přednačte se po prvním vykreslení
// (requestIdleCallback), nejpozději při podržení.
const nactiListu = () => import('./upravy/ListaUprav');
const nactiGalerii = () => import('./upravy/GalerieWidgetu');
const nactiNastaveni = () => import('./upravy/NastaveniWidgetu');
const nactiUlozeni = () => import('./upravy/UlozitVychozi');
const ListaUprav = lazy(nactiListu);
const GalerieWidgetu = lazy(nactiGalerii);
const NastaveniWidgetu = lazy(nactiNastaveni);
const UlozitVychozi = lazy(nactiUlozeni);

let prednacteno = false;
function prednactiUpravy() {
  if (prednacteno) return;
  prednacteno = true;
  Promise.all([nactiListu(), nactiGalerii(), nactiNastaveni(), nactiUlozeni()]).catch(() => { prednacteno = false; });
}

const VELIKOST_MALE: Record<Velikost, string> = { S: 'malý', M: 'střední', L: 'velký' };
const NAVOD = 'Šipkami přesuneš, Enter otevře nabídku, Delete odebere, Escape ukončí úpravy.';
const VSTUP = 'Úpravy stránky. Widget přesuneš tažením nebo šipkami, Enter otevře nabídku, Delete odebere, Escape úpravy ukončí.';

// ---------------------------------------------------------------------------
// Veřejné API
// ---------------------------------------------------------------------------

/** Props PageHeader, které stránka plošě předá (spec §3.1). */
export interface HlavickaPlochy {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Jediná limetka stránky; v režimu úprav se schová (limetkou je „Hotovo"). */
  primary?: React.ReactNode;
  /** Nejvýš dvě vedlejší akce; při méně než dvou plocha přidá „Upravit". */
  secondary?: React.ReactNode;
  /** Položky „···"; plocha přidá „Upravit stránku". */
  menu?: MenuItem[];
  /** Přepínač pohledu nebo filtr pod hlavičkou; v úpravách `inert`. */
  aside?: React.ReactNode;
  hintId?: string;
  /** Vnořená plocha (Nastavení → Stránky) má nadpis h2. */
  as?: 'h1' | 'h2';
}

/** 'stranka' = běžná stránka, 'vychozi' = editor výchozího (Nastavení → Stránky), 'jen-cteni' = tablet. */
export type RezimPlochy = 'stranka' | 'vychozi' | 'jen-cteni';

export interface PlochaWidgetuProps {
  stranka: IdStranky;
  hlavicka: HlavickaPlochy;
  /** Hlavní nástroj stránky (seznam skladu, uzávěrek…); v úpravách sbalený, ale připojený. */
  nastroj?: React.ReactNode;
  rezim?: RezimPlochy;
  /** Jen `rezim="vychozi"`: čí výchozí rozložení (výchozí typ:<rozhraní stránky>). */
  rozsah?: Rozsah;
  /** Rozložení řízené zvenku (editor výchozích drží zámek a „Pro koho" nad plochou). */
  rizeni?: Rozlozeni;
  /** Jen `rezim="vychozi"`: „Hotovo" v liště (zpět na seznam stránek). */
  onHotovo?: () => void;
}

/** Počet prvků (i uvnitř fragmentu) — kolik vedlejších akcí stránka do hlavičky dala. */
function pocetPrvku(n: React.ReactNode): number {
  let c = 0;
  React.Children.forEach(n, ch => {
    if (!React.isValidElement(ch)) return;
    c += ch.type === React.Fragment ? pocetPrvku((ch.props as { children?: React.ReactNode }).children) : 1;
  });
  return c;
}

// ---------------------------------------------------------------------------
// Položka mřížky
// ---------------------------------------------------------------------------

interface Obsluha {
  pointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  klavesa: (e: React.KeyboardEvent<HTMLElement>, instance: string) => void;
  odebrat: (instance: string, pointerType: string) => void;
  znovu: (instance: string) => void;
  nahlasSkryti: (instance: string, skryto: boolean) => void;
}

interface PolozkaProps {
  p: PolozkaRozlozeni;
  index: number;
  pocet: number;
  def: DefiniceWidgetu | undefined;
  nazev: string;
  rozpeti: number | null;
  skryta: boolean;
  upravy: boolean;
  odznakyMizi: boolean;
  pripojit: boolean;
  bezOpravneni: boolean;
  schematicky: boolean;
  inkoust: boolean;
  pokus: number;
  nova: boolean;
  navodId: string;
  stranka: DefiniceStranky;
  nastroj: React.ReactNode;
  h: Obsluha;
}

/** Rozpětí v mřížce; než se změří šířka plochy, S jeden sloupec a M/L celá řada (první snímek nesmí přetéct). */
function stylBunky(rozpeti: number | null, velikost: Velikost): CSSProperties | undefined {
  if (rozpeti === 0) return undefined;
  if (rozpeti == null) return { gridColumn: velikost === 'S' ? 'span 1 / span 1' : '1 / -1' };
  return { gridColumn: `span ${rozpeti} / span ${rozpeti}` };
}

/** Kulaté „−" vlevo nahoře: odebere hned, bez potvrzení (vrátit jde toastem i Ctrl+Z). */
function Odznak({ nazev, mizi, onOdebrat }: { nazev: string; mizi: boolean; onOdebrat: (pointerType: string) => void }) {
  const typ = useRef('mouse');
  return (
    <button type="button" tabIndex={-1} data-odznak="" aria-label={`Odebrat widget ${nazev}`}
      // Stisk „−" nesmí začít tah karty ani podržení.
      onPointerDown={e => { typ.current = e.pointerType; e.stopPropagation(); }}
      onClick={() => onOdebrat(typ.current)}
      className={`absolute -left-2 -top-2 z-10 h-6 w-6 rounded-full bg-white border border-[var(--surface-line)] text-[#16181A] shadow-[shadow:var(--shadow-float)] grid place-items-center tap-target ${mizi ? 'pointer-events-none' : 'pop-in'}`}>
      <Icon name="minus" size={14} strokeWidth={2} />
    </button>
  );
}

const PolozkaPlochy = memo(function PolozkaPlochy(props: PolozkaProps) {
  const { p, index, pocet, def, nazev, rozpeti, skryta, upravy, odznakyMizi, pripojit, bezOpravneni, schematicky, inkoust, pokus, nova, navodId, stranka, nastroj, h } = props;
  const jeNastroj = p.widget === NASTROJ;
  const nahlasSkryti = useCallback((ano: boolean) => h.nahlasSkryti(p.id, ano), [h, p.id]);
  const kontext = useMemo<KontextWidgetu>(() => ({
    instance: p.id, velikost: p.velikost, definice: def, nahled: false, upravy, inkoust, nahlasSkryti,
  }), [p.id, p.velikost, def, upravy, inkoust, nahlasSkryti]);
  const Komponenta = useMemo(() => (def && !jeNastroj ? lineWidget(p.widget, pokus) : null), [def, jeNastroj, p.widget, pokus]);
  const nastaveni = useMemo(() => sNastavenimVychozimi(def?.nastaveni, p.nastaveni), [def, p.nastaveni]);
  // Fáze a délka kmitu z hashe id: vypadá náhodně, ale je stálá — sousedé se
  // nekývou v zákrytu a nesesynchronizují se ani po překreslení (spec §4.4).
  const kyv = useMemo(() => ({ '--kyv-t': `${delkaKyvu(p.id)}ms`, '--kyv-f': `-${fazeKyvu(p.id)}ms` }) as CSSProperties, [p.id]);
  const ikona = jeNastroj ? stranka.nastroj?.ikona : def?.ikona;
  const povinna = jeNastroj || !!def?.povinny;

  if (!def && !jeNastroj) {
    // Neznámý widget (starý záznam v posledním známém rozložení): drží jen
    // pořadí, aby indexy v DOM seděly s modelem, a nic nekreslí.
    return <li hidden data-instance={p.id} data-widget={p.widget} />;
  }

  const liProps = {
    'data-widget': p.widget,
    'data-instance': p.id,
    'data-velikost': jeNastroj ? 'L' : p.velikost,
    'data-ikona': ikona,
    hidden: skryta || undefined,
    style: stylBunky(skryta ? 0 : rozpeti, jeNastroj ? 'L' : p.velikost),
    tabIndex: upravy ? 0 : undefined,
    'aria-label': upravy ? `${nazev}, ${VELIKOST_MALE[jeNastroj ? 'L' : p.velikost]} widget, pozice ${index + 1} z ${pocet}` : undefined,
    'aria-describedby': upravy ? navodId : undefined,
    onPointerDown: upravy ? h.pointerDown : undefined,
    onKeyDown: upravy ? (e: React.KeyboardEvent<HTMLElement>) => h.klavesa(e, p.id) : undefined,
    // Prstenec fokusu jako u tlačítek, jen obrysem s mezerou: mezera ukáže
    // papír v obou režimech (--bg se v tmavém režimu nepřemapovává, DP §2.8).
    className: `rounded-3xl outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C8F542] ${upravy ? 'select-none' : ''} ${nova ? 'rise-in' : ''}`,
  };

  if (jeNastroj) {
    return (
      <li {...liProps}>
        {upravy && (
          <div className="w-mer">
            <div className="w-kyv" style={kyv}>
              {/* Zástupce nástroje: v úpravách je hlavní část sbalená, ale jde přesunout nad widgety i pod ně. */}
              <Card className="h-full min-h-[8.5rem] flex flex-col">
                <h2 className="t-card flex items-center gap-2 min-w-0">
                  <Icon name={stranka.nastroj?.ikona ?? 'overview'} size={17} className="shrink-0 text-black/40" />
                  <span className="truncate">{nazev}</span>
                </h2>
                <p className="t-meta mt-3">Hlavní část stránky — v úpravách je sbalená.</p>
              </Card>
            </div>
          </div>
        )}
        {/* Skutečný nástroj zůstává připojený i v úpravách — rozepsaný formulář,
            filtr ani pozice v seznamu se vstupem do úprav neztratí. */}
        <div hidden={upravy}>{nastroj}</div>
      </li>
    );
  }

  return (
    <li {...liProps}>
      <div className="w-mer">
        <div className="w-kyv" style={kyv}>
          {(upravy || odznakyMizi) && !povinna && (
            <Odznak nazev={nazev} mizi={!upravy} onOdebrat={typ => h.odebrat(p.id, typ)} />
          )}
          {bezOpravneni ? (
            // Bez oprávnění po změně role: jen jamka s názvem, bez jediného čísla (DP §5.3).
            <Well pad="md" className="h-full min-h-[8.5rem] flex flex-col" inert>
              <h2 className="t-card flex items-center gap-2 min-w-0">
                <Icon name={def?.ikona ?? 'overview'} size={17} className="shrink-0 text-black/40" />
                <span className="truncate">{nazev}</span>
              </h2>
              <p className="t-meta mt-3">Tvoje role tohle nezahrnuje.</p>
            </Well>
          ) : (
            <KontextWidgetuCtx.Provider value={kontext}>
              {schematicky ? <SchematickyWidget /> : !pripojit || !Komponenta ? <KostraWidgetu /> : (
                <PojistkaWidgetu resetKey={`${p.id}-${p.velikost}-${pokus}`} onZnovu={() => h.znovu(p.id)}>
                  <Suspense fallback={<KostraWidgetu />}>
                    <Komponenta instance={p.id} velikost={p.velikost} nastaveni={nastaveni} nahled={false} />
                  </Suspense>
                </PojistkaWidgetu>
              )}
            </KontextWidgetuCtx.Provider>
          )}
        </div>
      </div>
    </li>
  );
});

// ---------------------------------------------------------------------------
// Plocha
// ---------------------------------------------------------------------------

interface ToastStav { id: number; zprava: string; ton: 'ok' | 'bad'; akce?: { label: string; onClick: () => void } }
type ZpusobVstupu = 'tlacitko' | 'klavesnice' | 'podrzeni';

export function PlochaWidgetu({ stranka: idStranky, hlavicka, nastroj, rezim = 'stranka', rozsah, rizeni, onHotovo }: PlochaWidgetuProps) {
  const stranka = najdiStranku(idStranky);
  const vychoziRezim = rezim === 'vychozi';
  const vlastni = useRozlozeni(idStranky, {
    rozsah: vychoziRezim ? (rozsah ?? (stranka ? `typ:${stranka.rozhrani}` as Rozsah : null)) : null,
    vypnuto: !!rizeni || !stranka,
  });
  const r = rizeni ?? vlastni;
  const { nacteno, chyba: chybaOpravneni, opravneni, role } = useOpravneni();
  const smi = useSmi();
  const { plan, loaded: planNacten } = usePlan();
  // Tarif jen pro nabídku polí a záložní rozložení; widgety filtruje server.
  const tarif: Tarif = !PLAN_ENFORCED || !planNacten || !plan ? 'max' : plan.effective === 'max' ? 'max' : plan.effective === 'pro' ? 'pro' : 'zdarma';

  const koren = useRef<HTMLDivElement>(null);
  const hlavickaRef = useRef<HTMLDivElement>(null);
  const mrizka = useRef<HTMLUListElement>(null);
  const upravitRef = useRef<HTMLButtonElement>(null);
  const navodId = `plocha-navod-${idStranky.replace(/[^a-z0-9]/gi, '-')}`;

  // Omezený pohyb se čte živě — přepnutí v systému za běhu vypne pružiny hned (spec §4.11).
  const omezenyRef = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const zmena = () => { omezenyRef.current = mq.matches; };
    zmena();
    mq.addEventListener?.('change', zmena);
    return () => mq.removeEventListener?.('change', zmena);
  }, []);
  const [pohyb] = useState(() => new Pohyb(() => omezenyRef.current));
  useEffect(() => () => pohyb.zrusVse(), [pohyb]);

  const [upravy, setUpravy] = useState(vychoziRezim);
  const [upravyNekdy, setUpravyNekdy] = useState(vychoziRezim);
  const [odznakyMizi, setOdznakyMizi] = useState(false);
  const [menu, setMenu] = useState<OtevreneMenu | null>(null);
  const [galerie, setGalerie] = useState<null | { odkud: 'lista' | 'bunka' | 'prazdna' }>(null);
  const [nastaveni, setNastaveni] = useState<string | null>(null);
  const [ulozVychozi, setUlozVychozi] = useState(false);
  const [toast, setToast] = useState<ToastStav | null>(null);
  const [hlaseni, setHlaseni] = useState('');
  const [sloupcu, setSloupcu] = useState<Sloupcu | null>(null);
  const [skryte, setSkryte] = useState<ReadonlySet<string>>(() => new Set());
  const [pokusy, setPokusy] = useState<Record<string, number>>({});
  const [nova, setNova] = useState<string | null>(null);

  // Stav pro obsluhu událostí mimo vykreslení (klávesy na window, tah).
  const upravyRef = useRef(upravy);
  upravyRef.current = upravy;
  const menuRef = useRef<OtevreneMenu | null>(menu);
  menuRef.current = menu;
  const oknoOtevreno = !!(galerie || nastaveni || ulozVychozi);
  const oknoRef = useRef(oknoOtevreno);
  oknoRef.current = oknoOtevreno;
  const toastId = useRef(0);
  const flipPred = useRef<{ pred: Map<string, DOMRect>; cas: number } | null>(null);
  const fokusPo = useRef<string | null>(null);
  const posunoutK = useRef<string | null>(null);
  const zvednoutPo = useRef<null | { instance: string; pointerId: number; pointerType: string; x: number; y: number; offX: number; offY: number }>(null);
  const cekaNaUlozeni = useRef(false);
  const mimo = useRef<{ x: number; y: number } | null>(null);
  const posledniDotyk = useRef(0);

  // ---- Co se kreslí ----

  // GET selhal: výchozí z kódu, profiltrované podle oprávnění diváka, a úpravy vypnuté (spec §3.1).
  const zaloha = !vychoziRezim && r.nacteni === 'chyba';
  const polozky: PolozkaRozlozeni[] = useMemo(() => {
    if (!zaloha || !stranka) return r.polozky;
    if (!nacteno) return [];
    const d = { typ: stranka.rozhrani, klic: role?.klic ?? null, zdrojRole: null, opravneni, tarif };
    return filtrujViditelne(vychoziZKodu(stranka, d), d);
  }, [zaloha, r.polozky, nacteno, role, opravneni, tarif, stranka]);
  const polozkyRef = useRef(polozky);
  polozkyRef.current = polozky;

  const smiUpravit = !!stranka && rezim !== 'jen-cteni' && r.nacteni === 'ok' && (vychoziRezim || r.smiUpravit);
  // Datové widgety se připojí až po GET a po načtení oprávnění — `ma()` před
  // načtením vrací ANO a dotaz na tržby by odešel dřív, než víme, jestli smí
  // (spec §1.5). Když /api/teams/mine selže, rozhoduje seznam ze serveru.
  const pripravena = vychoziRezim ? false : (r.nacteni === 'ok' && !r.predbezne && (nacteno || chybaOpravneni)) || (zaloha && nacteno);

  const bezOpravneni = useCallback((p: PolozkaRozlozeni) => {
    if (vychoziRezim || p.widget === NASTROJ || !nacteno) return false;
    const def = najdiWidget(p.widget);
    return !!def && !maOpravneniNaWidget(def, opravneni);
  }, [vychoziRezim, nacteno, opravneni]);

  const skrytaVKlidu = (p: PolozkaRozlozeni) => !upravy && (skryte.has(p.id) || bezOpravneni(p));
  const rozpeti = sloupcu ? rozvrhni(polozky.map(p => (skrytaVKlidu(p) || (!najdiWidget(p.widget) && p.widget !== NASTROJ) ? null : p.widget === NASTROJ ? 'L' : p.velikost)), sloupcu, !upravy) : null;
  const inkoust = vychoziRezim || !stranka ? null : inkoustovaInstance(stranka, polozky.filter(p => !skrytaVKlidu(p)));
  const viditelnych = polozky.filter(p => !skrytaVKlidu(p) && (p.widget === NASTROJ || !!najdiWidget(p.widget))).length;

  const nazevPolozky = useCallback((p: PolozkaRozlozeni | undefined) =>
    !p ? '' : p.widget === NASTROJ ? stranka?.nastroj?.nazev ?? 'Hlavní část stránky' : najdiWidget(p.widget)?.nazev ?? p.widget, [stranka]);
  const nazevId = (id: string) => nazevPolozky(polozkyRef.current.find(p => p.id === id));

  // ---- Drobnosti ----

  const oznam = useCallback((text: string) => {
    // Stejná věta dvakrát po sobě (dvě odebrání) se musí přečíst znovu — odečítač hlásí jen změnu.
    setHlaseni(prev => (prev === text ? `${text} ` : text));
  }, []);
  const ukazToast = useCallback((zprava: string, v: { ton?: 'ok' | 'bad'; akce?: ToastStav['akce'] } = {}) => {
    setToast({ id: ++toastId.current, zprava, ton: v.ton ?? 'ok', akce: v.akce });
  }, []);
  const liPrvky = useCallback(() => Array.from(mrizka.current?.querySelectorAll<HTMLElement>(':scope > li[data-instance], :scope > li[data-bunka-plus]') ?? []), []);
  const najdiLi = useCallback((id: string) => mrizka.current?.querySelector<HTMLElement>(`:scope > li[data-instance="${CSS.escape(id)}"]`) ?? null, []);
  /** FLIP: změřit teď, dojet po překreslení (useLayoutEffect níž). */
  const pripravFlip = useCallback(() => { flipPred.current = { pred: pohyb.zmer(liPrvky()), cas: performance.now() }; }, [pohyb, liPrvky]);

  // ---- Tah ----

  const vraceneOd = useRef<Set<string> | null>(null);
  const tazeni = useTazeni({
    aktivni: upravy && smiUpravit,
    mrizka,
    koren,
    pohyb,
    omezeny: () => omezenyRef.current,
    onZvednuti: (instance, index, pocet) => {
      setMenu(null);
      oznam(`${nazevId(instance)} zvednut. Pozice ${index + 1} z ${pocet}.`);
    },
    onPusteni: (instance, z, na, pocet, poradi) => {
      if (na !== z) {
        const mapa = new Map(polozkyRef.current.map(p => [p.id, p]));
        const nove = poradi.map(id => mapa.get(id)).filter((p): p is PolozkaRozlozeni => !!p);
        // Co v DOM nebylo (nemělo by se stát), zůstane na konci — nic se neztratí.
        for (const p of polozkyRef.current) if (!poradi.includes(p.id)) nove.push(p);
        r.zmen(nove);
      }
      oznam(`${nazevId(instance)} položen na pozici ${na + 1} z ${pocet}.`);
    },
    onZruseni: instance => oznam(`${nazevId(instance)} zůstal na svém místě.`),
    onKlepnuti: instance => otevriNastaveni(instance),
  });
  const { zrus: zrusTah, onPointerDown: tahPointerDown, dokonciPoradi, zvedniZvenku, tahne } = tazeni;

  // ---- Vstup a odchod z úprav (spec §4.4) ----

  const vstupDoUprav = useCallback((zpusob: ZpusobVstupu, fokusNa?: string) => {
    if (!smiUpravit || upravyRef.current) return;
    prednactiUpravy();
    pripravFlip();
    menuRef.current = null;
    setMenu(null);
    setUpravy(true);
    setUpravyNekdy(true);
    oznam(VSTUP);
    // Z klávesnice a tlačítkem jde fokus na widget; při podržení zůstane, kde byl.
    if (zpusob !== 'podrzeni') fokusPo.current = fokusNa ?? 'prvni';
  }, [smiUpravit, pripravFlip, oznam]);

  const vratFokusZUprav = useCallback(() => {
    const viditelne = (el: HTMLElement | null | undefined) => !!el && el.offsetParent !== null;
    if (viditelne(upravitRef.current)) { upravitRef.current!.focus(); return; }
    // Na telefonu jsou vedlejší akce hlavičky schované — „Upravit stránku" je v „···".
    const tri = hlavickaRef.current?.querySelector<HTMLElement>('button[aria-haspopup="menu"]');
    if (viditelne(tri)) { tri!.focus(); return; }
    const h1 = hlavickaRef.current?.querySelector<HTMLElement>('h1, h2');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus(); }
  }, []);

  const ukonciUpravy = useCallback((tiche = false) => {
    if (!upravyRef.current || vychoziRezim) return;
    zrusTah();
    menuRef.current = null;
    setMenu(null);
    // Odznaky zmizí průhledností za 120 ms; vlnění skončí hned — výchylka
    // o nejvýš 1,2° se při zastavení nepozná, takže se nedohrává.
    koren.current?.querySelectorAll<HTMLElement>('[data-odznak]').forEach(el => {
      try { el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease-out', fill: 'forwards' }); } catch { /* bez WAAPI zmizí hned */ }
    });
    setOdznakyMizi(true);
    pripravFlip();
    setUpravy(false);
    if (!tiche) fokusPo.current = 'upravit';
    if (r.ukladani === 'ulozeno') { if (!tiche) oznam('Úpravy uloženy.'); return; }
    if (!tiche) { oznam('Úpravy ukončeny, ukládám…'); cekaNaUlozeni.current = true; }
    void r.ulozHned();
  }, [vychoziRezim, zrusTah, pripravFlip, r, oznam]);

  useEffect(() => {
    if (!odznakyMizi) return;
    const t = setTimeout(() => setOdznakyMizi(false), 130);
    return () => clearTimeout(t);
  }, [odznakyMizi]);

  // Kdo o úpravy přijde (zámek za běhu, tablet), z nich odejde.
  useEffect(() => { if (upravy && !smiUpravit && !vychoziRezim) ukonciUpravy(true); }, [upravy, smiUpravit, vychoziRezim, ukonciUpravy]);

  // ---- Operace ----

  const vratit = useCallback(() => {
    const pred = new Set(polozkyRef.current.map(p => p.id));
    pripravFlip();
    if (!r.vratit()) return;
    vraceneOd.current = pred;
    ukazToast('Vráceno');
    oznam('Vráceno.');
  }, [r, pripravFlip, ukazToast, oznam]);
  const vratitRef = useRef(vratit);
  vratitRef.current = vratit;

  const odeber = useCallback((instance: string, pointerType = '') => {
    const pol = polozkyRef.current;
    const i = pol.findIndex(p => p.id === instance);
    if (i < 0) return;
    const p = pol[i];
    if (p.widget === NASTROJ || najdiWidget(p.widget)?.povinny) { oznam('Tenhle widget odebrat nejde.'); return; }
    const li = najdiLi(instance);
    if (li) pustDucha(li, omezenyRef.current);
    const dalsi = pol[i + 1]?.id ?? pol[i - 1]?.id ?? null;
    pripravFlip();
    menuRef.current = null;
    setMenu(null);
    r.zmen(pol.filter(x => x.id !== instance));
    vibruj(pointerType);
    ukazToast('Widget odebrán', { akce: { label: 'Vrátit', onClick: () => vratitRef.current() } });
    oznam(`${nazevPolozky(p)} odebrán. Vrátit: Ctrl+Z.`);
    if (upravyRef.current) fokusPo.current = dalsi ?? 'plus';
  }, [najdiLi, pripravFlip, r, ukazToast, oznam, nazevPolozky]);

  /** Přesun z klávesnice nebo z menu — bez animace (emil: akce z klávesnice se neanimují). */
  const posun = useCallback((instance: string, kam: -1 | 1 | 'zacatek' | 'konec') => {
    const pol = polozkyRef.current;
    const i = pol.findIndex(p => p.id === instance);
    if (i < 0) return;
    const cil = kam === 'zacatek' ? 0 : kam === 'konec' ? pol.length - 1 : Math.min(pol.length - 1, Math.max(0, i + kam));
    if (cil === i) return;
    pohyb.zrusVse();
    r.zmen(presun(pol, i, cil));
    oznam(`${nazevPolozky(pol[i])}, pozice ${cil + 1} z ${pol.length}.`);
    fokusPo.current = instance;
  }, [pohyb, r, oznam, nazevPolozky]);

  const pridej = useCallback((widgetId: string, velikost: Velikost, odkud: 'lista' | 'bunka' | 'prazdna') => {
    const def = najdiWidget(widgetId);
    if (!def) return;
    const pol = polozkyRef.current;
    const ids = new Set(pol.map(p => p.id));
    let n = 1;
    let id = idZWidgetu(widgetId, n);
    while (ids.has(id)) id = idZWidgetu(widgetId, ++n);
    const polozka: PolozkaRozlozeni = { id, widget: widgetId, velikost: def.velikosti.includes(velikost) ? velikost : def.vychoziVelikost };
    // Z lišty na konec — ale před nástroj, když je poslední (hlavní seznam má zůstat dole).
    const kam = odkud === 'lista' && pol.length && pol[pol.length - 1].widget === NASTROJ ? pol.length - 1 : pol.length;
    pripravFlip();
    r.zmen([...pol.slice(0, kam), polozka, ...pol.slice(kam)]);
    setGalerie(null);
    setNova(id);
    predstahni([widgetId]);
    posunoutK.current = id;
    fokusPo.current = id;
    oznam(`${def.nazev} přidán na pozici ${kam + 1} z ${pol.length + 1}.`);
  }, [pripravFlip, r, oznam]);

  const otevriNastaveni = useCallback((instance: string) => {
    const p = polozkyRef.current.find(x => x.id === instance);
    if (!p || p.widget === NASTROJ || bezOpravneni(p)) return;
    if (!maCoNastavit(najdiWidget(p.widget), smi, tarif)) return;
    prednactiUpravy();
    menuRef.current = null;
    setMenu(null);
    setNastaveni(instance);
  }, [bezOpravneni, smi, tarif]);

  const ulozNastaveni = useCallback((instance: string, velikost: Velikost, hodnoty: Record<string, unknown>) => {
    const pol = polozkyRef.current;
    const p = pol.find(x => x.id === instance);
    setNastaveni(null);
    if (!p) return;
    pripravFlip();
    r.zmen(pol.map(x => {
      if (x.id !== instance) return x;
      const { nastaveni: _stare, ...zbytek } = x;
      return Object.keys(hodnoty).length ? { ...zbytek, velikost, nastaveni: hodnoty } : { ...zbytek, velikost };
    }));
    oznam(`${nazevPolozky(p)}: ${VELIKOST_MALE[velikost]}.`);
    fokusPo.current = instance;
  }, [pripravFlip, r, oznam, nazevPolozky]);

  const obnovVychozi = useCallback(async () => {
    pripravFlip();
    const ok = await r.obnovVychozi();
    if (ok) ukazToast('Obnoveno výchozí rozložení', { akce: { label: 'Vrátit', onClick: () => vratitRef.current() } });
  }, [pripravFlip, r, ukazToast]);

  const otevriMenu = useCallback((m: OtevreneMenu) => {
    // Druhé otevření (Android pošle contextmenu k dlouhému stisku) se ignoruje.
    if (menuRef.current) return;
    menuRef.current = m;
    setMenu(m);
  }, []);

  const zdrojMenu = (pointerType: string): ZdrojMenu => (pointerType === 'mouse' ? 'mys' : 'dotyk');

  // ---- Podržení (klid) ----

  const podrzeni = usePodrzeni({
    aktivni: !upravy && smiUpravit,
    jePrazdne: cil => cil === koren.current || cil === mrizka.current,
    onZacatek: prednactiUpravy,
    onSplneno: (p: Podrzeni) => {
      if (p.cil === 'prazdne') { vstupDoUprav('podrzeni'); return; }
      if (!p.li || !p.instance) return;
      otevriMenu({ instance: p.instance, x: p.x, y: p.y, zdroj: zdrojMenu(p.pointerType), zUprav: false, kotva: p.li, fokusZpet: null });
    },
    onPohybPoSplneni: (p, e) => {
      // Prst po otevření menu pokračuje: menu zmizí, plocha vstoupí do úprav
      // a tentýž widget se zvedne pod prstem (spec §4.3). Na dotyku jen když
      // si gesto nepřevzal prohlížeč (pointercancel) — pak aspoň úpravy.
      if (!p.li || !p.instance) return;
      const r0 = p.li.getBoundingClientRect();
      menuRef.current = null;
      setMenu(null);
      zvednoutPo.current = { instance: p.instance, pointerId: p.pointerId, pointerType: p.pointerType, x: e.clientX, y: e.clientY, offX: p.x - r0.left, offY: p.y - r0.top };
      vstupDoUprav('podrzeni');
    },
    onPraveTlacitko: p => {
      if (!p.li || !p.instance) return;
      otevriMenu({ instance: p.instance, x: p.x, y: p.y, zdroj: 'mys', zUprav: false, kotva: p.li, fokusZpet: null });
    },
  });

  // ---- Klávesnice ----

  const klavesaPolozky = useCallback((e: React.KeyboardEvent<HTMLElement>, instance: string) => {
    if (e.target !== e.currentTarget) return;
    const li = e.currentTarget;
    switch (e.key) {
      case 'ArrowLeft': case 'ArrowUp': e.preventDefault(); posun(instance, -1); break;
      case 'ArrowRight': case 'ArrowDown': e.preventDefault(); posun(instance, 1); break;
      case 'Home': e.preventDefault(); posun(instance, 'zacatek'); break;
      case 'End': e.preventDefault(); posun(instance, 'konec'); break;
      case 'Delete': case 'Backspace': e.preventDefault(); odeber(instance, 'klavesnice'); break;
      case 'Enter': case ' ': case 'ContextMenu': {
        e.preventDefault();
        const rr = li.getBoundingClientRect();
        otevriMenu({ instance, x: rr.right, y: rr.top, zdroj: 'klavesnice', zUprav: true, kotva: li, fokusZpet: li });
        break;
      }
      case 'F10':
        if (e.shiftKey) {
          e.preventDefault();
          const rr = li.getBoundingClientRect();
          otevriMenu({ instance, x: rr.right, y: rr.top, zdroj: 'klavesnice', zUprav: true, kotva: li, fokusZpet: li });
        }
        break;
    }
  }, [posun, odeber, otevriMenu]);

  // Escape a Ctrl/Cmd+Z v úpravách. Otevřené menu nebo okno má Escape pro sebe
  // (usePopover i useModal ho zastaví dřív, než sem dojde).
  useEffect(() => {
    if (!upravy) return;
    const h = (e: KeyboardEvent) => {
      if (e.defaultPrevented || menuRef.current || oknoRef.current) return;
      if (e.key === 'Escape') {
        if (vychoziRezim) return;
        e.preventDefault();
        ukonciUpravy();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
        if ((e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
        e.preventDefault();
        vratitRef.current();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [upravy, vychoziRezim, ukonciUpravy]);

  // ---- Obsluha kořene plochy ----

  const onPointerDownKorene = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') posledniDotyk.current = Date.now();
    if (!upravy) { podrzeni.onPointerDown(e); return; }
    const cil = e.target as Element;
    // „Klepnutí mimo" ukončí úpravy: mezera mřížky, pruh pod ní nebo hlavička —
    // ne widget, buňka „+", lišta, okno, menu ani toast (spec §4.4).
    const vHlavicce = !!hlavickaRef.current?.contains(cil) && !cil.closest('button, a, [data-plocha-chrom]');
    mimo.current = cil === koren.current || cil === mrizka.current || vHlavicce ? { x: e.clientX, y: e.clientY } : null;
  };
  const onClickKorene = (e: React.MouseEvent<HTMLDivElement>) => {
    const m = mimo.current;
    mimo.current = null;
    if (!m || !upravy || vychoziRezim) return;
    if (Math.hypot(e.clientX - m.x, e.clientY - m.y) > HYSTEREZE_PX) return;
    ukonciUpravy();
  };
  const onContextMenuKorene = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!upravy) { podrzeni.onContextMenu(e); return; }
    const cil = e.target as Element;
    if (cil.closest('[data-plocha-chrom], input, textarea, select')) return;
    e.preventDefault();
    // Dlouhý stisk prstem je v úpravách tah, ne menu (Android k němu posílá contextmenu).
    if (tahne() || Date.now() - posledniDotyk.current < 1500) return;
    const li = cil.closest<HTMLElement>('li[data-instance]');
    if (li?.dataset.instance) otevriMenu({ instance: li.dataset.instance, x: e.clientX, y: e.clientY, zdroj: 'mys', zUprav: true, kotva: li, fokusZpet: li });
  };
  const onKeyDownKorene = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // V klidu: Shift+F10 nebo klávesa Menu s fokusem uvnitř widgetu otevře jeho menu.
    if (upravy || !smiUpravit) return;
    if (!(e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) return;
    const li = (e.target as Element).closest<HTMLElement>('li[data-widget]');
    if (!li || li.dataset.widget === NASTROJ || !li.dataset.instance) return;
    e.preventDefault();
    const rr = li.getBoundingClientRect();
    otevriMenu({ instance: li.dataset.instance, x: rr.right, y: rr.top, zdroj: 'klavesnice', zUprav: false, kotva: li, fokusZpet: e.target as HTMLElement });
  };

  // ---- Efekty po vykreslení ----

  // FLIP po změně modelu, režimu nebo počtu sloupců: změřeno před změnou,
  // dojede se teď, ve stejném snímku, kdy React přerovnal DOM. Tamtéž se
  // po tahu smaže CSS `order` — přerovnání a smazání se nesmí rozejít o snímek.
  useLayoutEffect(() => {
    dokonciPoradi();
    const f = flipPred.current;
    if (!f) return;
    flipPred.current = null;
    // Stará měření (obnovení výchozího přes pomalou síť) by rozhodila polohy.
    if (performance.now() - f.cas > 10_000) return;
    pohyb.flip(liPrvky(), f.pred);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polozky, upravy, sloupcu]);

  // Pokračování tahem z menu: zvednout, až je plocha v úpravách (po FLIPu výš).
  useLayoutEffect(() => {
    const z = zvednoutPo.current;
    if (!z || !upravy) return;
    zvednoutPo.current = null;
    const li = najdiLi(z.instance);
    if (li) zvedniZvenku({ li, pointerId: z.pointerId, pointerType: z.pointerType, x: z.x, y: z.y, offX: z.offX, offY: z.offY });
  }, [upravy, najdiLi, zvedniZvenku]);

  // Fokus a posun k položce po překreslení (klávesnice, přidání, odebrání, odchod z úprav).
  useLayoutEffect(() => {
    const vracene = vraceneOd.current;
    if (vracene) {
      vraceneOd.current = null;
      const zpet = polozky.find(p => !vracene.has(p.id));
      if (zpet && upravyRef.current) fokusPo.current = zpet.id;
    }
    const k = posunoutK.current;
    if (k) {
      posunoutK.current = null;
      najdiLi(k)?.scrollIntoView({ block: 'nearest', behavior: omezenyRef.current ? 'auto' : 'smooth' });
    }
    const f = fokusPo.current;
    if (!f) return;
    fokusPo.current = null;
    if (f === 'upravit') { vratFokusZUprav(); return; }
    if (f === 'plus') { mrizka.current?.querySelector<HTMLElement>('[data-bunka-plus] button')?.focus(); return; }
    if (f === 'prvni') { mrizka.current?.querySelector<HTMLElement>(':scope > li[data-instance]:not([hidden])')?.focus(); return; }
    const li = najdiLi(f);
    if (li && document.activeElement !== li) li.focus({ preventScroll: !!k });
  });

  // Počet sloupců podle šířky PLOCHY, ne okna (boční pás, TO GO, náhled v Nastavení).
  useLayoutEffect(() => {
    const ul = mrizka.current;
    if (!ul) return;
    const zmer = () => {
      const s = sloupcuProSirku(ul.clientWidth);
      setSloupcu(prev => (prev === s ? prev : s));
    };
    zmer();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(zmer);
    ro.observe(ul);
    return () => ro.disconnect();
  }, []);

  // Úhel vlnění na každý prvek zvlášť podle jeho velikosti (spec O4): roh se
  // má vychýlit o 2,3 px, velká karta tedy méně stupňů než malá.
  useLayoutEffect(() => {
    if (!upravy) return;
    const ul = mrizka.current;
    if (!ul) return;
    const nastav = (li: Element) => {
      const kyv = li.querySelector<HTMLElement>(':scope > .w-mer > .w-kyv');
      if (kyv) kyv.style.setProperty('--kyv', `${uhelKyvu((li as HTMLElement).offsetWidth, (li as HTMLElement).offsetHeight).toFixed(3)}deg`);
    };
    const prvky = ul.querySelectorAll(':scope > li[data-instance]');
    prvky.forEach(nastav);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(z => z.forEach(x => nastav(x.target)));
    prvky.forEach(li => ro.observe(li));
    return () => ro.disconnect();
  }, [upravy, polozky]);

  useEffect(() => {
    if (!nova) return;
    // rise-in drží `transform` na <li> — po dojetí musí pryč, jinak by přebíjel FLIP i tah.
    const t = setTimeout(() => setNova(null), 400);
    return () => clearTimeout(t);
  }, [nova]);

  // Oblasti widgetů stáhnout souběžně s jejich daty, hned po načtení rozložení.
  const klicOblasti = polozky.map(p => p.widget).join(',');
  useEffect(() => {
    if (r.nacteni === 'ok' && !vychoziRezim) predstahni(polozkyRef.current.map(p => p.widget));
  }, [r.nacteni, klicOblasti, vychoziRezim]);

  // Jádro úprav přednačíst, až bude prohlížeč volný.
  useEffect(() => {
    if (!smiUpravit) return;
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(prednactiUpravy, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(prednactiUpravy, 2000);
    return () => clearTimeout(t);
  }, [smiUpravit]);

  // Události zápisu → toasty a hlášení (spec §4.7).
  const naUdalost = (u: UdalostRozlozeni) => {
    if (u.typ === 'konflikt') ukazToast('Rozložení se mezitím změnilo v jiném okně — ukazuji novější.');
    else if (u.typ === 'zamceno') { ukonciUpravy(true); ukazToast('Tuhle stránku ti teď nastavuje vedení.', { ton: 'bad' }); }
    else if (u.typ === 'neulozeno') ukazToast('Rozložení se neuložilo — zkusím to znovu.', { ton: 'bad' });
    else if (u.typ === 'chyba') ukazToast(u.zprava, { ton: 'bad' });
    else if (u.typ === 'ulozeno' && cekaNaUlozeni.current) { cekaNaUlozeni.current = false; oznam('Úpravy uloženy.'); }
  };
  const naUdalostRef = useRef(naUdalost);
  naUdalostRef.current = naUdalost;
  const { nastavPosluchace } = r;
  useEffect(() => {
    nastavPosluchace(u => naUdalostRef.current(u));
    return () => nastavPosluchace(null);
  }, [nastavPosluchace]);

  // ---- Obsluha položek (stabilní, ať memo položek drží) ----

  const obsluhaRef = useRef({ klavesaPolozky, odeber });
  obsluhaRef.current = { klavesaPolozky, odeber };
  const nahlasSkryti = useCallback((id: string, ano: boolean) => {
    setSkryte(prev => {
      if (prev.has(id) === ano) return prev;
      const n = new Set(prev);
      if (ano) n.add(id); else n.delete(id);
      return n;
    });
  }, []);
  const obsluha = useMemo<Obsluha>(() => ({
    pointerDown: tahPointerDown,
    klavesa: (e, id) => obsluhaRef.current.klavesaPolozky(e, id),
    odebrat: (id, typ) => obsluhaRef.current.odeber(id, typ),
    znovu: id => setPokusy(p => ({ ...p, [id]: (p[id] ?? 0) + 1 })),
    nahlasSkryti,
  }), [tahPointerDown, nahlasSkryti]);

  // ---- Menu ----

  const polozkyMenu = (m: OtevreneMenu): PolozkaMenu[] => {
    const pol = polozky;
    const i = pol.findIndex(p => p.id === m.instance);
    const p = pol[i];
    if (!p) return [];
    const def = najdiWidget(p.widget);
    const jeNastroj = p.widget === NASTROJ;
    // Haptika patří jen „−" (spec §4.8) — odebrání z menu je tiché. Po odebrání
    // z klávesnice v klidu (widget s fokusem zmizel) jde fokus na „Upravit".
    const odebrat: PolozkaMenu[] = jeNastroj || def?.povinny ? [] : [{
      label: 'Odebrat widget', icon: 'minus', danger: true,
      onClick: () => { odeber(p.id); if (!m.zUprav && m.zdroj === 'klavesnice') fokusPo.current = 'upravit'; },
    }];
    const nastavit: PolozkaMenu[] = !jeNastroj && !bezOpravneni(p) && maCoNastavit(def, smi, tarif) ? [{ label: 'Nastavit widget', icon: 'settings', onClick: () => otevriNastaveni(p.id) }] : [];
    if (!m.zUprav) {
      return [
        ...nastavit,
        { label: 'Upravit stránku', icon: 'pencil', onClick: () => vstupDoUprav(m.zdroj === 'klavesnice' ? 'klavesnice' : 'podrzeni', m.zdroj === 'klavesnice' ? p.id : undefined) },
        ...odebrat,
      ];
    }
    return [
      ...nastavit,
      // Menu je cesta pro odečítač na dotyku, kde tah nejde (spec §4.10).
      { label: 'Posunout výš', icon: 'chevron', className: '[&>svg]:rotate-180', disabled: i === 0, onClick: () => posun(p.id, -1) },
      { label: 'Posunout níž', icon: 'chevron', disabled: i === pol.length - 1, onClick: () => posun(p.id, 1) },
      ...odebrat,
    ];
  };

  const menuListy: MenuItem[] = vychoziRezim
    ? (r.zdroj === 'podnik' ? [{ label: 'Obnovit výchozí z aplikace', icon: 'refresh', onClick: () => { void obnovVychozi(); } }] : [])
    : [
      ...(r.zdroj === 'osobni' ? [{ label: 'Obnovit výchozí rozložení', icon: 'refresh', onClick: () => { void obnovVychozi(); } }] : []),
      ...(r.smiVychozi ? [{ label: 'Uložit jako výchozí pro…', icon: 'users', onClick: () => { prednactiUpravy(); setUlozVychozi(true); } }] : []),
    ];
  const nazevRozsahu = r.rozsahy.find(x => x.id === r.rozsahVychoziho)?.nazev ?? 'Všichni';

  // Galerie nabízí jen to, co divák smí — a ještě jednou přes oprávnění
  // v klientu, kdyby server byl zastaralý (sonda k68-opravneni 1).
  const nabidka = useMemo(() => {
    if (vychoziRezim) return r.dostupne;
    if (!nacteno && !chybaOpravneni) return [];
    return r.dostupne.filter(id => {
      const def = najdiWidget(id);
      return !!def && def.stav === 'hotovo' && !!stranka && def.rozhrani.includes(stranka.rozhrani) && (!nacteno || maOpravneniNaWidget(def, opravneni));
    });
  }, [vychoziRezim, r.dostupne, nacteno, chybaOpravneni, opravneni, stranka]);
  const tarifem = useMemo(() => (vychoziRezim ? [] : r.tarifem.filter(t => {
    const def = najdiWidget(t.widget);
    return !!def && (!nacteno || maOpravneniNaWidget(def, opravneni));
  })), [vychoziRezim, r.tarifem, nacteno, opravneni]);

  // ---- Vykreslení ----

  if (!stranka) {
    return <div className="p-4 sm:p-6"><ErrorState title="Tahle stránka neexistuje" hint="Zkus ji otevřít znovu z navigace." /></div>;
  }

  const vedlejsiVlastni = pocetPrvku(hlavicka.secondary);
  const upravit = smiUpravit && !vychoziRezim && vedlejsiVlastni < 2 ? (
    <Button ref={upravitRef} variant="secondary" icon="pencil" onClick={() => vstupDoUprav('tlacitko')}>Upravit</Button>
  ) : null;
  const menuHlavicky: MenuItem[] = [
    ...(hlavicka.menu ?? []),
    ...(smiUpravit && !vychoziRezim ? [{ label: 'Upravit stránku', icon: 'pencil', onClick: () => vstupDoUprav('tlacitko') }] : []),
  ];

  const celaChyba = zaloha && chybaOpravneni;
  const nacitam = r.nacteni === 'nacitam' && !r.predbezne && !polozky.length;
  // Obecná kostra, dokud nevíme nic (server, první vykreslení bez posledního
  // známého rozložení): velikosti z výchozího rozložení, bez titulků — nic neprozradí.
  const kostra = nacitam
    ? (stranka.vychozi[`typ:${stranka.rozhrani}`] ?? []).slice(0, 8).map(v => v.s ?? najdiWidget(v.w)?.vychoziVelikost ?? 'M')
    : [];
  const kostraRozpeti = sloupcu && kostra.length ? rozvrhni(kostra, sloupcu, true) : null;
  const nastavovana = nastaveni ? polozky.find(p => p.id === nastaveni) : undefined;
  const nastavovanaDef = nastavovana ? najdiWidget(nastavovana.widget) : undefined;

  return (
    <div
      ref={koren}
      data-plocha={stranka.id}
      data-upravy={upravy ? '' : undefined}
      className={`plocha space-y-6 pb-24 ${vychoziRezim ? '' : 'p-4 sm:p-6'}`}
      onPointerDown={onPointerDownKorene}
      onClick={onClickKorene}
      onContextMenu={onContextMenuKorene}
      onKeyDown={onKeyDownKorene}
    >
      <div ref={hlavickaRef}>
        <PageHeader
          as={hlavicka.as}
          title={hlavicka.title}
          subtitle={upravy && !vychoziRezim ? 'Přetáhni widget na jiné místo. Mínusem ho odebereš.' : hlavicka.subtitle}
          hintId={upravy ? undefined : hlavicka.hintId}
          primary={upravy ? undefined : hlavicka.primary}
          secondary={upravy ? undefined : (hlavicka.secondary || upravit ? <>{hlavicka.secondary}{upravit}</> : undefined)}
          menu={upravy ? undefined : menuHlavicky}
          aside={hlavicka.aside ? <div inert={upravy || undefined}>{hlavicka.aside}</div> : undefined}
        />
      </div>

      {rezim === 'stranka' && smiUpravit && !upravy && (
        <Hint id="plocha-upravy" icon="pencil" title="Plochu si můžeš poskládat"
          action={{ label: 'Upravit stránku', onClick: () => vstupDoUprav('tlacitko') }}>
          Podrž widget nebo klepni na Upravit.
        </Hint>
      )}

      {zaloha && !celaChyba && (
        <p className="note note-wait">
          Tvoje rozložení se nenačetlo — ukazuji výchozí.{' '}
          <button type="button" onClick={r.nactiZnovu} className="tap-target-sm font-semibold underline underline-offset-2 hover:no-underline">Zkusit znovu</button>
        </p>
      )}

      {celaChyba ? (
        <ErrorState title="Plocha se nenačetla" onRetry={() => { r.nactiZnovu(); obnovOpravneni(); }} />
      ) : vychoziRezim && r.nacteni === 'chyba' ? (
        <ErrorState title="Výchozí rozložení se nenačetlo" hint={r.chybaNacteni ?? undefined} onRetry={r.nactiZnovu} />
      ) : (
        <ul ref={mrizka} className="plocha-mrizka" aria-label={`Widgety na stránce ${stranka.nazev}`}
          style={sloupcu ? ({ '--sloupcu': sloupcu } as CSSProperties) : undefined}>
          {nacitam
            ? kostra.map((v, i) => (
              <li key={`kostra-${i}`} aria-hidden style={stylBunky(kostraRozpeti ? kostraRozpeti[i] : null, v)}>
                <Card pad={v === 'S' ? 'sm' : 'md'} className={`h-full ${v === 'S' ? 'sm:p-5 min-h-[8.5rem]' : ''}`}>
                  <Skeleton className="h-4 w-32 rounded-full" />
                  <div className="mt-4 space-y-2">
                    <Skeleton className="h-8" />
                    {v !== 'S' && <Skeleton className="h-8 w-2/3" />}
                  </div>
                </Card>
              </li>
            ))
            : polozky.map((p, i) => (
              <PolozkaPlochy
                key={p.id}
                p={p}
                index={i}
                pocet={polozky.length}
                def={najdiWidget(p.widget)}
                nazev={nazevPolozky(p)}
                rozpeti={rozpeti ? rozpeti[i] : null}
                skryta={skrytaVKlidu(p)}
                upravy={upravy}
                odznakyMizi={odznakyMizi}
                pripojit={pripravena && !bezOpravneni(p)}
                bezOpravneni={upravy && bezOpravneni(p)}
                schematicky={vychoziRezim}
                inkoust={inkoust === p.id}
                pokus={pokusy[p.id] ?? 0}
                nova={nova === p.id}
                navodId={navodId}
                stranka={stranka}
                nastroj={p.widget === NASTROJ ? nastroj : null}
                h={obsluha}
              />
            ))}
          {upravy && (
            <li data-bunka-plus="" className="min-w-0" style={{ order: 9999, gridColumn: 'span 1 / span 1' }}>
              <button type="button" aria-label="Přidat widget na konec" onClick={() => { prednactiUpravy(); setGalerie({ odkud: 'bunka' }); }}
                className="w-full h-full rounded-3xl border border-dashed border-black/15 text-black/45 grid place-items-center min-h-[8.5rem] transition-colors hover:text-[#16181A] hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542]">
                <span className="flex flex-col items-center gap-1.5">
                  <Icon name="plus" size={20} />
                  <span className="t-meta">Přidat widget</span>
                </span>
              </button>
            </li>
          )}
        </ul>
      )}

      {!celaChyba && !nacitam && !upravy && viditelnych === 0 && (r.nacteni === 'ok' || zaloha) && (
        <EmptyState compact icon="grid" title="Plocha je prázdná" hint="Přidej widget — třeba Docházející zásoby."
          action={smiUpravit ? (
            <Button variant="secondary" icon="plus" onClick={() => { vstupDoUprav('tlacitko'); setGalerie({ odkud: 'prazdna' }); }}>Přidat widget</Button>
          ) : undefined} />
      )}

      {!smiUpravit && !vychoziRezim && r.nacteni === 'ok' && (r.zamceno || rezim === 'jen-cteni' || stranka.rozhrani === 'kiosk') && (
        // Bez úprav, ale s vysvětlením: kdo marně drží widget, má vědět proč.
        <p className="t-meta flex items-center gap-1.5">
          <Icon name="lock" size={13} className="shrink-0" />
          {r.zamceno ? 'Rozložení téhle stránky nastavuje vedení.' : 'Tablet si rozložení neupravuje — nastavuje ho vedení v Nastavení → Stránky.'}
        </p>
      )}

      <p id={navodId} className="sr-only">{NAVOD}</p>
      <p className="sr-only" role="status" aria-live="polite" data-plocha-hlaseni="">{hlaseni}</p>

      {menu && (
        <KontextoveMenu menu={menu} polozky={polozkyMenu(menu)} nazev={nazevId(menu.instance)}
          onZavrit={() => { menuRef.current = null; setMenu(null); }} />
      )}

      <Suspense fallback={null}>
        {upravyNekdy && smiUpravit && (
          <ListaUprav
            open={upravy}
            popisek={vychoziRezim ? `Výchozí · ${nazevRozsahu}` : 'Úpravy stránky'}
            onPridat={() => setGalerie({ odkud: 'lista' })}
            onHotovo={() => { if (vychoziRezim) { void r.ulozHned().finally(() => onHotovo?.()); } else ukonciUpravy(); }}
            menu={menuListy}
            neulozeno={r.ukladani === 'chyba'}
            onZkusitZnovu={r.zkusitZnovu}
          />
        )}
        {galerie && (
          <div data-plocha-chrom="">
            <GalerieWidgetu stranka={stranka} nabidka={nabidka} tarifem={tarifem} polozky={polozky} schematicky={vychoziRezim}
              onPridat={(w, v) => pridej(w, v, galerie.odkud)} onZavrit={() => setGalerie(null)} />
          </div>
        )}
        {nastavovana && nastavovanaDef && (
          <div data-plocha-chrom="">
            <NastaveniWidgetu polozka={nastavovana} definice={nastavovanaDef} schematicky={vychoziRezim} smi={smi} tarif={tarif}
              onUlozit={(v, n) => ulozNastaveni(nastavovana.id, v, n)} onZavrit={() => setNastaveni(null)} />
          </div>
        )}
        {ulozVychozi && (
          <div data-plocha-chrom="">
            <UlozitVychozi stranka={stranka} polozky={polozky}
              onUlozeno={() => { setUlozVychozi(false); ukazToast('Výchozí rozložení uloženo'); }}
              onZavrit={() => setUlozVychozi(false)} />
          </div>
        )}
      </Suspense>

      <div data-plocha-chrom="">
        <Toast message={toast?.zprava ?? null} id={toast?.id} tone={toast?.ton} action={toast?.akce}
          ms={toast?.akce ? TOAST_S_AKCI_MS : undefined} onClose={() => setToast(null)} />
      </div>
    </div>
  );
}

export default PlochaWidgetu;

