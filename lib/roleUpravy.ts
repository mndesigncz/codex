// Úpravy přednastavených rolí podnikem — čistá část, bez databáze.
//
// Přednastavené role (Provozní, Barista, Kuchař…) žijí v kódu
// (lib/opravneniKatalog.ts) a platí stejně pro všechny podniky. Podnik si
// je ale chce doladit — „u nás Provozní smí i tohle" — a kopie do vlastní
// role by znamenala přeřadit všechny lidi a hlídat dvě role místo jedné.
// Proto si podnik smí uložit vlastní sadu oprávnění (a případně název
// a popis) k přednastavené roli; tabulka role_upravy, databázová část
// v lib/opravneniDb.ts. Bez úpravy platí sada z kódu beze změny.
//
// Dvě role upravit nejde:
//  - Majitel / Vedení — je to role vlastníka (roleClena mu dává klíč
//    „vedeni") a roleZTypu na ni mapuje každý dnešní účet vedení. Osekaná
//    by vzala práva lidem, kteří je před rolemi měli (invariant), a
//    vlastník se nesmí nikdy zamknout ani „omylem" přes roli.
//  - Tablet (kiosk) — kdo zná heslo tabletu, dostane všechno, co tablet
//    smí; jeho sadu drží bílá listina a kopie do vlastní role ji hlídá.
//    Jednodušší a bezpečnější je přednastavený tablet nechat, jak je.

import { systemovaRole, sZavislostmi, vycisti, smiUpravitRoli, smiBytVychozi, type SystemovaRole, type Volajici, type Verdikt } from './opravneni.ts';

/** Přednastavené role, které podnik upravit nesmí (viz hlavička). */
export const NEUPRAVITELNE_ROLE: ReadonlySet<string> = new Set(['vedeni', 'kiosk']);

/** Proč roli upravit nejde — pro server i editor, ať říkají totéž. */
export function procNeupravitelna(klic: string): string | null {
  if (klic === 'vedeni') return 'Roli Majitel / Vedení upravit nejde — vlastník podniku se nesmí přes roli nikdy zamknout. Zkopíruj ji do vlastní a uprav kopii.';
  if (klic === 'kiosk') return 'Přednastavenou roli tabletu upravit nejde — kdo zná heslo tabletu, dostane všechno, co tablet smí. Zkopíruj ji do vlastní role typu Tablet.';
  return null;
}

export const jeUpravitelnaSystemova = (klic: string | null | undefined): boolean =>
  !!klic && !!systemovaRole(klic) && !NEUPRAVITELNE_ROLE.has(klic);

/** Úprava přednastavené role, jak leží v role_upravy. */
export interface UpravaRole {
  klic: string;
  opravneni: string[];
  nazev: string | null;
  popis: string | null;
  verze: number;
}

/** Přednastavená role, jak platí v konkrétním podniku. */
export interface EfektivniRole extends SystemovaRole {
  /** Podnik má k roli vlastní úpravu. */
  upraveno: boolean;
  /** Sada z kódu — pro „Obnovit výchozí" a porovnání v editoru. */
  vychoziOpravneni: string[];
  vychoziNazev: string;
  vychoziPopis: string;
  upravitelna: boolean;
  /** Verze úpravy (0 = bez úpravy) — proti přepsání souběžné změny. */
  verze: number;
}

/** Surová hodnota JSONB z databáze → pole (Neon vrací pole, starší řádky řetězec). */
export function poleOpravneni(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') { try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; } }
  return [];
}

/**
 * Přednastavená role s úpravou podniku. Úprava role, kterou upravit nejde
 * (Vedení, Tablet), se IGNORUJE — i kdyby se do tabulky dostala jinudy,
 * vlastník a tablet se řídí jen kódem. Neznámé klíče z úpravy (katalog se
 * mezitím změnil) zmizí a závislosti se doplní, stejně jako u vlastní role.
 */
export function efektivniSystemova(r: SystemovaRole, uprava?: UpravaRole | null): EfektivniRole {
  const zaklad = {
    ...r, opravneni: [...r.opravneni],
    upraveno: false, vychoziOpravneni: [...r.opravneni], vychoziNazev: r.nazev, vychoziPopis: r.popis,
    upravitelna: jeUpravitelnaSystemova(r.klic), verze: 0,
  };
  if (!uprava || uprava.klic !== r.klic || !zaklad.upravitelna) return zaklad;
  return {
    ...zaklad,
    nazev: uprava.nazev?.trim() || r.nazev,
    popis: uprava.popis?.trim() || r.popis,
    opravneni: sZavislostmi(vycisti(uprava.opravneni)),
    upraveno: true,
    verze: uprava.verze || 1,
  };
}

/**
 * Smí volající uložit roli `klic` se sadou `nova` místo dnešní `soucasna`?
 * Stejná pravidla jako vlastní role (smiUpravitRoli): nedá víc, než sám má,
 * neosekne roli nadřízeného a nesáhne na roli, kterou sám drží. Navíc:
 *  - Vedení a Tablet upravit nejde vůbec (ani vlastník);
 *  - role, kterou podnik dává novým členům (výchozí), nesmí zcitlivět —
 *    dostane ji každý, kdo zná kód pro připojení. Barista je výchozí vždy,
 *    když podnik žádnou nenastavil, a zároveň je to náhradní role, kterou
 *    dostane nový člen, když výchozí pravidlům nevyhoví
 *    (app/api/teams/_role.ts) — proto platí pravidla výchozí role pro
 *    Baristu VŽDY, ne jen když je právě nastavená.
 * „Obnovit výchozí" je totéž se sadou z kódu: i návrat k výchozí sadě může
 * přidat práva, a ta musí volající mít.
 */
export function smiUpravitSystemovou(
  v: Volajici, klic: string, soucasna: Iterable<string>, nova: Iterable<string>,
  opts: { jeJehoRole?: boolean; jeVychozi?: boolean } = {},
): Verdikt {
  const r = systemovaRole(klic);
  if (!r) return { ok: false, chyba: 'Neznámá role.' };
  const proc = procNeupravitelna(klic);
  if (proc) return { ok: false, chyba: proc };
  const nove = [...nova];
  const verdikt = smiUpravitRoli(v, soucasna, nove, { jeJehoRole: opts.jeJehoRole, typ: r.typ });
  if (!verdikt.ok) return verdikt;
  if (opts.jeVychozi || klic === 'barista') {
    const vy = smiBytVychozi(nove);
    if (!vy.ok) {
      return {
        ok: false,
        chyba: klic === 'barista' && !opts.jeVychozi
          ? `Baristu dostane nový člen, kdykoli výchozí role nejde použít — a ${vy.proc}. Pro citlivější práva vytvoř vlastní roli.`
          : `Tohle je výchozí role pro nové členy a ${vy.proc}. Nejdřív nastav jinou výchozí roli.`,
      };
    }
  }
  return { ok: true };
}
