# Managero — DESIGN.md

Vizuální systém zachycený z kódu (app/globals.css, components/ui). Jedna
aplikace, tři prostředí: administrace, TO GO/kiosk, Managero client — vše
mluví stejným jazykem.

## Tón

Světlé, klidné, papírově zelenkavé pozadí; jedna limetková jako jediná
hlavní akce na obrazovce; tmavá inkoustová pro vybraný stav. Sklo (blur)
jen jako materiál karet a lišt, ne dekorace.

## Tokeny

- Pozadí: `#F1F3ED` (hostovská část natvrdo, jinak `--bg` s jemnými
  radiálními světly limetky a modré).
- Inkoust: `#16181A`; sekundární text `black/55–70`.
- Značková limetka: `#C8F542` (na ní vždy tmavý text; text limetkové řady
  na světlém podkladu ztmavený na `#4F6A07`/`#3E5406` kvůli kontrastu).
- Stavové: čeká `amber-500/15` + `amber-800`; chyba `red-500/10` +
  `red-700`; hotovo `black/[0.06]`.
- Rádiusy: karty `rounded-3xl`/`rounded-[28px]`, pole `rounded-2xl`,
  tlačítka a chipy `rounded-full`.
- Písmo systémové (SF/Inter); nadpisy `font-bold tracking-tight(er)`;
  čísla `tabular-nums`; štítky sekcí `text-[11px] uppercase tracking-wider
  text-black/45–50`; minimum písma 11 px.

## Komponenty (components/ui)

Button (accent = limetková, jediná primární; primary = tmavá; secondary,
ghost, danger; icon/loading/size), PageHeader (title/subtitle/primary/
secondary/aside/menu), Segmented (aria-pressed, `wrap`), EmptyState (ikona,
titulek, hint, akce), Skeleton/PageSkel, Menu, Avatar/Initials (tmavé
kolečko, limetkové iniciály). Klient navíc: StatCard (štítek, ikona
v tónovaném kolečku, číslo), SectionTitle (ikona v kolečku + akce vpravo),
TableMap (pilulky stolů na tečkovaném plánku).

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

Přechody 150–300 ms, ease-out; `active:scale-[0.98]` na stisk; žádné
animace klávesových akcí. Dotykové cíle ≥36 px (`tap-target(-sm)`),
`cz-sentence` pro česká data, `aria-pressed` na přepínačích, `role=status`
na toastech. Tmavý motiv: přemapování přes `[data-theme="dark"]`
v globals.css; hostovská část se připíná na světlý (ThemeProvider).

## Anti-vzory (zdejší zákazy)

Title Case v češtině; víc limetkových akcí na jedné obrazovce; `capitalize`
na datech; `String(date).slice` místo pragueTime; písmo pod 11 px; ořez
krátkých českých popisků; nové barvy mimo paletu.
