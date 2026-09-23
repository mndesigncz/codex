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

Kdo zakládá další podnik: jen VLASTNÍK aktivního podniku (`teams.owner_id`),
a když už podnik organizaci má, jen její vlastník. Manažer povýšený na
vedení ani cizí majitel pozvaný jako vedení další podnik nezaloží (403)
a tlačítko „Přidat podnik" nevidí — jinak by si založil organizaci nad
cizím podnikem a stal se jejím vlastníkem. Přepínač „Sdílení lidí mezi
podniky" platí při pozvání i přijetí pozvánky: s vypnutým sdílením
zaměstnanec, který už pracuje v jiném podniku organizace, členství
nedostane (409). Vedení vždy.

Kdo je v podniku (kolo 62): pravda je `team_members` (členství); `users.team_id`
je jen zrcadlo podniku, kam je člověk právě přepnutý. Seznam Týmu, tablet,
rozvrh, oznámení i mzdy berou lidi z členství NEBO ze zrcadla (to druhé kvůli
tabletu a účtům, které se od migrace nepřihlásily) — helpery v `lib/tenant.ts`
(`clenovePodniku`, `jeClenem`, `vedeniPodniku`, `sazbaVPodniku`, `pocetClenu`).
Sazba a pozice jsou VŽDY z členství v daném podniku; člen bez sazby má
v mzdách 0, nikdy sazbu z jiného podniku. Limit plánu Zdarma počítá lidi
podle členství, tedy i ty, kdo jsou právě přepnutí jinam. Každý dotaz
v `sql\`…\`` hlídá `scripts/check-sql.mjs`: gramatika Postgresu bez databáze
a od kola 63 i schéma — tabulky a sloupce se berou z DDL v `app/api/init/route.ts`,
takže překlep ve sloupci nebo v názvu tabulky spadne v CI, ne u tabletu.

Kopie do podniku (kolo 64): návody, postupy a menu se mezi podniky
organizace nesdílí živě (vazby na sklad a lidi jednoho podniku), ale vedení
si je zkopíruje — tlačítko „Z jiného podniku" v Návodech, Postupech a Menu.
Kopie je vlastní řádek cíle: suroviny v krocích a připnutá položka se
přemapují podle názvu položky ve skladu cíle, jinak se odpojí (a řekne se to);
odkazy z postupu na návod se přemapují na návod kopírovaný v téže dávce nebo
na stejnojmenný návod cíle; zkopírované menu má novou adresu a je vypnuté,
dokud vedení neprojde ceny. Každá kopie je v audit logu (`organization.kopie`).

Kopie do podniku (kolo 64): návody, postupy a menu se mezi podniky
organizace nesdílí živě (vazby na sklad a lidi jednoho podniku), ale vedení
si je zkopíruje — tlačítko „Z jiného podniku" v Návodech, Postupech a Menu.
Kopie je vlastní řádek cíle: suroviny v krocích a připnutá položka se
přemapují podle názvu položky ve skladu cíle, jinak se odpojí (a řekne se to);
odkazy z postupu na návod se přemapují na návod kopírovaný v téže dávce nebo
na stejnojmenný návod cíle; zkopírované menu má novou adresu a je vypnuté,
dokud vedení neprojde ceny. Každá kopie je v audit logu (`organization.kopie`).

Pozastavení a sdílené číselníky organizace: když je pozastavený podnik
v nastavení organizace zvolený jako zdroj (spravuje kategorie skladu,
dodavatele, typy směn, kategorie návodů nebo katalog odměn), ostatní
podniky organizace jeho řádky dál čtou a používají. Blokace míří na lidi
podniku (423 na API, `/pozastaveno`), ne na definice — kdyby zmizely,
položkám v ostatních podnicích by ze dne na den chyběly kategorie. Kdo
chce sdílení zastavit, vypne ho v nastavení organizace; podniky pak
dostanou vlastní kopie toho, co používaly (kategorie skladu, typy směn,
kategorie návodů — dodavatelé a katalog odměn se jen přestanou číst,
protože na ně nic neukazuje po id).

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

**Adresa musí být `https://www.managero.app/api/mcp`, s `www`.** Apex
`managero.app` se přesměrovává na `www` (308) a **klient při přesměrování
na jiný host zahodí hlavičku `Authorization`** — je to záměr prohlížečů
i curlu, aby se tajemství neposlalo cizí doméně. Výsledkem je 401 s
tokenem, který je v pořádku, a půlhodina hledání chyby na špatném místě.
Tenhle návod tu chybu jednou měl.

Než se napojuje cokoliv, ať je jisté, že odpovídá sám endpoint:

```bash
TOKEN='…'
curl -s -X POST https://www.managero.app/api/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}'
```

Čeká se `"serverInfo":{"name":"managero-admin"…}`. Když přijde 401: token
nesedí, je kratší než 32 znaků, `ADMIN_API_TOKEN` na Vercelu není, nebo po
jeho přidání neproběhlo nasazení. Když přijde `{"redirect": …}`, zůstalo
v adrese apex bez `www`.

Claude Code:

```
claude mcp add --transport http managero https://www.managero.app/api/mcp \
  --header "Authorization: Bearer <ADMIN_API_TOKEN>" -s user
```

`-s user` zpřístupní server ve všech projektech, ne jen v aktuálním.
Ověření: `claude mcp list` → `managero: connected`.

Claude Desktop / claude.ai: vlastní konektor se stejnou adresou. **Ověř si,
že jde nastavit vlastní hlavička** — konektory tam bývají stavěné na OAuth
a políčko na hlavičky mít nemusí. Když tam není, endpoint potřebuje druhou
cestu ověření (OAuth, nebo token v URL jako u cronu); dokud se to neudělá,
funguje jen Claude Code.

Nástroje (devět): `managero_overview`, `managero_list_teams`,
`managero_get_team`, `managero_block_team`, `managero_unblock_team`,
`managero_set_plan`, `managero_extend_trial`, `managero_set_note`,
`managero_admin_audit`. Každý zásah se loguje stejně jako z obrazovky,
s aktérem `api-token`.

### Když token unikne

Přepsat `ADMIN_API_TOKEN` na Vercelu a nasadit. Starý přestane platit
okamžitě a nikde jinde uložený není — pak stačí opravit ten jeden
`claude mcp add`. Token patří jen do prostředí na Vercelu a do konfigurace
Clauda: ne do repa, ne do snímku obrazovky, ne do chatu.

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
