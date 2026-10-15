# Managero

Provozní aplikace pro kavárny, bary a restaurace: rozvrh a docházka, úkoly a uzávěrky, sklad a receptury,
mzdy, odměny a tresty, chat týmu, tablet za barem — a věrnostní program pro hosty (Managero client)
s kartou, QR kódem, Wallet, objednávkami a rezervacemi. Napojení na pokladnu Storyous.

Produkce: https://www.managero.app

## Stack

- Next.js 15.5 (App Router), React 19, TypeScript, Tailwind
- Neon Postgres přes `@neondatabase/serverless` (schéma vzniká v `app/api/init/route.ts`, idempotentní DDL)
- NextAuth (přihlášení e-mailem a heslem, PIN na tabletu)
- Vercel (hosting, crony ve `vercel.json`, Blob na soubory), Stripe (předplatné), Resend (e-maily)
- Nativní obaly Capacitor 8 v `apps/` — dvě aplikace z jedné webové: **Managero** (`app.managero.app`)
  a **Managero client** (`app.managero.client`); zdroj pravdy `apps/apps.json`

## Místní vývoj

```bash
npm ci
cp .env.example .env.local   # vyplň aspoň DATABASE_URL a NEXTAUTH_SECRET
npm run dev                  # http://localhost:3000
```

Schéma databáze se vytvoří při prvním otevření aplikace vedením (nebo `GET /api/init` s `Authorization: Bearer $CRON_SECRET`).
Bez databáze jde vyzkoušet ukázka: `/demo?role=vedeni`, `/demo?role=zamestnanec`.

## Kontroly před pushem

```bash
npx tsc --noEmit
npm test                                   # scripts/test-units.ts + scripts/testy/*.ts
for f in scripts/check-*.mjs; do node $f >/dev/null 2>&1 || echo FAIL $f; done
```

Sondy (Playwright proti běžící aplikaci, seznam v `scripts/sondy/spust.mjs`):

```bash
DATABASE_URL=postgres://u:p@127.0.0.1:1/db npx next build && npx next start -p 3435
SONDY_ZAKLAD=http://localhost:3435 npm run sondy
```

## Kde co je

| Co | Kde |
|---|---|
| Vizuální systém | `DESIGN.md` |
| Proměnné prostředí | `.env.example`, stav bez hodnot na `GET /api/health` |
| Spuštění na ostro (účty, nastavení, pořadí) | `docs/SPUSTENI.md` |
| App Store a Google Play | `docs/OBCHODY.md`, `docs/obchody/`, `apps/README.md` |
| Správa platformy (superadmin, MCP) | `docs/ADMIN.md` |
| Věrnostní program | `docs/vernost/` |
| Právní texty (návrh ke schválení advokátem) | `lib/pravni/texty.ts`, údaje provozovatele `lib/firma.ts` |
| Překlady (cs, en, de, sk, pl) | `locales/` |
