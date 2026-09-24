// Role a oprávnění (kolo 67) — čistá část, bez databáze.
//
// Dřív měl podnik tři pevné role: vedení smělo všechno, zaměstnanec skoro
// nic, tablet něco mezi. Teď má každý člen ROLI a role je sada oprávnění
// z katalogu (lib/opravneniKatalog.ts). Přednastavené role jsou v kódu,
// vlastní role si podnik skládá v Nastavení.
//
// Dvě věci role NEurčuje:
//  - typ účtu (vedení / zaměstnanec / kiosk) — ten říká, které rozhraní se
//    otevře a koho se týká rozvrh a žebříček; nese ho role, ale oprávnění
//    z něj neplynou;
//  - vlastnictví podniku a organizace — vlastník má vždy všechno a jeho
//    práva nejdou vzít úpravou role.
//
// Databázová část je v lib/opravneniDb.ts, tady je jen logika, kterou jde
// testovat v `npm test`: závislosti, podmnožiny a pravidla proti tomu, aby
// si kdo přes role přidal víc, než sám má.

import { KATALOG, SYSTEMOVE_ROLE } from './opravneniKatalog.ts';

export type Citlivost = 'nízká' | 'střední' | 'vysoká';
export type TypRole = 'vedeni' | 'zamestnanec' | 'kiosk';

export interface Opravneni {
  id: string;
  oblast: string;
  nazev: string;
  popis: string;
  citlivost: Citlivost | string;
  vyzaduje: string[];
}

export interface SystemovaRole {
  klic: string;
  nazev: string;
  popis: string;
  typ: TypRole;
  opravneni: string[];
}

export { KATALOG, SYSTEMOVE_ROLE };

const PODLE_ID = new Map(KATALOG.map(o => [o.id, o]));
export const jeOpravneni = (id: unknown): id is string => typeof id === 'string' && PODLE_ID.has(id);
export const opravneni = (id: string): Opravneni | undefined => PODLE_ID.get(id);
export const VSECHNA: string[] = KATALOG.map(o => o.id);

/** Oblasti v pořadí, jak je katalog uvádí — pro editor rolí. */
export const OBLASTI: string[] = [...new Set(KATALOG.map(o => o.oblast))];

/**
 * Tablet smí dostat jen tohle. Kdo spravuje účet tabletu, se za tablet umí
 * přihlásit — role kiosku proto nesmí nést nic, co by tím obešlo jiné role
 * (finance, tým, nastavení).
 */
export const KIOSK_BILA_LISTINA: ReadonlySet<string> = new Set([
  'dochazka.tablet', 'uzaverky.vytvorit', 'uzaverky.za_jineho', 'uzaverky.predavka',
  'ukoly.zobrazit_tym', 'ukoly.plnit', 'postupy.zobrazit', 'postupy.spoustet',
  'sklad.zobrazit', 'sklad.zapsat_stav', 'sklad.navrhnout', 'sklad.hlasit', 'inventura.pocitat',
  'vyroba.vyrabet', 'navody.zobrazit', 'chat.pouzivat', 'objednavky.zobrazit', 'objednavky.vyridit',
  'rezervace.zobrazit', 'rezervace.usadit', 'vernost.karta', 'vernost.body_z_castky', 'vernost.platba_kreditem',
  'kupony.uplatnit', 'menu.vyprodano', 'akce.zobrazit', 'akce.checklist', 'odmeny.zebricek', 'rozvrh.nahled',
]);

/** Klíče, které nesmí nést výchozí role (tu dostane každý, kdo zná kód pro připojení). */
export function smiBytVychozi(sada: Iterable<string>): { ok: boolean; proc?: string } {
  // Co má dnes každý nový člen (systémová role Barista), výchozí role mít
  // smí — i věrnostní platby, které katalog vede jako citlivé.
  const zakladni = new Set(systemovaRole('barista')?.opravneni ?? []);
  for (const id of sada) {
    const o = PODLE_ID.get(id);
    if (!o || zakladni.has(id)) continue;
    if (o.citlivost === 'vysoká') return { ok: false, proc: `„${o.nazev}" je citlivé oprávnění` };
    if (id.startsWith('tym.') && id !== 'tym.zobrazit') return { ok: false, proc: `„${o.nazev}" patří vedení týmu` };
  }
  return { ok: true };
}

/** Jen známé klíče, bez duplicit. Neznámé (starý klíč, překlep z klienta) se zahodí. */
export function vycisti(sada: Iterable<unknown>): string[] {
  return [...new Set([...sada].filter(jeOpravneni))].sort();
}

/**
 * Doplní závislosti: „upravit sklad" bez „vidět sklad" nedává smysl, a
 * server kontroluje přímo požadovaný klíč — takže se závislosti ukládají.
 */
export function sZavislostmi(sada: Iterable<string>): string[] {
  const out = new Set<string>();
  const pridej = (id: string) => {
    if (out.has(id) || !PODLE_ID.has(id)) return;
    out.add(id);
    for (const z of PODLE_ID.get(id)!.vyzaduje) pridej(z);
  };
  for (const id of sada) pridej(id);
  return [...out].sort();
}

/** Po vypnutí klíče vypne i to, co na něm stojí (opak sZavislostmi). */
export function bezZavislych(sada: Iterable<string>, vypnout: string): string[] {
  const out = new Set(sada);
  out.delete(vypnout);
  let zmena = true;
  while (zmena) {
    zmena = false;
    for (const id of [...out]) {
      if (PODLE_ID.get(id)?.vyzaduje.some(z => !out.has(z))) { out.delete(id); zmena = true; }
    }
  }
  return [...out].sort();
}

/** Co má `a` navíc proti `b`. */
export function navic(a: Iterable<string>, b: Iterable<string>): string[] {
  const bb = new Set(b);
  return [...new Set(a)].filter(x => !bb.has(x)).sort();
}

export const jePodmnozinou = (a: Iterable<string>, b: Iterable<string>) => navic(a, b).length === 0;

/** Kontext volajícího pro pravidla proti eskalaci. */
export interface Volajici {
  jeVlastnik: boolean;
  opravneni: Iterable<string>;
}

export type Verdikt = { ok: true } | { ok: false; chyba: string };
const ne = (chyba: string): Verdikt => ({ ok: false, chyba });
const ano: Verdikt = { ok: true };

function vyjmenuj(ids: string[]): string {
  const nazvy = ids.slice(0, 3).map(id => `„${PODLE_ID.get(id)?.nazev ?? id}"`);
  return nazvy.join(', ') + (ids.length > 3 ? ` a další ${ids.length - 3}` : '');
}

/**
 * Smí volající vytvořit nebo upravit roli ze sady `puvodni` na `nova`?
 * Obě musí být podmnožinou jeho práv: jinak by šlo osekat roli nadřízeného
 * (a tím ho sesadit) nebo si do role, kterou pak někomu dá, přidat víc.
 * Vlastní přiřazenou roli upravit nesmí — to by byla samoeskalace.
 */
export function smiUpravitRoli(v: Volajici, puvodni: Iterable<string>, nova: Iterable<string>, opts: { jeJehoRole?: boolean; typ?: TypRole } = {}): Verdikt {
  const nove = [...nova];
  if (opts.typ === 'kiosk') {
    const mimo = nove.filter(id => !KIOSK_BILA_LISTINA.has(id));
    if (mimo.length) return ne(`Tablet nesmí mít ${vyjmenuj(mimo)}.`);
  }
  if (v.jeVlastnik) return ano;
  if (opts.jeJehoRole) return ne('Vlastní roli si upravit nemůžeš — požádej o to někoho, kdo ji nemá.');
  const mimoNove = navic(nove, v.opravneni);
  if (mimoNove.length) return ne(`Roli nemůžeš dát oprávnění, která sám nemáš: ${vyjmenuj(mimoNove)}.`);
  const mimoPuvodni = navic(puvodni, v.opravneni);
  if (mimoPuvodni.length) return ne(`Tahle role má oprávnění, která ty nemáš (${vyjmenuj(mimoPuvodni)}) — upravit ji může jen někdo s nimi.`);
  return ano;
}

/**
 * Smí volající dát členovi roli `nova` místo `soucasna`? Nikdo nesmí
 * přidělit víc, než sám má, ani sáhnout na člena, který má víc než on.
 * Vedení (systémová role) mění jen vlastník — dva vedoucí se stejnou
 * sadou by se jinak mohli navzájem sesadit.
 */
export function smiPriraditRoli(v: Volajici, cil: { jeVlastnik: boolean; jeTo: boolean; soucasna: Iterable<string>; soucasnaKlic?: string | null }, nova: { opravneni: Iterable<string>; klic?: string | null }): Verdikt {
  if (cil.jeVlastnik) return ne('Vlastníkovi podniku roli změnit nejde.');
  if (v.jeVlastnik) return ano;
  if (cil.jeTo) return ne('Svou vlastní roli si změnit nemůžeš.');
  if (cil.soucasnaKlic === 'vedeni' || nova.klic === 'vedeni') return ne('Roli Vedení dává a bere jen vlastník podniku.');
  const mimoCil = navic(cil.soucasna, v.opravneni);
  if (mimoCil.length) return ne('Tenhle člověk má oprávnění, která ty nemáš — jeho roli změní jen někdo nad ním.');
  const mimoNova = navic(nova.opravneni, v.opravneni);
  if (mimoNova.length) return ne(`Nemůžeš přidělit roli s oprávněními, která sám nemáš: ${vyjmenuj(mimoNova)}.`);
  return ano;
}

/** Smí volající upravit nebo odebrat člena? Stejná logika jako u role, bez nové sady. */
export function smiSpravovatClena(v: Volajici, cil: { jeVlastnik: boolean; jeTo: boolean; soucasna: Iterable<string>; soucasnaKlic?: string | null }): Verdikt {
  if (cil.jeVlastnik) return ne('Vlastníka podniku upravit ani odebrat nejde.');
  if (v.jeVlastnik) return ano;
  if (cil.soucasnaKlic === 'vedeni') return ne('Člověka s rolí Vedení upravuje jen vlastník podniku.');
  if (navic(cil.soucasna, v.opravneni).length) return ne('Tenhle člověk má oprávnění, která ty nemáš.');
  return ano;
}

/** Systémová role podle klíče. */
export const systemovaRole = (klic: string | null | undefined) => SYSTEMOVE_ROLE.find(r => r.klic === klic) ?? null;

/** Dnešní pevná role → systémová role (migrace kola 67). */
export function roleZTypu(typ: string | null | undefined): SystemovaRole {
  if (typ === 'employer') return systemovaRole('vedeni')!;
  if (typ === 'kiosk') return systemovaRole('kiosk')!;
  return systemovaRole('barista')!;
}

/** Typ role → hodnota v team_members.role (typ účtu, jak ho zná zbytek aplikace). */
export const typNaUcet = (t: TypRole): 'employer' | 'employee' | 'kiosk' => (t === 'vedeni' ? 'employer' : t === 'kiosk' ? 'kiosk' : 'employee');
