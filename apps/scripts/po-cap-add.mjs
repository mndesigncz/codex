// Doplní vygenerované nativní projekty tím, co Capacitor sám nedělá.
//
//   node apps/scripts/po-cap-add.mjs managero|client [ios|android]
//
// Spouští se po `npx cap add ios|android`, po `npx cap sync` a po
// `npx @capacitor/assets generate` (ikony). Je IDEMPOTENTNÍ: podruhé nic
// nezmění. Nativní projekty (apps/*/ios, apps/*/android) se do repa NEcommitují,
// vznikají na Macu (iOS) a v CI (Android); v repu je jen tenhle skript a
// apps/apps.json, z nichž se vždy dají znovu dodělat.
//
// iOS: Info.plist (cs jako hlavní jazyk, ITS šifrování, ATS, orientace, zařízení),
//      InfoPlist.strings cs+en (usage strings), App.entitlements (push, Associated
//      Domains), PrivacyInfo.xcprivacy, úpravy App.xcodeproj (soubory do projektu,
//      entitlements, rodina zařízení, verze).
// Android: AndroidManifest (oprávnění bez AD_ID, App Links, ML Kit modul, zpětné
//      gesto), targetSdk 36, verze a podpis v build.gradle, edge-to-edge,
//      barvy splashe, monochromatická vrstva adaptivní ikony.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APPS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spolecne = JSON.parse(readFileSync(`${APPS}/apps.json`, 'utf8'));
const KLIC = process.argv[2];
const app = spolecne.apps[KLIC];
if (!app) { console.error('použití: po-cap-add.mjs managero|client [ios|android]'); process.exit(2); }
const jenPlatforma = process.argv[3];
const ROOT = `${APPS}/${KLIC}`;
const zmeneno = [];

const cti = (f) => readFileSync(f, 'utf8');
function zapis(f, obsah) {
  const stary = existsSync(f) ? cti(f) : null;
  if (stary === obsah) return;
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, obsah);
  zmeneno.push(path.relative(APPS, f));
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// ----------------------------------------------------------------------------------------------
// Texty, které Apple ukazuje uživateli (konkrétně, česky i anglicky, podle plan-app-obal.md 2.6).
// Uvádí se JEN to, co aplikace opravdu používá: prázdné nebo obecné účely Apple odmítá.
// ----------------------------------------------------------------------------------------------
const POUZITI = {
  managero: {
    NSCameraUsageDescription: [
      'Kamera slouží k focení účtenek a skladových položek a ke skenování QR kódů věrnostních karet hostů.',
      "The camera is used to photograph receipts and stock items and to scan guests' loyalty card QR codes."],
    NSPhotoLibraryUsageDescription: [
      'Umožní vybrat fotku účtenky, položky nebo přílohu do chatu.',
      'Lets you choose a photo of a receipt, an item or a chat attachment.'],
    NSFaceIDUsageDescription: [
      'Face ID zamyká aplikaci, aby se k údajům podniku nedostal nikdo cizí.',
      'Face ID locks the app so nobody else can see your business data.'],
    NSLocationWhenInUseUsageDescription: [
      'Poloha se použije jen jednou při nastavení souřadnic podniku.',
      "Location is used once, only to set your venue's coordinates."],
  },
  client: {
    NSCameraUsageDescription: [
      'Kamera slouží ke skenování QR kódů na stolech a v podnicích.',
      'The camera is used to scan QR codes on tables and at venues.'],
    NSFaceIDUsageDescription: [
      'Face ID chrání zobrazení vaší věrnostní karty a rezervací.',
      'Face ID protects your loyalty card and bookings.'],
    NSLocationWhenInUseUsageDescription: [
      'Poloha se použije jen k ověření, že sedíte v podniku, když objednáváte od stolu. Ukládá se pouze vzdálenost od podniku, ne poloha.',
      'Location is used only to verify you are at the venue when ordering from a table. Only the distance to the venue is stored, not your location.'],
  },
}[KLIC];

// Kategorie pro PrivacyInfo.xcprivacy (shodné s tabulkou „App Privacy“ v docs/obchody/APPLE.md).
const SBIRANA_DATA = {
  managero: ['Name', 'EmailAddress', 'PhoneNumber', 'PhotosorVideos', 'OtherUserContent', 'UserID', 'DeviceID', 'OtherFinancialInfo', 'PreciseLocation'],
  client: ['Name', 'EmailAddress', 'PhoneNumber', 'OtherUserContent', 'UserID', 'DeviceID', 'PurchaseHistory', 'PreciseLocation'],
}[KLIC];

// ================================================================================================
// iOS
// ================================================================================================
function ios() {
  const IOS = `${ROOT}/ios/App`;
  if (!existsSync(`${IOS}/App/Info.plist`)) { console.log(`ios: projekt ${KLIC} neexistuje (nejdřív npx cap add ios), přeskakuji`); return; }

  // ---- Info.plist ------------------------------------------------------------------------------
  let p = cti(`${IOS}/App/Info.plist`);
  const prvek = String.raw`(?:<string>[^<]*</string>|<true/>|<false/>|<array>[\s\S]*?</array>|<dict>[\s\S]*?</dict>)`;
  function nastav(klic, hodnotaXml) {
    const re = new RegExp(String.raw`<key>${klic.replace(/[~]/g, '\\$&')}</key>\s*${prvek}`);
    const novy = `<key>${klic}</key>\n\t${hodnotaXml}`;
    if (re.test(p)) p = p.replace(re, novy);
    else p = p.replace(/<\/dict>\s*<\/plist>\s*$/, `\t${novy}\n</dict>\n</plist>\n`);
  }
  const odstran = (klic) => { p = p.replace(new RegExp(String.raw`\s*<key>${klic.replace(/[~]/g, '\\$&')}</key>\s*${prvek}`), ''); };
  const retezce = (...r) => `<array>\n${r.map(x => `\t\t<string>${x}</string>`).join('\n')}\n\t</array>`;

  nastav('CFBundleDevelopmentRegion', '<string>cs</string>');                  // hlavní jazyk = čeština (UI je zatím jen česky)
  nastav('CFBundleLocalizations', retezce('cs', 'en'));
  nastav('CFBundleDisplayName', `<string>${esc(app.nazev)}</string>`);
  nastav('ITSAppUsesNonExemptEncryption', '<false/>');                          // jen HTTPS z OS; jinak se App Store Connect ptá u každého buildu
  nastav('UIRequiredDeviceCapabilities', retezce('arm64'));
  nastav('NSAppTransportSecurity', '<dict>\n\t\t<key>NSAllowsArbitraryLoads</key>\n\t\t<false/>\n\t</dict>'); // ATS zůstává zapnuté, žádné výjimky
  for (const [k, [cs]] of Object.entries(POUZITI)) nastav(k, `<string>${esc(cs)}</string>`); // výchozí (cs); en přes InfoPlist.strings
  if (app.zarizeni.includes('ipad')) {
    // Managero: iPad za barem (kiosk) ve všech orientacích.
  } else {
    // Managero client: jen iPhone na výšku, žádná iPad větev.
    nastav('UISupportedInterfaceOrientations', retezce('UIInterfaceOrientationPortrait'));
    odstran('UISupportedInterfaceOrientations~ipad');
  }
  zapis(`${IOS}/App/Info.plist`, p);

  // ---- InfoPlist.strings (cs, en) ---------------------------------------------------------------
  const strings = (i) => Object.entries(POUZITI).map(([k, v]) => `"${k}" = "${v[i].replace(/"/g, '\\"')}";`).join('\n') + '\n'
    + `"CFBundleDisplayName" = "${app.nazev}";\n`;
  zapis(`${IOS}/App/cs.lproj/InfoPlist.strings`, strings(0));
  zapis(`${IOS}/App/en.lproj/InfoPlist.strings`, strings(1));

  // ---- Entitlements ---------------------------------------------------------------------------
  // aps-environment: při exportu pro App Store Xcode sám přepíše development na production.
  const domeny = [`applinks:${spolecne.domena}`, `webcredentials:${spolecne.domena}`];
  zapis(`${IOS}/App/App.entitlements`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>aps-environment</key>
\t<string>development</string>
\t<key>com.apple.developer.associated-domains</key>
\t<array>
${domeny.map(d => `\t\t<string>${d}</string>`).join('\n')}
\t</array>
</dict>
</plist>
`);

  // ---- Privacy manifest ----------------------------------------------------------------------
  // Capacitor a oficiální pluginy nesou vlastní manifesty; tohle je manifest samotné aplikace.
  // Seznam „required reason API“ ověř v Xcode: Product > Archive > Distribute > Generate Privacy Report.
  const typ = (t) => `\t\t<dict>
\t\t\t<key>NSPrivacyCollectedDataType</key>
\t\t\t<string>NSPrivacyCollectedDataType${t}</string>
\t\t\t<key>NSPrivacyCollectedDataTypeLinked</key>
\t\t\t<true/>
\t\t\t<key>NSPrivacyCollectedDataTypeTracking</key>
\t\t\t<false/>
\t\t\t<key>NSPrivacyCollectedDataTypePurposes</key>
\t\t\t<array>
\t\t\t\t<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
\t\t\t</array>
\t\t</dict>`;
  const api = (kategorie, duvod) => `\t\t<dict>
\t\t\t<key>NSPrivacyAccessedAPIType</key>
\t\t\t<string>${kategorie}</string>
\t\t\t<key>NSPrivacyAccessedAPITypeReasons</key>
\t\t\t<array>
\t\t\t\t<string>${duvod}</string>
\t\t\t</array>
\t\t</dict>`;
  zapis(`${IOS}/App/PrivacyInfo.xcprivacy`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>NSPrivacyTracking</key>
\t<false/>
\t<key>NSPrivacyTrackingDomains</key>
\t<array/>
\t<key>NSPrivacyCollectedDataTypes</key>
\t<array>
${SBIRANA_DATA.map(typ).join('\n')}
\t</array>
\t<key>NSPrivacyAccessedAPITypes</key>
\t<array>
${[api('NSPrivacyAccessedAPICategoryUserDefaults', 'CA92.1'), api('NSPrivacyAccessedAPICategoryFileTimestamp', 'C617.1'),
    api('NSPrivacyAccessedAPICategorySystemBootTime', '35F9.1'), api('NSPrivacyAccessedAPICategoryDiskSpace', 'E174.1')].join('\n')}
\t</array>
</dict>
</plist>
`);

  // ---- App.xcodeproj/project.pbxproj ----------------------------------------------------------
  const PBX = `${IOS}/App.xcodeproj/project.pbxproj`;
  let x = cti(PBX);
  // Stálá ID (24 hex), aby druhé spuštění poznalo, že už je hotovo.
  const ID = { priv: 'A10C0FFEE0000000000000A1', privB: 'A10C0FFEE0000000000000A2',
    ent: 'A10C0FFEE0000000000000B1',
    vg: 'A10C0FFEE0000000000000C1', vgB: 'A10C0FFEE0000000000000C2', cs: 'A10C0FFEE0000000000000C3', en: 'A10C0FFEE0000000000000C4' };
  if (!x.includes(ID.priv)) {
    x = x.replace('/* End PBXBuildFile section */',
      `\t\t${ID.privB} /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = ${ID.priv} /* PrivacyInfo.xcprivacy */; };\n`
      + `\t\t${ID.vgB} /* InfoPlist.strings in Resources */ = {isa = PBXBuildFile; fileRef = ${ID.vg} /* InfoPlist.strings */; };\n/* End PBXBuildFile section */`);
    x = x.replace('/* End PBXFileReference section */',
      `\t\t${ID.priv} /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };\n`
      + `\t\t${ID.ent} /* App.entitlements */ = {isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = App.entitlements; sourceTree = "<group>"; };\n`
      + `\t\t${ID.cs} /* cs */ = {isa = PBXFileReference; lastKnownFileType = text.plist.strings; name = cs; path = cs.lproj/InfoPlist.strings; sourceTree = "<group>"; };\n`
      + `\t\t${ID.en} /* en */ = {isa = PBXFileReference; lastKnownFileType = text.plist.strings; name = en; path = en.lproj/InfoPlist.strings; sourceTree = "<group>"; };\n/* End PBXFileReference section */`);
    x = x.replace('/* End PBXVariantGroup section */',
      `\t\t${ID.vg} /* InfoPlist.strings */ = {\n\t\t\tisa = PBXVariantGroup;\n\t\t\tchildren = (\n\t\t\t\t${ID.cs} /* cs */,\n\t\t\t\t${ID.en} /* en */,\n\t\t\t);\n\t\t\tname = InfoPlist.strings;\n\t\t\tsourceTree = "<group>";\n\t\t};\n/* End PBXVariantGroup section */`);
    x = x.replace(/(\t+)(\w{24}) \/\* Info\.plist \*\/,\n/,
      (m, t, id) => `${m}${t}${ID.priv} /* PrivacyInfo.xcprivacy */,\n${t}${ID.ent} /* App.entitlements */,\n${t}${ID.vg} /* InfoPlist.strings */,\n`);
    x = x.replace(/(\t+)(\w{24}) \/\* LaunchScreen\.storyboard in Resources \*\/,\n/,
      (m, t) => `${m}${t}${ID.privB} /* PrivacyInfo.xcprivacy in Resources */,\n${t}${ID.vgB} /* InfoPlist.strings in Resources */,\n`);
    x = x.replace('developmentRegion = en;', 'developmentRegion = cs;');
    x = x.replace(/knownRegions = \(\n(\t+)en,/, (m, t) => `knownRegions = (\n${t}cs,\n${t}en,`);
  }
  // Nastavení cíle App (obě konfigurace): entitlements, verze, zařízení, bez Macu/Vision Pro.
  const rodina = app.zarizeni.includes('ipad') ? '"1,2"' : '1';
  const nastavCil = (kl, hod) => {
    const re = new RegExp(`(\\t+)${kl} = [^;]*;`, 'g');
    if (re.test(x)) x = x.replace(re, `$1${kl} = ${hod};`);
  };
  if (!x.includes('CODE_SIGN_ENTITLEMENTS')) x = x.replace(/(\t+)CODE_SIGN_STYLE = Automatic;/g, '$1CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n$1CODE_SIGN_STYLE = Automatic;');
  nastavCil('TARGETED_DEVICE_FAMILY', rodina);
  nastavCil('MARKETING_VERSION', spolecne.verze);
  nastavCil('CURRENT_PROJECT_VERSION', String(spolecne.build));
  nastavCil('IPHONEOS_DEPLOYMENT_TARGET', spolecne.ios.minVersion);
  if (!x.includes('SUPPORTS_MACCATALYST')) {
    x = x.replace(/(\t+)TARGETED_DEVICE_FAMILY = ([^;]*);/g,
      '$1SUPPORTS_MACCATALYST = NO;\n$1SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = NO;\n$1SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD = NO;\n$1TARGETED_DEVICE_FAMILY = $2;');
  }
  zapis(PBX, x);
}

// ================================================================================================
// Android
// ================================================================================================
function android() {
  const AND = `${ROOT}/android`;
  if (!existsSync(`${AND}/app/src/main/AndroidManifest.xml`)) { console.log(`android: projekt ${KLIC} neexistuje (nejdřív npx cap add android), přeskakuji`); return; }
  const jeKlient = KLIC === 'client';

  // ---- AndroidManifest.xml (plně řízený odsud; Capacitor ho při sync nemění) ---------------------
  const cesty = app.linkCesty.map(c => `                <data android:pathPrefix="${c}" />`).join('\n');
  zapis(`${AND}/app/src/main/AndroidManifest.xml`, `<?xml version="1.0" encoding="utf-8"?>
<!-- Generuje apps/scripts/po-cap-add.mjs z apps/apps.json. Ručně neupravovat, upravit skript. -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <application
        android:allowBackup="false"
        android:usesCleartextTraffic="false"
        android:enableOnBackInvokedCallback="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <!-- Google Code Scanner stáhne svůj modul hned při instalaci, ne až při prvním skenu. -->
        <meta-data
            android:name="com.google.mlkit.vision.DEPENDENCIES"
            android:value="barcode_ui" />

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <!-- App Links: ověřené odkazy na ${spolecne.domena}. Cesty obou aplikací jsou disjunktní,
                 takže se nikdy neukáže výběr aplikace. Kořen "/" se nikdy nevazuje (prodejní stránka). -->
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" />
                <data android:host="${spolecne.domena}" />
${cesty}
            </intent-filter>

            <!-- Záložní vlastní schéma (${app.urlSchema}://). -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${app.urlSchema}" />
            </intent-filter>
        </activity>

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths"></meta-data>
        </provider>
    </application>

    <!-- Oprávnění: jen, co aplikace používá. -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <!-- Poloha jen v popředí: ověření polohy u stolu (client) a souřadnice podniku (Managero). -->
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
${jeKlient
    ? `    <!-- Client skenuje QR přes Google Code Scanner, ten oprávnění ke kameře nepotřebuje. -->
    <uses-permission android:name="android.permission.CAMERA" tools:node="remove" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" tools:node="remove" />`
    : `    <!-- Managero fotí účtenky a skladové položky (capture="environment" ve WebView vyžaduje CAMERA). -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />`}
    <!-- Bez reklamního ID: musí souhlasit s odpovědí v Play Console (Advertising ID = Ne). -->
    <uses-permission android:name="com.google.android.gms.permission.AD_ID" tools:node="remove" />
</manifest>
`);

  // ---- variables.gradle: targetSdk 36 ---------------------------------------------------------
  const VAR = `${AND}/variables.gradle`;
  if (existsSync(VAR)) {
    let v = cti(VAR);
    v = v.replace(/minSdkVersion = \d+/, `minSdkVersion = ${spolecne.android.minSdk}`)
      .replace(/compileSdkVersion = \d+/, `compileSdkVersion = ${spolecne.android.compileSdk}`)
      .replace(/targetSdkVersion = \d+/, `targetSdkVersion = ${spolecne.android.targetSdk}`);
    zapis(VAR, v);
  }

  // ---- app/build.gradle: verze, podpis -------------------------------------------------------
  const GR = `${AND}/app/build.gradle`;
  if (existsSync(GR)) {
    let g = cti(GR);
    // versionCode musí každým nahráním růst; CI ho dodá přes VERSION_CODE (github.run_number + offset).
    g = g.replace(/versionCode [^\n]+/, `versionCode (System.getenv("VERSION_CODE") ?: "${spolecne.build}").toInteger()`)
      .replace(/versionName "[^"]*"/, `versionName (System.getenv("VERSION_NAME") ?: "${spolecne.verze}")`);
    if (!g.includes('signingConfigs')) {
      g = g.replace(/\n    buildTypes \{/, `
    // Podpis upload klíčem. Klíč ani hesla NEJSOU v repu: keystore.properties (v .gitignore) nebo proměnné prostředí z CI.
    signingConfigs {
        release {
            def ks = rootProject.file('keystore.properties')
            def props = new Properties()
            if (ks.exists()) ks.withInputStream { props.load(it) }
            def cesta = props['storeFile'] ?: System.getenv('ANDROID_KEYSTORE_PATH')
            if (cesta) {
                storeFile file(cesta)
                storePassword props['storePassword'] ?: System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias props['keyAlias'] ?: System.getenv('ANDROID_KEY_ALIAS')
                keyPassword props['keyPassword'] ?: System.getenv('ANDROID_KEY_PASSWORD')
            }
        }
    }
    buildTypes {`);
      g = g.replace(/(release \{\n)(\s+)minifyEnabled/, `$1$2if (signingConfigs.release.storeFile != null) { signingConfig signingConfigs.release }\n$2minifyEnabled`);
    }
    zapis(GR, g);
  }

  // ---- Barvy splashe a edge-to-edge -------------------------------------------------------------
  const RES = `${AND}/app/src/main/res`;
  zapis(`${RES}/values/colors_splash.xml`, `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="splash_pozadi">${app.barvy.splashSvetly}</color>
</resources>
`);
  zapis(`${RES}/values-night/colors_splash.xml`, `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="splash_pozadi">${app.barvy.splashTmavy}</color>
</resources>
`);
  const ST = `${RES}/values/styles.xml`;
  if (existsSync(ST)) {
    let s = cti(ST);
    if (!s.includes('windowSplashScreenBackground')) {
      s = s.replace(/(<style name="AppTheme\.NoActionBarLaunch"[^>]*>)/, `$1\n        <item name="windowSplashScreenBackground">@color/splash_pozadi</item>\n        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>`);
    }
    // Displej s výřezem: obsah jede do výřezu, bezpečné okraje řeší CSS (SystemBars.insetsHandling = css).
    if (!s.includes('windowLayoutInDisplayCutoutMode')) {
      s = s.replace(/(<style name="AppTheme\.NoActionBar" [^>]*>)/, `$1\n        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>`);
    }
    zapis(ST, s);
  }

  // ---- Monochromatická vrstva adaptivní ikony (Android 13, tematické ikony) ---------------------
  for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    const cesta = `${RES}/mipmap-anydpi-v26/${f}`;
    if (!existsSync(cesta)) continue;
    const a = cti(cesta);
    if (!a.includes('<monochrome')) zapis(cesta, a.replace('</adaptive-icon>', '    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>'));
  }
}

if (!jenPlatforma || jenPlatforma === 'ios') ios();
if (!jenPlatforma || jenPlatforma === 'android') android();
console.log(zmeneno.length ? `po-cap-add ${KLIC}: změněno ${zmeneno.length} souborů\n  ${zmeneno.join('\n  ')}` : `po-cap-add ${KLIC}: beze změny`);
