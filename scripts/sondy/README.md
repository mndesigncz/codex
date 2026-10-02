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

V CI běží jako úloha „Sondy v prohlížeči" (.github/workflows/pages.yml):
build, `next start` bez databáze (API podvrhují fixtury) a `npm run sondy`.

Mimo seznam ZELENE jsou `escape` a `dvakrat` — procházejí všechny obrazovky
a trvají přes 4 minuty; pouštěj je ručně (`SONDY_LIMIT_MS=900000`).

Průzkumy mimo spouštěč (`pruchod.mjs`, `pruchod-hloubka.mjs`) hlásí seznam k posouzení, ne ano/ne.
`pruchod-hloubka.mjs` projde u každé obrazovky i vnitřní záložky, okna, listy a kebab menu na šířkách
320 / 360 / 390 / 768 v češtině, němčině a polštině, světle i tmavě (`PH_JAZYKY`, `PH_SIRKY`, `PH_MOTIVY`,
`PH_OBRAZOVKY` zužují; `PH_DATA=retezec|mezery` protáhne texty z API). Souběžné běhy se slučují:
`node scripts/sondy/pruchod-hloubka.mjs --spoj a.json b.json`. Jeho nálezy, které se vracely, hlídá rychlá
sonda `k73-sirky` a statická kontrola `scripts/check-pevne-sirky.mjs`.
