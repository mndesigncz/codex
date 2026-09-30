# Checklist: co je hotové a co musí člověk

Stav ke dni přípravy (30. 9. 2026). „Kód" = je v repu a prošlo kontrolami. „Jiná práce" = patří jiné větvi (server, brána,
platby, právní stránky); obal na ni spoléhá a bez ní se obchody nepodaří projít. „Člověk" = ruční krok, který za tebe nikdo neudělá.

| # | Položka | Stav | Kdo | Odhad času / čekání |
|---|---|---|---|---|
| 1 | Konfigurace obalů Capacitor 8 (`apps/managero`, `apps/client`, `apps/apps.json`) | hotovo v kódu | | |
| 2 | Skript po `cap add` (Info.plist, usage strings cs+en, ATS, entitlements, privacy manifest, AndroidManifest, targetSdk 36, AD_ID pryč, App Links) | hotovo, odzkoušeno na vygenerovaných projektech (Linux) | | |
| 3 | Nativní most (`components/NativeBridge.tsx`): push, sken QR, sdílení, haptika, Face ID zámek, universal links, splash, stavový řádek | hotovo, sonda `obal-most` | | |
| 4 | Offline stránka obalu (`errorPath`) | hotovo | | |
| 5 | Ikony 1024 bez alfa, adaptivní Android, splash, Play ikona, feature graphic | hotovo (`apps/*/assets`) | designér by je měl schválit | 1 hodina |
| 6 | Texty App Store (cs, en-US) a Google Play (cs-CZ, en-US) | hotovo, kontrola `kontrola-listingu.mjs` | právník a ty přečtete | 1 hodina |
| 7 | Snímky iPhone 6.9", 6.5", iPad 13", Android telefon a tablety, video | skripty hotové a spuštěné; znovu spustit z finálního buildu | ty | 30 minut |
| 8 | fastlane (Appfile, Fastfile, Matchfile, Deliverfile, Supplyfile), workflow `android-aab.yml` (jen ručně) | hotovo, bez tajemství, neběželo (není Mac ani klíče) | | |
| 9 | Ruční návody (`APPLE.md`, `GOOGLE.md`) | hotovo | | |
| 10 | **Apple Developer Program**, organizace, D-U-N-S, Trader status, API klíč | čeká | **člověk** | D-U-N-S 1 až 30 dní, schválení Applem dny; **začni hned** |
| 11 | **Google Play Console** účet, ověření, DSA | čeká | **člověk** | 1 až 7 dní po D-U-N-S |
| 12 | Team ID do `apple-app-site-association` a SHA-256 do `assetlinks.json` (`apps/scripts/well-known.mjs`) | čeká na účty | **člověk** | 15 minut |
| 13 | APNs klíč `.p8` do prostředí serveru (`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`) | čeká na účet | **člověk** | 15 minut |
| 14 | Firebase projekt, dva `google-services.json`, `FCM_SERVICE_ACCOUNT_JSON` | čeká | **člověk** | 30 minut |
| 15 | Upload klíče Android (2 × keystore) a GitHub secrets | čeká | **člověk** | 30 minut |
| 16 | Ověřit, že jména „Managero" a „Managero client" nejsou v obchodech obsazená | čeká na záznam v App Store Connect | **člověk** | při zakládání záznamu |
| 17 | `NEXTAUTH_URL` a `NEXT_PUBLIC_APP_URL` na `https://www.managero.app` (s `www`) | neověřeno (prostředí se nečte) | **člověk** | 5 minut |
| 18 | Server: endpoint `POST/DELETE /api/native/push` a odesílání APNs / FCM (`lib/push.ts`) | **jiná práce**; klient při chybějícím endpointu selže potichu | vývoj | 2 dny |
| 19 | Server: brána podle aplikace (`lib/obal.ts`, `middleware.ts`), 403 na platby v obalu, role podle obalu | **jiná práce** | vývoj | 1 až 2 dny |
| 20 | Skrytí plateb v UI obalu (ceny, Stripe, „Odemknout", registrace bez tarifu) | **jiná práce** | vývoj | 1 až 2 dny |
| 21 | Mazání účtu v aplikaci + veřejná stránka `/smazat-ucet` | **jiná práce**, bez toho zamítnou oba obchody | vývoj | 2 dny |
| 22 | Stránky `/soukromi`, `/podminky`, `/podpora` (text od právníka), odkazy v aplikaci | **jiná práce** + právník | vývoj, právník | 1 den + právník |
| 23 | Nahlášení a mazání zpráv, blokace v chatu (Managero) | **jiná práce** | vývoj | 1 až 2 dny |
| 24 | Opt-in na marketingové push (client), kategorie oznámení | **jiná práce** | vývoj | 1 den |
| 25 | Geolokace: `Permissions-Policy geolocation=(self)` místo `()` | **jiná práce**, jinak objednávka od stolu nedostane polohu | vývoj | 5 minut |
| 26 | `viewport-fit=cover` v `app/layout.tsx` (bezpečné okraje v obalu) | **jiná práce** | vývoj | 5 minut |
| 27 | Stahování souborů (.ics, CSV, PNG) a tisk ve WebView (`<a download>`, `window.print`) | **nedodělané**: plugin pro soubory není v obalu, doplnit přes sdílení | vývoj | 1 až 2 dny |
| 28 | Karta hosta bez sítě, záložka Karta, sken QR na stránce Podniky (volá `window.manageroNative.skenujAOtevri()`) | **jiná práce** (klient UI); most je připravený | vývoj | 1 až 2 dny |
| 29 | Demo data pro recenzenty (podnik, tři účty, skript proti databázi) | **jiná práce** | vývoj | 1 den |
| 30 | Rozhodnout: platby v aplikaci (3.1.3(c) riziko), název aplikací, iPad u Managero, anglický text při UI jen česky | čeká na rozhodnutí | **majitel** | 1 hodina |
| 31 | Stejný commit na webu a v obalu; první týden nenasazovat změny API, které staré verze neznají | proces | vývoj | |
| 32 | Xcode: Team, Archive, zkouška na telefonu, TestFlight | čeká na účet | **člověk** | 1 den |
| 33 | Play Console: App content, první AAB ručně, interní test, (osobní účet: 12 testerů × 14 dní) | čeká na účet | **člověk** | 1 den + případně 14 dní |
| 34 | Odeslání: client první, Managero o den později | čeká | **člověk** | recenze Apple 1 až 3 dny, Google 1 až 7 dní |

## Tvrzení v textech, která musí v odeslaném buildu existovat

Obchody zamítají za funkci, která v aplikaci není (Apple 2.3.1, Google Metadata policy). Před odesláním ověř každé:

- **client**: karta funguje bez připojení, sken QR (podnik, stůl), oznámení rezervace a objednávky, mazání účtu v aplikaci (Profil),
  přidání rezervace do kalendáře, marketingové zprávy až po výslovném zapnutí, poloha se neukládá (ukládá se jen vzdálenost),
  pozvání kamaráda s body jen tam, kde to podnik nabízí.
- **Managero**: mazání účtu v aplikaci, kiosk (klepnutí na jméno), ankety v chatu, výměny směn, objednávka dodavateli e-mailem,
  Face ID zámek (zapíná se přes `window.manageroNative.zamek.nastav(true)`; přepínač v Nastavení je práce na UI).

## Kontroly, které to drží

`npm test` (včetně `scripts/testy/obal-most.ts`), `node apps/scripts/kontrola-listingu.mjs [--release]`, sonda `obal-most`
(`npm run sondy -- obal-most`), `tsc` (složka `apps/` je z něj vyloučená), `.vercelignore` (web `apps/` nenahrává).
