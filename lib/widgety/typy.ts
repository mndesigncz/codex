// Plocha s widgety a úpravy stránek (kolo 68) — společné typy.
//
// Čistý soubor bez běhového kódu: berou si ho server (API rozložení), testy
// (`npm test` pouští .ts přímo v Node, proto jen `import type` a relativní
// cesty s příponou) i klient. React se tu objevuje jen jako typ — Node ho
// při odloupnutí typů zahodí a na serveru se nic z Reactu nenačte.
//
// Názvosloví (spec §0.3): plocha = mřížka widgetů jedné stránky, widget =
// typ bloku z registru, instance = jeho výskyt na ploše, rozložení = pole
// instancí v pořadí, rozsah = čí rozložení to je.

import type { ComponentType, LazyExoticComponent } from 'react';
import type { TypRole } from '../opravneni.ts';

export type Velikost = 'S' | 'M' | 'L';
/** Rozhraní stránky = typ role (vedení / zaměstnanec / tablet). */
export type Rozhrani = TypRole;
export type Tarif = 'zdarma' | 'pro' | 'max';

/** Jedna instance na stránce — přesně tohle se ukládá do JSONB. */
export interface PolozkaRozlozeni {
  /** /^[a-z0-9-]{1,40}$/, unikátní v rozložení. */
  id: string;
  /** Id z registru, nebo 'nastroj' (hlavní pracovní část stránky). */
  widget: string;
  /** Jen z velikostí widgetu; nástroj vždy 'L'. */
  velikost: Velikost;
  /** Vyčištěné podle schématu (vycistiNastaveni); prázdné se neukládá. */
  nastaveni?: Record<string, unknown>;
}

/** Čí rozložení to je. */
export type Rozsah =
  | `osobni:${number}`                    // uživatel
  | `typ:${Rozhrani}`                     // všichni daného typu role v podniku
  | `role:${string}`;                     // systémová role (role:provozni) nebo vlastní (role:#12)

/** Odkud rozložení, které divák vidí, pochází. */
export type Zdroj = 'osobni' | 'podnik' | 'aplikace';

/** Oblast = skupina widgetů v galerii, soubor v katalogu a vlastník v kole 69. */
export type IdOblasti =
  | 'obecne' | 'trzby' | 'uzaverky' | 'finance' | 'dochazka' | 'rozvrh' | 'moje-smeny'
  | 'sklad' | 'receptury' | 'menu' | 'ukoly' | 'planovani' | 'napady' | 'postupy'
  | 'navody' | 'odmeny' | 'akce' | 'klient' | 'tym' | 'organizace';

/** Všech 36 stránek (spec §2.4). Kolo 68 založí všechny, aktivní jsou dvě. */
export type IdStranky =
  | 'vedeni.prehled' | 'zamestnanec.domu'
  | 'vedeni.rozvrh' | 'vedeni.moje_smeny' | 'zamestnanec.moje_smeny' | 'zamestnanec.dostupnost'
  | 'vedeni.dochazka' | 'vedeni.tym'
  | 'vedeni.sklad' | 'zamestnanec.sklad'
  | 'vedeni.receptury' | 'vedeni.menu'
  | 'vedeni.uzaverky' | 'zamestnanec.uzaverka'
  | 'vedeni.finance' | 'vedeni.togo' | 'vedeni.vsechny_podniky'
  | 'vedeni.ukoly' | 'zamestnanec.ukoly' | 'vedeni.planovani' | 'vedeni.napady' | 'zamestnanec.napady'
  | 'vedeni.postupy' | 'zamestnanec.postupy' | 'vedeni.navody' | 'zamestnanec.navody'
  | 'vedeni.odmeny' | 'zamestnanec.odmeny'
  | 'vedeni.klient' | 'vedeni.klient_rezervace' | 'vedeni.klient_objednavky' | 'vedeni.klient_zakaznici'
  | 'vedeni.klient_vernost' | 'vedeni.klient_stoly' | 'vedeni.akce'
  | 'kiosk.smena';

/** Tvar kostry (Skeleton) při načítání. Výchozí S = cislo, M a L = seznam. */
export type Kostra = 'cislo' | 'seznam' | 'graf' | 'text';

// ---------------------------------------------------------------------------
// Schéma nastavení widgetu (spec §2.3)
// ---------------------------------------------------------------------------

/** Volba výběru; volba s oprávněním se bez něj v UI neukáže a widget ji ignoruje. */
export interface MoznostNastaveni { id: string; nazev: string; opravneni?: string | string[] }

/**
 * Odkud pole typu `zdroj` bere možnosti (načte je UI přes useDataWidgetu).
 * `clenove` a `dodavatele` jsou navíc proti spec §2.3: potřebují je widgety
 * Profil člena a Nákupní seznam z kola 69 a tenhle soubor je pak zamčený.
 */
export type ZdrojNastaveni = 'sklad.kategorie' | 'postupy' | 'navody' | 'pohledy' | 'clenove' | 'dodavatele';

export type PoleNastaveni = {
  klic: string;
  nazev: string;
  napoveda?: string;
  /** Pole jen s tarifem (např. zdroj Pokladna). */
  tarif?: Tarif;
  /** Pole jen s oprávněním (stačí kterékoli). */
  opravneni?: string | string[];
} & (
  | { typ: 'vyber'; moznosti: MoznostNastaveni[]; vychozi: string }
  | { typ: 'vicevyber'; moznosti: MoznostNastaveni[]; vychozi: string[] | 'vse' }
  | { typ: 'cislo'; min: number; max: number; krok?: number; jednotka?: string; vychozi: number }
  | { typ: 'prepinac'; vychozi: boolean }
  | { typ: 'text'; maxDelka: number; vychozi: string }
  | { typ: 'zdroj'; zdroj: ZdrojNastaveni; vychozi: string | number | null; prazdne?: string }
  /** Jen widget 'odkaz': pole vlastní klíče `cil`, `popisek` a `ikona` najednou. */
  | { typ: 'odkaz' }
);

// ---------------------------------------------------------------------------
// Definice widgetu (spec §2.2) — metadata bez Reactu
// ---------------------------------------------------------------------------

export interface OpravneniWidgetu {
  /** Všechny musí mít. */
  vse: string[];
  /** Aspoň jedno (prázdné = bez podmínky). */
  nektere: string[];
  /**
   * Části widgetu podle dalších klíčů (fronty, čísla, tlačítka). Pole
   * znamená „stačí kterékoli" (stejně jako useOpravneni().ma). Tlačítka mají
   * klíč s předponou `akce:`.
   */
  pole?: Record<string, string | string[]>;
}

export interface DefiniceWidgetu {
  /** 'sklad.dochazi' — oblast.tečka.jméno, neměnné (je uložené v rozloženích). */
  id: string;
  oblast: IdOblasti;
  /** Titulek widgetu i název v galerii (věta, ne Title Case). */
  nazev: string;
  /** Jedna věta do galerie (t-meta). */
  popis: string;
  /** Jméno z components/Icons.tsx; ve výchozím rozložení stránky se nesmí opakovat (AK-19). */
  ikona: string;
  /** Povolené velikosti v pořadí S → L. */
  velikosti: Velikost[];
  vychoziVelikost: Velikost;
  /** Nejde odebrat (dnes jen 'nastroj'; zavedeno pro budoucí použití). */
  povinny?: boolean;
  /** Smí být na stránce víckrát (odkaz, stav kategorie). */
  vicekrat?: boolean;
  /** Strop instancí u `vicekrat` (bez něj MAX_INSTANCI z konstant). */
  maxInstanci?: number;
  /** Kde smí být. */
  rozhrani: Rozhrani[];
  /** „Doporučené pro tuto stránku" — odvozené z galerie stránek katalogu. */
  stranky: IdStranky[];
  opravneni: OpravneniWidgetu;
  tarif: Tarif;
  nastaveni?: PoleNastaveni[];
  kostra?: Partial<Record<Velikost, Kostra>>;
  /** Widget peněz: smí být jedinou inkoustovou plochou stránky (DP §2.10). */
  muzeInkoust?: boolean;
  /** planovany = komponenta ještě není; nikde se nekreslí ani nenabízí. */
  stav: 'hotovo' | 'planovany';
}

/** Oblast v galerii a v katalogu. */
export interface Oblast { id: IdOblasti; nazev: string; ikona: string }

// ---------------------------------------------------------------------------
// Definice stránky (spec §2.4)
// ---------------------------------------------------------------------------

/** Klíč výchozího rozložení z kódu: pro typ role, nebo pro systémovou roli. */
export type KlicVychoziho = `typ:${Rozhrani}` | `role:${string}`;

/** Položka výchozího rozložení v kódu: widget, velikost, nastavení (zkratky jako v katalogu). */
export interface VychoziPolozka { w: string; s?: Velikost; o?: Record<string, unknown> }

export interface NastrojStranky { nazev: string; ikona: string; popis: string }

export interface DefiniceStranky {
  id: IdStranky;
  rozhrani: Rozhrani;
  /** Stejně jako v navigaci („Sklad"; Domů zaměstnance = „Přehled"). */
  nazev: string;
  /**
   * Klíč pohledu v layoutu ('inventory', 'home', …). Záložky Managero client
   * mají tvar 'klient:<záložka>' (id záložky v ClientAdmin), TO GO 'togo'
   * a tablet 'shift' (záložka v KioskApp).
   */
  pohled: string;
  /** Klíče, které pohled otevírají (= KLICE_POHLEDU v layoutu; stačí kterýkoli); null = každý. */
  pristup: string[] | null;
  nastroj: NastrojStranky | null;
  /** Smí mít inkoustový widget peněz (Přehled vedení, TO GO, Finance, Uzávěrky). */
  inkoust?: boolean;
  /** „Doporučené pro tuto stránku" v galerii (galerie z katalogu). */
  doporucene: string[];
  vychozi: Partial<Record<KlicVychoziho, VychoziPolozka[]>>;
  /** Plochu už kreslí; false = GET 404 a v Nastavení → Stránky se nenabízí. */
  aktivni: boolean;
}

// ---------------------------------------------------------------------------
// Vyhodnocení rozložení (spec §1.3–1.5)
// ---------------------------------------------------------------------------

/** Kdo se na stránku dívá — z toho se počítá, čí rozložení platí a co smí vidět. */
export interface Divak {
  userId: number;
  typ: Rozhrani;
  /** Klíč systémové role, nebo null u vlastní. */
  klic: string | null;
  /** Id vlastní role, nebo null u systémové. */
  roleId: number | null;
  /** roles.zdroj — systémová role, ze které se vlastní role zkopírovala. */
  zdrojRole: string | null;
  opravneni: ReadonlySet<string>;
  tarif: Tarif;
  /** podnik.nastaveni, u tabletových stránek i kiosk.spravovat. */
  jeSpravce: boolean;
}

/** Co z diváka potřebuje filtr viditelnosti (stejné na serveru i v klientu). */
export type ViditelnostDivaka = Pick<Divak, 'typ' | 'opravneni' | 'tarif'>;

/** Řádek tabulky rozlozeni_stranek, jak ho vrátí rozlozeniDb. */
export interface RadekRozlozeni {
  rozsah: string;
  /** Surové JSONB — vždy projde normalizací. */
  polozky: unknown;
  zamceno: boolean;
  verze: number;
  /** 'dashboard_config' u řádků z migrace, jinak null. */
  zdroj?: string | null;
  upravil?: number | null;
  /** updated_at jako ISO řetězec. */
  upraveno?: string | null;
}

export interface VyreseneRozlozeni {
  /** Viditelné položky — jen ty jdou klientovi. */
  polozky: PolozkaRozlozeni[];
  /** Po normalizaci, bez filtru viditelnosti — základ pro zachovejSkryte. */
  nefiltrovane: PolozkaRozlozeni[];
  zdroj: Zdroj;
  /** Odkud je výchozí, ze kterého se vychází (null = aplikace). */
  rozsah: Rozsah | null;
  zamceno: boolean;
  /** Verze osobního řádku; 0 = ještě neexistuje. */
  verze: number;
  /** Výchozí podniku, které na diváka dopadá (krok 1) — pro bránu úprav. */
  vychozi: RadekRozlozeni | null;
}

/** Výsledek brány úprav (smiUpravitRozlozeni). */
export type BranaUprav = { ok: true } | { ok: false; chyba: string; zamceno?: true };

// ---------------------------------------------------------------------------
// Tvary odpovědí API (spec §1.6) — ať klient a server mluví stejně
// ---------------------------------------------------------------------------

/** GET /api/rozlozeni?stranka=… */
export interface OdpovedRozlozeni {
  stranka: IdStranky;
  polozky: PolozkaRozlozeni[];
  /** Viditelné widgety rozhraní stránky — z nich klient staví galerii. */
  dostupne: string[];
  /** Widgety, které by šly jen s vyšším tarifem (jen s predplatne.spravovat, jinak []). */
  tarifem: { widget: string; tarif: Tarif }[];
  zdroj: Zdroj;
  rozsah: Rozsah | null;
  zamceno: boolean;
  smiUpravit: boolean;
  smiVychozi: boolean;
  /** Verze osobního řádku; 0 = ještě neexistuje. */
  verze: number;
}

/** Volba „Pro koho" u výchozího rozložení. */
export interface RozsahVolba { id: Rozsah; nazev: string; clenu: number }

/** GET /api/rozlozeni/vychozi?stranka=…&rozsah=… */
export interface OdpovedVychozi {
  stranka: IdStranky;
  rozsah: Rozsah;
  /** NEfiltrované podle správce: jen bez neznámých a plánovaných. */
  polozky: PolozkaRozlozeni[];
  zamceno: boolean;
  verze: number;
  zdroj: 'podnik' | 'aplikace';
  rozsahy: RozsahVolba[];
  /** Hotové widgety rozhraní stránky — do výchozího smí i to, co správce sám nevidí. */
  dostupne: string[];
  /** Kdy výchozí naposledy někdo změnil (ISO); null = výchozí z aplikace. */
  upraveno: string | null;
}

// ---------------------------------------------------------------------------
// Kontrakt widgetu (spec §2.6) — na tomhle stojí komponenty
// ---------------------------------------------------------------------------

export interface WidgetProps<N extends Record<string, unknown> = Record<string, unknown>> {
  /** Id položky (instance). */
  instance: string;
  velikost: Velikost;
  /** Doplněné výchozími hodnotami (sNastavenimVychozimi). */
  nastaveni: N;
  /** Galerie / nastavení: bez akcí, bez navigace, bez zápisů. */
  nahled: boolean;
}

/** Komponenta widgetu, jak ji exportuje `components/widgety/oblasti/<oblast>.tsx`. */
export type KomponentaWidgetu = ComponentType<WidgetProps<any>>;

/** V klientu se k metadatům přidá líná komponenta. */
export type DefiniceWidgetuKlient = DefiniceWidgetu & { komponenta: LazyExoticComponent<KomponentaWidgetu> };

/** Pohled v navigaci role — stejný tvar jako navItems v layoutech. */
export interface PohledNavigace { id: string; label: string; icon: string }

/** Hodnota useNavigace() — poskytuje NavigaceKontext v layoutech (a od B9 v KioskApp). */
export interface Navigace {
  onNavigate: (pohled: string, arg?: string) => void;
  /** Smí divák na pohled? Odkaz na pohled bez práva se nekreslí. */
  smiPohled: (pohled: string) => boolean;
  pohledy: readonly PohledNavigace[];
}

/** useSmi(): přísné oprávnění `nacteno && ma(klic)` (pole = stačí kterékoli). */
export type Smi = (klic: string | readonly string[]) => boolean;
