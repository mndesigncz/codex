'use client';

// Obal widgetu (kolo 68, spec §3.3, DP §5.1).
//
// Každý widget se kreslí v tomhle obalu a jinak ne. Obal drží všechno, co
// si dřív každý blok Přehledu psal po svém a co se proto rozjelo: titulek
// z registru (nemůže ujet od názvu v galerii), jednu podobu hlavičky
// (ikona 17 tlumeně bez podkladu, t-card, doplněk, odkaz dál jako tichý ghost
// s chevronem, Sbalit vždy úplně vpravo),
// všechny čtyři poctivé stavy (kostra, chyba se „Zkusit znovu", prázdno,
// skrytí) a chování v režimu úprav (karta `inert`, jméno nese <li>).
//
// Co obal potřebuje vědět o instanci (id, velikost, definice, jestli je
// náhled nebo režim úprav, jestli smí nést inkoust), mu dává plocha přes
// kontext — autor widgetu to nemusí protahovat props.

import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Button, Card, ErrorState, Menu, MenuPanel, Modal, Skeleton, type MenuItem } from '../ui';
import type { LoadState } from '../ui/useLoad';
import type { DefiniceWidgetu, Kostra, PoleNastaveni, Rozhrani, Smi, Tarif, Velikost } from '@/lib/widgety/typy';
import { kostraWidgetu } from '@/lib/widgety/rozlozeni';
import { useT } from '@/lib/i18n/client';
import { usePopover } from '@/lib/usePopover';
import { useJeTelefon } from '@/lib/useJeTelefon';
import { useNavigace, useSmi } from './NavigaceKontext';
// Registr importuje odsud `Chybi` a tady se z něj berou filtry polí: kruh je neškodný, obě strany
// sahají na import až za běhu (v lineWidget a při vykreslení), ne při načtení modulu.
import { viditelnaPole, viditelneMoznosti } from './registr';

export type { WidgetProps } from '@/lib/widgety/typy';

// ---------------------------------------------------------------------------
// Kontext instance
// ---------------------------------------------------------------------------

export interface KontextWidgetu {
  /** Id položky rozložení (v náhledu uměle složené, ať se neopakují id v DOM). */
  instance: string;
  velikost: Velikost;
  definice: DefiniceWidgetu | undefined;
  /** Galerie a nastavení: bez akcí, navigace a zápisů (obal náhledu je `inert`). */
  nahled: boolean;
  /** Plocha je v režimu úprav: karta `inert`, prázdný widget se ukáže. */
  upravy: boolean;
  /** Widget peněz, který na téhle ploše nese jedinou inkoustovou plochu (DP §2.10). */
  inkoust: boolean;
  /** Prázdný widget s `prazdno={null}` se v klidu nekreslí — plocha pak jeho buňku schová. */
  nahlasSkryti: (skryto: boolean) => void;
  /**
   * Widget ohlásí „vyřízeno" se stručným souhrnem (např. „Dostupnost odevzdaná ·
   * rozvrh naplánovaný"); null = zase je co řešit. Plocha vyřízený widget
   * v klidu minimalizuje — viz `mini`.
   */
  nahlasVyrizeno: (souhrn: string | null) => void;
  /** Plocha rozhodla: místo plné karty se kreslí nízká vyřízená karta s tímhle souhrnem. */
  mini: string | null;
  /** Pohled (`DefiniceStranky.pohled`) stránky, na které karta leží; null mimo plochu. */
  pohledStranky: string | null;
  /**
   * Rozhraní stránky (vedení, zaměstnanec, tablet); null/chybí mimo plochu. Tentýž pohled
   * znamená v každém rozhraní jinou obrazovku — `inventory` je u vedení Sklad, u zaměstnance
   * hlášení chybějícího — a widget podle toho předává jiný argument.
   */
  rozhraniStranky?: Rozhrani | null;
  /** Karta je sbalená na samotnou hlavičku (uživatel ji sbalil; pamatuje se). */
  sbaleno: boolean;
  /** Sbalí / rozbalí kartu. */
  prepniSbaleni: () => void;
  /** „Ukázat i tak" — rozbalí vyřízený widget do konce sezení. */
  rozbal: () => void;
  /** Otevře widget zvětšený v okně (jen střední karty, které mají velkou podobu); jinak chybí. */
  zvetsit?: (() => void) | null;
  /** Widget je zvětšený v okně: kreslí se jen obsah, bez karty a hlavičky (název nese okno). */
  vOkne?: boolean;
  /** Uložené nastavení instance (bez výchozích) — pro rychlý filtr v hlavičce. */
  nastaveni?: Record<string, unknown>;
  /** Změní nastavení instance (uloží se jako přes „Nastavit widget"); null = tady se nemění (náhled, úpravy, bez práva). */
  zmenNastaveni?: ((zmena: Record<string, unknown>) => void) | null;
  /** Tarif podniku — pole nastavení jen s tarifem se bez něj nenabízí. */
  tarif?: Tarif;
}

const MIMO_PLOCHU: KontextWidgetu = {
  instance: 'widget', velikost: 'M', definice: undefined, nahled: false, upravy: false, inkoust: false,
  nahlasSkryti: () => {}, nahlasVyrizeno: () => {}, mini: null, rozbal: () => {}, zvetsit: null, vOkne: false,
  pohledStranky: null, sbaleno: false, prepniSbaleni: () => {}, zmenNastaveni: null,
};

export const KontextWidgetuCtx = createContext<KontextWidgetu>(MIMO_PLOCHU);

/**
 * Stav instance pro autora widgetu: velikost, jestli je náhled nebo režim
 * úprav a hlavně `inkoust` — widget peněz se na inkoustové ploše kreslí
 * bíle (čísla 28–40 px, poznámka `text-white/60`).
 */
export function useWidget(): KontextWidgetu {
  return useContext(KontextWidgetuCtx);
}

/**
 * Widget ohlásí, že jeho věc je vyřízená (všichni odevzdali, fronta je
 * prázdná…). Plocha ho pak v klidu vykreslí minimalizovaně: nízká karta
 * s názvem, fajfkou a `souhrn`em; klepnutí naviguje na `cil` z katalogu
 * a „Ukázat i tak" ho rozbalí do konce sezení. Konzervativně: hotovo smí
 * být true jen nad načtenými daty, nikdy během načítání nebo po chybě —
 * jinak by se widget minimalizoval dřív, než ví, jestli je co řešit.
 */
export function useVyrizeno(hotovo: boolean, souhrn: string): void {
  const { nahlasVyrizeno } = useWidget();
  useEffect(() => { nahlasVyrizeno(hotovo ? souhrn : null); }, [hotovo, souhrn, nahlasVyrizeno]);
  // Odpojení (odebrání z plochy) po sobě uklidí, ať plocha nedrží mrtvý stav.
  useEffect(() => () => nahlasVyrizeno(null), [nahlasVyrizeno]);
}

// ---------------------------------------------------------------------------
// Dlouhý obsah: zkrácení s „Zobrazit vše"
// ---------------------------------------------------------------------------

/** Nad tuhle výšku (px) se obsah widgetu zkrátí a nabídne „Zobrazit vše"; M a L mají jiný práh. */
const PRAH_ZKRACENI: Record<'M' | 'L', number> = { M: 300, L: 440 };
/** O kolik musí obsah práh přesáhnout, aby se zkracovalo (kvůli pár pixelům se nezkracuje). */
const REZERVA_ZKRACENI = 60;
const KLIC_ROZBALENO = 'managero-widgety-rozbaleno';

function nactiRozbalene(): Record<string, true> {
  try { const v = JSON.parse(localStorage.getItem(KLIC_ROZBALENO) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

/**
 * Tělo widgetu, které je nad prahem výšky zkrácené (přehled nahoře zůstane, dlouhý výčet pod ním se
 * zasune pod odlesk) a jde rozbalit i zase zabalit. Volba se pamatuje v tomhle prohlížeči po instanci.
 * V náhledu galerie a v úpravách se nezkracuje — tam má být vidět všechno.
 */
export function Zkratitelne({ id, velikost, children }: { id: string; velikost: 'M' | 'L'; children: React.ReactNode }) {
  const t = useT('widgety');
  const vnitrek = useRef<HTMLDivElement>(null);
  const [vyska, setVyska] = useState(0);
  const [rozbaleno, setRozbaleno] = useState(false);
  // Uložená volba se čte až v prohlížeči (SSR a první vykreslení se musí shodovat).
  useEffect(() => { setRozbaleno(!!nactiRozbalene()[id]); }, [id]);
  useLayoutEffect(() => {
    const el = vnitrek.current;
    if (!el) return;
    const zmer = () => setVyska(el.getBoundingClientRect().height);
    zmer();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(zmer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const prah = PRAH_ZKRACENI[velikost];
  const dlouhy = vyska > prah + REZERVA_ZKRACENI;
  const zkraceno = dlouhy && !rozbaleno;
  const prepni = () => {
    const dalsi = !rozbaleno;
    setRozbaleno(dalsi);
    try {
      const m = nactiRozbalene();
      if (dalsi) m[id] = true; else delete m[id];
      localStorage.setItem(KLIC_ROZBALENO, JSON.stringify(m));
    } catch { /* soukromé okno */ }
  };
  const maska = 'linear-gradient(to bottom, #000 calc(100% - 64px), transparent)';
  return (
    <div>
      <div data-zkraceno={zkraceno ? '' : undefined}
        style={zkraceno ? { maxHeight: prah, overflow: 'hidden', maskImage: maska, WebkitMaskImage: maska } : undefined}>
        <div ref={vnitrek}>{children}</div>
      </div>
      {dlouhy && (
        <Button variant="ghost" size="sm" icon={zkraceno ? 'chevron' : 'chevronUp'} aria-expanded={!zkraceno} onClick={prepni}
          className="mt-1">
          {zkraceno ? t('Zobrazit vše') : t('Ukázat méně')}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rychlý filtr v hlavičce (kolo 8)
// ---------------------------------------------------------------------------
//
// Období, řazení a kategorii většiny widgetů šlo změnit jen přes „Nastavit
// widget" v kontextovém menu po podržení prstu — na telefonu to nikdo
// neobjevil. Obal proto kreslí vedle titulku Chip s hodnotou prvního pole
// typu `vyber` („Měsíc: tento ▾", „Řadit: mzda ▾"); klepnutí otevře volby
// (na telefonu list zdola, na monitoru nabídku) a změna se uloží do instance
// stejnou cestou jako z okna nastavení. Katalog může pole určit nebo chip
// vypnout (`rychlyFiltr`). V úpravách, v náhledu galerie a bez práva na
// rozložení se nekreslí.

type PoleVyberu = Extract<PoleNastaveni, { typ: 'vyber' }>;

/**
 * Widgety, které si ve velké kartě kreslí vlastní lištu období: tam by chip
 * byl druhé ovládání téhož. Patří jim `rychlyFiltr: false` v katalogu
 * (soubory jiných oblastí); do té doby je zná obal.
 */
const VLASTNI_LISTA_L = new Set(['trzby.po_dnech', 'dochazka.souhrn_hodin', 'uzaverky.souhrn']);

/** Pole rychlého filtru: z `rychlyFiltr`, jinak první viditelné pole `vyber`; null = bez chipu. */
export function poleRychlehoFiltru(def: DefiniceWidgetu | undefined, smi: Smi, tarif: Tarif, velikost: Velikost): PoleVyberu | null {
  if (!def || def.rychlyFiltr === false) return null;
  if (velikost === 'L' && VLASTNI_LISTA_L.has(def.id)) return null;
  const pole = viditelnaPole(def, smi, tarif).filter((p): p is PoleVyberu => p.typ === 'vyber');
  const vybrane = def.rychlyFiltr ? pole.find(p => p.klic === def.rychlyFiltr) : pole[0];
  // Jedna volba není filtr.
  return vybrane && viditelneMoznosti(vybrane.moznosti, smi).length > 1 ? vybrane : null;
}

/** Nad tuhle délku chip nese jen hodnotu („Moje a pro kohokoli ▾"), název pole zůstává v aria-label. */
const MAX_POPISEK_CHIPU = 22;

function RychlyFiltr({ pole, hodnota, onZmena, inkoust, idTitulku, uzky }: {
  pole: PoleVyberu;
  hodnota: unknown;
  onZmena: (id: string) => void;
  inkoust: boolean;
  idTitulku: string;
  /** Malá karta: chip má vlastní řádek a smí být nejvýš tak široký jako karta. */
  uzky: boolean;
}) {
  const t = useT('widgety');
  const smi = useSmi();
  const telefon = useJeTelefon();
  const [open, setOpen] = useState(false);
  // Na telefonu je to okno (zdola); nabídka a její „klepnutí vedle" se tam nesmí míchat.
  const pop = usePopover(open && !telefon, setOpen, { focusFirst: true, arrowKeys: true });
  const moznosti = viditelneMoznosti(pole.moznosti, smi);
  const aktualni = moznosti.find(m => m.id === hodnota) ?? moznosti.find(m => m.id === pole.vychozi) ?? moznosti[0];
  if (!aktualni) return null;
  const nazevPole = t(pole.nazev);
  const popisek = `${nazevPole}: ${t(aktualni.nazev)}`;
  const text = popisek.length > MAX_POPISEK_CHIPU ? t(aktualni.nazev) : popisek;
  const vyber = (id: string) => { setOpen(false); if (id !== aktualni.id) onZmena(id); };
  const volby = (role: 'menuitemradio' | 'radio', vysoke: boolean) => moznosti.map(m => {
    const je = m.id === aktualni.id;
    return (
      <button key={m.id} type="button" role={role} aria-checked={je} onClick={() => vyber(m.id)}
        className={`w-full flex items-center gap-3 px-3 rounded-xl text-sm text-left text-[#16181A] transition-colors hover:bg-black/[0.05] ${vysoke ? 'min-h-[44px] py-2.5' : 'py-2.5'} ${je ? 'font-semibold' : ''}`}>
        <span aria-hidden className="w-[18px] shrink-0 grid place-items-center text-ok-ink">{je && <Icon name="check" size={16} />}</span>
        <span className="min-w-0 flex-1">{t(m.nazev)}</span>
      </button>
    );
  });
  return (
    <div ref={pop.ref} className={`relative min-w-0 ${uzky ? 'max-w-full' : 'shrink-0'}`} data-rychly-filtr={pole.klic}>
      <button ref={pop.triggerRef} type="button" onClick={() => setOpen(v => !v)} onKeyDown={pop.onTriggerKeyDown}
        aria-haspopup={telefon ? 'dialog' : 'menu'} aria-expanded={open} aria-label={popisek} aria-describedby={idTitulku} title={popisek}
        className={`chip chip-sm tap-target-sm transition-colors ${uzky ? 'max-w-full' : 'max-w-[11rem]'} ${inkoust ? 'bg-white/10 text-white/80 hover:bg-white/15' : 'chip-muted hover:bg-black/10'} ${open ? 'ring-2 ring-[#C8F542]' : ''}`}>
        <span className="truncate">{text}</span>
        <Icon name="chevron" size={11} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && !telefon && (
        <MenuPanel ref={pop.panelRef} onKeyDown={pop.onPanelKeyDown} aria-label={nazevPole} className="absolute top-full mt-2 right-0 origin-top-right">
          {volby('menuitemradio', false)}
        </MenuPanel>
      )}
      {open && telefon && (
        <Modal open onClose={() => setOpen(false)} size="sm" title={nazevPole}>
          <div role="radiogroup" aria-label={nazevPole} className="-mx-2 space-y-0.5">{volby('radio', true)}</div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Obal
// ---------------------------------------------------------------------------

/**
 * Co obal potřebuje ze stavu dat — výsledek useDataWidgetu (nebo useLoad)
 * jakéhokoli typu. Bez `set`, ať jde předat `StavDat<Polozka[]>` bez přetypování.
 */
export type StavNacteni = Pick<LoadState<unknown>, 'data' | 'error' | 'loading' | 'reload'> & { vypnuto?: boolean };

export interface ObalWidgetuProps {
  /** Jen odkaz a výjimky; jinak název z registru, ať titulek nemůže ujet od galerie. */
  titulek?: string;
  /** Ikona místo ikony z registru — jen widget Odkaz (ikona podle cíle). */
  ikona?: string;
  /** Chip sm vedle titulku (počet). */
  doplnek?: React.ReactNode;
  /** Odkaz dál vpravo v hlavičce; na pohled, kam divák nesmí, se nekreslí. */
  odkaz?: { popisek: string; pohled: string; arg?: string };
  /** Místo odkazu nabídka „···" (nikdy obojí). */
  akce?: MenuItem[];
  /** Jen S bez jiných ovládacích prvků: celá karta je proklik. */
  otevrit?: () => void;
  /** Dlouhý obsah se nezkracuje pod „Zobrazit vše" (velký dashboard, který je celý obsah karty). */
  bezZkraceni?: boolean;
  /** Jediný tónovaný widget na ploše: „Čeká na tebe". */
  ton?: 'wait';
  /** Stav dat (jeden nebo víc dotazů); vypnuté dotazy (url null) se nepočítají. */
  nacteni?: StavNacteni | readonly StavNacteni[];
  /** Tvar kostry při načítání; výchozí z registru (S = číslo, M a L = seznam). */
  kostra?: Kostra;
  /**
   * undefined = data jsou a kreslí se obsah; ReactNode = prázdno k ukázání
   * (věta t-meta nebo EmptyState compact); null = v klidu se widget nekreslí
   * (v úpravách ukáže „Teď tu nic není.").
   */
  prazdno?: React.ReactNode | null;
  children?: React.ReactNode;
}

/**
 * Nadpis karty přijímá fokus programově (tabIndex -1, mimo Tab): plocha ho tam
 * vrací po výměně plné karty za minimalizovanou a zpět. Prstenec jen pro klávesnici.
 */
const FOKUS_TITULKU = 'rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]';

/** Vypnutý dotaz (useDataWidgetu s url null) nesmí držet widget na kostře. */
const jeVypnuto = (s: StavNacteni) => s.vypnuto === true;

/** Kostra ve tvaru obsahu, uvnitř karty — titulek zůstává, protože titulek nejsou data. */
function KostraTela({ tvar, velikost }: { tvar: Kostra; velikost: Velikost }) {
  if (tvar === 'cislo') {
    return (
      <div className="space-y-2">
        <Skeleton className="h-3 w-16 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-xl" />
      </div>
    );
  }
  if (tvar === 'graf') return <Skeleton className={velikost === 'L' ? 'h-40' : 'h-24'} />;
  if (tvar === 'text') {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-4/5 rounded-full" />
        <Skeleton className="h-4 w-3/5 rounded-full" />
      </div>
    );
  }
  const radku = velikost === 'L' ? 5 : velikost === 'M' ? 3 : 2;
  return (
    <div className="space-y-2">
      {Array.from({ length: radku }, (_, i) => (
        <Skeleton key={i} className={`h-10 ${i === radku - 1 ? 'w-2/3' : ''}`} />
      ))}
    </div>
  );
}

/**
 * Obal widgetu: `<Card as="section">` s jednou podobou hlavičky a čtyřmi
 * poctivými stavy (DP §5.3). Autor widgetu dodá data (`nacteni`), obsah
 * (children) a případně prázdno — o kostru, chybu a skrytí se postará obal.
 */
export function Widget({ titulek, ikona, doplnek, odkaz, akce, otevrit, bezZkraceni, ton, nacteni, kostra, prazdno, children }: ObalWidgetuProps) {
  const k = useWidget();
  const nav = useNavigace();
  const smi = useSmi();
  const t = useT('widgety');
  // Telefon (do 767 px): chip rychlého filtru má vlastní řádek pod hlavičkou (viz `filtrPod`).
  const telefon = useJeTelefon();
  // Název z katalogu se překládá při vykreslení; vlastní titulek (odkaz, výjimky) se bere, jak je.
  const nazev = titulek ?? (k.definice ? t(k.definice.nazev) : '');
  const S = k.velikost === 'S';
  const inkoust = k.inkoust && !S;

  const stavy = (nacteni === undefined ? [] : Array.isArray(nacteni) ? nacteni : [nacteni]) as readonly StavNacteni[];
  const aktivni = stavy.filter(s => !jeVypnuto(s));
  const chyba = aktivni.find(s => s.error)?.error ?? null;
  const nacitam = !chyba && aktivni.some(s => s.loading);
  // Prázdný widget s `prazdno={null}` („Čeká na tebe", když nic nečeká) se
  // v klidu nekreslí vůbec — plocha jeho buňku vyřadí z mřížky, ať po něm
  // nezůstane díra. V úpravách a v náhledu zůstane vidět, jinak by nešel
  // přesunout, odebrat ani vybrat v galerii.
  const prazdny = !nacitam && !chyba && prazdno === null;
  const { nahlasSkryti } = k;
  useEffect(() => { nahlasSkryti(prazdny); }, [prazdny, nahlasSkryti]);
  useEffect(() => () => nahlasSkryti(false), [nahlasSkryti]);
  if (prazdny && !k.upravy && !k.nahled) return null;

  const idTitulku = `w-${k.instance}-t`;
  const zkusitZnovu = () => aktivni.forEach(s => { if (s.error) s.reload(); });

  // Cíl karty z katalogu (kolo 71): klepnutí na kartu v klidu naviguje do
  // sekce, odkud jsou data — samotné klepnutí obsluhuje plocha na <li>
  // (hystereze, podržení). Obal přidá jemnou nápovědu (chevron v hlavičce,
  // zvednutí na hover) a klávesovou cestu: <li> v klidu tabIndex mít nesmí
  // (sonda k68-klavesnice 5), takže Enter nese tlačítko „Otevřít …".
  const cilKarty = k.definice?.cil;
  // Karta, jejíž cíl je stránka, na které už leží, nemá kam vést: žádná šipka „Otevřít" (nic by neudělala)
  // a klepnutí do hlavičky ji místo toho sbalí / rozbalí.
  const naCili = !!cilKarty && !!k.pohledStranky && cilKarty.pohled === k.pohledStranky;
  const smiCil = !!cilKarty && !k.nahled && !k.upravy && !naCili && nav.smiPohled(cilKarty.pohled);
  const mozeSbalit = k.velikost !== 'S' && !k.nahled && !k.upravy && k.pohledStranky != null;
  const klepnutelna = smiCil && !otevrit;
  const otevriCil = () => { if (cilKarty) nav.onNavigate(cilKarty.pohled, cilKarty.arg); };

  // Vyřízený widget v klidu: nízká karta s fajfkou a souhrnem místo plného
  // obsahu (plocha rozhodla přes `mini`). Data widgetu žijí dál — komponenta
  // je připojená a hlásí, kdyby zase bylo co řešit.
  if (k.mini != null && !k.upravy && !k.nahled) {
    return (
      <Card as="section" pad="sm" aria-label={t('{nazev} — vyřízeno', { nazev })} className="relative min-w-0 flex items-center gap-3">
        {smiCil && (
          <button type="button" onClick={otevriCil} aria-label={t('Otevřít {nazev}', { nazev })}
            className="absolute inset-0 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]" />
        )}
        {/* Fajfka bez záře: stav, ne akce (DP T3) — proto ne .dot-ok (ten má prstenec) a žádný button.on-accent. */}
        <span aria-hidden className="relative shrink-0 grid h-6 w-6 place-items-center rounded-full bg-ok on-accent">
          <Icon name="check" size={14} strokeWidth={2.5} />
        </span>
        <div className="relative min-w-0 flex-1">
          {/* tabIndex -1 + data-w-titulek: cíl fokusu po výměně karet (plocha sem vrátí
              fokus, když klávesnicí ovládané tlačítko, které ho neslo, zmizelo z DOM). */}
          {/* Název na jeden řádek (celý v `title`), souhrn pod ním smí na dva — plocha minimalizované
              kartě dává aspoň půl řádku na monitoru a celý řádek na telefonu, takže se neutínají. */}
          <h2 id={idTitulku} data-w-titulek="" tabIndex={-1} title={nazev} className={`t-card truncate ${FOKUS_TITULKU}`}>{nazev}</h2>
          <p className="t-meta line-clamp-2 break-words" title={k.mini}>{k.mini}</p>
        </div>
        <Button variant="ghost" size="sm" icon="chevron" aria-label={t('Ukázat celý widget {nazev}', { nazev })}
          className="relative shrink-0 -my-1 -mr-2" onClick={k.rozbal} />
      </Card>
    );
  }

  let obsah: React.ReactNode;
  if (nacitam) obsah = <KostraTela tvar={kostra ?? kostraWidgetu(k.definice, k.velikost)} velikost={k.velikost} />;
  else if (chyba) obsah = <ErrorState compact title={t('Widget se nenačetl')} onRetry={zkusitZnovu} detail={chyba} className="!py-3" />;
  else if (prazdno === null) obsah = <p className="t-meta">{t('Teď tu nic není.')}</p>;
  else if (prazdno !== undefined) obsah = prazdno;
  else obsah = children;

  const vidiOdkaz = !!odkaz && nav.smiPohled(odkaz.pohled);
  if (k.vOkne) return <div className="min-w-0" aria-busy={nacitam || undefined}>{obsah}</div>;
  const mozeZvetsit = !!k.zvetsit && !k.nahled && !k.upravy;
  // Prázdný stav (věta místo dat): malá karta se pak neroztahuje na výšku čísla a věta stojí nahoře.
  // Dřív `justify-end` a min. výška 8,5 rem nechaly samotnou větu u dna prázdné karty — vypadalo to
  // jako chyba vykreslení („Nikdo není napíchnutý déle, než měl." u spodní hrany 136px karty).
  const prazdnyStav = !nacitam && !chyba && prazdno !== undefined;
  // Šipka „Otevřít" navigovatelné karty. U malé karty nestojí v hlavičce, ale vpravo dole vedle čísla:
  // v polovině telefonu (171 px) by v hlavičce vzala názvu 40 px a „Docházející zásoby" se lámal
  // uvnitř slova („Docház / ející…"). Odkaz s textem nebo „···" zůstávají v hlavičce jako dřív.
  const sipkaCile = klepnutelna && !vidiOdkaz && !(akce && akce.length > 0);
  const sipkaDole = S && sipkaCile;
  // Rychlý filtr (kolo 8): období / řazení / kategorie z nastavení přímo v hlavičce.
  const poleFiltru = !k.nahled && !k.upravy && k.zmenNastaveni ? poleRychlehoFiltru(k.definice, smi, k.tarif ?? 'max', k.velikost) : null;
  // Chip má vlastní řádek pod hlavičkou u malé karty (171 px) a na telefonu u každé: v jednom
  // sloupci je karta ~358 px a vedle Zvětšit, Sbalit a šipky by chip („Měsíc: Tento ▾" ≤ 176 px)
  // nechal názvu pár desítek pixelů — „Dostupnost týmu" se lámal a v polštině na 320 px hlavička
  // přetékala (sondy k68-design 7, preteceni-jazyky). Na monitoru a tabletu má střední karta
  // nejméně dva sloupce a chip se vedle názvu vejde.
  const filtrPod = S || telefon;
  const filtr = poleFiltru ? (
    <RychlyFiltr pole={poleFiltru} hodnota={k.nastaveni?.[poleFiltru.klic]} inkoust={inkoust} idTitulku={idTitulku} uzky={filtrPod}
      onZmena={id => k.zmenNastaveni?.({ [poleFiltru.klic]: id })} />
  ) : null;
  const filtrVHlavicce = filtr && !filtrPod ? filtr : null;
  const tlacitkoCile = sipkaCile ? (
    <Button variant="ghost" size="sm" icon="chevronRight" aria-label={t('Otevřít {nazev}', { nazev })}
      className={`${sipkaDole ? 'shrink-0 -mb-1.5 -mr-2 self-end' : ''} ${inkoust ? '!text-white/70 hover:!text-white hover:!bg-white/10' : 'w-ovladani'}`}
      onClick={otevriCil} />
  ) : null;
  return (
    <Card
      as="section"
      tone={ton === 'wait' && !inkoust ? 'wait' : 'default'}
      pad={S ? 'sm' : 'md'}
      aria-labelledby={idTitulku}
      aria-busy={nacitam || undefined}
      // V režimu úprav je karta jen „dlaždice ke skládání": nic uvnitř se
      // nesmí stisknout ani dostat do Tabu, jinak by tah myší spustil tlačítko
      // pod kurzorem. Jméno widgetu pro odečítač nese <li> (spec §4.10).
      inert={k.upravy || undefined}
      className={[
        'min-w-0 h-full flex flex-col',
        S ? `sm:p-5 relative ${prazdnyStav ? '' : 'min-h-[8.5rem]'}` : '',
        // Klepnutelná karta (natažený odkaz, nebo cíl z katalogu) se na hover jemně zvedne.
        otevrit || klepnutelna ? 'relative transition-shadow hover:shadow-[shadow:var(--shadow-float)]' : '',
        // Jediná tmavá plocha v obsahu: hlavní číslo peněz (DP §2.10), v3 bez záře v rohu.
        inkoust ? 'relative overflow-hidden bg-[#16181A] text-white border-transparent' : '',
      ].join(' ')}
    >
      {/* v3: žádná limetková záře v rohu inkoustové karty ani limetkový dotek
          v rohu malých karet — dekorativní přechody dělaly z plochy „polévku z karet". */}
      <div className={`relative flex items-start justify-between gap-3 ${naCili && mozeSbalit ? 'cursor-pointer' : ''}`}
        // Okno rychlého filtru je portál do <body>, ale React jeho klepnutí bublá sem — pozadí okna kartu sbalit nesmí.
        onClick={naCili && mozeSbalit ? (e => { if (!(e.target as Element).closest('button, a, [role="menu"], [role="menuitem"], [role="dialog"], .modal-overlay')) k.prepniSbaleni(); }) : undefined}>
        {/* Malá karta je na telefonu široká ~171 px a na název zbývá ~107 px:
            „Docházející zásoby" by skončil jako „Docházející zá…" a číslo pod
            ním by nemělo jméno. U S proto dva řádky, ikona u prvního. Dlouhé
            slovo se dělí podle jazyka stránky (hyphens, <html lang>), ale jen
            slovo od 10 znaků a nejméně po 5 znacích na každé straně — „schvá-lení"
            by vypadalo hůř než celé slovo na dalším řádku (Safari zná jen
            limit před/za). Rozlomení bez spojovníku (break-words) je až poslední
            záchrana proti přetečení (německá složená slova). */}
        <h2 id={idTitulku} data-w-titulek="" tabIndex={-1} className={`t-card flex ${S ? 'items-start' : 'items-center'} gap-2 min-w-0 ${FOKUS_TITULKU} ${inkoust ? '!text-white' : ''}`}>
          {/* v3: ikona bez barevného čtverečku, jen tlumeně monochromní vedle titulku —
              limetková dlaždička u každé karty (kolo 71) byla šum navíc. */}
          <Icon name={ikona ?? k.definice?.ikona ?? 'overview'} size={17}
            className={`shrink-0 ${S ? 'mt-px' : ''} ${inkoust ? 'text-white/60' : 'w-ikona'}`} />
          <span className="line-clamp-2 break-words hyphens-auto [hyphenate-limit-chars:10_5_5] [-webkit-hyphenate-limit-before:5] [-webkit-hyphenate-limit-after:5]" title={nazev}>{nazev}</span>
          {doplnek}
        </h2>
        {/* Ovládací prvky vpravo v jedné skupině a Sbalit VŽDY úplně vpravo: dřív stál mezi názvem a odkazem
            („Finance ›"), takže se podle toho, jaké další prvky karta měla, posouval a „plaval". */}
        {(filtrVHlavicce || mozeSbalit || mozeZvetsit || vidiOdkaz || (!odkaz && akce && akce.length > 0) || (sipkaCile && !sipkaDole)) && (
          <div className="flex items-center shrink-0 -my-1.5 -mr-2">
            {/* Filtr před ovládáním karty: Sbalit zůstává vždy úplně vpravo. */}
            {filtrVHlavicce && <span className={`flex min-w-0 ${mozeSbalit || mozeZvetsit || vidiOdkaz || (akce && akce.length > 0) || (sipkaCile && !sipkaDole) ? 'mr-1' : 'mr-2'}`}>{filtrVHlavicce}</span>}
            {vidiOdkaz && (
              <Button variant="ghost" size="sm" iconAfter="chevronRight"
                className={inkoust ? '!text-white/70 hover:!text-white hover:!bg-white/10' : 'w-ovladani'}
                onClick={() => nav.onNavigate(odkaz!.pohled, odkaz!.arg)}>
                {/* Vedle Zvětšit a Sbalit zbývá na telefonu málo místa na název: odkaz je tam jen šipka (text čte odečítač). */}
                <span className={mozeZvetsit ? 'max-sm:sr-only' : ''}>{odkaz!.popisek}</span>
              </Button>
            )}
            {!odkaz && akce && akce.length > 0 && (
              <Menu size="sm" label={t('Další akce: {nazev}', { nazev })} items={akce} />
            )}
            {/* Jemná nápověda navigovatelné karty: chevron jen tam, kde v hlavičce
                není odkaz ani „···" — a zároveň klávesová cesta (Enter naviguje),
                protože <li> v klidu tabIndex nemá (sonda k68-klavesnice 5). */}
            {!sipkaDole && tlacitkoCile}
            {mozeZvetsit && (
              <Button variant="ghost" size="sm" icon="expand" aria-haspopup="dialog" aria-describedby={idTitulku} aria-label={t('Zvětšit widget')}
                className={inkoust ? '!text-white/70 hover:!text-white hover:!bg-white/10' : 'w-ovladani'}
                onClick={k.zvetsit!} />
            )}
            {mozeSbalit && (
              // Jméno widgetu v popisku by se pletlo s tlačítky hledanými podle názvu widgetu — nese ho nadpis (aria-describedby).
              <Button variant="ghost" size="sm" icon={k.sbaleno ? 'chevron' : 'chevronUp'} aria-expanded={!k.sbaleno} aria-describedby={idTitulku}
                aria-label={k.sbaleno ? t('Rozbalit widget') : t('Sbalit widget')}
                className={inkoust ? '!text-white/70 hover:!text-white hover:!bg-white/10' : 'w-ovladani'}
                onClick={k.prepniSbaleni} />
            )}
          </div>
        )}
      </div>
      {filtrPod && filtr && <div className="relative mt-2 flex min-w-0">{filtr}</div>}
      {!(mozeSbalit && k.sbaleno) && (
        <div className={`relative mt-3 flex-1 min-h-0 ${sipkaDole ? (chyba ? 'flex flex-col justify-end gap-1' : 'flex items-end gap-1') : S && !prazdnyStav ? 'flex flex-col justify-end' : ''}`}>
          {sipkaDole ? (
            // Chyba se „Zkusit znovu" potřebuje celou šířku karty — šipka jde pod ni, ne vedle.
            <>
              <div className={`min-w-0 ${chyba ? '' : 'flex-1'} ${prazdnyStav ? 'self-start' : ''}`}>{obsah}</div>
              {tlacitkoCile}
            </>
          ) : !S && !bezZkraceni && !k.nahled && !k.upravy && !nacitam && !chyba && prazdno === undefined
            ? <Zkratitelne id={k.instance} velikost={k.velikost as 'M' | 'L'}>{obsah}</Zkratitelne>
            : obsah}
        </div>
      )}
      {otevrit && (
        <button type="button" onClick={otevrit} aria-label={t('Otevřít {nazev}', { nazev })}
          className="absolute inset-0 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]" />
      )}
    </Card>
  );
}

export default Widget;

// ---------------------------------------------------------------------------
// Pomocné podoby, které kreslí plocha (ne autor widgetu)
// ---------------------------------------------------------------------------

const NACITA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

/** Widget v kostře: fallback líné komponenty a buňka před načtením oprávnění (spec §3.1). */
export function KostraWidgetu() {
  const k = useWidget();
  return <Widget nacteni={NACITA} kostra={kostraWidgetu(k.definice, k.velikost)} />;
}

/**
 * Schematický widget (výchozí rozložení v Nastavení → Stránky a náhled
 * widgetu s tarifem): ikona, název a popis z registru a pár statických
 * pruhů. Neposílá žádný dotaz — správce vidí, co kde bude, a data jiných
 * lidí mu neprotečou (spec §3.8).
 */
export function SchematickyWidget() {
  const k = useWidget();
  const t = useT('widgety');
  const pruhu = k.velikost === 'S' ? 1 : k.velikost === 'M' ? 2 : 3;
  return (
    <Widget>
      <p className="t-meta line-clamp-2">{k.definice ? t(k.definice.popis) : null}</p>
      <div className="mt-3 space-y-2" aria-hidden>
        {Array.from({ length: pruhu }, (_, i) => (
          <div key={i} className={`h-8 rounded-xl bg-black/[0.05] ${pruhu > 1 && i === pruhu - 1 ? 'w-2/3' : ''}`} />
        ))}
      </div>
    </Widget>
  );
}

/**
 * Komponenta, kterou oblast pro hotový widget nemá. V `next dev` na nesoulad
 * upozorní přímo na ploše; v produkci se widget v klidu nekreslí (a v úpravách
 * jde aspoň odebrat). Nesoulad hlídá test AK-20.
 */
export function Chybi() {
  const k = useWidget();
  const t = useT('widgety');
  const vyvoj = process.env.NODE_ENV === 'development';
  const { nahlasSkryti } = k;
  useEffect(() => {
    if (vyvoj) return;
    nahlasSkryti(true);
    return () => nahlasSkryti(false);
  }, [vyvoj, nahlasSkryti]);
  if (vyvoj) {
    return (
      <Widget>
        <ErrorState compact title={t('Widget chybí')} hint={t('Oblast nemá komponentu pro {widget}.', { widget: k.definice?.id ?? t('tenhle widget') })} className="!py-3" />
      </Widget>
    );
  }
  if (!k.upravy && !k.nahled) return null;
  return <Widget prazdno={<p className="t-meta">{t('Tenhle widget se teď nedá zobrazit.')}</p>} />;
}

/**
 * Pojistka kolem jednoho widgetu: pád jeho kódu (nebo nestažená část
 * aplikace) neshodí plochu. Záloha je tentýž obal s chybou a „Zkusit znovu"
 * zvedne pokus — plocha pak založí novou línou komponentu, takže se znovu
 * stáhne i část aplikace s oblastí (React.lazy si pamatuje i nepovedený import).
 */
export class PojistkaWidgetu extends React.Component<
  { resetKey: string; onZnovu: () => void; children: React.ReactNode },
  { chyba: Error | null }
> {
  state: { chyba: Error | null } = { chyba: null };

  static getDerivedStateFromError(chyba: Error) {
    return { chyba };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.chyba) this.setState({ chyba: null });
  }

  componentDidCatch(chyba: Error) {
    console.error('[Managero] widget spadl:', chyba);
  }

  render() {
    if (!this.state.chyba) return this.props.children;
    return <ZaloznaChyba onZnovu={this.props.onZnovu} detail={this.state.chyba.message} />;
  }
}

/** Záloha pojistky: třída nemá hooky, překlad dodá tahle malá komponenta. */
function ZaloznaChyba({ onZnovu, detail }: { onZnovu: () => void; detail: string }) {
  const t = useT('widgety');
  return (
    <Widget>
      <ErrorState compact title={t('Widget se nenačetl')} onRetry={onZnovu} detail={detail} className="!py-3" />
    </Widget>
  );
}
