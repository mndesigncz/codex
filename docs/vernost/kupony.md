# Kupony a promo kódy (sekce K)

Kde to je: Správa Clientu → Věrnost → Kupony a kódy. Poslat kupon členům: Zákazníci → Členové.
Oprávnění: `kupony.spravovat` (katalog, editor, promo kódy, rozeslání, přehledy), `kupony.uplatnit` (uplatnění u kasy).

## Stav řádků kontrolního seznamu

| Řádek | Stav | Kde / test | Jak se používá |
|---|---|---|---|
| K1 celkový limit kusů | HOTOVO | `lib/kuponyDb.ts` (`rezervujKus`, atomický UPDATE), `k81-kupony.ts` | V editoru pole „Celkem kusů". V katalogu vidíš „zbývá N kusů z M"; vyčerpaný kupon host nevezme. |
| K1 denní limit uplatnění | HOTOVO | `rezervujUplatneni`, `redeem/route.ts` | Pole „Uplatnění za den". Obsluha po dosažení limitu dostane hlášku, limit se hlídá i při dvou tabletech naráz. |
| K1 limit uplatnění na promo kód | HOTOVO | `promo/route.ts` (podmíněný přírůstek `uses < max_uses`) | „Nejvýš použití" u promo kódu; každý host kód použije jednou. |
| K2 vyloučené položky a kategorie | HOTOVO (jako pravidlo k připomenutí) | `KuponEditor.tsx`, štítek „mimo …" | Vybereš kategorie a položky z nabídky. Vidí je host na kartě kuponu i obsluha při uplatnění. Automatický výpočet slevy z účtenky se nedělá (viz NELZE). |
| K2 kupon vázaný na položku nabídky | HOTOVO | `menu_item_id`, `benefitLabel` („Zdarma: Matcha", „Sleva 20 % na Matcha") | Select „Platí jen na položku"; položka se ověřuje na tým. |
| K2 X+Y strukturovaně | HOTOVO | `xy_buy`, `xy_free` (sloupce, editor s větou „Host koupí 2, dostane 1 zdarma") | Typ „X+Y", dvě čísla, volitelně vázané na položku. |
| K3 poslat kupon hostovi / skupině / segmentu | HOTOVO | `coupons/send/route.ts`, `KuponyOdeslat.tsx`, `lib/coupons.ts` (`rozesliKupon`) | Tlačítko dárku u člena, „Poslat kupon…" nad členy (celý klub, skupina, segment) a „Poslat členům…" v menu kuponu. Respektuje cílení, 18+ a limity; kdo kupon drží, dostane se přeskočí. Hostovi přijde oznámení. |
| K3 výběr více členů zaškrtnutím | NELZE v této větvi | `ClenoveSprava` / `dalsiAkce` v této větvi nejsou | `KuponyOdeslat` má prop `customerIds`; po sloučení větve členů se na akci „Kupon vybraným" jen předá `customerIds={vybraniIds}`. Jeden člen a segment už fungují. |
| K4 koncept / naplánováno / archiv | HOTOVO | `status`, `stavKuponu`, filtry v `KuponyStranka.tsx` | „Uložit jako koncept" (host nevidí), datum „Platí od" v budoucnu = naplánováno, Archivovat/Obnovit v menu. Vydané kódy z archivu dál platí. |
| K4 duplikovat | HOTOVO | `POST { duplicateOf }` | Menu → Duplikovat; kopie je koncept a není uvítací. |
| K4 historie změn | HOTOVO | `coupons/historie/route.ts` (audit s popisem „cena: 100 b. → 150 b.") | Menu → Historie změn. |
| K5 přehled uplatnění | HOTOVO | `coupons/prehled/route.ts`, `KuponDetail.tsx`, `souhrnUplatneni` | Kdo, kdy, kolik utratil, obsluha, odkud se kupon vzal, doba do uplatnění, propadlé, odhad slevy a ROI (jen % a pevná částka). Filtr „vydáno od–do". |
| K5 rozpad použití promo kódu | HOTOVO | `promos?uses=ID`, `PromoKody.tsx` | Menu kódu → „Kdo a kdy ho použil". |
| K6 hromadné akce | HOTOVO | `PATCH { ids, action }` u kuponů i promo kódů | Zaškrtneš řádky, dole lišta: zapnout, pozastavit, archivovat, smazat. Mazání přeskočí kupony, které hosté drží. |
| K6 export CSV kuponů, claimů, promo kódů | HOTOVO | `kuponyCsv`, `claimyCsv`, `promoCsv`, `promoPouzitiCsv` | Tlačítka CSV (středník, BOM pro Excel, ochrana proti vzorcům, částky v měně podniku). |
| K6 dávková generace promo kódů | HOTOVO | `davkaKodu`, `POST { batch }` | „Dávka kódů": předpona + počet (až 200), stejné nastavení pro všechny. |
| K6 editace a mazání promo kódů | HOTOVO | `promos/route.ts` PATCH/DELETE | Úprava názvu, bodů, kuponu, limitu, platnosti; kód jde přejmenovat jen dokud ho nikdo nepoužil. Použitý kód se nemaže, jen vypíná. |
| K7 náhled pohledem hosta | HOTOVO | `KuponNahled.tsx`, `nahledKuponuHosta` | V editoru vpravo (živě), v menu „Náhled pohledem hosta"; přepíná úroveň hosta a čas. U promo kódu ukáže, co host dostane. |
| K8 redeem kontroluje min. útratu a 18+ | HOTOVO | `kontrolaUplatneni`, `KuponUplatnit.tsx` | Okno při uplatnění: kupon, držitel, podmínky, pole útrata (povinné u min. útraty), u 18+ bez data narození potvrzení občanky; nezletilému se neuplatní. |
| K8 záznam částky a obsluhy, náhled před uplatněním | HOTOVO | `redeemed_amount`, `redeemed_by`, `preview` | Zapisuje se do kódu a do přehledu; zapojeno v Kartičce hosta, v čtečce u kasy i ve formuláři kódu. |
| K9 noční okno hodin (22–02) | HOTOVO | `windowOk` | Hodiny „od" větší než „do" platí přes půlnoc; den v týdnu se po půlnoci počítá k večeru, kdy okno začalo. |
| K9 uvítací kupon pro stávající členy | HOTOVO | `send` se `zdroj: welcome`, menu „Uvítací pro stávající členy…" | Jednorázově; kdo už uvítací kupon dostal, nedostane druhý. |
| K9 target_tiers a adult_only u uvítacích | HOTOVO | `grantWelcomeCoupons` přes `rozesliKupon` | Nový člen dostane jen uvítací kupony, na které má nárok (úroveň, skupina, 18+, limit kusů, platnost od–do). |
| K10 promo kód prochází claimBlocker | HOTOVO | `promo/route.ts` | Host bez nároku na kupon z kódu kód nespotřebuje. Okno hodin se hlídá až u kasy. |
| K10 atomické uses a kompenzace | HOTOVO | `ON CONFLICT DO NOTHING`, podmíněný UPDATE, `vratPouziti` | Pád po cestě vrátí použití i vydaný kód. |
| K11 dialog smazání odpovídá API | HOTOVO | `KuponyStranka.tsx`, `PromoKody.tsx` | Kupon nebo kód, který hosté drží nebo použili, se nemaže; dialog to řekne a nabídne archivaci / vypnutí. |

## NELZE

- Automatické odečtení slevy z účtenky (vyloučené položky, kupon na položku, X+Y): kasa nemá rozhraní pro vložení slevy. Pravidla vidí host i obsluha a obsluha je uplatní ručně.
- Výběr více členů zaškrtnutím (K3): v této větvi chybí seznam členů s výběrem (`ClenoveSprava`), viz řádek K3 výše.
- Ověření v prohlížeči: nová sonda `scripts/sondy/kupony-sprava.mjs` je psaná, ale v tomhle prostředí není Chromium, takže neběžela. Jednotkové testy, `tsc` a všechny `check-*` prošly.
