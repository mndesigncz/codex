// Seznam právních stránek pro odkazy (patičky, nastavení, registrace). Čistý modul bez
// textů dokumentů: importuje ho i klient (PravniOdkazy v hostovské části), takže sem
// nesmí nic těžkého ani serverového.

export type KlicDokumentu =
  | 'obchodni-podminky' | 'zpracovatelska-smlouva' | 'subzpracovatele' | 'zruseni-predplatneho'
  | 'podminky' | 'soukromi' | 'podpora' | 'smazat-ucet' | 'informace-pro-zamestnance';

/** Dokumenty s vlastní stránkou v češtině i angličtině (/x a /en/x). */
export const KLICE_DOKUMENTU: KlicDokumentu[] = [
  'obchodni-podminky', 'zpracovatelska-smlouva', 'subzpracovatele', 'zruseni-predplatneho',
  'podminky', 'soukromi', 'podpora', 'smazat-ucet', 'informace-pro-zamestnance',
];

/** Klíč odkazu: dokument nebo samostatná stránka bez anglické verze (/nahlasit). */
export type KlicOdkazu = KlicDokumentu | 'nahlasit';

export interface PravniOdkaz { klic: KlicOdkazu; cs: string; en: string; /** Jen pro podniky (v hostovské části se neukazuje). */ podnik?: boolean }

/** Názvy odkazů v patičkách a v nastavení, v pořadí, v jakém se ukazují. */
export const ODKAZY_PRAVNI: PravniOdkaz[] = [
  { klic: 'obchodni-podminky', cs: 'Obchodní podmínky', en: 'Business terms', podnik: true },
  { klic: 'zpracovatelska-smlouva', cs: 'Zpracovatelská smlouva', en: 'Data processing agreement', podnik: true },
  { klic: 'subzpracovatele', cs: 'Subzpracovatelé', en: 'Subprocessors' },
  { klic: 'zruseni-predplatneho', cs: 'Zrušení předplatného', en: 'Cancellation and refunds', podnik: true },
  { klic: 'podminky', cs: 'Podmínky užívání', en: 'Terms of use' },
  { klic: 'soukromi', cs: 'Zásady ochrany osobních údajů', en: 'Privacy policy' },
  { klic: 'podpora', cs: 'Podpora', en: 'Support' },
  { klic: 'smazat-ucet', cs: 'Smazání účtu', en: 'Delete account' },
  { klic: 'nahlasit', cs: 'Nahlásit obsah', en: 'Report content' },
];

/** Základní odkazy (bez smluvních dokumentů pro podniky) — výchozí výběr PravniOdkazy. */
export const ODKAZY_ZAKLAD: KlicOdkazu[] = ['soukromi', 'podminky', 'podpora', 'smazat-ucet'];

/** Cesta k právní stránce v daném jazyce; stránky bez anglické verze vedou na českou. */
export function cestaDokumentu(klic: KlicOdkazu | string, jazyk: 'cs' | 'en' = 'cs'): string {
  const maEn = (KLICE_DOKUMENTU as string[]).includes(klic);
  return jazyk === 'en' && maEn ? `/en/${klic}` : `/${klic}`;
}
