# Stripe — stav a nastavení (21. 10. 2026)

Konektor Stripe běžel v **živém režimu** na účtu **„Managero“ (`acct_1UGS6TFtRE7HPYjV`, livemode)**.
Vedle něj je v konektoru i „Managero sandbox“ (`acct_1UGS6wFsvofnTUoc`, test) — ten jsem neměnil.

## Co v živém účtu bylo

| Oblast | Stav | Verdikt |
|---|---|---|
| Produkty | `prod_VH1EQSHzPUTlx6` Managero Pro, `prod_VH1Eymq4riLmnM` Managero Max (oba aktivní, `metadata.app=managero`) | ✅ |
| `pro_monthly` | `price_1UGTCWFtRE7HPYjVGsFOqR57` — 499 Kč / měsíc, CZK | ✅ |
| `pro_yearly` | `price_1UGTCYFtRE7HPYjV6EaWgt2a` — 3 990 Kč / rok | ✅ |
| `max_monthly` | `price_1UGTCbFtRE7HPYjVjL86vPRu` — 999 Kč / měsíc | ✅ |
| `max_yearly` | `price_1UGTCdFtRE7HPYjVRJ3t36lm` — 7 990 Kč / rok | ✅ |
| Trial na cenách | žádný (`trial_period_days: null`), 30 dní řeší kód | ✅ |
| Kupon `MAX30` | 30 %, `duration: once`, platný, použit 0× | ✅ |
| Portál zákazníka | **žádná konfigurace** | ❌ → opraveno |
| Webhook | `we_1UGTChFtRE7HPYjVlngdNYo2` → `https://www.managero.app/api/billing/webhook`, stav enabled, všech 7 událostí | ✅ |
| Stripe Tax | nenastavený (status `pending`, chybí sídlo), 0 daňových registrací | ✅ (nezapínat) |
| Předplatná / zákazníci | 0 / 0 | — |

Poznámka k cenám: mají `tax_behavior: exclusive`. Protože není žádná daňová sazba ani Stripe Tax,
zákazník platí přesně uvedenou částku a na dokladu žádná DPH není. Měnit to nejde (u existující
ceny Stripe `tax_behavior` přepsat nedovolí) a není potřeba. Daňové sazby (`tax_rates`) konektor
neumí vypsat; na cenách ani předplatných žádné nejsou (předplatné neexistuje žádné).

## Co jsem změnil

1. **Vytvořena konfigurace portálu `bpc_1USwa5FtRE7HPYjVYBCPsfIc`** (je i výchozí, `is_default: true`),
   `metadata.app=managero`, takže ji `lib/billing.ts → portalConfiguration` najde:
   - business_profile: headline „Managero“, zásady `https://www.managero.app/soukromi`,
     podmínky `https://www.managero.app/obchodni-podminky`
   - faktury, změna karty, údaje zákazníka (e-mail, adresa, jméno, DIČ/IČ)
   - zrušení na konci období (`at_period_end`) s důvody too_expensive, missing_features,
     switched_service, unused, other
   - změna tarifu mezi 4 cenami výše, prorace `create_prorations`
2. Navíc oproti kódu (bezpečnější výchozí hodnoty):
   - **změna počtu kusů vypnutá** (`adjustable_quantity: false`) — Stripe ji u produktů zapnul sám,
     zákazník by si jinak mohl „koupit“ 3× Pro;
   - **změna tarifu ve zkušební době trial nekončí** (`trial_update_behavior: continue_trial`) —
     výchozí `end_trial` by při přechodu Pro ↔ Max v trialu hned strhl kartu, což odporuje slibu
     „30 dní zdarma“.

   Totéž (i s odkazy na podmínky a soukromí) teď nastavuje i kód v `lib/billing.ts →
   portalConfiguration`, když konfiguraci zakládá sám (sandbox, nový účet).
3. **Barvy značky** (Settings → Branding) přes API: hlavní barva `#C8F542` (limetková
   z manifestu), doplňková `#16181A`, tlačítko v pokladně `#16181A` na bílém pozadí.
   Logo ani ikonu konektor nahrát neumí.

## ⚠ Účet zatím neumí přijímat platby

`charges_enabled: false`, `payouts_enabled: false`, důvod `requirements.past_due`. Chybí:
- **ověření totožnosti** — automatické ověření jména, data narození a telefonu selhalo
  (`verification_failed_keyed_identity`); Stripe chce **doklad totožnosti** (občanku/pas)
  a **selfie (proof of liveness)**;
- **bankovní účet pro výplaty** (`external_account`).

Dokud tohle Martin v Dashboardu nedoplní (Settings → Business → nebo banner nahoře v
Dashboardu), živá pokladna zaplatit nepůjde. Přes API to doplnit nejde a ani nemá —
doklad, selfie a účet zadává jen majitel.

## Veřejné údaje teď vs. cíl

| Pole | Teď | Má být |
|---|---|---|
| Název pro zákazníky | Managero | ✅ |
| Výpis na kartě | MANAGERO | ✅ |
| E-mail podpory | info@mndesign.cz | **podpora@managero.app** |
| Telefon podpory | +420727960413 | ✅ |
| Web | managero.app | **https://www.managero.app** |
| Odkaz podpory | https://managero.app/podpora | (může zůstat, ideálně s www) |
| Adresa podpory | Míru 482, 790 70 Javorník | ✅ |

Nic jsem nemazal, nevracel ani neplatil; webhook ani podpisový klíč se neměnily
(`STRIPE_WEBHOOK_SECRET` ve Vercelu zůstává platný).

## Co musí Martin kliknout v Dashboardu (živý režim)

**Settings → Business → Public details**
- Název pro zákazníky: `Managero`
- Výpis na kartě (statement descriptor): `MANAGERO`
- E-mail podpory: `podpora@managero.app`
- Telefon podpory: `+420 727 960 413`
- Web: `https://www.managero.app`
- Adresa podpory: stejná jako sídlo (Míru 482, 790 70 Javorník)
- Obchodní podmínky: `https://www.managero.app/obchodni-podminky`
- Zásady ochrany soukromí: `https://www.managero.app/soukromi`
- Potom ve **Vercelu** nastavit `STRIPE_SOUHLAS_PODMINEK=1` (Production) a **redeploy**.
  Pořadí je důležité — bez URL podmínek Stripe pokladnu se souhlasem odmítne.

**Settings → Billing → Invoices**
- Výchozí patička faktury:
  `Neplátce DPH. Martin Nemeškal, IČO 17944953, Míru 482, 790 70 Javorník, zapsán v živnostenském rejstříku vedeném MěÚ Jeseník.`
  (kód ji nastavuje i u každého zákazníka, dashboard je pojistka)

**Settings → Billing → Subscriptions and emails**
- Posílat zákazníkům faktury a potvrzení plateb e-mailem: zapnout
- Připomínka 7 dní před koncem zkušební doby: zapnout
- E-maily o neúspěšné platbě: zapnout
- Smart Retries: zapnout
- Po posledním neúspěšném pokusu: **zrušit předplatné**

**Stripe Tax**: nechat vypnutý, nepřidávat žádné daňové sazby ani registrace.

Volitelně: **Settings → Branding** — barvy jsou nastavené, chybí nahrát ikonu a logo
(`public/icon-512.png`).

Proč to musí Martin: konektor Stripe nemá zápis do veřejných údajů účtu, nastavení faktur
ani e-mailů předplatného (u vlastního účtu to Stripe API vůbec neumožňuje — jen Dashboard).
