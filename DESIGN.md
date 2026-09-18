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

## Anti-vzory (zdejší zákazy)

Karta v kartě; víc než jedna limetková akce na obrazovce; ručně psané
pilulky, panely a štítky místo `.btn`/`.note`/`.t-label`; nové rádiusy
mimo tři tokeny; nové barvy mimo paletu; Title Case v češtině; `capitalize`
na datech; `String(date).slice` a `toDateString()` místo pragueTime; písmo pod 11 px;
`transition: all`; `ease-in` na UI; hover efekt bez `hover: hover`;
blur mimo plovoucí lištu, dock a topbar; `<div onClick>` bez `role`
a `tabIndex`; tlačítko bez `type` uvnitř `<form>`; tiše oříznutý seznam; fronta
ke schválení, kde jde schvalovat jen po jednom; dva tvary po číslovce.
