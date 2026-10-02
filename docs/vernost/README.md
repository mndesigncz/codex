# Věrnostní program: přehled dokumentace

Každý soubor odpovídá jednomu okruhu kontrolního seznamu mezer. Řádky mají stav HOTOVO (kde to je v kódu a čím je to hlídané) nebo NELZE (konkrétní důvod, proč to z repa nejde).

| Okruh | Soubor | Co v něm je |
|---|---|---|
| Razítka (R), souběhy a integrita (S) | [razitka-soubehy.md](razitka-soubehy.md) | kampaně, kombinovatelnost, okna platnosti, vypršení karet, storno, idempotence akcí u kasy |
| Body, úrovně, cashback (B) | [B-body-urovne-cashback.md](B-body-urovne-cashback.md) | pravidla bodů a stropy, kredit, cashback, úrovně, přehledy a exporty, jeden výpočet odměny |
| Kupony a promo kódy (K) | [kupony.md](kupony.md) | limity, cílení, koncept a archiv, historie změn, rozesílka, uplatnění u kasy |
| Skupiny, členové, zprávy a automatizace (G, Z) | [skupiny-a-zpravy.md](skupiny-a-zpravy.md) | seznam členů a jejich správa, skupiny, zprávy oznámením i e-mailem, automatizace |
| Host (H) | [host.md](host.md) | co vidí host na stránce podniku a v Moje |
| Poukazy (P) | [poukazy.md](poukazy.md) | dárkové poukazy, přehled závazku, export pro účetnictví |
| Bannery (N) | [bannery.md](bannery.md) | promo bannery, cílení, plánování, počítadla |

## Co z repa nejde (NELZE)

| Řádek | Okruh | Důvod |
|---|---|---|
| B2b vyloučené položky u částky zadané ručně u kasy | Body | U ručně zadané částky nejsou žádné položky, ze kterých by šlo odečíst. Platí minimum, zaokrouhlení, násobič a stropy |
| B6b storno u částky zadané ručně a u objednávky od stolu | Body | Nemají vazbu na účtenku v pokladně, takže není co ověřit. Vedení vrací body ručně (Zákazníci → Body ±) |
| Automatické odečtení slevy z účtenky (vyloučené položky, kupon na položku, X+Y) | Kupony | Kasa nemá rozhraní pro vložení slevy. Pravidla vidí host i obsluha a obsluha je uplatní ručně |
| Z1 SMS | Zprávy | Chybí SMS brána: smlouva s poskytovatelem (Twilio, GoSMS), API klíč, registrované jméno odesílatele a souhlas hosta. Kanál je v kódu připravený |
| Z3 stav „nedoručeno“ a „označeno jako spam“ | Zprávy | Potřebuje webhook v účtu Resend a ověřenou doménu v `EMAIL_FROM` |
| Online prodej poukazů přes platební bránu | Poukazy | Potřebuje účet u platební brány (Stripe), smlouvu, ověřený web, webhook s ověřením podpisu, vrácení peněz a daňové doklady |
