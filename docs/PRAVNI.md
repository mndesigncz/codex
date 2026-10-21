# Právní dokumenty Managero

Stav k 21. 10. 2026 (verze dokumentů `2026-10-21`). Podklad: rešerše „Managero: právní
podklad pro dokumenty a stránky" (21. 10. 2026) s checklisty povinného obsahu. Tento
soubor je interní: co je na webu, kde je co pokryté, co je vědomě vynechané a proč, co
musí Martin udělat mimo kód a co má ověřit advokát. Na stránkách samotných se nepíše
„návrh" ani „ověřit".

## 1. Dokumenty a kde žijí

| URL (cs / en) | Dokument | Zdroj textu |
|---|---|---|
| `/obchodni-podminky`, `/en/obchodni-podminky` | Obchodní podmínky pro podniky (B2B předplatné) | `lib/pravni/dokumenty/obchodniPodminky.ts` |
| `/zpracovatelska-smlouva`, `/en/…` | Zpracovatelská smlouva (DPA, čl. 28 GDPR) | `…/zpracovatelskaSmlouva.ts` |
| `/subzpracovatele`, `/en/…` | Seznam subzpracovatelů (příloha DPA) + historie změn | `…/subzpracovatele.ts` |
| `/zruseni-predplatneho`, `/en/…` | Zrušení předplatného a vrácení peněz (Stripe) | `…/zruseniPredplatneho.ts` |
| `/podminky`, `/en/podminky` | Podmínky užívání (zaměstnanci, hosté = spotřebitelé, DSA) | `…/podminky.ts` |
| `/soukromi`, `/en/soukromi` | Zásady ochrany osobních údajů (kotvy `#cookies`, `#retence`, `#smazani`, `#opravneni`) | `…/soukromi.ts` |
| `/podpora`, `/en/podpora` | Podpora a kontakt (e-mail, telefon, DSA kontaktní místo) | `…/podpora.ts` |
| `/smazat-ucet`, `/en/smazat-ucet` | Smazání účtu (Google Play web resource) | `…/smazatUcet.ts` |
| `/informace-pro-zamestnance`, `/en/…` | Šablona „Informace pro zaměstnance" (podnik ji předá týmu) | `…/informaceProZamestnance.ts` |
| `/nahlasit` | Oznámení nezákonného obsahu (DSA čl. 16) — beze změny formuláře | `app/nahlasit` |
| `/cenik` | Přesměrování na ceník na landingu (`/#cenik`) | `app/cenik/page.tsx` |

Společné:
- **Údaje provozovatele** — `lib/firma.ts` (výchozí hodnoty z ARES, `FIRMA_*` je přebíjí;
  `identifikace()` pro patičky a e-maily, `patickaFaktury()` pro Stripe).
- **Lhůty, ceny, retence** — `lib/pravni/lhuty.ts` (ceny z `lib/plan.ts`; zrcadlo
  `lib/retence.ts` hlídá test `scripts/testy/k88-pravni-souhlas.ts`).
- **Odkazy** — `lib/pravni/odkazy.ts`; v textu `[[klic|text]]` → odkaz (komponenta
  `components/pravni/TextSOdkazy.tsx`), e-mail a telefon se prolinkují samy.
- **Verze a souhlas** — `lib/pravni/verze.ts` (`VERZE_PODMINEK`, `VERZE_ZASAD`),
  brána `components/pravni/NovaVerze.tsx` (vlastník podniku dostane variantu s obchodními
  podmínkami a DPA), zaškrtávátko `components/pravni/SouhlasPodminek.tsx` (`podnik`).
- **Identifikace provozovatele** je v patičce všech právních stránek, `/nahlasit`, landingu,
  pod každým e-mailem (`lib/email.ts` → `sPatickouProvozovatele`) a na fakturách Stripe
  (`invoice_settings.footer` u zákazníka, `lib/billing.ts`).

### Jak dokument změnit
1. Upravit text v `lib/pravni/dokumenty/…` (obě jazykové verze).
2. Věcná změna → zvýšit `VERZE_PODMINEK` / `VERZE_ZASAD` a `UCINNOST` v `lib/pravni/lhuty.ts`.
   Brána NovaVerze pak přihlášené požádá o nový souhlas.
3. Změna obchodních podmínek, cen nebo DPA pro podniky: **e-mail vlastníkům nejméně 30 dní
   předem** (slíbeno v čl. 18 OP). Hromadné oznámení v kódu není — poslat ručně / skriptem.
4. Nový subzpracovatel: e-mail vlastníkům 30 dní předem + řádek do „Historie změn" na
   `/subzpracovatele`.

## 2. Pokrytí checklistů podkladu

Značky: ✅ pokryto (kde) · ➖ vědomě vynecháno (proč) · ⚠ pokryto částečně / úkol mimo web.

### 2.1 Identifikace provozovatele (§ 435 OZ)
- ✅ Jméno, sídlo, zápis „v živnostenském rejstříku vedeném Městským úřadem Jeseník", IČO,
  „Neplátce DPH", e-mail, telefon: `lib/firma.ts` → patička právních stránek, `/nahlasit`,
  landing, `/podpora`, OP čl. 1, DPA čl. 1, zásady, podmínky, e-maily, faktury.
- ✅ „Managero je obchodní značka, ne společnost": OP čl. 1; patička „Managero provozuje …".
- ✅ V aplikaci: Managero → Nastavení → O aplikaci a Managero client → Moje → Účet a soukromí
  (`components/pravni/ProvozovatelInfo.tsx`: věta `identifikace()` + odkazy 44 px). Bere výchozí
  údaje z `lib/firma.ts` (`firma({})`, běží i v prohlížeči) — proměnné `FIRMA_*` se tu neprojeví.

### 2.2 Obchodní podmínky B2B
- ✅ Smluvní strany, zákazník = podnikatel, spotřebitel nemůže objednat: čl. 1.
- ✅ Prohlášení „jednám jako podnikatel" při registraci: `SouhlasPodminek podnik` v `components/registrace/Cesta.tsx`.
- ✅ Povinné IČO před objednávkou placeného tarifu: pokladna Stripe má povinné pole „IČO“
  (`custom_fields`, 8 číslic; `lib/icoPokladna.ts`), předvyplněné z Nastavení → Profil podniku.
  Webhook `checkout.session.completed` ověří kontrolní součet (mod 11), uloží IČO do `teams.ico`
  a na faktury zákazníka (`invoice_settings.custom_fields`), název firmy z pokladny do jména
  zákazníka. Neplatné IČO se neuloží (záznam v historii změn). OP čl. 1: objednat smí jen podnikatel,
  uvede IČO. Registrace podniku (tarif Zdarma) IČO dál nevyžaduje — B2B nese prohlášení v click-wrapu.
- ✅ Předmět (SaaS, licence, ne prodej SW), vývoj funkcí: čl. 3.
- ✅ Uzavření smlouvy, archivace verze, jazyk, oprava chyb: čl. 4 (verze + čas u účtu).
- ✅ Tarify, ceny, měna, konečné ceny, neplátce DPH, doložka pro registraci k DPH **s právem
  vypovědět** (konzervativní varianta): čl. 5.
- ✅ Zkušební doba 30 dní, upozornění 3 dny předem (Stripe `trial_will_end` → push + e-mail),
  automatický přechod na placený: čl. 6.
- ✅ Platby Stripe, automatické prodlužování, faktury e-mailem, „neplátce DPH": čl. 7.
- ✅ Neúspěšná platba → upozornění → konec předplatného → Zdarma (podle kódu: `past_due` drží
  tarif, po posledním pokusu Stripe předplatné zruší); bez pokut: čl. 8.
- ✅ Změna tarifu (prorace Stripe): čl. 9. Zrušení ke konci období, bez vracení, výjimky: čl. 10 + `/zruseni-predplatneho`.
- ✅ Kupony (MAX30) a doporučení (kredit = měsíční cena tarifu, max. 3/měsíc): čl. 11.
- ✅ Dostupnost bez SLA, údržba, výpadky subdodavatelů, podpora, vady (oprava, sleva, výpověď): čl. 12.
- ✅ Povinnosti zákazníka (pravdivost, přístupy, zákaz zneužití, správce dat, informování,
  souhlasy hostů, odesílatel novinek = podnik): čl. 13.
- ✅ Pracovní právo (§ 346b bez pokut, krácení jen nenárokové prémie podle předem daných
  kritérií za období, § 146–147 srážky, § 250/252, § 52 g), § 316 kontrola, rozhoduje člověk,
  žádné poradenství): čl. 14.
- ✅ Data zákazníka, anonymní statistiky, odkaz na DPA, zálohy: čl. 15. Duševní vlastnictví: čl. 16.
- ✅ Omezení odpovědnosti **viditelně** (úvodní věta článku): strop = ceny za 12 měsíců, nejméně
  10 000 Kč; bez ušlého zisku a nepřímých škod; ztráta dat → obnova ze zálohy; výjimky § 2898
  (úmysl, hrubá nedbalost, přirozená práva); nedotčen čl. 82 GDPR; odškodnění zákazníkem: čl. 17.
- ➖ Zkrácení lhůty pro uplatnění nároků (§ 630 OZ): vynecháno — sporné, nejistý přínos (k ověření).
- ✅ Změny podmínek a cen 30 dní předem, právo odmítnout a vypovědět bez sankce + vrácení
  poměrné části (§ 1752): čl. 18.
- ✅ Ukončení: zákazník kdykoli, poskytovatel s výpovědní dobou 2 měsíce, okamžitě při podstatném
  porušení; smazání nepoužívaného zrušeného podniku po 90 dnech jen po e-mailu vlastníkovi a správcům
  předplatného 30 a 7 dní předem (podle `lib/retence.ts` → `rozhodniPodnik`): čl. 19.
- ✅ Data Act čl. 25: popis exportu (JSON záloha + CSV moduly + na požádání další data),
  přechodné období 30 dní, vyzvednutí ≥ 30 dní, výmaz, zálohy do 30 dní, bez poplatků za
  přechod: čl. 20. Výpovědní doba zákazníka „kdykoli" (≤ 2 měsíce splněno).
- ⚠ Data Act — **záloha JSON nenese soukromé zprávy a mzdové údaje** (`app/api/backup/_data.ts`);
  OP to říká a nabízí vydání dalších dat na požádání. Ruční export mzdových dat je na Martinovi.
- ✅ Předem daný souhlas s postoupením na budoucí s.r.o. (§ 1895), oznámení 30 dní, právo vypovědět: čl. 21.
- ✅ Doručování e-mailem, české právo, soud podle sídla poskytovatele, přednost DPA, česká verze rozhodná, účinnost: čl. 22–24.
- ✅ „Co nedávat": žádné smluvní pokuty vůči zákazníkovi, žádné skryté poplatky, žádný automatický přechod na dražší tarif.

### 2.3 Zpracovatelská smlouva (čl. 28 GDPR)
- ✅ Předmět, doba, povaha a účel, kategorie subjektů a údajů (podle tabulek v `app/api/init`):
  čl. 1–5 (poloha při píchání jen výsledek + vzdálenost, fotky u trestů jen přiložené vedením,
  žádná biometrie, zvláštní kategorie nejsou určené).
- ✅ (a) doložené pokyny vč. třetích zemí + upozornění na protiprávní pokyn: čl. 6.
- ✅ (b) mlčenlivost: čl. 8. ✅ (c) opatření čl. 32 (reálná z kódu): čl. 9.
- ✅ (d) subzpracovatelé: obecné povolení, seznam, oznámení 30 dní předem, námitka 30 dní,
  výpověď bez sankce, stejné povinnosti, odpovědnost: čl. 10.
- ✅ (e) práva subjektů (nástroje v aplikaci, předání žádosti do 5 prac. dnů): čl. 12.
- ✅ (f) čl. 32–36 součinnost; porušení zabezpečení do 48 hodin s obsahem čl. 33 odst. 3: čl. 12.
- ✅ (g) výmaz/vrácení po skončení, zálohy do 30 dní, retence během smlouvy: čl. 13.
- ✅ (h) informace a audit (dotazník, ohlášený audit 1× ročně na náklady správce): čl. 14.
- ✅ Předávání do USA: DPF (rozhodnutí 2023/1795) + záložní SCC (2021/914): čl. 11 + seznam.
- ✅ Managero jako samostatný správce (účty, účet hosta napříč podniky, bezpečnost, podpora,
  fakturace, DSA, statistiky) vyjmuto z DPA: čl. 15.
- ✅ Odpovědnost: strop podle OP, nedotčen čl. 82 a pokuty úřadu: čl. 16.
- ➖ Doslovné převzetí SCC 2021/915: nepřevzato (příliš dlouhé pro web); obsah pokrývá čl. 28 odst. 3
  a stanoví přednost GDPR (k ověření, zda nepřevzít celé doložky).
- ➖ Pověřenec (DPO): nejmenován, zásady to říkají. Při růstu znovu posoudit (podklad 2.3).
- ⚠ Šifrování v klidu (Neon, Vercel Blob) a **dvoufázové ověření účtů u poskytovatelů** jsou
  v DPA jako závazek — Martin musí ověřit/zapnout (§3).

### 2.4 Zásady ochrany osobních údajů
- ✅ Správce + kontakty (e-mail, telefon, adresa), DPO nejmenován: „Kdo jsme".
- ✅ Rozlišení správce / zpracovatel (podnik správcem dat v podniku, žádosti předáme): „Kdy jsme správce…".
- ✅ Údaje jako správce, údaje hostů a zaměstnanců (podle kódu): tři sekce.
- ✅ Účely + právní základy po účelech (čl. 6), oprávněné zájmy, námitka, povinnost poskytnout: „Proč…".
- ✅ Příjemci (odkaz na subzpracovatele), Stripe zčásti samostatný správce, podnik, úřady: „Komu…".
- ✅ Předání do USA (DPF/SCC): „Předávání mimo EU".
- ✅ Retence po účelech (účet, neaktivní host 24 m + upozornění 30 dní, pokusy přihlášení 1 den,
  audit 3 roky, oznámení 365 dní, zrušený podnik 90 dní bez aktivity + upozornění 30 a 7 dní předem,
  fakturace „až 10 let", zálohy 30 dní): `#retence`. Účet nese i den posledního otevření aplikace.
- ✅ Práva + ÚOOÚ (adresa), lhůta 1 měsíc, export účtu v aplikaci: „Vaše práva".
- ✅ Automatizované rozhodování (body, žebříčky, návrhy trestů = výpočty, rozhoduje člověk, čl. 22 neprovádíme): „Automatizované rozhodování".
- ✅ Věk 15+: „Děti". ✅ Cookies a localStorage výčet (relace 30 dní, CSRF/callback, jazyk 1 rok,
  tablet 1 h, localStorage nastavení, kód doporučení): `#cookies`.
- ✅ Oprávnění aplikace (poloha jen v popředí v okamžiku akce, fotoaparát, mikrofon, oznámení, jak vypnout): `#opravneni`.
- ✅ Sekce smazání s kotvou `#smazani` (Google Play). ✅ Datum účinnosti a verze.
- ✅ Obchodní sdělení: Managero marketing zatím neposílá (pravdivě), novinky podniků se souhlasem.
- ⚠ Fakturační doklady „až 10 let": přesná lhůta pro neplátce (daň z příjmů / daňový řád vs.
  § 35 ZDPH u identifikované osoby) — k ověření u daňového poradce.

### 2.5 Podmínky pro hosty (B2C, zdarma)
- ✅ Totožnost, adresa, telefon, e-mail (§ 1820 b, c): „Kdo službu poskytuje".
- ✅ Hlavní vlastnosti, cena zdarma + náklady na připojení: „Co aplikace jsou a kolik stojí".
- ✅ Trvání a ukončení (smazání účtu), odstoupení 14 dní (§ 1829): „Ukončení".
- ✅ Technické kroky, jazyk, archivace, oprava chyb (§ 1826), kompatibilita a interoperabilita: „Založení účtu…".
- ✅ Vady: hlášení na podporu, vyřízení do 30 dnů, zákonná práva nedotčena (konzervativně bez
  rozhodnutí, zda se § 2389g odst. 2 uplatní).
- ✅ Výhody, rezervace, objednávky = závazky podniku, Managero technický nástroj: „Pro hosty".
- ✅ ADR ČOI (adr.coi.gov.cz), dozor ČOI a ÚOOÚ: „Stížnosti a spory". ✅ **ODR neuvedeno** (sonda hlídá).
- ✅ Věk 15+, pravidla chování, moderace, nahlášení; novinky (odesílatel podnik, souhlas,
  odhlášení); změny s novým souhlasem v aplikaci.

### 2.6 DSA
- ✅ Čl. 11 a 12 kontaktní místo (e-mail, telefon, jazyky cs/en): `/podpora`, `/podminky#kontaktni-misto`, `/nahlasit`.
- ✅ Čl. 14 pravidla obsahu, moderace (kdo, nástroje, lidské posouzení, žádné algoritmy,
  přiměřenost zásahů), interní vyřizování stížností (ohrazení do 6 měsíců, přezkum člověkem): `/podminky#obsah`, `#moderace`.
- ✅ Čl. 16 oznámení s náležitostmi (beze změny formuláře), čl. 17 odůvodnění, čl. 18 oznámení orgánům: `/podminky`.
- ➖ Čl. 15 zprávy o transparentnosti a čl. 19–28 (online platformy): mikropodnik je vyloučen.
- ➖ Mimosoudní orgány podle čl. 21: týkají se online platforem (vyloučeno pro mikropodnik), neuvádíme.
- ➖ ČTÚ jako koordinátor: stav prováděcího zákona nejistý, neuvádíme (nařízení platí přímo).

### 2.7 Cookies
- ✅ Jen nezbytné cookies a úložiště → bez lišty, výčet v zásadách `#cookies`.
- ✅ Žádná analytika (ověřeno grepem 21. 10. 2026: žádné `@vercel/analytics`, gtag, posthog,
  sentry, plausible, umami; písmo Geist je lokální přes next/font). **Při přidání analytiky
  je nutná lišta se souhlasem.**

### 2.8 Obchodní sdělení
- ✅ Novinky podniků jen se souhlasem, odesílatel podnik, odhlášení v každém e-mailu a v profilu:
  podmínky, zásady, OP čl. 13 (odpovědnost podniku). Mechanismus v kódu existuje (`consents`, List-Unsubscribe).
- ➖ Push marketing a 480/2004: nerozhodujeme; v podmínkách jen obecně (k ověření).
- ✅ Marketing Managera: zatím se neposílá (zásady to pravdivě říkají).

### 2.9 App Store a Google Play
- ✅ Zásady a smazání účtu jako veřejné stránky bez přihlášení (URL viz §1), kotva `#smazani`,
  co se maže / zůstává / jak dlouho (`/smazat-ucet`).
- ⚠ App Store Connect / Play Console: vyplnit URL, App Privacy, Data safety, DSA trader (§3).
- ✅ V aplikacích se nic nekupuje (beze změny; obal blokuje platby).

### 2.10 Stripe (web checklist)
- ✅ Popis služby a cen s měnou: ceník na landingu (`/cenik`) + OP čl. 5.
- ✅ Kontakt více kanály (e-mail + telefon): `/podpora`, patičky.
- ✅ Refund a cancellation policy: `/zruseni-predplatneho` + OP čl. 10.
- ✅ Zásady, adresa podnikání, podmínky akcí a zkušební doby (OP čl. 6, 11; ceník).
- ✅ Ceník a pokladna: „Ceny jsou konečné, provozovatel není plátcem DPH" + automatické
  obnovování (dřív chybně „bez DPH"): `components/Pricing.tsx`, `Billing.tsx`, `CheckoutModal.tsx`.
- ➖ Loga karet: vynecháno (doporučené, ne povinné; pokladna Stripe je ukazuje).

### 2.11 Reklamace — ✅ B2B vady OP čl. 12; hosté podmínky „Dostupnost, vady a změny". Samostatný reklamační řád není potřeba.
### 2.12 Přístupnost — ➖ mikropodnik mimo působnost zákona 424/2023; WCAG drží design.
### 2.13 Zaměstnanecká data — ✅ OP čl. 14, DPA čl. 5 a 7, šablona `/informace-pro-zamestnance` (§ 316 odst. 3 ZP + čl. 13 GDPR). Přejmenování „trestů" v UI na „hodnocení plnění kritérií" je mimo tento balík (k ověření, §4).
### Kap. 3 OSVČ — ✅ strop a výluky v OP čl. 17, ✅ postoupení na s.r.o. čl. 21; pojištění a sídlo §3.
### 5.2 Faktura — ✅ patička faktury z `lib/firma.ts` („Nejsem plátce DPH", jméno, IČO, sídlo, zápis); ✅ IČO odběratele z povinného pole pokladny / profilu podniku (`invoice_settings.custom_fields`), DIČ přes `tax_id_collection`. ⚠ U první (nulové) faktury zkoušky se IČO zadané až v pokladně ještě neobjeví — webhook ho zákazníkovi doplní hned potom; má-li ho podnik v profilu předem, je na faktuře od začátku.
### 5.3 Pokladna — ✅ cena + měna + perioda, automatické obnovování, zkušební doba (modal); ⚠ povinné zaškrtnutí v pokladně Stripe jen po zapnutí `STRIPE_SOUHLAS_PODMINEK=1` (§3); ✅ B2B prohlášení je v registraci.

### 1A/1B/1C (seznam dokumentů)
- ✅ 1–11 (identifikace, OP, DPA, subzpracovatelé, zásady, podmínky hostů, ADR, smazání, DSA, obchodní sdělení, faktura).
- ⚠ 12 Záznamy o činnostech zpracování a 13 postup pro incidenty: interní dokumenty → Martin (§3).
- ➖ Poučení o odstoupení + formulář: netýká se (hosté zdarma, podniky B2B). P2B nařízení: k ověření.
- ✅ Doporučené: podpora s telefonem, ceník, refund policy, retence, TOMs (DPA čl. 9 — samostatná
  stránka `/bezpecnost` vynechána, opatření jsou v DPA), šablona pro zaměstnance, AUP (v podmínkách),
  verze a datum. ➖ Šablona „Informace pro hosty": nevytvořena (čas; host dostává informace
  ze zásad Managera a od podniku) — doporučeno doplnit.

## 3. Co musí Martin udělat mimo kód

**Stripe Dashboard**
1. Settings → Business → Public details: Terms of service URL `https://www.managero.app/obchodni-podminky`,
   Privacy policy URL `https://www.managero.app/soukromi`, support e-mail `podpora@managero.app`,
   telefon `+420 727 960 413`, adresa. Statement descriptor např. `MANAGERO`.
2. Pak ve Vercelu nastavit **`STRIPE_SOUHLAS_PODMINEK=1`** (Production) a redeploy — pokladna
   začne vyžadovat zaškrtnutí souhlasu s podmínkami (`consent_collection.terms_of_service`).
   Bez URL v kroku 1 Stripe pokladnu odmítne, proto nejdřív krok 1.
3. Settings → Invoices → Default footer: stejný text jako `patickaFaktury()`
   („Martin Nemeškal, IČO 17944953, Míru 482, 790 70 Javorník. Zapsán v živnostenském rejstříku
   vedeném Městským úřadem Jeseník. Nejsem plátce DPH. podpora@managero.app") — pojistka; kód ho
   nastavuje každému zákazníkovi i sám.
4. Stripe Tax vypnutý, žádné tax rates (neplátce nesmí na dokladu uvést DPH).
5. Billing → Revenue recovery: po posledním neúspěšném pokusu **zrušit předplatné** (OP čl. 8 to tak popisuje).
6. Kupon `MAX30`: nastavit `duration = once` (UI i OP čl. 11 slibují slevu 30 % „na první platbu“).
7. Customer portal: zrušení „at period end" (kód to nastavuje u vlastní konfigurace).
7a. Settings → Customer emails: zapnout posílání **faktur / potvrzení o platbě** zákazníkům
   (OP čl. 7 slibuje, že fakturu „pošle e-mailem"; bez toho je jen v portálu).

**Vercel**
8. Přejít na **plán Pro** (Hobby zakazuje komerční provoz a DPA Vercelu platí jen pro Pro).
9. Ověřit **region Blob úložiště** (Storage → Blob → region); ideálně Frankfurt (`fra1`). Seznam
   subzpracovatelů uvádí „serverové funkce ve Frankfurtu" — to zajišťuje `vercel.json` `regions: ["fra1"]`.
10. Zapnout **`RETENCE_ZAPNUTA=1`** — zásady a DPA popisují lhůty retence jako platné; bez proměnné
   cron jen počítá náhled a nic nemaže. Od 21. 10. 2026 je zapnutí bezpečné (upozornění 30 a 7 dní
   předem, širší aktivita, viz §7) — ale **až po nasazení** této verze, po `/api/init` (nové sloupce)
   a po kontrole náhledu ve Správě platformy → Retence. Vyžaduje funkční Resend (`RESEND_API_KEY`,
   `EMAIL_FROM`): bez odeslaného upozornění se podnik nesmaže a běh hlásí chybu.
11. `FIRMA_*` proměnné nejsou potřeba (výchozí údaje jsou v kódu; od oponentury i pro e-mail moderace,
   viz §6). Až bude DIČ: `FIRMA_DIC=CZ…`
   (DIČ identifikované osoby **neznamená** plátce). Při registraci k DPH navíc `FIRMA_PLATCE_DPH=1`
   a upravit texty ceníku/pokladny (dnes natvrdo „neplátce DPH").

**Neon, Resend, další**
12. Neon: region ověřen (`aws-eu-central-1`); **historie pro obnovu je jen 6 hodin** (aktuální plán) —
   zvážit vyšší plán (7+ dní), DPA i zálohy v textech počítají s obnovou k bodu v čase.
13. Akceptovat/podepsat DPA u Vercelu, Neonu, Resendu, Stripe; PDF archivovat.
14. **Schránka `podpora@managero.app` musí přijímat poštu** (Resend jen odesílá): MX záznam domény +
   schránka nebo přeposílání. Telefon `+420 727 960 413` je na webu jako zákaznická linka.
15. **Dvoufázové ověření** u Vercelu, Neonu, GitHubu, Stripe, Resendu, Apple a Google účtů (slíbeno v DPA čl. 9).
16. **Anthropic (MCP správy platformy, `app/api/mcp`)**: je v seznamu subzpracovatelů, protože nástroje
   vracejí jména a e-maily uživatelů podniků. Buď používat jen v rámci obchodních podmínek Anthropic
   s DPA (API / Team / Enterprise), nebo MCP s ostrými daty nepoužívat a řádek ze seznamu odebrat
   (s oznámením podle čl. 10 DPA, pokud by šlo o přidání).

**Daně, právo, obchody**
17. **DPH § 6h (identifikovaná osoba)**: daňový poradce, registrace do 15 dnů (možná zpětně kvůli
   placeným zahraničním službám), DIČ dodavatelům. Obratový limit 2 000 000 Kč / 2 536 500 Kč hlídat
   za celou osobu. Prodej do EU → § 6i a souhrnné hlášení (doporučeno zatím prodávat jen v ČR).
18. Pojištění profesní odpovědnosti IT + kyber (limit sladit se stropem v OP).
19. Rozhodnout o sídle (virtuální sídlo) **před** vyplněním DSA trader údajů v App Store Connect / Play Console.
20. App Store Connect a Play Console: URL zásad a smazání účtu, App Privacy / Data safety v souladu se zásadami.
21. Interní **záznamy o činnostech zpracování** (čl. 30 odst. 1 a 2) a **postup pro incidenty**
   (čl. 33; DPA slibuje hlášení podnikům do 48 hodin).
22. Datová schránka (FÚ, ÚOOÚ, ČOI), rešerše značky Managero (ÚPV/EUIPO), NIS2 kalkulačka NÚKIB.
23. Při změně OP/DPA/subzpracovatelů posílat **e-mail vlastníkům 30 dní předem** (kód to sám nedělá).

## 4. Body k ověření advokátem (v textech je konzervativní varianta)

1. **Role u účtu hosta napříč podniky**: zvoleno „účet a přihlášení = Managero správce, data
   věrnosti a novinky podniku = zpracovatel pro podnik" (komentář v `soukromi.ts`, `zpracovatelskaSmlouva.ts`).
   Alternativa: společní správci (čl. 26).
2. **DPH doložka**: připočtení DPH s oznámením 30 dní **a právem vypovědět** (OP čl. 5) — zda by u B2B
   prošla i bez práva výpovědi.
3. **Strop odpovědnosti** 12 měsíců plateb / min. 10 000 Kč a výluky (§ 433, § 1753, § 2898) — přiměřenost
   vůči malým podnikům; zda přidat zkrácení lhůty pro nároky (§ 630).
4. **Data Act čl. 25** pro malý SaaS: přechodné 30 + vyzvednutí 30 dní; okamžitý výmaz při smazání
   podniku zákazníkem; smazání nepoužívaného zrušeného podniku po 90 dnech s e-mailem 30 a 7 dní
   předem (od 21. 10. 2026 v kódu); vývoj Digital Omnibus.
5. **DPA**: zda převzít celé SCC 2021/915; strop v DPA a regres; audit 1× ročně na náklady správce.
6. **Krácení nenárokové prémie jako „trest"** vs. § 346b a NS 21 Cdo 3471/2024 — OP to váže na předem
   stanovená kritéria za období; zvážit přejmenování v UI.
7. **Poloha při píchání**: právní základ (oprávněný zájem) a § 316 ZP; šablona pro zaměstnance to tak formuluje.
8. **§ 2389g odst. 2** (vady digitální služby u hostů) — v podmínkách obecná formulace s 30denní lhůtou.
9. **P2B nařízení** pro Managero client (rezervace, kupóny) — v textech neřešeno.
10. **Push marketing** a 480/2004.
11. **Odstoupení do 14 dnů** u bezplatné služby (uvedeno pro jistotu).
12. Retence fakturačních dokladů neplátce („až 10 let") — daňový poradce.
13. Anthropic jako subzpracovatel (viz §3 bod 16).

## 5. Co v kódu zbývá (mimo tento balík nebo nestihnuto)

- ~~Povinné IČO v pokladně~~ — hotovo (§7). ~~Upozornění před smazáním zrušeného podniku~~ — hotovo (§7).
- **Hromadný e-mail** vlastníkům o změně OP/DPA/subzpracovatelů (dnes ručně).
- ~~Identifikace provozovatele v Nastavení → O aplikaci~~ — hotovo (§7). Odkazy na obchodní podmínky
  přímo v Nastavení → Předplatné (`components/Billing.tsx`) zůstávají na příští úpravu (pokladna je má).
- ~~Přeškrtnutá „srovnávací" cena v pokladně~~ — opraveno v oponentuře (§6). `PRICES.*.yearCompare`
  v `lib/plan.ts` (a v `lib/demo/routy/zaklad.ts`) už UI nepoužívá; při příští úpravě `lib/plan.ts` smazat.
- Texty ceníku a pokladny o DPH jsou psané pro neplátce natvrdo; při registraci k DPH přepsat.
- Šablona „Informace pro hosty" pro podniky.

## 6. Oponentura (21. 10. 2026)

Nezávislá kontrola všech dokumentů (cs i en) proti checklistům podkladu, proti kódu a proti
sobě navzájem. Závažnost: **blokující** (nesmí na ostrý provoz), **důležité** (právní riziko nebo
nepravdivý slib), **drobné** (přesnost, čitelnost).

### 6.1 Co jsem změnil

Blokující:
- **Klamavá referenční cena** (§ 4–5 ZOS): pokladna (`components/CheckoutModal.tsx`) i karta tarifu
  v Nastavení → Předplatné (`components/Billing.tsx`) ukazovaly přeškrtnutou cenu 4 990 / 9 988 Kč,
  která se nikdy neúčtovala. Nově spočtená úspora jako na landingu („Ušetříte 1 998 Kč oproti
  měsíčnímu placení…"). Test `k88-pravni-souhlas` hlídá, že se `<s>` ani `pr.yearCompare` nevrátí.
- **Nahlášení obsahu by provozovateli nechodila** (DSA čl. 16): `lib/moderace.ts → kontaktModerace`
  četla jen proměnnou `FIRMA_EMAIL_PODPORY`, kterou balík právních stránek prohlásil za nepovinnou.
  Bez ní by se nahlášení z chatu i oznámení z `/nahlasit` uložila, ale nikomu neohlásila. Teď
  záloha na `firma().emailPodpory`; test `k88-obal` upraven.
- **Landing sliboval „Po konci předplatného data nemažeme" a „nic nemizí"**, ačkoli OP čl. 19 a
  zásady (a `lib/retence.ts`) mažou podnik po skončeném předplatném nebo zkoušce a 90 dnech bez
  aktivity. Nově „data nemažeme, dokud podnik používáš" (cs, en, de, sk, pl).

Důležité:
- **Cesty ke smazání účtu a stažení dat** vedly na neexistující „Profil → Smazat účet" a
  „Nastavení → Účet → Smazat účet" (Google Play chce přesné kroky). Správně: Managero →
  Nastavení → Data a soukromí; Managero client → Moje. Opraveno v zásadách, podmínkách, podpoře,
  smazání účtu a zrušení předplatného; test porovná cesty se `Settings.tsx` a `ClientShell.tsx`.
- **OP čl. 19 a 20 — smazání podniku**: v aplikaci nejde smazat jen podnik; maže se účet vlastníka
  i se všemi vlastněnými podniky (heslo + slovo SMAZAT) a předplatné se ruší okamžitě bez vrácení.
  Texty to teď říkají (i `/smazat-ucet`).
- **OP čl. 20 — export (Data Act čl. 25)**: CSV exporty jsou jen v Pro a Max; text sliboval
  „kdykoli". Teď: JSON záloha + CSV v Pro/Max, ostatní data na požádání v každém tarifu.
- **Zásady — úložiště v zařízení** (§ 89 odst. 3 ZEK, čl. 13 GDPR): chyběla offline kartička hosta
  (localStorage / úložiště nativní aplikace), fronta příchodů a otisky PINů na sdíleném tabletu a
  cache service workeru. Doplněno (vše nezbytné, lišta dál netřeba).
- **Zásady — doba uložení** (čl. 13 odst. 2 písm. a)): chyběla u komunikace s podporou a technických
  logů. Doplněno: podpora do vyřízení + nejvýš 3 roky (promlčení), logy hostingu dny.
- **DPA čl. 9**: „soubory vydávané jen přihlášeným" neplatí pro obrázky veřejné stránky podniku
  (`app/api/client/img`). Doplněna výjimka.
- **OP čl. 14 — prémie** (§ 346b ZP, NS 21 Cdo 3471/2024): místo „krátit lze nenárokovou prémii"
  nově „nepřiznat nebo snížit jen za nesplnění předem daných kritérií za období; přiznanou mzdu
  nebo odměnu krátit nelze". Stejně šablona pro zaměstnance (+ fotka u napomenutí).
- **/api/health** ukazuje `funkce.retenceOstra` — dokumenty popisují retenci jako platnou, cron je bez
  `RETENCE_ZAPNUTA=1` jen náhled.

Drobné:
- „Databáze leží v Evropské unii (Evropská unie (…))" → „Kde data leží: …"; anglické znění bere
  umístění z `lib/firma.ts` (`regionDatEn`), ne natvrdo (dřív by se po změně `FIRMA_REGION_DAT`
  rozešlo s češtinou).
- Podmínky užívání: smlouva na dobu neurčitou, „nejsme vázáni kodexem chování" (§ 1826 odst. 1
  písm. e)), ADR ČOI srozumitelnou větou a s adresou (Štěpánská 15, Praha 2); zaměstnanec
  nepotvrzuje věk (dřív „souhlas potvrdí stejně").
- Zásady: IČO/DIČ podniku „pokud je vyplníte" (pokladna sbírá jen DIČ); telefon hosta vidí podnik
  u rezervace; odhlášení novinek v Moje → Oznámení a soukromí.
- Retence podniků popsaná přesně: i po skončené zkoušce, „nikdo nic nezměnil ani nezapsal docházku"
  (tak to počítá `lib/retenceDb.ts`: `audit_log` + `time_entries`).
- Pokladna odkazuje na obchodní podmínky a zrušení předplatného (nová záložka).

Ověřeno v kódu a beze změny (sedí): DPH formulace všude „neplátce / ceny konečné", žádné ODR,
ADR ČOI v podmínkách, ceny a zkušební doba z `lib/plan.ts`, zkouška jen jednou na podnik,
`trial_will_end` → push + e-mail, `past_due` drží tarif, doporučení 3× za kalendářní měsíc
(Praha), portál ruší „at period end", soukromé zprávy a sazby nejsou v záloze, záloha přes podepsaný
odkaz 7 dní, soubory v privátním Blobu, HSTS a CSP v `next.config.js`, bcrypt, poloha jen jako
vzdálenost (poloměry 100/200/500 m), DSA potvrzení a odůvodnění (`lib/dsaDb.ts`), jméno a e-mail
oznamovatele povinné kromě ohrožení dětí, smazání vlastníka ruší Stripe předplatné i zákazníka,
žádná analytika.

### 6.2 Co zůstává a proč

Na Martinovi před ostrým provozem (navíc k §3):
- ✅ *Vyřešeno 21. 10. 2026 (§7): upozornění 30 a 7 dní předem a širší aktivita jsou v kódu; zapnout
  po nasazení.* Původní zjištění: **`RETENCE_ZAPNUTA=1`** — bez ní zásady i DPA slibují lhůty, které se neplní. Ale pozor: zapnutím
  se zároveň začnou **bez upozornění** mazat podniky po 90 dnech bez aktivity, a „aktivita" je jen
  záznam v protokolu změn nebo docházka (tým, který jen chatuje nebo jen čte rozvrh, se počítá jako
  neaktivní). Doporučení: před zapnutím doplnit do `lib/retenceDb.ts` (jiný balík) e-mail vlastníkovi
  30 dní předem a širší kritérium aktivity (přihlášení, zprávy, směny). Do té doby text OP čl. 19
  odpovídá kódu, ale je pro zákazníka tvrdý (§ 433 OZ, Data Act čl. 25).
- **Přechodné období 30 dní po výpovědi e-mailem** (OP čl. 20) aplikace sama nedrží — po výpovědi je
  potřeba podnik ručně nechat 30 dní běžet, pak 30 dní držet data k vyžádání a pak smazat. Zapsat si
  postup.
- **Komunikace s podporou nejvýš 3 roky** (zásady) — promazávat schránku podpora@managero.app.
- Stripe: zasílání faktur e-mailem (§3 bod 7a), `MAX30` duration once, Revenue recovery → cancel.

K ověření advokátem (navíc k §4):
1. ✅ *Vyřešeno 21. 10. 2026 (§7): IČO je povinné v pokladně.* Původní zjištění: **IČO není povinné** ani při registraci, ani v pokladně — B2B povahu nese jen prohlášení v
   zaškrtávátku. Pokud si tarif koupí člověk, který jedná mimo podnikání, hrozí spotřebitelský režim
   (14denní odstoupení, § 1826a tlačítko, § 1814). Doporučuji povinné IČO v pokladně (Stripe
   `custom_fields`) — kód mimo tento balík.
2. **Vyloučení odpovědnosti za výpadky poskytovatelů infrastruktury** (OP čl. 12 a 17): Vercel, Neon a
   další jsou subdodavatelé poskytovatele (§ 1935 OZ — za ně se odpovídá jako za sebe). Mezi podnikateli
   to v mezích § 2898 jde, ale přiměřenost vůči malé kavárně (§ 433, § 1753) posoudit.
3. **Prorogace** „soud podle sídla poskytovatele" (OP čl. 23): click-wrap jako písemná forma (§ 89a OSŘ,
   § 562 OZ); u zákazníků z jiných států EU čl. 25 Brusel Ia. Doporučeno zatím prodávat jen v ČR.
4. **DPA čl. 13** dává retenci neaktivního účtu hosta jako „pokyn správce" (podniku), zásady ale tvrdí,
   že účet hosta spravuje Managero jako správce — souvisí s §4 bodem 1 (role u účtu hosta).
5. **Moderace „zpravidla do 24 hodin v pracovní dny"** (podmínky) odpovídá lhůtě ve správě
   (`LHUTA_NAHLASENI_HODIN = 24`), ale je to závazek jednoho člověka; zvážit „bez zbytečného odkladu".

V kódu nezměněno (mimo balík nebo neověřitelné):
- Okno pokladny se nedalo vyfotit (ukázka `/demo` nemá Předplatné a sondy běží bez databáze); změna je
  pokrytá `tsc`, testem a čtením kódu.
- ~~Identifikace provozovatele v Nastavení → O aplikaci~~ — doplněno 21. 10. 2026 (§7).
- Text souhlasu při registraci podniku je dlouhý, ale přesný; nezkracoval jsem ho kvůli sondám a
  překladům (k zvážení při příští úpravě registrace).

## 7. Dokončení před spuštěním (21. 10. 2026, větev `pravni`)

### 7.1 Co je teď v kódu hotové

**Retence zrušených podniků je bezpečně zapnutelná** (`lib/retence.ts`, `lib/retenceDb.ts`, cron `/api/retence`):
- *Aktivita podniku* = nejnovější z: člen podniku nebo vlastník byl v aplikaci (nový sloupec
  `users.naposledy_at`, zapisuje ho čtení relace v `lib/auth.ts` nejvýš jednou za 6 h — `lib/naposledy.ts`),
  otevřel nativní aplikaci (`device_tokens.last_seen_at`), protokol změn, docházka, týmový chat, zprávy,
  úkoly (založení i splnění), směny, uzávěrky, postupy, denní reporty.
- *Lhůta* 90 dní běží od pozdějšího z konce předplatného (nebo zkoušky) a poslední aktivity.
- *Upozornění*: vlastník + lidé s oprávněním `predplatne.spravovat` dostanou e-mail **30 dní** a znovu
  **7 dní** před smazáním (Resend přes `sendPravniEmail`, patička s provozovatelem, odkaz na přihlášení
  a na Nastavení → Data a soukromí). Stačí se přihlásit — aktivita upozornění zneplatní.
- *Smazání* jen když: první upozornění odešlo po poslední aktivitě a aspoň 30 dní předem, druhé po
  prvním a aspoň 7 dní předem, lhůta neaktivity uplynula a předplatné je pořád `canceled`.
  Rozhoduje čistá funkce `rozhodniPodnik` (test `scripts/testy/k92-retence-podniku.ts`).
- *Idempotence*: `teams.retence_upozorneno30_at` / `retence_upozorneno7_at`; podnik se nejdřív „zabere“
  podmíněným zápisem (souběžný běh ho přeskočí), když neodejde ani jeden e-mail, zápis se vrátí
  a podnik se nesmaže (chyba v souhrnu běhu). Dávky: 50 upozornění a 5 smazání za běh.
- *Hosté* (24 měsíců + upozornění 30 dní předem s „Ponechat účet“) fungovaly už dřív; nově se jako
  aktivita počítá i otevření Managero client na webu (`users.naposledy_at`). Host bez platného e-mailu
  (import bez aplikace) upozornění dostat nemůže — lhůta se mu rozběhne i tak (beze změny).
- Správa platformy → Retence ukazuje počty upozornění a smazání podniků; `/api/health` dál hlásí
  `funkce.retenceOstra`.
- Texty: OP čl. 19, zásady `#retence` (+ „den posledního otevření aplikace“ mezi údaji účtu), DPA čl. 13
  (cs i en) popisují kritérium a obě upozornění. Čísla v `lib/pravni/lhuty.ts` (`RETENCE_TEXT`).

**IČO u objednávky předplatného** — viz §2.2 (pole v pokladně, webhook, OP čl. 1, test `k92-ico-pokladna`).

**Identifikace provozovatele v aplikaci** — viz §2.1 (`ProvozovatelInfo`, test `k92-provozovatel`).

Verze dokumentů (`VERZE_PODMINEK`, `VERZE_ZASAD`) zůstává `2026-10-21`: změny vznikly týž den před
spuštěním, nikdo ostrý ještě nesouhlasil se starším zněním. Po spuštění by obdobná změna znamenala
novou verzi.

### 7.2 Co zbývá na Martinovi (pořadí)

1. **Nasadit** větev a spustit `/api/init` (nové sloupce `users.naposledy_at`, `teams.retence_upozorneno30_at`,
   `teams.retence_upozorneno7_at`). Cron `/api/init` běží denně i sám.
2. **Resend**: ověřit doménu `managero.app` (SPF, DKIM, DMARC), ve Vercelu `RESEND_API_KEY` a
   `EMAIL_FROM` (např. `Managero <noreply@managero.app>`). Bez toho neodejdou upozornění a retence
   podniky nesmaže.
3. **`podpora@managero.app`** musí přijímat poštu (MX + schránka nebo přeposílání) — odkazují na ni
   e-maily, patičky i faktury.
4. **Stripe Dashboard**: §3 body 1–7a (Public details s URL podmínek a zásad → pak `STRIPE_SOUHLAS_PODMINEK=1`,
   výchozí patička faktur, Stripe Tax vypnutý, Revenue recovery → zrušit, `MAX30` duration once,
   zasílání faktur e-mailem). Pole IČO v pokladně nepotřebuje žádné nastavení v dashboardu.
5. **Vercel**: plán Pro, region Blob, proměnné výše.
6. **Retenci zapnout až po nasazení**: Správa platformy → Retence → „Spočítat náhled teď“, zkontrolovat
   počty (kolik podniků by dostalo upozornění), pak `RETENCE_ZAPNUTA=1` (Production) a redeploy. První
   smazání podniku nastane nejdřív 30 dní po prvním upozornění.

### 7.3 Nehotovo / vědomě ne
- E-maily před smazáním podniku jsou jen česky (stejně jako ostatní provozní e-maily).
- Odkaz „Ponechat podnik“ bez přihlášení není — stačí přihlášení (je to jednodušší a je to zároveň aktivita).
- Hromadný e-mail o změně OP/DPA/subzpracovatelů dál ručně (§5).
