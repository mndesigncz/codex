# Spuštění na ostro

Co musí provozovatel nastavit rukou, v jakém pořadí. Kód je připravený; tady jsou účty a přepínače,
které za něj nikdo jiný nezapne. Stav nastavení kdykoli ukáže `GET https://www.managero.app/api/health`
(jen ano/ne, žádné hodnoty).

## 1. Hosting a databáze

1. **Vercel Pro** (tarif Hobby zakazuje komerční provoz). Region funkcí nastav na stejné místo jako Neon
   (Project → Settings → Functions → Region, např. `fra1` pro Frankfurt).
2. **Neon placený tarif** kvůli obnově k bodu v čase (Point-in-time restore). Ověř region (Frankfurt
   `aws-eu-central-1`) a dobu historie (aspoň 7 dní).
3. **Oddělit náhledová nasazení od ostrých dat:** v Neonu založ větev `preview` a ve Vercelu nastav
   `DATABASE_URL` pro prostředí *Preview* na její connection string. Dokud to není, každý náhled pracuje
   s produkční databází.
4. Proměnné z `.env.example` — povinné: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`,
   `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`. Doporučené: `APP_SECRET_KEY`, `SUPERADMIN_USER_IDS`, `ADMIN_API_TOKEN`.
5. Údaje provozovatele jsou výchozí hodnoty v `lib/firma.ts` (Martin Nemeškal, IČO 17944953); `FIRMA_*`
   nejsou potřeba, jen je přebíjejí na serveru (Nastavení → O aplikaci bere vždy výchozí hodnoty z kódu).
   Až bude DIČ: `FIRMA_DIC`. Podrobně `docs/PRAVNI.md` §3.

## 2. E-maily

Resend: ověř doménu `managero.app` (DNS záznamy SPF, DKIM, DMARC), placený tarif kvůli objemu,
`RESEND_API_KEY` a `EMAIL_FROM`. Bez nich neodejdou ani upozornění před smazáním podniku — retence pak
podnik nesmaže a hlásí chybu.

Schránka **`podpora@managero.app`** musí přijímat poštu (Resend jen odesílá): MX záznam a schránka nebo
přeposílání. Odkazují na ni e-maily, patičky webu i faktury.

## 3. Platby

Stripe v ostrém režimu: produkty s `lookup_key` `pro_monthly`, `pro_yearly`, `max_monthly`, `max_yearly`,
kupon `MAX30`, webhook na `https://www.managero.app/api/billing/webhook` s událostmi
`checkout.session.completed`, `customer.subscription.created|updated|deleted|trial_will_end`,
`invoice.paid`, `invoice.payment_failed`. Proměnné `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Provozovatel není plátce DPH: Stripe Tax vypnutý, žádné sazby DPH.

Dashboard (podrobně `docs/PRAVNI.md` §3): Public details (URL obchodních podmínek a zásad, podpora,
telefon) → potom ve Vercelu `STRIPE_SOUHLAS_PODMINEK=1`; výchozí patička faktur; zasílání faktur
e-mailem; Revenue recovery → po posledním pokusu zrušit předplatné; kupon `MAX30` s `duration = once`.
Povinné pole IČO v pokladně si kód nastavuje sám (nic v dashboardu).

## 3a. Retence osobních údajů

Až **po nasazení** a po `/api/init` (nové sloupce): Správa platformy → Retence → „Spočítat náhled teď“,
zkontrolovat počty, pak `RETENCE_ZAPNUTA=1` (Production) a redeploy. Cron `/api/retence` (denně 3:35)
pak anonymizuje neaktivní hosty (24 měsíců, e-mail 30 dní předem) a maže zrušené podniky bez aktivity
(90 dní, e-mail vlastníkovi a správcům předplatného 30 a 7 dní předem). Stav: `/api/health` →
`funkce.retenceOstra`. Podrobně `docs/PRAVNI.md` §7.

## 4. Hlídání

Dostupnost hlídá GitHub Actions bez dalšího účtu: `.github/workflows/dostupnost.yml` každých 10 minut
volá `GET /api/health` (čeká 200 a `"ok":true`) a úvodní stránku (200), třikrát s pauzou. Když selže,
GitHub pošle vlastníkovi repa e-mail o neúspěšném běhu (GitHub → Settings → Notifications → Actions).
Odpověď 503 z health znamená nedostupnou databázi nebo chybějící povinné nastavení. Plánované běhy
GitHub občas o pár minut zdrží a po 60 dnech bez aktivity v repu je vypne — pak je v záložce Actions
znovu povol. Chyby za běhu: Vercel → Logs; Sentry zatím napojené není.

## 5. Obchody

Viz `docs/OBCHODY.md` a `apps/README.md` (účty Apple a Google, klíče pro push, podpisové klíče, nahrání).

## 6. Provozní runbook

### Kde hlídat chyby

- **Vercel → projekt `pangea` → Logs** (filtr Production, úroveň Error/Warning). Přehled seskupených
  chyb je v záložce Observability → Errors.
- **Vercel → Settings → Cron Jobs → View logs**: každý běh cronu se stavem odpovědi. Každý cron navíc
  zapíše do logu jeden řádek `cron <název>: {…}` jen s počty (`lib/cronSouhrn.ts`); částečné selhání
  jde jako chyba. Hledej v Logs `cron ` nebo název cronu.
- **E-mail z GitHubu** o neúspěšném běhu „Dostupnost produkce“ = produkce neodpovídá (viz §4).
- Známé neškodné varování: `[DEP0169] DeprecationWarning: url.parse()` — tiskne ho knihovna `web-push`
  (verze 3.6.7, poslední vydaná) při odeslání push oznámení. Nic nerozbíjí; zmizí s novou verzí knihovny.

### Výpadek: co dělat

1. Ověř `https://www.managero.app/api/health`:
   - `"ok":true` → aplikace i databáze běží; problém je spíš v konkrétní funkci (Logs).
   - `"databaze":"chyba"` → Neon (status.neon.tech, Neon Console → Monitoring).
   - `povinneChybi` není prázdné → chybí proměnná ve Vercelu (Settings → Environment Variables), pak redeploy.
   - Neodpovídá vůbec / 5xx na všem → Vercel (vercel-status.com) nebo poslední nasazení.
2. **Rozbilo to poslední nasazení → Instant Rollback:** Vercel → Deployments → předchozí produkční
   nasazení (stav Ready) → ⋯ → *Instant Rollback* (nebo u aktuálního nasazení *Rollback*). Trvá vteřiny,
   nic se nestaví znovu. Pozor: po rollbacku Vercel další pushe do `main` sám na produkci nepřepne,
   dokud opravené nasazení nepovýšíš (*Promote to Production*).
3. Rollback kódu je vůči databázi bezpečný: migrace v `/api/init` jen přidávají (`CREATE … IF NOT EXISTS`,
   `ADD COLUMN IF NOT EXISTS`), starší kód nové sloupce ignoruje.
4. Po opravě: health zase `"ok":true`, ruční běh workflow „Dostupnost produkce“ (Actions → Run workflow).

### Zálohy a obnova

- **Hlavní záloha = Neon Point-in-time restore** (produkční větev projektu v Neonu). Obnova:
  Neon Console → projekt → Backup & Restore (Restore) → produkční větev → čas před chybou. Neon před
  obnovou sám uloží dosavadní stav do záložní větve, takže krok jde vrátit. Délka historie závisí na
  tarifu (Free jen hodiny) — ověř v nastavení projektu, že je aspoň 7 dní.
- Než obnovíš celou produkci, zkus **větev z minulosti** (Branches → Create branch → From a point in
  time) a data z ní dotáhni ručně — obnova celé větve vrátí i všechno, co se mezitím zapsalo správně.
- **`/api/backup`** (cron denně) není úložiště: každému s oprávněním `data.zaloha` pošle e-mail s
  podepsaným odkazem na zálohu jeho podniku (platí 7 dní). Záloha se skládá až při stažení
  (`/api/backup/stahnout`, jen přihlášený člověk s oprávněním), nikde se neukládá. Je to export pro
  podniky, ne náhrada PITR.

### Crony (`vercel.json`, časy v UTC; Praha = UTC+1 v zimě, UTC+2 v létě)

| Čas UTC | Cesta | Co dělá |
|---|---|---|
| 02:00 | `/api/backup` | E-mail s odkazem na zálohu podniku lidem s `data.zaloha`. |
| 03:20 | `/api/init` | Migrace schématu + denní úlohy: narozeniny, propadání bodů a kreditu, poklesy úrovní, reaktivace hostů, automatizace, připomínky poukazů. |
| 03:35 | `/api/retence` | Retence osobních údajů; bez `RETENCE_ZAPNUTA=1` jen náhled (§3a). |
| 04:00 | `/api/attendance/watch` | Noční průchod: uzavře zapomenutá odpíchnutí. |
| 04:40 | `/api/pos/cron` | Synchronizace pokladny (Storyous) a odpis skladu u všech připojených podniků. |
| 05:10 | `/api/billing/cron` | Dorovnání předplatných se Stripe, kdyby nedošel webhook. |
| 07:00 | `/api/client/reservations/remind` | Push hostům: připomínka dnešní a zítřejší rezervace. |
| 21:00 | `/api/closings/remind` | Připomínka nevyplněné uzávěrky + upozornění na uzávěrky ke schválení. |
| 21:30 | `/api/digest` | Souhrn dne vedení (push + e-mail), záchrana naplánovaných zpráv. |
| 21:45 | `/api/attendance/watch` | Večerní průchod: připomene „pořád jsi na směně?“, nezavírá. |

Všechny chtějí `Authorization: Bearer $CRON_SECRET` (Vercel ho posílá sám). Ruční spuštění: přihlášené
vedení otevře aplikaci (migrace se spustí sama po nasazení), nebo z Vercelu → Cron Jobs → *Run*.

### Kontakty

- Podpora pro zákazníky: **podpora@managero.app** (musí přijímat poštu, viz §2).
- Provozovatel: Martin Nemeškal (údaje v `lib/firma.ts`).
- Dodavatelé: Vercel (hosting, logy), Neon (databáze), Resend (e-maily), Stripe (platby) — vše přes
  jejich dashboardy a stránky stavu.

## 7. Zbývá na Martinovi

- [ ] **Stripe:** dokončit ověření totožnosti a přidat bankovní účet pro výplaty (bez nich ostré platby
  neodejdou na účet); pak zkušební nákup a refund.
- [ ] **DPH:** s daňovým poradcem ověřit, kdy vzniká povinnost registrace (obrat, služby do EU / OSS);
  do té doby Stripe Tax vypnutý, ceny bez DPH (§3).
- [ ] **Právní texty:** obchodní podmínky, zásady ochrany osobních údajů, zpracovatelská smlouva a
  cookies nechat zkontrolovat advokátem (`docs/PRAVNI.md`).
- [ ] **Retence:** po schválení lhůt (24 měsíců hosté, 90 dní zrušené podniky) zkontrolovat náhled ve
  Správě platformy a zapnout `RETENCE_ZAPNUTA=1` (Production) + redeploy (§3a).
- [ ] **Neon:** ověřit tarif a délku historie pro Point-in-time restore (aspoň 7 dní) a oddělenou
  větev pro náhledy (§1).
- [ ] **GitHub:** mít zapnuté e-maily o neúspěšných workflow (Settings → Notifications → Actions).
