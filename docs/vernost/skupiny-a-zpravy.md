# Skupiny a členové (G), zprávy a automatizace (Z)

Stav podle kontrolního seznamu mezer věrnostního programu. Všechny řádky mají rozhodnutí: HOTOVO (kde to je a čím je to hlídané) nebo NELZE (proč).

## Skupiny a členové

| Řádek | Stav | Kde a čím hlídané |
| --- | --- | --- |
| G1 Přejmenování skupiny, popis, barva, archiv | HOTOVO | `components/client/loyalty/Skupiny.tsx` (okno Upravit, Archiv), `app/api/client/admin/groups/route.ts`, `lib/skupinyPravidla.ts`; test `scripts/testy/k81-skupiny.ts` |
| G2 Hromadné přidání členů z filtru a z CSV | HOTOVO | Filtr → Vybrat → „Vybrat všech N“ → Do skupiny (`Clenove.tsx`, `HromadneAkce.tsx`, `customers/hromadne`); CSV v `groups/import/route.ts`, párování v `lib/clenoveSeznam.ts`; test `k81-clenove.ts` |
| G3 Dynamické skupiny podle pravidel | HOTOVO | Pravidlo = jedna podmínka nebo kombinace (`lib/skupinyPravidla.ts`, `lib/broadcasts.ts › idsPodlePravidla`); platí pro zprávy, filtr členů i cílení kuponů (`lib/coupons.ts`). Dynamická skupina nemá ruční členy ani slevu; test `k81-skupiny.ts` |
| G4 Seznam členů skupiny, počty, export | HOTOVO | Okno Členové skupiny (hledání, stránkování, odebrání, přidání), Export CSV; `groups/route.ts` (`?id=&clenove=1`, `&format=csv`) |
| G5 Seznam členů: filtry, řazení, stránkování, export CSV, sloučení duplicit, blokace a smazání, poznámky, telefon | HOTOVO | `Clenove.tsx`, `ClenDetail.tsx`, `Duplicity.tsx`, `customers/route.ts` (GET filtry, řazení, stránkování, CSV; PATCH poznámka a blokace; DELETE), `customers/sloucit/route.ts`, `lib/clenoveDb.ts`; test `k81-clenove.ts`. Telefon je z účtu hosta (upravuje si ho sám v profilu), vidí ho jen ten, kdo smí kontakty |
| G6 Hromadné akce nad výběrem (skupina, body, zpráva, kupon) | HOTOVO | `HromadneAkce.tsx`, `customers/hromadne/route.ts` (každá akce má svoje oprávnění, velký výběr jde po dávkách); test `k81-clenove.ts` |
| G7 Detail člena: celá historie návštěv, útrat, kuponů, razítek podle kampaní | HOTOVO | `ClenDetail.tsx` + `customers/historie/route.ts` (části Přehled, Návštěvy, Body, Útraty, Razítka, Kupony, Objednávky, Poukazy, každá se stránkuje). Útraty jsou řádky deníku s poznámkou „Útrata…“ (připsání z účtenky, z kasy a z objednávky) |

Navíc přidáno: sloučení duplicit (stejný telefon, e-mailová schránka, jméno), blokace člena (nesbírá body ani razítka, nedostává zprávy, u kasy se zobrazí upozornění), odebrání člena z klubu, poznámka u člena, nové oprávnění `zakaznici.sprava_clenu`.

## Zprávy a automatizace

| Řádek | Stav | Kde a čím hlídané |
| --- | --- | --- |
| Z1 Kanál e-mail, příloha kuponu a promo kódu | HOTOVO | `lib/zpravyEmail.ts`, `lib/email.ts › sendNovinkyEmail`, `lib/broadcasts.ts`, `Zpravy.tsx`; test `k81-zpravy.ts` |
| Z1 SMS | NELZE | V aplikaci není SMS brána. Je potřeba smlouva s poskytalem (např. Twilio, GoSMS), API klíč, registrované jméno odesílatele a souhlas hosta se SMS. Kanál je v kódu připravený (`KanalyZpravy`), stačí přidat poskytovatele |
| Z2 Zkouška sobě, náhled pohledem hosta, úprava naplánované zprávy | HOTOVO | `posliZkousku`, `upravNaplanovanou` v `lib/broadcasts.ts`; `NahledZpravy.tsx`; `broadcast/route.ts` (POST akce `test`, PATCH); test `k81-zpravy.ts` |
| Z3 Kombinace segmentů | HOTOVO | `KombinaceVyber.tsx`, `lib/skupinyPravidla.ts` (A / NEBO, „kromě“); test `k81-skupiny.ts` |
| Z3 Doručitelnost | HOTOVO částečně, zbytek NELZE | HOTOVO: dosah před odesláním (kdo dostane oznámení a e-mail, kdo ne a proč), po odeslání počty odeslaných, neúspěšných a bez souhlasu, fronta e-mailů bez duplicit. NELZE: stav „nedoručeno“ a „označeno jako spam“ od poštovního serveru. Potřebuje nastavit webhook v účtu Resend a ověřenou doménu v `EMAIL_FROM` |
| Z3 Odhlášení z novinek | HOTOVO | Preference hosta Profil → Oznámení a soukromí (`UcetHosta.tsx`, `novinkyEmail`), odkaz v každém e-mailu a hlavička List-Unsubscribe (`app/client/odhlasit`, `app/api/client/odhlasit`); test `k81-zpravy.ts` |
| Z4 Uvítací série (po přidání) | HOTOVO | `lib/automatizace.ts`, `lib/automatizaceDb.ts`, hook v `join()`, denní cron; test `k81-automatizace.ts` |
| Z4 Chybíš nám | HOTOVO | Ze vlny 1 rozšířeno o vlastní text, kupon, e-mail a deník odeslání (`lib/reaktivace.ts`) |
| Z4 Narozeninový kupon | HOTOVO | Kupon + zpráva + dárkové body v jedné sekci; vlastní oznámení o bodech se při zapnutí nezdvojuje |
| Z4 Po první návštěvě | HOTOVO | Hook v `stampVisit` (první návštěva člena), doběh v denním cronu |
| Z4 Po dokončení karty | HOTOVO | Hook v `addStamps` (každé dokončení) a ve starém počítadle razítek |
| Z5 Metrika „přišli do 7 dní“ jen z návštěv, limit 5/den | HOTOVO | `broadcast/route.ts`: jen `kind = 'visit'` a jen příjemci té zprávy; limit pět zpráv za den platí pro odeslání i naplánování, zkouška sobě se nepočítá |

## Jak to provozovatel používá

**Členové (Zákazníci → Členové).** Hledej jménem (s oprávněním ke kontaktům i e-mailem a telefonem), seřaď a zúži přes Filtry (úroveň, skupina, chování, stav). „Export CSV“ stáhne přesně to, co vidíš ve filtru. „Vybrat“ zapne výběr; „Vybrat všech N“ vybere všechny podle filtru. Pak: Do skupiny, Ze skupiny, Body, Kupon, Zpráva. „Duplicity“ ukáže lidi se stejným telefonem, e-mailem nebo jménem; vyber hlavního člena a sluč. Detail (Deník) ukáže poznámku, skupiny, blokaci a celou historii po částech.

**Skupiny (Věrnost → Body a úrovně).** „Nová skupina“: název, popis, barva, ruční nebo dynamická, sleva jen u ruční. Členové skupiny jsou v tlačítku Členové (hledání, přidání, odebrání, export). „Přidat členy z CSV“ je v nabídce skupiny; vlož e-maily, telefony nebo jména, nejdřív se ukáže náhled a nenalezení ke stažení.

**Zprávy (Zákazníci → Zprávy členům).** Nadpis, text, kudy (oznámení, e-mail, obojí), komu (včetně kombinace podmínek), volitelně kupon a promo kód. Vpravo vidíš, jak to uvidí host, a pod výběrem kolik lidí zprávu opravdu dostane. „Poslat zkoušku sobě“ nic nespotřebuje. Naplánovanou zprávu jde upravit a zrušit v historii. E-mail dostane jen člen, který souhlasil s novinkami a nevypnul e-maily.

**Automatizace (Zákazníci → Automatizace).** Každé pravidlo se zapíná zvlášť, má text se značkami {jmeno}, {podnik} (u některých {dny}, {body}), kupon, náhled a zkoušku. Nová pravidla se týkají členů od zapnutí. Dole je deník, co a komu odešlo.

**Provoz.** E-maily potřebují `RESEND_API_KEY` a `EMAIL_FROM` na ověřené doméně; bez nich zkouška a odeslání ukážou přesnou chybu. Podpis odkazu na odhlášení používá `NEXTAUTH_SECRET`.
