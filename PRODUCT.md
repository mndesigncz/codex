# Managero — PRODUCT.md

Zachyceno z kódu a historie vývoje, bez rozhovoru s vedením podniku; položky
označené (předpoklad) jsou odvozené, ne potvrzené.

## Co to je

Managero je správa malého pohostinského podniku (čajovna, kavárna, bistro)
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

## Platby a peněženky

Mimo rozsah (předpoklad: zatím záměrně): platby v aplikaci vyžadují smlouvu
s platební bránou, karta v Apple/Google peněžence vývojářské účty a
certifikáty. Host platí u obsluhy jako obvykle.

## Jak se měří kvalita

Každé kolo: tsc, čtyři guardy (čas, desetinná pole, šířky, kontrast),
produkční build, rig orientace (~90 obrazovek) a rig rozložení (~665 stavů,
10 šířek), snímky mobil+desktop, živé ověření na produkci s testovacím
týmem (claude-test@pangea.test, profil casa-test) a úklid testovacích dat.
