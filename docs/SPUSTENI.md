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
5. Údaje provozovatele `FIRMA_*` — až po schválení textů advokátem; do té doby stránky ukazují „Návrh“.

## 2. E-maily

Resend: ověř doménu `managero.app` (DNS záznamy SPF, DKIM, DMARC), placený tarif kvůli objemu,
`RESEND_API_KEY` a `EMAIL_FROM`.

## 3. Platby

Stripe v ostrém režimu: produkty s `lookup_key` `pro_monthly`, `pro_yearly`, `max_monthly`, `max_yearly`,
kupon `MAX30`, webhook na `https://www.managero.app/api/billing/webhook` s událostmi
`checkout.session.completed`, `customer.subscription.created|updated|deleted|trial_will_end`,
`invoice.paid`, `invoice.payment_failed`. Proměnné `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. DPH: podle stanoviska daňového poradce (Stripe Tax, nebo ručně).

## 4. Hlídání

Nastav hlídání dostupnosti (UptimeRobot, Better Stack…) na `GET /api/health` — odpověď 503 znamená
nedostupnou databázi nebo chybějící povinné nastavení. Chyby za běhu: Vercel → Logs; Sentry zatím
napojené není.

## 5. Obchody

Viz `docs/OBCHODY.md` a `apps/README.md` (účty Apple a Google, klíče pro push, podpisové klíče, nahrání).
