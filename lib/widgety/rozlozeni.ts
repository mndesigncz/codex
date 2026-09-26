// Rozložení stránek — čistá logika (kolo 68, spec §1.3–1.6).
//
// Stejné funkce běží na serveru (API /api/rozlozeni), v testech i v klientu,
// takže to, co server vrátí, a to, co klient nakreslí, se nemůže rozejít.
// Databáze tu není (ta je v rozlozeniDb.ts) a nejsou tu ani oprávnění
// z katalogu rolí — klient si tenhle soubor stahuje s první obrazovkou.
//
// Pořadí je vždycky stejné: vybrat rozložení (vyresRozlozeni) → normalizovat
// (normalizujRozlozeni) → profiltrovat pro diváka (filtrujViditelne). Při
// zápisu se k tomu vrací skryté položky (zachovejSkryte), aby výpadek tarifu
// nebo dočasně odebrané oprávnění nesmazalo widgety natrvalo.

// Importy na jeden řádek: scripts/check-test-imports.mjs víceřádkový import nevidí.
import type { BranaUprav, DefiniceStranky, DefiniceWidgetu, Divak, Kostra, OdpovedRozlozeni, PoleNastaveni, PolozkaRozlozeni, RadekRozlozeni, Rozhrani, Rozsah, Tarif, Velikost, ViditelnostDivaka, VychoziPolozka, VyreseneRozlozeni, Zdroj } from './typy.ts';
import { KATALOG_WIDGETU, widget } from './katalog/index.ts';
import { zDashboardConfig } from './migrace.ts';
import { TVAR_ID, idZWidgetu, nahradniId } from './hash.ts';
import { KLIC_POSLEDNIHO_ROZLOZENI, MAX_DELKA_TEXTU, MAX_INSTANCI, MAX_NASTAVENI_BAJTU, MAX_POLOZEK, MAX_POPISEK_ODKAZU, NASTROJ, PRAVIDLO_TRI, PRAVIDLO_TRI_PODIL } from './konstanty.ts';

/** Vyhledání definice widgetu — v testech jde podstrčit vlastní registr. */
export type Najdi = (id: string) => DefiniceWidgetu | undefined;

const jeObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Délka JSON v bajtech UTF-8 — limit nastavení je v bajtech, ne ve znacích. */
const bajtu = (v: unknown): number => new TextEncoder().encode(JSON.stringify(v)).length;

/** V `next dev` řekne, co normalizace zahodila; v produkci ani v testech nic nevypisuje. */
function varuj(zprava: string): void {
  // Přesně `process.env.NODE_ENV`: Next ho v klientu nahradí při sestavení.
  if (process.env.NODE_ENV === 'development') console.warn(`rozložení: ${zprava}`);
}

// ---------------------------------------------------------------------------
// Viditelnost (spec §1.5)
// ---------------------------------------------------------------------------

const PORADI_TARIFU: Record<Tarif, number> = { zdarma: 0, pro: 1, max: 2 };

/** Stačí tarif podniku na widget? Zdarma vždy, Pro s Pro i Max, Max jen s Max. */
export function staciTarif(potreba: Tarif, podnik: Tarif): boolean {
  return PORADI_TARIFU[podnik] >= PORADI_TARIFU[potreba];
}

/** Má divák oprávnění na widget (bez ohledu na tarif a stav)? */
export function maOpravneniNaWidget(w: DefiniceWidgetu, opravneni: ReadonlySet<string>): boolean {
  return w.opravneni.vse.every(k => opravneni.has(k))
    && (w.opravneni.nektere.length === 0 || w.opravneni.nektere.some(k => opravneni.has(k)));
}

/**
 * Smí divák widget vidět? Čistá funkce, stejná na serveru i v klientu.
 * Widget bez oprávnění neexistuje: server ho nevrátí, galerie ho nenabídne
 * a klient ho nepřipojí (spec §0.1, bod 3).
 */
export function jeViditelny(w: DefiniceWidgetu, d: ViditelnostDivaka): boolean {
  return w.stav === 'hotovo'
    && w.rozhrani.includes(d.typ)
    && staciTarif(w.tarif, d.tarif)
    && maOpravneniNaWidget(w, d.opravneni);
}

/** Smí divák položku rozložení vidět? Nástroj stránky vždy, neznámý widget nikdy. */
export function polozkaViditelna(p: PolozkaRozlozeni, d: ViditelnostDivaka, najdi: Najdi = widget): boolean {
  if (p.widget === NASTROJ) return true;
  const w = najdi(p.widget);
  return !!w && jeViditelny(w, d);
}

/** Jen položky, které divák smí vidět; nástroj stránky zůstává vždy. */
export function filtrujViditelne(polozky: readonly PolozkaRozlozeni[], d: ViditelnostDivaka, najdi: Najdi = widget): PolozkaRozlozeni[] {
  return polozky.filter(p => polozkaViditelna(p, d, najdi));
}

/** Viditelné widgety rozhraní stránky — z nich klient staví galerii. */
export function dostupneWidgety(stranka: DefiniceStranky, d: ViditelnostDivaka): string[] {
  return KATALOG_WIDGETU.filter(w => w.rozhrani.includes(stranka.rozhrani) && jeViditelny(w, d)).map(w => w.id);
}

/**
 * Widgety, na které by divák měl oprávnění, ale ne tarif. Ukazují se jen
 * tomu, kdo smí předplatné měnit (predplatne.spravovat) — ostatním by
 * nabídka „přejdi na Max" nebyla k ničemu.
 */
export function widgetySTarifem(stranka: DefiniceStranky, d: ViditelnostDivaka): { widget: string; tarif: Tarif }[] {
  if (!d.opravneni.has('predplatne.spravovat')) return [];
  return KATALOG_WIDGETU
    .filter(w => w.stav === 'hotovo' && w.rozhrani.includes(stranka.rozhrani) && w.rozhrani.includes(d.typ)
      && maOpravneniNaWidget(w, d.opravneni) && !staciTarif(w.tarif, d.tarif))
    .map(w => ({ widget: w.id, tarif: w.tarif }));
}

// ---------------------------------------------------------------------------
// Nastavení widgetu (spec §2.3)
// ---------------------------------------------------------------------------

const TVAR_IKONY = /^[a-zA-Z][a-zA-Z0-9]{0,23}$/;

function stejne(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Vyčistí nastavení instance podle schématu: jen známé klíče se správným
 * typem, čísla oříznutá do mezí, řetězce nejvýš 80 znaků, celý objekt
 * nejvýš 2 KB. Hodnota rovná výchozí se neukládá — změna výchozího v kódu
 * se tak propíše i lidem, kteří na pole nikdy nesáhli.
 */
export function vycistiNastaveni(schema: readonly PoleNastaveni[] | undefined, raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!schema || !jeObjekt(raw)) return out;
  for (const p of schema) {
    if (p.typ === 'odkaz') {
      // Odkaz vlastní tři klíče najednou (cíl, popisek, ikona); výchozí nemá.
      const cil = typeof raw.cil === 'string' ? raw.cil.trim().slice(0, MAX_DELKA_TEXTU) : '';
      const popisek = typeof raw.popisek === 'string' ? raw.popisek.trim().slice(0, MAX_POPISEK_ODKAZU) : '';
      if (cil) out.cil = cil;
      if (popisek) out.popisek = popisek;
      if (typeof raw.ikona === 'string' && TVAR_IKONY.test(raw.ikona)) out.ikona = raw.ikona;
      continue;
    }
    const v = raw[p.klic];
    if (v === undefined) continue;
    let hodnota: unknown = undefined;
    switch (p.typ) {
      case 'vyber':
        if (typeof v === 'string' && p.moznosti.some(m => m.id === v)) hodnota = v;
        break;
      case 'vicevyber': {
        const ids = p.moznosti.map(m => m.id);
        if (v === 'vse') { hodnota = 'vse'; break; }
        if (!Array.isArray(v)) break;
        const vybrane = ids.filter(id => v.includes(id));
        // „Všechno" uložené jako výčet se rovná výchozímu 'vse' a neukládá se.
        hodnota = p.vychozi === 'vse' && vybrane.length === ids.length ? 'vse' : vybrane;
        break;
      }
      case 'cislo': {
        const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
        if (!Number.isFinite(n)) break;
        let x = Math.min(p.max, Math.max(p.min, n));
        if (p.krok && p.krok > 0) x = Math.min(p.max, Math.max(p.min, p.min + Math.round((x - p.min) / p.krok) * p.krok));
        hodnota = x;
        break;
      }
      case 'prepinac':
        if (typeof v === 'boolean') hodnota = v;
        break;
      case 'text':
        if (typeof v === 'string') hodnota = v.trim().slice(0, Math.min(p.maxDelka, MAX_DELKA_TEXTU));
        break;
      case 'zdroj':
        if (v === null) hodnota = null;
        else if (typeof v === 'number' && Number.isFinite(v)) hodnota = v;
        else if (typeof v === 'string' && v.trim()) hodnota = v.trim().slice(0, MAX_DELKA_TEXTU);
        break;
    }
    if (hodnota === undefined || stejne(hodnota, p.vychozi)) continue;
    out[p.klic] = hodnota;
  }
  // Pojistka proti přerostlému nastavení: odebírá od konce, dokud se nevejde.
  const klice = Object.keys(out);
  while (klice.length && bajtu(out) > MAX_NASTAVENI_BAJTU) delete out[klice.pop()!];
  return out;
}

/**
 * Nastavení pro komponentu: uložené hodnoty doplněné výchozími. `vse`
 * u vícenásobného výběru se rozvine na všechny možnosti — widget pak jen
 * ignoruje ty, na které divák nemá oprávnění.
 */
export function sNastavenimVychozimi(schema: readonly PoleNastaveni[] | undefined, nastaveni: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const n = nastaveni ?? {};
  for (const p of schema ?? []) {
    if (p.typ === 'odkaz') {
      for (const k of ['cil', 'popisek', 'ikona']) if (n[k] !== undefined) out[k] = n[k];
      continue;
    }
    const v = n[p.klic] !== undefined ? n[p.klic] : p.vychozi;
    out[p.klic] = p.typ === 'vicevyber' && v === 'vse' ? p.moznosti.map(m => m.id) : v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Normalizace (spec §1.4)
// ---------------------------------------------------------------------------

/** Výchozí položky z kódu → položky rozložení se stálými id (sklad-dochazi, sklad-dochazi-2). */
export function zVychozich(seznam: readonly VychoziPolozka[], najdi: Najdi = widget): PolozkaRozlozeni[] {
  const pocty = new Map<string, number>();
  return seznam.map(p => {
    const n = (pocty.get(p.w) ?? 0) + 1;
    pocty.set(p.w, n);
    const velikost = p.w === NASTROJ ? 'L' : p.s ?? najdi(p.w)?.vychoziVelikost ?? 'M';
    return { id: idZWidgetu(p.w, n), widget: p.w, velikost, ...(p.o ? { nastaveni: { ...p.o } } : {}) };
  });
}

/** Výchozí seznam typu rozhraní stránky — z něj se berou pozice povinných položek. */
const vychoziTypu = (stranka: DefiniceStranky): readonly VychoziPolozka[] => stranka.vychozi[`typ:${stranka.rozhrani}`] ?? [];

/**
 * Normalizace rozložení. Stejná funkce běží při čtení, při zápisu i nad
 * výchozími z kódu, takže do databáze ani ke klientovi nedojde nic, co by
 * plocha neuměla nakreslit:
 *  - vstup, který není pole, je prázdné rozložení;
 *  - neznámý widget, widget jiného rozhraní a plánovaný widget se zahodí;
 *  - chybné nebo opakované id dostane nové, špatná velikost výchozí;
 *  - widget bez `vicekrat` smí být jednou, s ním nejvýš `maxInstanci`;
 *  - nástroj stránky je právě jednou (na stránce bez nástroje nikdy),
 *    povinné položky vždy — chybějící se vloží na pozici z výchozího;
 *  - nejvýš 40 položek (povinné se nevyhazují).
 */
export function normalizujRozlozeni(stranka: DefiniceStranky, polozky: unknown, najdi: Najdi = widget): PolozkaRozlozeni[] {
  // Pojistka proti obřímu poli: víc než pětinásobek limitu nemá smysl ani číst.
  const vstup: unknown[] = Array.isArray(polozky) ? polozky.slice(0, MAX_POLOZEK * 5) : [];
  const out: PolozkaRozlozeni[] = [];
  const ids = new Set<string>();
  const pocty = new Map<string, number>();
  const povinne = new Set<string>();
  const idPro = (raw: unknown, w: string, i: number): string => {
    const id = typeof raw === 'string' && TVAR_ID.test(raw) && !ids.has(raw) ? raw : nahradniId(w, i, ids);
    ids.add(id);
    return id;
  };

  vstup.forEach((raw, i) => {
    if (!jeObjekt(raw)) return;
    const w = typeof raw.widget === 'string' ? raw.widget : '';
    if (w === NASTROJ) {
      if (!stranka.nastroj) { varuj(`${stranka.id} nemá nástroj`); return; }
      if (pocty.has(NASTROJ)) return;
      pocty.set(NASTROJ, 1);
      povinne.add(NASTROJ);
      out.push({ id: idPro(raw.id, w, i), widget: NASTROJ, velikost: 'L' });
      return;
    }
    const def = najdi(w);
    if (!def || !def.rozhrani.includes(stranka.rozhrani) || def.stav !== 'hotovo') {
      varuj(`${stranka.id}: zahozen widget ${JSON.stringify(w)} (${!def ? 'neznámý' : def.stav !== 'hotovo' ? 'plánovaný' : 'jiné rozhraní'})`);
      return;
    }
    const n = pocty.get(w) ?? 0;
    const strop = def.vicekrat ? (def.maxInstanci ?? MAX_INSTANCI) : 1;
    if (n >= strop) return;
    pocty.set(w, n + 1);
    if (def.povinny) povinne.add(w);
    const velikost = typeof raw.velikost === 'string' && (def.velikosti as readonly string[]).includes(raw.velikost) ? (raw.velikost as Velikost) : def.vychoziVelikost;
    const nastaveni = vycistiNastaveni(def.nastaveni, raw.nastaveni);
    out.push({ id: idPro(raw.id, w, i), widget: w, velikost, ...(Object.keys(nastaveni).length ? { nastaveni } : {}) });
  });

  // Povinné položky, které chybí: nástroj a widgety s `povinny` z výchozího
  // rozložení. Vloží se na svou pozici z výchozího (jinak na konec), aby se
  // nástroj po poškozeném zápisu neobjevil někde uprostřed.
  const vychozi = vychoziTypu(stranka);
  const chybi: { w: string; pozice: number }[] = [];
  if (stranka.nastroj && !pocty.has(NASTROJ)) {
    const i = vychozi.findIndex(p => p.w === NASTROJ);
    chybi.push({ w: NASTROJ, pozice: i < 0 ? Infinity : i });
  }
  vychozi.forEach((p, i) => {
    const def = najdi(p.w);
    if (def?.povinny && def.stav === 'hotovo' && def.rozhrani.includes(stranka.rozhrani) && !pocty.has(p.w)) {
      pocty.set(p.w, 1);
      chybi.push({ w: p.w, pozice: i });
    }
  });
  for (const c of chybi.sort((a, b) => a.pozice - b.pozice)) {
    const def = najdi(c.w);
    const polozka: PolozkaRozlozeni = {
      id: idPro(idZWidgetu(c.w), c.w, out.length),
      widget: c.w,
      velikost: c.w === NASTROJ ? 'L' : def!.vychoziVelikost,
    };
    povinne.add(c.w);
    out.splice(Math.min(c.pozice, out.length), 0, polozka);
  }

  // Limit: přebytek od konce, povinné položky zůstávají.
  for (let i = out.length - 1; out.length > MAX_POLOZEK && i >= 0; i--) {
    if (!povinne.has(out[i].widget)) out.splice(i, 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Vyhodnocení (spec §1.3)
// ---------------------------------------------------------------------------

/** Rozsahy výchozích podniku, které na diváka dopadají, od nejkonkrétnějšího. */
export function rozsahyDivaka(d: Pick<Divak, 'typ' | 'klic' | 'roleId'>): Rozsah[] {
  const out: Rozsah[] = [];
  if (d.roleId != null) out.push(`role:#${d.roleId}`);
  if (d.klic) out.push(`role:${d.klic}`);
  out.push(`typ:${d.typ}`);
  return out;
}

/** Výchozí podniku pro diváka: první existující z role:#id, role:klíč, typ:typ. */
export function vychoziProDivaka(radky: readonly RadekRozlozeni[], d: Pick<Divak, 'typ' | 'klic' | 'roleId'>): RadekRozlozeni | null {
  for (const r of rozsahyDivaka(d)) {
    const radek = radky.find(x => x.rozsah === r);
    if (radek) return radek;
  }
  return null;
}

/**
 * Výchozí z kódu pro diváka: pro jeho systémovou roli (u vlastní role pro
 * tu, ze které vznikla), ale jen když z něj divák opravdu něco uvidí —
 * aspoň tři widgety A aspoň polovinu položek výchozího role (plánované,
 * bez oprávnění a bez tarifu se počítají jako neviditelné). Jinak výchozí
 * pro typ role. Účetní a Skladník mají v kole 68 výchozí postavené hlavně
 * na widgetech z kola 69: samotná trojka nestačila, Skladník s tarifem Max
 * by dostal tři widgety z deseti a s Pro celé výchozí vedení (vyšší tarif
 * = chudší plocha).
 */
export function vychoziZKodu(stranka: DefiniceStranky, d: Pick<Divak, 'typ' | 'klic' | 'zdrojRole' | 'opravneni' | 'tarif'>, najdi: Najdi = widget): PolozkaRozlozeni[] {
  const role = d.klic ?? d.zdrojRole;
  const proRoli = role ? stranka.vychozi[`role:${role}`] : undefined;
  if (proRoli) {
    const polozky = normalizujRozlozeni(stranka, zVychozich(proRoli, najdi), najdi);
    const viditelnych = filtrujViditelne(polozky, d, najdi).filter(p => p.widget !== NASTROJ).length;
    const celkem = proRoli.filter(p => p.w !== NASTROJ).length;
    if (viditelnych >= PRAVIDLO_TRI && viditelnych >= celkem * PRAVIDLO_TRI_PODIL) return polozky;
  }
  return normalizujRozlozeni(stranka, zVychozich(vychoziTypu(stranka), najdi), najdi);
}

export interface VstupRozlozeni {
  stranka: DefiniceStranky;
  divak: Divak;
  /** Osobní řádek diváka (rozsah osobni:<id>), nebo null. */
  osobni: RadekRozlozeni | null;
  /** Řádky výchozích podniku pro stránku (rozsahy typ:… a role:…). */
  vychozi: readonly RadekRozlozeni[];
  /** Starý teams.dashboard_config (jen pro dvě stránky, dokud nemá migrovano68). */
  dashboardConfig?: unknown;
}

/**
 * Které rozložení divák vidí (spec §1.3):
 *  1. výchozí podniku pro diváka (role:#id → role:klíč → typ:typ);
 *  2. zamčené výchozí platí pro každého kromě správce — osobní řádek se
 *     přitom nemaže, po odemčení se vrátí;
 *  3. jinak osobní rozložení;
 *  4. jinak výchozí podniku;
 *  5. jinak starý dashboard_config (jen Přehled a Domů, před migrací);
 *  6. jinak výchozí z kódu (s pravidlem tří pro roli).
 * Výsledek je normalizovaný a `polozky` profiltrované pro diváka.
 */
export function vyresRozlozeni(v: VstupRozlozeni, najdi: Najdi = widget): VyreseneRozlozeni {
  const { stranka, divak: d } = v;
  const vychozi = vychoziProDivaka(v.vychozi, d);
  // Starý config se převádí až tam, kde je potřeba (krok 5, případně rozsah
  // u osobního řádku bez výchozího podniku), a jen část téhle stránky.
  // zDashboardConfig nevyhazuje, takže rozbitý config znamená výchozí
  // z kódu — ne 503 pro všechny, kdo mají osobní řádek nebo výchozí podniku.
  const staryConfig = () => zDashboardConfig(v.dashboardConfig, { stranka: stranka.id })[0] ?? null;
  let zaklad: unknown;
  let zdroj: Zdroj;
  let rozsah: Rozsah | null;
  if (vychozi?.zamceno && !d.jeSpravce) {
    zaklad = vychozi.polozky; zdroj = 'podnik'; rozsah = vychozi.rozsah as Rozsah;
  } else if (v.osobni) {
    zaklad = v.osobni.polozky; zdroj = 'osobni';
    rozsah = (vychozi?.rozsah as Rozsah | undefined) ?? staryConfig()?.[1] ?? null;
  } else if (vychozi) {
    zaklad = vychozi.polozky; zdroj = 'podnik'; rozsah = vychozi.rozsah as Rozsah;
  } else {
    const stary = staryConfig();
    if (stary) { zaklad = stary[2]; zdroj = 'podnik'; rozsah = stary[1]; }
    else { zaklad = vychoziZKodu(stranka, d, najdi); zdroj = 'aplikace'; rozsah = null; }
  }
  const nefiltrovane = normalizujRozlozeni(stranka, zaklad, najdi);
  return {
    polozky: filtrujViditelne(nefiltrovane, d, najdi),
    nefiltrovane,
    zdroj,
    rozsah,
    zamceno: !!vychozi?.zamceno,
    verze: v.osobni ? v.osobni.verze : 0,
    vychozi,
  };
}

// ---------------------------------------------------------------------------
// Zápis (spec §1.5, §1.6)
// ---------------------------------------------------------------------------

/**
 * Vrátí do nového pořadí položky, které divák nevidí (oprávnění, tarif).
 * Každá skrytá položka z uloženého rozložení se vloží za svého posledního
 * viditelného předchůdce v novém pořadí, a když žádného nemá, na začátek.
 * Bez toho by stačilo jednou přeskládat plochu během výpadku tarifu Pro
 * a všechny widgety Pro by zmizely natrvalo. Plánované ani neznámé widgety
 * v `ulozene` nejsou — normalizace je zahodila už při čtení.
 */
export function zachovejSkryte(
  ulozene: readonly PolozkaRozlozeni[],
  nove: readonly PolozkaRozlozeni[],
  viditelna: (p: PolozkaRozlozeni) => boolean,
): PolozkaRozlozeni[] {
  const vNovem = new Set(nove.map(p => p.id));
  const zaKotvou = new Map<string | null, PolozkaRozlozeni[]>();
  let kotva: string | null = null;
  for (const p of ulozene) {
    if (viditelna(p)) {
      if (vNovem.has(p.id)) kotva = p.id;
      continue;
    }
    if (vNovem.has(p.id)) continue;
    const seznam = zaKotvou.get(kotva) ?? [];
    seznam.push(p);
    zaKotvou.set(kotva, seznam);
  }
  if (!zaKotvou.size) return [...nove];
  const out: PolozkaRozlozeni[] = [...(zaKotvou.get(null) ?? [])];
  for (const p of nove) {
    out.push(p);
    const za = zaKotvou.get(p.id);
    if (za) out.push(...za);
  }
  return out;
}

/**
 * Celý zápis: normalizace nového rozložení, návrat skrytých položek
 * a znovu normalizace (vrácené položky mohou narazit na limity).
 */
export function slozZapis(
  stranka: DefiniceStranky,
  nove: unknown,
  ulozene: readonly PolozkaRozlozeni[],
  viditelna: (p: PolozkaRozlozeni) => boolean,
  najdi: Najdi = widget,
): PolozkaRozlozeni[] {
  const cista = normalizujRozlozeni(stranka, nove, najdi);
  return normalizujRozlozeni(stranka, zachovejSkryte(ulozene, cista, viditelna), najdi);
}

/**
 * Zápis výchozího podniku (PUT /api/rozlozeni/vychozi). Stejně jako osobní
 * zápis vrací položky, které správce sám nevidí: „Uložit jako výchozí"
 * z plochy posílá jen to, co na své profiltrované ploše vidí, a bez toho by
 * delegovaný správce bez finance.trzby (nebo vlastník během výpadku tarifu
 * Max) smazal všem Pokladnu a widgety Max natrvalo. `ulozene` je uložený
 * řádek rozsahu, bez něj výchozí z kódu pro rozsah.
 *
 * `odebrane` jsou id, která správce odebral vědomě. Editor v Nastavení →
 * Stránky ukazuje výchozí nefiltrované, takže správce v něm odebere i widget,
 * který sám nevidí — ten musí editor vyjmenovat, jinak by se vrátil.
 */
export function slozZapisVychoziho(
  stranka: DefiniceStranky,
  nove: unknown,
  ulozene: readonly PolozkaRozlozeni[],
  spravce: ViditelnostDivaka,
  odebrane: ReadonlySet<string>,
  najdi: Najdi = widget,
): PolozkaRozlozeni[] {
  // Vědomě odebraná položka se tváří jako viditelná: zachovejSkryte bere
  // viditelnou položku, která v novém pořadí chybí, jako odebranou.
  return slozZapis(stranka, nove, ulozene, p => odebrane.has(p.id) || polozkaViditelna(p, spravce, najdi), najdi);
}

/** Správce výchozích: podnik.nastaveni, u stránek tabletu stačí i kiosk.spravovat. */
export function jeSpravceStranky(opravneni: ReadonlySet<string>, stranka: Pick<DefiniceStranky, 'rozhrani'>): boolean {
  return opravneni.has('podnik.nastaveni') || (stranka.rozhrani === 'kiosk' && opravneni.has('kiosk.spravovat'));
}

/**
 * Smí divák měnit svoje rozložení stránky? Tablet ne (sdílené zařízení
 * skládá vedení v Nastavení → Stránky), při zamčeném výchozím jen správce.
 */
export function smiUpravitRozlozeni(d: Pick<Divak, 'typ' | 'jeSpravce'>, vychozi: Pick<RadekRozlozeni, 'zamceno'> | null | undefined): BranaUprav {
  if (d.typ === 'kiosk') return { ok: false, chyba: 'Tablet si rozložení neupravuje — nastavuje ho vedení v Nastavení → Stránky.' };
  if (vychozi?.zamceno && !d.jeSpravce) return { ok: false, chyba: 'Rozložení téhle stránky nastavuje vedení.', zamceno: true };
  return { ok: true };
}

/** Tvar odpovědi GET /api/rozlozeni (a `aktualni` u 409). */
export function tvarOdpovedi(stranka: DefiniceStranky, d: Divak, v: VyreseneRozlozeni): OdpovedRozlozeni {
  return {
    stranka: stranka.id,
    polozky: v.polozky,
    dostupne: dostupneWidgety(stranka, d),
    tarifem: widgetySTarifem(stranka, d),
    zdroj: v.zdroj,
    rozsah: v.rozsah,
    zamceno: v.zamceno,
    smiUpravit: smiUpravitRozlozeni(d, v.vychozi).ok,
    smiVychozi: d.jeSpravce,
    verze: v.verze,
  };
}

// ---------------------------------------------------------------------------
// Rozsahy a drobnosti
// ---------------------------------------------------------------------------

export type RozebranyRozsah =
  | { druh: 'osobni'; userId: number }
  | { druh: 'typ'; typ: Rozhrani }
  | { druh: 'role'; klic: string }
  | { druh: 'vlastni'; roleId: number };

/** Rozsah z řetězce (query string, řádek DB), nebo null, když nedává smysl. */
export function rozeberRozsah(s: unknown): RozebranyRozsah | null {
  if (typeof s !== 'string' || s.length > 60) return null;
  let m = /^osobni:([1-9]\d{0,9})$/.exec(s);
  if (m) return { druh: 'osobni', userId: Number(m[1]) };
  m = /^typ:(vedeni|zamestnanec|kiosk)$/.exec(s);
  if (m) return { druh: 'typ', typ: m[1] as Rozhrani };
  m = /^role:#([1-9]\d{0,9})$/.exec(s);
  if (m) return { druh: 'vlastni', roleId: Number(m[1]) };
  m = /^role:([a-z][a-z0-9_]{0,39})$/.exec(s);
  if (m) return { druh: 'role', klic: m[1] };
  return null;
}

/** Přesun položky v poli (klávesnice, tah, „Posunout výš/níž"). */
export function presun<T>(pole: readonly T[], z: number, na: number): T[] {
  const out = [...pole];
  if (z < 0 || z >= out.length) return out;
  const cil = Math.max(0, Math.min(out.length - 1, na));
  const [x] = out.splice(z, 1);
  out.splice(cil, 0, x);
  return out;
}

/** Tvar kostry widgetu při načítání: z definice, jinak S = číslo, M a L = seznam. */
export function kostraWidgetu(w: Pick<DefiniceWidgetu, 'kostra'> | undefined, velikost: Velikost): Kostra {
  return w?.kostra?.[velikost] ?? (velikost === 'S' ? 'cislo' : 'seznam');
}

/**
 * Která instance dostane inkoustovou plochu (DP §2.10): první widget peněz
 * (`muzeInkoust`) ve velikosti M nebo L, a jen na stránce s `inkoust`.
 * Inkoust je na ploše nejvýš jeden — ostatní widgety zůstávají bílé.
 */
export function inkoustovaInstance(stranka: Pick<DefiniceStranky, 'inkoust'>, polozky: readonly PolozkaRozlozeni[], najdi: Najdi = widget): string | null {
  if (!stranka.inkoust) return null;
  const p = polozky.find(x => x.velikost !== 'S' && !!najdi(x.widget)?.muzeInkoust);
  return p ? p.id : null;
}

/** Klíč posledního známého rozložení v localStorage (kostry do příchodu GET). */
export const klicPoslednihoRozlozeni = (teamId: number | string, stranka: string): string =>
  `${KLIC_POSLEDNIHO_ROZLOZENI}:${teamId}:${stranka}`;
