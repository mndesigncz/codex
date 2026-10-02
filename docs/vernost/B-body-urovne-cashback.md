# Věrnost, okruh B: body, úrovně, cashback

Stav po kole 80. Zdroj pravdy je kontrolní seznam mezer. Každý řádek má stav HOTOVO (kde je to v kódu a v jakém testu) nebo NELZE (konkrétní důvod).

Hlavní nové soubory: `lib/bodyPravidla.ts` (čistá logika), `lib/bodyPravidlaDb.ts` (databáze), `components/client/loyalty/PokrocilaPravidla.tsx` a `BodyPrehledy.tsx` (obrazovky), `app/api/client/admin/loyalty/{pravidla,prehledy,export}/route.ts`. Testy: `scripts/testy/k80-body-pravidla.ts`. Sonda (ruční): `scripts/sondy/vernost-pravidla.mjs`.

## Stav řádků

| Řádek | Stav | Kde a čím hlídáno |
|---|---|---|
| B1 strop bodů na účtenku, minimální útrata, strop na den | HOTOVO | `vypocitejOdmenu` (`lib/bodyPravidla.ts`), sloupce `points_cap_bill`, `points_min_spend`, `points_cap_day`; test k80 „odměna", „strop", „minimální útrata"; sonda |
| B2a nezapočítat část placenou kreditem nebo poukazem, vyloučené položky a kategorie (účtenky z pokladny, objednávky od stolu) | HOTOVO | `castKreditem`, `vyloucenaCastka`, `vylouceno()` v `bodyPravidlaDb.ts`; platba kreditem se pozná z rozpadu plateb Storyous (loyalty, voucher, gift, prepaidcredit); test k80 „kredit", „vyloučení" |
| B2b vyloučené položky u částky zadané ručně u kasy | NELZE | U ručně zadané částky nejsou žádné položky, ze kterých by šlo odečíst. Platí minimum, zaokrouhlení, násobič a stropy |
| B3 propadnutí kreditu a připomínka (body už byly) | HOTOVO | `propadniKredit()` denně z `app/api/init/route.ts`, upozornění týden předem (push + deník `cwarn:`), zbytek stránky hosta (`creditExpiring`, přeloženo en/de/sk/pl); test k80 „kredit" |
| B4 platnost úrovně, snížení po neaktivitě, oznámení o postupu a snížení | HOTOVO | `tierForMember` s `inactiveDays` (`lib/clientSlots.ts`), `zkontrolujUroven` a `zkontrolujUrovneVsem` (oznámení jen jednou, první kontrola jen zapamatuje stav); test k80 „degradace", „oznámení úrovně" |
| B5 násobič podle úrovně | HOTOVO | `mult_silver/gold/platinum`; platí vyšší z násobiče úrovně a bonusové akce, nikdy součin; vyšší úroveň má vždy aspoň násobič nižší; test k80 „násobič" |
| B6a storno bodů, cashbacku a útraty při zrušené nebo vrácené účtence z pokladny | HOTOVO | `stornujUctenky()` volaná na konci `syncBills` (`lib/posMirror.ts`); obě podoby Storyous: příznak `refunded`/`deleted` na původní účtence i opravná účtenka se záporem a `refundedBillIdentifier` (částečná = poměrná část); idempotentní (`reversed_at`, ref `storno:<účtenka>`); starší připsání se dopočtou z deníku; test k80 „storno" |
| B6b storno u částky zadané ručně a u objednávky od stolu | NELZE | Nemají vazbu na účtenku v pokladně, takže není co ověřit. Vedení vrací body ručně (Zákazníci → Body ±). Razítka při stornu patří do okruhu R |
| B7 verze a koncept pravidel, audit před/po | HOTOVO | koncept (`loyalty_draft`), „Použít" s rozdílem před → po, tabulka `client_rule_versions`, každá změna i z formuláře Body a úrovně (`zaznamenejZmenuProfilu`); věta „Verze N: …" v historii změn (`client.pravidla`); test k80 „verze" |
| B8 top hosté, výnosnost, závazek v měně, zdroje bodů, export CSV | HOTOVO | `prehledVernosti`, `BodyPrehledy.tsx` (záložka Přehled), export `/loyalty/export` (středník, desetinná čárka, BOM, ochrana proti vzorcům, audit `client.export`); test k80 „csv", „zdroje" |
| B9 náhled „kolik by host dostal z účtu X" | HOTOVO | karta Náhled v `PokrocilaPravidla.tsx`, platná pravidla vedle konceptu, počítá stejná funkce jako server |
| B10 chyby | HOTOVO | deník píše skutečnou změnu místo požadované (`award`, `awardCredit` s uzamčeným řádkem); prahy UI = server (`zkontrolujPrahy`, `MAX_PRAH_NAVSTEV`, chyba 400); zbytky po zaokrouhlení (režim „zbytek se přenáší", `spend_rest`); graf v pražských dnech; „Členové u kasy" jen skutečná připsání; ruční úprava bodů a kreditu do historie změn (`client.body`, `client.kredit`); úprava kreditu v UI (Zákazníci → Body ± → Kredit, oprávnění `vernost.kredit_upravit`); plán Max vysvětlen předem (`MaxPoznamka`); testy k80 „deník", „prahy", „napojení" |
| B11 zaokrouhlení bodů nastavitelné | HOTOVO | pět režimů: celé stovky, celé stovky se zbytkem, přesně dolů, na nejbližší, nahoru; test k80 „zaokrouhlení" |
| E1 uvítací body nastavitelné (dřív pevných 10) | HOTOVO | `welcome_points`, `uvitaciBody` (bez nastavení dřívější chování), `join/route.ts`; test k80 „uvítací body" |
| E2 zrušená účtenka se u kasy nenabízí a nepřipíše | HOTOVO | `staff/scan/route.ts`; test k80 „kasa" |

Celkem: 13 řádků HOTOVO, 2 NELZE.

## Jak to provozovatel používá

Věrnost, záložka **Body a úrovně**.

1. Základní hodnoty (body za 100, cashback, propadání bodů, úrovně a slevy) se ukládají tlačítkem Uložit v hlavičce jako dřív. Každá změna dostane verzi.
2. Pod nimi je karta **pravidla připisování**. Změny se nejdřív uloží jako koncept, který hosty neovlivní. Tlačítko **Použít pravidla…** ukáže rozdíl před → po, volitelnou poznámku, a teprve potom pravidla platí. Už připsané body se nepřepočítávají.
3. **Náhled** hned při psaní ukáže, kolik by host dostal z účtu (platná pravidla vedle konceptu). Zkus 450 Kč, účet s poukazem, zlatého hosta a Happy hour.
4. **Verze pravidel** dole ukazují kdo, kdy a co změnil. U verzí s rozšířenými pravidly jde „Načíst do konceptu" a použít znovu.
5. Bez plánu Max jde vše jen prohlížet; nahoře je to řečeno předem.

Věrnost, záložka **Přehled**: závazek vůči hostům (kredit, nevyčerpané poukazy, body v oběhu), výnosnost za 7, 30, 90 dní nebo rok, top hosté (podle útraty, bodů v období, návštěv), odkud se berou body a **export deníku do CSV** pro zvolené období (50 000 řádků nejvýš).

Výnosnost počítá útratu od prvního připsání po tomto nasazení (u řádku deníku je nově základ útraty), starší připsání do ní nevstupují. To stojí pod číslem.

Storno účtenky běží samo po synchronizaci s pokladnou: host o body a kredit z té účtenky přijde, dostane oznámení a v historii změn je řádek „Storno bodů a kreditu". Co už host utratil, se nevrací do mínusu (kredit ani body nejdou pod nulu, deník to řekne).

## Poznámky k chování

- Objednávka od stolu dává body, ale ne cashback: stejná útrata se u kasy načte z účtenky a vrátila by se podruhé.
- Strop za den počítá pražský den a jen body z útrat (ne narozeniny ani ruční úpravy).
- Snížená úroveň se vrací sama návštěvou. Nasbíraná útrata ani návštěvy se nemažou.
- Propadání kreditu se zapíná od dne zapnutí, nic se nemaže zpětně.
- Storyous: tvar refundu je odvozený z kódu synchronizace (příznaky `refunded`, `deleted`, `refundedBillIdentifier`), ne z živého účtu. Obě podoby jsou ošetřené a idempotentní.
