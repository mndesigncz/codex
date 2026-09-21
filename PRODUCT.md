# Managero — PRODUCT.md

Zachyceno z kódu a historie vývoje, bez rozhovoru s vedením podniku; položky
označené (předpoklad) jsou odvozené, ne potvrzené.

## Co to je

Managero je správa malého pohostinského podniku (kavárna, restaurace, bistro, čajovna)
v jedné webové aplikaci: směny a docházka, uzávěrky a finance, sklad a
receptury, menu, úkoly a postupy, tým a odměny. **Managero client** je druhé
prostředí téže aplikace pro hosty: členství, kartička s QR, rezervace,
objednávka od stolu, věrnost (body, razítka, kupony, promo kódy), hodnocení
a novinky.

První a referenční zákazník: Čajovna Pangea (Brno), pokladna Storyous.

## Pro koho

- **Vedení (employer):** majitel/manažer. Plná administrace + režimy TO GO
  (zjednodušená správa na mobilu) a Client (správa hostovské části).
- **Zaměstnanec (employee):** směny, docházka, postupy, sklad, chat, odměny.
- **Kiosk:** sdílený iPad na baru — odpíchnutí, úkoly, objednávky, uzávěrka.
- **Host (customer):** vlastní účet na /client; členství ve víc podnicích.

## Neporušitelné

- Celé UI česky, věty, ne Title Case; pražský čas přes lib/pragueTime.
- Vercel Hobby + Neon Postgres: žádné dlouhé joby (rozpočet ~35 s), cron
  nejvýš denní, migrace idempotentně přes /api/init.
- Tajemství jen v env (Storyous, Blob, NEXTAUTH_SECRET) — nikdy v kódu.
- Pokladna Storyous je zdroj pravdy pro tržby a stoly; zápis do ní jen přes
  Delivery API (objednávka od stolu) a Reservations API (usazení).
- Objednávka od stolu: ceny vždy z databáze, ochrana QR kódem stolu a
  polohou; ověřená smí rovnou do pokladny.
- Hostovská část je vždy světlá; tmavý motiv patří administraci.

## Předplatné a platby (Stripe)

Tarify Zdarma (napořád, do 3 lidí), Pro 499 Kč/měs nebo 3 990 Kč/rok a Max
999 Kč/měs nebo 7 990 Kč/rok (Pro + Managero client, pokladna Storyous,
výroba). Nový podnik zkouší Pro nebo Max 30 dní zdarma s kartou (trial ve
Stripe, po měsíci se karta strhne sama). Platba běží ve Stripe Checkout,
správa karty, faktur, změny tarifu a zrušení ve Stripe Customer Portal;
stav do aplikace zrcadlí webhook (`/api/billing/webhook`) a denní cron
(`/api/billing/cron`). Po koupi Pro 7 dní platí nabídka Max −30 % (kupon
MAX30). Affiliate: odkaz `/register?ref=KÓD`; když doporučený podnik poprvé
zaplatí, doporučitel dostane měsíc zdarma jako kredit na další fakturu,
nejvýš tři za měsíc. Ceny hledáme podle `lookup_key` (pro_monthly…), env:
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Týmy z doby před platbami jsou
na Max napořád. Platby hostů v Managero client zůstávají mimo rozsah — host
platí u obsluhy.

## Jak se měří kvalita

Každé kolo: tsc, čtyři guardy (čas, desetinná pole, šířky, kontrast),
produkční build, rig orientace (~90 obrazovek) a rig rozložení (~665 stavů,
10 šířek), snímky mobil+desktop, živé ověření na produkci s testovacím
týmem (claude-test@pangea.test, profil casa-test) a úklid testovacích dat.

## Výroba vlastních produktů

Položka skladu označená „vyrábíme sami" (limonáda, ice tea, extrakt, sirup,
pečivo) nechodí do nákupního seznamu. Když jí dochází, vznikne směně úkol
„Vyrobit X" (název jde přejmenovat, třeba „Uvař limonádu") s výrobní
recepturou: suroviny × množství na dávku, kolik dávek je potřeba do plného
stavu a jestli je na to ve skladu dost. Co chybí, dostane vlajku do nákupního
seznamu — nakupují se jen suroviny. Odškrtnutí úkolu (nebo „Vyrobeno" na
dashboardu, v TO GO či ve Skladu) dávku naskladní a suroviny odepíše.
Spouští se po každém pohybu skladu včetně odpisů z prodejů v pokladně
(prodej limonády → dochází → úkol), takže úkol nikdy nechybí a nikdy není
dvakrát; když se zásoba doplní jinak, zavře se sám. Kód: lib/production.ts
(data), lib/productionPlan.ts (čistá logika, testy v `npm test`).

## Správa platformy (superadmin)

Provozovatel Managera vidí všechny podniky a umí jim zasáhnout do provozu:
pozastavit (lidé podniku dostanou vysvětlení, ne chybu), přepnout tarif
ručně (podpora, partner, náhrada za výpadek), prodloužit zkušební dobu,
připsat interní poznámku. Každý zásah má v historii aktéra — člověka
z obrazovky, nebo „api-token", když to udělal Claude přes MCP.

Kdo je správce, říká prostředí (`SUPERADMIN_USER_IDS`), ne databáze. Blokace
se vynucuje v middleware před každou routou, ne v každé routě zvlášť.

Schválně chybí: přihlášení za někoho jiného, čtení uzávěrek a mezd podniku,
mazání podniků. Podrobně v `docs/ADMIN.md`.
