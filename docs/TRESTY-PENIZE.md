# Tresty a peníze z výplaty: kontrakt pro UI (kolo 96)

Jádro (data, výpočty, API, testy, ukázka) je hotové. UI dělají dvě sady agentů nad **disjunktními soubory**
(sada V = vedení, sada Z = zaměstnanec a výplaty; seznamy na konci). Tenhle dokument je jediný zdroj
pravdy o endpointech, stavech, oprávněních a o tom, kde se co v UI ukazuje.

- Čistá logika: `lib/trestyPenize.ts` (testy `scripts/testy/k96-tresty-penize.ts`)
- Databáze: `lib/trestyPenizeDb.ts`, DDL v `app/api/init/route.ts` (blok „Tresty a peníze z výplaty")
- Server: `app/api/tresty/_penize.ts`, `app/api/tresty/**`, `app/api/payroll/**`, `app/api/wage-adjustments/davka`
- Klientská data a akce pro obě sady: `components/tresty-penize/data.ts` (UI ho **používá, nemění**)
- Ukázka `/demo`: `lib/demo/routy/trestyPenize.ts` (+ `tresty.ts`, `lide.ts`, `vedeni.ts`)

## 1. Právní rámec v jedné větě na cestu (texty pro vedení, krátce)

Peněžní pokuty zaměstnancům zakazuje § 346b ZP. Aplikace proto nabízí jen tyto tři cesty:

| Cesta | Kdy se strhne | Věta pro vedení (konstanta v `lib/trestyPenize.ts`) |
|---|---|---|
| **A) Krácení nenárokové složky** (`bonusCut`) | hned; nejvýš strop (složka + nenárokové prémie − už kráceno) | `VETA_BEZ_PREMIE` (lib/tresty) při stropu 0 |
| **B) Náhrada škody** (`nahrada`) | po souhlasu zaměstnance (HPP/DPP/DPČ/neznámá smlouva), u OSVČ hned | `vetaSouhlasu(smlouva)`; u nedbalosti strop 4,5× průměru, bez dat `VETA_BEZ_PRUMERU` (jen varování) |
| **C) Přímá srážka** (`srazka`) | po souhlasu zaměstnance (HPP/DPP/DPČ/neznámá), u OSVČ hned | `VETA_SOUHLAS_ZP` / `VETA_SOUHLAS_NEZNAMY` / `VETA_OSVC` |

Schodek a ztráta svěřených věcí jen s dohodou o odpovědnosti (`VETA_SCHODEK`). Napomenutí není výtka
(`VETA_VYTKA`, lib/tresty). Nikde nepiš „§ 346d" (test to hlídá). Odkaz na nápovědu stačí, žádné romány.

## 2. Datový model

| Tabulka / sloupec | Co to je |
|---|---|
| `team_members.nenarokova_typ` `pct` \| `kc_hod` \| `kc_mesic` \| NULL, `nenarokova_hodnota`, `nenarokova_v_sazbe` (TRUE = součást dnešní sazby, výplata se nezmění, jen se rozdělí; FALSE = navíc ke mzdě) | **Nenároková složka** výplaty člena |
| `penalties.batch_id` | společné id **hromadného** trestu (každý člověk má vlastní řádek) |
| `penalties.zaskok_komu` `podnik` \| `lide` \| `smena`, `zaskok_zpusob` `rovne` \| `castky` | komu přejde stržená částka |
| `pay_batches` (`kind` `trest` \| `odmena`) | dávka hromadného trestu / odměny |
| `wage_deductions` | **srážka** k trestu: `kind` `nahrada` \| `srazka`, `amount`, `installments` (splátky 1–12), `status` `ceka` \| `uplatneno` \| `nesouhlas` \| `zruseno`, `needs_consent`, `contract_type` (snímek), škoda (`damage_amount`, `damage_kind`, `fault`, `liability_agreement(_date)`, `avg_earnings`, `cap`, `cap_warning`), `apply_from`, souhlas (`consent_text`, `consent_version`, `consent_at`, `consent_id` → `consents`), nesouhlas (`refused_at`, `refuse_note`), zrušení |
| `penalty_transfers` | **záskok**: příjemce, plánovaný podíl `amount` ze základu `base`, `status` `plati` \| `zruseno` |
| `consents` (typ `srazka_mzdy`, kanál `tresty`, stav `udelen` \| `odmitnut`) | souhlas / nesouhlas se srážkou jako ostatní souhlasy |
| `wage_adjustments` | skutečné peníze ve výplatě, podle `source`: `premie` (nenároková prémie, +), `trest` (krácení, −), `nahrada` (splátka náhrady, −), `srazka` (splátka srážky, −), `zaskok` (přijatý záskok, +), `manual`/`reward`/`navic` (ostatní); `source_ref` = trest / srážka / převod; `batch_id` = hromadná odměna |

Všechno peněžní se po každé změně přepočítá jedním `prepocitejPenizeTrestu` (lib/trestyPenizeDb):

- **čeká na souhlas se nestrhává** — do `wage_adjustments` jdou jen uplatněné srážky (rozvrh splátek od `apply_from`: první splátka k tomu dni, další k 1. dni následujících měsíců);
- **záskok** přejde poměrně k tomu, co se z trestu opravdu strhlo (z krácení hned, ze srážky až s ní); když se základ změní (snížení, zrušená srážka, nesouhlas), podíly se přeškálují;
- **uzavřené období** (`payroll_locks`) se nemění: řádky v zamčeném měsíci zůstanou a rozdíl jde opravným řádkem (poznámka „(oprava za uzavřené období)") do prvního otevřeného dne. Nový trest do uzavřeného měsíce = opravný řádek v dalším.
- Ruční smazání řádku `trest`/`nahrada`/`srazka`/`zaskok` v okně Prémie a srážky nepoužívat — při dalším přepočtu se vrátí; měnit přes trest / srážku.

## 3. Oprávnění

| Co | Klíč |
|---|---|
| Body, text, den, vazby, napomenutí | `tresty.udelit` (jako dnes) |
| **Cokoli s penězi**: `bonusCut` > 0, `srazka`, `nahrada`, `zaskok` jiný než `podnik`, změna krácení v PATCH, zrušení / snížení srážky, hromadná odměna, fronta srážek týmu, cizí `item.penize` | `finance.mzdy` (bez něj server **403** `VETA_BEZ_PRAV_PENIZE` = „Peníze z výplaty smí měnit jen ten, kdo vidí mzdy.") |
| Krácení ze sazebníku (položka s `bonusCut`) | bez `finance.mzdy` se krácení ze sazebníku **tiše vynechá** (trest dá jen body) |
| Nastavit nenárokovou složku člena | `finance.sazby_upravit` (jako sazba a smlouva); číst `finance.mzdy` |
| Souhlas / nesouhlas se srážkou | jen zaměstnanec, kterého se srážka týká |
| Zaměstnanec vidí | jen své tresty, své `penize` (bez jmen příjemců záskoku), své srážky, svou složku v Mém výdělku |

UI: `GET /api/tresty` → `smi.penize` (= `finance.mzdy`). Bez něj okno „Dát trest" **nekreslí** sekce Peníze a Záskok
a pole krácení. Klient: `useOpravneni().ma('finance.mzdy')` / `ma('finance.sazby_upravit')`.

## 4. Endpointy

Chyby jsou vždy `{ error: '<česká věta>' , ...extra }`; UI je ukazuje přes `apiMessage` / překlad v `hlasky.ts`
(seznam vět v kap. 6). Všechny částky celá čísla v měně podniku (formátovat `useMoney()`).

### 4.1 `GET /api/tresty` (rozšířeno)

Dotaz jako dřív (`scope`, `status`, `month`, `userId`, `day`, `closingId`, `shiftId`) + **`batchId`**.
Odpověď `{ items: Trest[], druhy, smi: { udelit, sazebnik, tym, penize } }`. Každý `Trest` navíc:

```ts
batchId: number | null            // hromadný trest
penize: PenizeTrestu | null       // vlastní trest vždy, cizí jen s finance.mzdy; null = bez peněz
interface PenizeTrestu {
  kraceni: number;                // = bonusCut
  srazky: SrazkaTrestu[];
  zaskok: { komu: 'podnik'|'lide'|'smena'; zpusob: 'rovne'|'castky'|null; prevody: PrevodTrestu[] };
  cekaNaSouhlas: number;          // součet srážek ve stavu 'ceka' (jen platný trest)
  strzeno: number;                // krácení + uplatněné srážky
}
interface SrazkaTrestu {
  id; druh: 'nahrada'|'srazka'; castka; splatky; stav: 'ceka'|'uplatneno'|'nesouhlas'|'zruseno';
  potrebujeSouhlas: boolean; smlouva: 'HPP'|'DPC'|'DPP'|'OSVC'|null; proc: string /* věta pro vedení */;
  zneni: string|null              // 'ceka' = AKTUÁLNÍ znění dohody k odsouhlasení; po souhlasu odsouhlasené znění
  souhlasAt; nesouhlasAt; nesouhlasDuvod; odDne; rozvrh: { den, castka }[]; zrusenoAt;
  skoda: { castka, druh: 'zavinena'|'schodek'|'ztrata', zavineni: 'nedbalost'|'umysl', dohoda, dohodaDatum, prumer, strop, varovani } | null;
}
interface PrevodTrestu { id; userId: number|null; userName: string|null /* null pro zaměstnance */; castka /* plán */; preslo /* opravdu přešlo */; stav: 'plati'|'zruseno' }
```

Parsování na klientu: `vyberTresty` / `vyberDataTrestu` (lib/tresty) už `penize` i `batchId` čtou. Pomocníci:
`penizeText(p, money)` („krácení 300 Kč · srážka 500 Kč (čeká na souhlas)"), `cekaNaSouhlas(p)`, `stavSrazky(stav)` (chip: tone + text-klíč).

### 4.2 `GET /api/tresty?strop=1&userId=&day=[&bez=]` (rozšířeno; `tresty.udelit` + `finance.mzdy`, jinak 403)

`{ strop, premie, uzKraceno, slozka, zaskok }` — `slozka` = nenároková složka za měsíc (podle dosud odpracovaných
hodin), `zaskok` = přijatý záskok v měsíci. Strop = složka + nenárokové prémie + záskok − už kráceno.
Věta pod polem: „Nenároková složka {slozka} + prémie {premie} · krátit jde nejvýš {strop}" (UI V doplní `vyberStrop` o `slozka`, `zaskok`).

### 4.3 `POST /api/tresty` (rozšířeno — jeden člověk i dávka)

```ts
{
  userId?: number, userIds?: number[]       // jeden nebo víc lidí (max 50); každý dostane vlastní trest
  text, day?, shiftId?, closingId?, taskId?, typeId?, photoUrl?, points?, sourceKey? // jako dřív (sourceKey jen pro 1 člověka)
  bonusCut?: number                          // A) krácení (finance.mzdy)
  rozpocitat?: boolean                       // false = „každý X", true = „rozpočítat X" mezi lidi (krácení, srážka, náhrada);
                                             // u „rozpočítat" platí stropy (krácení 5 000, srážka/náhrada 200 000) na člověka,
                                             // u náhrady „každý" nesmí součet náhrad všech přesáhnout škodu
  srazka?: { castka: number, splatky?: 1..12 }                     // C) přímá srážka
  nahrada?: { skoda: number, castka?: number /* výchozí = skoda */, druh: 'zavinena'|'schodek'|'ztrata',
              zavineni?: 'nedbalost'|'umysl', dohoda?: boolean, dohodaDatum?: 'RRRR-MM-DD', splatky?: 1..12 }  // B)
  zaskok?: { komu: 'podnik'|'lide'|'smena', zpusob?: 'rovne'|'castky', lide?: [{ userId, castka? }] }
}
```

- Odpověď **201** `{ ok: true, item }`; u dávky navíc `items` (všechny) a `batchId`. `item.penize` je vyplněné.
- `zaskok.komu = 'lide'`: rovným dílem, nebo `castky` (součet ≤ stržený základ trestu, zbytek podniku). U dávky platí částky pro **každý** trest zvlášť. Potrestaný sám sobě nic nepřevádí.
- `zaskok.komu = 'smena'`: rovným dílem všem z plánu / docházky dne (+ z uzávěrky `closingId`) kromě potrestaných.
- Výchozí v UI: vybral-li vedoucí „kdo to napravil" → `lide`; jinak `podnik` (pole nepošle nebo `komu: 'podnik'`).
- Push: potrestanému jako dřív (`oznamTrest`); u srážky ve stavu `ceka` navíc „Srážka X čeká na tvůj souhlas"
  (odkaz `/employee/shifts?view=rewards&arg=tresty`); příjemcům záskoku „Za záskok dostaneš X".
- Chyby: 400 validace (kap. 6), **403** peníze bez `finance.mzdy`, 404 `Člověk není v podniku.` (+ `userId`),
  **409** strop krácení (`{ error, strop, userId }`, věta „Krátit jde nejvýš … — víc nenárokových prémií ten měsíc nemá." nebo `VETA_BEZ_PREMIE`),
  **409** strop náhrady („Náhrada jde nejvýš {X} — 4,5násobek průměrného výdělku ({Y})." + `strop`, `userId`),
  409 „Na směně ten den nikdo další nebyl — vyber lidi, nebo nech částku podniku.", 409 duplicita / zahozený návrh, 503 před migrací.
  Kontrola je u dávky **před** uložením — buď projdou všichni, nebo nikdo.

### 4.4 `PATCH /api/tresty/[id]` (rozšířeno)

Jako dřív (`seen`, `response`/`disagree`, `status:'zruseno'`, `disputeHandled`, úprava polí) a navíc (vše `finance.mzdy`):

- změna `bonusCut` (strop jako dřív) → přepočet krácení i záskoku;
- `srazka` / `nahrada` (tvar jako v POST) → **přidá** další srážku k trestu (stav podle smlouvy, push k souhlasu);
- `zaskok` → nově určí, komu přejde stržená částka (dosavadní převody se zruší, uzavřené období zůstane).
- **Zrušení trestu** zruší i jeho srážky a záskok; peníze v otevřeném období zmizí, v uzavřeném vrátí opravný řádek.
- Odpověď `{ ok, item }` — `item.penize` tu **není**; po uložení přenačti `GET /api/tresty` (stačí `obnovTresty()` / `obnovPenize()`).

### 4.5 `PATCH /api/tresty/srazky/[id]` (nové)

| Kdo | Tělo | Výsledek |
|---|---|---|
| zaměstnanec (jen svá, stav `ceka`) | `{ souhlas: true, zneni }` | `zneni` musí být **přesně** `item.penize.srazky[].zneni`. Uloží souhlas (consents + srážka), stav `uplatneno`, `odDne` = první otevřený den ≥ dnes, záskok přejde. 200 `{ ok, srazka: { id, stav, castka, odDne, zneni } }`. **409** „Znění dohody se mezitím změnilo — přečti si ho znovu." + `{ zneni }` (nové znění ukaž a nech potvrdit znovu). Push tomu, kdo srážku zapsal. |
| zaměstnanec | `{ nesouhlas: true, duvod? }` (≤ 300) | stav `nesouhlas`, nic se nestrhne, záskok se přeškáluje; **push vedení** (všichni s `finance.mzdy` + kdo zapsal). |
| vedení | `{ status: 'zruseno', note? }` | zrušit; push zaměstnanci. |
| vedení | `{ castka }` | jen **snížit** (zvýšit = 409, přidej novou srážku). |
| vedení | `{ znovu: true }` | po nesouhlasu znovu požádat (stav `ceka`, push zaměstnanci). |

Chyby: 403 „Souhlasit se srážkou může jen ten, koho se týká.", 409 „Srážka už nečeká na souhlas." (+ `stav`),
409 „Trest je zrušený — srážka už neplatí.", 409 „Znovu požádat jde jen po nesouhlasu.", 409 „Zrušenou srážku už upravit nejde.",
409 „Srážka už je zrušená.", 403 `VETA_BEZ_PRAV_PENIZE`, 404 „Srážka nenalezena.", 400 „Nevím, co se srážkou udělat."

### 4.6 `GET /api/tresty/srazky?scope=mine|team&stav=&userId=` (nové)

Fronta pro vedení (`scope=team`, `finance.mzdy`; řazení nesouhlas → čeká → ostatní) a vlastní srážky zaměstnance.
`{ items: [{ id, penaltyId, userId, userName, userAvatar, druh, castka, splatky, stav, day, text, trestPlati, nesouhlasDuvod, nesouhlasAt, souhlasAt, createdAt }] }`.
Háček `useSrazky(urlSrazek({ scope: 'team', stav: 'nesouhlas' }))`.

### 4.7 `GET /api/tresty/vyber?day=&closingId=` (nové; `tresty.udelit` nebo `finance.mzdy`)

`{ day, lide: [{ id, name, avatar, role, jobTitle, smlouva? }], smena: number[], uzaverka: number[] }` (`smlouva` HPP/DPP/DPC/OSVC/null
jen s `finance.mzdy` — okno podle ní řekne, jestli srážka počká na souhlas) — pro hromadný výběr
(zaškrtávání, „celá směna dne" = `smena`, „všichni na uzávěrce" = `uzaverka`, filtr role/pozice z `lide`) a pro záskok.
Háček `useVyberLidi(urlVyberu(day, closingId))`.

### 4.8 `GET|PUT /api/payroll/slozka` (nové)

- `GET ?userId=` (`finance.mzdy`) → `{ userId, slozka: { typ, hodnota, vSazbe } | null }` — `useSlozka(urlSlozky(id))`.
- `PUT { userId, typ: 'pct'|'kc_hod'|'kc_mesic'|null, hodnota, vSazbe }` (`finance.sazby_upravit`) → `{ ok, userId, slozka }` — `ulozSlozku(id, slozka|null)`.
- Chyby: „Neznámý typ nenárokové složky.", „Procento musí být větší než 0 a nejvýš 100.", „Částka nenárokové složky musí být kladná.",
  404 „Člověk není v podniku.", 409 „Člověk nemá v podniku členství (jen zrcadlo) — složku zatím nejde uložit.", 503.
- Popis do věty: `popisSlozky(slozka, money)` („10 % ze mzdy (součást sazby)").

### 4.9 `POST|DELETE /api/wage-adjustments/davka` (nové; `finance.mzdy`) — hromadná odměna v penězích

- `POST { userIds | userId, castka, rozpocitat?, day?, text, nenarokova? = true }` → 201 `{ ok, batchId, items: [{ id, userId, day, amount }] }`.
  Nenároková (výchozí) = `source 'premie'` (dá se z ní krátit), `nenarokova:false` = mzda/ostatní. Den v uzavřeném období → první otevřený. Push každému.
- `DELETE ?batchId=` → `{ ok, opravy }` (vzít zpět; uzavřené období opravou).
- Chyby: „Vyber, komu odměna patří.", „Odměna musí být celé kladné číslo.", „Odměna jednomu člověku může být nejvýš 100 000.",
  „Po rozpočítání by někdo dostal 0 — zvyš částku.", „Napiš, za co odměna je.", „Den nesedí — ne do budoucna.", 404, 503.
- Akce: `hromadnaOdmena({...})`, `vezmiOdmenuZpet(batchId)`.
- Jednotlivá prémie dál `POST /api/wage-adjustments` (okno Prémie a srážky v Docházce, `finance.sazby_upravit`).

### 4.10 `GET /api/payroll` (rozšířeno — výplatní listina, profil, Můj výdělek)

- Vedení (`lide[]`, s `finance.mzdy`): `slozka: NastaveniSlozky | null`, `cekaNaSouhlas: number` (srážky čekající na souhlas u trestů v období).
- `?ja=1` (`ja`): `slozka`, `cekaNaSouhlas`, `srazky: [{ id, penaltyId, druh, castka, splatky, stav, text, day }]` (čekající kdykoli + z období).
- Krácení, náhrady, srážky a záskok přicházejí jako úpravy mzdy z `GET /api/attendance` → `adjustments` (s `source`).

**Výpočet ve výplatě (čistě, lib):**

```ts
// Výplatní listina: s obdobím a úpravami počítá řádky s rozpadem (r.penize) — BEZ toho třetího argumentu je vše jako dřív.
vyplatniListina(souhrn, payroll.lide, { od, do, upravy: upravyVRozmezi(adjustments, od, do) })
// → RadekVyplaty.penize: { mzda, zakladni, slozka, slozkaNavic, premie, zaskok, kraceni, kraceniUplatneno, kraceniNadStrop,
//                          nahrada, srazky, ostatni, cekaNaSouhlas, upravyUcinne, hruba }
//   hruba a doplatit už obsahují složku navíc a vrácené krácení nad strop.
csvVyplatniListiny(radky, { ..., penize: true })   // sloupce: Mzda (nároková), Nenároková složka, Prémie a ostatní, Krácení,
                                                   // Náhrada škody, Srážky, Záskok, Čeká na souhlas (jen info), … Doplatit
// Můj výdělek / profil: stejný rozpad pro jednoho člověka
rozpadVyplaty({ mzda, ms, od, do, upravy: mojeUpravy, slozka: ja.slozka, cekaNaSouhlas: ja.cekaNaSouhlas })
```

Krácení nad strop (složka + nenárokové prémie období) se ve výplatě nikdy nestrhne (`kraceniNadStrop`) — nároková mzda zůstává celá.

## 5. Kde se co v UI ukazuje

**Okno „Dát trest" (V, `components/tresty-vedeni/DatTrest.tsx`)** — jedno pro všechna místa:
1. **Kdo**: jeden člověk jako dnes, nebo hromadně — zaškrtávání z `useVyberLidi`, rychlé volby „Celá směna {den}" (`smena`),
   „Všichni na uzávěrce" (`uzaverka`, když je `closingId`), filtr role/pozice. Tělo `userIds`.
2. **Body** (záporné; kladné = pochvala zůstává jinde) jako dnes.
3. **Peníze** (jen `smi.penize`): přepínač Krácení nenárokové části / Náhrada škody / Srážka z výplaty.
   - Krácení: strop pod polem (`strop`, `slozka`, `premie`); 409 → věta pod polem.
   - Náhrada: popis = text trestu, fotka = fotka trestu, částka škody, druh, zavinění, u schodku/ztráty dohoda + datum, splátky; strop/varování z 409 nebo `skoda.varovani`.
   - Srážka: částka + splátky; jednou větou `vetaSouhlasu(smlouva)` proč hned / až po souhlasu (smlouvu nese `GET /api/tresty/vyber`).
   - U dávky přepínač „každý X" / „rozpočítat X" (`rozpocitat`).
4. **Komu přejde stržená částka** (jen `smi.penize`, jen když se něco strhává): Nechat podniku / Kdo to napravil (lidé, rovně nebo vlastní částky) / Rozdělit mezi směnu.
5. Napomenutí a § 52 věta jako dnes. Po uložení `obnovTresty()` (V) nebo `obnovPenize()`.

**Vstupní místa** (V): widget Tresty v týmu (`odmeny.tsx`, + hromadný trest, + hromadná odměna, + fronta nesouhlasů se srážkou),
docházka – pozdní příchod (`Attendance.tsx`; widget Docházka v `dochazka.tsx` už `DatTrest` montuje a nic měnit nemusí),
uzávěrka – manko/„všichni na uzávěrce" (`TrestyUzaverky.tsx`, `ClosingDetail.tsx`), hodnocení směny – výtka (`ShiftReviewModal.tsx`),
návrhy z dat (`NavrhyTrestu.tsx`), fronta „Čeká na tebe" (`obecne.tsx`: nesouhlas se srážkou = `useSrazky(urlSrazek({ scope:'team', stav:'nesouhlas' }))`, akce Zrušit / Znovu požádat / otevřít trest).
Řádek trestu (`TrestRadek.tsx`) ukáže `penizeText` a chip stavu srážky; akce (`AkceTrestu.tsx`) zrušit/snížit srážku, znovu o souhlas.
**Nenároková složka člena** (V): v profilu člena **uvnitř sekce Tresty** (`TrestyClena.tsx` nebo nový soubor v `components/tresty-vedeni/`, který TrestyClena importuje) — tlačítko „Nenároková složka" (`finance.sazby_upravit`) a okno s typem, hodnotou a „součást sazby / navíc". `EmployeeProfile.tsx` V nemění.

**Moje tresty** (Z, `components/tresty/*`): u trestu s `penize` peněžní řádek (`penizeText`), u srážky `ceka` výrazná karta
„Souhlasíš se srážkou?" se zněním `zneni` (celé, čitelně), tlačítka **Souhlasím** (`souhlasSeSrazkou(id, zneni)`; na 409 ukázat nové `zneni`)
a **Nesouhlasím** (`nesouhlasSeSrazkou(id, duvod)`, nepovinně proč). Chip stavu `stavSrazky`. Rozvrh splátek po souhlasu. Záskok bez jmen („přejde kolegům").
Odkaz z push oznámení vede na `/employee/shifts?view=rewards&arg=tresty` (stávající `trestKOtevreni` — Z rozšíří, ať otevře trest s čekající srážkou přednostně).

**Můj výdělek** (Z, `dochazka.tsx` `MujVydelek`): řádky Nenároková složka, Prémie, Krácení, Náhrada škody, Srážky, Záskok (`rozpadVyplaty`),
a „Čeká na tvůj souhlas: X" s odkazem do Moje tresty (`ja.cekaNaSouhlas`, `ja.srazky`). Výdělek = `hruba` (složka navíc už v ní).

**Výplatní listina + CSV** (Z, `dochazka.tsx` `VyplatniListina`, `DetailVyplatyOkno`): `vyplatniListina(..., { od, do, upravy })`, ve sloupcích/detailu rozpad,
„čeká na souhlas" šedě s vysvětlením, že se nestrhává; CSV s `penize: true`. Složku ukázat jen čtením (`l.slozka`, `popisSlozky`), nastavuje se v profilu člena (V).
**Profil člena „Výplata · tento měsíc"** (Z, `EmployeeProfile.tsx`): stejný rozpad (`rozpadVyplaty` s `clovek.slozka`, `clovek.cekaNaSouhlas`).

Obnova: po akcích z `components/tresty-penize/data.ts` se vyšle `UDALOST_TRESTY` a `UDALOST_VYPLATY` (`'vyplaty:zmena'`) — Z na ni přenačte `/api/payroll` a `/api/attendance`.

## 6. Hlášky serveru k překladu (`t()` v UI, sekce `widgety`)

Nové věty dávej do části slovníku své sady: **V → `locales/<jazyk>/widgety.penize-vedeni.json`, Z → `locales/<jazyk>/widgety.penize-vyplaty.json`**
(en, de, sk, pl; za běhu jedna sekce `widgety`, `lib/i18n/slovniky.ts` CASTI_SEKCI). `widgety.json` nesahat — jinak konflikty.

- Validace (`lib/trestyPenize.ts`): `Neznámý typ nenárokové složky.` · `Procento musí být větší než 0 a nejvýš 100.` · `Částka nenárokové složky musí být kladná.` ·
  `Srážka musí být celé kladné číslo (nejvýš 200 000).` · `Splátek může být 1 až 12.` · `Výše škody musí být celé kladné číslo.` · `Vyber druh škody.` ·
  `Náhrada musí být celé kladné číslo (nejvýš 200 000).` · `Náhrada nemůže být vyšší než škoda.` · `VETA_SCHODEK` · `Datum dohody o odpovědnosti nemůže být v budoucnu.` ·
  `Nevím, komu má stržená částka přejít.` · `Částka pro kolegu musí být celé kladné číslo.` · `Vyber, kdo to napravil.` · `Moc lidí najednou (nejvýš 50).` ·
  `Zadej částku aspoň jednomu kolegovi.` · `Kolegům nejde převést víc, než se strhlo.` · `Vyber, koho se trest týká.` · odměna viz 4.9.
- Routy: `Návrh trestu jde dát jen jednomu člověku.` · `Peníze z výplaty smí měnit jen ten, kdo vidí mzdy.` · `Po rozpočítání by někomu vyšlo 0 — zvyš částku.` ·
  `Kolega, kterému má částka přejít, není v podniku.` · `Na směně ten den nikdo další nebyl — vyber lidi, nebo nech částku podniku.` ·
  `Z trestu se nic nestrhne — není co převést kolegům.` · srážky viz 4.5 · složka viz 4.8.
- Věty s částkou (`Krátit jde nejvýš …`, `Náhrada jde nejvýš …`) se nepřekládají celé — UI je může složit samo z `strop` v odpovědi.
- Věty pro vedení: `VETA_SOUHLAS_ZP`, `VETA_SOUHLAS_NEZNAMY`, `VETA_OSVC`, `VETA_BEZ_PRUMERU`, `VETA_SCHODEK`, `VETA_UZAVRENO`; chip `stavSrazky`: `Čeká na souhlas`, `Uplatněno`, `Nesouhlasí`, `Zrušeno`.
- `zneni` dohody a texty push oznámení zůstávají česky (právní text, uložený tak, jak ho člověk odsouhlasil).

## 7. Jak dnes UI tresty a výplaty volá (výchozí stav)

| Místo | Soubor | Data / háček |
|---|---|---|
| Okno Dát trest (všude) | `components/tresty-vedeni/DatTrest.tsx` | `useTresty`, `useSazebnik`, `useStropKraceni(urlStropu())` z `tresty-vedeni/data.ts`; tělo `teloTrestu` / `teloUpravy` (`tresty-vedeni/logika.ts`); hlášky `tresty-vedeni/hlasky.ts` |
| Widget Tresty v týmu | `components/widgety/oblasti/odmeny.tsx` (`TrestyTymu`, `ID_TRESTY`) | `useTresty(URL_TRESTY_PLATNE / urlTresty)`, `useNavrhyTrestu`, `useMankaNavrhu` |
| Řádek a akce trestu | `tresty-vedeni/TrestRadek.tsx`, `AkceTrestu.tsx` | PATCH `/api/tresty/[id]` |
| Profil člena – Tresty | `tresty-vedeni/TrestyClena.tsx` (montuje `EmployeeProfile.tsx`) | `useTresty(urlTresty({ scope:'team', userId }))` |
| Uzávěrka | `tresty-vedeni/TrestyUzaverky.tsx` (`TrestTlacitko`), `components/employer/ClosingDetail.tsx` | `urlTresty({ closingId })` |
| Hodnocení směny – výtka | `components/employer/ShiftReviewModal.tsx` | `TrestTlacitko`, `useNavrhyTrestu`, `klicVytky` |
| Docházka – pozdní příchod | `components/employer/Attendance.tsx`, `components/widgety/oblasti/dochazka.tsx` (ř. ~1238) | `DatTrest` s předvolbou z návrhu `pozde:<id>` |
| Fronta Čeká na tebe | `components/widgety/oblasti/obecne.tsx` | `vyberTresty`, `cekaSpor`, `otevriCastTresty` (`tresty-vedeni/cast.ts`) |
| Návrhy z dat, sazebník | `tresty-vedeni/NavrhyTrestu.tsx`, `SazebnikTrestu.tsx` | `/api/tresty/navrhy`, `/api/tresty/types` |
| Moje tresty (zaměstnanec) | `components/tresty/TrestyWidget.tsx`, `DetailTrestu.tsx`, `kusy.tsx`, `logika.ts`, `data.ts` (montuje `widgety/oblasti/moje-smeny.tsx`, stránka `components/employee/MyRewards.tsx`) | `useDataTresty(urlTresty())`, PATCH `{ seen }` / `{ response, disagree }`, `obnovTresty()` |
| Můj výdělek | `dochazka.tsx` `MujVydelek` (~ř. 788) | `/api/attendance` (`adjustments`), `urlPayrollJa` → `/api/payroll?ja=1`, `mujMesic`, `mojeUpravyMesice` |
| Výplatní listina + CSV | `dochazka.tsx` `VyplatniListina` (~ř. 1595), `DetailVyplatyOkno`, `SmlouvaOkno` | `urlPayroll`, `vyplatniListina`, `csvVyplatniListiny`, `csvText` |
| Prémie a srážky (jednotlivě) | `dochazka.tsx` `UpravaMzdyOkno` (~ř. 1253) | POST/DELETE `/api/wage-adjustments` |
| Profil člena – Výplata · tento měsíc | `components/employer/EmployeeProfile.tsx` (~ř. 320–380) | `/api/attendance`, `/api/payroll`, `doplatit` |
| Katalog widgetů (popisy, oprávnění polí) | `lib/widgety/katalog/odmeny.ts`, `obecne.ts` (V); `dochazka.ts`, `moje-smeny.ts` (Z) | — |

Testy se zdrojovými pojistkami nad UI: `scripts/testy/k86-tresty-ved.ts` (V), `k86-tresty-z.ts` (Z), `k88-pravni-tresty.ts` (oba — např. regex nad `dochazka.tsx` UpravaMzdyOkno a `odmeny.tsx`), `k84-vyplaty.ts` (Z). Sondy: `k86-tresty-ved` (V), `k86-tresty-z` (Z), `k84-vyplaty` (Z), `hodnoceni-smeny`, `k84-dochazka` (V/Z podle místa). Sondy mockují API — nová pole jsou nepovinná.

## 8. Rozdělení UI na dvě disjunktní sady souborů

### Sada V — vedení (okno Dát trest + hromadný výběr + záskok, nenároková složka člena, vstupní místa)

- `components/tresty-vedeni/DatTrest.tsx`
- `components/tresty-vedeni/logika.ts`
- `components/tresty-vedeni/data.ts`
- `components/tresty-vedeni/hlasky.ts`
- `components/tresty-vedeni/TrestRadek.tsx`
- `components/tresty-vedeni/AkceTrestu.tsx`
- `components/tresty-vedeni/TrestyClena.tsx` (+ nové okno nenárokové složky v `components/tresty-vedeni/`)
- `components/tresty-vedeni/TrestyUzaverky.tsx`
- `components/tresty-vedeni/NavrhyTrestu.tsx`
- `components/tresty-vedeni/SazebnikTrestu.tsx`
- `components/tresty-vedeni/cast.ts`
- nové soubory jen v `components/tresty-vedeni/`
- `components/widgety/oblasti/odmeny.tsx` (widget Tresty v týmu, hromadný trest, hromadná odměna, fronta srážek)
- `components/widgety/oblasti/obecne.tsx` (fronta Čeká na tebe)
- `components/employer/Attendance.tsx`
- `components/employer/ClosingDetail.tsx`
- `components/employer/ShiftReviewModal.tsx`
- `lib/widgety/katalog/odmeny.ts`, `lib/widgety/katalog/obecne.ts`
- `locales/{en,de,sk,pl}/widgety.penize-vedeni.json`
- testy/sondy: `scripts/testy/k86-tresty-ved.ts`, `scripts/sondy/k86-tresty-ved.mjs` (+ nová sonda `scripts/sondy/k96-penize-ved.mjs`)

### Sada Z — zaměstnanec + výplaty (Moje tresty se souhlasem/nesouhlasem, Můj výdělek, výplatní listina + CSV, profil člena Výplata)

- `components/tresty/TrestyWidget.tsx`
- `components/tresty/DetailTrestu.tsx`
- `components/tresty/kusy.tsx`
- `components/tresty/logika.ts`
- `components/tresty/data.ts`
- nové soubory jen v `components/tresty/`
- `components/employee/MyRewards.tsx`
- `components/widgety/oblasti/moje-smeny.tsx`
- `components/widgety/oblasti/dochazka.tsx` (Můj výdělek, Výplatní listina, CSV, DetailVyplatyOkno, UpravaMzdyOkno; `DatTrest` v něm zůstává beze změny)
- `components/employer/EmployeeProfile.tsx` (Výplata · tento měsíc; montáž `TrestyClena` nechat, jak je)
- `lib/widgety/katalog/dochazka.ts`, `lib/widgety/katalog/moje-smeny.ts`
- `locales/{en,de,sk,pl}/widgety.penize-vyplaty.json`
- testy/sondy: `scripts/testy/k86-tresty-z.ts`, `scripts/testy/k84-vyplaty.ts`, `scripts/sondy/k86-tresty-z.mjs`, `scripts/sondy/k84-vyplaty.mjs` (+ nová sonda `scripts/sondy/k96-penize-z.mjs`)

### Nikdo z UI nemění (jádro)

`lib/trestyPenize.ts`, `lib/trestyPenizeDb.ts`, `lib/tresty.ts`, `lib/dochazkaPrehled.ts`, `app/api/**`, `lib/demo/**`,
`components/tresty-penize/data.ts`, `locales/*/widgety.json`, `lib/i18n/slovniky.ts`, `scripts/testy/k88-pravni-tresty.ts`,
`scripts/testy/k96-tresty-penize.ts`. Když UI potřebuje změnu jádra, napíše to do výsledku (ne do souboru).
`scripts/testy/k88-pravni-tresty.ts` hlídá regexem `dochazka.tsx` (okno Prémie a srážky: `t('Nenároková prémie')`, `t('Mzda / ostatní')`,
`druh: druh === 'premie' ? typPremie : undefined`) a `odmeny.tsx` (`useMankaNavrhu(`, věta o dohodě o odpovědnosti) — tyhle řádky zachovat.
