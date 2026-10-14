# Checklist: co je hotové a co musí člověk

Stav ke dni 14. 10. 2026 (balík O přípravy ke spuštění). „Kód" = je v repu a prošlo kontrolami. „Člověk" = ruční krok, který
za tebe nikdo neudělá. Seřazený seznam kroků pro majitele je na konci (oddíl „Pořadí pro majitele").

| # | Položka | Stav | Kdo | Odhad času / čekání |
|---|---|---|---|---|
| 1 | Konfigurace obalů Capacitor 8 (`apps/managero`, `apps/client`, `apps/apps.json`) | hotovo v kódu | | |
| 2 | Skript po `cap add` (Info.plist, usage strings cs+en, ATS, entitlements, privacy manifest, AndroidManifest, targetSdk 36, AD_ID pryč, App Links) | hotovo, odzkoušeno na vygenerovaných projektech (Linux) | | |
| 3 | Nativní most (`components/NativeBridge.tsx`): push (sandbox z ladicí binárky pozná server), sken QR, sdílení i se soubory, odkazy ven v prohlížeči aplikace, haptika, universal links, splash, stavový řádek | hotovo, sonda `obal-most`, `k88-klient-obal` | | |
| 4 | Pluginy `@capacitor/filesystem` 8.1.3 a `@capacitor/browser` 8.0.4 v obou obalech (soubory přes sdílecí list, odkazy v SFSafariViewController / Custom Tabs) | hotovo v `apps/*/package.json` | po `npm ci` a `npx cap sync` na Macu ověřit | |
| 5 | Offline stránka obalu (`errorPath`); u client ukáže uloženou kartičku z úložiště aplikace (Preferences) | hotovo | | |
| 6 | Ikony 1024 bez alfa, adaptivní Android, splash, Play ikona, feature graphic | hotovo (`apps/*/assets`) | designér by je měl schválit | 1 hodina |
| 7 | Texty App Store (cs, en-US) a Google Play (cs-CZ, en-US), poznámky pro recenzenta a instrukce přístupu | hotovo a srovnáno se skutečností (14. 10.), kontrola `kontrola-listingu.mjs` | právník a ty přečtete | 1 hodina |
| 8 | Snímky iPhone 6.9", 6.5", iPad 13", Android telefon a tablety, video | skripty hotové; znovu spustit z finálního buildu | ty | 30 minut |
| 9 | fastlane (Appfile, Fastfile, Matchfile, Deliverfile, Supplyfile), workflow `android-aab.yml` (jen ručně) | hotovo, bez tajemství, neběželo (není Mac ani klíče) | | |
| 10 | Ruční návody (`APPLE.md`, `GOOGLE.md`), proměnné prostředí (`APPLE.md`, oddíl 12) | hotovo | | |
| 11 | **Apple Developer Program**, organizace, D-U-N-S, Trader status, API klíč | čeká | **člověk** | D-U-N-S 1 až 30 dní, schválení Applem dny; **začni hned** |
| 12 | **Google Play Console** účet, ověření, DSA | čeká | **člověk** | 1 až 7 dní po D-U-N-S |
| 13 | Team ID a SHA-256 do `public/.well-known/` příkazem `node apps/scripts/well-known.mjs zapis --team=… --sha=…` (v repu jsou zatím zástupná pole `{{TEAM_ID}}`, `{{SHA256_MANAGERO}}`, `{{SHA256_CLIENT}}`) | čeká na účty | **člověk** | 15 minut |
| 14 | APNs klíč `.p8` do prostředí serveru: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_P8` | čeká na účet | **člověk** | 15 minut |
| 15 | Firebase projekt, dva `google-services.json` (GitHub secrets), na server `FCM_PROJECT_ID` a `FCM_SERVICE_ACCOUNT` (celý JSON) | čeká | **člověk** | 30 minut |
| 16 | Upload klíče Android (2 × keystore) a GitHub secrets | čeká | **člověk** | 30 minut |
| 17 | Ověřit, že jména „Managero" a „Managero client" nejsou v obchodech obsazená | čeká na záznam v App Store Connect | **člověk** | při zakládání záznamu |
| 18 | `NEXTAUTH_URL` a `NEXT_PUBLIC_APP_URL` na `https://www.managero.app` (s `www`) | neověřeno (prostředí se nečte) | **člověk** | 5 minut |
| 19 | Server: `POST/DELETE /api/native/push`, odesílání APNs / FCM (`lib/nativniPush.ts`) | hotovo (bez klíčů no-op) | | |
| 20 | Brána podle aplikace (`lib/obal.ts`, `middleware.ts`), 403 na platby v obalu, role podle obalu | hotovo | | |
| 21 | Skrytí plateb v UI obalu; založení podniku v aplikaci Managero není (`/register` → `/zalozit-podnik` bez odkazu, `/api/register` z obalu 403, Apple 3.1.3(f)) | hotovo | | |
| 22 | Mazání účtu v aplikaci (Nastavení > Data a soukromí; host: Moje > Účet a soukromí) + veřejná stránka `/smazat-ucet` | hotovo | | |
| 23 | Stránky `/soukromi`, `/podminky`, `/podpora`; údaje firmy `FIRMA_*` v prostředí | kód hotovo, **text schvaluje právník** | právník, ty | 1 den + právník |
| 24 | Nahlášení a mazání zpráv, blokace v chatu (Managero); eskalace na provozovatele (e-mail na `MODERACE_EMAIL` / `FIRMA_EMAIL_PODPORY`, správa `/admin/nahlaseni` se lhůtou 24 h) | hotovo; **nastavit e-mail v prostředí** | ty | 5 minut |
| 25 | Opt-in na marketingové push (client), kategorie oznámení | hotovo | | |
| 26 | Stahování souborů (.ics, CSV, PNG) a tisk ve WebView | hotovo: `lib/stahni.ts` + Filesystem/Share; `<a download>` a nová okna řeší most | ověřit na zařízení | |
| 27 | Karta hosta bez sítě v úložišti aplikace, tlačítka **Naskenovat** a **Zadat kód podniku** (Managero client) | hotovo, sonda `k88-klient-obal` | ověřit na zařízení | |
| 28 | Demo data pro recenzenty: podnik, nabídka, stoly, kupon, rezervace, tři účty (`scripts/seed-recenzent.mjs`) | skript hotový; **spustit proti produkci před odesláním** | **člověk** | 10 minut |
| 29 | Face ID zámek: most hotový (`window.manageroNative.zamek`), **přepínač v Nastavení chybí**; v popisech se proto NEuvádí | nedodělané (UI je mimo obal: `components/Settings.tsx`, `components/client/UcetHosta.tsx`) | vývoj | 0,5 dne |
| 30 | „Přidat na plochu" a Wallet v obalu (`components/client/KartaNastroje.tsx`): v aplikaci tlačítko na plochu nedává smysl a `.pkpass` se ve WebView neotevře | nedodělané (soubor mimo balík O): schovat „Přidat na plochu" přes `useObal`, Wallet otevírat přes `otevriVeSystemu` | vývoj | 1 hodina |
| 31 | Rozhodnout: název aplikací, iPad u Managero | čeká na rozhodnutí | **majitel** | 1 hodina |
| 32 | Stejný commit na webu a v obalu; první týden nenasazovat změny API, které staré verze neznají | proces | vývoj | |
| 33 | Xcode: Team, Archive, zkouška na telefonu (seznam v `APPLE.md`, oddíl 4), TestFlight | čeká na účet a Mac | **člověk** | 1 den |
| 34 | Play Console: App content, první AAB ručně, interní test, (osobní účet: 12 testerů × 14 dní) | čeká na účet | **člověk** | 1 den + případně 14 dní |
| 35 | Odeslání: client první, Managero o den později | čeká | **člověk** | recenze Apple 1 až 3 dny, Google 1 až 7 dní |

## Tvrzení v textech, která musí v odeslaném buildu existovat

Obchody zamítají za funkci, která v aplikaci není (Apple 2.3.1, Google Metadata policy). Před odesláním ověř každé na zařízení:

- **client**: karta bez připojení (Moje otevřít, režim v letadle, zabít, spustit), sken QR tlačítkem Naskenovat (podnik, stůl),
  zadání kódu podniku, oznámení rezervace a objednávky, mazání účtu v aplikaci (Moje > Účet a soukromí), akce do kalendáře,
  kartička jako obrázek, marketingové zprávy až po výslovném zapnutí, poloha se neukládá (ukládá se jen vzdálenost), pozvání
  kamaráda s body jen tam, kde to podnik nabízí, jazyk podle telefonu.
- **Managero**: mazání účtu v aplikaci, kiosk (klepnutí na jméno), ankety v chatu, výměny směn, objednávka dodavateli e-mailem,
  export souborů přes sdílecí list, „Vytvořit účet" vede jen na vysvětlení bez odkazu, nahlášení obsahu.
- **Neuvádět**: Face ID zámek (chybí přepínač), Wallet (jen když jsou na serveru proměnné `APPLE_PASS_*` / `GOOGLE_WALLET_*`).

## Kontroly, které to drží

`npm test` (včetně `scripts/testy/obal-most.ts` a `k88-obal.ts`), `node apps/scripts/kontrola-listingu.mjs [--release]`,
`node scripts/check-well-known.mjs [--release]`, sondy `obal-most`, `k77-obchody`, `k88-klient-obal`
(`npm run sondy -- k88-klient-obal`), `tsc` (složka `apps/` je z něj vyloučená), `.vercelignore` (web `apps/` nenahrává).

## Pořadí pro majitele

Návody krok za krokem: `docs/obchody/APPLE.md` (Apple, proměnné v oddílu 12) a `docs/obchody/GOOGLE.md` (Google).

1. **Hned**: D-U-N-S číslo pro firmu (1 až 30 dní) → `APPLE.md` oddíl 1, `GOOGLE.md` oddíl 1.
2. Apple Developer Program (organizace, 99 USD/rok), Free Apps agreement, Trader status (DSA) → `APPLE.md` 1.
3. Google Play Console (organizační účet, 25 USD), prohlášení obchodníka → `GOOGLE.md` 1.
4. Prostředí serveru (Vercel), dokud čekáš: `FIRMA_*`, `MODERACE_EMAIL` (nebo `FIRMA_EMAIL_PODPORY`), `RESEND_API_KEY` a `EMAIL_FROM`,
   `NEXTAUTH_URL` = `NEXT_PUBLIC_APP_URL` = `https://www.managero.app` → `APPLE.md` 12. Právník schválí `/soukromi`, `/podminky`, `/podpora`.
5. Po schválení Applu: App ID obou aplikací (Push, Associated Domains), APNs klíč → `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_P8`
   na server, API klíč App Store Connect → `APPLE.md` 2, 12.
6. Firebase: projekt, dvě Android aplikace, `google-services.json` do GitHub secrets, `FCM_PROJECT_ID` a `FCM_SERVICE_ACCOUNT`
   na server → `GOOGLE.md` 2. Upload klíče Android (2 × keystore) a GitHub secrets → `GOOGLE.md` 2.
7. Záznamy aplikací v App Store Connect a v Play Console (zamluví jména) → `APPLE.md` 3, `GOOGLE.md` 4.
8. Mac s Xcode 26: `cd apps/client && npm ci && npm run pridej-ios`, totéž pro `apps/managero`; zkouška na iPhonu podle seznamu
   v `APPLE.md` 4 (push z Xcode jde přes sandbox, server to pozná).
9. Android: první AAB (GitHub Actions „Android AAB" nebo lokálně), nahrát ručně do interního testu → `GOOGLE.md` 3, 4.
10. Team ID a SHA-256 z Play App Signing: `node apps/scripts/well-known.mjs zapis --team=… --sha=managero:…,client:…`, zapsat
    otisky i do `apps/apps.json`, commit, nasazení, `node scripts/check-well-known.mjs --release` → `APPLE.md` 4, `GOOGLE.md` 4.
11. Demo data na produkci (vědomě): `DATABASE_URL=… node scripts/seed-recenzent.mjs --db=<hostitel> --produkce=ANO-ZALOZIT-DEMO --generuj`;
    hesla do `REVIEW_*` (fastlane) a do App Review / App access → `APPLE.md` 9.
12. Snímky z finálního buildu (`apps/scripts/snimky.mjs`), `kontrola-listingu.mjs --release` → `APPLE.md` 6.
13. Archive → TestFlight; ověř v exportu `aps-environment = production` (`codesign -d --entitlements - Payload/App.app`) → `APPLE.md` 5.
14. App Privacy, věk, Data safety podle tabulek (bez zvuku) → `APPLE.md` 7, 8, `GOOGLE.md` 5.
15. Odeslat Managero client, o den později Managero; po schválení vypnout demo podnik a změnit hesla → `APPLE.md` 9, 10.
