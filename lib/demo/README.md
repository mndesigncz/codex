# Veřejná ukázka /demo

Skutečná aplikace (`EmployerLayout`, `EmployeeLayout`, `KioskApp`) běží proti
mock serveru v prohlížeči. Vkládá se jako `<iframe>` do prodejní stránky
a nahrává se. Nic z ní nejde na skutečný server: `window.fetch` pro `/api/*`
odpovídá z paměti (`lib/demo/stav.ts`).

## Adresa

| Parametr | Hodnoty | Význam |
|---|---|---|
| `scena` | `prehled` `rozvrh` `uzaverka` `sklad` `ukoly` `tym` `kiosk` | Otevře pohled aplikace (překlad na `?view=` v `lib/demo/sceny.ts`). Výchozí `prehled`. |
| `role` | `vedeni` `zamestnanec` `kiosk` | Za koho je ukázka přihlášená. Výchozí podle scény (uzávěrka = zaměstnanec, kiosk = tablet, jinak vedení). |
| `rezim` | `okno` | Bez postranního panelu (styl, ne změna aplikace). |

Příklady: `/demo?scena=rozvrh&rezim=okno`, `/demo?scena=uzaverka&role=vedeni`.

## Kde co je

- `app/demo/{layout,page}.tsx`: veřejná trasa, `noindex`. Middleware ji nehlídá (jeho `matcher` zná jen `/api`, `/employer`, `/employee`, `/kiosk`, `/client`).
- `next.config.js`: `/demo` má vlastní hlavičky (`X-Frame-Options: SAMEORIGIN`, `frame-ancestors 'self'`, zúžená CSP bez Stripe, `X-Robots-Tag`). Ostatní trasy zůstávají `DENY`. Obecné CSP má `frame-src 'self'`, aby prodejní stránka směla ukázku vložit.
- `components/demo/DemoRoot.tsx`: kořen. Izolaci a interceptor instaluje **idempotentně před prvním vykreslením** (initializer `useState`, plus rychlá cesta na úrovni modulu při plném načtení a efekt); nezávisí na adrese při vyhodnocení modulu. Po klientské navigaci na `/demo` (Link, `router.push`) vynutí plné načtení (moduly a mezipaměti widgetů by nesly data skutečné aplikace), při odchodu klientskou navigací vše odinstaluje a načte cílovou stránku. Podle role namontuje rozhraní (bez `MigrationOnLoad` a `PosTick`), vynutí světlý motiv, řeší zprávy s rodičem.
- `app/providers.tsx`: v ukázce nemontuje service worker ani push.
- `lib/demo/mockApi.ts`: interceptor (instalace vrací funkci pro návrat), směrování na handlery, `window.__demoReset`, `__demoStav()`, `__demoNezname`, přenos stavu mezi rolemi přes `window.name`.
- `lib/demo/routy/*.ts`: handlery po oblastech (`zaklad`, `lide`, `rozvrh`, `ukoly`, `uzaverky`, `sklad`, `komunikace`, `ostatni`, `finance`, `klient`) a `prazdne` (prázdný tvar pro neznámý endpoint).
- `lib/demo/stav.ts`: stav v paměti a jeho výchozí data. Dny se počítají od dneška v Praze (`cas.ts`), žádné pevné datum.
- `lib/demo/data/`: vymyšlený podnik „Kavárna U Lípy (ukázka)" (`lide.ts`), role a oprávnění (`role.json`, z fixtur sond), rozložení ploch (`rozlozeni.ts`).
- `lib/demo/prostredi.ts`: `localStorage`, `sessionStorage` **i `document.cookie`** jen v paměti (ukázka nesdílí úložiště ani cookies s aplikací; kiosk jinak píše skutečnou `managero-kiosk-acting`), zákaz vkládání cizích skriptů, potlačení dialogu `beforeunload`. Vše vratné.
- `lib/demo/zpravy.ts`: `postMessage` s rodičem.

## Zprávy s rodičem (prodejní stránka)

Všechny jen mezi stejnými původy (`event.origin` se ověřuje, ven se posílá na vlastní původ).

Ven (z iframe): `{ typ: 'demo-pripraveno', scena, role, okno }` (aplikace se usadila; posílá se po každé změně scény a na `demo-ping`),
`{ typ: 'demo-akce', akce, detail }`. Akce: `ukol-odskrtnut`, `uzaverka-odemcena`,
`uzaverka-odeslana`, `rozvrh-vygenerovan`, `rozvrh-ulozen`, `rozvrh-publikovan`,
`sklad-upraveno`, `sklad-pridano`, `objednavka-odeslana`, `objednavka-prijata`,
`hlaseni-skladu`, `oznameni-pridano`, `zprava-odeslana`, `prichod-zapsan`,
`odchod-zapsan`, `ukol-pridan`, `navod-precten`, `uzaverka-schvalena`, `postup-spusten`,
`postup-dokoncen`, `objednavka-hosta-prijata`, `pozvanka-odeslana`, `smena-ohodnocena`, `receptura-ulozena`.
Události se navíc ukládají do `window.__demoUdalosti` (sondy, ladění).

Dovnitř: `{ typ: 'demo-scena', scena, role? }` (stejná role = přepnutí bez načtení,
jiná role = načtení stránky, **stav ukázky jde s sebou** přes `window.name`, takže příběh
„zaměstnanec odešle uzávěrku, vedení ji uvidí" drží), `{ typ: 'demo-reset' }` (nový stav a načtení
stránky bez přenosu; mezipaměť dat widgetů žije v modulech, jinak by po resetu půl minuty ukazovala staré odpovědi)
a `{ typ: 'demo-ping' }` (odpověď: znovu poslední `demo-pripraveno`).

Kontrakt pro rodiče: iframe se načte obvykle dřív, než se rodič hydratuje, takže
`demo-pripraveno` může přijít před jeho posluchačem. Rodič proto po připojení posluchače
a po `iframe.onload` pošle `demo-ping` a **`demo-scena` posílá až po `demo-pripraveno`**
(dřív poslaná zpráva by se ztratila).

## Jak přidat scénu

1. Řádek v `SCENY` (`lib/demo/sceny.ts`): výchozí role a pohled aplikace pro každou roli. Pohled musí existovat v `navItems` layoutu (test k74-demo to hlídá).
2. Spusť scénu s `window.__demoNezname` (v konzoli) a doplň handlery pro endpointy, které vypíše. Tvar odpovědi je vždy tvar skutečné routy: `app/api/<cesta>/route.ts`.
3. Zápis, který má změnit odpovědi, upravuje `s` (stav) v handleru a volá `k.hlas('akce', detail)`.
4. Do sondy `scripts/sondy/k74-demo.mjs` přidej scénu do `SCENY` (nula požadavků na `/api`, čistá konzole, nic neznámého).

Nový endpoint: handler v příslušném souboru `routy/`, vrací `ok(...)` nebo `chyba(...)`. Neznámý GET dostane prázdný tvar, zápis `{ ok: true }` (a zapíše se do `__demoNezname`).

## Pravidla izolace

- Na síť nesmí odejít žádné `/api/*`. Cizí původ `fetch` odmítne.
- Žádné skutečné cookies, service worker, push, Stripe. `localStorage`, `sessionStorage` a `document.cookie` jen v paměti (sonda k74 D1 hlídá, že se skutečné úložiště nečte ani nezapisuje a že cookie `managero-kiosk-acting` skutečného tabletu přežije).
- Instalace nezávisí na adrese a je vratná; klientská navigace na `/demo` a z něj vynutí plné načtení.
- Odhlášení (`/api/auth/signout`) vrací adresu ukázky, ne skutečné `/login` (nerámovatelné, mimo ukázku).
- Záložka Předplatné je skrytá (oprávnění `predplatne.zobrazit` v ukázce chybí): ukázka není prodej.
- Vždy světlý motiv.
- Vše v ukázce je vymyšlené a označené jako ukázka (název podniku nese „(ukázka)").
