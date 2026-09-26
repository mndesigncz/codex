// Registr stránek s plochou (kolo 68, spec §2.4).
//
// Kolo 68 založilo soubory všech 36 stránek a aktivní má dvě (Přehled
// vedení a Domů zaměstnance). Balík kola 69 zapíná a ladí jen svoje
// stránky ve vlastních souborech — tenhle index se po kole 68 už nemění.
// Chat, Nastavení, hostovská část a správa platformy plochu nemají (O12).

import type { DefiniceStranky, IdStranky, Rozhrani } from '../typy.ts';
import { STRANKA as vedeniPrehled } from './vedeni.prehled.ts';
import { STRANKA as zamestnanecDomu } from './zamestnanec.domu.ts';
import { STRANKA as vedeniRozvrh } from './vedeni.rozvrh.ts';
import { STRANKA as vedeniMojeSmeny } from './vedeni.moje_smeny.ts';
import { STRANKA as zamestnanecMojeSmeny } from './zamestnanec.moje_smeny.ts';
import { STRANKA as zamestnanecDostupnost } from './zamestnanec.dostupnost.ts';
import { STRANKA as vedeniDochazka } from './vedeni.dochazka.ts';
import { STRANKA as vedeniTym } from './vedeni.tym.ts';
import { STRANKA as vedeniSklad } from './vedeni.sklad.ts';
import { STRANKA as zamestnanecSklad } from './zamestnanec.sklad.ts';
import { STRANKA as vedeniReceptury } from './vedeni.receptury.ts';
import { STRANKA as vedeniMenu } from './vedeni.menu.ts';
import { STRANKA as vedeniUzaverky } from './vedeni.uzaverky.ts';
import { STRANKA as zamestnanecUzaverka } from './zamestnanec.uzaverka.ts';
import { STRANKA as vedeniFinance } from './vedeni.finance.ts';
import { STRANKA as vedeniTogo } from './vedeni.togo.ts';
import { STRANKA as vedeniVsechnyPodniky } from './vedeni.vsechny_podniky.ts';
import { STRANKA as vedeniUkoly } from './vedeni.ukoly.ts';
import { STRANKA as zamestnanecUkoly } from './zamestnanec.ukoly.ts';
import { STRANKA as vedeniPlanovani } from './vedeni.planovani.ts';
import { STRANKA as vedeniNapady } from './vedeni.napady.ts';
import { STRANKA as zamestnanecNapady } from './zamestnanec.napady.ts';
import { STRANKA as vedeniPostupy } from './vedeni.postupy.ts';
import { STRANKA as zamestnanecPostupy } from './zamestnanec.postupy.ts';
import { STRANKA as vedeniNavody } from './vedeni.navody.ts';
import { STRANKA as zamestnanecNavody } from './zamestnanec.navody.ts';
import { STRANKA as vedeniOdmeny } from './vedeni.odmeny.ts';
import { STRANKA as zamestnanecOdmeny } from './zamestnanec.odmeny.ts';
import { STRANKA as vedeniKlient } from './vedeni.klient.ts';
import { STRANKA as vedeniKlientRezervace } from './vedeni.klient_rezervace.ts';
import { STRANKA as vedeniKlientObjednavky } from './vedeni.klient_objednavky.ts';
import { STRANKA as vedeniKlientZakaznici } from './vedeni.klient_zakaznici.ts';
import { STRANKA as vedeniKlientVernost } from './vedeni.klient_vernost.ts';
import { STRANKA as vedeniKlientStoly } from './vedeni.klient_stoly.ts';
import { STRANKA as vedeniAkce } from './vedeni.akce.ts';
import { STRANKA as kioskSmena } from './kiosk.smena.ts';

/** Všechny stránky; pořadí = pořadí v Nastavení → Stránky uvnitř skupiny rozhraní. */
export const STRANKY: readonly DefiniceStranky[] = [
  vedeniPrehled, zamestnanecDomu,
  vedeniRozvrh, vedeniMojeSmeny, zamestnanecMojeSmeny, zamestnanecDostupnost,
  vedeniDochazka, vedeniTym,
  vedeniSklad, zamestnanecSklad,
  vedeniReceptury, vedeniMenu,
  vedeniUzaverky, zamestnanecUzaverka,
  vedeniFinance, vedeniTogo, vedeniVsechnyPodniky,
  vedeniUkoly, zamestnanecUkoly, vedeniPlanovani, vedeniNapady, zamestnanecNapady,
  vedeniPostupy, zamestnanecPostupy, vedeniNavody, zamestnanecNavody,
  vedeniOdmeny, zamestnanecOdmeny,
  vedeniKlient, vedeniKlientRezervace, vedeniKlientObjednavky, vedeniKlientZakaznici, vedeniKlientVernost, vedeniKlientStoly, vedeniAkce,
  kioskSmena,
];

const PODLE_ID = new Map<string, DefiniceStranky>(STRANKY.map(s => [s.id, s]));

/** Definice stránky podle id (i z query stringu), nebo undefined. */
export function stranka(id: string | null | undefined): DefiniceStranky | undefined {
  return typeof id === 'string' ? PODLE_ID.get(id) : undefined;
}

/** Je řetězec id známé stránky? */
export const jeIdStranky = (id: unknown): id is IdStranky => typeof id === 'string' && PODLE_ID.has(id);

/** Stránky jednoho rozhraní (Nastavení → Stránky je seskupuje po rozhraních). */
export function strankyRozhrani(r: Rozhrani, jenAktivni = false): DefiniceStranky[] {
  return STRANKY.filter(s => s.rozhrani === r && (!jenAktivni || s.aktivni));
}
