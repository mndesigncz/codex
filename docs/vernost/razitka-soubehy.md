# Věrnost: Razítka (R) a Souběhy a integrita (S)

Okruh z kontrolního seznamu úplnosti věrnostního programu. Všechno níže je ověřené v kódu, testy jsou v `scripts/testy/k81-razitka.ts` (čisté funkce zkoušené přímo, atomické zápisy a UI hlídané kontrolami zdrojů). Ruční sonda čtečky: `scripts/sondy/razitka-kasa.mjs` (je v `MIMO`, spouští se `SONDY_ZAKLAD=http://localhost:3000 node scripts/sondy/razitka-kasa.mjs`).

Počet: **25 řádků HOTOVO, 0 NELZE** (plus doplňky na konci).

Kde co je:

- čistá pravidla: `lib/razitkaPravidla.ts` (plán připsání, okna, kalendářní opakování, kategorie, kombinovatelnost, validace, CSV)
- zápis do databáze: `lib/stamps.ts` (optimistický zápis, deník, storno, statistiky), schéma `lib/stampsSchema.ts` + `app/api/init/route.ts`
- správa: `app/api/client/admin/stamps/route.ts`, UI `components/client/loyalty/` (`StampsAdmin`, `KampanEditor`, `KampanStatistiky`, `RucniRazitka`)
- kasa: `app/api/client/staff/scan/route.ts`, `lib/idempotence.ts`, UI `components/client/CardScan.tsx`, `CteckaKasa.tsx`, `loyalty/RazitkaKasa.tsx`
- host: `components/client/loyalty/KartaRazitek.tsx` (stránka podniku, Moje, náhled v editoru)

## R. Razítka

| Řádek | Stav | Soubor / test | Jak to provozovatel používá |
| --- | --- | --- | --- |
| R1 limit dokončených karet na hosta | HOTOVO | `planPripsani`, pole „Karet na hosta“; test `R1:` | Věrnost → Razítka → úprava kartičky → Limity → „Karet na hosta“. 0 = bez omezení. Po limitu kasa napíše důvod a host další razítka nedostává. |
| R2 denní strop razítek na hosta | HOTOVO | `planPripsani`, `razitekDnes` (deník), „Razítek za den“; test `R2:` | Stejné místo, „Razítek za den“. Počítá se z návštěv, účtenek a částek za pražský den, ruční úprava vedením se stropem neřídí. |
| R3 dny v týdnu a hodiny platnosti | HOTOVO | `platiTed`, `popisOkna`; test `R3:` | „Kdy platí“: dny Po–Ne a hodiny od–do, i přes půlnoc (22:00–02:00). Mimo okno kasa razítko nedá a řekne proč, tlačítko „Razítko za návštěvu“ je šedé. |
| R4 vyloučené položky i kategorie, kategorie místo položek | HOTOVO | `spocitejRazitka`, `davaRazitko`, `VyberKategorii`; test `R4:` | „Za co se razítko připisuje“ → vyber položky nebo celé kategorie; „Vyloučené položky a kategorie“ je rozbalovací část. U útraty se cena vyloučených řádků odečte (když ji pokladna pošle). |
| R5 kombinovatelnost, účtenka do kampaně jen jednou | HOTOVO | `vyberKampane`, kontrola `ref = bill:…` v `applyBillToCampaigns`; test `R5:` | Přepínač „Účtenka smí dát razítko i jiným kartičkám“. Vypnutá kartička si účtenku vezme sama (rozhoduje pořadí v seznamu). Tatáž účtenka nikdy nedá razítko téže kampani dvakrát. |
| R6 koncept / naplánováno / pozastaveno / archiv | HOTOVO | `stavKampane`, sloupce `draft`, `archived_at`; test `R6:` | U kartičky štítek stavu. „Uložit jako koncept“ nic hostům neukáže. Přepínač Běží = pozastavení. „Platí od“ v budoucnu = naplánováno. Archiv a „Vrátit z archivu“ v nabídce řádku. |
| R7 duplikovat, řazení | HOTOVO | `POST action duplicate`, `PATCH action move`; test `R7:` | Nabídka řádku: Duplikovat (vznikne koncept), Posunout nahoru/dolů (mění se i pořadí na kartách hostů a při sdílení účtenky). |
| R8 statistiky | HOTOVO | `statistikyKampane`, `KampanStatistiky`; test `R8:` | Nabídka řádku → Statistiky: dokončené karty, uplatněné/propadlé odměny, průměrná doba sbírání, top hosté, útrata z účtenek s razítkem, rozpad po dnech za 30 dní. |
| R9 ruční připsání/odebrání, storno, hromadně | HOTOVO | `RucniRazitka`, `odeberRazitka`, `stornujPosledni`; test `R9:` | Nabídka řádku → Razítka ručně: připsat nebo odebrat, jednomu, vybraným hostům nebo celé skupině (nejvýš 200), důvod je povinný a jde do historie hosta i auditu. Storno poslední akce: u kasy tlačítko „Storno poslední akce“, ve správě v témže okně. Vrátí razítka a neuplatněnou odměnu; uplatněnou odmítne. |
| R10 export kampaně (CSV) | HOTOVO | `GET ?export=ID`, `razitkaCsv`, `udalostiCsv`; test `R10:` | Nabídka řádku → Exportovat hosty (CSV) nebo deník razítek. Středník a BOM pro český Excel. Smí jen ten, kdo kampaně spravuje (soubor nese e-maily). |
| R11 náhled pohledem hosta, obrázek/barva/ikona, sdílený popis podmínek | HOTOVO | `KartaRazitek`, `KampanEditor` (náhled vpravo); test `R11:` | V editoru vpravo živý náhled. „Vzhled karty“: barva, ikona razítka, obrázek na pozadí. „Podmínky“ jsou společný text, host ho vidí pod kartou v rozbalovací části. |
| R12 odměna: reward_items | HOTOVO | `popisOdmeny`, `VyberPolozek`; test `R12:` | „Odměna“ → „Položky odměny“. Vypíšou se na kuponu a na kartě hosta, ať obsluha ví, co vydat. |
| R13 validace PATCH jako POST | HOTOVO | `polePole` + `overKampan` pro obojí; test `R13:` | Bez práce: úprava dostává stejné chyby jako založení (products bez položek/kategorií, útrata bez částky, konec před začátkem, půlka hodin). |
| R14 vypršení, stack_cards, po valid_till, archiv místo smazání, odměny jako řádky kuponů | HOTOVO | `planPripsani`, `stavKartyHosta`, `skonceneKampane`, `odmenovyKupon`, `DELETE needsForce`; test `R14:` | „Dní na nasbírání“ se počítá od prvního razítka karty. Host vidí do kdy kartu dosbírat a po vypršení kolik razítek propadlo; kasa to ukáže po akci. Bez přenosu karet se přebytek hlásí, neztrácí tiše. Skončená kartička hostovi zůstane vysvětlená v „Skončené kartičky“. Smazání s razítky hostů server bez potvrzení odmítne, doporučená je archivace. Odměna kampaně je jeden řádek kuponu na kampaň (ne na každé dokončení). |
| R15 kalendářní měsíc a den (pražský) | HOTOVO | `dalsiKartaOd`; test `R15:` | „Další karta po dokončení“: od dalšího dne, po týdnu, od 1. dne dalšího měsíce (ne za 30 dní), jen jednou. Hranice sedí na pražskou půlnoc. |

## S. Souběhy a integrita

| Řádek | Stav | Soubor / test | Co se děje |
| --- | --- | --- | --- |
| S1 addStamps atomicky | HOTOVO | `lib/stamps.ts` (`ver`, opakování), `S1:` | Načte průběh, spočítá plán a zapíše jen když se `ver` nezměnilo; jinak zkusí znovu. Dvě souběžná razítka neztratí razítko ani nevydají dvě odměny. Při pádu po zápisu se průběh i vydané kódy vrací. |
| S2 claim atomicky | HOTOVO | `coupons/[id]/claim/route.ts`, `S2:` | Vložení nároku hlídá otevřený kupon v jednom příkazu; pád vložení vrátí body. |
| S3 spendPoints + INSERT s kompenzací | HOTOVO | tamtéž, `S3:` | Body se odečtou atomicky předem; neúspěch vložení (i výjimka) je vrátí. |
| S4 promo uses | HOTOVO | `promo/route.ts`, `S4:` | Limit uplatnění je přímo v `UPDATE … WHERE uses < max_uses`. Při pádu po zabrání kódu se použití, body i počítadlo vrací. |
| S5 staff/scan already | HOTOVO | `scan/route.ts`, `S5:` | „Dnes už razítko má“ rozhoduje atomický zámek ve `stampVisit`, ne předčasná kontrola. |
| S6 client_bill_awards transakčně | HOTOVO | `scan/route.ts`, `S6:` | Zámek účtenky se zabere atomicky; pád po něm ho uvolní, účtenka se nespálí. Pozn.: Neon přes HTTP nemá interaktivní transakce, proto kompenzace, ne `BEGIN/COMMIT`. |
| S7 ruční částka spouští kampaně | HOTOVO | `scan/route.ts` (`points`, `items`), `S7:` | Ruční částka u kasy vyhodnotí kampaně „za útratu“; nová akce `items` vyhodnotí ručně zadané položky jako účtenku. |
| S8 visits z účtenky | HOTOVO | `scan/route.ts`, `zapisNavstevuZUctenky`, `S8:` | Účtenka je návštěva (jednou za pražský den) a dá razítko za návštěvu, pokud ho host dnes ještě nemá. |
| S9 idempotence akcí u kasy | HOTOVO | `lib/idempotence.ts`, `RazitkaKasa.tsx`, `S9:` | Obě čtečky posílají `Idempotency-Key`; stejný klíč dvakrát = jedna akce a stejná odpověď (`opakovani: true`). Klíč zůstane po výpadku sítě a uvolní se po odmítnutí. |
| S10 dvojí počítadlo razítek | HOTOVO | `stampVisit`, `maKampane`, peněženka, seznam členů, `S10:` | Má-li podnik kampaň „za návštěvu“, staré počítadlo na členství se nezvyšuje ani nevydává vlastní odměnu. Peněženka, seznam členů a detail čtou razítka z kampaní. Návštěva z objednávky nebo rezervace dá razítko stejným kampaním jako kasa. |

## Doplňky mimo seznam

| Co | Stav | Poznámka |
| --- | --- | --- |
| Čtečky: `Idempotency-Key`, ruční položky, `expiredCount` | HOTOVO | `CardScan.tsx`, `CteckaKasa.tsx`, `loyalty/RazitkaKasa.tsx`; po akci se ukáže upozornění „Rozdělaná karta hosta vypršela, propadlo N razítek“ a „N razítek se nevešlo“. |
| Účtenka, která už věrnost připsala, je ve čtečce zablokovaná | HOTOVO | `GET scan` vrací `awarded`. |
| Razítko u kasy mimo okno platnosti nespotřebuje denní zámek | HOTOVO | `navstevniKampane`, `scan/route.ts`. |
| Nová oprávnění | nebyla potřeba | Ruční razítka a storno ve správě používají `vernost.upravit_body` (popis v `lib/opravneniKatalog.ts` doplněn), kampaně `vernost.kampane`, kasa `vernost.karta`. |
| Audit | HOTOVO | `client.stamps`, `client.stamps.manual` v `lib/auditPopisky.ts`. |
| Smazání účtu | HOTOVO | `client_stamp_events` (smazat podle hosta), `client_kasa_idem` (se smazáním podniku) v `lib/smazaniUctu.ts`. |
| Překlady hostovské části | HOTOVO | 16 vět `klient-host`, 2 věty `api` ve všech jazycích. |

## Co dál neumíme (a proč)

Nic z řádků R a S. Dvě poznámky k provozu:

- Atomicita napříč tabulkami (S2, S3, S4, S6) je kompenzací, ne databázovou transakcí, protože Neon HTTP ovladač transakce nedává. Při pádu serveru uprostřed kompenzace by zbyla jediná nevrácená věc; v ostatních případech se stav vrací.
- Čas, od kdy host „sbírá kartu“, se počítá od prvního razítka karty. Karty rozdělané před touto změnou berou začátek z doby jejich založení v databázi.
