# Google Play: krok za krokem

Dvě aplikace, stejný web:

| | Managero (provoz) | Managero client (hosté) |
|---|---|---|
| applicationId (nejde nikdy změnit) | `app.managero.app` | `app.managero.client` |
| Název v obchodě | Managero – provoz podniku | Managero client |
| Kategorie | Business | Food & Drink |
| Cena | zdarma navždy (z placené na bezplatnou se nevrací) | totéž |
| Cílová skupina | 18+ | 18+ |
| Země | Česko, Slovensko | totéž |

Android se dá postavit na Linuxu, Macu i ve Windows, jen je potřeba Java 21 (nebo GitHub Actions workflow `android-aab.yml`,
který to udělá za tebe). Texty a grafika jsou hotové v `apps/play-store/`. Tady je to, co musíš udělat ty.
Začni účtem (D-U-N-S trvá dny až týdny). Souhrn a odhady času: `CHECKLIST.md`.

## 1. Účet vývojáře: osobní, nebo organizační

| | Osobní | Organizační |
|---|---|---|
| Poplatek | jednorázově 25 USD | 25 USD |
| Ověření | doklad totožnosti + ověření na skutečném Androidu přes aplikaci Play Console | D-U-N-S číslo (musí souhlasit s právním názvem a adresou firmy), firemní e-mail, telefon, web |
| **Uzavřené testování před produkcí** | **ANO: nejméně 12 testerů souvisle 14 dní** (pravidlo pro nové osobní účty) | **NE** |
| Co se ukáže veřejně | osobní jméno a (jako obchodník podle DSA) adresa | název firmy a firemní adresa |

**Doporučení: organizační účet.** Odpadá povinných 14 dní testu, v obchodě je firemní adresa místo domácí a stejné D-U-N-S
se použije i pro Apple Developer Program. Osobní účet nejde později přeměnit na organizační, jen se přenášejí aplikace.

Kroky: 1) Google účet jen pro firmu (např. `dev@…`), zapni dvoufázové ověření; 2) <https://play.google.com/console/signup>;
3) typ účtu, kontakty, D-U-N-S; 4) zaplať; 5) ověř identitu, telefon i e-mail (u osobního účtu i zařízení); 6) vyplň **prohlášení
obchodníka (DSA)**: jméno, adresa, telefon, e-mail se zobrazí veřejně v listingu; 7) profil plateb nezakládej (nic neprodáváme).

## 2. Upload klíč, Firebase a podpis

**Play App Signing je povinný**: Google drží skutečný podpisový klíč, ty podepisuješ jen **upload klíčem**. Pro každou aplikaci
doporučujeme **vlastní** upload klíč (kompromitace jednoho nezasáhne druhý). Na svém počítači:

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore managero-upload.jks -alias managero-upload \
  -keyalg RSA -keysize 4096 -validity 10000          # potom totéž pro client: client-upload.jks, alias client-upload
```

Soubor `.jks` a hesla ulož do správce hesel + šifrovanou offline kopii. **Nikdy do repa** (je v `.gitignore`: `*.jks`, `keystore.properties`).
Ztráta upload klíče se řeší „Request upload key reset" v Play Console (jde to, ale zdržuje).

**Firebase (jen pro push přes FCM)**: <https://console.firebase.google.com> > nový projekt „managero" > přidej dvě Android aplikace
(`app.managero.app`, `app.managero.client`) > stáhni dva soubory `google-services.json`. Bez Firebase Analytics a Crashlytics
(přitáhly by reklamní ID a změnily Data safety). Soubory **nejsou v repu**, jdou jen do GitHub secrets a na server se nahrává
klíč servisního účtu pro odesílání (`FCM_SERVICE_ACCOUNT_JSON`, base64, jen na hostingu). Bez tohoto kroku aplikace běží, jen
nepřijímá push.

**GitHub secrets** (repo > Settings > Secrets and variables > Actions), pro `MANAGERO` a `CLIENT` zvlášť:
`ANDROID_KEYSTORE_B64_<APP>` (`base64 -i managero-upload.jks`), `ANDROID_KEYSTORE_PASSWORD_<APP>`, `ANDROID_KEY_ALIAS_<APP>`,
`ANDROID_KEY_PASSWORD_<APP>`, `GOOGLE_SERVICES_JSON_B64_<APP>`.

## 3. Sestavení AAB

**A) V GitHubu (doporučeno):** Actions > **Android AAB** > Run workflow (spouští se jen ručně) > vyber aplikaci. Výstup je artefakt
`aab-managero` a `aab-client` (stáhni na stránce běhu). Workflow vytvoří nativní projekt, ikony, doplní manifest
(`apps/scripts/po-cap-add.mjs`: oprávnění bez reklamního ID, App Links, targetSdk 36) a zkontroluje sloučený manifest.

**B) Lokálně:**

```bash
cd apps/managero                        # potom client
npm ci
npm run ikony && npm run pridej-android # cap add android + úpravy
npm run assety && node ../scripts/po-cap-add.mjs managero android
cd android && ANDROID_KEYSTORE_PATH=/cesta/managero-upload.jks ANDROID_KEYSTORE_PASSWORD=… ANDROID_KEY_ALIAS=… ANDROID_KEY_PASSWORD=… ./gradlew bundleRelease
# výstup: android/app/build/outputs/bundle/release/app-release.aab
```

`versionCode` musí každým nahráním **růst** (CI ho bere z čísla běhu, lokálně `VERSION_CODE=2 ./gradlew …`), `versionName` je
z `apps/apps.json`. Po buildu zkontroluj sloučený manifest: nesmí obsahovat `com.google.android.gms.permission.AD_ID`;
Managero má `CAMERA`, client kameru nedeklaruje (QR čte Google Code Scanner bez oprávnění).

## 4. Vytvoření obou aplikací v Play Console

Create app: název, jazyk **Czech (cs-CZ)**, **App** (ne hra), **Free**, souhlas s pravidly. Potom Dashboard > **Set up your app**.

1. **První AAB nahraj ručně**: Testing > Internal testing > Create new release > nahraj AAB > Save > Review > Start rollout. Tím
   vznikne podpis aplikace; teprve potom funguje API. Přidej testery (e-maily, do 100). Interní test **nejde do recenze**.
2. **Odkazy App Links**: Test and release > **App integrity > App signing**: zkopíruj **SHA-256** podpisového klíče. Potom:
   `node apps/scripts/well-known.mjs assetlinks --sha=managero:AA:BB:…,client:CC:DD:… > assetlinks.json` a ulož na web jako
   `https://www.managero.app/.well-known/assetlinks.json` (200, bez přesměrování, JSON). Ověření:
   `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://www.managero.app&relation=delegate_permission/common.handle_all_urls`.
   Do `apps/apps.json` (`android.sha256`) otisky také zapiš.

## 5. App content (u každé aplikace)

| Deklarace | Odpověď |
|---|---|
| Privacy policy | `https://www.managero.app/soukromi` (veřejná, bez přihlášení) |
| App access | Some functionality is restricted: vlož přihlašovací údaje a text z `apps/play-store/<app>/access-instructions.txt` (anglicky) |
| Ads | Ne |
| Content rating (IARC) | dotazník: Utility / Productivity (Managero), Reference / Utility (client); násilí, sex, drogy, hazard ne; **Users can interact: ANO u Managero** (chat), ne u client; poloha sdílená s ostatními ne; digitální nákupy ne. Očekává se PEGI 3 |
| Target audience | **18+** u obou, nezaškrtávej děti (nevzniká povinnost Families) |
| Data safety | tabulka níž; **Data deletion URL** `https://www.managero.app/smazat-ucet` a zaškrtnout, že jde smazat přímo v aplikaci |
| Advertising ID | **Ne** (manifest má `AD_ID` odstraněné, neinstaluj žádný reklamní ani analytický SDK) |
| Government, News, Health, COVID | Ne |
| Financial features | žádné (u client kredit u podniku nabíjí personál v podniku, ne aplikace: popiš v poznámce) |
| Store settings | kategorie (tabulka nahoře), kontakty: e-mail `podpora@managero.app` (ověř, že schránka existuje), web `https://www.managero.app`, telefon (povinný u obchodníka v EU, veřejný) |
| Countries | Česko, Slovensko |

### Data safety (podle kódu; žádná analytika, žádné reklamy)

„Sdíleno" = předání třetí straně; zpracovatelé, kteří data zpracovávají naším jménem (databáze, hosting a úložiště souborů,
odesílání e-mailů), Google za sdílení nepovažuje, proto **Sdíleno: ne** všude. Ověř integraci s pokladnou Storyous: když aplikace
něco do pokladny odesílá z podnětu podniku, popiš to v poznámce formuláře. Šifrováno při přenosu: **ano** (HTTPS a HSTS).
Možnost požádat o smazání: **ano** (mazání v aplikaci + webová stránka).

| Kategorie | Data | Managero | Client | Povinné / volitelné |
|---|---|:-:|:-:|---|
| Osobní údaje | Jméno | ano | ano | povinné |
| | E-mail | ano | ano | povinné |
| | Telefon | ano | ano | volitelné |
| | ID uživatele | ano | ano | povinné |
| | Jiné (pozice, avatar) | ano | ne | volitelné |
| Finance | Jiné finanční údaje (sazby, mzdy, tržby a uzávěrky podniku) | ano | ne | povinné pro vedení |
| Zprávy | Jiné zprávy v aplikaci (chat) | ano | ne | volitelné |
| | Hodnocení návštěvy (text, vidí ho jen podnik) | ne | ano | volitelné |
| Fotky a videa | Fotky | ano | ne | volitelné |
| Zvuk | Hlasové zprávy | ano | ne | volitelné |
| Soubory | Dokumenty v příloze chatu | ano | ne | volitelné |
| Aktivita v aplikaci | Interakce, auditní záznam, docházka / rezervace, věrnostní deník | ano | ano | povinné |
| Nákupy | Historie objednávek u podniku (ne nákupy přes Google) | ne | ano | povinné |
| Zařízení a ID | Token pro push (FCM), IP adresa (omezení pokusů o přihlášení, maže se po dni) | ano | ano | povinné / automaticky |
| Poloha | Přesná poloha jen při objednávce od stolu se ověří v okamžiku a neukládá (ukládá se vzdálenost) | ne | ano (přiznej konzervativně) | volitelné |
| Kontakty, kalendář, zdraví | nic | ne | ne | |

Platební údaje se nesbírají (karta je jen u Stripe na webu, v obalu se Stripe nenačte). Formulář **změň po každé nové funkci**
(např. analytika, veřejné recenze).

## 6. Listing (texty a grafika)

Vše je v `apps/play-store/<app>/metadata/android/<cs-CZ|en-US>/`: `title.txt` (do 30), `short_description.txt` (do 80),
`full_description.txt` (do 4000), `changelogs/default.txt`, `images/icon.png` (512x512), `images/featureGraphic.png` (1024x500),
`images/phoneScreenshots/`, `sevenInchScreenshots/`, `tenInchScreenshots/` (po vygenerování skriptem). Kontrola: 
`node apps/scripts/kontrola-listingu.mjs --jen=play --release`. Pravidla Google: žádné emoji, ceny, „zdarma", slevy, superlativy
a zmínky jiné platformy; popis nesmí slibovat funkci, která v buildu není (porovnej s `CHECKLIST.md`). Rozhraní je zatím jen česky
a anglický popis to říká.

Snímky (ne v gitu): `node apps/scripts/snimky.mjs --app=vse --obchod=play --base=http://localhost:3505` (postup serveru je v
`APPLE.md`, oddíl 6). Telefon 1080x2160, tablet 7" 1200x1920, tablet 10" 1600x2560.

## 7. Servisní účet pro `fastlane supply` (nepovinné)

1. <https://console.cloud.google.com> > nový projekt > **APIs & Services** > zapnout **Google Play Android Developer API**.
2. IAM > Service accounts > Create (`play-publisher`), bez rolí v Cloud projektu > Keys > Add key > JSON (stáhne se jednou).
3. Play Console > Users and permissions > Invite new users > e-mail servisního účtu > oprávnění na obě aplikace: *Release to testing
   tracks*, *Manage store presence*; Admin nepřidávej. Oprávnění se propíší za hodiny.
4. JSON ulož mimo repo (`~/.config/managero/play-key.json`, `chmod 600`); `export PLAY_JSON_KEY_PATH=…`. V repu je v `.gitignore`
   (`play-key*.json`).
5. Nahrání: `cd apps && bundle exec fastlane android client_listing` (texty a obrázky), `… client_internal` (AAB do interního testu jako
   koncept). Produkci vždy potvrzuje člověk v konzoli.

Bez fastlane vše vyplníš a nahraješ ručně v Play Console ze souborů v `apps/play-store/`.

## 8. Testování a produkce

- **Interní test** (bez recenze, do 100 lidí): instalace, přihlášení, push, App Links, mazání účtu; na telefonu i tabletu.
- **Uzavřené testování** (Testing > Closed testing > Create track): u **osobního** účtu nejméně **12 testerů souvisle 14 dní**; počítá se za
  aplikaci, stejné lidi můžeš zapsat do obou a poběží souběžně (dohromady ~14 dní, ne 28). Testeři musí přijmout pozvánku (opt-in)
  a nainstalovat. Sehnat je předem (známí provozovatelé, přátelé, ne placené „farmy", Google sleduje skutečné používání). U organizačního
  účtu tenhle krok odpadá.
- **Pre-launch report** se spustí sám: Release > Testing > Pre-launch report > Settings > vlož stejné přihlašovací údaje. Opravit pády a ANR.
- **Žádost o produkci** (osobní účet, po 14 dnech): Dashboard > Apply for production, odpovědi konkrétně (co jste zjistili, co zapracovali).
  Rozhodnutí obvykle do týdne. Organizační účet jde rovnou na Production > Create new release.
- **Produkce**: Production > Create new release (stejný nebo novější AAB) > Review > Start rollout (u nové aplikace stačí 100 %, první
  vydání ale dej klidně na 20 %). Zapni **Managed publishing**, ať se schválená verze nevydá sama v nevhodný čas. Recenze prvního vydání 1 až 7 dní.

## 9. Nejčastější důvody zamítnutí a prevence

| Důvod | Prevence |
|---|---|
| Recenzent se nemůže přihlásit nebo nevidí obsah | demo podnik a tři účty, anglické instrukce, výjimka z limitu pokusů o přihlášení (recenzenti a Pre-launch report sdílejí IP) |
| Zásady soukromí chybí nebo nesouhlasí s Data safety | `/soukromi` veřejné, popisuje stejná data jako formulář |
| Data safety neodpovídá chování | tabulka výš z kódu; po každé nové funkci znovu |
| Chybí mazání účtu (v aplikaci i na webu) | v aplikaci + stránka `/smazat-ucet` (jmenuje obě aplikace a vývojáře), URL ve formuláři |
| Platby mimo Play Billing nebo navádění k platbě | v obalu žádné ceny ani odkazy na platbu (server vrací 403), v listingu a snímcích také ne |
| Uživatelský obsah bez nahlášení a blokace | nahlášení zprávy, smazání zprávy, blokace v chatu (Managero) |
| Zbytečná oprávnění | jen dle `po-cap-add.mjs`; zkontroluj sloučený manifest |
| Minimální funkčnost („jen WebView") | push, sdílení, skener QR, Face ID, App Links + skutečně použitelný obsah po přihlášení |
| Zavádějící metadata | žádné superlativy, ceny a funkce, které nejsou; žádné cizí logo |
| Pád nebo ANR při startu, offline chyba | `offline.html` přes `errorPath`, Pre-launch report, zkouška bez sítě |
| Zastaralý targetSdk, 16 KB stránky | targetSdk 36 nastaví skript; Capacitor 8 a aktuální AGP 16 KB splňují, ověř v Play Console |
| Reklamní ID nesedí | `AD_ID` je v manifestu odstraněné, odpověď „Ne" |
| Deep links neověřené | nezamítá, ale ověř `assetlinks.json` |

Před odesláním projdi aktuální znění pravidel v Play Console (Policy status), mění se několikrát ročně. Sleduj také nový
požadavek ověření vývojářů u Androidu (2026, spouští se po zemích).
