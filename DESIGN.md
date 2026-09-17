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

Button, PageHeader (title/subtitle/primary/secondary/aside/menu), Section
(t-section + jedna akce vpravo), Segmented, EmptyState, Skeleton/PageSkel
(shimmer), Menu (roste z tlačítka, `pop-in` 160 ms), Avatar/Initials,
Card/Well, Field/Label/Input/Select/Textarea, Chip, ListRow, Stat/StatRow,
Toast. Klient navíc: StatCard, SectionTitle, TableMap.

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

Před pushem: `npm run typecheck && npm test && npm run build` + skripty
`check-time`, `check-decimal-inputs`, `check-width-clash`,
`check-contrast-classes`. Vizuálně: Playwright screenshoty všech ~100
obrazovek (desktop 1280, mobil 390, úzký 320) a sweep přetečení, dotykových
cílů, duplicitních id a vnořených klikatelných prvků — vše 0.

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

## Anti-vzory (zdejší zákazy)

Karta v kartě; víc než jedna limetková akce na obrazovce; ručně psané
pilulky, panely a štítky místo `.btn`/`.note`/`.t-label`; nové rádiusy
mimo tři tokeny; nové barvy mimo paletu; Title Case v češtině; `capitalize`
na datech; `String(date).slice` místo pragueTime; písmo pod 11 px;
`transition: all`; `ease-in` na UI; hover efekt bez `hover: hover`;
blur mimo plovoucí lištu, dock a topbar.
