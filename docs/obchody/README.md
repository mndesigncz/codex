# Aplikace v obchodech: přehled

Dvě nativní aplikace (obaly nad živým webem `https://www.managero.app`, Capacitor 8):

| | Managero | Managero client |
|---|---|---|
| Pro koho | vedení a zaměstnanci podniků | hosté podniků |
| Bundle ID / applicationId | `app.managero.app` | `app.managero.client` |
| Vstupní adresa | `/employer/overview` | `/client` |
| Značka v User-Agentu | `ManageroApp/<verze> (build <n>)` | `ManageroClient/<verze> (build <n>)` |
| Zařízení | iPhone, iPad, Android | iPhone, Android |

Server pozná aplikaci podle značky v User-Agentu (`lib/obal.ts`) a podle ní zužuje: v obalu nejsou žádné platby ani založení
podniku (`/register` → `/zalozit-podnik`), špatná role se nepřihlásí. Značka nic neodemyká (dá se napodobit), jen zužuje.

**Rozhodnutí** (plány se v drobnostech rozcházely): bundle/application ID `app.managero.app` a `app.managero.client` (ne `.provoz`),
doména `https://www.managero.app` s `www` (apex `managero.app` jen přesměrovává a rozbil by ověřené odkazy). Všechno je v
`apps/apps.json`, ze kterého čtou konfigurace, skripty, fastlane a dokumentace.

## Kde co je

| Cesta | Co |
|---|---|
| `apps/apps.json` | jediný zdroj: ID, názvy, UA tokeny, vstupní adresy, barvy |
| `apps/managero/`, `apps/client/` | `capacitor.config.ts`, `package.json` (Capacitor 8, mimo hlavní build), `www/` (offline stránka), `assets/` (ikony, splash, Play grafika) |
| `apps/_shared/` | zdrojové SVG ikon, šablony (offline stránka, feature graphic) |
| `apps/scripts/` | `po-cap-add.mjs`, `sync-www.mjs`, `ikony.mjs`, `snimky.mjs`, `preview.mjs`, `kontrola-listingu.mjs`, `well-known.mjs` |
| `apps/app-store/<app>/` | texty pro fastlane `deliver` (`metadata/<cs|en-US>/`), poznámky pro recenzenta, scénář snímků |
| `apps/play-store/<app>/` | texty pro fastlane `supply` (`metadata/android/<cs-CZ|en-US>/`), instrukce pro recenzenta |
| `apps/fastlane/`, `apps/Gemfile` | lane pro iOS (TestFlight, listing, odeslání) a Android (listing, interní test) |
| `.github/workflows/android-aab.yml` | sestaví podepsaný AAB, jen ručním spuštěním |
| `components/NativeBridge.tsx`, `lib/nativni/most.ts` | nativní most ve webu, načítá se jen v obalu |
| `docs/obchody/APPLE.md`, `GOOGLE.md` | ruční návody krok za krokem |
| `docs/obchody/CHECKLIST.md` | co je hotové a co musí člověk |

Generované nativní projekty (`apps/*/ios`, `apps/*/android`) se **necommitují**, vznikají příkazem `npm run pridej-ios|pridej-android`
a dodělá je `apps/scripts/po-cap-add.mjs` (idempotentní, spouští se i po `cap sync` a po generování ikon). Tajemství
(`.p8`, `.jks`, `google-services.json`, klíče servisního účtu) nikdy do repa.

## Nativní most (co dělá web v obalu)

`components/NativeBridge.tsx` (načítá `NativeBridgeLoader`, jen když je v User-Agentu značka) používá `window.Capacitor.Plugins`,
ne importy, takže web se nezvětšil. Dělá:

- **push**: po přihlášení (ne v kiosku) si nejdřív řekne vlastním vysvětlením, teprve po souhlasu vyvolá systémový dialog; token odešle
  `POST /api/native/push` s `{ token, platform, version }` a u ladicí binárky z Xcode navíc `env: 'sandbox'` (podle
  `window.Capacitor.DEBUG`; aplikaci určuje server podle role účtu). Po odhlášení `DELETE` s `{ token }`. Klepnutí na oznámení otevře
  jen relativní cestu z `link`;
- **sken QR** (`window.manageroNative.skenujQr()` a `skenujAOtevri()`): Google Code Scanner na Androidu (bez oprávnění ke kameře),
  ML Kit na iOS. `CardScan` (Managero) ho používá místo `BarcodeDetector`, který na iPhonu není; v Managero client ho spouští
  tlačítko **Naskenovat** (`components/client/NajitPodnik.tsx`, uprostřed doku), vedle je **Zadat kód podniku**;
- **sdílení a haptika**: přepíše `navigator.share` (i se soubory: zapíše je přes Filesystem do mezipaměti a předá Share),
  `navigator.canShare` a `navigator.vibrate` nativními pluginy, stávající kód se nemění;
- **odkazy a nová okna**: cizí web a veřejné stránky přes `target="_blank"` / `window.open` do prohlížeče v aplikaci (Browser),
  naše soubory z API a `<a download>` přes sdílecí list s přihlášením (`cilOdkazu` v `lib/nativni/most.ts`);
- **karta offline**: `lib/offlineKarta.ts` ukládá kartičku i do Preferences, offline stránka obalu (`errorPath`) ji ukáže;
- **Face ID zámek** (volitelný, výchozí vypnutý): `window.manageroNative.zamek.{dostupny, zapnuto, nastav}`; zamkne po minutě v pozadí.
  Přepínač v Nastavení zatím není, proto se v popisech neuvádí;
- **universal links a App Links** (`appUrlOpen`): jen náš host, cizí ignoruje; Android zpětné gesto;
- **stavový řádek** podle motivu, **splash** se schová po vykreslení.

Zatím **nedodělané** (viz `CHECKLIST.md`): přepínač Face ID zámku v Nastavení, „Přidat na plochu" a Wallet v obalu
(`components/client/KartaNastroje.tsx`).

## Rychlý start

```bash
node apps/scripts/kontrola-listingu.mjs           # texty, ikony, snímky
cd apps/client && npm ci && npm run pridej-ios     # na Macu; pridej-android kdekoli s Javou 21
```

Dál: `APPLE.md`, `GOOGLE.md`. Kdyby tě zajímalo, proč je to zrovna takhle, jsou podrobné plány v historii sezení
(obal, host, listing, Android).

## Poznámka k prostředí cloudové session

Playwright zde chce novější Chromium, než je nainstalovaný: nastav `SONDY_CHROMIUM=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`.
Plný `chrome` při velkém viewportu padá. Video: `FFMPEG=/tmp/ffmpeg-obal` (statický ffmpeg zkopírovaný z lokální session). Když je disk
plný (38 MB volných), prohlížeč padá na „Target crashed": uvolni místo.
