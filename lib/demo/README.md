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
- `components/demo/DemoRoot.tsx`: kořen. Na úrovni modulu instaluje interceptor **před** prvním vykreslením; podle role namontuje rozhraní (bez `MigrationOnLoad` a `PosTick`), vynutí světlý motiv, řeší zprávy s rodičem.
- `app/providers.tsx`: v ukázce nemontuje service worker ani push.
- `lib/demo/mockApi.ts`: interceptor, směrování na handlery, `window.__demoReset`, `__demoStav()`, `__demoNezname`.
- `lib/demo/routy/*.ts`: handlery po oblastech (`zaklad`, `lide`, `rozvrh`, `ukoly`, `uzaverky`, `sklad`, `komunikace`, `ostatni`, `finance`, `klient`) a `prazdne` (prázdný tvar pro neznámý endpoint).
- `lib/demo/stav.ts`: stav v paměti a jeho výchozí data. Dny se počítají od dneška v Praze (`cas.ts`), žádné pevné datum.
- `lib/demo/data/`: vymyšlený podnik „Kavárna U Lípy (ukázka)" (`lide.ts`), role a oprávnění (`role.json`, z fixtur sond), rozložení ploch (`rozlozeni.ts`).
- `lib/demo/prostredi.ts`: úložiště jen v paměti (ukázka nesdílí `localStorage` s aplikací), zákaz vkládání cizích skriptů.
- `lib/demo/zpravy.ts`: `postMessage` s rodičem.

## Zprávy s rodičem (prodejní stránka)

Všechny jen mezi stejnými původy (`event.origin` se ověřuje, ven se posílá na vlastní původ).

Ven (z iframe): `{ typ: 'demo-pripraveno', scena, role, okno }` (aplikace se usadila),
`{ typ: 'demo-akce', akce, detail }`. Akce: `ukol-odskrtnut`, `uzaverka-odemcena`,
`uzaverka-odeslana`, `rozvrh-vygenerovan`, `rozvrh-ulozen`, `rozvrh-publikovan`,
`sklad-upraveno`, `sklad-pridano`, `objednavka-odeslana`, `objednavka-prijata`,
`hlaseni-skladu`, `oznameni-pridano`, `zprava-odeslana`, `prichod-zapsan`,
`odchod-zapsan`, `ukol-pridan`, `navod-precten`, `uzaverka-schvalena`.
Události se navíc ukládají do `window.__demoUdalosti` (sondy, ladění).

Dovnitř: `{ typ: 'demo-scena', scena, role? }` (stejná role = přepnutí bez načtení,
jiná role = čisté načtení) a `{ typ: 'demo-reset' }` (nový stav a načtení stránky;
mezipaměť dat widgetů žije v modulech, jinak by po resetu půl minuty ukazovala staré odpovědi).

## Jak přidat scénu

1. Řádek v `SCENY` (`lib/demo/sceny.ts`): výchozí role a pohled aplikace pro každou roli. Pohled musí existovat v `navItems` layoutu (test k74-demo to hlídá).
2. Spusť scénu s `window.__demoNezname` (v konzoli) a doplň handlery pro endpointy, které vypíše. Tvar odpovědi je vždy tvar skutečné routy: `app/api/<cesta>/route.ts`.
3. Zápis, který má změnit odpovědi, upravuje `s` (stav) v handleru a volá `k.hlas('akce', detail)`.
4. Do sondy `scripts/sondy/k74-demo.mjs` přidej scénu do `SCENY` (nula požadavků na `/api`, čistá konzole, nic neznámého).

Nový endpoint: handler v příslušném souboru `routy/`, vrací `ok(...)` nebo `chyba(...)`. Neznámý GET dostane prázdný tvar, zápis `{ ok: true }` (a zapíše se do `__demoNezname`).

## Pravidla izolace

- Na síť nesmí odejít žádné `/api/*`. Cizí původ `fetch` odmítne.
- Žádné cookies, service worker, push, Stripe. `localStorage` a `sessionStorage` jen v paměti.
- Vždy světlý motiv.
- Vše v ukázce je vymyšlené a označené jako ukázka (název podniku nese „(ukázka)").
