# Věrnost: Bannery (okruh N)

Promo bannery jsou akce a oznámení nahoře na stránce podniku. Správa je ve **Vzhled → Bannery** (oprávnění `klient.vzhled`).
Host vidí nejvýš pět aktivních, v zadaném pořadí a jen ty, které jsou pro něj (cílení, plán, jazyk).

| Řádek | Stav | Kde to je / čím se hlídá |
|---|---|---|
| N1 počítadlo zobrazení a prokliků | HOTOVO | `client_banner_stats` (jeden příkaz `ON CONFLICT DO UPDATE`), `api/client/b/[slug]/banner-event`, test `w5-bannery` |
| N2 cílení člen/nečlen/úroveň/skupina | HOTOVO | `lib/bannery.ts` (`cilSedi`), test `w5-bannery` |
| N3 plánování s hodinami a opakováním | HOTOVO | datum od/do (W5) a nově dny v týdnu + hodiny od–do (i přes půlnoc) v pražském čase: `lib/banneryPlan.ts`, `BanneryPlan.tsx`, test `w6-bannery` |
| N4 duplikovat, koncept, archiv | HOTOVO | `api/client/admin/banners` (akce `duplicate`, `archive`, `restore`), test `w5-bannery` |
| N5 odkaz na konkrétní kupon/kampaň | HOTOVO | `link_kind` `coupon` a `campaign`, ověření, že cíl patří podniku, test `w5-bannery` |
| N6 přeřazení v transakci a validace order | HOTOVO | jeden příkaz `UPDATE ... FROM unnest`, `overPoradi` (úplný seznam id podniku), test `w5-bannery` |
| N7 jazykové mutace | HOTOVO | `client_banners.i18n`, `BanneryJazyky.tsx`, výběr podle `?lang=` hosta, bez překladu čeština; test `w6-bannery` |

## Jak to provozovatel používá

1. **Plán.** V editoru banneru zvol dny („Po“–„Ne“) a hodiny „Od“ a „Do“. Prázdné dny = každý den, prázdné hodiny = celý den.
   Hodiny přes půlnoc (22:00–02:00) patří ke dni, ve kterém začaly. Spolu s „Platí od / do“ to dává opakování
   (například „po–pá 8:00–11:00 od 1. 10. do 31. 12.“). Čas je vždy pražský. Neúplné hodiny editor i server odmítnou.
2. **Stav v seznamu.** U banneru je štítek s plánem a „vidí se“ nebo „mimo plán (po–pá 08:00–11:00)“, ať je jasné, proč se zrovna teď
   nezobrazuje. Banner mimo plán nezabírá místo z limitu pěti.
3. **Jazyky.** Pod plánem rozbal jazyk (angličtina, němčina, slovenština, polština) a vyplň nadpis a text. Český text je původní a platí vždy,
   kde překlad chybí. Prázdný jazyk se neukládá; text bez nadpisu server odmítne.
4. **Host** dostane text v jazyce své stránky; plán ani překlady ostatních jazyků se mu v odpovědi nevrací.
