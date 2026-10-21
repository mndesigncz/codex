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
- ⚠ Nastavení → O aplikaci v aplikaci: identifikace tam zatím není (soubor `components/Settings.tsx`
  patří jinému balíku; odkazy na právní stránky tam jsou). Doplnit při další práci na Nastavení.

### 2.2 Obchodní podmínky B2B
- ✅ Smluvní strany, zákazník = podnikatel, spotřebitel nemůže objednat: čl. 1.
- ✅ Prohlášení „jednám jako podnikatel" při registraci: `SouhlasPodminek podnik` v `components/registrace/Cesta.tsx`.
- ⚠ Povinné IČO před objednávkou: **neděláme** (registrace ani pokladna IČO nevyžadují; Stripe
  sbírá jen DIČ přes `tax_id_collection`). Náhrada: B2B prohlášení v click-wrapu + čl. 1 (právo
  vyžádat IČO a bez něj tarif nezřídit). Doporučení: povinné pole IČO v pokladně (Stripe
  `custom_fields`) nebo v Nastavení → Předplatné. Viz §5.
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
  porušení; smazání neaktivního zrušeného podniku po 90 dnech (podle `lib/retence.ts`): čl. 19.
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
  audit 3 roky, oznámení 365 dní, zrušený podnik 90 dní, fakturace „až 10 let", zálohy 30 dní): `#retence`.
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
### 5.2 Faktura — ✅ patička faktury z `lib/firma.ts` („Nejsem plátce DPH", jméno, IČO, sídlo, zápis); ⚠ IČO odběratele jen pokud ho vyplní (DIČ přes `tax_id_collection`).
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

**Vercel**
8. Přejít na **plán Pro** (Hobby zakazuje komerční provoz a DPA Vercelu platí jen pro Pro).
9. Ověřit **region Blob úložiště** (Storage → Blob → region); ideálně Frankfurt (`fra1`). Seznam
   subzpracovatelů uvádí „serverové funkce ve Frankfurtu" — to zajišťuje `vercel.json` `regions: ["fra1"]`.
10. Zapnout **`RETENCE_ZAPNUTA=1`** — zásady a DPA popisují lhůty retence jako platné; bez proměnné
   cron jen počítá náhled a nic nemaže.
11. `FIRMA_*` proměnné nejsou potřeba (výchozí údaje jsou v kódu). Až bude DIČ: `FIRMA_DIC=CZ…`
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
   podniku zákazníkem; smazání neaktivního zrušeného podniku po 90 dnech **bez předchozího upozornění**
   (kód upozornění neposílá — doporučeno doplnit); vývoj Digital Omnibus.
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

- Povinné **IČO** v pokladně nebo při objednávce placeného tarifu (Stripe `custom_fields` / vlastní pole).
- **Upozornění e-mailem** vlastníkovi 30 dní před smazáním neaktivního zrušeného podniku (`lib/retenceDb.ts`).
- **Hromadný e-mail** vlastníkům o změně OP/DPA/subzpracovatelů (dnes ručně).
- Identifikace provozovatele v **Nastavení → O aplikaci** a odkazy na obchodní podmínky v Nastavení →
  Předplatné (`components/Settings.tsx`, `components/Billing.tsx` patří jiným balíkům).
- `components/CheckoutModal.tsx` ukazuje u ročního tarifu **přeškrtnutou „srovnávací" cenu**
  (`PRICES.*.yearCompare` 4 990 / 9 988 Kč), která neodpovídá 12× měsíční ceně a nikdy se neúčtovala —
  klamavá referenční cena; doporučeno nahradit spočtenou úsporou jako na landingu.
- Texty ceníku a pokladny o DPH jsou psané pro neplátce natvrdo; při registraci k DPH přepsat.
- Šablona „Informace pro hosty" pro podniky.
