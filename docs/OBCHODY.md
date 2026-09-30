# Aplikace pro obchody (App Store, Google Play): kód a rozhodnutí

Kód tohoto kola připravuje **webovou část** dvou nativních obalů nad jedním webem. Samotné obaly (Capacitor,
Xcode, Gradle) se dělají zvlášť; tady je to, co musí umět server a web, aby obchody aplikace schválily.

## Rozhodnutí (plány se v drobnostech rozcházely)

| Věc | Rozhodnutí |
|---|---|
| Bundle ID / applicationId | `app.managero.app` (provoz, „Managero“) a `app.managero.client` (hosté, „Managero client“). Ne `…provoz`. |
| Doména | `https://www.managero.app`. Apex `managero.app` přesměrovává, proto universal links a app links jen na `www`. |
| Poznání aplikace | Značka v User-Agentu: `ManageroApp/<verze> (build N)` a `ManageroClient/<verze> (build N)` (`lib/obal.ts`). |
| Význam značky | Značka **jen zužuje** práva (zavře část webu, schová platby), nikdy nic neodemyká. Kdokoli si ji pošle sám; autorizace zůstává v rolích. |
| Platby | V obalu žádná cena, nákup ani odkaz na Stripe (Apple 3.1.1, Google Play Billing). Server odmítne `/api/billing/{checkout,portal,upgrade}` z obalu stavem 403, UI to schová. Předplatné se kupuje a spravuje na webu. |
| Push | Web push (VAPID) beze změny; nativní větev přes tabulku `device_tokens` a `lib/nativniPush.ts` (APNs přímo, FCM HTTP v1). Bez klíčů v prostředí je to no-op. |
| Mazání účtu | Anonymizace řádku `users` (ne tvrdé smazání), smazání osobních dat; vlastník podniku jen s výslovným smazáním podniku. `lib/smazaniUctu.ts`. |
| Texty | `/soukromi`, `/podminky`, `/podpora`, `/smazat-ucet` česky a s anglickými kopiemi `/en/…`. **Musí je schválit právník.** |

## Co kód dělá

1. **Brána obalu** (`middleware.ts`, `lib/obal.ts`) před čtením relace: hostovská aplikace smí jen `/client/*`, `/api/client/*`
   mimo `admin` a `staff`, přihlášení, push, právní stránky a `.well-known`; provozní aplikace nepustí hostovské stránky `/client/*`.
   Role se kontroluje i při přihlášení (`authorize` vrací `OBAL_ROLE` po správném hesle).
2. **Skryté platby**: `components/Pro.tsx` (zámky bez ceny a výzvy), Nastavení, registrace, úvodní stránka, bannery, `/api/billing/status`,
   oznámení a push o platbě (neutrální text). Hlídá `scripts/check-obal.mjs` a sonda `k77-obchody`.
3. **Mazání účtu**: `DELETE /api/account` (heslo, limit, protokol), tlačítko v Nastavení (Zabezpečení) a v Profilu hosta,
   veřejná stránka `/smazat-ucet` (žádost e-mailem, smazání až po potvrzení odkazem; GET odkazu nic nemaže).
   `scripts/check-smazani.mjs` hlídá, že nová tabulka s odkazem na uživatele nebo podnik má rozhodnutí.
4. **Právní stránky** z jedné konfigurace firmy (`lib/firma.ts`). Bez vyplněných údajů zůstanou viditelná pole `{{NAZEV_FIRMY}}`,
   `{{ICO}}`, `{{ADRESA}}`, `{{EMAIL_PODPORY}}`, `{{REGION_DAT}}` a stránka sama varuje, že jde o návrh.
5. **Moderace**: nahlášení zprávy a nápadu, blokace uživatele, smazání zprávy, přehled nahlášených v Nastavení (`tym.odebrat`).
6. **Hosté**: zapomenuté heslo (token 256 bitů, v databázi jen otisk, platí hodinu, jednou; stejná odpověď pro existující i neexistující e-mail),
   souhlas s novinkami podniků (výchozí NE, opt-in při registraci a v profilu, odhlášení tamtéž), role po přihlášení,
   demo účty `scripts/seed-recenzent.mjs`.
7. **Hlavičky a okraje**: `Permissions-Policy: geolocation=(self)` (objednávání od stolu), `viewport-fit=cover` a horní okraj v obalu.
8. **`.well-known`**: `apple-app-site-association` (application/json, bez přesměrování, disjunktní cesty obou aplikací) a `assetlinks.json`.
9. **WebView**: `lib/stahni.ts` (soubory, tisk) a `lib/nativniMost.ts` (push, odkazy) s návratem na webové chování.

## Co musí udělat člověk

- **Apple Developer** (organizace, D-U-N-S), Team ID do `public/.well-known/apple-app-site-association` (`{{TEAM_ID}}`), klíč APNs `.p8`.
- **Google Play Console**, otisky podpisových certifikátů do `public/.well-known/assetlinks.json` (`{{SHA256}}`), servisní účet FCM.
- Před odesláním: `node scripts/check-well-known.mjs --release` (zástupná pole jsou pak chyba).
- **Právník**: zásady, podmínky, doba reakce na hlášení (podmínky slibují do 24 hodin v pracovní dny), role správce a zpracovatele.
- **Prostředí (Vercel)**: `FIRMA_NAZEV`, `FIRMA_ICO`, `FIRMA_ADRESA`, `FIRMA_EMAIL_PODPORY`, `FIRMA_REGION_DAT`;
  nativní push `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_P8`, volitelně `APNS_TOPIC_MANAGERO`, `APNS_TOPIC_CLIENT`; `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT`.
  `NEXTAUTH_URL` a `NEXT_PUBLIC_APP_URL` musí být `https://www.managero.app` (QR kódy a odkazy v e-mailech jinak míří na apex).
- **Migrace**: po nasazení spustit `/api/init` (přidá `users.deleted_at`, `users.terms_accepted_at`, `password_resets`,
  `account_delete_requests`, `device_tokens`, `content_reports`, `user_blocks`). Kód je před migrací fail-open.
- **Demo účty**: `DATABASE_URL=… node scripts/seed-recenzent.mjs --db=<hostitel> --generuj` jen proti zkušební databázi.
  Skript zapíše podnik „Café Demo“ s veřejným profilem pro hosty, proto ne naslepo proti produkci.
- Odpovědět v App Store Connect / Play Console na dotazníky (soukromí, věk, UGC) podle skutečných dat; podklady jsou v plánech.

## Známá omezení

- Registrace hosta dál při existujícím e-mailu odpoví 409 (ověření e-mailem chybí); omezeno limitem podle IP.
- Blokace skryje zprávy i vedení podniku (vedení lze nahlásit správci platformy).
- Odkazy „otevřít jako host“ ve správě klienta (`window.open('/client/…')`) vedou v provozní aplikaci na zavřenou část webu
  (brána je přesměruje na úvod). Obal je má otevírat v systémovém prohlížeči (`allowNavigation` jen pro stránky aplikace,
  `lib/stahni.ts otevriVeSystemu`); veřejné stránky podniků jsou přístupné i bez přihlášení.
- Účet vlastníka podniku se z webu (`/smazat-ucet`) nesmaže; to jde jen v aplikaci, kde se potvrzuje i smazání podniku.
- `@capacitor/*` se do webu neimportuje; existenci pluginů (`window.Capacitor.Plugins`) při `server.url` je třeba ověřit na zařízení.
