# Kupony a promo kódy (sekce K)

Kde to je: Správa Clientu → Věrnost → Kupony a kódy. Poslat kupon členům: Zákazníci → Členové.
Oprávnění: `kupony.spravovat` (katalog, editor, promo kódy, rozeslání, přehledy), `kupony.uplatnit` (uplatnění u kasy).

Sloučení: kupony a promo kódy vznikly paralelně ve dvou větvích (kolo 77 W3 a sekce K). Základ zůstal z kola 77 (`lib/kuponyPravidla.ts`, `kuponyPole.ts`, `kuponyKusy.ts`, `promoKody.ts`, `components/client/loyalty/Kupony*.tsx`); ze sekce K se přenesly funkce, které v něm chyběly: kupon vázaný na položku nabídky, vyloučené položky a kategorie, historie změn před → po, export katalogu a vydaných kódů do CSV a hromadné akce. Testy: `scripts/testy/w3-kupony.ts` (základ) a `scripts/testy/k81-kupony.ts` (doplňky), ruční sonda `scripts/sondy/kupony.mjs`.

## Stav řádků kontrolního seznamu

| Řádek | Stav | Kde / test | Jak se používá |
|---|---|---|---|
| K1 celkový limit kusů | HOTOVO | `lib/kuponyKusy.ts` (`rezervujKus`, atomický UPDATE), `w3-kupony.ts` | V editoru „Kusů celkem". V katalogu „zbývá N kusů z M"; vyčerpaný kupon host nevezme. |
| K1 denní limit uplatnění | HOTOVO | `rezervujDenniUplatneni`, `redeem/route.ts` | „Uplatnění za den". Limit se hlídá i při dvou tabletech naráz. |
| K1 limit uplatnění na promo kód | HOTOVO | `promo/route.ts` (podmíněný přírůstek `uses < max_uses`) | „Nejvýš použití" u promo kódu; každý host kód použije jednou. |
| K2 vyloučené položky a kategorie | HOTOVO (jako připomínka) | `excluded_items`, `excluded_sections`, `KuponyEditor.tsx`, štítek „mimo …"; `k81-kupony.ts` | V editoru „Vyloučené položky a kategorie". Vidí je host na kartě kuponu i obsluha při uplatnění. Slevu z účtenky kasa automaticky nepočítá (viz NELZE). |
| K2 kupon vázaný na položku nabídky | HOTOVO | `menu_item_id`, `benefitLabel` („Zdarma: …", „Sleva 20 % na …"); `k81-kupony.ts` | Select „Platí jen na položku"; položka se ověřuje na tým. |
| K2 X+Y strukturovaně | HOTOVO | `xy_buy`, `xy_free` | Typ „X+Y", dvě čísla, volitelně vázané na položku. |
| K3 poslat kupon hostovi / skupině / segmentu | HOTOVO | `coupons/send/route.ts`, `KuponyOdeslat.tsx`, `lib/kuponyRozeslani.ts` | „Poslat hostům…" v nabídce kuponu a „Poslat kupon…" u členů. Respektuje cílení, 18+ a limity; kdo kupon drží, se přeskočí. |
| K3 výběr více členů zaškrtnutím | HOTOVO | akce „Kupon vybraným" v seznamu členů předává `hostIds` | Zaškrtni členy → Další akce → Kupon vybraným. |
| K4 koncept / naplánováno / archiv | HOTOVO | `draft`, `archived_at`, `stavKuponu` | „Uložit jako koncept" (host nevidí), „Platí od" v budoucnu = naplánováno, Archivovat / Vrátit z archivu. Vydané kódy z archivu dál platí. |
| K4 duplikovat | HOTOVO | `duplikujKupon` | Nabídka → Duplikovat; kopie je koncept a není uvítací. |
| K4 historie změn | HOTOVO | `coupons/historie/route.ts`, `KuponyHistorie.tsx`, `popisZmen` (před → po); `k81-kupony.ts` | Nabídka → Historie změn: kdo, kdy a co přepsal („cena: 100 b. → 150 b."). |
| K5 přehled uplatnění a ROI | HOTOVO | `coupons/prehled/route.ts`, `KuponyPrehled.tsx` | Vydáno, uplatněno, propadlé, útrata s kuponem, odhad slevy, návratnost. |
| K5 rozpad použití promo kódu | HOTOVO | `promoKody.ts` (`rozpadPouziti`), `promos/export` | V přehledu promo kódů a v exportu. |
| K6 hromadné akce nad kupony | HOTOVO | `PATCH { ids, action }`, `hromadne()` v `coupons/route.ts`; `k81-kupony.ts` | Katalog → Vybrat → zaškrtni kupony → Zapnout, Pozastavit, Archivovat, Vrátit z archivu, Smazat nepoužité (kupony s kódy přeskočí). |
| K6 export CSV kuponů a vydaných kódů | HOTOVO | `kuponyCsv`, `claimyCsv`, `GET ?export=kupony|claimy`; `k81-kupony.ts` | Katalog → export (středník, BOM pro Excel, ochrana proti vzorcům, částky v měně podniku). Promo kódy mají vlastní export. |
| K6 dávková generace a úprava promo kódů | HOTOVO | `promoKody.ts`, `promos/route.ts`, `promos/[id]` | „Dávka kódů": předpona + počet (až 200); úprava a smazání nepoužitých kódů. |
| K7 náhled pohledem hosta | HOTOVO | `KuponyNahled.tsx` | V editoru vpravo a v nabídce kuponu. |
| K8 redeem kontroluje min. útratu a 18+ | HOTOVO | `varovaniUplatneni`, `KuponyUplatnit.tsx` | Okno při uplatnění: kupon, držitel, podmínky, útrata a varování; u 18+ obsluha potvrdí doklad. |
| K9 noční okno hodin (22–02) | HOTOVO | `windowOk`, `hodinyOk` | Hodiny „od" větší než „do" platí přes půlnoc. |
| K9 uvítací kupon | HOTOVO | `grantWelcomeCoupons`, `coupons/send` | Nový člen dostane uvítací kupony, na které má nárok; stávajícím členům ho pošleš ručně. |
| K10 promo kód prochází claimBlocker, atomické uses a kompenzace | HOTOVO | `promo/route.ts` (`ON CONFLICT DO NOTHING`, podmíněný UPDATE, `vratPouziti`) | Host bez nároku na kupon z kódu kód nespotřebuje; pád po cestě vrátí použití i vydaný kód. |
| K11 dialog smazání odpovídá API | HOTOVO | `Kupony.tsx`, `KuponyPromo.tsx` | Kupon, který hosté drží nebo uplatnili, se nemaže; dialog to řekne a nabídne archivaci. |

## NELZE

- Automatické odečtení slevy z účtenky (vyloučené položky, kupon na položku, X+Y): kasa nemá rozhraní pro vložení slevy. Pravidla vidí host i obsluha a obsluha je uplatní ručně.
