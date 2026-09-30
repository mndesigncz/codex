// Předvolby průvodce podle typu podniku — čistá data a pár čistých funkcí.
//
// Všechno je NÁVRH: každá hodnota jde v průvodci i potom v aplikaci upravit,
// žádná není závazná. Texty jdou uživateli na oči, takže musí projít kontrolou
// univerzálních textů (žádný sortiment jednoho druhu provozu ve větě o všech).

import type { Cil, Doba, DobaDen, TypPodniku } from './typy.ts';
import { ZEME, type Zeme } from './typy.ts';

/** Zkratky dnů od pondělí (klíč "0" = pondělí, nezávisle na začátku týdne podniku). */
export const DNY_KRATKE: readonly string[] = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
export const DNY_DLOUHE: readonly string[] = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];

/** Den s hodinami; `null` = zavřeno. */
type Hodiny = [string, string] | null;

function slozDobu(dny: Hodiny[]): Doba {
  const out: Doba = {};
  dny.forEach((h, i) => {
    // Zavřený den si nese rozumné hodiny, ať je po odškrtnutí „zavřeno" má z čeho vrátit.
    out[String(i)] = h ? { open: h[0], close: h[1], closed: false } : { open: '08:00', close: '18:00', closed: true };
  });
  return out;
}

/** Předvolby otevírací doby podle typu (dny 0..6 od pondělí). */
const DOBA: Record<TypPodniku, Hodiny[]> = {
  kavarna: [['08:00', '18:00'], ['08:00', '18:00'], ['08:00', '18:00'], ['08:00', '18:00'], ['08:00', '18:00'], ['09:00', '18:00'], ['09:00', '18:00']],
  restaurace: [['11:00', '22:00'], ['11:00', '22:00'], ['11:00', '22:00'], ['11:00', '22:00'], ['11:00', '22:00'], ['11:00', '22:00'], ['11:00', '22:00']],
  bar: [null, ['17:00', '23:59'], ['17:00', '23:59'], ['17:00', '23:59'], ['17:00', '23:59'], ['17:00', '23:59'], null],
  pekarna: [['06:00', '17:00'], ['06:00', '17:00'], ['06:00', '17:00'], ['06:00', '17:00'], ['06:00', '17:00'], ['06:00', '12:00'], null],
  caj: [['10:00', '20:00'], ['10:00', '20:00'], ['10:00', '20:00'], ['10:00', '20:00'], ['10:00', '20:00'], ['10:00', '20:00'], ['10:00', '20:00']],
  foodtruck: [['11:00', '20:00'], ['11:00', '20:00'], ['11:00', '20:00'], ['11:00', '20:00'], ['11:00', '20:00'], ['11:00', '20:00'], ['11:00', '20:00']],
  jine: [['09:00', '17:00'], ['09:00', '17:00'], ['09:00', '17:00'], ['09:00', '17:00'], ['09:00', '17:00'], null, null],
};

export function vychoziDoba(typ: TypPodniku | undefined): Doba {
  return slozDobu(DOBA[typ ?? 'jine']);
}

export type IdPredvolbyDoby = 'typ' | 'pracovni' | 'denne' | 'poso' | 'vecer';

export interface PredvolbaDoby { id: IdPredvolbyDoby; nazev: string; popis: string }
export const PREDVOLBY_DOBY: readonly PredvolbaDoby[] = [
  { id: 'typ', nazev: 'Podle typu', popis: 'Návrh podle druhu podniku' },
  { id: 'pracovni', nazev: 'Po až Pá', popis: '9:00 až 17:00, víkend zavřeno' },
  { id: 'denne', nazev: 'Každý den', popis: '9:00 až 20:00' },
  { id: 'poso', nazev: 'Po až So', popis: '8:00 až 18:00, neděle zavřeno' },
  { id: 'vecer', nazev: 'Večer', popis: '17:00 až 23:59, pondělí zavřeno' },
];

export function dobaZPredvolby(id: IdPredvolbyDoby, typ: TypPodniku | undefined): Doba {
  switch (id) {
    case 'pracovni': return slozDobu([0, 1, 2, 3, 4].map((): Hodiny => ['09:00', '17:00']).concat([null, null]));
    case 'denne': return slozDobu(Array.from({ length: 7 }, (): Hodiny => ['09:00', '20:00']));
    case 'poso': return slozDobu([0, 1, 2, 3, 4, 5].map((): Hodiny => ['08:00', '18:00']).concat([null]));
    case 'vecer': return slozDobu([null, ...Array.from({ length: 6 }, (): Hodiny => ['17:00', '23:59'])]);
    default: return vychoziDoba(typ);
  }
}

/** Stejné čištění jako `PUT /api/opening-hours`: klíče 0..6, HH:MM, pravdivostní příznak. */
export function cistiDobu(raw: unknown): Doba | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: Doba = {};
  for (let d = 0; d <= 6; d++) {
    const v = (r[String(d)] ?? {}) as Partial<DobaDen>;
    const cas = (x: unknown, nahradni: string) => (typeof x === 'string' && /^\d{2}:\d{2}$/.test(x) && Number(x.slice(0, 2)) < 24 && Number(x.slice(3)) < 60 ? x : nahradni);
    out[String(d)] = { open: cas(v.open, '08:00'), close: cas(v.close, '20:00'), closed: v.closed === true };
  }
  // Všechny dny zavřeno není podnik, ale omyl — podnik by pak neměl žádnou směnu.
  if (Object.values(out).every(x => x.closed)) return null;
  return out;
}

export const minuty = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const hhmm = (min: number): string => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Nejdřívější otevření a nejpozdější zavření (minuty od půlnoci; zavření po půlnoci přes 1440). */
export function rozsahDoby(doba: Doba): { otevreno: number; zavreno: number } | null {
  let od = Infinity; let konec = -Infinity;
  for (const d of Object.values(doba)) {
    if (d.closed) continue;
    const o = minuty(d.open);
    let c = minuty(d.close);
    // „23:59" je konec dne, ne minuta před půlnocí: 00:00 a dřívější konec patří dalšímu dni.
    if (c <= o) c += 1440;
    od = Math.min(od, o);
    konec = Math.max(konec, c);
  }
  return Number.isFinite(od) ? { otevreno: od, zavreno: konec } : null;
}

export interface NavrhSmeny { name: string; startTime: string; endTime: string; startsAtOpen: boolean; endsAtClose: boolean; color: string }

/** Barvy typů směn: stejný slovník jako ve výběru v rozvrhu (COLORS). */
export const BARVY_SMEN: readonly string[] = ['#C8F542', '#7DD3FC', '#FCD34D', '#F9A8D4', '#A5B4FC', '#FDBA74'];

/**
 * Typy směn odvozené z otevírací doby, ne z pevných hodin: Otevírací a Zavírací
 * nesou příznaky, takže se při generování rozvrhu přepočítají proti otevírací
 * době (a změna doby je neshodí). Střední dostává jen restaurace, foodtruck
 * jednu směnu na celý den.
 */
export function navrhniSmeny(typ: TypPodniku | undefined, doba: Doba | undefined): NavrhSmeny[] {
  const r = rozsahDoby(doba ?? vychoziDoba(typ));
  if (!r) return [];
  const t = typ ?? 'jine';
  const otevirat = hhmm(r.otevreno);
  const zavirat = hhmm(r.zavreno);
  if (t === 'foodtruck') {
    return [{ name: 'Celý den', startTime: otevirat, endTime: zavirat, startsAtOpen: true, endsAtClose: true, color: BARVY_SMEN[0] }];
  }
  const delka = 6 * 60;
  const out: NavrhSmeny[] = [];
  const jenZavirani = t === 'bar';
  if (!jenZavirani) {
    out.push({ name: 'Otevírací', startTime: otevirat, endTime: hhmm(r.otevreno + delka), startsAtOpen: true, endsAtClose: false, color: BARVY_SMEN[0] });
  }
  if (t === 'restaurace') {
    out.push({ name: 'Střední', startTime: hhmm(r.otevreno + 120), endTime: hhmm(r.otevreno + 120 + delka), startsAtOpen: false, endsAtClose: false, color: BARVY_SMEN[2] });
  }
  out.push({ name: 'Zavírací', startTime: hhmm(r.zavreno - delka), endTime: zavirat, startsAtOpen: false, endsAtClose: true, color: BARVY_SMEN[1] });
  return out;
}

export const KATEGORIE_SKLADU: Record<TypPodniku, string[]> = {
  kavarna: ['Káva', 'Mléko a alternativy', 'Sirupy a přísady', 'Pečivo a dezerty', 'Nádobí', 'Úklid a drogerie'],
  restaurace: ['Maso a ryby', 'Zelenina a ovoce', 'Mléčné a vejce', 'Suché zboží', 'Nápoje', 'Drogerie'],
  bar: ['Destiláty', 'Pivo a víno', 'Nealko a mixéry', 'Ovoce a ozdoby', 'Led a sklo', 'Drogerie'],
  pekarna: ['Mouky a suroviny', 'Kvasy a kvasnice', 'Náplně a zdobení', 'Obaly a sáčky', 'Drogerie'],
  caj: ['Čaje', 'Nápoje a mléka', 'Sladkosti', 'Nádobí', 'Drogerie'],
  foodtruck: ['Suroviny', 'Obaly a příbory', 'Nápoje', 'Plyn a provoz'],
  jine: ['Zboží', 'Provozní materiál', 'Drogerie'],
};

export interface NavrhPostupu { name: string; description: string; kroky: string[] }

const OTEVIRANI: NavrhPostupu = { name: 'Otevírání', description: 'Co je potřeba udělat, než přijde první host.', kroky: ['Odemknout a rozsvítit', 'Zapnout stroje a zkontrolovat, že běží', 'Připravit pult a pokladnu', 'Zkontrolovat zásoby na dnešek', 'Otevřít pro hosty'] };
const ZAVIRANI: NavrhPostupu = { name: 'Zavírání', description: 'Co se dělá po posledním hostovi.', kroky: ['Uklidit pult a stoly', 'Vypnout a vyčistit stroje', 'Spočítat kasu a vyplnit uzávěrku', 'Vynést odpadky', 'Zhasnout a zamknout'] };
const UKLID: NavrhPostupu = { name: 'Denní úklid', description: 'Krátký úklid, který nesmí vypadnout.', kroky: ['Vytřít podlahu', 'Otřít povrchy a stoly', 'Vyčistit sociální zařízení', 'Doplnit hygienické potřeby'] };

export const POSTUPY: Record<TypPodniku, NavrhPostupu[]> = {
  kavarna: [OTEVIRANI, ZAVIRANI, UKLID],
  restaurace: [OTEVIRANI, ZAVIRANI, {
    name: 'Kontrola teplot chladniček', description: 'Zápis teplot, ať je kontrola doložitelná.',
    kroky: ['Změřit teplotu chladniček', 'Změřit teplotu mrazáků', 'Zapsat hodnoty', 'Nahlásit odchylku vedení'],
  }],
  bar: [
    { ...OTEVIRANI, name: 'Otevírání baru', kroky: ['Odemknout a rozsvítit', 'Připravit led a sklo', 'Doplnit ovoce a ozdoby', 'Zkontrolovat čepování', 'Otevřít pro hosty'] },
    { ...ZAVIRANI, name: 'Zavírání baru', kroky: ['Uklidit bar a stoly', 'Vyčistit čepování', 'Spočítat kasu a vyplnit uzávěrku', 'Vynést odpadky a sklo', 'Zhasnout a zamknout'] },
    UKLID,
  ],
  pekarna: [OTEVIRANI, ZAVIRANI, UKLID],
  caj: [OTEVIRANI, ZAVIRANI, UKLID],
  foodtruck: [
    { name: 'Příprava před výjezdem', description: 'Co se kontroluje, než se vyjede.', kroky: ['Zkontrolovat plyn a vodu', 'Naložit suroviny a obaly', 'Zkontrolovat pokladnu', 'Zapnout chlazení'] },
    { name: 'Zavření a úklid', description: 'Co se dělá po posledním zákazníkovi.', kroky: ['Uklidit výdejní okénko', 'Vyčistit a vypnout spotřebiče', 'Spočítat kasu a vyplnit uzávěrku', 'Zamknout'] },
  ],
  jine: [OTEVIRANI, ZAVIRANI],
};

export const POZICE: Record<TypPodniku, string> = {
  kavarna: 'Barista', restaurace: 'Obsluha', bar: 'Barman', pekarna: 'Prodavač', caj: 'Obsluha', foodtruck: 'Kuchař', jine: 'Zaměstnanec',
};

/** Země → předvolba; `JINA` a neznámé nic nemění. */
export function predvolbaZeme(zeme: Zeme | undefined) {
  return zeme ? ZEME[zeme] : null;
}

/** Předvybrané cíle podle typu (jde změnit): co obvykle řeší jako první. */
export const CILE_PODLE_TYPU: Record<TypPodniku, Cil[]> = {
  kavarna: ['rozvrh', 'sklad', 'uzaverky'],
  restaurace: ['rozvrh', 'sklad', 'provoz'],
  bar: ['rozvrh', 'sklad', 'uzaverky'],
  pekarna: ['rozvrh', 'sklad', 'provoz'],
  caj: ['rozvrh', 'sklad', 'uzaverky'],
  foodtruck: ['sklad', 'uzaverky'],
  jine: ['rozvrh', 'provoz'],
};
