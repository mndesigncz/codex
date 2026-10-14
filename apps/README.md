# apps/: nativní obaly a podklady pro obchody

Mimo hlavní build webu (`tsconfig.json` ji vylučuje, `.vercelignore` ji nenahrává, vlastní `package.json` v každém obalu).
Přehled: `docs/obchody/README.md`. Návody: `docs/obchody/APPLE.md`, `docs/obchody/GOOGLE.md`. Stav: `docs/obchody/CHECKLIST.md`.
Jediný zdroj pravdy (ID, UA tokeny, vstupní adresy): `apps.json`.

Pluginy obalů (`apps/*/package.json`): app, barcode-scanning (ML Kit), biometric-auth, **browser**, **filesystem**, haptics, preferences,
push-notifications, share, splash-screen, status-bar. Web je volá jen přes `window.Capacitor.Plugins` (`lib/nativni/most.ts`), kořenový
`package.json` je nemá. Po změně pluginů na Macu `npm ci && npm run sync` v obou obalech.

Proměnné prostředí serveru pro push a Wallet (přesné názvy, čte je `lib/nativniPush.ts` a `lib/walletKonfig.ts`):
`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_P8`, volitelně `APNS_TOPIC_MANAGERO`, `APNS_TOPIC_CLIENT`; `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT`
(celý JSON servisního účtu); Wallet `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_PASS_CERT_P12_BASE64`, `APPLE_PASS_CERT_PASSWORD`,
`APPLE_WWDR_CERT_PEM`, `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_WALLET_PRIVATE_KEY`. Celý seznam s tím,
kde hodnoty vzít: `docs/obchody/APPLE.md`, oddíl 12.

Push na iOS: `aps-environment` v entitlements je `development` (Run z Xcode); export archivu ho přepíše na `production` a ladicí binárka
pošle serveru `env: 'sandbox'`. Ruční podepisování distribučním profilem: `APS_ENV=production node scripts/po-cap-add.mjs <app> ios`.
Ověřené odkazy: `node scripts/well-known.mjs zapis --team=… --sha=…` (z kořene repa `node apps/scripts/well-known.mjs …`).
