# Věrnost: Poukazy (okruh P)

Dárkový poukaz je peněžní: má hodnotu a zůstatek v celých jednotkách měny podniku, uplatní se na víckrát a kód
`DP-XXXX-XXXX` je jedinečný (poslední znak je kontrolní). Kupon je výhoda, ne peníze, proto zvlášť.
Správa je ve **Věrnost → Poukazy**. Oprávnění: `poukazy.zobrazit`, `poukazy.spravovat`, `poukazy.uplatnit`.

| Řádek | Stav | Kde to je / čím se hlídá |
|---|---|---|
| P1 přehled závazku, prodej a uplatnění po měsících | HOTOVO | `lib/poukazyPrehledDb.ts`, `components/client/loyalty/PoukazyPrehled.tsx`, test `w5-poukazy` |
| P1 export pro účetnictví | HOTOVO | `lib/poukazyUcetni.ts` (souhrn po měsících, deník pohybů), `?export=mesice` a `?export=pohyby`, `PoukazyNastaveni.tsx` (`PoukazyUcetnictvi`), test `w6-poukazy` |
| P2 odeslání e-mailem obdarovanému | HOTOVO | `lib/poukazyEmail.ts`, `PoukazyOdeslani.tsx`, test `w5-poukazy` |
| P2 šablony vzhledu | HOTOVO | `lib/poukazySablony.ts` (6 šablon), výběr s náhledem `PoukazyVzhled.tsx`, tisk (`lib/poukazyTisk.ts`) i e-mail, test `w6-poukazy` |
| P3 připomínka expirace hostovi i podniku | HOTOVO | denní cron `pripomenPoukazy` (`lib/poukazyPrehledDb.ts`), test `w5-poukazy` |
| P3 hromadné prodloužení | HOTOVO | `prodlouzPoukazy` + náhled kolika poukazů se to dotkne, test `w5-poukazy` |
| P4 nejmenší a největší částka uplatnění | HOTOVO | `posudUplatneni` + podmínka v SQL, test `w5-poukazy` |
| P4 uplatnění jen s určitou útratou | HOTOVO | `minUtrata` v `lib/poukazy.ts`, pole „Výše účtu“ v detailu poukazu i u kasy (`CardScan.tsx`), test `w6-poukazy` |
| P5 vazba na hosta (`customer_id`), poukaz v aplikaci hosta | HOTOVO | `lib/poukazyHostDb.ts` (přiřazení správcem, převzetí hostem, odebrání), `PoukazyHost.tsx`, `HostPoukazy.tsx` v Moje, „Přidat do mé aplikace“ v `MamPoukaz.tsx`, test `w6-poukazy` |
| P6 body za nákup poukazu | HOTOVO | nastavení „Bodů za nákup“ + atomický zábor `points_awarded` (`pripisBodyZaNakup`), test `w6-poukazy` |
| P6 zda se z uplatnění počítá cashback/body | HOTOVO | pravidlo „Kredit a poukaz bez bodů“ (Věrnost → Body a úrovně, vlna W2); u kasy teď i pole „Z toho zaplaceno kreditem nebo poukazem“ a po uplatnění hláška, co s body |
| Online prodej poukazů přes platební bránu | NELZE | potřebuje účet u platební brány (Stripe), smlouvu a ověřený web provozovatele, webhook s ověřením podpisu, vrácení peněz a daňové doklady; nejde to dodělat v repu bez účtu |

## Jak to provozovatel používá

1. **Založení.** Nový poukaz: hodnota, počet kusů (až 100), platnost, vzhled, volitelně obdarovaný a kupující.
   Pole „Host v aplikaci“ přiřadí poukaz členovi (u dávky se nepřiřazuje). Pole „Kupující člen“ určuje, kdo dostane body za nákup.
2. **Nastavení** (přehled nad seznamem): nejmenší a největší uplatnění, **uplatnit od účtu** (0 = bez podmínky),
   **bodů za nákup** (za každých 100 hodnoty, 0 = žádné). Změny jdou do historie změn.
3. **U kasy** (Kartička → Poukaz): kód, částka, případně výše účtu. Opakované odeslání téhož uplatnění se neodečte dvakrát.
   Pokud podnik nedává body z části zaplacené poukazem, obsluha po uplatnění uvidí, kolik zadat jako „zaplaceno poukazem“.
4. **Host.** V Moje vidí poukazy, které mu patří: kód, QR, zůstatek, platnost. Může si přidat poukaz kódem a odebrat ho z aplikace
   (poukaz zůstane platný). Hostovi se nikdy nevrací jména z poukazu, poznámka ani e-mail.
5. **Účetnictví.** „Export pro účetnictví“: rozsah měsíců (nejvýš 36), souhrn po měsících nebo deník pohybů
   (prodej +, uplatnění −, vrácení +, zrušení −). Měsíce jsou pražské, čísla bez oddělovače tisíců, CSV se středníkem a BOM.

## Drobnosti

- Zobrazená jednotka je vždy měna podniku (`useMoney`), zadávaná částka je v celých jednotkách.
- Zrušení poukazu a vrácení uplatněné částky se potvrzují oknem; Enter odešle formulář, Escape okno zavře.
- Chyby sítě: výpadek při uplatnění zachová `ref`, takže opakování nic neodečte podruhé.
- Smazání účtu hosta odpojí poukazy (i kupujícího) a vymaže jména a poznámky (`lib/smazaniUctu.ts`).
