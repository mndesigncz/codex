# Managero — DESIGN.md

Vizuální systém zachycený z kódu (app/globals.css, components/ui). Jedna
aplikace, tři prostředí: administrace, TO GO/kiosk, Managero client — vše
mluví stejným jazykem.

## Tón

Světlé, klidné, papírově zelenkavé pozadí s jemným zrnem; jedna limetková
jako jediná hlavní akce na obrazovce; tmavá inkoustová pro vybraný stav.
Sklo (blur) jen jako materiál karet a lišt, ne dekorace.

## Tokeny

- Pozadí: `#F1F3ED` (hostovská část natvrdo, jinak `--bg` s jemnými
  radiálními světly limetky a modré). Přes celou stránku leží pevné zrno
  (`body::after`, 3,5 % multiply; ve tmavém 5 % screen) — vypíná se při
  `prefers-reduced-transparency` a v tisku.
- Inkoust: `#16181A`; sekundární text `black/55–70`.
- Značková limetka: `#C8F542` (na ní vždy tmavý text; text limetkové řady
  na světlém podkladu ztmavený na `#4F6A07`/`#3E5406` kvůli kontrastu).
- Stavové: čeká `amber-500/15` + `amber-800`; chyba `red-500/10` +
  `red-700`; hotovo `black/[0.06]`.
- Rádiusy: karty `rounded-3xl`/`rounded-[28px]`, pole `rounded-2xl`,
  tlačítka a chipy `rounded-full`.
- Písmo **Geist** (balíček `geist`, self-hosted, `--font-geist-sans`);
  kódy kartiček a kuponů **Geist Mono** (`font-mono`). Nadpisy `font-bold
  tracking-tight(er)`; h1 `-0.022em`, h2 `-0.015em`; čísla `tabular-nums`;
  štítky sekcí `text-[11px] uppercase tracking-wider text-black/45–50`;
  minimum písma 11 px; odstavce `text-wrap: pretty` (globálně).

## Komponenty (components/ui)

Button (accent = limetková, jediná primární; primary = tmavá; secondary,
ghost, danger; icon/loading/size), PageHeader (title/subtitle/primary/
secondary/aside/menu), Segmented (jedna tmavá pilulka, která KLOUŽE mezi
položkami — měří se z DOM, `aria-selected`, `wrap`), EmptyState (ikona,
titulek, hint, akce), Skeleton/PageSkel (shimmer pruh, ne pulz), Menu
(popover roste z tlačítka: `origin-top-right/left` + `pop-in` 160 ms),
Avatar/Initials (tmavé kolečko, limetkové iniciály). Klient navíc: StatCard
(štítek, ikona v tónovaném kolečku, číslo), SectionTitle (ikona v kolečku +
akce vpravo), TableMap (pilulky stolů na tečkovaném plánku).

## Vzory

- Navigace: desktop levý rail (administrace) nebo horní záložky (client);
  mobil vždy spodní dock `dock-strong` (3–4 položky + Více → MobileMoreSheet).
- „Čeká na tebe": oranžový panel s chipy-prokliky, jeden na obrazovce.
- Karty seznamů: `glass-card` + `divide-y divide-black/[0.06]`; řádek =
  Initials + obsah + chip stavu vpravo.
- Chip stavu: `rounded-full text-[11px] font-semibold` v stavové barvě.
- Kontrolní seznam propojení: řádky s kolečkem (limetka = hotovo) a šipkou.
- Formuláře: `label` 12px semibold, pole `bg-white/70 border-black/[0.08]`
  s limetkovým focus ringem; destruktivní akce vždy s confirm.

## Pohyb a přístupnost

Křivky: `--ease-out` `cubic-bezier(0.23,1,0.32,1)` pro vstupy a výstupy,
`--ease-in-out` pro pohyb po obrazovce, `--ease-drawer` pro zásuvky
(Tailwind `ease-out`/`ease-in-out`/`ease-drawer` na ně míří). Doby:
stisk 120 ms, změna stavu 220 ms, příchod plochy 340 ms; menu a popovery
≤ 160 ms; nic přes 300 ms mimo modály. Vstup nikdy ze `scale(0)` — z 0.96
s opacitou. `active:scale-[0.97]` na stisk (globálně na `button`); žádné
animace klávesových akcí. Hover jen pod kurzorem
(`future.hoverOnlyWhenSupported` v Tailwindu). Kolečko načítání 0,7 s.
Dotykové cíle ≥36 px (`tap-target(-sm)`), `cz-sentence` pro česká data,
`aria-pressed` na přepínačích, `role=status` na toastech. Tmavý motiv:
přemapování přes `[data-theme="dark"]` v globals.css; hostovská část se
připíná na světlý (ThemeProvider). `prefers-reduced-motion`: pohyb pryč,
zpětná vazba zůstává (opacita); `prefers-reduced-transparency`: sklo i zrno
pryč; `prefers-contrast: more`: tvrdší okraje.

## Anti-vzory (zdejší zákazy)

Title Case v češtině; víc limetkových akcí na jedné obrazovce; `capitalize`
na datech; `String(date).slice` místo pragueTime; písmo pod 11 px; ořez
krátkých českých popisků; nové barvy mimo paletu; `transition: all`;
`ease-in` na UI; keyframes na rychle opakovaných prvcích (toasty, přepínače)
místo transitions; hover efekt bez `hover: hover`.
