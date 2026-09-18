// Co stojí jedna porce — jedno místo, jedno číslo.
//
// Cena téže receptury se v aplikaci počítala dvakrát a pokaždé jinak.
//
//   V seznamu    se sečetly přesné hodnoty a zaokrouhlilo se až na konci.
//   V editoru    se zaokrouhlila **každá surovina zvlášť** a součet se udělal
//                z těch zaokrouhlených čísel.
//
// Rozdíl není kosmetický. Suroviny, kterých se dává málo, stojí míň než
// korunu: pět gramů cukru za 25 Kč/kg je 12 haléřů, tři gramy máty
// 24 haléřů. Zaokrouhlení po surovině je pošle na nulu. Nápoj ze čtyř
// takových surovin pak v editoru stojí 0 Kč a marže sedí na sto procentech.
// Majitel podle toho nastaví cenu.
//
// A naopak: čtyři suroviny po 1,50 Kč se každá zaokrouhlí nahoru na dvě,
// takže z šesti korun je osm. Chyba jde oběma směry a roste s počtem
// surovin — tedy nejvíc u koktejlů, kde na marži záleží nejvíc.
//
// Pravidlo: **zaokrouhluje se jednou, až ten výsledek**. Výjimka je jediná
// a je v `lib/wages`: tam se zaokrouhluje po záznamu, protože ty řádky
// sečte účetní na papíře a součet jim musí odpovídat. Řádky surovin nikdo
// ručně nesčítá — u nich má přednost přesnost.

/** Kolik stojí surovina v jedné porci. Nezaokrouhluje se. */
export function ingredientCost(unitCost: number, packageSize: number, amount: number): number {
  const cost = Number(unitCost) || 0;
  const pkg = Number(packageSize) || 0;
  const amt = Number(amount) || 0;
  if (!(cost > 0) || !(amt > 0)) return 0;
  // Bez velikosti balení je cena za jednotku rovnou cenou položky —
  // typicky kusovka („jedna citronová kůra za dvě koruny").
  return pkg > 0 ? (cost / pkg) * amt : cost * amt;
}

export interface RecipeIngredient {
  /** Cena celého balení. */
  unitCost: number;
  /** Velikost balení v jednotce položky; 0 znamená kusovku. */
  packageSize: number;
  /** Množství v jedné porci, v jednotce položky. */
  amount: number;
}

export interface RecipeCost {
  /** Náklad na porci, zaokrouhlený — tohle se ukazuje a podle tohohle se počítá marže. */
  total: number;
  /** Nezaokrouhlený součet; kvůli marži a kvůli tomu, aby šlo poznat „skoro nula" od „nula". */
  exact: number;
  /** Suroviny, u kterých chybí cena — bez nich je součet neúplný, ne nulový. */
  missingPrice: number;
}

/** Součet nákladů na porci. Zaokrouhluje se jednou, až ten výsledek. */
export function recipeCost(ingredients: RecipeIngredient[]): RecipeCost {
  let exact = 0;
  let missingPrice = 0;
  for (const ing of ingredients) {
    if (!(Number(ing.unitCost) > 0)) {
      // Množství bez ceny není nula — je to díra v součtu a musí být vidět.
      if (Number(ing.amount) > 0) missingPrice += 1;
      continue;
    }
    exact += ingredientCost(ing.unitCost, ing.packageSize, ing.amount);
  }
  return { total: Math.round(exact), exact, missingPrice };
}

/**
 * Marže v procentech z prodejní ceny. `null`, když se nedá spočítat —
 * a to je poctivější než nula, protože nula je taky platná marže.
 *
 * Počítá se z **nezaokrouhleného** nákladu: u levného nápoje by
 * zaokrouhlení na celé koruny posunulo procenta o jednotky.
 */
export function marginPct(price: number | null | undefined, cost: number): number | null {
  const p = Number(price) || 0;
  if (!(p > 0)) return null;
  return Math.round(((p - cost) / p) * 100);
}

/**
 * Kolik desetinných míst má číslo potřebovat, aby nebylo vidět jako nula.
 * Dvanáct haléřů se musí ukázat jako „0,12", ne jako „0".
 */
export function costDecimals(value: number): number {
  const v = Math.abs(Number(value) || 0);
  if (v === 0 || v >= 10) return 0;
  if (v >= 1) return 1;
  return 2;
}
