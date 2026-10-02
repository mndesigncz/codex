// České popisky akcí v historii změn (Nastavení → Historie změn).
//
// Slovník žil v app/api/audit/route.ts a znal 17 z víc než 40 akcí, takže
// vedení číst „team.switch“ a „organization.settings — {JSON…}“. Teď je tady
// a scripts/check-audit-labels.mjs hlídá, že každý klíč, který kód předává
// do audit(), tu má popisek. Nová akce bez popisku shodí kontrolu v CI.

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
  'team.switch': 'Přepnutí do jiného podniku',
  'team.create': 'Založen nový podnik',
  'team.create_account': 'Založen účet člena',
  'team.remove': 'Člen odebrán z podniku',
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
  // sklad, dodavatelé, účtenky
  'inventory.create': 'Přidána položka skladu',
  'inventory.write-in': 'Zapsána nová věc do skladu',
  'inventory.delete': 'Smazána položka skladu',
  'inventory.produce': 'Vyrobeno ze skladu',
  'inventory.recipe': 'Změněno, jestli se položka vyrábí, nebo nakupuje',
  'supplier.create': 'Přidán dodavatel',
  'supplier.delete': 'Smazán dodavatel',
  'receipt.add': 'Přidána účtenka',
  // uzávěrky
  'closing.delete': 'Smazána uzávěrka',
  // odměny
  'reward.create': 'Přidána odměna',
  'reward.approved': 'Schválena odměna',
  'reward.declined': 'Zamítnuta odměna',
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
  'client.profile': 'Změna veřejné stránky podniku',
  'client.broadcast': 'Odeslána zpráva členům věrnostního programu',
  'client.reaktivace': 'Změna automatického oslovení „Chybíš nám“',
  'client.banner': 'Změna promo banneru na stránce podniku',
  'client.card': 'Změna na věrnostní kartě',
  'client.bonus': 'Změna bonusové akce věrnostního programu',
  'client.spend': 'Úprava útraty člena (úrovně podle útraty)',
  'client.order': 'Změněn stav objednávky hosta',
  'client.order.pos': 'Objednávka hosta předána do kasy',
  // předplatné
  'billing.subscription_reset': 'Předplatné vymazáno kvůli nesouladu s platební bránou',
  'billing.customer_reset': 'Zákazník platební brány zapomenut',
  'billing.referral': 'Měsíc zdarma za doporučení',
  'billing.upgrade': 'Změna tarifu na vyšší',
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
