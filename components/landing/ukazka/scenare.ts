// Scény živé ukázky na prodejní stránce: co se nabízí, jak se to zarámuje a kam
// míří „coach marks" (kurzor a bublina „klikni sem").
//
// Nic z aplikace se sem neimportuje (jen typy zpráv jako text): stránka drží
// ukázku v <iframe>, takže izolaci stylů i skriptů obstará prohlížeč a balík
// prodejní stránky neroste o jediný bajt aplikace.
//
// Coach marks nesázejí na pevné souřadnice (rozložení aplikace se mění), ale
// hledají prvek uvnitř ukázky podle jména, které mu dává odečítač obrazovky.
// Ukázka je téhož původu jako stránka, takže to jde, a sonda k75 hlídá, že
// každý krok svůj prvek v ukázce opravdu najde.

export type IdSceny = 'prehled' | 'rozvrh' | 'uzaverka' | 'sklad' | 'kiosk';
export type RoleUkazky = 'vedeni' | 'zamestnanec' | 'kiosk';
export type ZarizeniUkazky = 'pocitac' | 'tablet' | 'telefon';

export interface ScenaUkazky {
  id: IdSceny;
  label: string;
  vychoziRole: RoleUkazky;
  vychoziZarizeni: ZarizeniUkazky;
  /** Jedna věta pod rámem: co si tu vyzkoušet. */
  zkus: string;
}

export const SCENY_UKAZKY: ScenaUkazky[] = [
  { id: 'prehled', label: 'Přehled', vychoziRole: 'vedeni', vychoziZarizeni: 'pocitac',
    zkus: 'Zkus kliknout na kartu Docházející zásoby. Každá karta otevře svůj pohled, vedení začíná přehledem dne.' },
  { id: 'rozvrh', label: 'Rozvrh', vychoziRole: 'vedeni', vychoziZarizeni: 'pocitac',
    zkus: 'Zkus vygenerovat rozvrh na měsíc, projít návrh a publikovat ho.' },
  { id: 'uzaverka', label: 'Uzávěrka', vychoziRole: 'zamestnanec', vychoziZarizeni: 'telefon',
    zkus: 'Uzávěrka je zamčená, dokud nejsou hotové povinné věci. Zkus odškrtnout poslední z nich.' },
  { id: 'sklad', label: 'Sklad', vychoziRole: 'vedeni', vychoziZarizeni: 'pocitac',
    zkus: 'Zkus z nákupního seznamu vytvořit objednávky pro dodavatele.' },
  { id: 'kiosk', label: 'Tablet u baru', vychoziRole: 'kiosk', vychoziZarizeni: 'tablet',
    zkus: 'Zkus klepnout na jméno a odškrtnout úkol. Na tabletu u baru se nikdo nepřihlašuje heslem.' },
];

export const ROLE_UKAZKY: { id: RoleUkazky; label: string }[] = [
  { id: 'vedeni', label: 'Vedení' },
  { id: 'zamestnanec', label: 'Zaměstnanec' },
];

export const ZARIZENI_UKAZKY: { id: ZarizeniUkazky; label: string }[] = [
  { id: 'pocitac', label: 'Počítač' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'telefon', label: 'Telefon' },
];

/** Logický rozměr okna zařízení: aplikace je v něm rozložená doopravdy a iframe se jen zmenší. */
export const LOGICKY_ROZMER: Record<ZarizeniUkazky, { w: number; h: number }> = {
  pocitac: { w: 1100, h: 690 },
  tablet: { w: 1024, h: 768 },
  telefon: { w: 390, h: 780 },
};

// ——— Kroky coach marks ———————————————————————————————————————————

export interface KrokUkazky {
  /** Najde prvek uvnitř ukázky, nebo null (ještě se nevykreslil). */
  najdi: (doc: Document) => HTMLElement | null;
  /** Text bubliny. */
  text: string;
}

const PRVKY = 'button, [role="checkbox"], a[href]';

/** Prvek, jehož jméno (aria-label, jinak text) vyhovuje výrazu a který je vidět. */
export function podleJmena(re: RegExp) {
  return (doc: Document): HTMLElement | null => {
    const vsechny = Array.from(doc.querySelectorAll<HTMLElement>(PRVKY));
    return vsechny.find(e => {
      const jmeno = (e.getAttribute('aria-label') ?? e.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!re.test(jmeno)) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }) ?? null;
  };
}

const K = {
  zasoby: { najdi: podleJmena(/^Otevřít Docházející zásoby/), text: 'Klikni sem: co dochází a co dokoupit' },
  nakoupit: { najdi: podleJmena(/^Nakoupit/), text: 'Klikni sem: nákupní seznam poskládá aplikace' },
  objednavka: { najdi: podleJmena(/^Vytvořit objednávku/), text: 'Klikni sem: objednávky pro dodavatele' },
  generovat: { najdi: podleJmena(/^Vygenerovat rozvrh/), text: 'Klikni sem: rozvrh navrhne aplikace' },
  ulozit: { najdi: podleJmena(/^Potvrdit a uložit/), text: 'Klikni sem: potvrdíš návrh' },
  publikovat: { najdi: podleJmena(/^Publikovat$/), text: 'Klikni sem: tým ho uvidí v telefonu' },
  povinne: { najdi: podleJmena(/^Hotovo: /), text: 'Klikni sem: poslední povinný úkol' },
  jmeno: { najdi: podleJmena(/^Zapisovat jako /), text: 'Klepni na jméno, heslo netřeba' },
  ukoly: { najdi: podleJmena(/^Úkoly\b/), text: 'Klepni sem: úkoly na dnes' },
  ukol: { najdi: podleJmena(/^Vynést koš/), text: 'Klepni sem: odškrtni úkol' },
} satisfies Record<string, KrokUkazky>;

/**
 * Kroky pro scénu a roli. Jen dvojice, pro které příběh existuje: zaměstnanec
 * v Rozvrhu nebo vedení v Uzávěrce ukazují jiné obrazovky a rozhoduje si o nich
 * člověk sám, vedení bez kurzoru je poctivější než kurzor, který ukazuje do prázdna.
 */
export function krokyPro(scena: IdSceny, role: RoleUkazky): KrokUkazky[] {
  if (scena === 'prehled' && role === 'vedeni') return [K.zasoby, K.nakoupit, K.objednavka];
  if (scena === 'sklad' && role === 'vedeni') return [K.nakoupit, K.objednavka];
  if (scena === 'rozvrh' && role === 'vedeni') return [K.generovat, K.ulozit, K.publikovat];
  if (scena === 'uzaverka' && role === 'zamestnanec') return [K.povinne];
  if (scena === 'kiosk') return [K.jmeno, K.ukoly, K.ukol];
  return [];
}

// ——— Reakce na události ukázky ———————————————————————————————————————

/** Věta, kterou stránka řekne, když v ukázce něco proběhne (`demo-akce`). */
export const REAKCE_NA_AKCI: Record<string, string> = {
  'ukol-odskrtnut': 'Povinný úkol je hotový.',
  'uzaverka-odemcena': 'Uzávěrka se odemkla: poslední povinná věc je splněná.',
  'uzaverka-odeslana': 'Uzávěrka je odeslaná vedení ke schválení.',
  'rozvrh-vygenerovan': 'Návrh rozvrhu je hotový. Projdi ho, klidně ho uprav.',
  'rozvrh-ulozen': 'Rozvrh je uložený.',
  'rozvrh-publikovan': 'Rozvrh je zveřejněný, tým ho má v telefonu.',
  'objednavka-odeslana': 'Objednávka pro dodavatele je hotová. V ukázce se nikam neodesílá.',
  'prichod-zapsan': 'Příchod je zapsaný.',
  'odchod-zapsan': 'Odchod je zapsaný.',
  'postup-spusten': 'Postup je spuštěný.',
  'postup-dokoncen': 'Postup je dokončený.',
};

export function jeIdSceny(v: unknown): v is IdSceny {
  return SCENY_UKAZKY.some(s => s.id === v);
}
