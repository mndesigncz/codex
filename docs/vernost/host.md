# Věrnost: Host (okruh H)

Co host vidí na stránce podniku a v Moje, a co k tomu nastavuje podnik. Hostovská část používá `t()` a překlady
do en, de, sk, pl (`locales/*/klient-host.json`, `api.json`).

| Řádek | Stav | Kde to je / čím se hlídá |
|---|---|---|
| H1 historie bodů, razítek a kuponů s platností | HOTOVO | `api/client/me/historie`, `HostHistorie.tsx`, test `w5-host` |
| H2 platnost kuponů v seznamech | HOTOVO | `HostPlatnost.tsx` („Vyprší za N dní“), test `w5-host` |
| H2 kdy propadnou body | HOTOVO | stránka podniku (W5) a nově i seznam podniků v Moje (`expiring` v `api/client/me`) |
| H2 doba na dokončení karty, zpráva o propadlé kartě | HOTOVO | `KartaRazitek.tsx` (jedna karta pro stránku podniku, sdílený popis z `kartaProHosta`); stejné věty („Dosbírej kartu do…“, „Rozdělaná karta vypršela, N razítek propadlo“) i v Moje (`MyPage.tsx`; `api/client/me` čte přes `kartaProHosta`, takže karta s prošlým časem se vynuluje a host se to dozví); sondy `w5-host-bannery`, `w6-poukazy-bannery` |
| H3 jak získat body (z pravidel) | HOTOVO | `HostPravidla.tsx` + `lib/hostPrehled.ts`; nově zná body za objednávky (vypnuté), za rezervaci a za nákup poukazu, test `w6-host-kasa` |
| H4 wallet pass, zvětšený QR | HOTOVO | vlna D (`KartaNastroje.tsx`, test `d2-wallet`) |
| H4 offline karta | HOTOVO | `lib/offlineKarta.ts`: kód a QR se při načtení Moje uloží do telefonu, `public/offline.html` je ukáže bez sítě; kontrola tvaru kódu i SVG na obou místech, smazání při odhlášení; test `w6-host-kasa` |
| H5 objednávky a rezervace připisují body (nastavení) | HOTOVO | Věrnost → Body a úrovně → „Body mimo kasu“ (`BodyZdroje.tsx`, `api/client/admin/body-zdroje`, `lib/bodyZdroje*.ts`), test `w6-host-kasa` |
| H6 u kasy: storno poslední akce | HOTOVO | `lib/kasaStorno*.ts`, akce `undo` v `api/client/staff/scan`, tlačítko v `CardScan.tsx`; vrací body z částky (včetně cashbacku a útraty) a platbu kreditem; razítka mají vlastní storno v detailu člena (`RazitkaClen.tsx`), účtenku z pokladny vrátit nejde; test `w6-host-kasa` |
| H6 výběr účtenky bez Storyous | HOTOVO | volitelné „Číslo účtenky“ u ručně zadané útraty: jedno číslo věrnost připíše jen jednou (strážce `client_bill_awards`, `manual:<číslo>`) |
| H6 záznam obsluhy | HOTOVO | `staff_id` v deníku věrnosti (vlna W1), u storna také |
| H6 idempotence akcí u kasy | HOTOVO | `client_scan_actions` (klíč + pětisekundový otisk, vlna W1); storno má vlastní atomický zábor |

## Jak to provozovatel používá

- **Body mimo kasu.** Ve Věrnosti → Body a úrovně je karta „Body mimo kasu“: přepínač „Body za objednávky od stolu“
  (vypnuto = objednávka body nedává, razítko za návštěvu zůstává) a „Bodů za rezervaci, která proběhla“ (0 = žádné).
  Body za rezervaci se připíšou po uzavření rezervace jako „Proběhlo“, nejvýš jednou. Ukládá se jen v plánu Max (jako ostatní pravidla).
- **Storno u kasy.** Po bodech z částky nebo platbě kreditem se u hosta objeví „Storno poslední akce“. Platí 15 minut a jen pro poslední
  nevrácenou akci hosta. Pokud host body mezitím utratil, vrátí se jen zbytek a věta to řekne.
- **Účtenka bez pokladny.** V rozbalení „K účtu“ jde zadat číslo účtenky a část zaplacenou kreditem nebo poukazem.
- **Host** vidí na své stránce „Jak získat body a odměny“ přesně to, co podnik zapnul, v jazyce, který má nastavený.
