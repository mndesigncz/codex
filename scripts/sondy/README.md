# Sondy v prohlížeči

Každá sonda otevře aplikaci na `localhost:3000` v Chromiu, API podvrhne
fixturami z `fixtury/` a tvrdí, co má být na obrazovce vidět.

    npm run build && npx next start -p 3000 &
    npm run sondy              # sondy ze seznamu ZELENE ve spust.mjs
    npm run sondy -- k64 k60   # jen vybrané
    npm run sondy -- --vse     # všechny, i rozpracované

Server i sondy musí mít stejný `NEXTAUTH_SECRET`, protože sondy si podle
něj razí session cookie (`cookie-role.mjs`). Chromium se bere
ze `SONDY_CHROMIUM`, jinak z `/opt/pw-browsers`, jinak z instalace
`npx playwright-core install chromium`.

Zatím neprochází: `navody` a `k53` (fixtury návodů k výrobě a uzávěrce),
`hledani` a `search` (hledání ve skladu), `koncept2` a `prepnuti` (chat),
`slib`, `escape` a `dvakrat` (běží přes 4 minuty).
