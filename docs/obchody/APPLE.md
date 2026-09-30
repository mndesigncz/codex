# Apple: App Store krok za krokem

Návod pro člověka, který to nikdy nedělal. Jde o dvě aplikace ze stejného webu:

| | Managero (provoz) | Managero client (hosté) |
|---|---|---|
| Bundle ID (nejde nikdy změnit) | `app.managero.app` | `app.managero.client` |
| Název v obchodě | Managero | Managero client |
| SKU (nejde změnit) | `managero-app` | `managero-client` |
| Zařízení | iPhone + iPad | jen iPhone |
| Kategorie | Business, Productivity | Food & Drink, Lifestyle |
| Cena | zdarma, bez nákupů | zdarma, bez nákupů |
| Doména | `https://www.managero.app` (s `www`) | totéž |

Všechno, co se dá připravit v repu, je připravené: konfigurace obalů (`apps/`), texty (`apps/app-store/`), ikony, snímky,
fastlane šablony. Tady je to, co musíš udělat ty. Čas: první dva kroky (účet) trvají dny až týdny, **začni jimi hned**.

> Nejdřív přečti `docs/obchody/README.md` (co je kde) a po dokončení projdi `docs/obchody/CHECKLIST.md`.

## 0. Co potřebuješ

- Mac s aktuálním macOS a Xcode ve verzi, kterou Apple právě vyžaduje pro nahrávání (od dubna 2026 SDK iOS 26 / Xcode 26; ověř na
  <https://developer.apple.com/news/upcoming-requirements/>). Na Linuxu ani Windows se iOS aplikace postavit nedá.
- Node 22 (`brew install node@22`), Git, Ruby s Bundlerem (`brew install ruby`; systémový Ruby nestačí), `brew install ffmpeg`.
- Skutečný iPhone (a pro Managero iPad) na zkoušení push a skeneru. Simulátor je nezkouší věrně.
- Repo naklonované na **stejném commitu, který je nasazený na webu** (obal načítá živý web, ale AASA, brána podle aplikace a
  push kontrakt jsou sdílené).

## 1. Apple Developer Program (trvá dny až týdny)

1. Rozhodni: **organizace** (doporučeno), nebo osoba. U organizace je v obchodě vidět jméno firmy, u osoby tvoje občanské
   jméno a adresa. Organizace potřebuje **D-U-N-S číslo** (zdarma na <https://www.dnb.com/duns>, v Česku přes Dun & Bradstreet CZ,
   1 až 30 dní), veřejnou webovou stránku s doménou a firemní e-mail na stejné doméně. Totéž D-U-N-S se použije i pro Google Play.
2. <https://developer.apple.com/programs/enroll/> (nebo aplikace Apple Developer na iPhonu). Apple ID s dvoufázovým ověřením.
   Poplatek **99 USD ročně**. Apple ověřuje telefonicky, počítej s dny.
3. Po schválení: App Store Connect (<https://appstoreconnect.apple.com>) > **Business** > Agreements: u bezplatných aplikací stačí
   smlouva **Free Apps**, přijmi ji. Smlouva Paid Apps a bankovní účet se NEPOTŘEBUJÍ (v aplikacích nejsou platby).
4. **Trader status (DSA)**: v App Store Connect vyplň jméno, adresu, telefon a e-mail obchodníka. Zobrazí se veřejně na stránce
   aplikace v EU, bez toho se aplikace v EU nezveřejní. Použij firemní adresu, ne domácí.
5. **Team ID**: developer.apple.com > Account > Membership details, 10 znaků. Zapiš ho do správce hesel, je potřeba pro
   `APPLE_TEAM_ID` a pro soubor `apple-app-site-association` (universal links).
6. **API klíč App Store Connect** (pro fastlane, aby se nemuselo psát Apple ID a heslo): App Store Connect > Users and Access >
   Integrations > App Store Connect API > Team Keys > přidat klíč s rolí **App Manager**. Stáhni `.p8` **jen jednou**, ulož do správce
   hesel, poznamenej **Key ID** a **Issuer ID**. Soubor `.p8` nikdy do repa (je v `.gitignore`).

## 2. Identifikátory a capabilities

developer.apple.com > Certificates, Identifiers & Profiles:

1. Identifiers > **+** > App IDs > App: popis `Managero`, Bundle ID **Explicit** `app.managero.app`. Zaškrtni capabilities:
   **Push Notifications**, **Associated Domains**.
2. Totéž pro `app.managero.client` (popis `Managero client`): **Push Notifications**, **Associated Domains**.
3. **Sign in with Apple** zatím NEzaškrtávej. Aplikace přihlašuje jen e-mailem a heslem, takže guideline 4.8 Sign in with Apple
   nevyžaduje. Povinné by se stalo, až by přibylo přihlášení Googlem nebo Facebookem.
4. **Klíč pro push (APNs)**: Keys > **+** > zaškrtni *Apple Push Notifications service (APNs)* > stáhni `.p8` (jednou!). Jeden klíč
   obslouží obě aplikace. Do prostředí serveru (Vercel > Settings > Environment Variables) přidej `APNS_KEY_ID`, `APNS_TEAM_ID`
   a obsah klíče do `APNS_PRIVATE_KEY`. Server rozliší aplikaci podle bundle ID (`apns-topic`). Bez tohoto kroku push v iOS
   nefunguje (aplikace se chová normálně, jen bez oznámení).
5. Certifikáty podpisu nemusíš zakládat ručně: v Xcode stačí „Automatically manage signing" (krok 4).

## 3. Záznamy v App Store Connect (pro obě aplikace)

App Store Connect > Apps > **+** > New App.

1. Platforma iOS, **Name** (zkus `Managero` / `Managero client`; pokud je jméno obsazené, záložní `Managero: provoz podniku`
   a `Managero client: kavárny`), Primary Language **Czech**, Bundle ID z nabídky, SKU z tabulky nahoře, User Access Full Access.
   **Jméno si tím zamluvíš**, ale nenech záznam ležet měsíce bez buildu, Apple ho může uvolnit.
2. **App Information**: podtitul (`apps/app-store/<app>/metadata/cs/subtitle.txt`), kategorie (tabulka nahoře), **Content Rights**
   (ano, vlastní obsah), Privacy Policy URL `https://www.managero.app/soukromi`.
3. **Pricing and Availability**: cena 0, země Česko a Slovensko, **odškrtni** dostupnost na Macu s Apple silicon a na Vision Pro
   (jinak ji Apple i tam recenzuje).
4. **App Privacy** (nutrition label): viz oddíl 7, vyplníš ručně a publikuješ.
5. **Age Rating**: oddíl 8.
6. Verze 1.0: texty a snímky nahraje fastlane (oddíl 10), nebo je zkopíruj ručně ze souborů. **Version Release**: „Manually
   release". **Review Information**: oddíl 9.

## 4. Nativní projekt (na Macu)

Nativní projekty (`apps/*/ios`, `apps/*/android`) se NEcommitují, vznikají na Macu. Konfigurace a skripty jsou v repu.

```bash
cd apps/managero          # potom totéž v apps/client
npm install               # Capacitor 8 a pluginy (mimo hlavní package.json webu)
npm run ikony             # ikony, splash, grafika (z apps/_shared/assets/src/*.svg)
npm run pridej-ios        # = sync-www + npx cap add ios + po-cap-add (Info.plist, entitlements, privacy manifest…)
npm run assety            # npx @capacitor/assets generate: nahraje ikony a splash do Xcode projektu
node ../scripts/po-cap-add.mjs managero ios   # po assety znovu (skript je idempotentní)
npm run otevri-ios        # otevře Xcode
```

Co `po-cap-add.mjs` doplní (nemusíš nic ručně v Info.plist):
- `CFBundleDevelopmentRegion = cs`, `CFBundleLocalizations = cs, en`, `CFBundleDisplayName`;
- `ITSAppUsesNonExemptEncryption = NO` (jen HTTPS z iOS, App Store Connect se pak u buildu neptá);
- App Transport Security zapnuté bez výjimek;
- **usage strings** česky a anglicky (`cs.lproj` a `en.lproj/InfoPlist.strings`): kamera, poloha při používání, Face ID,
  a u Managero navíc mikrofon a fotky. Nic, co aplikace nepoužívá;
- `App.entitlements`: Push (`aps-environment`), Associated Domains `applinks:www.managero.app`, `webcredentials:www.managero.app`;
- `PrivacyInfo.xcprivacy` (bez sledování, sbíraná data podle oddílu 7);
- v Xcode projektu: soubory zařazené, `TARGETED_DEVICE_FAMILY` (client jen iPhone), iOS 15+, bez Mac Catalyst a Vision Pro, verze.

V Xcode (otevřený `App.xcodeproj`), target **App**:

1. **General**: Display Name, Bundle Identifier (přesně z tabulky), Version `1.0.0`, Build `1`. Client: orientace jen Portrait.
   Managero: všechny orientace (iPad za barem), u iPadu povinně všechny orientace, nebo zaškrtni *Requires full screen*.
2. **Signing & Capabilities**: vyber **Team**, nech zaškrtnuté *Automatically manage signing*. Capabilities Push Notifications
   a Associated Domains už jsou v souboru entitlements. Pokud je Xcode nabídne přidat, přidej.
3. **Universal links (soubor na webu)**: server musí na `https://www.managero.app/.well-known/apple-app-site-association` vracet
   JSON s tvým Team ID, bez přesměrování a s `Content-Type: application/json`. Ověř:
   `curl -I https://www.managero.app/.well-known/apple-app-site-association` (200, bez přesměrování) a potom
   `https://app-site-association.cdn-apple.com/a/v1/www.managero.app` (cache Applu, po změně čekej hodiny). Generátor obsahu:
   `node apps/scripts/well-known.mjs aasa <TEAMID>`.
   Pozor na `www`: `managero.app` bez `www` jen přesměrovává a universal link by nefungoval. `NEXTAUTH_URL` musí být
   `https://www.managero.app`, jinak vytištěné QR kódy míří na apex a nikdy neotevřou aplikaci.
4. **Zkouška na telefonu**: připoj iPhone kabelem, vyber ho nahoře místo simulátoru, Run. Projdi kontrolní seznam níž.

Zkouška na skutečném zařízení (simulátor push ani kameru neumí věrně):
- přihlášení, **úplné zabití aplikace do 2 sekund po přihlášení a znovu spuštění**: musíš zůstat přihlášený (cookie se na disk
  zapisuje se zpožděním; když se ztrácí, hlas to hned, řeší se to jinak);
- push: přijde token na server (`/api/native/push`), doručí se oznámení, klepnutí otevře správnou stránku;
- sken QR (Managero: karta hosta u kasy; client: QR stolu a kód podniku);
- karta bez sítě (client), režim v letadle při studeném startu ukáže „Nejsi připojený" a ne bílou obrazovku;
- poloha při objednávce (client), odhlášení, smazání účtu (až je v aplikaci), otáčení iPadu, přepnutí do pozadí a zpět.

## 5. Archivace a TestFlight

1. Xcode: nahoře cíl **Any iOS Device (arm64)** > Product > **Archive** > Organizer > **Distribute App** > App Store Connect > Upload.
   (Nebo fastlane: `cd apps && bundle exec fastlane ios client_beta`, vyžaduje proměnné z `apps/app-store/README.md`.)
2. App Store Connect > TestFlight: build se zpracovává 10 až 30 minut. Export Compliance se neptá (máme
   `ITSAppUsesNonExemptEncryption`). **Interní testeři** (do 100 lidí z uživatelů účtu) ho mají hned. **Externí** až po Beta App Review
   (1 až 2 dny, doplň Test Information a kontakt).
3. Tester projde kontrolní seznam z oddílu 4.

## 6. Snímky a video

Snímky se generují skriptem z běžící aplikace, NEjsou v gitu (desítky MB). Na Macu z kořene repa:

```bash
npm ci && npm run build && NEXTAUTH_SECRET=sondy-ci-secret-0123456789abcdef npx next start -p 3505 &   # jiný port než 3000
NEXTAUTH_SECRET=sondy-ci-secret-0123456789abcdef node apps/scripts/snimky.mjs --app=vse --base=http://localhost:3505
node apps/scripts/preview.mjs --app=client --base=http://localhost:3505     # video (potřebuje ffmpeg)
node apps/scripts/kontrola-listingu.mjs --release
```

Playwright potřebuje prohlížeč: `npx playwright-core install chromium` (na Macu je to všechno, proměnná `SONDY_CHROMIUM` se nenastavuje).
Výsledky: `apps/app-store/<app>/screenshots/<cs|en-US>/` (iPhone 6.9" 1320x2868, 6.5" 1284x2778, u Managero iPad 13" 2064x2752)
a video `previews/*.mp4`. **Generuj snímky těsně před odesláním z buildu, který odesíláš**, aby ukazovaly to, co recenzent uvidí.
Snímky ukazují vymyšlený podnik „Kavárna U Lípy (ukázka)". Žádné ceny, žádné logo třetích stran.

Video (App Preview) fastlane `deliver` spolehlivě nenahraje: nahraj ručně v App Store Connect (Version > App Previews).

## 7. App Privacy (nutrition label) podle kódu

Žádné sledování (**Data Used to Track You: nic**), žádné reklamní SDK, žádné analytické SDK, žádný ATT dialog. Všechna data jsou
propojená s identitou (účet) a slouží jen k funkci aplikace (*App Functionality*).

| Kategorie Apple | Data | Managero | Client |
|---|---|:-:|:-:|
| Contact Info: Name | jméno účtu | ano | ano |
| Contact Info: Email Address | e-mail (přihlášení, e-maily) | ano | ano |
| Contact Info: Phone Number | telefon, nepovinný | ano | ano |
| User Content: Photos or Videos | fotky účtenek a položek, příloha chatu | ano | ne |
| User Content: Audio Data | hlasové zprávy v chatu | ano | ne |
| User Content: Other User Content | zprávy chatu, nápady, úkoly, poznámky k rezervaci a objednávce, hodnocení | ano | ano |
| Identifiers: User ID | číslo účtu | ano | ano |
| Identifiers: Device ID | token pro push (APNs) | ano | ano |
| Purchases: Purchase History | objednávky hosta a věrnostní deník u podniku (ne nákupy přes Apple) | ne | ano |
| Financial Info: Other Financial Info | hodinové sazby zaměstnanců, tržby a uzávěrky podniku | ano | ne |
| Location: Precise Location | poloha při objednávce od stolu se jen ověří a neukládá (ukládá se vzdálenost), u Managero poloha podniku | ano | ano |

Platební údaje (Payment Info) se **nesbírají**: karta je jen u Stripe na webu, v obalu se Stripe nenačte.
Diagnostika: žádný crash reporter v repu, serverové logy hostingu (IP): rozhodni s právníkem, zda přiznat *Other Diagnostic Data*.
Polohu přiznej konzervativně (Apple definice „collection" je těsná). Právní zařazení (kdo je správce a kdo zpracovatel) nechej
zkontrolovat právníkem. Stejná tabulka je ve `PrivacyInfo.xcprivacy`, kterou vytvoří `po-cap-add.mjs`.

**Privacy manifest ověř v Xcode**: Product > Archive > Distribute > **Generate Privacy Report**. Sloučí manifesty všech pluginů.
Porovnej se seznamem „required reason API" v `apps/scripts/po-cap-add.mjs` (UserDefaults CA92.1, FileTimestamp C617.1,
SystemBootTime 35F9.1, DiskSpace E174.1) a chybějící doplň.

## 8. Věkové hodnocení a export

- **Age Rating** (nový dotazník iOS 26: kategorie 4+, 9+, 13+, 16+, 18+): odpovídej pravdivě. Žádné násilí, sex, hazard, lékařský
  obsah. **Neomezený přístup na web: NE** (obal je omezený na vlastní doménu). **Uživatelský obsah a zprávy**: Managero ANO
  (týmový chat), client NE. Client: nabídky podniků mohou zmiňovat alkohol a existují kupony jen pro dospělé (`adult_only`), přiznej
  „občasné/mírné". Výsledek určí dotazník, neodhaduj předem.
- **Export compliance**: aplikace používá jen HTTPS z iOS, `ITSAppUsesNonExemptEncryption = NO` je už v Info.plist.
- **Content Rights**: vlastní obsah.
- **Advertising Identifier (IDFA)**: NE.

## 9. Poznámky pro recenzenta a demo účty

Texty jsou v `apps/app-store/<app>/metadata/review_information/notes.txt` (anglicky, bez hesel, s `{{ZÁSTUPCI}}`). Hesla se dosadí
z prostředí při nahrání fastlanem; ručně je vyplníš v App Store Connect > Version > **App Review Information** (Sign-in required:
ano, uživatel a heslo, poznámky).

Co musí existovat v datech (dělá se skriptem proti databázi, NE přes veřejný endpoint):
- tým „Ukázková kavárna" s vlastníkem (manažer), zaměstnancem a kioskem, tarif nastavený ručně superadminem (aby recenzent
  viděl správu hostů), naplněný rozvrh, sklad, úkoly, chat;
- hostovský podnik `ukazkova-kavarna`: zapnuté rezervace, objednávky a věrnost, `order_geo` vypnuto a QR nepovinné (recenzent není
  v podniku), 2 až 3 stoly, menu, kampaň razítek, kupon, akce; **nezveřejněný v adresáři pro skutečné hosty**; host má členství
  (body, razítka, kupon, jedna rezervace);
- tři účty s **různými e-maily** (employer, employee, customer), bez dvoufázového ověření. Hesla náhodná, po schválení změnit.
  Přihlašovací limit (10 pokusů na e-mail) recenzenta nezamkne, pokud heslo předem ověříš.
- aplikace a server musí být online celou dobu recenze (obvykle 24 až 72 hodin) a v té době nenasazuj rozbitý build.

Pošli obě aplikace **s odstupem aspoň jednoho dne**, nejdřív Managero client (menší plocha). Případný společný problém
(doména, universal links, právní stránky) tak neshodí obě najednou.

Co je v kódu potřeba mít hotové dřív, než odešleš (jinak je zamítnutí jisté): mazání účtu přímo v aplikaci (5.1.1(v)),
stránky `/soukromi`, `/podminky`, `/podpora` (veřejné bez přihlášení), žádné platby ani ceny v obalu (3.1.1), push s výslovným
souhlasem u marketingu (4.5.4), nahlášení a blokace obsahu v chatu (1.2) u Managero. Stav těchto prací viz `CHECKLIST.md`.

## 10. Nahrání textů a odeslání (fastlane)

```bash
cd apps
bundle install
export APPLE_TEAM_ID=… ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_KEY_PATH=/cesta/k/AuthKey.p8
export REVIEW_FIRST_NAME=… REVIEW_LAST_NAME=… REVIEW_PHONE=+420… REVIEW_EMAIL=…
export REVIEW_CLIENT_USER=… REVIEW_CLIENT_PASSWORD=…                 # pro managero: REVIEW_MANAGERO_USER/_PASSWORD a …_EMPLOYEE_…
bundle exec fastlane ios client_listing        # texty + snímky + poznámky, NEODEŠLE
bundle exec fastlane ios client_submit BUILD=1 # odešle vybraný zpracovaný build na kontrolu, vydání ručně
```

Po `*_listing` vše zkontroluj očima v App Store Connect. Věkové hodnocení, App Privacy, DSA a video dělej ručně. Názvy parametrů
`deliver` se mění s verzí fastlane (`fastlane action deliver`); sady snímků 6.9" a iPad 13" chtějí fastlane 2.228 a novější, jinak
snímky přetáhni do App Store Connect ručně. Kdyby ti fastlane dělalo potíže, vše jde vyplnit ručně ze souborů v `apps/app-store/`.

Potom v App Store Connect: verze 1.0 > **Build** > vyber zpracovaný build > Save > **Add for Review** > **Submit to App Review**.
Po schválení vydáš ručně (u větších změn *Phased release*). Po schválení doplň App Store ID do odkazů na webu (Smart App Banner).

## 11. Nejčastější důvody zamítnutí a jak jim předejít

| Guideline | Riziko u nás | Prevence |
|---|---|---|
| 4.2 Minimum functionality | obal nad webem | nativní push, skener QR, karta bez sítě, universal links, sdílení, Face ID zámek (client), push, foto dokladů a kiosk na iPadu (Managero); vyjmenováno v poznámkách pro recenzenta |
| 2.1 App completeness | demo účet nefunguje, prázdný adresář, server nedostupný | oddíl 9, projdi poznámky jako recenzent na čistém telefonu |
| 3.1.1 / 3.1.3 Platby | předplatné Managero se kupuje přes Stripe na webu | v obalu žádné ceny, tlačítka ani odkazy na platbu (server vrací 403, UI je skryté), poznámka B2B (3.1.3(c)); u client žádné platby (3.1.3(e)). **Riziko zůstává**: samoobslužná registrace mikropodniku může recenzent číst jako prodej jednotlivci. Rozhodnutí majitele před odesláním |
| 5.1.1(v) Mazání účtu | musí být v aplikaci | oddíl 9, jmenuj v poznámkách, kde to je |
| 5.1.1(i) Zásady soukromí | stránky musí být veřejné | `/soukromi`, `/podminky`, `/podpora`; právník zkontroluje text |
| 5.1.1 Účel oprávnění | prázdné nebo obecné texty | konkrétní věty (`po-cap-add.mjs`), kamera a poloha až při použití |
| 4.5.4 Push | marketing bez souhlasu | transakční zprávy vždy, marketing jen s výslovným zapnutím (vypnuto výchozí) |
| 4.8 Přihlášení třetí stranou | jen když přibude Google/Facebook | nepřidávat; jinak Sign in with Apple |
| 4.3 Spam, duplicita | dvě aplikace ze stejného kódu | odlišný účel, název, ikona (světlá × tmavá, jiná silueta) a snímky; v poznámkách věta, že druhá aplikace je pro jiné publikum |
| 1.2 Uživatelský obsah | týmový chat | uzavřený chat jednoho podniku, vlastník odebírá členy a mazá zprávy, nahlášení a blokace |
| 2.3 Přesnost metadat | text slibuje, co v buildu není | seznam tvrzení ve `CHECKLIST.md`; snímky z odesílaného buildu; `kontrola-listingu.mjs` |
| 2.3.7 / 5.2 Značky | cizí značky v textu a snímcích | zákaz v kontrole; v ukázce jen vymyšlený podnik |
| 4.0 Design | `<a download>`, tisk a odkazy ven ve WebView | `allowNavigation` jen vlastní doména; soubory přes sdílení; ověř na zařízení |
| Výpadek při recenzi | hosting, databáze | v době recenze nenasazuj, sleduj `/client` a `/login` |

Když přijde zamítnutí: odpověz v **Resolution Center** s odkazem na konkrétní krok a snímek. U 4.2 nevyvolávej spor, raději
doplň nativní funkci nebo lépe popiš existující. Nová verze nepotřebuje nový zápis metadat, jen build.
