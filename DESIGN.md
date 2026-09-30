# Managero — DESIGN.md (v2, „Managero 2“)

Vizuální systém zachycený z kódu (app/globals.css, components/ui). Jedna
aplikace, tři prostředí: administrace, TO GO/kiosk, Managero client — vše
mluví jedním jazykem. Verze 2 vznikla po redesignu celé aplikace: místo
skla a devíti druhů karet jsou tři vrstvy ploch, tři rádiusy, jedna
typografická škála a jedna sada stavových barev.

## Tón

Světlé, klidné, papírově zelenkavé pozadí s jemným zrnem. Obsah leží na
bílých kartách s měkkým stínem; uvnitř karet jsou „jamky“ (well) — tónované
plochy bez stínu. Jedna limetková akce na obrazovce; tmavá inkoustová pro
vybraný stav a sekundární akce. Sklo (blur) zůstává jen na plovoucí liště,
docku a topbaru, nikde jinde.

## Tokeny (app/globals.css, `:root`)

- Pozadí `--bg #F3F4F0` + `--bg-gradient` (dvě radiální světla). Zrno přes
  celou stránku (`body::after`), vypíná se při `prefers-reduced-transparency`
  a v tisku.
- Inkoust `--ink #16181A`; sekundární text `black/55–70`, meta `black/60`.
- Limetka `--lime #C8F542` (vždy tmavý text na ní); limetkový text na světlém
  podkladu ztmavený na `#3E5406`/`#5B7A08`.
- Plochy: `--surface #fff`, `--surface-line` (7 % inkoustu), `--well`
  (3,5 %), stíny `--shadow-card` / `--shadow-float` / `--shadow-modal`.
- Rádiusy — tři a dost: `--r-lg 20px` (karta, modál), `--r-md 14px` (pole,
  dlaždice, řádek), `--r-sm 10px` (drobnosti), `--r-chip` kulatý. Tailwind
  `rounded-3xl/2xl/xl` na ně míří (tailwind.config.js).
- Stavové barvy, jedna sada pro chipy, panely, hlášky i text:
  `--ok`, `--wait`, `--bad`, `--info`, `--muted`, vždy dvojice `-bg` / `-ink`.
- Tmavý motiv: přemapování týchž tokenů pod `[data-theme="dark"]`;
  hostovská část se připíná na světlý.

## Vrstvy ploch (CSS třídy)

| Třída | Použití |
|---|---|
| `.card` (alias `.glass-card`) | bílá karta se stínem — obsahová jednotka obrazovky |
| `.card-accent` / `.card-wait` / `.card-danger` / `.card-info` | tónovaná karta jen pro výpadek nebo chybějící uzávěrku (danger), nejvýš jedna na obrazovce; fronty („Čeká na tebe“) jsou bílá karta s chipem |
| `.well` | jamka uvnitř karty: sloupec kanbanu, pole formuláře v modálu, kód k zkopírování |
| `.note` + `note-danger/wait/info/ok` | inline hláška (chyba, čeká, info); nikdy ručně `bg-red-500/10` |
| `.glass` | tónovaný povrch bez bluru (starší kód); `.glass-strong` blur jen pro plovoucí chrome |
| `.list` + `.list-row` (+ `.list-row-tap`) | seznam v jedné kartě, linky mezi řádky kreslí `.list` |

Karty v kartách jsou zakázané — uvnitř karty je jamka nebo seznam.

## Typografická škála

Písmo **Geist** (balíček `geist`, `--font-geist-sans`), kódy kartiček a kuponů
**Geist Mono**. Pět velikostí a dost:

- `.t-page` 28 px bold (jediný h1 na obrazovce; kreslí ho `PageHeader`)
- `.t-section` 18 px semibold (h2 sekce; kreslí `Section`)
- `.t-card` 15 px semibold (titulek karty, dlaždice, modálu)
- `.t-meta` 13 px, 60 % inkoustu (podtitulky, meta řádky)
- `.t-label` 11 px caps, tracking 0.08em (štítek nad blokem, ne popisek pole)
- Popisky polí `.field-label` 13 px medium, bez verzálek.

Čísla `tabular-nums`; odstavce `text-wrap: pretty`; minimum písma 11 px
(hlídá `scripts/check-contrast-classes.mjs`).

## Ovládací prvky

- Pole: jedna třída `.field` (bílé, 14px rádius, limetkový focus ring).
  Ikonové pole doplní odsazení jako `!pl-10` — `.field` sedí v
  `@layer components`, takže běžné utility přebije jen s `!`.
- Tlačítka: `<Button>` z `components/ui`, nebo třídy `.btn` +
  `btn-accent` (limetková, jediná hlavní) / `btn-primary` (tmavá) /
  `btn-secondary` (tónovaná) / `btn-ghost`; výšky `btn-sm` 36, základ 44,
  `btn-lg` 48. Ručně psané pilulky `rounded-full bg-[#16181A] …` jsou
  zakázané.
- Chipy stavu: `.chip` + `chip-ok/wait/bad/info/muted/ink`, `chip-sm`.
- Přepínač pohledu: `Segmented` (tmavá pilulka klouže, `aria-selected`,
  vždy jeden řádek, co se nevejde, posouvá se do strany).
- Statistiky: `Stat` / `StatRow` (štítek `.t-label`, číslo 28 px tabular).

## Komponenty (components/ui)

Než něco napíšeš znovu, podívej se sem. Tenhle seznam byl chvíli o devět
kusů pozadu a to je nejjistější způsob, jak vznikne desátá podoba téhož.

**Rozvržení a text:** PageHeader (title/subtitle/primary/secondary/aside/
menu), Section (t-section + jedna akce vpravo), Card/Well, Stat/StatRow,
Chip, ListRow, Avatar (emoji → iniciály z `name` → silueta; iniciály počítá
`inicialy()` z `components/ui/Avatar.tsx`, jinou variantu nepiš). Stojí-li
jméno vedle kruhu, předej ho v `name` a kruh je pro odečítač skrytý; osamocený
avatar dostane `title`, který se stane jeho přístupným jménem. Lokální
`Initials` v `components/client/ClientShell.tsx` je starší duplikát, nový kód
ho nepoužívá.

**Ovládání:** Button, Segmented (vždy jeden posuvný řádek — viz „Posuvný
pás a rozbalovací panely"), Menu (roste z tlačítka, `pop-in` 160 ms)
a z něj vytažené `MenuPanel` + `MenuItemButton` pro panel, který z tlačítka
neroste (kontextové menu widgetu vypadá přesně jako „···"),
Field/Label/Input/Select/Textarea, SearchField (poslední hledání, návrhy,
klávesnice), Modal (sm/md/lg + `sheet`), Switch/SwitchRow.

**Toast s akcí:** `action={{ label: 'Vrátit', onClick }}` přidá tlačítko —
bílé a podtržené, ne limetkové (limetka na obrazovce už je) — a toast pak
drží 6 s místo 3,6 s, aby se na něj dalo dosáhnout. Pod ukazatelem,
s fokusem uvnitř a na skryté kartě se odpočet zastaví. Kdo ukazuje stejný
text dvakrát po sobě („Widget odebrán" u dvou widgetů), dá každému
zobrazení nové `id`, jinak druhý toast dostane jen zbytek času prvního.
Stojí nad plovoucí lištou, když nějaká je (`--lista-vyska`).

**Kusy z kol 68–69** — každý nahradil tři až devět ručních kopií:

| Kus | Kdy a jak |
|---|---|
| `Switch`, `SwitchRow` | nastavení, které platí hned po přepnutí. Limetka bez záře je stav, do pravidla jedné limetky se nepočítá. Zakázaný je `aria-disabled`, ne `disabled` — prohlížeč by zakázané tlačítko odfokusoval a klávesnice by po každém uložení začínala od začátku stránky. `SwitchRow` je `<li>` do `.list` v jedné kartě, ne vlastní box |
| `Badge` | odznak počtu na navigaci a dlaždici: inkoust s limetkovým číslem, nad devět `9+`, při nule se nekreslí. `wait` jen pro varování, `bad` pro vlajku. `label` je celá věta pro odečítač — „9+" samo nic neříká |
| `PersonChip` | člověk jako pilulka (avatar, jméno, krátký údaj `meta`); tón nese stav (`ok` = právě na směně). Není tlačítko — proklik dodá obal |
| `Checklist` | kroky s odškrtnutím v `.list` („První kroky", napojení služeb). Hotový krok = limetkové kolečko s fajfkou a tlumený text, **bez přeškrtnutí** — hotové nemá vypadat jako smazané. Počet „2/4" patří do titulku karty |
| `MonthNav` (+ `posunMesic`, `nazevMesice`) | ‹ září 2026 › na obrazovkách jednoho měsíce; `min`/`max` zamknou šipku na kraji, název má pevnou šířku, ať šipky neuskakují |
| `BarSpark` | sloupky bez os pro tvar týdne; nula je dvoupixelová čárka, `null` = den bez dat (místo zůstane prázdné), `surface="ink"` na inkoustové ploše. Hodnoty čte odečítač ze skrytého seznamu |
| `PlovouciLista` | inkoustová pilulka u spodní hrany, na telefonu nad dokem; základ `BulkBar` i lišty úprav plochy. Zapisuje `--lista-vyska`, ze které si toast bere odsazení |
| `Dock` | spodní dok na telefonu — jeden pro administraci, zaměstnance i Managero client, odznaky přes `Badge`, poslední „Více" otevře list. Importuje se z `components/ui/Dock` (v `index.ts` není) |

**Stavy obrazovky:** EmptyState, Skeleton/PageSkeleton (shimmer),
ErrorState (třetí poctivý stav), ErrorBoundary (pád sekce nevybílí
aplikaci), `useLoad` (data + chyba + `reload` na jednom místě).

**Hromadné akce:** BulkBar, SelectBox, ApproveAllBar, `useSelection`,
`runBulk`.

**Nápovědy:** Hint (trvale zavřít nebo vypnout všechny).

Klient navíc: StatCard, SectionTitle, TableMap.

## Sdílené kusy v `lib/`

- `pragueTime` — každý „jaký je den" a „kolik je hodin". Hlídá `check-time`.
- `czech` — skloňování po číslovce. Hlídá `check-czech`.
- `useModal` — okno: Escape, past na fokus, návrat fokusu, zámek posouvání.
- `usePopover` — rozbalovací panel: Escape, kliknutí mimo, šipky, návrat fokusu.
- `useResultKeys` — našeptávač, kde si seznam výsledků kreslí volající.
- `clickable` — karta, která nemůže být `<button>`, protože nese odkazy.

## Vzory obrazovek

- Každá obrazovka: `PageHeader` (h1 + podtitulek, vpravo přepínač a jedna
  limetková akce), pak karty. Šířka obsahu: seznamové obrazovky `max-w-4xl`,
  datové (finance, docházka, sklad) plná šířka `max-w-7xl`.
- Seznam = jedna karta s `.list`; ne jedna karta na položku (Úkoly, Nápady,
  Průběhy). Dlaždice (návody, kategorie skladu) max. 2 sloupce vedle railu.
- „Čeká na tebe“: bílá karta (ne `card-wait`), stav nese jantarový chip
  s počtem u titulku („5 čeká“, odečítači celá věta přes `czCount`),
  prokliky na fronty jsou `Button secondary sm`. Tónovaná karta zabrala na
  telefonu přes polovinu okna; zůstává jen pro výpadek nebo chybějící
  uzávěrku (danger), nejvýš jedna na obrazovce.
- Kanban: sloupce `well`, karty `card` s `hover:shadow-float`.
- Navigace: desktop levý rail (administrace) nebo horní záložky (client);
  mobil spodní dock `dock-strong`.
- Destruktivní akce vždy s confirm; hlášky přes `.note`.

## Pohyb a přístupnost

Křivky `--ease-out` pro vstupy/výstupy, `--ease-in-out` pro pohyb po
obrazovce, `--ease-drawer` pro zásuvky. Doby: stisk 120 ms, změna stavu
220 ms, příchod plochy 340 ms; menu ≤ 160 ms; nic přes 300 ms mimo modály.
Vstup z 0.96 s opacitou, nikdy ze `scale(0)`. `active:scale-[0.97]` globálně
na `button`. Hover jen pod kurzorem (`future.hoverOnlyWhenSupported`).
Dotykové cíle ≥ 36 px (`tap-target(-sm)`), `aria-pressed` na přepínačích,
`role=status` na toastech, `role=dialog` + fokus trap (`useModal`).
`prefers-reduced-motion`: pohyb pryč, opacita zůstává;
`prefers-reduced-transparency`: blur i zrno pryč; `prefers-contrast: more`:
tvrdší okraje.

## Ověření

Před pushem: `npm run typecheck`, `npm test` (podle **návratového kódu**,
ne podle hledání „✗" ve výstupu — tvrdý pád jinak vypadá jako nula chyb),
`npm run build` a všechny kontroly ze `scripts/check-*.mjs`
(`for f in scripts/check-*.mjs; do node $f || echo FAIL $f; done`) —
na konci kola 69 jich je 34:

`check-admin-auth` · `check-contrast-classes` · `check-czech` ·
`check-dark-classes` · `check-dead-ends` · `check-decimal-inputs` ·
`check-draft-safety` · `check-email` · `check-fetch-ok` ·
`check-floating-glass` · `check-forms` · `check-generic-copy` ·
`check-hledani` · `check-ics` · `check-labels` · `check-lazy-views` ·
`check-mobile-align` · `check-modal-guard` · `check-modals` · `check-money` ·
`check-offline-cache` · `check-opacity-steps` · `check-palette` ·
`check-shadow-var` · `check-sheet` · `check-silent-load` ·
`check-silent-mutation` · `check-sql` · `check-status-colors` ·
`check-test-imports` · `check-time` · `check-transitions` ·
`check-week-start` · `check-width-clash`

Kontrola s ráčnou (`BASELINE`) hlásí i to, že nálezů **ubylo** — pak se
`BASELINE` sníží, jinak by se získaný prostor potichu zase zaplnil.

Vizuálně: Playwright přes 62 obrazovek (46 administrace, 15 klient,
sdílený odkaz) na
1280 a 390 px, se sweepem přetečení, věčných skeletonů, prázdných stránek
a dotykových cílů — vše 0. K tomu sondy na klávesnici, hromadné akce
a filtry.

**Sondy plochy widgetů** (`scripts/sondy/`, Playwright přes
`playwright-core`). Rámec hlídá sedm sond kola 68: `k68-plocha` (podržení,
vlnění, tah, Vrátit, galerie, nastavení, omezený pohyb, 500 na jednom
widgetu), `k68-telefon` (390 px, dva S vedle sebe, tah prstem, lišta nad
dokem), `k68-klavesnice`, `k68-opravneni` (widget bez klíče není vidět
a jeho endpoint se **nezavolá ani jednou**, ani před načtením oprávnění;
zamčené rozložení nepošle PUT), `k68-vychozi` (Uložit jako výchozí,
Nastavení → Stránky bez datových dotazů), `k68-design` (žádná osiřelá
buňka na pěti šířkách, jeden h1, typografická řada, tmavý režim)
a `k68-fyzika` (fyzika tahu: malá karta nad velkou nepřeskládává dokola,
409 během tahu tah zruší, rychlá klepnutí, zápis při odchodu). Každý balík stránek kola 69 má svoji
sondu podle šablony z „Jak přidat stránku nebo widget": `k69-b1` (rozvrh
a směny), `k69-b2` (docházka a tým), `k69-b3` (sklad), `k69-b4` (receptury
a menu), `k69-b5a` (uzávěrky), `k69-b5b` (finance, TO GO, všechny podniky),
`k69-b6a` (úkoly, plánování, nápady), `k69-b6b` (postupy a návody), `k69-b7`
(odměny), `k69-b8` (Managero client a akce), `k69-b9` (tablet, chat,
nastavení). `k69-mereni-1/2/3` (společné jádro `k69-mereni-jadro.mjs`, po třetinách kvůli stropu jedné sondy) projdou každou aktivní stránku na počítači
i telefonu, v klidu i v úpravách, s výchozím rozložením z aplikace (to, co
uvidí nový podnik), uloží snímky do `scripts/sondy/shots/` a tvrdí jeden h1,
nula přetečení a nejvýš jednu limetku. Snímky se pak měří pixelově — tónované
plochy pod ~6 % obsahu, inkoust do 10 % — mimo CI, protože tam není Python
s PIL a hranice tónů je řád, ne přesné číslo.

Sondy sdílí podvrh ze `scripts/sondy/k68-spolecne.mjs` (není sonda):
stavový `/api/rozlozeni` (GET vrátí naposledy uložené, PUT si tělo zapíše
do `stav.puty`), fixtury podle cesty API a gesta `podrzMysi`,
`podrzPrstem`, `tahniMysi`, `tahniPrstem`. Sondy tvrdí, co pošle UI, a to
jde tvrdit jen proti jednomu serveru — proto podvrh není v každé sondě
jiný. Spouštění (`scripts/sondy/README.md`):

    npm run build && npx next start -p 3000 &
    npm run sondy                          # seznam ZELENE ve spust.mjs
    npm run sondy -- k68-plocha k69-b3     # jen vybrané
    npm run sondy -- --vse                 # i rozpracované

Server i sondy musí mít stejný `NEXTAUTH_SECRET` (sondy si podle něj razí
session cookie), Chromium se bere ze `SONDY_CHROMIUM`. Adresa
`http://localhost:3000` je v sondách napevno; kdo pouští sondy proti
serveru na jiném portu (souběžná práce, kopie stromu), přepíše ji v kopii,
ne v repu.

**Chyba se ověřuje výpadkem, ne úvahou.** Sonda, která vrátí na vybrané
GETy 500 (`probe-k15`, `probe-k18`), je jediný způsob, jak zjistit, že se
obrazovka po odmítnutí serveru přizná. Odpověď 500 se totiž doručí
**úspěšně** — samotný `catch` ji nikdy neuvidí.

**Prázdná obrazovka není ověřená obrazovka.** Zhruba polovina nálezů
v téhle aplikaci se ukázala až s daty; když k obrazovce není fixture,
fotí se prázdno a nic se nedozvíš. Fixtures musí mít tvar skutečné
odpovědi API — ne ten, který se zdá rozumný.

## Texty tlačítek

**„Zrušit" opouští rozdělanou akci, „Zavřít" zavírá náhled.** Kde je
formulář nebo se něco chystá provést, patří *Zrušit* — člověk přichází
o to, co zadal. Kde se jen dívá (QR k tisku, nabídka na vyšší plán,
panel hledání), patří *Zavřít*, protože se neruší nic.

„Zpět" je na krok v posloupnosti, ne na zavření okna.

Potvrzení pojmenuje, co udělá: *Přidat stůl*, *Uložit*, *Zkopírovat* —
ne *OK*. Člověk pak nemusí luštit z nadpisu, co se stane.

## Okna

Jedna komponenta — `Modal` z `components/ui` — a **tři velikosti**:

- `sm` — potvrzení a krátký formulář (dvě tři pole)
- `md` — běžné okno, výchozí
- `lg` — tabulka, náhled nebo editor

Nic mezi tím. Dokud si každé okno šířku odhadlo samo, bylo jich v aplikaci
šest a „potvrdit smazání" vypadalo pokaždé jinak.

Dlouhý obsah, kde je palec u spodní hrany (detail uzávěrky, výběr
z dlouhého seznamu), dostane `sheet`: na telefonu vyjede zdola a drží se
spodního kraje, na monitoru zůstává vystředěné okno.

Okna se převádějí postupně; `scripts/check-modals.mjs` je ráčna, která
hlídá, aby ručně psaných nepřibývalo.

### Zavření nesmí vzít s sebou rozepsaný text

Escape a klik vedle okna jsou nejčastější omyl, jaký v aplikaci jde udělat.
Do kola 34 byly neodvolatelné: okno zmizelo a s ním i rozepsané oznámení pro
celý tým nebo směrnice na půl stránky. Sonda to změřila na čtyřech oknech,
kam se dá dojít — ztratila text ve čtyřech ze čtyř.

Rozlišují se **uklepnutí** a **mířená akce**:

| Cesta ven | Co znamená | Co se stane, když je rozepsáno |
|---|---|---|
| Escape, klik vedle okna | uživatel na nic nemířil | okno zůstane a **zeptá se** |
| křížek | „chci pryč", ne „zahoď to" | okno zůstane a **zeptá se** |
| Zrušit, Zahodit | na tlačítku je napsané, co dělá | **zavře bez ptaní** |

Ptát se podruhé na to, co uživatel právě vyslovil tlačítkem, je jen práce
navíc — proto se „Zrušit" neptá. A druhý Escape nad otevřenou otázkou
znamená „zpět k úpravám", ne „tak teda zahoď": kdyby procházel skrz, zahodil
by přesně to, na co se okno ptá.

Rozhodnutí je v `lib/modalClose.ts` (a proměřené testy v `scripts/test-units.ts`),
chování v `lib/useModal.ts`, otázka v `components/ui/DiscardGuard.tsx`.
`scripts/check-modal-guard.mjs` hlídá, že žádný ručně skládaný panel
pojistku nevynechá.

**Rozepsané je jen psaný text** — textarea a textová pole. Zaškrtávátko,
přepínač ani výběr z nabídky ne: takové ovládání se v aplikaci skoro vždy
ukládá hned při kliknutí, takže by okno hlásilo rozepsáno nad tím, co je
dávno uložené. Hledání a filtry uvnitř okna se označí `data-transient`
(`type="search"` je vyloučený rovnou) — filtr není obsah. A kdo text napíše
a zase smaže, nic neztrácí: okno se zavře bez ptaní.

Dvě věci, na kterých to při psaní stálo a stojí za zapamatování:

- **Klik vedle okna se musí zastavit na dokumentu**, ne až ve stavu
  komponenty. Zavírání drží volající (`onClick={onClose}` na překryvu), takže
  pouhé přepnutí stavu by okno stejně zavřelo. Posluchač v zachytávací fázi
  událost zastaví dřív, než ji React uvidí.
- **Hodnota pole se nesmí číst během té události.** Posluchač běží dřív než
  komponenta, takže `value` v tu chvíli drží, co napsal prohlížeč, ne to, co
  React přijme. U pole, které si vstup upraví nebo odmítne, by se tak dalo
  „rozepsáno" zhasnout nad textem, který na obrazovce pořád je. Přepočítává
  se až po Reactu.

## Prodejní stránka (landing)

Jediná plocha s vlastním vizuálním jazykem: světlé „tekuté sklo" — panely
`.lgx`/`.lgx-strong` s rozmazáním a nasycením podkladu, barevné skvrny
`.lg-blob` pod nimi a dokumentární fotografie podniků
(`public/brand/landing/foto`, jedna vygenerovaná kampaň, ne fotobanka).
Aplikace sama zůstává u klidnějšího `.glass-card`.

### Produkt napřed: živá ukázka a nahrávky (kolo 75)

Od kola 75 nese stránku produkt, ne fotka. Fotografie (níž) zůstaly jako
doplněk, který říká „je to pro mě?"; že to funguje, říká aplikace sama.

- **Hero je ukázka, kterou si člověk naklikne.** `components/landing/ukazka`
  vkládá `/demo` (skutečná aplikace proti mock serveru v prohlížeči, viz
  `lib/demo/README.md`) jako `<iframe>` do rámu zařízení. Z aplikace se do
  balíku stránky nenaimportuje nic: izolaci stylů i skriptů dělá prohlížeč a
  stránka drží jen rám, ovládání a coach marks.
- **Plakát je v HTML hned, ukázka přijde po klidu.** Poster (skutečný snímek,
  `public/brand/landing/rec/hero-prehled-*.webp`) je LCP a zůstává pod
  iframem. `/demo` se načte, až je rám vidět a prohlížeč je v klidu, nebo hned při
  prvním dotyku. S vypnutým pohybem a na úsporném přenosu (`saveData`, 2g) se
  nespustí sama, čeká na tlačítko. Rám má pevný poměr stran a jeviště pevné
  výšky (`.ld-stage`), takže přepnutí scény, role nebo zařízení nic neposune
  (hlídá `skok`, CLS `k75-landing`).
- **Komunikace je kontrakt, ne sdílený stav.** Stránka posílá `demo-scena`,
  `demo-reset`, `demo-ping` a čeká na `demo-pripraveno`; přijímá jen z vlastního
  původu a jen z okna toho iframe. `demo-akce` překládá na větu
  (`REAKCE_NA_AKCI`), kterou řekne i odečítači (`role="status"`).
- **Coach marks hledají prvek podle jména, ne podle souřadnic.** Kurzor a bublina
  „klikni sem" se berou z polohy prvku uvnitř ukázky (stejný původ), takže
  přežijí změnu rozložení aplikace; když prvek zmizí, zmizí i kurzor a nikdy
  neukazuje do prázdna. Krok splní kliknutí do prvku (pozor: `e.target` patří do
  jiného okna, `instanceof Node` by tu vždy selhal). Kroky jsou jen pro dvojice
  scéna a role, které mají příběh.
- **Nahrávky jsou z téže ukázky.** `scripts/nahravky/nahraj.mjs` (Playwright
  `recordVideo`, viditelný kurzor a ripple kliku vložené init skriptem, myš po
  zakřivené dráze, čas měřený hodinami) vyrobí pět smyček po 8 až 14 s
  (mp4 h264, webm vp9, poster webp, 720p, bez zvuku, každé do 1,5 MB) do
  `public/brand/landing/rec` a rozměry zapíše do `nahravky.generated.ts`.
  Po změně vzhledu aplikace: `npm run landing:nahravky` proti běžícímu buildu.
  Ve stránce jsou smyčky (`SmyckaVideo`) líné (stahují se těsně před příchodem do
  obrazu a zastaví se mimo něj), s vypnutým pohybem zůstane poster, a jdou
  zastavit (pravidlo 2.2.2).
- **Pravidla textu hlídá `check-landing-obsah`:** žádné vymyšlené hodnocení,
  citace ani čísla o zákaznících, žádné pomlčky jako interpunkce, čísla přes
  `lib/czech.ts`. Tvrdí se jen to, co o produktu platí (30 dní, tým zdarma,
  ceny z `lib/plan`). „Za 5 minut" se netvrdí, dokud průvodce prvním nastavením
  není změřený. Roční sleva se počítá (12 × měsíc minus rok), přeškrtnutá
  „srovnávací" cena nikdy nikdo neúčtovala a zmizela.
- **Jedna plná limetka v kterémkoli výřezu.** Hero tlačítko, karta Pro
  a závěrečná výzva jsou od sebe dost daleko; patička má inkoustové tlačítko.
  Limetka uvnitř ukázky (jiný dokument) se nepočítá.
- **Nový CSS mimo globals.css:** `components/landing/landing.css` (předpona `ld-`).

Zásady, které přestavba v kole 35 zafixovala:

- **Landing je světlý ostrov.** Krémové podklady nemají tmavou variantu;
  `ForceLight` volbu uživatele jen odloží, v aplikaci platí dál (stejný
  mechanismus jako Managero client).
- **Obsah nese skutečný produkt, ne dekorace.** Skleněné karty ukazují
  momenty z aplikace (směna, minimum ve skladu, uzávěrka) a žádná čísla,
  loga zákazníků ani recenze, které nemáme. Tři čísla nahoře jsou fakta
  o produktu, ne metriky.
- **Animace je bonus, ne podmínka.** `Reveal` posílá obsah ze serveru
  viditelný a schovává ho až v prohlížeči těsně před vykreslením — bez
  JavaScriptu, s `prefers-reduced-motion` nebo po pádu skriptu je všechno
  vidět hned. První verze to dělala obráceně (opacity 0 ze serveru) a celé
  sekce bez JS neexistovaly; chytil to snímek celé stránky, ne úvaha.
- **Těžké věci líně a s náhradou.** Eager se načítá jediná fotka — ta
  v hero; zbylých sedm až u své sekce, a do té doby na jejich místě leží
  rozmazaný šestnáctipixelový náhled. Paralaxa jede přes scroll-driven
  animaci v CSS: kdo ji neumí, dostane fotku, která stojí. Stránka nikdy
  nečeká na ozdobu a neplatí za ni kilobajty skriptu.
- **Dekorace nepřináší vlastní paletu.** Značka je krém, inkoust a limetka
  plus pět stavových tónů — a to platí i pro skvrny pod sklem a pro
  vygenerované objekty. V první verzi tu byla broskvová a modrá skvrna
  a syrová tailwindová `amber-400` v ukázkových tečkách; obojí šlo ven.
  Tečka, která na prodejní stránce hlásí „dochází mléko", má přesně ten
  tón, který uživatel uvidí uvnitř aplikace (`.dot-ok` / `.dot-wait` /
  `.dot-muted` nad `--ok` / `--wait` / `--muted`).

### Fotografie podniků (a proč tu nejsou 3D objekty)

Hero prodejní stránky prošlo třemi podobami: vystřižené clay rendery
položené přes video, pak živá WebGL scéna s procedurálním hrnkem, a teď
fotografie. Každá další verze byla technicky lepší než ta předchozí a
prodávala hůř, dokud nepřišla fotka.

Důvod je prostý: návštěvník téhle stránky nekupuje hrnek. Kupuje klid
v provozu — a ten je vidět na lidech v zástěrách, ne na renderu. Fotka
podniku navíc odpoví na otázku „je to vůbec pro mě?" dřív, než kdo dočte
nadpis; pás osmi podniků pod hero to řekne rychleji než věta „pro kavárny,
restaurace a bary" nad ním.

Pravidla, která fotky drží pohromadě:

- **Jedna kampaň, ne sbírka.** Všech osm vzniklo z jednoho zadání: 35 mm
  dokument, denní světlo (bar večerní), teplá tlumená paleta krém – dub –
  matná čerň, malá hloubka ostrosti, zrno. Fotky z různých zdrojů se poznají
  na první pohled a stránka pak vypadá jako koláž z fotobanky.
- **Práce, ne pózování.** Nikdo se nedívá do objektivu, nikdo nedrží produkt
  k fotoaparátu. Ruce v páce, kuchař u výdeje, čtyři lidi před otevřením.
- **Žádná loga, žádné nápisy, žádné jméno podniku.** Kdyby na fotce byla
  cedule, stránka by tvrdila, že ten podnik je zákazník. Patička to říká
  výslovně: fotky jsou ilustrační, obrazovky aplikace skutečné.
- **Fotka má rozměr, náhled a popis.** `components/landing/foto.ts` nese
  u každé `w`/`h` (jinak stránka při načtení poskočí), šestnáctipixelový
  rozmazaný náhled v datové adrese a `alt`, který říká, co na fotce je.
  Eager se načítá jediná — ta v hero.
- **Text na fotce potřebuje změřené ztmavení.** Viz níž; tohle je to
  pravidlo, které se nejsnáz poruší.

### Rozepsané přežije i odchod na jinou záložku

Kolo 34 ohlídalo okna. Formulářů, které sedí přímo na stránce, je ale 29
a ty zůstaly po staru: záložky v aplikaci jsou `?view=`, takže přechod
komponentu odmontuje. Napsat úkol, mrknout na rozvrh, vrátit se — a psát
znovu. Naměřeno 2 ze 2 dosažitelných cílů.

Koncept se drží v `sessionStorage` (`lib/useDraft.ts`, rozhodování zvlášť
v `lib/draft.ts`): přežije přechod i obnovení stránky, ale ne zavření
prohlížeče. Koncept z minulého týdne, který vyskočí v úplně jiné situaci,
je horší než žádný.

Tři věci, na kterých to stojí — všechny tři přišly z měření, ne z úvahy:

- **Koncept, který není vidět, je totéž co ztracený.** První verze ho
  poctivě uložila, jenže formulář po návratu zůstal zavřený. Uživatel
  nevidí stopu po tom, co napsal, a napíše to znovu. Proto hook hlásí
  `cekaKoncept` a formulář se otevře sám.
- **Obnovení se přizná.** Tiše předvyplněný formulář je vlastní malá lež:
  uživatel nepozná, jestli to napsal on, nebo se to vzalo odjinud. Nad
  formulářem je `<DraftNote>` s jednou větou a tlačítkem *Zahodit*.
- **Výchozí hodnota není rozepsaný text.** Formulář má předvolby (priorita
  `medium`, typ volna `vacation`) a ty jsou neprázdné samy o sobě. První
  verze se ptala „nese to obsah?", takže i po zahození zůstal v úložišti
  prázdný koncept navěky. Správná otázka je „liší se to od prázdného
  formuláře?".

Uložený koncept se navíc skládá **na** výchozí tvar, ne naopak: formulář se
během vývoje mění a koncept z minulého týdne o tom neví. Berou se jen
klíče, které výchozí tvar zná, a jen když sedí typ.

Měří `probe-koncept.mjs` — a měří celý průchod, ne jen uložení.

**Kde koncept být nesmí.** Heslo, token, kód ani číslo karty se do úložiště
nedávají: uchovat rozepsané přihlášení není laskavost, ale bezpečnostní
chyba — tajemství by leželo v prohlížeči déle, než musí, a přečetl by ho
každý skript na té stránce. Formuláře přihlášení a registrace koncept
nemají a mít nebudou; hlídá `scripts/check-draft-safety.mjs`, ne dobrý
úmysl.

**Kde koncept nedává smysl.** Formulář, který **upravuje existující
záznam** (profil podniku, položka skladu), koncept nedostane. Obnovit nad
čerstvě načtenými daty týden starou kopii není záchrana práce, ale tichý
přepis toho, co mezitím změnil někdo jiný. Proto `upravujeSe: true`
znamená „neobnovuj".

**A jedna výjimka z přiznání.** Okno zprávy v chatu koncept má, ale
`<DraftNote>` nevykresluje. Poznámka patří formuláři, který se sám
předvyplní a tím překvapí; rozepsaná zpráva je přesně tam, kde ji člověk
nechal, ve stejném kanálu a nad tlačítkem Odeslat — mluví sama za sebe
a banner nad ní by byl šum. Koncept je vázaný na kanál (`chat-<id>`), ne
na chat jako celek.

## Barvy: stav versus kategorie

Paleta má **pět stavových tónů** — `ok`, `wait`, `bad`, `info`, `muted` —
a limetku jako jediný akcent. Stav se nesmí sdělovat ničím jiným: dokud
bylo „Ke schválení" na jedné obrazovce oranžové a na druhé žluté, hledal
v tom člověk rozdíl, který tam nebyl.

Na odlišení **kategorií** (typy směn, dostupnosti) stavové tóny nestačí
a nesmí se na to používat — červená znamená problém, ne „třetí typ
směny". Proto je v `globals.css` samostatná řada `.cat-1` až `.cat-6`
plus `.cat-dot-1..6` na tečky. Používá se **jen k rozlišení**, nikdy ke
sdělení stavu, a je společná pro všechny obrazovky: „druhý typ směny"
vypadá v Rozvrhu stejně jako v Dostupnosti.

Hlídá `scripts/check-palette.mjs`.

### Stav se sděluje tokenem, ne odhadnutým odstínem

Paleta měla u každého stavu jen podklad (`--X-bg`) a text (`--X-ink`).
Plný odstín ani střední alfa v ní nebyly — a tak si je každé místo, které
potřebovalo plnou tečku, patnáctiprocentní podklad nebo obrys, vymyslelo
z Tailwindu. Naměřeno napříč 62 obrazovkami: **dvanáct různých červených
a deset jantarových pro dva významy.** „Zamítnuto" bylo na jedné obrazovce
`#DC2626`, na druhé `#EF4444` a na třetí `#B91C1C`. Přesně ten rozdíl, co
tam není a člověk ho v něm hledá.

Od kola 36 má každý stav v `globals.css` tón i v holých kanálech
(`--bad-rgb`, `--wait-rgb`, `--ok-rgb`, `--info-rgb` a jejich `-ink`
dvojčata), takže Tailwind si k němu umí domíchat průhlednost:

| dřív | teď |
|---|---|
| `bg-red-500` | `bg-bad` |
| `bg-red-500/15` | `bg-bad/15` |
| `text-red-600` | `text-bad-ink` |
| `border-amber-500/40` | `border-wait/40` |

`-ink` se navíc **v tmavém režimu převrací sám** — tailwindové
`text-red-600` zůstávalo tmavě červené i na tmavém podkladu, token ne.
Sjednocení proto zároveň spravilo kus tmavého režimu, aniž by se ho někdo
dotkl.

Dva detaily, které z toho plynou:

- **Pátý tón se nezavádí.** Žlutá `#FFD60A` nesla „připíchnuto, všimni si"
  ve čtyřech souborech. Významově je to `wait` — něco, co čeká na pozornost
  — a tam se sjednotila. Paleta má pět stavů a šestý si nepřidává.
- **Plocha, která je tmavá vždycky** (hromadný pruh, pás režimu s sebou),
  potřebuje tón posazený výš: `--bad-lift-rgb`. Je to tentýž odstín, jen
  světlejší, proto se v tmavém režimu nepřevrací.

Hlídá `scripts/check-status-colors.mjs`: syrový tailwindový odstín v komponentě
je tvrdá chyba, barevný hex mimo paletu je ráčna (nastaveno na 110).

**Druhá vrstva, dodělaná.** Ráčna držela 110 barevných hexů mimo paletu:
šest zelených (`#5B7A08`, `#3E5406`, `#4F6A07`, `#8FB811`, `#5B9E00`,
`#89AC16`) a tři modré pro tytéž významy. Každý z těch bloudících odstínů
měl význam, který paleta uměla — sjednotily se tedy **na** ni, ne naopak,
a vždy směrem k tmavšímu, takže kontrast jen rostl:

| co to znamenalo | kolik | sjednoceno na |
|---|---|---|
| text stavu info | 39 | `#0A5CC0` |
| limetkový inkoust | 28 | `#5B7A08` |
| akcentní zelená (tečka, zaškrtávátko, sloupec) | 17 | `#8FB811` |
| „připíchnuto" | 2 | `#92400E` (wait) |
| chybový stav (vlastní oranžová dvojice) | 3 | `#DC2626` / `#991B1B` (bad) |

**Z ráčny je tvrdá nula.** To je silnější než „nesmí přibývat": nová barva
mimo paletu CI rovnou zastaví.

Kontrola u toho dostala dvě zpřesnění, obě z vlastních falešných nálezů:
barva zmíněná **v komentáři** se nevykresluje, a **skoro bílá plocha** není
stavová barva (práh sytosti 0,25 → 0,3, světlosti 0,96 → 0,92).

### Past: přejmenování hexu odpojí přepis pro tmavý režim

Třída s pevným hexem v názvu (`text-[#5B7A08]`) má v `globals.css` dvojici
přepisů — jeden ztmavuje ve světlém režimu na normu, druhý převrací
v tmavém. **Ty přepisy jsou navázané na jméno třídy, tedy na tu hodnotu.**
Přejmenování hexu je tiše osiří: pravidlo zůstane v CSS a nikdy se
netrefí. Naměřeno na vlastní kůži — tmavý režim 21 → 25 po sjednocení
barev, aniž by se tmavého režimu kdokoli dotkl.

Pokusem o nápravu bylo převést těch 417 tříd na tokeny, které se převracejí
samy. **Bylo to horší: 25 → 100.** Tokeny neměly `!important`, takže je
přebila plošná pravidla pro tmavý režim, a ztratila se i úprava kontrastu
ve světlém. Správná a mnohem menší oprava byla přemapovat existující
přepisy na nová jména tříd: **výsledek 20**, tedy o jednu líp než před
celým úklidem.

Pravidlo z toho: **když se mění hodnota v názvu třídy, musí se s ní
přestěhovat i její přepisy** — a velký převod na tokeny se nedělá naslepo
v jednom kroku, protože co vypadá čistěji, může být měřitelně horší.

**A jeden nález, který měření uzavřelo jinak, než vypadal.** `cat-1`, `cat-2`
a `cat-4` jsou v hodnotách doslova stavové tóny (limetka, info modrá, wait
jantarová). „Druhý typ směny" má tedy stejnou modrou jako stav „info" — což
pravidlo nad tímhle odstavcem zakazuje. Napravit to znamená dát kategoriím
nové odstíny, tedy **rozšířit paletu**, a to je přesně to, co se dělat nemá.

Než se palety dotkne, ptá se `probe-kolize.mjs` na to podstatné: **potkají
se ty dvě věci vůbec na jedné obrazovce?** Naměřeno: kategorie jsou na
**3 z 51** obrazovek a na žádné z nich není zároveň stavový chip téže barvy.
**Nula kolizí.** Rozšiřovat paletu kvůli záměně, ke které nedochází, by bylo
horší než ji nechat být.

Zůstává to ale jako **nastražená past**: kdo přidá stavový chip na obrazovku
s typy směn, tu záměnu vyrobí. Před takovým krokem se sonda pouští znovu.

## Responzivní pravidla (mobil / tablet / desktop)

Ověřováno na šířkách 320, 390, 768, 1024, 1280 a 1440 px — nula
horizontálních přetečení a chyb v konzoli na všech obrazovkách.

- **Primární akce na mobilu přes celý řádek.** Dvojice hlavních tlačítek
  (např. Vygenerovat/Publikovat rozvrh) se pod `sm` skládá pod sebe,
  každé `w-full justify-center`; overflow menu `···` zůstává vedle
  posledního tlačítka, ne osiřelé na vlastním řádku.
- **Dvě stejně vypadající tlačítka vedle sebe nesmí znamenat různé věci.**
  Sekundární volba (Nevedeme) zůstává vlevo u obsahu, potvrzující akce
  (Uložit) se odděluje `ml-auto` doprava a při dirty stavu limetkou.
  Pozice + barva nesou význam, ne jen text.
- **Dlouhé seznamy řeší `SearchField`**, ne scrollování: klik nabídne
  předvolby (kategorie, dodavatelé, poslední hledání), psaní filtruje.
- **Přepínače pohledů** (`.seg-on`/`.seg-off`) při přetečení scrollují
  horizontálně uvnitř vlastního pásu, nikdy nerozbíjí stránku.
- **Hlavičková akce** (`PageHeader`) je na mobilu vpravo pod titulkem —
  jednotně na všech obrazovkách, jediná limetková akce na stránce.
- **Tablet (768–1024)**: postranní menu se zužuje na ikony, obsah drží
  dvousloupcové karty; kiosk běží na plné šířce s pilulkovou navigací.

## Oznámení a odznaky

Když něco čeká, musí to být vidět tam, kam se člověk dívá — ne až uvnitř
té sekce. Chat byl toho opakem: nepřečtené zprávy se počítaly jen ve svém
vlastním seznamu, takže jediný způsob, jak se o nich dozvědět, bylo chat
otevřít.

- **Odznak patří na navigaci, ne jen dovnitř.** Dolní dok i dlaždice
  v TO GO nesou počet u ikony; sekce bez odznaku znamená „nic nečeká".
- **Tvar odznaku je jeden.** Kulatý, tmavý s limetkovým číslem, prstenec
  v barvě pozadí, `tabular-nums`, nejmíň 11 px; přes devět `9+`.
  Oranžový odznak je vyhrazen varování (dochází zásoba), ne počtu.
- **Odznak sám nestačí, když jde o text.** Číslo řekne „tři", ale ne
  „od koho a co". Kde se to vejde, doplní ho karta s odesílatelem
  a úryvkem, která klepnutím otevře přímo tu věc — ne jen její seznam.
- **Proklik míří na konkrétní položku.** `navigate('chat', id)` otevře to
  vlákno; vysypat člověka na seznam, ve kterém musí hledat znovu, je
  polovina prokliku.

## Čas ve vláknech a záznamech

- **Den říká oddělovač, bublina říká hodinu.** Dlouhé vlákno dostane nad
  každým dnem čáru (`Dnes`, `Včera`, `pondělí 14. 4.`); zpráva pod ní pak
  píše jen `HH:MM`. Datum v obojím je totéž řečené dvakrát.
- **Všechno přes `lib/pragueTime`.** Den z hodin prohlížeče a den z Prahy
  se mezi půlnocí a druhou ranní liší — a obrazovka si pak sama odporuje
  („17:40" v bublině pod čarou „Včera"). Hlídá `check-time`.

## Klávesnice

Aplikace se ovládá u pultu jednou rukou, ale ve vedení na notebooku
klávesnicí. Když se uprostřed psaní musí sáhnout po myši, je to chyba.

- **Co se vyplňuje opakovaně, drží kontext.** Naskladnění osmi věcí
  z jedné bedny nesmí být osmkrát totéž nastavení: „Uložit a přidat další"
  nechá kategorii, jednotku i dodavatele a vyprázdní jen název a množství.
  Že se to opravdu uložilo, řekne řádek nad tlačítky.
- **Enter odesílá formulář.** Dialog s poli je `<form onSubmit>`, ne `<div>`
  s tlačítkem na `onClick`. Uvnitř `<form>` má každé tlačítko napsáno, čím
  je (`type="submit"` / `type="button"`) — jinak „Zrušit" formulář odešle.
  Hlídá `check-forms`.
- **Escape zavírá a vrací fokus.** Okno řeší `useModal`, rozbalovací panel
  `usePopover`. Obojí vrátí fokus na prvek, kterým se otevřelo; fokus na
  `<body>` znamená, že další Tab začíná od začátku stránky.
- **Šipky chodí po nabídce.** Menu, řazení a panel oznámení: ↓ ↑ po
  položkách, Home/End na kraje, ↓ na zavřeném tlačítku panel otevře.
- **Našeptávač s vlastním seznamem výsledků** (`lib/useResultKeys`): ↓ z pole
  skočí na první výsledek, ↑ z prvního se vrátí do pole, Escape zavře.
  `SearchField` řeší jen svoje vlastní návrhy; kde si seznam kreslí volající,
  patří sem tenhle hook.
- **Co se dá kliknout, musí jít i Tabem.** Nejlépe `<button>`. Když karta
  nese uvnitř další odkazy (a tlačítko v tlačítku je neplatné), použij
  `clickable()` z `lib/clickable` — dá `role="button"`, `tabIndex`
  a obsluhu Enteru i mezerníku.
- **Skrytá akce na pravé tlačítko myši není akce.** Co jde přes
  `onContextMenu`, musí mít i klávesu a viditelné tlačítko.

## Ořezané seznamy

Strop kvůli výkonu je v pořádku. Tichý strop není.

- **Oříznutý seznam to musí říct.** „Zobrazeno prvních 200 z 247" nebo
  „…a dalších 12". Podnik s 250 položkami menu jich padesát nikdy neviděl
  a nikde se to nedozvěděl.
- **Výběr se pozná z nadpisu.** „Hotové — posledních 20", ne „Hotové (20)":
  počet po oříznutí vypadá jako úplný.

## Filtrovací pás

Stav, měsíc, člověk — vodorovný pás pilulek nad seznamem, na úzké obrazovce
scrolluje vodorovně uvnitř sebe.

- **`.filter-pill`** + `.seg-on` / `.seg-off glass`. Tvar byl opsaný
  v každé obrazovce zvlášť jako `px-4 py-2 rounded-full text-xs …`.
- **Pilulka nese počet** (`Eva · 3`), aby šlo poznat, kam má cenu klikat.
- **Druhý klik na tutéž pilulku filtr zruší.** Bez toho se člověk musí
  trefit do „Všichni", což na telefonu znamená doscrollovat pás zpátky.
- **Ukáže se, až když je co filtrovat.** Jeden člověk, jeden měsíc,
  jeden stav — pás je pak jen řádek navíc.

## Řazení

- **Podle čeho je na kartě největší číslo, podle toho musí jít řadit.**
  Nápady ukazují hlasy jako hlavní obsah a řadily se jen podle data, takže
  nejpodporovanější nápad mohl ležet dole. Totéž souhrn docházky: mzda je
  na kartě, ale řadilo se vždycky jen podle hodin.

## Archiv

Co tým přestal vidět, nemá překážet tomu, kdo to spravuje.

- **Odložené patří pod sbalený `<details>` s počtem**, ne do téhož seznamu
  jako živé položky.
- **Limit na serveru nesmí vytlačit to podstatné.** Nástěnka měla jedno
  `ORDER BY created_at DESC LIMIT 10` přes připnutá i odepnutá, takže deset
  čerstvě odepnutých vzkazů skrylo připnuté oznámení, které má tým pořád
  vidět. Připnutá se načítají všechna, odepnutá s limitem.

## Hromadné akce

Když má obrazovka frontu a u každého řádku stejné tlačítko, musí jít
vyřídit víc řádků najednou. Po sezóně dovolených leží ve frontě dvacet
žádostí a dvacet kliknutí je dvacet čekání.

- **Jedna lišta pro všechny.** `BulkBar` + `useSelection` z `components/ui`.
  Tmavá pilulka plave u spodní hrany (na telefonu nad dokem), ne `sticky`
  uvnitř sekce — sekce bývá vyšší než obrazovka a lišta pak visí uprostřed
  seznamu a zakrývá řádky.
- **„Vybrat víc" se ukáže, až když je co vybírat** — u jednoho řádku je
  výběr práce navíc.
- **Mřížka karet výběr nechce.** Návody a postupy dostanou místo něj pruh
  `ApproveAllBar` nad mřížkou („3 návody čekají · Schválit vše"), protože
  zaškrtávátko na kartě je nemotorné a schvaluje se stejně všechno naráz.
- **Ve výběru zmizí akce u řádků.** Dvě cesty k téže věci na jedné
  obrazovce jsou o jednu moc.
- **Jedna limetková akce i na liště.** Zbytek jsou tlumené pilulky,
  destruktivní až za nimi a červeně.
- **Požadavky jdou naráz, ne za sebou** (`runBulk`), a co se nepovede, se
  řekne: „3 z 12 se neuložilo" je jiná zpráva než „hotovo".
- **Hromadné nemusí znamenat výběr.** Kde je akce jen jedna a týká se všeho
  (odškrtnout celý checklist, pozvat víc lidí najednou), stačí jedno
  tlačítko nebo pole, které přijme seznam. Zaškrtávátka by tam byla krok
  navíc.
- **Co se dá vložit hromadně, se tak musí dát vložit.** Pole pro e-mail
  bere čárkou, středníkem, mezerou i řádky oddělený seznam; nábor na
  sezónu není šest kol formuláře.

## Čeština po číslovce

Tři tvary, ne dva: **1 položka · 2–4 položky · 5+ položek**. Totéž sloveso:
„3 návody čekají", ale „5 návodů čeká". Angličtina si vystačí s jedním „s",
takže se ten rozdíl v kódu snadno ztratí — a vzniknou věty jako
„3 návodů čeká", které by rukou nenapsal nikdo.

- **Pravidlo je v `lib/czech`** (`czForm`, `czCount`, `czVerb`), ne opsané
  v komponentě. Hlídá `check-czech`.
- **Dva tvary stačí, když u nich není číslo.** „Dokonči povinné postupy"
  je správně pro dva i pro pět; „2 postupů" ne.

## Když selže síť

Nejhorší chyba není prázdná obrazovka. Nejhorší je obrazovka, která tvrdí,
že se něco stalo, ačkoli se nestalo.

- **Konfety jen za to, co se uložilo.** Zavírací postup hlásil „Hotovo!"
  i při chybě serveru a zavřel se — vedení ho druhý den vidělo jako
  neudělaný. Nejdřív `res.ok`, teprve pak oslava; při selhání běh zůstává
  otevřený, ať jde zkusit znovu.
- **`res.ok` se musí kontrolovat zvlášť.** `fetch` vyhodí výjimku jen když
  spojení vůbec nevznikne; odpověď 500 se doručí úspěšně a bez kontroly
  vypadá jako platná data — typicky jako prázdný seznam. Samotný `catch`
  tenhle případ nechytí.
- **Prázdno z výpadku není prázdno v datech.** „Zatím tu nikdo není —
  zaměstnance přidá vedení" na kiosku byla lež, která posílala obsluhu
  volat šéfovi místo zkontrolovat wifi. Nenačteno ≠ nic tam není.
- **„Není" a „nedovolali jsme se" jsou dvě různé věci.** Hostovská stránka
  podniku měla `catch(() => setNotFound(true))`, takže výpadek wifi vyšel
  stejně jako neexistující podnik: „Podnik tu není." Zákazník z toho usoudí,
  že kavárna na platformě není, a přestane to zkoušet. Neexistenci smí tvrdit
  jen odpověď 404; všechno ostatní je chyba načtení, a ta má tlačítko.
- **Mutace, jejíž výsledek nikdo nečte, selže potichu.** `await fetch(…,
  { method: 'DELETE' })` bez kontroly znamená, že se obrazovka jen načte
  znovu a člověk nepozná, proč se nic nestalo. Hlídá `check-silent-mutation`.
- **`await fetch` v odesílací obsluze patří do `try`.** Bez něj obsluha
  na výpadku spojení umře uvnitř `await` a nestane se **vůbec nic** —
  žádná chyba, žádné potvrzení, jen ticho. U rezervace nebo objednávky je
  nejistota to nejhorší, co se dá hostovi vrátit: neví, jestli stůl má.
  Zpráva proto říká, že se **nic neodeslalo**, a co bylo rozepsané zůstává
  (košík, promo kód) — ať se dá ťuknout znovu a nic se neztratí.
- **Nenačteno znamená neodesílat.** Když se nenačetlo, co člověk poslal
  dřív, formulář se nesmí tvářit jako prázdný a nechat to odeslat —
  přepsal by původní data. Raději chyba a zamčené tlačítko.
- **Výpadek nesmí nic zdražit ani zamknout.** Nenačtený tarif je
  nenačtený, ne „nemáš zaplaceno".
- **Odhlášení sdíleného zařízení se potvrzuje.** Obsluha nezná heslo
  tabletu; jedno ťuknutí = tablet mimo provoz do příchodu vedení.
- **Načítá se přes `okJson` z `lib/api`.** `fetch(url).then(r => r.json())`
  je zakázané — hlídá to `check-fetch-ok`. `okJson` vyhodí chybu i s tím,
  co server napsal do `error`, takže `catch` na konci řetězu má konečně co
  ukázat; `apiMessage(e, 'záložní věta')` z toho udělá českou větu a
  z anglického `Failed to fetch` tu záložní. Pro odpovědi, které nejsou
  JSON, je `okText`.
- **Kde se dá ukázat prázdno, musí jít ukázat i chyba.** Karta, která se
  prostě nevykreslí, když nemá data, vypadá po výpadku jako klidný den.
  Buď `ErrorState` s „Zkusit znovu", nebo aspoň `note note-wait` s tím,
  co se nenačetlo.
- **Panel nesmí zmizet kvůli tomu, co se nenačetlo.** Žádosti o volno se
  schovávaly, dokud odpověď neřekla „jsi vedoucí" — a po 500 se tím
  schovaly i s chybou. Rozhodnutí „ukázat se" nesmí viset na datech,
  která právě selhala.

## E-mail

E-mail je jediné, co z aplikace odchází ven k lidem, kteří ji nemají.
Objednávka dodavateli, přístupové údaje novému člověku, záloha dat.

- **Odesílá `lib/email`, nikdo jiný.** Hlídá `check-email`.
- **`emails.send()` nevyhazuje výjimku.** Chybu vrací v odpovědi jako
  `{ data, error }`. Bez čtení `error` se odmítnutý e-mail tváří jako
  odeslaný: server zapíše `email_sent_at`, obrazovka napíše
  „Objednávka odeslána ✓" a dodavatel nedostane nic. Je to táž tichá lež
  jako `fetch` a HTTP 500.
- **Neodesláno se řekne i s důvodem.** „Nepodařilo se" je málo, když
  server ví, že doména není ověřená.
- **Odesílatel je `EMAIL_FROM`.** Zkušební adresa odesílací služby
  nedoručí komukoli a nejde na ni odpovědět.
- **Kde e-mail prosí o odpověď, patří `reply_to`.** Objednávka výslovně
  žádá potvrzení termínu; ta odpověď musí dojít do podniku.
- **Do šablony se vkládá jen escapované.** Název podniku s `<` rozbil
  HTML, s `&` se rozpadl na entitu.

## Papír

V kavárně se tiskne. Rozvrh visí na zdi u baru, nákupní seznam jde do
velkoobchodu a odškrtává se tužkou. Papír má vlastnosti, které se na
obrazovce neřeší.

- **Skládá ho `lib/printDoc`.** Společný černobílý vzhled, A4.
- **Barva na papíře neplatí.** Tiskárna v kavárně je černobílá. Stav, který
  se pozná jen barvou, je na výtisku neviditelný — typ směny se píše slovem.
- **Hlavička tabulky se opakuje** (`thead { display: table-header-group }`)
  a řádek se neláme vejpůl (`page-break-inside: avoid`).
- **Papír nemá stav.** Na výtisku musí být, k čemu a ke kdy patří, jinak za
  dva dny nikdo neví, jestli je aktuální.
- **Zablokované tiskové okno se musí přiznat.** `openPrint` vrací `false`;
  bez toho člověk klikne na „Vytisknout" a nestane se vůbec nic.
- **Escapuje se i `&`.** Ruční `esc` uměl jen `<`, takže „R&D" se rozpadlo.

## Export do kalendáře

Kalendář je slib o čase. Soubor, který kalendář odmítne nebo přečte špatně,
je horší než žádné tlačítko — člověk si myslí, že směnu má zapsanou.

- **Skládá ho `lib/ics`, nikdo jiný.** Hlídá `check-ics`.
- **`DTSTAMP` je povinný.** Apple ho doplní, Outlook a Exchange soubor bez
  něj odmítnou — ťuknutí na „Do kalendáře" pak neudělá nic.
- **`TZID` bez `VTIMEZONE` je jen nápis.** Klient, co `Europe/Prague`
  nezná, vezme čas jako místní nebo jako UTC. Ranní směna se objeví
  v deset a to je zmeškaná směna.
- **Řádek nesmí přes 75 oktetů.** Měří se bajty UTF-8, ne znaky. Popis akce
  od podniku limit přeleze snadno a některé čtečky zahodí celou událost.
- **Text se uniká vždy.** Čárka v „Degustace, ročník 2019" rozdělí
  vlastnost na dvě. Ošetřuje se `\`, `;`, `,` a nový řádek.
- **Konec před začátkem se vynechá**, událost bez data taky — soubor
  zůstane platný i s pokaženým vstupem.

## Slepé uličky

Adresa, která přestala platit, a chyba za běhu jsou taky obrazovky — jen
je nikdo nenavrhl, dokud na ně někdo nedošel.

- **Aplikace mluví česky i když padá.** Bez vlastního `not-found.tsx`
  a `error.tsx` ukáže Next.js svoji anglickou obrazovku. Hlídá
  `check-dead-ends`.
- **Nesvaluj to na člověka.** „Neplatný odkaz" zní jako jeho chyba; odkaz
  přestal platit. Sdílené odkazy na nabídku se dají vypnout a vystavit
  znovu, a lidé je mají na letácích s QR a v záložkách.
- **Vždycky nabídni, kam jít dál.** Slepá ulička bez východu je slepá
  ulička.
- **`global-error.tsx` nesmí spoléhat na aplikaci.** Když spadne kořenové
  rozvržení, nemusí být načtené ani CSS — kreslí si `<html>`, `<body>`
  i styly sama.

## Pohled se stahuje, až když ho někdo otevře

Hlavní obrazovka měla **421 kB prvního načtení**, zatímco zbytek aplikace
87–137 kB. Příčina byla v rozvržení: importovalo všech dvaadvacet pohledů
staticky, takže se rozvrh, sklad, receptury, postupy, chat i správa
hostovské části stahovaly dřív, než se ukázal přehled. Manažer na telefonu
v kavárně tak čekal na věci, které ten den vůbec neotevře — a zaměstnanec,
který za směnu otevře dvě obrazovky, stahoval uzávěrku i výměny směn.

Po převedení na `next/dynamic` se skeletonem:

| obrazovka | před | po |
|---|---|---|
| `/employer/overview` | 421 kB | **160 kB** |
| `/employee/shifts` | 288 kB | **161 kB** |

Dvě pravidla, která u toho platí:

- **První obrazovka po přihlášení zůstává statická.** Přehled i domovská
  obrazovka se otevřou hned; čekat na ně by bylo horší než ušetřené kilobajty.
- **Pohled, který se načítá, ukáže kostru**, ne prázdno. `PageSkeleton` drží
  tvar stránky, takže se rozvržení neposkočí.

Hlídá `scripts/check-lazy-views.mjs`: každá komponenta, kterou `switch`
v rozvržení vykresluje jako celou obrazovku, musí přijít přes
`naLine(() => import(…))`. Kontrola hned při zavedení našla jeden pohled,
který při ruční práci utekl — proto existuje.

Jedna past na typy: komponenta s výchozí hodnotou parametru
(`function X({ a, b }: Props = {})`) se přes `import()` neodvodí a props
propadnou na `object`. Řešení je pojmenovat a vyexportovat typ props, ne
psát `any`.

**Co to stojí, změřeno.** Za menší první načtení se platí tím, že se pohled
stahuje při prvním otevření. `probe-prepnuti.mjs` to měří:

| | první přepnutí na pohled |
|---|---|
| bez omezení | 355–415 ms |
| pomalá 3G (400 kb/s, 400 ms) | 643–1422 ms |

Kostra je po celou dobu vidět, takže se nečeká do prázdna. Výměna je
jednoznačná: **261 kB se ušetří pokaždé při otevření aplikace**, těch
0,6–1,4 s se platí **jen jednou a jen za pohled, který člověk opravdu
otevře.** Podruhé je chunk v paměti prohlížeče.

Sonda k tomu má vlastní kalibraci: když se kostra ani jednou neukáže,
zahlásí, že neměří přepnutí. První verze totiž hledala třídu
`.animate-pulse`, kterou kostra nemá (má `.shimmer` a `aria-busy`), takže
vracela 46–78 ms — ve skutečnosti neměřila nic.

## Měřidlo, které nemá právo hlásit nálezy

Sonda na viditelný fokus nabídla dvakrát po sobě velký, přesvědčivý nález —
a obojí byla chyba měřidla, ne aplikace:

1. Volala fokus programově (`el.focus()`). Prstenec se ale kreslí přes
   `:focus-visible`, což je správně (u myši se neukazuje, u klávesnice ano),
   a ten programový fokus nespustí. **Naměřeno 30 z 92 „bez označení".**
2. Četla `getComputedStyle` hned po Tabu. `.field` má na stín přechod
   0,22 s, takže vracela začátek animace, ne cíl: v čase 0 ms
   `0px 0px 0px 0px`, ve 300 ms `0px 0px 0px 3px`. **Naměřeno 101 z 1183.**

Obě čísla vypadala jako pořádná práce. Kdyby se podle nich „opravovalo",
rozbilo by se fungující chování. Skutečný výsledek po opravě sondy:
**922 prvků, 0 bez viditelného označení.**

Z toho plyne pravidlo, které platí pro každou sondu v `scratchpad/ui`:

> **Měřidlo, které neumí ukázat správnou odpověď na známé zadání, nemá
> právo hlásit nálezy.**

`probe-fokus.mjs` proto začíná kalibrací: na přihlašovací obrazovce, kde
ručně víme, že pole po Tabu prstenec má, si ověří, že ho najde. Když ne,
zahlásí „měřím sebe, ne aplikaci" a skončí s kódem 2, místo aby chrlila
nálezy. Je to totéž pravidlo jako u kontrol v CI, jen obrácené na nástroj.

Dva konkrétní způsoby, jak se sonda umí splést v prohlížeči, a obojí se tu
už stalo:

- **Obchází způsob, jakým se věc doopravdy děje.** Programový fokus není
  fokus z klávesnice; vyplnění pole skriptem není psaní.
- **Čte dřív, než se věc dokreslila.** Cokoli s `transition` se musí
  doměřit až po doběhnutí, jinak se čte výchozí stav.

## Pokrytí kontroly je součást kontroly

Trojí stejná chyba, pokaždé jinde: kontrola hlídala správnou věc, jen se
nedívala všude.

- `check-contrast-classes` obcházel vzorec `components/**/*.tsx` soubory
  ležící přímo v `components/` — z 86 jich viděl 67.
- `check-generic-copy` nechodil do `lib/`, takže konvička v uvítacím
  e-mailu přežila celé kolo o univerzálních textech.
- Žádná kontrola nechodila do `public/`, kde leží 300 kB ručně psaného
  venkovního menu — živá funkce, na kterou editor menu generuje QR kódy.

Proto: **když píšeš kontrolu, napiš si zvlášť, co do ní nechodí, a řekni
proč.** Strom se prochází ručně, ne vzorcem. A obrazovka, kterou sonda
nikdy neotevřela, není ověřená obrazovka — i když je z jiné technologie
než zbytek aplikace.

## Přístupné jméno

Klávesnice je v samostatné kapitole; tohle je to druhé, co odečítač
obrazovky potřebuje — vědět, co ten prvek **je**.

- **Ikonové tlačítko bez textu potřebuje `aria-label`.** Jinak je to prostě
  „tlačítko". Přepínač bočního pásu ho neměl a je na každé obrazovce.
- **Placeholder není popisek.** Při psaní zmizí a odečítače ho čtou
  nespolehlivě. Pole potřebuje jméno, které zůstane.
- **`<label>` bez `htmlFor` popisek není.** Vizuálně vypadá stejně,
  programově není nic. Odolnější než dvojice `htmlFor`/`id` je vložit pole
  dovnitř `<label>` — svázání pak nerozpadne přejmenování `id`. Hlídá
  `check-labels` jako ráčna.
- **Jeden `h1` na obrazovku, a nikdy podmíněný.** Nadpis je to, podle čeho
  se pozná, kde člověk je; nesmí viset na stavu dat, jinak při načítání
  nebo bez připojené pokladny zmizí. Když se jedna obrazovka vykresluje
  uvnitř druhé, ta vnořená dostane `h2` — `PageHeader` má na to `as`.
  Nadpis, který je zjevný z plochy (chat, kiosk), se dá schovat přes
  `sr-only`; schovat ho není totéž co nemít ho.
- **Akcent patří hrdinovi, ne textu ke čtení.** Barvu akcentu si volí každý
  podnik, takže se na její kontrast nedá spolehnout. Velká číslice ceny ji
  unese (na velký text stačí 3 : 1), drobný symbol měny vedle ní ne —
  ten drží inkoust.
- **Obrazovka, která má víc palet, se měří ve všech.** Venkovní menu
  přepíná den a noc podle hodin; noční paleta procházela, denní ne — a to
  je právě ta, která visí venku za světla. Sonda, která chytí jen tu
  palubní zrovna platnou, netestuje, jen se trefuje.
- **Měří se v prohlížeči.** `probe-a11y` počítá přístupné jméno tak, jak ho
  skládá odečítač, přes všechny obrazovky.

## Tmavý režim

Tmavý režim se v aplikaci nabízí a ukládá do prohlížeče. Hostovská část
(Managero client) ho záměrně nemá — tam si vzhled určuje podnik.

- **Třída, která si nastaví barvu textu, ji musí mít i pro tmavý režim.**
  Plošné pravidlo pro `.text-black/NN` na `.seg-off` ani `.cat-1` nedosáhne,
  protože jméno třídy je jiné. Hlídá `check-dark-classes`.
- **Výjimka jsou plochy, které zůstávají světlé** — limetkový akcent,
  `.panel-light`, `.chip-ink`. Tam je inkoust správně a přebarvit ho by byla
  chyba opačným směrem. Vyjmenované jsou ve skriptu kontroly.
- **Kontrast se měří, ne odhaduje.** `probe-dark` počítá poměr podle WCAG
  proti skutečnému podkladu pod textem a jede přes všechny obrazovky.
- **Podklad je první vrstva, která kryje.** Skládat všechny průhledné
  předky dohromady dává barvy, které na obrazovce nikde nejsou — takhle
  jsem si sám vyrobil 482 falešných nálezů a málem podle nich opravoval.

## Kiosk: tablet za barem, ne monitor na stole

Kiosk sdílí Sklad, Uzávěrku, Návody i Postupy s aplikací pro vedení. Ta má
u monitoru na půl metru svoje stupně v pořádku — u baru se ale čte vestoje,
na délku paže, mezi dvěma hosty a často jednou rukou.

- **Měřítko se nastavuje na povrchu, ne po komponentách.** Obal
  `.kiosk-surface` zvedá stupně písma a dotykové plochy pro celý kiosk;
  jedno pravidlo místo dvaceti sedmi záplat.
- **Na kiosku není nic pod 14 px a žádný cíl pod 44 px.** Měří se sondou
  v prohlížeči (`probe-k23`), ne odhadem ze zdroje — `tap-target` rozšiřuje
  plochu přes `::before`, takže samotný `getBoundingClientRect` lže.
- **Mění se velikost, ne rozvržení.** Nesahá se na `padding` ani `width`;
  dotyková plocha roste přes `::before`, které rozměr prvku nemění. Ověřuje
  se to porovnáním s výchozím stavem: přeteklo-li něco i bez úpravy,
  není to její vina.
- **`tap-target-sm` (36 px) na kiosku neplatí.** Hustý seznam pro myš,
  ne pro prst; uvnitř kiosku se roztahuje na 44.

## Sdílený tablet a identita

Tablet za barem nepatří nikomu. Všechno, co se na něm odklikne, přesto
někomu patří — mzda, podpis pod zavíracím postupem, „kdo to naskladnil".

- **Mezi víc lidmi se nehádá.** Jeden člověk na směně odhad není, to je
  fakt. Dva a víc znamená, že se tablet **zeptá** — a než dostane odpověď,
  nezapíše nic. Pravidlo žije v `lib/kioskIdentity` a je otestované.
- **Odchod ze směny neznamená náhradníka.** Když vybranému skončí směna,
  identita padá na „nevím", ne na prvního v rozpisu.
- **Nečinnost identitu pustí.** Jméno drží jen proto, že na tablet nikdo
  nesáhl; po deseti minutách to přestává být důkaz. Cookie se zapisuje na
  hodinu a obnovuje dotykem, ne na celou směnu.
- **Přepnutí je vidět.** Když někdo přijde na směnu a tím se stane tím,
  kdo se zapisuje, řekne se to nahlas — ne potichu za zády toho předchozího.
- **Prázdný odznak je horší než otázka.** Bez vybraného člověka se odznak
  nesmí schovat: vypadá to, že tablet nikoho nezapisuje, a přitom zapisuje
  sám sebe. Místo prázdna „Kdo jsi?".
- **Rozpracovanost se nepřenáší.** Odškrtané kroky návodu, rozepsaný
  formulář — cokoli v `localStorage` na sdíleném zařízení nese v klíči
  i toho, komu to patří.

## Peníze a součty

- **Zaokrouhluje se jednou, až ten výsledek.** Cena receptury se počítala
  dvakrát: v seznamu se sečetly přesné hodnoty a zaokrouhlilo se na konci,
  v editoru se zaokrouhlila každá surovina zvlášť. Pět gramů cukru je dvanáct
  haléřů; po surovině zaokrouhleno je to nula. Nápoj ze čtyř takových
  surovin pak stál 0 Kč se stoprocentní marží — a podle marže se nastavují
  ceny. Výjimka je jediná, `lib/wages`: tam se zaokrouhluje po záznamu,
  protože ty řádky sečte účetní na papíře a součet jim musí odpovídat.
- **Částka pod jednotkou měny se ukazuje s desetinami.** `useCost()` místo
  `useMoney()`. „0 Kč" u suroviny není zaokrouhlení, je to nepravda.
- **Marže se počítá z nezaokrouhleného nákladu.** U levného nápoje posune
  zaokrouhlení na celé koruny procenta o jednotky.
- **Chybějící cena není nula.** Surovina bez ceny je díra v součtu; součet
  se v takovém případě neukáže vůbec, protože by marži nafoukl.
- **Jedno číslo se počítá na jednom místě.** Mzdové náklady z docházky
  měly tři výpočty ve třech obrazovkách a daly tři různé měsíční součty za
  tentýž měsíc — a ten třetí, součet sloupce v CSV, neseděl ani s jedním.
  Teď `lib/wages`.
- **Zaokrouhluje se tam, kde to člověk vidí.** Účetní sečte, co je
  vytištěné na řádcích, takže se zaokrouhluje po záznamu, ne až součet.
  Kdyby to bylo naopak, CSV by nikdy nesedělo s obrazovkou.
- **Nesmyslný záznam se nepočítá — všude stejně.** Zapomenuté odpíchnutí
  není třicetihodinová směna. Finance ho braly celé, Uzávěrky vyhazovaly;
  to je větší rozdíl než haléře.
- **Na peněžní výpočet patří test**, ne screenshot. Je to jediná část
  aplikace, kde se správnost dá napsat jako rovnice.
- **Měna se nelepí k číslu.** `useMoney()` / `useSymbol()` na obrazovce,
  `formatMoney()` z `lib/money` na serveru a na veřejných stránkách.
  Ruční `${n} Kč` ukáže rakouské kavárně koruny a k tomu neumí oddělit
  tisíce — „12500 Kč" místo „12 500 Kč". Hlídá `check-money` (ráčna).
- **Kód měny není symbol.** V databázi se ukládá `CZK`, na obrazovku jde
  `Kč`. Starší podniky mají uložený symbol, takže `normalizeCurrency`
  je most mezi tím; `Intl` na symbol vyhodí výjimku.
- **Cena zadaná člověkem má haléře, součet ne.** Cena položky v menu,
  nákupní cena balení a cena příjmu jdou přes `lib/cena` (`cenaZFormulare`
  z pole, `cenaZDb` z databáze — NUMERIC chodí z Neonu jako řetězec) a
  zobrazují se přes `usePrice()` / `formatPrice`: „4,50 €" zůstane „4,50 €",
  „49 Kč" zůstane „49 Kč". Pole ceny je textové (`inputMode="decimal"`),
  ne `type="number"` a už vůbec ne `replace(/\D/g, '')` — z „4,50" by bylo
  450. Sloupce jsou v DDL INTEGER, dokud někdo nespustí migraci na NUMERIC
  (viz `lib/cenaSloupce`); do té doby se ukládá zaokrouhleně jako dřív.
- **Texty ze serveru mluví měnou podniku.** Rady, poznámky a push z API
  skládej přes `menaPodniku(teamId)` (`money`, `cost`, `price`, `prah`),
  ne s `Kč` a `cs-CZ`. Práh v korunách („od 2 000 Kč je to varování") se
  přepočítá `prah()` — 2 000 € by nebylo varování, ale katastrofa.

## Co se samo přepíná, nesmí měnit výšku

Ukázka funkcí na prodejní stránce se po šesti vteřinách sama posune na
další scénu. Scény mají různou výšku, a na telefonu panel nedržela žádná
podlaha — naměřený rozkmit **85 px**. Stránka se tedy pod čtenářem každých
šest vteřin zkrátila nebo prodloužila, a odstavec, který zrovna četl, mu
odskočil. Na monitoru se to nedělo, protože tam `sm:min-h-[24rem]` bylo.

Pravidlo: **cokoliv, co se přepíná bez zásahu uživatele, má pevnou
podlahu výšky na všech šířkách.** Číslo se bere z měření nejvyšší varianty,
ne od oka. A měří se to tak, že se projdou všechny varianty a porovná se
min s max — ne tak, že se dvě otevřou a vypadají stejně.

## Na telefonu nesmí prvek skončit v půlce

Na monitoru to vypadá správně: nadpis vlevo, akce vpravo, pole vedle
nápovědy. Na 390 px se ten řádek zalomí — a `ml-auto` nechá akci viset
samotnou v pravé půlce prázdného řádku, kde nelícuje s ničím. Ze
screenshotů z mobilu to byl zdaleka nejčastější nález: „Oznámit týmu",
„Připnout oznámení", „Nový úkol", „Sestavit rozvrh", „Ohodnotit",
„Obnovit" — každé zvlášť viselo v prázdnu.

- **Hlavní akce jde na telefonu přes celý řádek.** `w-full sm:w-auto
  justify-center`, nebo `block` u `<Button>`. Dvojice hlavních akcí se
  skládá pod sebe, obě přes celý řádek; přepínací menu `···` zůstává
  vedle. Řeší to `PageHeader` za všechny obrazovky naráz — akce v něm
  mají na telefonu vlastní řádek.
- **Tichá akce se srovná s levým okrajem, ne s pravým.** `sm:ml-auto`,
  `justify-start sm:justify-end`. Malá pilulka u pravého kraje jinak
  nelícuje s ničím nad sebou ani pod sebou. Hlídá `check-mobile-align`.
- **Pole s pevnou šířkou je pevné jen na monitoru.** `!w-full sm:!w-24`.
  Pevných `7rem` vedle nápovědy vyrobilo na telefonu vstup široký 112 px
  a nápovědu zmáčknutou do tří řádků vedle něj. Dvojice polí (od–do,
  datum–čas) sdílí řádek přes `grid-cols-2 sm:flex`.
- **Pevné sloupce mají svůj součet.** Čtyři sloupce po 64–96 px se na
  390 px nevejdou a `flex-1` název mezi nimi zkolabuje na nulu — zbyde
  řada čísel bez toho, čeho se týkají. Pod `sm` se z tabulky stává
  věta pod názvem.
- **Oddělovač mezi řádky nemá co dělat.** „·" a „–" mezi předvolbami
  a rozsahem dat drží smysl jen v jedné řádce; po zalomení zůstanou
  viset samy. Buď řádek nezalomit, nebo oddělovač zahodit.
- **`ListRow`: když jsou v ocase jen akce, dojedou k okraji.**
  `space-between` položí jediný prvek doleva a pravá půlka řádku zůstane
  prázdná. `.list-actions:only-child` v `globals.css` to řeší pro
  všechny seznamy naráz.

Nadpis obrazovky je jeden. Když se jedna obrazovka vykresluje uvnitř
druhé, ta vnořená svou hlavičku nevykresluje — Menu v Managero client
mělo dvakrát pod sebou „Menu" a pokaždé jinou větu pod ním.

## Okno na telefonu vyjíždí zdola

Na monitoru je okno vystředěný obdélník. Na telefonu je to jiný prvek:
palec je u spodní hrany, takže tam okno má dosednout a přijet zespodu —
jako by vyjelo další patro nad obsah. Půlka aplikace to uměla a půlka ne,
takže dvě okna otevřená za sebou přišla pokaždé odjinud.

- **Dělají to dvě třídy, ne komponenta.** `.modal-overlay` na ztmavení,
  `.modal-sheet` na panel. Pod `sm` se panel roztáhne přes celou šířku,
  dosedne na spodní hranu, zaoblí jen horní rohy a přijede zdola. Nad `sm`
  zůstává všechno, jak bylo. Platí to pro okno kreslené `<Modal>` i pro
  vlastní překryv — a nové okno to dostane tím, že ty třídy použije.
- **Přepínač `sheet` je pryč.** Byl to opt-in a ze čtrnácti míst s vlastním
  překryvem si o něj řeklo jedno. Chování, které má platit všude, nemá být
  volba.
- **Průhledný `fixed inset-0` není překryv.** Pod rozbalovacím menu je to
  záchyt kliknutí; ten se pravidla netýká a `check-sheet` na něj mlčí.
- **Křivka dosedne, neodrazí se.** `cubic-bezier(0.32, 0.72, 0, 1)` je
  plochá na konci. Odražený list působí jako chyba, ne jako hravost.
- **Domovský proužek na iPhonu.** List uvnitř překryvu si přidá
  `env(safe-area-inset-bottom)`, jinak leží proužek přes poslední řádek.

## Tmavý režim se musí měřit celý, ne po třídách

Kontrast se dlouho hlídal jen ve světlém režimu: `check-contrast-classes`
ověřovala, že se slabá šedá v `globals.css` narovná — ale jen ta světlá
větev. Tmavý přepis nekontroloval nikdo, takže `text-black/25` prošla
s narovnáním na 0,58 ve světlém a v tmavém spadla na 0,30. To je 2,53:1.

- **Každý stupeň `text-black/NN` musí mít tmavý přepis a ten aspoň 0,55.**
  Nejsvětlejší tmavý podklad je sklo (zhruba +9 % bílé přes `--surface`);
  tam 0,50 dává 4,20:1 a 0,52 dává 4,42:1 — obojí pod normou. Stupnice se
  tím v tmavém zplošťuje, ale hierarchii nese velikost a tučnost, přesně
  jak to má světlý režim od kola 26.
- **Inkoust se nepíše hexem s průhledností.** `text-[#16181A]/75` je jiný
  název třídy než `.text-[#16181A]`, takže ho tmavý přepis mine úplně
  a zůstane tmavý inkoust na tmavém podkladu — naměřeno 1,01:1 v chatu
  a ve Financích, tedy text, který na obrazovce prostě není. Píše se
  `text-black/75`. Hlídá `check-contrast-classes`.
- **Popisek `t-label` byl 0,50, tedy 3,39:1 na bílé kartě.** Teď 0,62.
  Barva psaná v CSS unikala kontrole, která čte jen `className` v TSX —
  proto kontrola čte i `globals.css`.

Sonda `probe-dark` měří skutečné pixely, ne třídy, a proto musí vidět
i vrstvu, která leží **za** textem jako sourozenec: přepínač kreslí
tmavou pilulku absolutně umístěným prvkem s `pointer-events: none`.
Lezení po předcích ji nevidí a `elementsFromPoint` ji přeskakuje. Obojí
zvlášť hlásilo bílou na krémové u textu, který je bílý na tmavé pilulce.

## Mezipásmo mezi telefonem a monitorem

Měřilo se 390 px a 1280 px. Mezi tím ne — a přitom produkt sám prodává
„kiosk pro tablet za barem" a menu na iPadu před podnikem. Právě tam se
breakpointy lámou.

- **Doplněk v řádku seznamu se zapíná až od `lg`, ne od `md`.** Na 768 px
  se objevil, ale řádek na něj místo neměl: pevné sloupce (číslo 7rem +
  doplněk 8,5rem) plus ikona, akce a šipka vytlačily jméno, které je
  `flex-1`, na nulovou šířku. Na iPadu tak seznam zákazníků neukazoval
  žádná jména. Naměřeno: 768 px → jméno 0 px, 1024 px → 250 px.
- **Pevné sloupce mají svůj součet i tady.** Je to tatáž vada jako ve
  Financích na 390 px, jen o breakpoint výš. Kdo přidává sloupec do
  `ListRow`, sečte šířky a zkontroluje, kde `flex-1` zkolabuje.

Dotyková plocha se neměří krabicí prvku. `.tap-target` ji roztahuje
pseudoprvkem na 44 px a `getBoundingClientRect` o něm neví — sonda na
kiosku hlásila tři malé cíle, které ve skutečnosti zabírají 44 px.
Skutečnost ukáže až zásah: bod 21 px mimo krabici musí pořád trefit.

## Offline se neukazuje stará aplikace, ale vysvětlení

Pravidlo „když vypadne wifi, aplikace nelže" mělo jedno místo, kde
aplikace nemluvila vůbec: po výpadku a obnovení stránky se ukázala
chybová stránka prohlížeče. Service worker uměl jen notifikace a navíc
se registroval jen tehdy, když byl nastavený klíč pro push — bez něj
nebyl žádný.

- **Cachuje se jen skořápka, nikdy odpovědi API.** Zastaralý stav skladu
  nebo rozvrhu je horší než poctivá chyba: obsluha by podle něj
  objednávala zboží, které už došlo. Offline se proto neukazuje stará
  aplikace, jen `offline.html` s vysvětlením.
- **`fetch` chytá jen navigace.** Obrázky, skripty ani volání API se
  do toho nepletou.
- **Offline stránka nesmí nic stahovat.** Styl i skript má v sobě —
  v tu chvíli nejde načíst ani písmo, a prázdná obrazovka je horší než
  dinosaurus z prohlížeče, protože nevysvětlí nic.
- **Maže se jen vlastní cache podle předpony.** Cache jsou sdílené přes
  celý původ, takže „smaž všechno cizí" by vzalo i offline cache
  hostovského menu, které má vlastní worker.
- **Registrace workeru nesmí záviset na notifikacích.** Dvě různé věci
  se nemají podmiňovat navzájem; `PushManager` si registraci najde,
  ale nezakládá ji — a čeká na ni s časovým stropem, aby tiše nevisel.

## Barva značky je podniku, čitelnost je naše

Podnik si v Nastavení → Vzhled volí barvu volně (`<input type="color">`).
Text na ní vybírala heuristika z devadesátek — vnímaný jas podle BT.601
s prahem 150. To není kontrast a na **28 % barevného prostoru** dávala
text pod 4,5:1.

Naměřeno na barvách, které si podnik reálně zvolí:
`#F97316` oranžová → 2,80:1 · `#14B8A6` tyrkysová → 2,49:1 ·
`#00FF00` zelená → 1,37:1. Kavárna s oranžovou tak měla na své vlastní
stránce tlačítko „Stát se členem", které si její hosté nepřečtou.

- **Inkoust se vybírá podle skutečného kontrastu**, ne podle jasu:
  spočítat obě možnosti a vzít lepší. Selhání pod 4,5:1 tím klesne na
  6,5 % a nejhorší dosažitelná hodnota je 4,22:1 místo 1,37:1 — pod 3:1
  se nedostane žádná barva.
- **Zbylých 6,5 % se neopravuje za podnik.** Barvu si zvolil on; přepsat
  mu ji je horší než mu to říct. V Nastavení → Vzhled proto vidí ukázku
  tlačítka a u nevyhovující barvy větu, co s tím.
- **Testuje se celý barevný prostor, ne naše limetka.** Fixture má vždycky
  limetku, na které vycházelo i to staré řešení — právě proto se vada
  neukázala. `scripts/test-units.ts` projede prostor a hlídá práh 3:1.

## Začátek týdne si volí podnik

V Nastavení → Tým si podnik zvolí, jestli mu týden začíná pondělím, nebo
nedělí. Šest komponent si ale pořadí počítalo samo a dvě z nich to
nastavení ignorovaly úplně: rozvrh i dostupnost měly `(getDay() + 6) % 7`
natvrdo. Podnik s nedělním týdnem tak plánoval směny v mřížce, která
začínala jinde než kalendář, ve kterém je pak četl.

- **Seřazená hlavička dnů se bere z `zkratkyDnu(zacatek)`.** Jedno
  pravidlo v `lib/week.ts`, ne sedm polí po komponentách. Hlídá
  `check-week-start`.
- **Sedmička, která tímhle NEJDE.** Otevírací doba se ukládá klíčem
  0 = pondělí, dny opakování připomínky taky. To je úložná konvence, ne
  zobrazení; převést ji na pořadí mřížky by podnikům posunulo otevírací
  dobu i připomínky o den.
- **Poznat se to dá podle mapování.** Hlavička mapuje jen hodnotu
  (`.map(d => …)`), datový editor bere i index (`.map((label, d) => …)`)
  a ten index je uložená data. Kontrola rozlišuje přesně tohle.
- **`Number(null)` je nula.** Prosté `Number(h) === 0` by podniku bez
  uloženého nastavení dalo neděli místo výchozího pondělí. Chytil to test,
  ne oko.

## Bílý text na fotce se měří, ne odhaduje

Závěrečné CTA má bílý nadpis na fotce týmu. Na náhledu to vypadalo dobře.
Naměřeno: **1,04 : 1** — protože v pozadí fotky je vypálené okno a ztmavení
pod textem ve skutečnosti neexistovalo (viz pravidlo níž).

Z toho plyne postup, ne pocit:

- Text na fotce jede vždycky přes třídu `.scrim`, ne přes tón nasazený
  v JSX. Je to svislý přechod 0,74 → 0,92 inkoustu; horní hodnota je
  spočítaná tak, aby i **čistě bílý** pixel pod textem dal bílé aspoň
  4,5 : 1.
- Měří se **nejhorší pixel pod textem**, ne průměr. Průměr byl 4,1 : 1 a
  vypadal skoro v pořádku, zatímco nadpis se v jednom místě nedal přečíst.
- Měří se **jen plocha, kde text doopravdy je**. Snímek celé vrstvy bere
  i zaoblené rohy bloku, kudy prosvítá krémová stránka — a sonda pak hlásí
  nález v místě, kde žádné písmeno není. (Stálo to jeden falešný poplach.)
- Snímek se dělá z prvku, ne výřezem stránky: výřez se počítá od začátku
  dokumentu, ne od okna, takže po odscrollování fotíte úplně jiné místo.
  (Stálo to druhý falešný poplach.)

## Krytí mimo Tailwindovu škálu se tiše nevygeneruje

`bg-[#16181A]/72` vypadá jako platná třída. Není: 72 není krok Tailwindovy
škály krytí, pravidlo v CSS nevznikne a prvek zůstane průhledný. Nic
nespadne, nic se nevypíše — jen tam, kde mělo být ztmavení, není nic.

Sonda pak našla **35 takových tříd napříč aplikací**, z toho 34 starších
než tenhle nález: `bg-bad/12` u zamítnutých řádků v rozvrhu a v posouzení
směn, `bg-wait/12` u čekajících uzávěrek, inventur a odměn, `bg-[#0A84FF]/12`
na obou nástěnkách, ve financích a v úkolech. Zvýraznění se nekreslilo
vůbec: zamítnutý řádek vypadal jako každý jiný.

- Škála jde po pěti: 0, 5, 10 … 95, 100. Mezihodnota musí být v hranatých
  závorkách (`/[0.72]`), jinak neexistuje.
- Platí to i pro naše tokenové barvy (`bg-bad/…`), ne jen pro hexy.
- Hlídá to `scripts/check-opacity-steps.mjs`. Kontrola byla ověřená na
  známém špatném i známém dobrém vstupu, a hlavně proti **vygenerovanému
  CSS** — ne proti domněnce, co Tailwind umí.

## Příchod po půlnoci patří včerejšku

Zaměstnanec se sobotní směnou v baru chtěl udělat uzávěrku a v návrzích
viděl jedinou možnost: **neděli — den, kdy má podnik zavřeno.** Směna, kterou
mu aplikace založila sama při klepnutí na „příchod", dostala datum podle
hodin na zdi. Klepl po půlnoci, a ze sobotního večera se stala nedělní směna,
kterou nikdo neplánoval a která se nedá uzavřít. `date` je v tabulce směn
prostý text, takže se po cestě nic nepřevádělo — ten nedělní řádek tam
opravdu byl.

Odchod tohle pravidlo znal a měl ho i v komentáři („směna patří dni, kdy
začala"). Příchod ne. Dvě místa, dvě pravidla — a shodovala se jen do půlnoci.

Teď je to jednou, `lib/businessDay.ts`, a řídí příchod, odchod i úklid
zapomenutých odchodů:

1. **Včerejší směna, jejíž okno (s tolerancí) pokrývá okamžik příchodu → včera.**
   Fakt, nic se nehádá.
2. **Podnik měl včera otevřeno přes půlnoc a ještě nezavřel → včera.** Taky
   fakt, z otevírací doby. Právě tohle říká „v neděli máme zavřeno".
3. **Jinak dnes.**

Posouvá se jen dozadu a jen s důkazem. Proto to není prosté „před šestou
ráno = včera", jak to má pokladna u účtenek: pekař, který přijde ve čtyři,
by si tím psal směnu na předchozí den. U pekárny zavírající v šest večer
se pravidlo 2 nikdy nespustí — hlídá to test.

Poučení, které je obecnější než uzávěrka: **když dvě místa odpovídají na
tutéž otázku („ke kterému dni to patří?"), musí volat tutéž funkci.** Ne
dvě funkce, které se shodují ve všech případech, na které si kdo vzpomněl.

## Fotka vedle textu: o výšce rozhoduje text, fotka vyplní zbytek

Karty „Jeden den s Managerem" měly fotku s pevným poměrem stran vedle
textu. Fotka byla vyšší než text, takže o výšce řádku rozhodovala ona a text
v něm plaval — **na 1280 px zabíral 36–40 % výšky karty**, zbytek byl vzduch
nad ním a pod ním. Na náhledu to vypadalo „vzdušně", ve skutečnosti to byla
karta ze dvou třetin prázdná.

Pravidlo: **v kartě s textem a fotkou vedle sebe určuje výšku text.** Fotka
je `.foto-vypln` — od 768 px má `aspect-ratio: auto`, obrázek je absolutně
posazený (takže do výšky řádku nic nepřidá) a jen vyplní, kolik místa mu
text nechá. Pod 768 px, kde jsou pod sebou, poměr stran zůstává. Mřížka má
`items-stretch`, textový sloupec `flex-col justify-center`.

Vrstvy se překrývají, ne že vedle sebe leží: karta s momentem z aplikace
přesahuje o 3,5 rem přes okraj fotky. Přesah musí mít `z-10` a nesmí
přetéct z karty — hlídá to sonda šířek.

Měří se **podíl výšky obsahu textového sloupce vůči výšce karty**; pod 0,7
je to nález. Po opravě: šest nálezů → jeden (hero, kde je vzduch kolem
nadpisu záměr).

## Mřížka nesmí nechat osiřelou buňku

„Místo čeho" mělo sedm položek ve dvou sloupcích: poslední řádek zel.
Počet položek v mřížce je **násobek počtu sloupců na každé šířce**, kde má
mřížka víc než jeden sloupec — jinak se přidá, ubere, nebo změní počet
sloupců. Sedm se doplnilo na osm skutečnou funkcí (objednávka dodavateli
e-mailem s potvrzením), ne výplní.

Měří se za běhu, protože počet sloupců závisí na šířce: pro každou mřížku
`děti % sloupce`. Nula na 390, 768, 1024, 1280 i 1440 px.

## Produkt v prostoru, ne objekt v prostoru

„3D" na prodejní stránce už jednou bylo — hrnek — a neprodávalo, protože
návštěvník nekupuje hrnek. Tohle je jiné 3D: **skutečná obrazovka aplikace**
(tatáž scéna rozvrhu, která se přehrává v ukázce funkcí níž) v tabletu
s tenkým rámem, natočená o 12°/5° a pomalu se vznášející nad fotkou.
Nula bajtů modelu, nula WebGL — perspektiva je CSS. Naklonění je malé
schválně: větší už oko čte jako mockup ze šablony a text na obrazovce se
přestane dát přečíst. Na telefonu leží pod fotkou, ne schovaný — produkt
na nejčastější obrazovce skrývat popírá smysl hero.

## Video v hero je fotka, která ožila

Video vzniklo z téže fotky baristy, která pod ním leží jako poster — když
se nenačte, nehraje, nebo ho člověk nechce, nikdo nepozná, že mělo být.
Stahuje se jen od 768 px (na telefonu jsou stovky kilobajtů za pět vteřin
pohybu špatný obchod), bez `saveData`, bez 2G a bez `prefers-reduced-motion`.
Zdroj se do `<video>` vkládá až po tom rozhodnutí; prohlížeč by jinak začal
stahovat, i když se pak neukáže. Dva zdroje: VP9 WebM (126 kB) napřed,
H.264 MP4 (144 kB) jako záloha pro Safari.

Měřidlo: headless Chromium v Playwrightu **nemá H.264**. Sonda s jediným
MP4 hlásila `readyState 0` a vypadalo to jako chyba aplikace. Než se
z takového nálezu cokoli opraví, zeptej se prohlížeče `canPlayType` — tady
odpověděl `ne` pro H.264 a `probably` pro VP9.

## Správa platformy: nad podniky, ne v jednom z nich

Správce platformy vidí všechny podniky a každé jeho kliknutí zasáhne cizí
provoz. Obrazovka to musí říkat dřív, než kdo klikne:

- **Stejný jazyk, jiný pás.** Karty, řádky, chipy a okna jsou tytéž jako
  v aplikaci; horní lišta má navíc chip „superadmin" a žádnou navigaci
  podniku. Kdo tu je, ví, že není doma.
- **Nevratné jde přes okno s důvodem pro majitele.** Pozastavení podniku
  chce důvod (aspoň tři znaky) a okno říká, co se stane a komu. Nápověda
  u pole říká „piš pro něj, ne pro sebe" — důvod podnik uvidí.
- **Každý zásah má aktéra.** Z obrazovky e-mail, z MCP „api-token"
  (chip „MCP / skript"). Bez toho by se nedalo poznat, jestli podnik
  pozastavil člověk, nebo Claude.
- **Stav je jeden slovník.** `STAV_NAZEV`/`STAV_TON` v
  `components/admin/spolecne.ts`; „pozastavený" je `bad`, „po splatnosti"
  `wait`, „zkušební" `info`. Seznam, detail i historie ho sdílejí.
- **Co tu schválně není:** přihlášení za jiného, čtení uzávěrek a mezd,
  mazání podniků. Tlačítko, které neexistuje, se nedá stisknout omylem.

Hlídá to `scripts/check-admin-auth.mjs`: žádná admin routa bez brány,
middleware s blokací existuje, `lib/superadmin.ts` je bez Node importů.

## Plocha widgetů

Od kol 68–69 je každá pracovní stránka **plocha**: shora `PageHeader`
(jediný h1), pod ním chrom stránky (přepínač pohledu, filtry — nehýbe se)
a mřížka widgetů. Na pracovních stránkách je v mřížce i hlavní **nástroj**
(seznam skladu, uzávěrek, rozvrh) jako povinná položka přes celou šířku.
Plochu si každý poskládá jako domovskou obrazovku iPhonu; vedení může dát
výchozí rozložení celému vedení, zaměstnancům, jedné roli nebo tabletu
a zamknout ho. Mechaniku drží `components/widgety/PlochaWidgetu.tsx`, čistou
logiku `lib/widgety/` (bez Reactu, běží na serveru, v klientu i v testech).
Žádná obrazovka si vlastní režim úprav, lištu ani galerii nestaví.

Plochu nemají chat (jedna plocha přes celou výšku), Nastavení (formulář),
hostovská část a správa platformy — do provozu nepatří.

### Stránka

Každá stránka je jeden soubor `lib/widgety/stranky/<id>.ts` s
`DefiniceStranky` (typ v `lib/widgety/typy.ts`), registr `STRANKY`
a `stranka(id)` je v `lib/widgety/stranky/index.ts`. Id má tvar
`<rozhraní>.<název>` (`vedeni.sklad`, `zamestnanec.domu`, `kiosk.smena`).

| Pole | Co znamená |
|---|---|
| `rozhrani` | `vedeni` / `zamestnanec` / `kiosk` — typ role, pro kterou stránka je; jiný typ dostane 403 |
| `pohled`, `pristup` | klíč pohledu v layoutu a klíče oprávnění, které ho otevírají (stejné jako `KLICE_POHLEDU`; `null` = každý) |
| `aktivni` | plochu už kreslí; `false` = GET vrátí 404 a Nastavení → Stránky ji nenabízí. Dnes je aktivních všech 36 |
| `nastroj` | `{ nazev, ikona, popis }` hlavní pracovní části, nebo `null` (Přehled, Domů, TO GO) |
| `vychozi` | výchozí rozložení z aplikace pod klíči `typ:<rozhraní>` a volitelně `role:<klíč>`; položky ve zkratce `{ w, s?, o? }` (widget, velikost, nastavení) |
| `doporucene` | widgety první skupiny galerie „Doporučené pro tuto stránku" |
| `inkoust` | smí mít jeden inkoustový widget peněz (Přehled, TO GO, Finance, Uzávěrky) |

### Widget

Widget je **typ bloku** z katalogu; jeho výskyt na ploše je **instance**
s vlastním `id`, velikostí a nastavením. Metadata (`DefiniceWidgetu`) jsou po
oblastech v `lib/widgety/katalog/<oblast>.ts` bez Reactu — server je
potřebuje kvůli validaci a oprávněním. Komponenty jsou zvlášť v
`components/widgety/oblasti/<oblast>.tsx` (`export const KOMPONENTY`)
a `components/widgety/registr.ts` stahuje oblast líně, až když je na ploše.

- **Id `oblast.jmeno` je neměnné** (`sklad.dochazi`): leží uložené
  v rozloženích lidí. Přejmenovat widget znamená migraci, ne úpravu textu.
- **Velikosti S / M / L** (`velikosti`, `vychoziVelikost`): S = jeden
  sloupec, M = dva, L = celá řada. Widget nabízí jen velikosti, ve kterých
  má co ukázat.
- **Stav `hotovo` / `planovany`.** Plánovaný widget nemá komponentu: nikde se
  nekreslí, galerie ho nenabízí a normalizace ho z rozložení zahodí. Kolo 69
  skončilo se 122 hotovými a nula plánovanými.
- **Oprávnění** `opravneni.vse` (musí mít všechny), `opravneni.nektere`
  (aspoň jedno, prázdné = bez podmínky) rozhodují, jestli widget pro diváka
  **existuje** (`jeViditelny` v `lib/widgety/rozlozeni.ts`, stejná funkce na
  serveru i v klientu, k tomu rozhraní a tarif). `opravneni.pole` jsou
  části widgetu podle dalších klíčů — číslo, fronta, tlačítko; tlačítka
  s předponou `akce:` (`'akce:ukoncit': 'dochazka.upravit'`). Komponenta se
  na ně ptá přes `useSmi()` z `components/widgety/NavigaceKontext.tsx`.
- **Klíč v katalogu je povinný, i když API hlídá samo.** Katalog kola 68
  našel tři endpointy, které pustily víc, než měly; widget se na API
  nespoléhá.
- Dál `tarif`, `vicekrat` (odkaz, stav kategorie), `muzeInkoust`, `kostra`
  (tvar Skeletonu) a `nastaveni` (schéma polí; UI polí je
  `components/widgety/upravy/PoleNastaveni.tsx`).

### Nástroj

`nastroj` je položka rozložení jako každá jiná, jen **povinná**: normalizace
ji doplní právě jednou (když chybí, na místo z výchozího rozložení), stránka
bez nástroje ji zahodí. Vždy přes celou šířku a v klidu **bez obalu karty** —
kreslí se tak, jak ho stránka nakreslí.

V úpravách je místo nástroje **sbalený zástupce**: `Card` s ikonou, názvem
nástroje a větou „Hlavní část stránky — v úpravách je sbalená.", bez „−",
přesunutelný nad widgety i pod ně. Skutečný nástroj přitom zůstává
**připojený s `hidden`** — rozepsaný formulář, filtr ani pozice v seznamu se
vstupem do úprav neztratí. Odmontovat ho by bylo jednodušší a stálo by
člověka rozepsanou práci.

### Čí rozložení platí

Rozložení je pole `{ id, widget, velikost, nastaveni }`, pořadí na obrazovce
= pořadí v DOM = pořadí pro Tab i odečítač (proto mřížka nemá
`grid-flow-dense`). Ukládá se do jedné tabulky `rozlozeni_stranek` po
**rozsazích**: `osobni:<userId>`, `role:#<id>` (vlastní role), `role:<klíč>`
(systémová role), `typ:<rozhraní>`. `vyresRozlozeni()` vybírá v tomhle
pořadí:

1. **zamčené výchozí podniku** — platí pro každého kromě správce;
2. **osobní** rozložení;
3. **výchozí podniku**, nejkonkrétnější, jaké existuje: `role:#<id>` →
   `role:<klíč>` → `typ:<rozhraní>`;
4. starý `teams.dashboard_config` (jen Přehled a Domů, dokud je init
   nepřevede — `lib/widgety/migrace.ts`);
5. **výchozí z aplikace** — `vychozi` v souboru stránky.

GET o tom vrací `zdroj`: `osobni`, `podnik`, nebo `aplikace`. Osobní řádek
vzniká až první úpravou (kopie při zápisu); kdo si stránku jednou upravil,
výchozí podniku už nevidí, dokud nedá „Obnovit výchozí rozložení" nebo
vedení nezamkne. Je to záměr, jako na iOS — a vedení to proto říká věta
v okně „Uložit jako výchozí".

**Pravidlo tří.** Výchozí z aplikace pro roli (`role:<klíč>`, u vlastní
role pro systémovou, ze které vznikla) platí, jen když z něj divák uvidí
**aspoň tři widgety a zároveň aspoň polovinu jeho položek**
(`PRAVIDLO_TRI`, `PRAVIDLO_TRI_PODIL` v `lib/widgety/konstanty.ts`); jinak
dostane výchozí svého typu. Samotná trojka nestačila: Skladník s tarifem
Max viděl tři widgety z deseti, se slabším tarifem padl na plné výchozí
vedení — vyšší tarif znamenal chudší plochu.

**Skryté se neztrácí.** Server vrací jen viditelné položky, ale při zápisu
položky bez oprávnění nebo tarifu **nezahodí** — `zachovejSkryte()` je
vrátí za jejich posledního viditelného předchůdce. Bez toho by stačilo
jednou přeskládat plochu během výpadku tarifu a všechny widgety Pro by
zmizely natrvalo. Totéž platí pro výchozí, které ukládá správce, jenž
některé widgety sám nevidí.

**Verze a 409.** Každý řádek má `verze`. Klient posílá verzi, kterou viděl
(0 = řádek ještě není), a zápis platí jen `WHERE verze = …`. Když se
rozešla (druhé okno bylo rychlejší), přijde **409 s `aktualni`**: klient
převezme novější stav serveru, řekne to toastem a vyprázdní „Vrátit" —
vracet do stavu, který už neexistuje, by přepsalo cizí změnu. Síťová chyba
a 5xx naopak model **nechají** („Neuloženo · Zkusit znovu", nový pokus po
2, 5 a 15 s): změna je záměr člověka. Zápisy se slučují 400 ms, běží nejvýš
jeden a při odchodu ze stránky se dopíšou s `keepalive`
(`components/widgety/useRozlozeni.ts`).

**Zamčené rozložení.** Výchozí nastavuje a zamyká ten, kdo má
`podnik.nastaveni` (u tabletu stačí `kiosk.spravovat`) — z plochy přes
„Uložit jako výchozí pro…", nebo v Nastavení → Stránky
(`components/widgety/VychoziRozlozeni.tsx`). U zamčené stránky nemá divák
„Upravit", podržení nic neotevře a UI nepošle ani jeden PUT; kdyby ho
poslalo, server odpoví 403 (`smiUpravitRozlozeni`). Osobní řádek se zámkem
**nemaže** — po odemčení se člověku vrátí jeho plocha. Tablet úpravy nemá
vůbec: je sdílený, jeho rozložení skládá vedení.

API: `app/api/rozlozeni/route.ts` (GET/PUT/DELETE osobního),
`app/api/rozlozeni/vychozi/route.ts` (výchozí podniku), SQL v
`lib/widgety/rozlozeniDb.ts`.

**Rozhodnutí, která drží tvar:**

- **Widget bez oprávnění neexistuje.** Server ho nevrátí, galerie ho
  nenabídne a klient ho nepřipojí — data se načtou až při `nacteno && ma()`.
  `ma()` před načtením oprávnění vrací ANO, pro widget to nestačí. Žádný
  zamčený ani rozmazaný náhled: prozradil by, že data existují.
- **Každá změna se uloží hned**, optimisticky — žádné „Uložit" na konci
  úprav, které by člověk zapomněl.
- **Žádná knihovna na tah ani pružiny.** Náhled pořadí přes CSS `order`
  (přesun uzlu v DOM by uvolnil pointer capture a tah by se utrhl),
  rychlost prstu se předá pružině, pokračování tahem z menu — tohle
  hotové knihovny neumí.

### Vzhled

- **Widget** je vždy `<Widget>` z `components/widgety/Widget.tsx` =
  `Card as="section"`: titulek `h2.t-card` s ikonou 17 px `text-black/40`
  (bez kolečka), odkaz dál jako `Button ghost sm` s chevronem, čísla `Stat`,
  seznamy `.list` + `ListRow` (ve střední velikosti nejvýš 5 a „…a dalších
  N"). Všechny čtyři stavy: kostra, `ErrorState compact` se „Zkusit znovu",
  prázdno větou, a bez oprávnění nic. Pád jednoho widgetu neshodí plochu.
- **Limetka ve widgetu nikdy.** V úpravách je jedinou limetkou „Hotovo",
  v klidu přehledy limetku nemají vůbec. Widgety jsou bílé karty, i „Čeká
  na tebe" (stav nese jantarový chip s počtem u titulku). Tónovaná karta
  jen pro výpadek nebo chybějící uzávěrku (danger), nejvýš jedna na
  obrazovce; inkoustovou plochu nejvýš jeden widget peněz na stránce.
- **Mřížka podle šířky plochy, ne okna** (boční pás, TO GO, náhled
  v Nastavení): 4 sloupce od 840 px, 2 od 300 px, jinak 1
  (`lib/widgety/mrizka.ts`). V klidu se zbylé sloupce řady rozdělí mezi její
  položky (žádná osiřelá buňka), v úpravách platí jmenovité velikosti, aby
  se karty neměnily pod prstem.
- **Vlnění:** úhel podle úhlopříčky karty (roh se vychýlí o 2,3 px, strop
  1,2°), délka kmitu 239–283 ms a fáze z hashe id (`lib/widgety/hash.ts`) —
  sousedé se nekývou v zákrytu a fáze je stálá mezi překresleními. Hýbe se
  jen `transform`.
- **Nastavení → Stránky** kreslí widgety jen schematicky, bez dat:
  správce vidí, co kde bude, ale data jiných lidí mu neprotečou.

## Úpravy jako na iPhonu

Hodnoty podržení, vlnění, tahu a pružiny jsou na jednom místě v
`lib/widgety/konstanty.ts` — ladí se na skutečném iPhonu a Androidu,
emulace v Chromiu nepozná callout, výběr textu ani kolizi podržení
s rolováním.

- **Vstup do úprav:** podržení prázdného místa 500 ms, „Upravit"
  v hlavičce (`secondary`, ikona tužky; když stránka má dvě vlastní vedlejší
  akce, je „Upravit stránku" v „···", na telefonu vždy v „···") nebo
  položka kontextového menu. Při vstupu tlačítkem nebo klávesnicí jde fokus
  na první widget, při podržení zůstane, kde byl.
- **Kontextové menu** (`components/widgety/KontextoveMenu.tsx`): podržení
  widgetu 500 ms, pravé tlačítko myši (hned) nebo Shift+F10. Položky
  **Nastavit widget · Upravit stránku · Odebrat widget** (ne „Upravit
  widget / Upravit plochu" — dvě položky začínající stejným slovem se
  v menu o třech řádcích pletou); v úpravách místo „Upravit stránku"
  **Posunout výš / Posunout níž**. „Nastavit" jen tam, kde je co nastavit,
  „Odebrat" poslední a červeně. Panel je `MenuPanel` z `Menu.tsx`, roste
  z místa stisku; na dotyku leží pod widgetem, ať ho prst nezakryje. Pohyb
  o víc než 10 px podržení zruší, protože skoro každé rolování přehledu
  začíná na nějakém widgetu. Když se prst po otevření menu pohne, menu
  zmizí a tentýž widget se zvedne pod prstem (jako na iOS; na dotyku
  best-effort).
- **Vlnění:** v úpravách se widgety kývou (`.w-kyv`), zmenší na 0,98,
  odznaky „−" naskočí všechny najednou. Vlnění je deklarované jen uvnitř
  `prefers-reduced-motion: no-preference` — globální pravidlo
  `animation-duration: .01ms` by ho jinak nechalo jednou škubnout.
- **Tah s pružinou** (`components/widgety/upravy/useTazeni.ts`): myš po
  4 px pohybu, prst po 180 ms držení bez pohybu. Rychlý švih stránku
  posune — plocha iOS se svisle neposouvá, naše stránky ano, takže okamžitý
  tah by znemožnil rolovat. Karta jde 1 : 1 se stálým offsetem úchopu,
  nový cíl platí, až v něm prst vydrží 80 ms, ostatní uhýbají pružinou.
  Pružina (`krok()` v `lib/widgety/pruzina.ts`) má kritické tlumení
  a odezvu 0,35 s v uzavřeném tvaru — nic se neintegruje, výsledek
  nezávisí na snímkové frekvenci a pružinu jde kdykoli přerušit novým cílem
  bez ztráty rychlosti. **Puštěná karta dosedne s rychlostí prstu**
  (`rychlostZVzorku`): počítá se z posledních vzorků nejvýš 100 ms před
  puštěním a puštění samo je poslední vzorek. Když prst zastaví a drží,
  `pointermove` nechodí — rychlost z pohybu před zastavením by kartu
  „odhodila" až 2 500 px/s; takhle ji pauza srazí na nulu. U okraje se
  stránka roluje sama. V úpravách `touch-action: pan-y` a nepasivní
  `touchmove` jen během tahu.
- **Galerie „Přidat widget"** (`components/widgety/upravy/GalerieWidgetu.tsx`)
  z plovoucí inkoustové lišty dole nebo z buňky „+" na konci mřížky:
  `Modal lg` (na telefonu list zdola), hledání bez diakritiky, první
  skupina **Doporučené pro tuto stránku** (z `doporucene`; při hledání se
  schová, jinak by zdvojovala výsledky), pak oblasti v pevném pořadí.
  Nabízí jen to, co divák smí; živé náhledy se kreslí, až když doroluje.
  Detail s výběrem velikosti je v tomtéž okně. Nový widget jde na konec,
  z lišty před nástroj, pokud je nástroj poslední.
- **Lišta úprav** (`components/widgety/upravy/ListaUprav.tsx` na
  `PlovouciLista`): „Přidat widget", „···" (obnovit výchozí, uložit jako
  výchozí pro…) a „Hotovo" jako jediná limetka. Lišta je vždy na dosah
  palce; tlačítko v hlavičce by po odrolování zmizelo.
- **Odebrat a Vrátit:** „−" odebere hned a bez potvrzení — nic se nemaže.
  Toast „Widget odebrán" s **Vrátit** drží 6 s, v úpravách funguje i
  Ctrl/Cmd+Z; zásobník má 20 kroků a platí do odchodu ze stránky. Vrátit
  pošle PUT jako každá jiná změna.
- **Klávesnice (tah nikdy není jediná cesta):** Tab na widget, šipky
  přesouvají o místo, Home/End na kraj — hned a **bez animace** (akce
  z klávesnice se neanimují) a každý přesun odejde jako PUT. Enter otevře
  menu s Posunout výš/níž, Delete odebere, Escape úpravy ukončí a fokus
  vrátí na „Upravit". Odečítač slyší „název, velikost, pozice i z n"
  a každou změnu přes `aria-live`.
- **Omezený pohyb:** žádné vlnění ani zmenšení, přesuny rovnou na místo;
  úpravy pozná podle přerušovaného obrysu karet a odznaků „−". JS čte
  `prefers-reduced-motion` živě, takže se pružiny vypnou i za běhu.
- **Haptika** (`navigator.vibrate(8)`, jen dotyk) jen u otevření menu
  podržením, vstupu podržením, zvednutí, puštění se změnou pořadí
  a odebrání „−". Víc zpětné vazby naučí lidi ji ignorovat.
- **Odchod z úprav:** „Hotovo", Escape, klepnutí na prázdné místo plochy
  nebo na hlavičku. Fronta zápisů se odešle hned.

## Jak přidat stránku nebo widget

Pořadí se vyplatí dodržet — každý krok má kontrolu, která spadne, když se
předchozí přeskočí.

1. **Widget do katalogu.** `DefiniceWidgetu` do
   `lib/widgety/katalog/<oblast>.ts` (index `katalog/index.ts` se nemění).
   Ikona musí existovat v `components/Icons.tsx`, klíče oprávnění
   v `lib/opravneniKatalog.ts`. Dokud není komponenta,
   `stav: 'planovany'`.
2. **Komponenta v oblasti.** Funkce v `components/widgety/oblasti/<oblast>.tsx`,
   zapsaná do `KOMPONENTY` pod id z katalogu. Pravidla: kreslí se vždy
   v `<Widget>`; data jen přes `useDataWidgetu(url)`
   (`components/widgety/useDataWidgetu.ts`, sdílená mezipaměť 30 s) a URL
   je `null`, dokud neplatí `useSmi()` pro pole, na které se ptá; všechny
   čtyři stavy; žádné `accent`; odkaz dál jen přes `odkaz={{ popisek,
   pohled }}` (na pohled, kam divák nesmí, se sám nekreslí); v
   `nahled === true` žádné zápisy ani navigace; peníze `useMoney`
   (`components/CurrencyProvider.tsx`), tvary po číslovce `lib/czech.ts`,
   čas `lib/pragueTime.ts`. Pak přepni `stav: 'hotovo'`.
3. **Stránka.** Soubor `lib/widgety/stranky/<id>.ts` (nová stránka navíc
   id do `IdStranky` v `lib/widgety/typy.ts` a do `STRANKY`): `aktivni`,
   `nastroj`, `vychozi` pro typ a případně role, `doporucene`, `pristup`.
   V obrazovce vlastní hlavičku nahradí
   `<PlochaWidgetu stranka="…" hlavicka={{ title, subtitle, primary,
   secondary, menu, aside, hintId }} nastroj={…} />` — vzor
   `components/employer/Inventory.tsx`. Jediná limetka stránky jde do
   `primary` (v úpravách se schová), nejvýš dvě vedlejší akce do
   `secondary`; bloky, které stály natvrdo nad seznamem, se stanou widgety.
4. **Testy.** `npm test` pouští `scripts/testy/k68-widgety.ts`, který hlídá
   **AK-19** (ve výchozím rozložení stránky se neopakuje ikona — kreslí se
   jen hotové widgety a nástroj) a **AK-20** (katalog je konzistentní:
   unikátní id, výchozí velikost mezi povolenými, ikony a klíče existují,
   výchozí rozložení odkazují na widgety správného rozhraní, `hotovo` ⇔
   komponenta v oblasti). Vlastní testy do `scripts/testy/<klíč>.ts`
   s `export default function ({ eq, ok }: Testy)` (typ v
   `scripts/testy/_testy.ts`) — `npm test` je najde sám. Relativní importy
   s příponou `.ts`, žádné `@/`, žádné JSX (hlídá `check-test-imports`).
5. **Sonda** `scripts/sondy/k69-<klíč>.mjs` nad společným podvrhem
   `scripts/sondy/k68-spolecne.mjs`, fixtury `fixtury/k69-<klíč>-*.json`.
   Pro každou stránku tvrdí: jeden h1 jako první prvek a v klidu vidět
   nástroj (`li[data-widget="nastroj"]`); v úpravách zástupce bez „−",
   přesunutý nad widget i pod něj → PUT; galerie nabízí widgety stránky
   v „Doporučené"; role bez klíče widget nevidí a jeho endpoint **se
   nevolá**; 500 na jednom endpointu shodí jen jeden widget; telefon
   390 px bez přetečení s použitelnou hlavní akcí; rozepsaný formulář
   v nástroji přežije vstup do úprav a výstup z nich.
6. **Do CI.** Až sonda projde, připiš ji do `ZELENE` ve
   `scripts/sondy/spust.mjs`. Kdo sondu rozbije, opraví kód, ne seznam.

## Posuvný pás a rozbalovací panely

**`Segmented` je vždy jeden řádek.** Co se nevejde, jede prstem do strany
uvnitř vlastního pásu (`overflow-x-auto`, přichycení, položky
`whitespace-nowrap`), nikdy se nezalamuje. Dřív se šest a víc položek na
telefonu zalomilo na dva řádky a přepínač vypadal jako hromádka textu, ne
jako jedna ovládací lišta. Že je kus mimo, prozradí vyblednutý okraj
(jen na straně, kde něco je) a vybraná položka se sama posune do záběru —
přes `scrollLeft` pásu, ne `scrollIntoView`, který by posunul i celou
stránku. Tmavá pilulka leží uvnitř pásu, takže jede s obsahem. Filtrovací
pás pilulek se chová stejně.

**Rozbalovací panel se vejde na obrazovku.** Panely se kotví k tlačítku
(`absolute right-0`), a na telefonu to nestačí: „···" vlevo v hlavičce
s panelem zarovnaným doprava utekl z levého okraje a půlka položek byla
mimo. `lib/useVejdiSe.ts` panel po otevření změří, posune zpátky dovnitř
s okrajem 16 px (stejná mezera jako obsah stránky) a když je vyšší než
místo pod kotvou, dá mu strop a vlastní posuv. Posouvá přes CSS vlastnost
`translate`, ne `transform`, aby se nepral s animací `pop-in`, a měří
z rozvržení (`offsetLeft`), ne z `getBoundingClientRect` — panel právě
škáluje z 0,96 a vlastní posun by se započítal podruhé. Má ho `Menu`,
`components/PodnikSwitcher.tsx` i `components/NotificationBell.tsx`;
každý nový rozbalovací panel ho dostane taky.

**Přilepená lišta nástroje.** Lišta s hledáním a kategoriemi se při
rolování přilepí nahoru a sbalí na jeden řádek, aby nežrala obrazovku.
Že se přilepila, pozná `IntersectionObserver` na jednopixelové značce nad
ní — ne posluchač na každý posun. **Hlídač se zapíná přes callback ref**
(`ref={setSentinelEl}` do stavu a efekt závislý na tom prvku), ne `useRef`
s efektem `[]`: na ploše přichází nástroj až s rozložením, takže efekt po
prvním vykreslení našel prázdný ref, lišta se nikdy nesbalila a celý
průhledný panel kategorií zůstal přilepený přes seznam (Sklad, kolo 69).
Obecně: cokoli uvnitř nástroje, co se měří nebo pozoruje, nesmí spoléhat
na to, že při prvním vykreslení existuje. Vzor
`components/employer/Inventory.tsx`.

## Anti-vzory (zdejší zákazy)

Karta v kartě; víc než jedna limetková akce na obrazovce; ručně psané
pilulky, panely a štítky místo `.btn`/`.note`/`.t-label`; nové rádiusy
mimo tři tokeny; nové barvy mimo paletu; Title Case v češtině; `capitalize`
na datech; `String(date).slice` a `toDateString()` místo pragueTime; písmo pod 11 px;
`transition: all`; `ease-in` na UI; hover efekt bez `hover: hover`;
blur mimo plovoucí lištu, dock a topbar; `<div onClick>` bez `role`
a `tabIndex`; tlačítko bez `type` uvnitř `<form>`; tiše oříznutý seznam; fronta
ke schválení, kde jde schvalovat jen po jednom; dva tvary po číslovce;
oslava akce, u které se nezkontrolovalo `res.ok`; vlastní režim úprav,
lišta nebo galerie widgetů mimo `PlochaWidgetu`; widget bez `<Widget>`,
s vlastním `fetch` nebo s `accent`; `grid-flow-dense` a `touch-action: none`
na ploše; vlnění mimo režim úprav a animace přesunu z klávesnice.
