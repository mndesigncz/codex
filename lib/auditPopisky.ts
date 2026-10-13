// České popisky akcí v historii změn (Nastavení → Historie změn).
//
// Slovník žil v app/api/audit/route.ts a znal 17 z víc než 40 akcí, takže
// vedení číst „team.switch“ a „organization.settings — {JSON…}“. Teď je tady
// a scripts/check-audit-labels.mjs hlídá, že každý klíč, který kód předává
// do audit(), tu má popisek. Nová akce bez popisku shodí kontrolu v CI.

import { obsahujeNekde } from './hledani.ts';

export const AUDIT_POPISKY: Record<string, string> = {
  // podnik a lidé
  'team.settings': 'Změna nastavení podniku',
  'ucet.smazan': 'Účet smazán jeho majitelem',
  'ucet.stripe_chyba': 'Smazání účtu: Stripe se nepodařilo uklidit, dokončit ručně',
  'podnik.smazan': 'Podnik smazán spolu s účtem vlastníka',
  'nahlaseni.vytvoreno': 'Obsah nahlášen',
  'nahlaseni.vyreseno': 'Nahlášení vyřízeno',
  'uzivatel.zablokovan': 'Uživatel zablokován',
  'uzivatel.odblokovan': 'Uživatel odblokován',
  'zprava.smazana': 'Zpráva v chatu smazána',
  'oznameni.potvrzeno': 'Oznámení na nástěnce potvrzeno („Rozumím")',
  'oznameni.pripomenuto': 'Připomenutí oznámení těm, kdo nepotvrdili',
  'team.switch': 'Přepnutí do jiného podniku',
  'team.create': 'Založen nový podnik',
  'team.create_account': 'Založen účet člena',
  'team.remove': 'Člen odebrán z podniku',
  'tym.pozvanka_znovu': 'Pozvánka poslána znovu',
  'kiosk.login': 'Změna přihlášení tabletu',
  'kiosk.pin': 'Změna PINu člena',
  'rozlozeni.vychozi': 'Změna výchozího rozložení stránky',
  'onboarding.apply': 'Průvodce nastavením podniku založil předvolby',
  'klient.import': 'Import členů z jiné aplikace',
  'klient.import.vraceni': 'Import členů vrácen',
  'klient.poukaz.vytvoren': 'Dárkové poukazy založeny',
  'klient.poukaz.uplatnen': 'Dárkový poukaz uplatněn',
  'klient.poukaz.vracen': 'Částka vrácena na dárkový poukaz',
  'klient.poukaz.zrusen': 'Dárkový poukaz zrušen',
  'klient.poukaz.upraven': 'Dárkový poukaz upraven',
  'klient.poukaz.prodlouzeno': 'Platnost dárkových poukazů prodloužena',
  'klient.poukaz.odeslan': 'Dárkový poukaz poslán e-mailem',
  'klient.poukaz.limity': 'Změna limitů uplatnění dárkových poukazů',
  'klient.poukaz.nastaveni': 'Změna nastavení poukazů (nejnižší účet, body za nákup)',
  'klient.poukaz.prirazen': 'Dárkový poukaz přiřazen hostovi v aplikaci',
  'klient.poukaz.prevzat': 'Host si přidal dárkový poukaz do aplikace',
  'klient.poukaz.odebran': 'Host odebral dárkový poukaz ze své aplikace',
  'klient.body.zdroje': 'Změna bodů mimo kasu (objednávky, rezervace)',
  // role
  'role.create': 'Vytvořena role',
  'role.update': 'Upravena role',
  'role.delete': 'Smazána role',
  'role.assign': 'Změněna role člena',
  'role.default': 'Nastavena výchozí role pro nové členy',
  'role.system_update': 'Upravena přednastavená role',
  'role.system_reset': 'Přednastavená role vrácena na výchozí',
  // organizace
  'organization.settings': 'Změna nastavení organizace',
  'organization.ciselniky': 'Změna sdílení číselníků',
  'organization.ciselniky.kopie': 'Číselník zkopírován ze sdíleného zdroje',
  'organization.ciselniky.slouceni': 'Číselníky sloučeny do sdíleného zdroje',
  'organization.kopie': 'Zkopírováno z jiného podniku',
  'organization.kopie.zdroj': 'Zkopírováno do jiného podniku',
  // rozvrh
  'schedule.clearMonth': 'Vymazán měsíc rozvrhu',
  'schedule.adjust': 'Rozvrh upraven podle nových požadavků',
  'schedule.rules': 'Změna pravidel rozvrhu',
  'volno.rozhodnout': 'Rozhodnuto o žádosti o volno',
  'rozvrh.poznamka': 'Poznámka ke směně',
  'rozvrh.pripomenout_dostupnost': 'Lidem bez dostupnosti připomenuto, ať ji zadají',
  'rozvrh.publikovat': 'Rozvrh publikován',
  // sklad, dodavatelé, účtenky
  'inventory.create': 'Přidána položka skladu',
  'inventory.write-in': 'Zapsána nová věc do skladu',
  'inventory.delete': 'Smazána položka skladu',
  'inventory.produce': 'Vyrobeno ze skladu',
  'inventory.recipe': 'Změněno, jestli se položka vyrábí, nebo nakupuje',
  'supplier.create': 'Přidán dodavatel',
  'supplier.delete': 'Smazán dodavatel',
  'supplier.update': 'Upraven dodavatel',
  'order.receive': 'Přijata objednávka',
  'order.receive.partial': 'Přijata objednávka (částečně — něco nedorazilo nebo přišlo navíc)',
  'receipt.add': 'Přidána účtenka',
  // uzávěrky
  'closing.delete': 'Smazána uzávěrka',
  // odměny
  'reward.create': 'Přidána odměna',
  'reward.approved': 'Schválena odměna',
  'reward.declined': 'Zamítnuta odměna',
  'reward.update': 'Upravena odměna v katalogu',
  // nápady
  'napady.zamitnuto': 'Zamítnut podnět',
  // prémie a srážky
  'wage.bonus': 'Přidána prémie k výplatě',
  'wage.deduction': 'Přidána srážka z výplaty',
  'wage.adjustment_delete': 'Smazána prémie nebo srážka',
  'points.award': 'Pochvala s body',
  'points.award_delete': 'Smazána pochvala',
  // docházka (kolo 7: ruční oprava s důvodem)
  'dochazka.upravit': 'Ručně upraven záznam docházky',
  'dochazka.pridat': 'Ručně přidán záznam docházky',
  'dochazka.smazat': 'Smazán záznam docházky',
  // akce
  'event.create': 'Založena akce',
  'event.checkout': 'Akce: zboží vydáno ze skladu',
  'event.return': 'Akce: zboží vráceno do skladu',
  'event.announce': 'Akce oznámena týmu',
  'event.delete': 'Smazána akce',
  // kasa a menu
  'pos.connect': 'Připojena kasa',
  'pos.disconnect': 'Odpojena kasa',
  'pos.sync': 'Odepsány prodeje ze skladu',
  'pos.recipe': 'Změněna receptura produktu z kasy',
  'pos.backfill': 'Dotažena historie prodejů z kasy',
  'pos.webhook': 'Vygenerováno nové tajemství napojení kasy',
  'menu.pos.match': 'Menu spárováno s kasou',
  'menu.pos.import': 'Menu naimportováno z kasy',
  // Managero client (hosté)
  'client.floorplan': 'Uložen plánek stolů',
  'client.reservation': 'Změněna rezervace hosta',
  'rezervace.zapsat': 'Obsluha ručně zapsala rezervaci (telefon, u dveří)',
  'rezervace.nedorazil': 'Rezervace označena „Nedorazil“ (host nepřišel)',
  'rezervace.pripominka': 'Hostům odešla připomínka rezervace s Potvrdit / Zrušit',
  'recenze.odpovedet': 'Odpověď hostovi na hodnocení',
  'recenze.vyridit': 'Hodnocení označeno jako vyřízené',
  'client.profile': 'Změna veřejné stránky podniku',
  'client.broadcast': 'Odeslána zpráva členům věrnostního programu',
  'client.reaktivace': 'Změna automatického oslovení „Chybíš nám“',
  'client.broadcast.test': 'Zkušební zpráva členům odeslána jen odesílateli',
  'client.broadcast.upraveno': 'Upravena naplánovaná zpráva členům',
  'client.broadcast.zruseno': 'Zrušena naplánovaná zpráva členům',
  'client.group': 'Změna skupiny členů (založení, název, pravidla, členové, smazání)',
  'client.bulk': 'Hromadná akce nad členy (skupina, bonus bodů)',
  'client.export': 'Export členů nebo deníku věrnosti do CSV',
  'client.poznamka': 'Interní poznámka k hostovi',
  'client.points': 'Ruční úprava bodů člena',
  'client.credit': 'Ruční úprava kreditu člena',
  'client.clen.slouceni': 'Sloučení dvou členů věrnostního programu',
  'client.clen.smazan': 'Člen odebrán z věrnostního programu',
  'client.clen.blokace': 'Člen zablokován nebo odblokován ve věrnostním programu',
  'client.skupina.import': 'Členové přidáni do skupiny z CSV',
  'client.automatizace': 'Změna automatické zprávy členům',
  'client.banner': 'Změna promo banneru na stránce podniku',
  'client.kupon': 'Změna kuponu (založení, úprava, koncept, archiv, smazání)',
  'client.kupon.uplatnen': 'Kupon hosta uplatněn u kasy',
  'client.kupon.odeslan': 'Kupon poslán hostům',
  'client.promo': 'Změna promo kódu (založení, dávka, úprava, smazání)',
  'client.card': 'Změna na věrnostní kartě',
  'client.stamps': 'Změna razítkové kampaně (založení, úprava, archiv, smazání)',
  'client.stamps.manual': 'Ruční úprava razítek hostů s důvodem',
  'client.bonus': 'Změna bonusové akce věrnostního programu',
  'client.spend': 'Úprava útraty člena (úrovně podle útraty)',
  'client.stamps.create': 'Založena razítková kartička',
  'client.stamps.update': 'Upravena razítková kartička',
  'client.stamps.delete': 'Smazána razítková kartička',
  'client.stamps.status': 'Změněn stav razítkové kartičky (běží, koncept, pozastavena, archiv)',
  'client.stamps.duplicate': 'Zkopírována razítková kartička',
  'client.stamps.move': 'Změněno pořadí razítkových kartiček',
  'client.stamps.adjust': 'Ručně upravena razítka hosta',
  'client.stamps.undo': 'Stornována poslední akce s razítky hosta',
  'client.pravidla': 'Změna pravidel bodů a úrovní věrnosti',
  'client.pravidla.koncept': 'Uložen nebo zahozen koncept pravidel věrnosti',
  'client.storno': 'Storno bodů a kreditu za zrušenou nebo vrácenou účtenku',
  'client.order': 'Změněn stav objednávky hosta',
  'client.order.pos': 'Objednávka hosta předána do kasy',
  // předplatné
  'billing.subscription_reset': 'Předplatné vymazáno kvůli nesouladu s platební bránou',
  'billing.customer_reset': 'Zákazník platební brány zapomenut',
  'billing.referral': 'Měsíc zdarma za doporučení',
  'billing.upgrade': 'Změna tarifu na vyšší',
  // úkoly (kolo 7)
  'ukoly.fotka': 'Úkol splněn s fotkou jako důkazem',
  // výplaty (kolo 8, R8-1)
  'vyplata.oznacena': 'Výplata označená jako vyplacená',
  'vyplata.zrusena': 'Označení výplaty zrušeno',
  'vyplata.obdobi_uzavreno': 'Výplatní období uzavřeno',
  'vyplata.obdobi_otevreno': 'Výplatní období znovu otevřeno',
  'vyplata.pravidla': 'Změna pravidel výplat (dýško, příplatky, odvody)',
  'vyplata.smlouva': 'Změna typu smlouvy a limitu hodin člena',
  'dochazka.pauza_doplnena': 'Pauza doplněná při odchodu (směna rozdělená na dva záznamy)',
  'dochazka.bez_pauzy': 'Odchod po víc než 6 h bez pauzy',
};

/** Popisek akce; neznámý klíč nikdy neukážeme syrový. */
export function popisAkce(klic: string): string {
  return AUDIT_POPISKY[klic] ?? 'Jiná změna v podniku';
}

/** Názvy polí nastavení podniku (PATCH /api/teams) pro detail „Změna nastavení podniku“. */
const POLE_NASTAVENI: Record<string, string> = {
  name: 'název', currency: 'měna', locale: 'jazyk', weekStart: 'začátek týdne', businessType: 'typ podniku',
  dashboardConfig: 'domovská plocha', showTeamSchedule: 'sdílení rozvrhu', regenerateCode: 'kód pro pozvání',
  payDailyCash: 'denní výplata v hotovosti', drawerFloat: 'kasa na začátku', closingRequiresShift: 'uzávěrka jen ve směně',
  payoutFromRegister: 'výplaty z kasy', tipsInDrawer: 'spropitné v kase', laborTargetPct: 'cíl mzdových nákladů',
  marginTargetPct: 'cílová marže',
  fixedCosts: 'pravidelné náklady',
  levelsConfig: 'úrovně odměn', pointsConfig: 'body odměn', lowStockDefault: 'výchozí nízký stav',
  criticalStockDefault: 'výchozí kritický stav', address: 'adresa', ico: 'IČO', dic: 'DIČ',
  country: 'země', defaultLang: 'jazyk podniku', timeFormat: 'formát času', timezone: 'časové pásmo', navConfig: 'navigace aplikace',
};

/** Seznam změněných polí česky: „název, měna“. Neznámé pole se vynechá, ne vypíše syrově. */
export function popisPoliNastaveni(pole: string[]): string {
  // Idempotentní: už přeložený název („název") projde beze změny. Nové záznamy
  // se do auditu zapisují česky (app/api/teams) a při čtení procházejí tímhle
  // znovu — bez toho by je filtr jako „neznámé klíče" vyřadil celé.
  const ceskeNazvy = new Set(Object.values(POLE_NASTAVENI));
  const cesky = pole.map(k => POLE_NASTAVENI[k] ?? (ceskeNazvy.has(k) ? k : undefined)).filter((x): x is string => !!x);
  return [...new Set(cesky)].join(', ').slice(0, 200);
}

const ZAP = (v: unknown) => (v ? 'zapnuto' : 'vypnuto');

/** Nastavení organizace jednou větou místo JSON.stringify celého objektu. */
export function shrnutiNastaveniOrganizace(n: { sdileniLidi?: unknown; sdileneCiselniky?: unknown }): string {
  return `Sdílení lidí: ${ZAP(n.sdileniLidi)}, sdílené číselníky: ${ZAP(n.sdileneCiselniky)}`;
}

/** Sdílené číselníky: zapnutí a počet číselníků, které mají sdílený zdroj. */
export function shrnutiSdilenychCiselniku(sdilene: unknown, zdroje: Record<string, unknown> | null | undefined): string {
  const pocet = Object.values(zdroje ?? {}).filter(z => z != null).length;
  return `Sdílené číselníky: ${ZAP(sdilene)}, se sdíleným zdrojem: ${pocet}`;
}

/**
 * Detail řádku historie. Starší záznamy organizace nesou JSON celého nastavení —
 * ten se převede na větu; cokoli jiného, co vypadá jako JSON, se nezobrazí.
 */
export function detailAkce(akce: string, detail: string | null | undefined): string | null {
  if (!detail) return null;
  const d = String(detail).trim();
  if (!d) return null;
  // Starší záznamy mají v detailu syrové názvy polí („name, payDailyCash“).
  if (akce === 'team.settings') return popisPoliNastaveni(d.split(/,\s*/)) || null;
  if (!/^[{[]/.test(d)) return d;
  try {
    const j = JSON.parse(d);
    if (akce === 'organization.settings') return shrnutiNastaveniOrganizace(j);
    if (akce === 'organization.ciselniky') return shrnutiSdilenychCiselniku(j.sdileneCiselniky, j.zdroje);
  } catch { /* uříznutý JSON — dál */ }
  return null;
}

// ---------------------------------------------------------------------------
// Oblasti historie změn a filtr (kolo 7, R7-7)
// ---------------------------------------------------------------------------
//
// Nastavení › Historie změn filtruje podle člověka, oblasti a textu. Oblast se
// odvozuje z předpony akce před tečkou (inventory., closing., role.…) — ale přes
// výslovnou mapu, ne hádáním: nová předpona bez oblasti shodí test
// (scripts/testy/k83-nastaveni.ts: každý klíč z AUDIT_POPISKY má oblast).


export type OblastAuditu = 'lide' | 'sklad' | 'kasa' | 'uzaverky' | 'odmeny' | 'klient' | 'nastaveni' | 'ostatni';

/** Pořadí oblastí v přepínači (Vše je navíc a první). */
export const PORADI_OBLASTI: readonly OblastAuditu[] = ['lide', 'sklad', 'kasa', 'uzaverky', 'odmeny', 'klient', 'nastaveni', 'ostatni'];

/** Předpona akce (část před první tečkou) → oblast. Klíče bez uvozovek: kontrola popisků čte jen `'klíč': '…'`. */
export const OBLASTI_AUDITU: Readonly<Record<string, OblastAuditu>> = {
  // lidé, role, směny a docházka
  team: 'lide', ucet: 'lide', uzivatel: 'lide', zprava: 'lide', nahlaseni: 'lide', tym: 'lide', kiosk: 'lide',
  role: 'lide', schedule: 'lide', volno: 'lide', rozvrh: 'lide', dochazka: 'lide',
  // sklad, dodavatelé, účtenky
  inventory: 'sklad', supplier: 'sklad', receipt: 'sklad', order: 'sklad',
  // kasa a menu
  pos: 'kasa', menu: 'kasa',
  // uzávěrky
  closing: 'uzaverky',
  // odměny, prémie, pochvaly
  reward: 'odmeny', wage: 'odmeny', points: 'odmeny', vyplata: 'odmeny',
  // hosté (Managero client)
  client: 'klient', klient: 'klient', rezervace: 'klient', recenze: 'klient',
  // nastavení podniku, organizace, předplatné
  podnik: 'nastaveni', rozlozeni: 'nastaveni', onboarding: 'nastaveni', organization: 'nastaveni', billing: 'nastaveni',
  // akce (výdej a vrácení zboží, oznámení týmu) — samostatná agenda, patří k ostatnímu
  event: 'ostatni',
  // úkoly a nápady (kolo 7: fotka jako důkaz, zamítnutí s důvodem) — provozní agenda, patří k ostatnímu
  ukoly: 'ostatni', napady: 'ostatni',
};

/** Akce, jejichž předpona patří jinam než ony samy (celý klíč má přednost před předponou). */
export const VYJIMKY_OBLASTI: readonly (readonly [string, OblastAuditu])[] = [
  ['team.settings', 'nastaveni'],
  ['team.create', 'nastaveni'],
  ['kiosk.login', 'nastaveni'],
];

const predpona = (akce: string) => String(akce ?? '').split('.')[0];

/** Má akce oblast z výslovné mapy (ne jen „ostatní" z neznalosti)? */
export function maOblast(akce: string): boolean {
  return VYJIMKY_OBLASTI.some(([k]) => k === akce) || Object.prototype.hasOwnProperty.call(OBLASTI_AUDITU, predpona(akce));
}

/** Oblast akce; neznámá předpona → „ostatní". */
export function oblastAkce(akce: string): OblastAuditu {
  const vyjimka = VYJIMKY_OBLASTI.find(([k]) => k === akce);
  if (vyjimka) return vyjimka[1];
  return Object.prototype.hasOwnProperty.call(OBLASTI_AUDITU, predpona(akce)) ? OBLASTI_AUDITU[predpona(akce)] : 'ostatni';
}

/**
 * Podmínka oblasti pro SQL (GET /api/audit?oblast=): předpony oblasti, výjimky, které
 * do ní patří navzdory předponě (`vcetne`) a které z ní odcházejí (`krome`); „ostatní"
 * bere navíc všechno s neznámou předponou (`nezname`, porovnává se se `znamePredpony`).
 */
export function podminkaOblasti(oblast: OblastAuditu): { predpony: string[]; vcetne: string[]; krome: string[]; nezname: boolean; znamePredpony: string[] } {
  const predpony = Object.entries(OBLASTI_AUDITU).filter(([, o]) => o === oblast).map(([p]) => p);
  return {
    predpony,
    vcetne: VYJIMKY_OBLASTI.filter(([, o]) => o === oblast).map(([k]) => k),
    krome: VYJIMKY_OBLASTI.filter(([k, o]) => o !== oblast && predpony.includes(predpona(k))).map(([k]) => k),
    nezname: oblast === 'ostatni',
    znamePredpony: Object.keys(OBLASTI_AUDITU),
  };
}

/** Kolik záznamů vrací GET /api/audit bez `limit` a nejvýš s ním. */
export const LIMIT_HISTORIE = { vychozi: 100, max: 200 } as const;

const kladneCele = (v: unknown): number | null => {
  const s = String(v ?? '').trim();
  if (!/^\d{1,10}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/**
 * Parametry GET /api/audit z adresy: `before` (id — starší než tenhle záznam, „Načíst
 * starší"), `limit` (výchozí 100, nejvýš 200), `user` (id člověka) a `oblast`. Cokoli
 * nečitelného se zahodí (bez filtru), ne odmítne — adresa ze záložky nesmí shodit stránku.
 */
export function parametryHistorie(q: { get: (k: string) => string | null }): { before: number | null; limit: number; user: number | null; oblast: OblastAuditu | null } {
  const limit = kladneCele(q.get('limit'));
  const oblast = q.get('oblast');
  return {
    before: kladneCele(q.get('before')),
    limit: limit == null ? LIMIT_HISTORIE.vychozi : Math.min(limit, LIMIT_HISTORIE.max),
    user: kladneCele(q.get('user')),
    oblast: (PORADI_OBLASTI as readonly string[]).includes(oblast ?? '') ? (oblast as OblastAuditu) : null,
  };
}

/** Kurzor další stránky: id posledního vráceného záznamu, když se jich načetlo víc než limit; jinak null. */
export function dalsiKurzor<T extends { id: number }>(radky: readonly T[], limit: number): { strana: T[]; nextBefore: number | null } {
  const strana = radky.slice(0, limit);
  return { strana, nextBefore: radky.length > limit && strana.length ? strana[strana.length - 1].id : null };
}

/** Záznam historie, jak ho vrací GET /api/audit. */
export interface ZaznamHistorie {
  id: number;
  action: string;
  label: string;
  detail: string | null;
  userId: number | null;
  userName: string;
  userAvatar?: string | null;
  createdAt: string;
}

/** Filtr historie v Nastavení: člověk (null = všichni), oblast a text (popis, detail, jméno; bez diakritiky). */
export function filtrujHistorii<T extends ZaznamHistorie>(zaznamy: readonly T[], f: { clovek: number | 'system' | null; oblast: OblastAuditu | null; hledani: string }): T[] {
  return zaznamy.filter(z =>
    (f.clovek == null || (f.clovek === 'system' ? z.userId == null : z.userId === f.clovek))
    && (f.oblast == null || oblastAkce(z.action) === f.oblast)
    && obsahujeNekde(f.hledani, z.label, z.detail, z.userName));
}

/** Lidé v načtené historii s počtem záznamů (nejčinnější první), pro pilulky „Eva · 3". Systém má klíč 'system'. */
export function lideHistorie(zaznamy: readonly ZaznamHistorie[]): { klic: number | 'system'; jmeno: string; pocet: number }[] {
  const m = new Map<number | 'system', { klic: number | 'system'; jmeno: string; pocet: number }>();
  for (const z of zaznamy) {
    const klic = z.userId ?? 'system';
    const r = m.get(klic) ?? { klic, jmeno: z.userName, pocet: 0 };
    r.pocet++;
    m.set(klic, r);
  }
  return [...m.values()].sort((a, b) => b.pocet - a.pocet || a.jmeno.localeCompare(b.jmeno, 'cs'));
}

/** Oblasti v načtené historii s počtem, v pevném pořadí přepínače. */
export function oblastiHistorie(zaznamy: readonly ZaznamHistorie[]): { oblast: OblastAuditu; pocet: number }[] {
  const pocty = new Map<OblastAuditu, number>();
  for (const z of zaznamy) { const o = oblastAkce(z.action); pocty.set(o, (pocty.get(o) ?? 0) + 1); }
  return PORADI_OBLASTI.filter(o => pocty.has(o)).map(o => ({ oblast: o, pocet: pocty.get(o)! }));
}
