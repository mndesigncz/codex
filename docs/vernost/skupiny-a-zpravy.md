# Skupiny a členové (G), zprávy a automatizace (Z)

Stav podle kontrolního seznamu mezer věrnostního programu. Všechny řádky mají rozhodnutí: HOTOVO (kde to je a čím je to hlídané) nebo NELZE (proč).

Sloučení: členové, skupiny a zprávy vznikly paralelně ve dvou větvích (kolo 77 W4 a okruh G a Z). Základ zůstal z kola 77 (`lib/clenoveFiltr.ts`, `lib/clenoveDb.ts`, `lib/zpravyPravidla.ts`, `lib/broadcasts.ts`, `components/client/loyalty/Clenove*.tsx` a `Zpravy*.tsx`; testy `k81-clenove.ts`, `k81-zpravy.ts`). Z okruhu G a Z se přenesly funkce, které v něm chyběly: blokace člena, sloučení duplicit, odebrání z klubu, celá historie člena, archiv skupin a přidání do skupiny z CSV, e-mailový kanál zpráv s odhlášením, kombinace segmentů, automatizace a vypnutí e-mailů hostem. Doplňky mají testy `k81-sprava-clenu.ts`, `k81-zpravy-email.ts`, `k81-skupiny.ts`, `k81-automatizace.ts`.

## Skupiny a členové

| Řádek | Stav | Kde a čím hlídané |
| --- | --- | --- |
| G1 Přejmenování skupiny, popis, barva, archiv | HOTOVO | `ClenoveSkupiny.tsx` (okno Upravit, tlačítko Archiv a „Ukázat archiv“), `groups/route.ts` (PATCH `archived`); archivovaná skupina zmizí z nabídek zpráv, hromadného přidání a razítek, členové zůstanou. Testy `k81-clenove.ts`, `k81-skupiny.ts` |
| G2 Hromadné přidání členů z filtru a z CSV | HOTOVO | Filtr → Vybrat → „Vybrat vše“ → Do skupiny (`ClenoveSprava.tsx`, `ClenoveHromadne.tsx`, `customers/bulk`); CSV v `groups/import/route.ts` a `SkupinyImport.tsx` (nejdřív náhled, nenalezení ke stažení), párování v `lib/clenoveSeznam.ts`; testy `k81-clenove.ts`, `k81-sprava-clenu.ts` |
| G3 Dynamické skupiny podle pravidel | HOTOVO | Pravidla (nepřišli N dní, útrata od X, narozeniny tento měsíc) se promítají do členů skupiny (`lib/clenoveDb.ts › obnovDynamickeSkupiny`), takže zprávy, filtr členů i cílení kuponů fungují stejně jako u ruční skupiny. Dynamická skupina nemá ruční členy. Kombinace segmentů (A / NEBO / kromě) je u zpráv, viz Z3 |
| G4 Seznam členů skupiny, počty, export | HOTOVO | Okno Členové skupiny (`ClenoveSkupiny.tsx`), export CSV; filtr podle skupiny v seznamu členů a „Export CSV“ stáhne přesně filtr |
| G5 Seznam členů: filtry, řazení, stránkování, export CSV, sloučení duplicit, blokace a smazání, poznámky, telefon | HOTOVO | Seznam, filtry, řazení, „Načíst další“ a export: `ClenoveSprava.tsx`, `customers/route.ts`, `lib/clenoveFiltr.ts`. Poznámky: `ClenoveDetail.tsx`, `notes/route.ts`. Duplicity a sloučení: `Duplicity.tsx`, `customers?duplicity=1`, `customers/sloucit/route.ts`, `lib/clenoveDb.ts › slucClena`. Blokace a odebrání z klubu: `ClenSprava.tsx`, `customers` (PATCH, DELETE). Telefon je z účtu hosta (upravuje si ho sám v profilu), vidí ho jen ten, kdo smí kontakty. Oprávnění `zakaznici.sprava_clenu` |
| G6 Hromadné akce nad výběrem (skupina, body, zpráva, kupon) | HOTOVO | Skupina, bonus bodů a zpráva: `ClenoveHromadne.tsx`, `customers/bulk/route.ts` (každá akce má svoje oprávnění a klíč akce proti zdvojení). Kupon: lišta výběru → Kupon (`KuponVybranym.tsx` → `KuponyOdeslat.tsx`, jedna cesta rozesílky kuponů s limity a 18+). Blokovaný člen nedostane body ani zprávu |
| G7 Detail člena: celá historie návštěv, útrat, kuponů, razítek podle kampaní | HOTOVO | `ClenoveDetail.tsx` (časová osa, razítka, skupiny, poznámky) a „Celá historie“ (`ClenSprava.tsx` + `customers/historie/route.ts`: Přehled, Návštěvy, Body, Útraty, Razítka, Kupony, Objednávky, Poukazy, každá část se stránkuje) |

Navíc přidáno: blokace člena (nesbírá body ani razítka, nedostává zprávy, kupon ani promo kód si nevezme, u kasy se zobrazí upozornění), odebrání člena z klubu, sloučení duplicit (stejný telefon, e-mailová schránka, jméno; poznámky, deník, kupony, razítka a skupiny přejdou na hlavního člena).

## Zprávy a automatizace

| Řádek | Stav | Kde a čím hlídané |
| --- | --- | --- |
| Z1 Kanál e-mail, příloha kuponu a promo kódu | HOTOVO | Kanál oznámení, e-mail nebo obojí: `lib/broadcasts.ts` (`deliver`, fronta dávek `davkaEmailu`), `lib/zpravyEmail.ts`, `lib/zpravyKanaly.ts`, `lib/email.ts › sendNovinkyEmail`, `ZpravyRozeslani.tsx`. Kupon nebo promo kód se oznámí a host ho uplatní stávající cestou (kupony, promo kódy). Testy `k81-zpravy.ts`, `k81-zpravy-email.ts` |
| Z1 SMS | NELZE | V aplikaci není SMS brána. Je potřeba smlouva s poskytovatelem (např. Twilio, GoSMS), API klíč, registrované jméno odesílatele a souhlas hosta se SMS. Kanál je v kódu připravený (`KanalyZpravy`), stačí přidat poskytovatele |
| Z2 Zkouška sobě, náhled pohledem hosta, úprava naplánované zprávy | HOTOVO | `zkusebniZprava` (oznámení i e-mail podle kanálu) a PATCH v `broadcast/route.ts`; náhled `ZpravyNahled.tsx` (oznámení i e-mail); testy `k81-zpravy.ts`, `k81-zpravy-email.ts` |
| Z3 Kombinace segmentů | HOTOVO | `KombinaceVyber.tsx`, `lib/skupinyPravidla.ts` (A / NEBO, „kromě“), `audienceIds` v `lib/broadcasts.ts`; test `k81-skupiny.ts` |
| Z3 Doručitelnost | HOTOVO částečně, zbytek NELZE | HOTOVO: dosah před odesláním (kdo dostane oznámení a e-mail, kdo ne a proč), po odeslání počty odeslaných, neúspěšných a bez souhlasu, fronta e-mailů bez duplicit. NELZE: stav „nedoručeno“ a „označeno jako spam“ od poštovního serveru. Potřebuje nastavit webhook v účtu Resend a ověřenou doménu v `EMAIL_FROM` |
| Z3 Odhlášení z novinek | HOTOVO | Preference hosta Profil → Oznámení a soukromí (`UcetHosta.tsx`, `novinkyEmail`), odkaz v každém e-mailu a hlavička List-Unsubscribe (`app/client/odhlasit`, `app/api/client/odhlasit`); test `k81-zpravy-email.ts` |
| Z4 Uvítací série (po přidání) | HOTOVO | `lib/automatizace.ts`, `lib/automatizaceDb.ts`, hook v `join()`, denní cron v `/api/init`; test `k81-automatizace.ts` |
| Z4 Chybíš nám | HOTOVO | Ze vlny 1 rozšířeno o vlastní text, kupon, e-mail a deník odeslání (`lib/reaktivace.ts`) |
| Z4 Narozeninový kupon | HOTOVO | Kupon + zpráva + dárkové body v jedné sekci; vlastní oznámení o bodech se při zapnutí nezdvojuje (`awardBirthdays`) |
| Z4 Po první návštěvě | HOTOVO | Hook v `stampVisit` (první návštěva člena), doběh v denním cronu |
| Z4 Po dokončení karty | HOTOVO | Hook v `addStamps` (každé dokončení) a ve starém počítadle razítek |
| Z5 Metrika „přišli do 7 dní“ jen z návštěv, limit 5/den | HOTOVO | `broadcast/route.ts`: jen skutečné návštěvy a objednávky (`kind IN ('visit', 'order')`), jen příjemci té zprávy, po kalendářních dnech v pražském čase; limit pět zpráv za den platí pro odeslání i naplánování, zkouška sobě se nepočítá |

## Jak to provozovatel používá

**Členové (Zákazníci → Členové).** Hledej jménem (s oprávněním ke kontaktům i e-mailem), seřaď a zúži přes Filtry (úroveň, skupina, chování, stav). „Export CSV“ stáhne přesně to, co vidíš ve filtru. „Vybrat“ zapne výběr; „Vybrat vše“ vybere všechny podle filtru. Pak: Do skupiny, Bonus bodů, Zpráva, Kupon. „Duplicity“ ukáže lidi se stejným telefonem, e-mailem nebo jménem; vyber hlavního člena a sluč. Detail (Deník) ukáže poznámky, skupiny, blokaci, odebrání z klubu a celou historii po částech.

**Skupiny (Věrnost → Body a úrovně).** „Nová skupina“: název, popis, barva, ruční nebo podle pravidel, sleva. Členové skupiny jsou v tlačítku Členové (export). „Z CSV“ u ruční skupiny: vlož e-maily, telefony nebo jména, nejdřív se ukáže náhled a nenalezení ke stažení. „Archiv“ skupinu schová z nabídek.

**Zprávy (Zákazníci → Zprávy členům).** Nadpis, text, kudy (oznámení, e-mail, obojí), komu (včetně kombinace podmínek), volitelně kupon a promo kód. Vpravo vidíš, jak to uvidí host, a pod výběrem kolik lidí zprávu opravdu dostane. „Poslat zkušebně sobě“ nic nespotřebuje. Naplánovanou zprávu jde upravit a zrušit v historii. E-mail dostane jen člen, který souhlasil s novinkami, nevypnul e-maily a má adresu.

**Automatizace (Zákazníci → Automatizace).** Každé pravidlo se zapíná zvlášť, má text se značkami {jmeno}, {podnik} (u některých {dny}, {body}), kupon, náhled a zkoušku. Nová pravidla se týkají členů od zapnutí. Dole je deník, co a komu odešlo.

**Provoz.** E-maily potřebují `RESEND_API_KEY` a `EMAIL_FROM` na ověřené doméně; bez nich zkouška a odeslání ukážou přesnou chybu. Podpis odkazu na odhlášení používá `NEXTAUTH_SECRET`.
