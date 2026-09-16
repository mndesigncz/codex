# Stripe v Managero

Plán integrace a návod k zapnutí. Vychází z doporučení Stripe pluginu
(`stripe-best-practices`, API `2026-08-26.dahlia`, SDK `stripe` 22.x).

## Co Managero prodává a komu

| Tok peněz | Kdo platí komu | Produkt Stripe | Kde v kódu |
| --- | --- | --- | --- |
| Předplatné **Pro** (249 Kč měsíčně za podnik) | podnik → Managero | Billing + Checkout + Customer Portal + Invoicing + Tax | `app/api/stripe/{checkout,portal,webhook}` |
| **Objednávka od stolu** zaplacená online | host → podnik | Connect (Accounts v2, přímé platby) + Checkout | `app/api/stripe/connect/*`, `app/api/client/b/[slug]/orders/[id]/pay` |

Rozhodnutí, ze kterých zbytek plyne:

- **Managero je SaaS platforma, ne tržiště.** Podnik je obchodník (merchant
  of record), host platí jemu. Propojený účet má `dashboard: full`,
  `fees_collector: stripe`, `losses_collector: stripe` a platby jsou přímé
  (direct charges) na účtu podniku. Provize platformy jde volitelně přes
  `application_fee_amount` (`STRIPE_PLATFORM_FEE_PERCENT`, výchozí 0).
- **Zdroj pravdy je webhook.** Plán podniku i stav objednávky se mění jen
  z ověřené události Stripe, nikdy ze stránky „úspěch". Každá událost se
  zpracuje nejvýš jednou (`stripe_events`).
- **Hostovaný Checkout, žádné Stripe.js.** Nic se nevkládá do stránky,
  CSP zůstává beze změny; host i podnik jdou na stripe.com a zpět.
- **Bez `payment_method_types`.** Způsoby platby (karta, Link, Apple/Google
  Pay…) řídí Dashboard, ne kód.
- **Klíče jen v env** (Vercel → sensitive env var). Doporučený je
  omezený klíč `rk_…` místo `sk_…`; potřebná práva jsou níž.

## Čistá logika a testy

`lib/stripeBilling.ts` nemá SDK ani databázi a testuje se v `npm test`:
stav předplatného → plán, koruny → haléře, provize, položky Checkoutu,
připravenost propojeného účtu. `lib/stripeSync.ts` zapisuje do DB,
`lib/stripe.ts` vyrábí klienta.

## Datový model (migrace v `/api/init`, idempotentně)

- `teams`: `stripe_customer_id`, `stripe_subscription_id`,
  `stripe_subscription_status`, `stripe_current_period_end`,
  `stripe_account_id`, `stripe_payments_ready`
- `client_orders`: `payment_status` (`unpaid | pending | paid | failed`),
  `stripe_session_id`, `stripe_payment_intent`, `paid_at`
- `client_profiles.online_payments_on` — podnik online platby zapnul
- `stripe_events (id, type, received_at)` — idempotence webhooků

Stav předplatného → plán: `active`, `trialing`, `past_due` = Pro
(Stripe kartu zkouší znovu sám, podnik nepřijde o kiosk uprostřed směny);
`canceled`, `unpaid`, `incomplete_expired` = Zdarma. Podniky z doby před
placením mají `plan = 'pro'` bez předplatného a webhook se jich nedotkne.

## Proměnné prostředí

| Proměnná | K čemu |
| --- | --- |
| `STRIPE_SECRET_KEY` | klíč účtu Managero (`rk_live_…` / v sandboxu `rk_test_…`) |
| `STRIPE_PRICE_PRO_MONTHLY` | ID ceny `price_…` produktu „Managero Pro", 249 Kč měsíčně |
| `STRIPE_WEBHOOK_SECRET` | podpis webhooku účtu (`/api/stripe/webhook`) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | podpis webhooku propojených účtů (`/api/stripe/connect/webhook`) |
| `STRIPE_V2_WEBHOOK_SECRET` | podpis event destination v2 (`/api/stripe/connect/events`) |
| `STRIPE_TAX_ENABLED` | `1` až po registraci k DPH ve Stripe Tax (viz níž) |
| `STRIPE_PLATFORM_FEE_PERCENT` | provize z online plateb hostů, např. `1.5`; prázdné = žádná |
| `NEXT_PUBLIC_APP_URL` | veřejná adresa, kam se vrací z Checkoutu (už existuje) |

Bez `STRIPE_SECRET_KEY` se nic nevolá: v nastavení zůstává tlačítko
„Mám zájem o Pro" a hostům se online platba nenabízí.

Práva omezeného klíče (RAK): Customers, Checkout Sessions, Subscriptions,
Invoices, Customer portal — write; Connect: Accounts (v2), Account Links —
write; Webhook Endpoints — read. Pro sandbox druhý klíč se stejnými právy.

## Zapnutí krok za krokem

1. **Sandbox.** Ve Stripe vytvořit samostatný sandbox pro vývoj (ne sdílený
   test mode), v něm omezený klíč a vše níž; do produkce stejné kroky znovu.
2. **Produkt a cena.** Dashboard → Product catalog → „Managero Pro",
   cena 249 CZK měsíčně, `tax_behavior: inclusive` (cena je konečná),
   daňový kód SaaS (`txcd_10103001`, ověřit v Tax codes API). ID ceny do
   `STRIPE_PRICE_PRO_MONTHLY`.
3. **Customer Portal.** Settings → Billing → Customer portal: povolit změnu
   karty, zrušení, historii faktur; jazyk čeština.
4. **Faktury.** Settings → Billing → Invoices: e-mail s fakturou a PDF,
   číslování, hlavička s IČ/DIČ Managero. Checkout sbírá název firmy, adresu
   a DIČ podniku (`tax_id_collection`), takže faktura je rovnou úplná.
5. **Webhooky.** Developers → Webhooks:
   - `https://managero.app/api/stripe/webhook`, účet: `checkout.session.completed`,
     `customer.subscription.created|updated|deleted`, `invoice.paid`,
     `invoice.payment_failed` → `STRIPE_WEBHOOK_SECRET`
   - `https://managero.app/api/stripe/connect/webhook`, **propojené účty**:
     `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed` → `STRIPE_CONNECT_WEBHOOK_SECRET`
   - event destination (v2) `https://managero.app/api/stripe/connect/events`:
     `v2.core.account[configuration.merchant].capability_status_updated`,
     `v2.core.account[requirements].updated` → `STRIPE_V2_WEBHOOK_SECRET`
   Lokálně: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
   (a s `--forward-connect-to` pro druhý).
6. **Connect.** Settings → Connect: značka (název, logo, barva) pro
   onboarding podniků; platformový profil „SaaS, přímé platby".
7. **Tax.** Settings → Tax: sídlo firmy, pak registrace k DPH v ČR (Stripe
   ji jen eviduje, registraci na FÚ dělá Managero samo). Teprve potom
   `STRIPE_TAX_ENABLED=1` a v sandboxu ověřit testovací kalkulaci, že
   `taxability_reason` není `not_collecting`. **Do té doby Stripe daň
   nepočítá a nic nehlásí** — nejčastější chyba Stripe Tax.
   Daň z plateb hostů se řeší na straně podniku (je obchodník), Managero
   ji nepočítá.
8. **Nasazení.** Env do Vercelu jako sensitive, `/api/init` doběhne
   (cron denně, nebo ručně), pak zkušební nákup Pro testovací kartou
   `4242 4242 4242 4242` a jedna objednávka zaplacená online v sandboxu.

## Toky

**Pro:** Nastavení → Předplatné → „Přejít na Pro" → `POST /api/stripe/checkout`
(zákazník vzniká jednou na podnik) → Stripe Checkout → zpět
`?billing=success` → webhook `checkout.session.completed` +
`customer.subscription.*` → `teams.plan = 'pro'`. Neúspěšná obnova →
`invoice.payment_failed` → notifikace vedení, plán zůstává Pro po dobu
Smart Retries; po vyčerpání `customer.subscription.updated` (`unpaid` /
`canceled`) → Zdarma. Správa: „Spravovat předplatné" → Customer Portal.

**Online platba hosta:** Podnik → Hosté → Nastavení → „Propojit Stripe" →
`POST /api/stripe/connect/onboard` (Accounts v2, `card_payments`) → Stripe
onboarding → zpět `?connect=return` → `GET /api/stripe/connect/status?refresh=1`
zjistí `configuration.merchant.capabilities.card_payments.status === 'active'`
→ podnik zapne „Hosté můžou platit online". Host objedná od stolu → u
objednávky „Zaplatit kartou online" → `POST …/orders/[id]/pay` → Checkout na
účtu podniku (částka z DB, `client_reference_id = id objednávky`, min. 15 Kč,
platnost 35 min) → webhook propojených účtů → `payment_status = 'paid'` +
notifikace obsluze. Jedna rozdělaná session se znovu použije, host
nezaplatí dvakrát.

## Co zůstává ručně / mimo kód

- Registrace k DPH a rozhodnutí o daňovém kódu — s účetní.
- Vzhled Customer Portalu, faktur a onboardingu Connect — Dashboard.
- Pokladna Storyous se o online platbě nedozví; obsluha vidí „zaplaceno
  online" u objednávky v Managero. Zápis platby do Storyous by chtěl jejich
  Delivery API a je to samostatná úprava.
