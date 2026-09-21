# Správa platformy (superadmin)

Jedna obrazovka, ze které provozovatel Managera vidí všechny podniky a umí
jim zasáhnout do provozu: pozastavit účet, přepnout tarif, prodloužit
zkušební dobu. A jeden MCP endpoint, přes který to samé umí Claude.

Tenhle dokument je zároveň plán, podle kterého to vzniklo, a návod, jak to
provozovat. Sekce „Jak to zapnout" je to jediné, co provozovatel musí udělat
rukou.

## Proč to vypadá takhle

Aplikace před tím žádnou roli nad podniky neměla. Čtyři role (`employer`,
`employee`, `kiosk`, `customer`) jsou všechny *uvnitř* jednoho podniku.
Superadmin je něco jiného: není to pátá role v `users.role` — je to
**identita provozovatele**, která stojí nad podniky a nemá s žádným
z nich nic společného.

Z toho plynou tři rozhodnutí:

1. **Superadmin se pozná podle id účtu v prostředí, ne podle sloupce
   v databázi a ne podle e-mailu.** `SUPERADMIN_USER_IDS` na Vercelu. Sloupec
   v databázi se dá přepsat chybou v API, injekcí nebo zálohou ze špatného
   dne; prostředí se mění jen nasazením. A e-mail si při registraci volí
   kdokoli a nikdo ho neověřuje — kdo zná správcův e-mail, zaregistruje se
   jím dřív (nebo jinou velikostí písmen; `users.email` je unikátní jen
   s jejím rozlišením) a je správce. Vedení podniku navíc umí kioskovému
   účtu nastavit libovolný e-mail. **Id účtu si nikdo nevybere.** K tomu
   musí mít účet roli vedení (`rozhodniSpravce`); rozhodne se při přihlášení
   podle databáze, jede v tokenu, a každý zásah přes API se ověří znovu.
2. **Blokace se vynucuje v jednom místě, ne v 99 routách.** Každá API routa
   má vlastní `ctx()`; přidat kontrolu do každé znamená 99 míst, kde se
   dá zapomenout. Proto `middleware.ts`: běží před každou routou i stránkou
   a zablokovaný podnik nedostane dál ani jeden požadavek. Seznam
   blokovaných podniků se drží 30 s v paměti, takže to nestojí dotaz na
   každý požadavek — a blokace se projeví nejpozději do půl minuty.
3. **Superadmin nikdy nesmí zablokovat sám sebe.** Middleware ho pouští
   vždycky, i kdyby jeho vlastní podnik byl v seznamu.

## Co superadmin umí

| Akce | Kde | Co se stane |
| --- | --- | --- |
| Vidět všechny podniky | `/admin` | jméno, majitel, počet lidí, tarif, stav předplatného, poslední aktivita, blokace |
| Pozastavit podnik | detail → „Pozastavit" | `teams.blocked_at` + důvod; všichni lidé podniku dostanou na API 423 a na stránkách `/pozastaveno` s důvodem; hostovská stránka podniku zmizí |
| Obnovit podnik | detail → „Obnovit" | `blocked_at = NULL` |
| Přepnout tarif | detail → Tarif | `teams.plan_override`: `free` / `pro` / `max`, nebo zpět na to, co platí ze Stripe. Platí okamžitě všude, kde se tarif počítá (`planInfoOf`) |
| Prodloužit zkušební dobu | detail → Zkušební doba | `trial_ends_at` posune o N dní |
| Poznámka k podniku | detail → Poznámka | interní, podnik ji nevidí |
| Historie zásahů | `/admin/audit` | každý zásah: kdo, kdy, co, komu |

Co superadmin **neumí** a schválně: přihlásit se za někoho jiného, číst
uzávěrky nebo mzdy podniku, mazat podniky. První je bezpečnostní díra,
druhé není potřeba k podpoře, třetí je nevratné — a nevratné věci
nepatří na tlačítko.

## Jak to zapnout (jednou, na Vercelu)

Dvě proměnné prostředí, obě v Settings → Environment Variables projektu:

| Proměnná | Hodnota | K čemu |
| --- | --- | --- |
| `SUPERADMIN_USER_IDS` | id účtů oddělená čárkou (např. `1` nebo `1,42`) | kdo je superadmin — přihlašuje se svým normálním účtem s rolí vedení. Své id zjistíš přihlášený na `/api/account` (pole `id`). |
| `ADMIN_API_TOKEN` | náhodný řetězec, aspoň 32 znaků (`openssl rand -base64 36`) | přístup pro MCP a skripty bez prohlížeče |

Po nasazení se migrace provede sama prvním otevřením aplikace vedením
(stejně jako všechny ostatní — `app/api/init/route.ts`).

Bez `SUPERADMIN_USER_IDS` neexistuje žádný superadmin. Bez `ADMIN_API_TOKEN`
nefunguje MCP a odmítá se — chybějící tajemství znamená „nikoho", ne
„kohokoliv" (stejné pravidlo jako u `CRON_SECRET`).

## Napojení Clauda (MCP)

Endpoint `POST /api/mcp`, Streamable HTTP bez stavu, ověření hlavičkou
`Authorization: Bearer <ADMIN_API_TOKEN>`.

Claude Code:

```
claude mcp add --transport http managero https://managero.app/api/mcp \
  --header "Authorization: Bearer <ADMIN_API_TOKEN>"
```

Claude Desktop / claude.ai: vlastní konektor s URL `https://managero.app/api/mcp`
a stejnou hlavičkou.

Nástroje: `managero_list_teams`, `managero_get_team`, `managero_block_team`,
`managero_unblock_team`, `managero_set_plan`, `managero_extend_trial`,
`managero_set_note`, `managero_admin_audit`. Každý zásah se loguje stejně
jako z obrazovky, s aktérem `api-token`.

## Kde to je v kódu

| Soubor | Role |
| --- | --- |
| `lib/superadmin.ts` | kdo je superadmin (id účtu z prostředí + role vedení) — čistá část |
| `lib/superadminDb.ts` | totéž podle řádku v databázi; při přihlášení jde výsledek do tokenu |
| `lib/superadminGate.ts` | brána pro API a MCP (session podle DB, nebo Bearer token) |
| `lib/admin.ts` | operace nad podniky; REST i MCP je jen volají |
| `lib/blokace.ts` | čisté rozhodnutí „pustit / 423 / přesměrovat", otestované bez prohlížeče |
| `middleware.ts` | vynucení blokace před každým požadavkem |
| `app/api/admin/*` | REST pro obrazovku |
| `app/api/mcp/route.ts` | MCP pro Clauda |
| `app/admin/*` | obrazovky |
| `app/pozastaveno/page.tsx` | co vidí lidé pozastaveného podniku |
| `scripts/check-admin-auth.mjs` | CI: žádná admin routa bez `requireSuperadmin` |
