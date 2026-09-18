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
| `.card-accent` / `.card-wait` / `.card-danger` / `.card-info` | tónovaná karta: „čeká na tebe“, chybí uzávěrka, upozornění |
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
- Přepínač pohledu: `Segmented` (tmavá pilulka klouže, `aria-selected`).
- Statistiky: `Stat` / `StatRow` (štítek `.t-label`, číslo 28 px tabular).

## Komponenty (components/ui)

Než něco napíšeš znovu, podívej se sem. Tenhle seznam byl chvíli o devět
kusů pozadu a to je nejjistější způsob, jak vznikne desátá podoba téhož.

**Rozvržení a text:** PageHeader (title/subtitle/primary/secondary/aside/
menu), Section (t-section + jedna akce vpravo), Card/Well, Stat/StatRow,
Chip, ListRow, Avatar/Initials.

**Ovládání:** Button, Segmented, Menu (roste z tlačítka, `pop-in` 160 ms),
Field/Label/Input/Select/Textarea, SearchField (poslední hledání, návrhy,
klávesnice), Modal (sm/md/lg + `sheet`), Toast.

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
- „Čeká na tebe“: `card-wait` s chipy-prokliky, jeden na obrazovce.
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
`npm run build` a dvacet kontrol ze `scripts/check-*.mjs`:

`check-contrast-classes` · `check-czech` · `check-dark-classes` ·
`check-dead-ends` ·
`check-decimal-inputs` · `check-email` · `check-fetch-ok` · `check-forms` ·
`check-generic-copy` · `check-ics` · `check-modals` · `check-money` ·
`check-labels` · `check-palette` · `check-silent-load` · `check-silent-mutation` ·
`check-test-imports` · `check-time` · `check-transitions` ·
`check-width-clash`

Vizuálně: Playwright přes 62 obrazovek (46 administrace, 15 klient,
sdílený odkaz) na
1280 a 390 px, se sweepem přetečení, věčných skeletonů, prázdných stránek
a dotykových cílů — vše 0. K tomu sondy na klávesnici, hromadné akce
a filtry.

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
`.lg-blob` pod nimi, hravé 3D objekty z clay renderů (`public/brand/landing`,
generované, ne fotobanka). Aplikace sama zůstává u klidnějšího `.glass-card`.

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
- **Těžké věci líně a s náhradou.** Video v hero se přidá až po obrázku
  a jen bez `saveData`; otočka hrníčku se stáhne až u sekce a když selže,
  zůstane obrázek. Stránka nikdy nečeká na ozdobu.
- **Dekorace nepřináší vlastní paletu.** Značka je krém, inkoust a limetka
  plus pět stavových tónů — a to platí i pro skvrny pod sklem a pro
  vygenerované objekty. V první verzi tu byla broskvová a modrá skvrna
  a syrová tailwindová `amber-400` v ukázkových tečkách; obojí šlo ven.
  Tečka, která na prodejní stránce hlásí „dochází mléko", má přesně ten
  tón, který uživatel uvidí uvnitř aplikace (`.dot-ok` / `.dot-wait` /
  `.dot-muted` nad `--ok` / `--wait` / `--muted`).

### Vygenerované 3D objekty

Clay rendery v `public/brand/landing` drží tři pravidla, protože bez nich
vypadají levně:

- **Jen ta věc samotná.** Žádná pára, kouř, částice, odlesky do prázdna ani
  rekvizity kolem. U 3D objektu čte oko každou abstraktní přimíchaninu jako
  chybu renderu, ne jako atmosféru.
- **Prázdné pozadí, ne scéna.** Objekt stojí na jednolitém podkladu
  s měkkým kontaktním stínem. Ve skle se pak propojí násobením
  (`mix-blend-multiply` u otočky), takže v panelu není vidět obdélník videa.
- **Paleta značky.** Krémová keramika, limetkový proužek, inkoustový stín —
  nic dalšího.

Vyplatí se to napsat do promptu výslovně („NO steam, no props, plain solid
white background") a pak výsledek ověřit, ne odhadnout: zdejší headless
prohlížeč H.264 nepřehraje, takže obsah smyček se kontroluje strojovým
popisem scény.

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

## Anti-vzory (zdejší zákazy)

Karta v kartě; víc než jedna limetková akce na obrazovce; ručně psané
pilulky, panely a štítky místo `.btn`/`.note`/`.t-label`; nové rádiusy
mimo tři tokeny; nové barvy mimo paletu; Title Case v češtině; `capitalize`
na datech; `String(date).slice` a `toDateString()` místo pragueTime; písmo pod 11 px;
`transition: all`; `ease-in` na UI; hover efekt bez `hover: hover`;
blur mimo plovoucí lištu, dock a topbar; `<div onClick>` bez `role`
a `tabIndex`; tlačítko bez `type` uvnitř `<form>`; tiše oříznutý seznam; fronta
ke schválení, kde jde schvalovat jen po jednom; dva tvary po číslovce;
oslava akce, u které se nezkontrolovalo `res.ok`.
