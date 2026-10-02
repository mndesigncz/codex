# Věrnost, okruh B: body, úrovně, cashback

Stav po sloučení okruhu B (kolo 80) s pravidly bodů z kola 77 (W2). Zdroj pravdy je kontrolní seznam mezer. Každý řádek má stav HOTOVO (kde je to v kódu a v jakém testu) nebo NELZE (konkrétní důvod).

Základ zůstal z kola 77: `lib/bodyPravidla.ts` (čistá logika, `spoctiOdmenu`), `lib/bodyPravidlaDb.ts` (databáze, `odmenaZUctu`), obrazovky `components/client/loyalty/Body*.tsx`, `app/api/client/admin/loyalty/{prehled,export}/route.ts`. Z okruhu B se přidalo to, co v základu chybělo (strop za den, násobič podle úrovně, přenos zbytku, zaokrouhlení nahoru, vyloučené kategorie, uvítací body, propadání kreditu, storno z pokladny, oznámení o poklesu úrovně, výnosnost a poukazy v přehledu). Výpočet odměny je jediný: `spoctiOdmenu` (kasa, částka u kasy i objednávka od stolu volají `odmenaZUctu`). Testy: `scripts/testy/w2-body.ts` (základ) a `scripts/testy/k80-body-pravidla.ts` (rozšíření). Sonda (ruční): `scripts/sondy/vernost-pravidla.mjs`.

## Stav řádků

| Řádek | Stav | Kde a čím hlídáno |
|---|---|---|
| B1 strop bodů na účtenku, minimální útrata, strop na den | HOTOVO | `spoctiOdmenu`, sloupce `points_cap_per_bill`, `points_min_spend`, `points_cap_per_day`; `bodyDnes` v `bodyPravidlaDb.ts` (součet z útrat za pražský den, storno se odečte); test k80 „strop za den" |
| B2a nezapočítat část placenou kreditem nebo poukazem, vyloučené položky a celé kategorie (účtenky z pokladny) | HOTOVO | `castKreditem` (rozpad plateb Storyous: loyalty, voucher, gift, prepaidcredit), `vylouceneProdukty` (položky i kategorie nabídky); sloupce `points_exclude_items`, `points_exclude_sections`; test k80 „vyloučené kategorie", „platba kreditem" |
| B2b vyloučené položky u částky zadané ručně u kasy | NELZE | U ručně zadané částky nejsou žádné položky, ze kterých by šlo odečíst. Platí minimum, zaokrouhlení, násobič a stropy |
| B3 propadnutí kreditu a připomínka | HOTOVO | `propadniKredit()` denně z `app/api/init/route.ts`, upozornění týden předem (push + deník `cwarn:`), zbytek stránky hosta (`creditExpiring`, přeloženo en/de/sk/pl); sloupce `credit_expire_days`, `credit_expire_since`; test k80 „propadání kreditu" |
| B4 platnost úrovně, snížení po neaktivitě, oznámení | HOTOVO | snížení po neaktivitě v měsících (`tier_inactive_months`, `tierForMember`) z kola 77; oznámení o poklesu denně `oznamPoklesyUrovni` (jen jednou, `tier_seen`), postup nahoru oznamuje `lib/urovnePostup.ts`; test k80 „pokles úrovně" |
| B5 násobič podle úrovně | HOTOVO | `mult_silver/gold/platinum`; platí vyšší z násobiče úrovně a bonusové akce, nikdy součin; násobič se uplatní před stropy; vyšší úroveň má vždy aspoň násobič nižší; test k80 „násobič" |
| B6a storno bodů, cashbacku a útraty při zrušené nebo vrácené účtence z pokladny | HOTOVO | `stornujUctenky()` volaná na konci `syncBills` (`lib/posMirror.ts`); obě podoby Storyous: příznak `refunded`/`deleted` na původní účtence i opravná účtenka se záporem (částečná = poměrná část); idempotentní (`reversed_at`, ref `storno:<účtenka>`); co se za účtenku připsalo, ukládá `zapisPripsaneZaUctenku`, starší připsání se dopočtou z deníku; test k80 „storno" |
| B6b storno u částky zadané ručně a u objednávky od stolu | NELZE | Nemají vazbu na účtenku v pokladně, takže není co ověřit. Vedení vrací body ručně (Zákazníci → Body ±). Storno razítek je v okruhu R |
| B7 verze pravidel, koncept, audit před/po | HOTOVO | Každá změna pravidel (přímé „Uložit“ i „Použít pravidla…“ z konceptu) jde do historie změn jako věta „před → po“ (`client.pravidla`, `popisZmenyPravidel`) a zapíše verzi do `client_pravidla_verze` (kdo, kdy, poznámka, změny; `lib/pravidlaVerze.ts`, `zapisVerzi`). Koncept (`loyalty_draft`) se uloží, aniž by se hostům cokoli změnilo; „Použít pravidla…“ ukáže rozdíl před → po s poznámkou a pošle koncept stejnou cestou jako přímé uložení (`loyalty/pravidla` PUT publish → PUT profilu, jedna kontrola a jeden zápis). Rozhraní `BodyKoncept.tsx` (koncept, zahození, seznam verzí) v Body a úrovně; test `k81-pravidla-verze`, sonda `vernost-pravidla` |
| B8 top hosté, výnosnost, závazek v měně, zdroje bodů, export CSV | HOTOVO | `prehledBodu` (`lib/bodyPrehledy.ts`: závazek včetně nevyčerpaných poukazů, výnosnost za období, zdroje, top hosté), `BodyPrehledy.tsx`, export `/loyalty/export` (středník, BOM, ochrana proti vzorcům, audit `client.export`); test k80 „přehledy", `w2-body` |
| B9 náhled „kolik by host dostal z účtu X" | HOTOVO | `BodyNahled.tsx`, počítá stejná funkce jako server |
| B10 chyby | HOTOVO | deník píše skutečnou změnu místo požadované (`awardDetail`, `awardCreditDetail` s uzamčeným řádkem); prahy UI = server (`validujPravidla`, `MAX_PRAH_NAVSTEV`); zbytky po zaokrouhlení (režim „zbytek se přenáší", `spend_rest`); graf v pražských dnech; „Členové u kasy" jen skutečná připsání; ruční úprava bodů a kreditu do historie změn (`client.points`, `client.credit`); úprava kreditu v UI (oprávnění `vernost.kredit_upravit`); plán Max vysvětlen předem; testy `w2-body`, k80 „napojení" |
| B11 zaokrouhlení bodů nastavitelné | HOTOVO | pět režimů: celé stovky, celé stovky se zbytkem, přesně dolů, na nejbližší, nahoru; test k80 „zaokrouhlení" |
| E1 uvítací body nastavitelné (dřív pevných 10) | HOTOVO | `welcome_points`, `uvitaciBody` (bez nastavení dřívější chování), `join/route.ts`; test k80 „uvítací body" |
| E2 zrušená účtenka se u kasy nenabízí a nepřipíše | HOTOVO | `staff/scan/route.ts`; test k80 „kasa" |

## Jak to provozovatel používá

Věrnost, záložka **Body a úrovně**.

1. Základní hodnoty (body za 100, cashback, propadání bodů, úrovně a slevy) a pravidla připisování (zaokrouhlení, minimum, stropy na účtenku a za den, kredit a poukaz, vyloučené položky a kategorie) se ukládají jedním tlačítkem Uložit v hlavičce. Každá změna se zapíše do historie změn.
2. **Náhled** ukáže, kolik by host dostal z účtu. Zkus 450 Kč, účet s poukazem a Happy hour.
3. **Úrovně, uvítání a kredit**: násobič bodů pro stříbrné, zlaté a platinové hosty, uvítací body nového člena a po kolika dnech propadne nevyužitý kredit.
4. Bez plánu Max jde vše jen prohlížet; nahoře je to řečeno předem.

Věrnost, záložka **Přehled**: závazek vůči hostům (kredit, nevyčerpané poukazy, body v oběhu), výnosnost za 7, 30, 90 dní nebo rok, top hosté, odkud se berou body a **export deníku do CSV** pro zvolené období (50 000 řádků nejvýš).

Storno účtenky běží samo po synchronizaci s pokladnou: host o body a kredit z té účtenky přijde, dostane oznámení a v historii změn je řádek „Storno bodů a kreditu". Co už host utratil, se nevrací do mínusu (kredit ani body nejdou pod nulu, deník to řekne).

## Poznámky k chování

- Objednávka od stolu dává body, ale ne cashback: stejná útrata se u kasy načte z účtenky a vrátila by se podruhé.
- Strop za den počítá pražský den a jen body z útrat (ne narozeniny ani ruční úpravy).
- Snížená úroveň se vrací sama návštěvou. Nasbíraná útrata ani návštěvy se nemažou.
- Propadání kreditu se zapíná od dne zapnutí, nic se nemaže zpětně.
- Storyous: tvar refundu je odvozený z kódu synchronizace (příznaky `refunded`, `deleted`, `refundedBillIdentifier`), ne z živého účtu. Obě podoby jsou ošetřené a idempotentní.
