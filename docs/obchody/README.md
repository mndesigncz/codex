# Aplikace v obchodech: přehled

Dvě nativní aplikace (obaly nad živým webem `https://www.managero.app`, Capacitor 8):

| | Managero | Managero client |
|---|---|---|
| Pro koho | vedení a zaměstnanci podniků | hosté podniků |
| Bundle ID / applicationId | `app.managero.app` | `app.managero.client` |
| Vstupní adresa | `/employer/overview` | `/client` |
| Značka v User-Agentu | `ManageroApp/<verze> (build <n>)` | `ManageroClient/<verze> (build <n>)` |
| Zařízení | iPhone, iPad, Android | iPhone, Android |

Server pozná aplikaci podle značky v User-Agentu (`lib/obal.ts`, dělá jiná větev) a podle ní zužuje: v obalu nejsou žádné platby,
špatná role se nepřihlásí. Značka nic neodemyká (dá se napodobit), jen zužuje.

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
  `POST /api/native/push` s `{ token, platform, app: 'provoz' | 'klient', appVersion }` (kontrakt z `plan-app-host.md` 4.3;
  po odhlášení `DELETE` s `{ token }`). Když endpoint neexistuje, selže potichu. Klepnutí na oznámení otevře jen relativní cestu z `link`;
- **sken QR** (`window.manageroNative.skenujQr()` a `skenujAOtevri()`): Google Code Scanner na Androidu (bez oprávnění ke kameře),
  ML Kit na iOS. `CardScan` (Managero) ho používá místo `BarcodeDetector`, který na iPhonu není;
- **sdílení a haptika**: přepíše `navigator.share` a `navigator.vibrate` nativními pluginy, stávající kód se nemění;
- **Face ID zámek** (volitelný, výchozí vypnutý): `window.manageroNative.zamek.{dostupny, zapnuto, nastav}`; zamkne po minutě v pozadí;
- **universal links a App Links** (`appUrlOpen`): jen náš host, cizí ignoruje; Android zpětné gesto;
- **stavový řádek** podle motivu, **splash** se schová po vykreslení.

Zatím **nedodělané** (viz `CHECKLIST.md`): stahování souborů a tisk ve WebView, přepínače v Nastavení (zámek, upozornění),
tlačítko „Naskenovat kód" v hostovské aplikaci.

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
