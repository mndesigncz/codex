// VYGENEROVÁNO z mapy oprávnění (kolo 67). Katalog se mění tady ručně;
// každý klíč musí mít v aplikaci místo, kde se kontroluje.
import type { Opravneni, SystemovaRole } from "./opravneni";

export const KATALOG: Opravneni[] = [
 {
  "id": "rozvrh.nahled",
  "oblast": "Rozvrh",
  "nazev": "Náhled rozvrhu týmu",
  "popis": "Jen ke čtení: kdo má kdy směnu (jména a časy, bez sazeb). Nahrazuje týmový přepínač show_team_schedule.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "rozvrh.burza",
  "oblast": "Rozvrh",
  "nazev": "Burza směn",
  "popis": "Nabídnout svou směnu a převzít cizí z burzy.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "rozvrh.zobrazit",
  "oblast": "Rozvrh",
  "nazev": "Plánovač rozvrhu",
  "popis": "Celý rozvrh podniku v plánovači: díry v pokrytí, poptávka z rezervací, typy směn, pevné dny, směny libovolného člena.",
  "citlivost": "střední",
  "vyzaduje": [
   "rozvrh.nahled"
  ]
 },
 {
  "id": "rozvrh.upravit",
  "oblast": "Rozvrh",
  "nazev": "Upravovat směny",
  "popis": "Přidávat, přesouvat a mazat jednotlivé směny, automatická úprava po změně dostupnosti, import z CSV, žádosti ke směnám za ostatní.",
  "citlivost": "střední",
  "vyzaduje": [
   "rozvrh.zobrazit"
  ]
 },
 {
  "id": "rozvrh.generovat",
  "oblast": "Rozvrh",
  "nazev": "Generovat rozvrh",
  "popis": "Automatický návrh rozvrhu a jeho uložení. Návrh čte dostupnost a volno všech. Přepsání celého měsíce navíc vyžaduje rozvrh.mazat_mesic.",
  "citlivost": "střední",
  "vyzaduje": [
   "rozvrh.upravit",
   "dostupnost.zobrazit",
   "volno.zobrazit"
  ]
 },
 {
  "id": "rozvrh.publikovat",
  "oblast": "Rozvrh",
  "nazev": "Publikovat rozvrh",
  "popis": "Zveřejní rozvrh měsíce a pošle upozornění všem, kdo mají směnu.",
  "citlivost": "nízká",
  "vyzaduje": [
   "rozvrh.zobrazit"
  ]
 },
 {
  "id": "rozvrh.mazat_mesic",
  "oblast": "Rozvrh",
  "nazev": "Vymazat celý měsíc",
  "popis": "Hromadné smazání všech směn v měsíci, včetně přepsání měsíce generátorem.",
  "citlivost": "střední",
  "vyzaduje": [
   "rozvrh.upravit"
  ]
 },
 {
  "id": "rozvrh.nastaveni",
  "oblast": "Rozvrh",
  "nazev": "Typy směn, pevné dny a pravidla",
  "popis": "Spravovat typy směn, pevné dny lidí a pravidla generátoru (max. dní po sobě, hodiny za měsíc, osobní výjimky).",
  "citlivost": "střední",
  "vyzaduje": [
   "rozvrh.zobrazit"
  ]
 },
 {
  "id": "rozvrh.vymeny_schvalovat",
  "oblast": "Rozvrh",
  "nazev": "Schvalovat výměny směn",
  "popis": "Schválit nebo zamítnout převzetí směny z burzy.",
  "citlivost": "střední",
  "vyzaduje": [
   "rozvrh.zobrazit"
  ]
 },
 {
  "id": "rozvrh.exportovat",
  "oblast": "Rozvrh",
  "nazev": "Export a tisk rozvrhu",
  "popis": "Export do CSV (od tarifu Pro) a tisk rozvrhu.",
  "citlivost": "nízká",
  "vyzaduje": [
   "rozvrh.zobrazit"
  ]
 },
 {
  "id": "dostupnost.zobrazit",
  "oblast": "Rozvrh",
  "nazev": "Vidět dostupnost týmu",
  "popis": "Odeslané dostupnosti všech členů včetně poznámek, které často obsahují osobní důvody.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "dostupnost.upravit",
  "oblast": "Rozvrh",
  "nazev": "Upravit dostupnost za člena",
  "popis": "Vyplnit nebo opravit dostupnost jiného člena. Člen dostane upozornění.",
  "citlivost": "střední",
  "vyzaduje": [
   "dostupnost.zobrazit"
  ]
 },
 {
  "id": "volno.zobrazit",
  "oblast": "Rozvrh",
  "nazev": "Vidět žádosti o volno týmu",
  "popis": "Žádosti o volno všech členů včetně typu. Typ nemoc je zdravotní údaj.",
  "citlivost": "vysoká",
  "vyzaduje": []
 },
 {
  "id": "volno.schvalovat",
  "oblast": "Rozvrh",
  "nazev": "Schvalovat volno",
  "popis": "Schválit, zamítnout, upravit termín nebo zrušit žádost o volno kohokoli v týmu.",
  "citlivost": "střední",
  "vyzaduje": [
   "volno.zobrazit"
  ]
 },
 {
  "id": "dochazka.zobrazit",
  "oblast": "Docházka",
  "nazev": "Vidět docházku týmu",
  "popis": "Živý přehled, kdo je právě na směně, a historie příchodů a odchodů všech. Hodinové sazby jen s finance.mzdy.",
  "citlivost": "vysoká",
  "vyzaduje": []
 },
 {
  "id": "dochazka.upravit",
  "oblast": "Docházka",
  "nazev": "Upravovat docházku",
  "popis": "Ručně doplnit záznam, opravit čas, ukončit otevřený příchod. Mění odpracované hodiny, a tím i mzdu. Zapisuje se do auditu.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "dochazka.zobrazit"
  ]
 },
 {
  "id": "dochazka.mazat",
  "oblast": "Docházka",
  "nazev": "Mazat záznamy docházky",
  "popis": "Smazat záznam docházky, tedy i odpracované hodiny.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "dochazka.zobrazit"
  ]
 },
 {
  "id": "dochazka.exportovat",
  "oblast": "Docházka",
  "nazev": "Export docházky",
  "popis": "Export docházky do CSV. Sloupec Mzda je v exportu jen s finance.mzdy.",
  "citlivost": "střední",
  "vyzaduje": [
   "dochazka.zobrazit"
  ]
 },
 {
  "id": "dochazka.tablet",
  "oblast": "Docházka",
  "nazev": "Píchání za ostatní (tablet)",
  "popis": "Seznam lidí bez sazeb a píchání příchodu a odchodu za kohokoli z podniku po zadání jeho PINu.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "dochazka.piny",
  "oblast": "Docházka",
  "nazev": "Spravovat PINy",
  "popis": "Nastavit nebo smazat lidem PIN pro píchání na tabletu.",
  "citlivost": "vysoká",
  "vyzaduje": []
 },
 {
  "id": "sklad.zobrazit",
  "oblast": "Sklad",
  "nazev": "Vidět sklad",
  "popis": "Položky skladu, stavy, limity, kategorie a jména dodavatelů. Bez nákupních cen.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "sklad.ceny",
  "oblast": "Sklad",
  "nazev": "Vidět nákupní ceny",
  "popis": "Nákupní ceny (unitCost), hodnota zásob, ceny v datech inventury, upozornění na chybějící cenu.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "sklad.zobrazit"
  ]
 },
 {
  "id": "sklad.zapsat_stav",
  "oblast": "Sklad",
  "nazev": "Zapisovat stav a odpis",
  "popis": "Měnit počet kusů a zbytek v načatém balení, odepsat obsah, označit položku Nevedeme.",
  "citlivost": "nízká",
  "vyzaduje": [
   "sklad.zobrazit"
  ]
 },
 {
  "id": "sklad.navrhnout",
  "oblast": "Sklad",
  "nazev": "Navrhnout novou položku",
  "popis": "Založit položku jako návrh, který schválí někdo se sklad.schvalovat.",
  "citlivost": "nízká",
  "vyzaduje": [
   "sklad.zobrazit"
  ]
 },
 {
  "id": "sklad.pridat",
  "oblast": "Sklad",
  "nazev": "Přidávat položky",
  "popis": "Založit položku rovnou jako platnou, bez schvalování.",
  "citlivost": "střední",
  "vyzaduje": [
   "sklad.zobrazit"
  ]
 },
 {
  "id": "sklad.upravit",
  "oblast": "Sklad",
  "nazev": "Upravovat položky",
  "popis": "Všechna pole položky kromě ceny: název, kategorie, jednotka, limity, dodavatel, balení, porce. Platí i pro hromadné úpravy.",
  "citlivost": "střední",
  "vyzaduje": [
   "sklad.zobrazit"
  ]
 },
 {
  "id": "sklad.ceny_upravit",
  "oblast": "Sklad",
  "nazev": "Měnit nákupní ceny",
  "popis": "Nastavit nákupní cenu při založení, úpravě (i hromadné) a inline v recepturách.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "sklad.ceny"
  ]
 },
 {
  "id": "sklad.schvalovat",
  "oblast": "Sklad",
  "nazev": "Schvalovat návrhy položek",
  "popis": "Schválit nebo zamítnout položky navržené týmem.",
  "citlivost": "nízká",
  "vyzaduje": [
   "sklad.zobrazit"
  ]
 },
 {
  "id": "sklad.mazat",
  "oblast": "Sklad",
  "nazev": "Mazat položky",
  "popis": "Smazat položku i s historií pohybů, jednotlivě i hromadně.",
  "citlivost": "střední",
  "vyzaduje": [
   "sklad.zobrazit"
  ]
 },
 {
  "id": "sklad.kategorie",
  "oblast": "Sklad",
  "nazev": "Kategorie a výchozí hranice",
  "popis": "Zakládat, přejmenovávat, zanořovat a mazat kategorie a nastavovat balení. Také výchozí hranice nízkého a kritického stavu.",
  "citlivost": "nízká",
  "vyzaduje": [
   "sklad.zobrazit"
  ]
 },
 {
  "id": "sklad.historie",
  "oblast": "Sklad",
  "nazev": "Historie pohybů",
  "popis": "Historie pohybů skladu včetně jmen, kdo co odepsal.",
  "citlivost": "střední",
  "vyzaduje": [
   "sklad.zobrazit"
  ]
 },
 {
  "id": "sklad.hlasit",
  "oblast": "Sklad",
  "nazev": "Hlásit chybějící zboží",
  "popis": "Poslat hlášení Dochází / chybí.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "sklad.hlaseni_vyridit",
  "oblast": "Sklad",
  "nazev": "Vyřizovat hlášení",
  "popis": "Vidět hlášení od týmu a označit je jako vyřízená nebo je znovu otevřít. Upozornění na nová hlášení chodí držitelům.",
  "citlivost": "nízká",
  "vyzaduje": [
   "sklad.zobrazit"
  ]
 },
 {
  "id": "inventura.pocitat",
  "oblast": "Sklad",
  "nazev": "Počítat inventuru",
  "popis": "Vidět otevřenou inventuru a minulé inventury (bez cen) a zapisovat spočítané počty a zbytky.",
  "citlivost": "nízká",
  "vyzaduje": [
   "sklad.zobrazit"
  ]
 },
 {
  "id": "inventura.spravovat",
  "oblast": "Sklad",
  "nazev": "Zahájit a zrušit inventuru",
  "popis": "Zahájit novou inventuru nebo zrušit otevřenou.",
  "citlivost": "střední",
  "vyzaduje": [
   "inventura.pocitat"
  ]
 },
 {
  "id": "inventura.dokoncit",
  "oblast": "Sklad",
  "nazev": "Dokončit inventuru",
  "popis": "Zapsat rozdíly z inventury do skladu, což přepíše stavy.",
  "citlivost": "střední",
  "vyzaduje": [
   "inventura.pocitat"
  ]
 },
 {
  "id": "nakup.zobrazit",
  "oblast": "Sklad",
  "nazev": "Vidět objednávky u dodavatelů",
  "popis": "Seznam objednávek u dodavatelů. Celkovou nákupní cenu vidí jen se sklad.ceny.",
  "citlivost": "střední",
  "vyzaduje": [
   "sklad.zobrazit"
  ]
 },
 {
  "id": "nakup.vytvorit",
  "oblast": "Sklad",
  "nazev": "Sestavit objednávku",
  "popis": "Vytvořit objednávku (například z Nakoupit), zatím bez odeslání dodavateli.",
  "citlivost": "střední",
  "vyzaduje": [
   "nakup.zobrazit"
  ]
 },
 {
  "id": "nakup.odeslat",
  "oblast": "Sklad",
  "nazev": "Odeslat objednávku dodavateli",
  "popis": "Odeslat dodavateli e-mailem závaznou objednávku.",
  "citlivost": "střední",
  "vyzaduje": [
   "nakup.vytvorit",
   "dodavatele.zobrazit"
  ]
 },
 {
  "id": "nakup.prijmout",
  "oblast": "Sklad",
  "nazev": "Přijmout, zrušit a smazat objednávku",
  "popis": "Příjem zboží s automatickým naskladněním, zrušení a smazání objednávky. Celkovou cenu zadá jen se sklad.ceny_upravit.",
  "citlivost": "střední",
  "vyzaduje": [
   "nakup.zobrazit"
  ]
 },
 {
  "id": "dodavatele.zobrazit",
  "oblast": "Sklad",
  "nazev": "Vidět kontakty dodavatelů",
  "popis": "Dodavatelé včetně e-mailu, telefonu a poznámky.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "dodavatele.upravit",
  "oblast": "Sklad",
  "nazev": "Spravovat dodavatele",
  "popis": "Přidat, upravit a smazat dodavatele.",
  "citlivost": "střední",
  "vyzaduje": [
   "dodavatele.zobrazit"
  ]
 },
 {
  "id": "receptury.zobrazit",
  "oblast": "Receptury",
  "nazev": "Vidět receptury z kasy",
  "popis": "Katalog produktů z pokladny (prodejní ceny, prodané kusy) a vazby produktů na suroviny.",
  "citlivost": "střední",
  "vyzaduje": [
   "sklad.zobrazit"
  ]
 },
 {
  "id": "receptury.upravit",
  "oblast": "Receptury",
  "nazev": "Upravovat receptury z kasy",
  "popis": "Párovat produkty z kasy se surovinami a měnit množství, podle kterých se odepisuje sklad.",
  "citlivost": "střední",
  "vyzaduje": [
   "receptury.zobrazit"
  ]
 },
 {
  "id": "vyroba.vyrabet",
  "oblast": "Receptury",
  "nazev": "Vyrábět",
  "popis": "Vidět, co je k výrobě, a zapsat Vyrobeno. Naskladní výrobek a odepíše suroviny.",
  "citlivost": "nízká",
  "vyzaduje": [
   "sklad.zobrazit"
  ]
 },
 {
  "id": "vyroba.receptura",
  "oblast": "Receptury",
  "nazev": "Nastavit výrobní recepturu",
  "popis": "Zapnout Vyrábíme sami a nastavit suroviny, výtěžnost dávky a návod (tarif Max).",
  "citlivost": "nízká",
  "vyzaduje": [
   "vyroba.vyrabet"
  ]
 },
 {
  "id": "uzaverky.vytvorit",
  "oblast": "Uzávěrky",
  "nazev": "Vyplnit uzávěrku",
  "popis": "Odeslat uzávěrku kasy za sebe. Vidí přitom stav kasy z minulé směny, denní čísla z pokladny, spolupracovníky dne a dnešní průběhy postupů.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "uzaverky.predavka",
  "oblast": "Uzávěrky",
  "nazev": "Číst předávku směny",
  "popis": "Vzkaz od minulé směny pro další směnu.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "uzaverky.za_jineho",
  "oblast": "Uzávěrky",
  "nazev": "Uzávěrka za jiného",
  "popis": "Odeslat uzávěrku za jiného člena nebo za libovolnou směnu týmu (režim tabletu, doplnění chybějící).",
  "citlivost": "střední",
  "vyzaduje": [
   "uzaverky.vytvorit"
  ]
 },
 {
  "id": "uzaverky.bez_schvaleni",
  "oblast": "Uzávěrky",
  "nazev": "Uzávěrka bez schválení",
  "popis": "Uzávěrka se uloží rovnou schválená, i bez směny a s libovolným datem.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "uzaverky.vytvorit"
  ]
 },
 {
  "id": "uzaverky.obejit_postupy",
  "oblast": "Uzávěrky",
  "nazev": "Obejít povinné postupy",
  "popis": "Odeslat uzávěrku i v případě, že nejsou splněné povinné postupy.",
  "citlivost": "střední",
  "vyzaduje": [
   "uzaverky.vytvorit"
  ]
 },
 {
  "id": "uzaverky.zobrazit_vse",
  "oblast": "Uzávěrky",
  "nazev": "Vidět všechny uzávěrky",
  "popis": "Uzávěrky celého podniku, kalendář týmu, chybějící uzávěrky a detail dne (docházka, účtenky, postupy). Denní tržba z kasy jen s finance.trzby, mzdový snímek jen s finance.mzdy.",
  "citlivost": "vysoká",
  "vyzaduje": []
 },
 {
  "id": "uzaverky.schvalovat",
  "oblast": "Uzávěrky",
  "nazev": "Schvalovat uzávěrky",
  "popis": "Schválit čekající uzávěrku. Upozornění na čekající uzávěrky chodí držitelům.",
  "citlivost": "střední",
  "vyzaduje": [
   "uzaverky.zobrazit_vse"
  ]
 },
 {
  "id": "uzaverky.mazat",
  "oblast": "Uzávěrky",
  "nazev": "Mazat jakoukoli uzávěrku",
  "popis": "Smazat libovolnou uzávěrku v podniku, i schválenou.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "uzaverky.zobrazit_vse"
  ]
 },
 {
  "id": "uzaverky.mazat_vlastni",
  "oblast": "Uzávěrky",
  "nazev": "Mazat vlastní uzávěrky",
  "popis": "Autor smí smazat svou uzávěrku. Dnes to smí každý; oprávnění jde odebrat.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "uzaverky.exportovat",
  "oblast": "Uzávěrky",
  "nazev": "Export a tisk uzávěrek",
  "popis": "Export do CSV, export pro účetní a tisk. Řádek mezd je v exportu jen s finance.mzdy.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "uzaverky.zobrazit_vse"
  ]
 },
 {
  "id": "uzaverky.nastaveni",
  "oblast": "Uzávěrky",
  "nazev": "Pravidla kasy a uzávěrek",
  "popis": "Denní výplata hotově, hotovost přes noc, výplaty z kasy, dýška v šuplíku, uzávěrka vyžaduje směnu.",
  "citlivost": "vysoká",
  "vyzaduje": []
 },
 {
  "id": "finance.trzby",
  "oblast": "Finance",
  "nazev": "Vidět tržby",
  "popis": "Tržby z pokladny a z uzávěrek: denní přehled, tržba v kalendáři, widgety tržeb, porovnání uzávěrky s kasou, tržby v detailu směny.",
  "citlivost": "vysoká",
  "vyzaduje": []
 },
 {
  "id": "finance.moje_mzda",
  "oblast": "Finance",
  "nazev": "Vidět vlastní výdělek",
  "popis": "Odpracované hodiny krát vlastní sazba na kartě Tvoje směna a v přehledu.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "finance.trzby_lide",
  "oblast": "Finance",
  "nazev": "Tržby po lidech",
  "popis": "Tržby podle obsluhy a rozdíly v kase se jmény.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "finance.trzby"
  ]
 },
 {
  "id": "finance.zobrazit",
  "oblast": "Finance",
  "nazev": "Přehled financí",
  "popis": "Měsíční finance: kniha výdajů, hrubý výsledek, hodnota skladu. Mzdové řádky jen s finance.mzdy.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "finance.trzby"
  ]
 },
 {
  "id": "finance.analyza",
  "oblast": "Finance",
  "nazev": "Analýzy a doporučení",
  "popis": "Měsíční analýza špiček a doporučení. Skupina Lidé a průměrná sazba jen s finance.mzdy.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "finance.zobrazit"
  ]
 },
 {
  "id": "finance.mzdy",
  "oblast": "Finance",
  "nazev": "Vidět mzdy a sazby",
  "popis": "Hodinové sazby všech, mzda za směnu kohokoli, mzdové náklady a mzdový snímek v uzávěrkách.",
  "citlivost": "vysoká",
  "vyzaduje": []
 },
 {
  "id": "finance.sazby_upravit",
  "oblast": "Finance",
  "nazev": "Měnit hodinové sazby",
  "popis": "Nastavit hodinovou sazbu člena. Vlastní sazbu změnit nelze.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "finance.mzdy"
  ]
 },
 {
  "id": "finance.marze",
  "oblast": "Finance",
  "nazev": "Marže produktů",
  "popis": "Marže podle produktů, náklad za porci a marže v recepturách.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "sklad.ceny",
   "receptury.zobrazit"
  ]
 },
 {
  "id": "finance.ztraty",
  "oblast": "Finance",
  "nazev": "Ztráty a manka",
  "popis": "Ztráty z inventur vyčíslené v penězích a v procentech z prodaného.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "sklad.ceny"
  ]
 },
 {
  "id": "finance.uctenky_zobrazit",
  "oblast": "Finance",
  "nazev": "Vidět účtenky z nákupů",
  "popis": "Všechny nafocené účtenky podniku s částkami a autory.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "finance.uctenky_pridat",
  "oblast": "Finance",
  "nazev": "Přidávat účtenky",
  "popis": "Nafotit a přidat účtenku z nákupu. Bez finance.uctenky_zobrazit vidí jen své účtenky.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "finance.uctenky_upravit",
  "oblast": "Finance",
  "nazev": "Upravovat a mazat účtenky",
  "popis": "Upravit dodavatele, částku a poznámku účtenky, případně ji smazat.",
  "citlivost": "střední",
  "vyzaduje": [
   "finance.uctenky_zobrazit"
  ]
 },
 {
  "id": "finance.exportovat",
  "oblast": "Finance",
  "nazev": "Export pro účetní",
  "popis": "Export financí do CSV za rozsah měsíců.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "finance.zobrazit"
  ]
 },
 {
  "id": "finance.nastaveni",
  "oblast": "Finance",
  "nazev": "Finanční cíle",
  "popis": "Cílový podíl mzdových nákladů na tržbách.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "finance.zobrazit"
  ]
 },
 {
  "id": "ukoly.zobrazit_tym",
  "oblast": "Úkoly a postupy",
  "nazev": "Vidět úkoly celého týmu",
  "popis": "Úkoly všech členů, ne jen své a úkoly pro kohokoli.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "ukoly.zadavat",
  "oblast": "Úkoly a postupy",
  "nazev": "Zadávat úkoly ostatním",
  "popis": "Zadat úkol jinému členovi nebo pro kohokoli, včetně přeřazení existujícího úkolu.",
  "citlivost": "nízká",
  "vyzaduje": [
   "ukoly.zobrazit_tym"
  ]
 },
 {
  "id": "ukoly.upravit",
  "oblast": "Úkoly a postupy",
  "nazev": "Upravovat cizí úkoly",
  "popis": "Upravit nebo přesunout úkol či sérii, kterou vytvořil někdo jiný.",
  "citlivost": "nízká",
  "vyzaduje": [
   "ukoly.zobrazit_tym"
  ]
 },
 {
  "id": "ukoly.mazat",
  "oblast": "Úkoly a postupy",
  "nazev": "Mazat cizí úkoly",
  "popis": "Smazat úkol nebo celou sérii, kterou vytvořil někdo jiný.",
  "citlivost": "nízká",
  "vyzaduje": [
   "ukoly.zobrazit_tym"
  ]
 },
 {
  "id": "ukoly.plnit",
  "oblast": "Úkoly a postupy",
  "nazev": "Plnit cizí úkoly",
  "popis": "Odškrtávat a dokončovat úkoly přidělené jiným (tablet za vybranou osobu). Výrobní úkol pohne skladem.",
  "citlivost": "střední",
  "vyzaduje": [
   "ukoly.zobrazit_tym"
  ]
 },
 {
  "id": "postupy.zobrazit",
  "oblast": "Úkoly a postupy",
  "nazev": "Vidět postupy",
  "popis": "Seznam schválených postupů a připomínky.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "postupy.spoustet",
  "oblast": "Úkoly a postupy",
  "nazev": "Spouštět postupy",
  "popis": "Spustit a projít postup, odškrtat nebo přeskočit kroky, dokončit. Dokončení připíše body.",
  "citlivost": "nízká",
  "vyzaduje": [
   "postupy.zobrazit"
  ]
 },
 {
  "id": "postupy.navrhnout",
  "oblast": "Úkoly a postupy",
  "nazev": "Navrhnout postup",
  "popis": "Založit postup jako návrh ke schválení.",
  "citlivost": "nízká",
  "vyzaduje": [
   "postupy.zobrazit"
  ]
 },
 {
  "id": "postupy.vytvorit",
  "oblast": "Úkoly a postupy",
  "nazev": "Vytvářet postupy",
  "popis": "Založit schválený postup, i povinný před uzávěrkou, nebo vložit ukázkové postupy.",
  "citlivost": "nízká",
  "vyzaduje": [
   "postupy.zobrazit"
  ]
 },
 {
  "id": "postupy.upravit",
  "oblast": "Úkoly a postupy",
  "nazev": "Upravovat postupy",
  "popis": "Upravit kroky, připomínky a povinnost před uzávěrkou.",
  "citlivost": "nízká",
  "vyzaduje": [
   "postupy.zobrazit"
  ]
 },
 {
  "id": "postupy.schvalovat",
  "oblast": "Úkoly a postupy",
  "nazev": "Schvalovat návrhy postupů",
  "popis": "Schválit postupy navržené týmem. Vidí i neschválené návrhy.",
  "citlivost": "nízká",
  "vyzaduje": [
   "postupy.zobrazit"
  ]
 },
 {
  "id": "postupy.mazat",
  "oblast": "Úkoly a postupy",
  "nazev": "Mazat postupy",
  "popis": "Smazat postup.",
  "citlivost": "nízká",
  "vyzaduje": [
   "postupy.zobrazit"
  ]
 },
 {
  "id": "postupy.prubehy_tymu",
  "oblast": "Úkoly a postupy",
  "nazev": "Průběhy postupů týmu",
  "popis": "Kdo, kdy a jak rychle prošel postup a které kroky přeskočil s jakým důvodem. Upozornění na dokončení chodí držitelům.",
  "citlivost": "střední",
  "vyzaduje": [
   "postupy.zobrazit"
  ]
 },
 {
  "id": "planovani.zobrazit",
  "oblast": "Úkoly a postupy",
  "nazev": "Vidět plánovací nástěnku",
  "popis": "Karty nápadů a plánů na nástěnce.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "planovani.upravit",
  "oblast": "Úkoly a postupy",
  "nazev": "Upravovat plánovací nástěnku",
  "popis": "Přidávat, přesouvat, upravovat a mazat karty.",
  "citlivost": "nízká",
  "vyzaduje": [
   "planovani.zobrazit"
  ]
 },
 {
  "id": "navody.zobrazit",
  "oblast": "Návody",
  "nazev": "Číst návody",
  "popis": "Schválené návody a jejich kategorie.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "navody.navrhnout",
  "oblast": "Návody",
  "nazev": "Navrhnout návod",
  "popis": "Založit návod jako návrh ke schválení.",
  "citlivost": "nízká",
  "vyzaduje": [
   "navody.zobrazit"
  ]
 },
 {
  "id": "navody.vytvorit",
  "oblast": "Návody",
  "nazev": "Vytvářet návody",
  "popis": "Založit návod, který se rovnou zveřejní.",
  "citlivost": "nízká",
  "vyzaduje": [
   "navody.zobrazit"
  ]
 },
 {
  "id": "navody.upravit",
  "oblast": "Návody",
  "nazev": "Upravovat návody",
  "popis": "Upravit obsah, checklist, vazbu na produkt a položku skladu a připnutí k uzávěrce.",
  "citlivost": "nízká",
  "vyzaduje": [
   "navody.zobrazit"
  ]
 },
 {
  "id": "navody.schvalovat",
  "oblast": "Návody",
  "nazev": "Schvalovat návrhy návodů",
  "popis": "Schválit návody navržené týmem. Vidí i neschválené návrhy.",
  "citlivost": "nízká",
  "vyzaduje": [
   "navody.zobrazit"
  ]
 },
 {
  "id": "navody.mazat",
  "oblast": "Návody",
  "nazev": "Mazat návody",
  "popis": "Smazat návod.",
  "citlivost": "nízká",
  "vyzaduje": [
   "navody.zobrazit"
  ]
 },
 {
  "id": "navody.kategorie",
  "oblast": "Návody",
  "nazev": "Spravovat kategorie návodů",
  "popis": "Zakládat, přejmenovávat, řadit a mazat kategorie.",
  "citlivost": "nízká",
  "vyzaduje": [
   "navody.zobrazit"
  ]
 },
 {
  "id": "navody.povinne_cteni",
  "oblast": "Návody",
  "nazev": "Povinné čtení a čtenáři",
  "popis": "Označit návod jako povinné čtení a vidět jmenovitě, kdo ho přečetl a kdo ne.",
  "citlivost": "střední",
  "vyzaduje": [
   "navody.zobrazit"
  ]
 },
 {
  "id": "tym.zobrazit",
  "oblast": "Tým",
  "nazev": "Obrazovka týmu",
  "popis": "Nastavení týmu: seznam členů s pozicemi, rolemi a štítky (vlastník, právě v jiném podniku).",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "tym.kontakty",
  "oblast": "Tým",
  "nazev": "Kontakty členů",
  "popis": "E-maily a telefony členů týmu.",
  "citlivost": "střední",
  "vyzaduje": [
   "tym.zobrazit"
  ]
 },
 {
  "id": "tym.profil",
  "oblast": "Tým",
  "nazev": "Profil zaměstnance",
  "popis": "Detail člena: body, úroveň, směny, odpracované hodiny, dochvilnost. Sazba jen s finance.mzdy, hodnocení jen s hodnoceni.zobrazit.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "tym.zobrazit"
  ]
 },
 {
  "id": "tym.pozvat",
  "oblast": "Tým",
  "nazev": "Pozvat a přidat členy",
  "popis": "Připojovací kód (zobrazit i obnovit), pozvánky (odeslat, zobrazit, zrušit) a přímé založení účtu. Pozvat lze jen do výchozí role; do jiné role jen s tym.role_prirazovat.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "tym.zobrazit"
  ]
 },
 {
  "id": "tym.zalozit_ucet",
  "oblast": "Tým",
  "nazev": "Zakládat účty za člena",
  "popis": "Založit člověku účet přímo, bez pozvánky. Kdo zakládá, zná první heslo — proto zvlášť.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "tym.pozvat"
  ]
 },
 {
  "id": "tym.upravit",
  "oblast": "Tým",
  "nazev": "Upravit pozici člena",
  "popis": "Změnit pozici člena v podniku.",
  "citlivost": "nízká",
  "vyzaduje": [
   "tym.zobrazit"
  ]
 },
 {
  "id": "tym.odebrat",
  "oblast": "Tým",
  "nazev": "Odebrat člena",
  "popis": "Odebrat člena z podniku a z jeho konverzací. Vlastníka ani člena s širšími právy odebrat nelze.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "tym.zobrazit"
  ]
 },
 {
  "id": "tym.role_prirazovat",
  "oblast": "Tým",
  "nazev": "Přiřazovat role",
  "popis": "Změnit roli člena nebo roli v pozvánce. Přiřadit lze jen roli, jejíž oprávnění sám mám.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "tym.zobrazit"
  ]
 },
 {
  "id": "tym.role_spravovat",
  "oblast": "Tým",
  "nazev": "Spravovat vlastní role",
  "popis": "Vytvářet, kopírovat, upravovat a mazat vlastní role a nastavit výchozí roli pro nové členy. Do role lze dát jen oprávnění, která sám mám.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "tym.role_prirazovat"
  ]
 },
 {
  "id": "hodnoceni.zobrazit",
  "oblast": "Tým",
  "nazev": "Vidět hodnocení směn",
  "popis": "Kalendář a detail hodnocení směn, výtky a nehodnocené směny. Peníze z uzávěrky v detailu jen s finance.trzby.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "hodnoceni.hodnotit",
  "oblast": "Tým",
  "nazev": "Hodnotit směny",
  "popis": "Hvězdy, body, výtky a poznámky ke směně, oprava checklistů a kroků postupů.",
  "citlivost": "střední",
  "vyzaduje": [
   "hodnoceni.zobrazit"
  ]
 },
 {
  "id": "odmeny.zebricek",
  "oblast": "Tým",
  "nazev": "Žebříček bodů",
  "popis": "Body a úrovně všech členů. Výtky v žebříčku jen s hodnoceni.zobrazit.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "odmeny.katalog",
  "oblast": "Tým",
  "nazev": "Katalog odměn",
  "popis": "Přidat, aktivovat, deaktivovat a smazat odměny.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "odmeny.schvalovat",
  "oblast": "Tým",
  "nazev": "Schvalovat odměny",
  "popis": "Vidět žádosti týmu o výměnu bodů a schválit je nebo zamítnout (odečítá body).",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "odmeny.nastaveni",
  "oblast": "Tým",
  "nazev": "Úrovně a bodování",
  "popis": "Nastavit úrovně, benefity a kolik bodů je za úkoly, postupy a uzávěrky.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "chat.pouzivat",
  "oblast": "Komunikace",
  "nazev": "Týmový chat a ankety",
  "popis": "Číst a psát v týmovém chatu a konverzacích, jichž je člen, přikládat soubory, zakládat ankety a hlasovat v nich.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "chat.prime",
  "oblast": "Komunikace",
  "nazev": "Přímé zprávy",
  "popis": "Založit soukromou konverzaci s kolegou.",
  "citlivost": "nízká",
  "vyzaduje": [
   "chat.pouzivat"
  ]
 },
 {
  "id": "oznameni.spravovat",
  "oblast": "Komunikace",
  "nazev": "Oznámení a správa anket",
  "popis": "Vytvářet, upravovat, připínat a mazat oznámení na nástěnce (včetně archivu) a uzavírat cizí ankety.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "napady.pridat",
  "oblast": "Komunikace",
  "nazev": "Nápady a podněty",
  "popis": "Vidět podněty týmu, přidávat je a hlasovat.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "napady.spravovat",
  "oblast": "Komunikace",
  "nazev": "Spravovat podněty",
  "popis": "Měnit stav podnětu, přesunout ho do plánování (s planovani.upravit) a smazat cizí podnět.",
  "citlivost": "nízká",
  "vyzaduje": [
   "napady.pridat"
  ]
 },
 {
  "id": "klient.prehled",
  "oblast": "Zákazníci a menu",
  "nazev": "Vstup do Managero client",
  "popis": "Přehled režimu Client: počty, odznak čekajících. Dlaždice se ukazují podle dalších oprávnění.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "klient.nastaveni",
  "oblast": "Zákazníci a menu",
  "nazev": "Nastavení stránky pro hosty",
  "popis": "Zapnutí veřejné stránky, adresa (slug), povolení rezervací a objednávek, limity, geofence, automatické odesílání do kasy, výběr menu.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "klient.prehled"
  ]
 },
 {
  "id": "klient.vzhled",
  "oblast": "Zákazníci a menu",
  "nazev": "Vzhled stránky pro hosty",
  "popis": "Logo, cover, galerie, barva značky a design QR.",
  "citlivost": "nízká",
  "vyzaduje": [
   "klient.prehled"
  ]
 },
 {
  "id": "rezervace.zobrazit",
  "oblast": "Zákazníci a menu",
  "nazev": "Vidět rezervace",
  "popis": "Rezervace se jmény hostů a stoly. E-mail hosta jen se zakaznici.kontakty.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "rezervace.schvalovat",
  "oblast": "Zákazníci a menu",
  "nazev": "Potvrzovat rezervace",
  "popis": "Potvrdit nebo odmítnout rezervaci. Upozornění na nové rezervace chodí držitelům.",
  "citlivost": "střední",
  "vyzaduje": [
   "rezervace.zobrazit"
  ]
 },
 {
  "id": "rezervace.usadit",
  "oblast": "Zákazníci a menu",
  "nazev": "Usazovat hosty",
  "popis": "Přidělit stůl, usadit (otevře účet v kase) a označit jako hotovo.",
  "citlivost": "střední",
  "vyzaduje": [
   "rezervace.zobrazit"
  ]
 },
 {
  "id": "objednavky.zobrazit",
  "oblast": "Zákazníci a menu",
  "nazev": "Vidět objednávky od stolu",
  "popis": "Příjem objednávek od hostů (položky, cena, stůl, host).",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "objednavky.vyridit",
  "oblast": "Zákazníci a menu",
  "nazev": "Vyřizovat objednávky od stolu",
  "popis": "Přijmout, odmítnout nebo dokončit objednávku (hotovo připíše body) a znovu ji poslat do kasy.",
  "citlivost": "střední",
  "vyzaduje": [
   "objednavky.zobrazit"
  ]
 },
 {
  "id": "stoly.zobrazit",
  "oblast": "Zákazníci a menu",
  "nazev": "Vidět stoly a plánek",
  "popis": "Stoly a půdorys, bez QR tokenů.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "stoly.upravit",
  "oblast": "Zákazníci a menu",
  "nazev": "Spravovat stoly a plánek",
  "popis": "Přidat, upravit, importovat z kasy a smazat stoly, kreslit plánek.",
  "citlivost": "nízká",
  "vyzaduje": [
   "stoly.zobrazit"
  ]
 },
 {
  "id": "stoly.qr",
  "oblast": "Zákazníci a menu",
  "nazev": "QR kódy stolů",
  "popis": "Tisk a export QR kódů (odhalí tokeny) a vygenerování nového tokenu.",
  "citlivost": "nízká",
  "vyzaduje": [
   "stoly.zobrazit"
  ]
 },
 {
  "id": "zakaznici.zobrazit",
  "oblast": "Zákazníci a menu",
  "nazev": "Vidět členy klubu",
  "popis": "Seznam členů klubu se jmény, body, návštěvami a skupinami.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "klient.prehled"
  ]
 },
 {
  "id": "zakaznici.kontakty",
  "oblast": "Zákazníci a menu",
  "nazev": "Kontakty hostů",
  "popis": "E-maily hostů v seznamu členů a v rezervacích.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "zakaznici.zobrazit"
  ]
 },
 {
  "id": "zakaznici.skupiny",
  "oblast": "Zákazníci a menu",
  "nazev": "Skupiny členů",
  "popis": "Zakládat, přejmenovávat a mazat skupiny a přidávat do nich hosty.",
  "citlivost": "nízká",
  "vyzaduje": [
   "zakaznici.zobrazit"
  ]
 },
 {
  "id": "zakaznici.recenze",
  "oblast": "Zákazníci a menu",
  "nazev": "Hodnocení od hostů",
  "popis": "Recenze hostů a kdo z personálu byl ten den ve službě. Upozornění na slabá hodnocení chodí držitelům.",
  "citlivost": "střední",
  "vyzaduje": [
   "klient.prehled"
  ]
 },
 {
  "id": "zakaznici.zpravy",
  "oblast": "Zákazníci a menu",
  "nazev": "Zprávy hostům",
  "popis": "Odeslat, naplánovat a zrušit hromadnou zprávu členům klubu (včetně oznámení akce) a vidět historii zpráv.",
  "citlivost": "střední",
  "vyzaduje": [
   "klient.prehled"
  ]
 },
 {
  "id": "vernost.zobrazit",
  "oblast": "Zákazníci a menu",
  "nazev": "Vidět věrnostní program",
  "popis": "Souhrn věrnosti, deník bodů a kreditu, razítkové kampaně.",
  "citlivost": "střední",
  "vyzaduje": [
   "klient.prehled"
  ]
 },
 {
  "id": "vernost.pravidla",
  "oblast": "Zákazníci a menu",
  "nazev": "Pravidla věrnosti",
  "popis": "Body, cashback, prahy a slevy úrovní, narozeniny, doporučení, zapnutí věrnosti.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "vernost.zobrazit"
  ]
 },
 {
  "id": "vernost.kampane",
  "oblast": "Zákazníci a menu",
  "nazev": "Razítkové kampaně",
  "popis": "Založit, upravit, aktivovat a smazat kampaně. Smazáním zmizí i nasbíraná razítka.",
  "citlivost": "střední",
  "vyzaduje": [
   "vernost.zobrazit"
  ]
 },
 {
  "id": "vernost.upravit_body",
  "oblast": "Zákazníci a menu",
  "nazev": "Ručně upravit body",
  "popis": "Připsat nebo odebrat body členovi. Zapisuje se do auditu.",
  "citlivost": "střední",
  "vyzaduje": [
   "vernost.zobrazit"
  ]
 },
 {
  "id": "vernost.kredit_upravit",
  "oblast": "Zákazníci a menu",
  "nazev": "Ručně upravit kredit (peníze hosta)",
  "popis": "Připsat nebo odebrat kredit, tedy peníze hosta. Zapisuje se do auditu.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "vernost.upravit_body"
  ]
 },
 {
  "id": "vernost.karta",
  "oblast": "Zákazníci a menu",
  "nazev": "Načíst kartičku hosta",
  "popis": "Načíst kartičku u kasy, dát razítko za návštěvu a připsat věrnost z účtenky pokladny.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "vernost.body_z_castky",
  "oblast": "Zákazníci a menu",
  "nazev": "Body z ručně zadané částky",
  "popis": "Připsat body a cashback z ručně zadané částky.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "vernost.karta"
  ]
 },
 {
  "id": "vernost.platba_kreditem",
  "oblast": "Zákazníci a menu",
  "nazev": "Platba kreditem",
  "popis": "Odečíst kredit z peněženky hosta.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "vernost.karta"
  ]
 },
 {
  "id": "kupony.spravovat",
  "oblast": "Zákazníci a menu",
  "nazev": "Kupony a promo kódy",
  "popis": "Založit, upravit, aktivovat a smazat kupony a promo kódy.",
  "citlivost": "střední",
  "vyzaduje": [
   "vernost.zobrazit"
  ]
 },
 {
  "id": "kupony.uplatnit",
  "oblast": "Zákazníci a menu",
  "nazev": "Uplatnit kupon hosta",
  "popis": "Uplatnit kód kuponu u kasy. Zapisuje se do auditu.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "menu.zobrazit",
  "oblast": "Zákazníci a menu",
  "nazev": "Vidět menu v administraci",
  "popis": "Menu podniku včetně Wi-Fi hesla a informace o PINu.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "menu.upravit",
  "oblast": "Zákazníci a menu",
  "nazev": "Upravovat menu",
  "popis": "Založit menu, upravit sekce, položky, ceny a vzhled, import a párování s kasou (čte katalog kasy bez receptur), odznak novinka/tip u položky skladu.",
  "citlivost": "střední",
  "vyzaduje": [
   "menu.zobrazit"
  ]
 },
 {
  "id": "menu.ceny",
  "oblast": "Zákazníci a menu",
  "nazev": "Měnit ceny v menu",
  "popis": "Ceny položek menu a párování s pokladnou.",
  "citlivost": "střední",
  "vyzaduje": [
   "menu.upravit"
  ]
 },
 {
  "id": "menu.zverejnit",
  "oblast": "Zákazníci a menu",
  "nazev": "Zveřejnit menu",
  "popis": "Zapnout nebo vypnout menu, změnit adresu (slug) a nastavit nebo zrušit PIN pro vyprodáno.",
  "citlivost": "střední",
  "vyzaduje": [
   "menu.upravit"
  ]
 },
 {
  "id": "menu.mazat",
  "oblast": "Zákazníci a menu",
  "nazev": "Mazat menu",
  "popis": "Smazat celé menu. Vytištěné QR kódy pak přestanou fungovat.",
  "citlivost": "střední",
  "vyzaduje": [
   "menu.zobrazit"
  ]
 },
 {
  "id": "menu.vyprodano",
  "oblast": "Zákazníci a menu",
  "nazev": "Označit vyprodáno",
  "popis": "Přepnout u položky Vyprodáno. Nepřihlášený iPad to dál může přes PIN mimo role.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "akce.zobrazit",
  "oblast": "Zákazníci a menu",
  "nazev": "Vidět akce",
  "popis": "Akce podniku: termín, místo, obsluha, checklist, menu. Tržby a náklady jen s akce.finance.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "akce.checklist",
  "oblast": "Zákazníci a menu",
  "nazev": "Odškrtávat checklist akce",
  "popis": "Odškrtávat přípravný checklist akce.",
  "citlivost": "nízká",
  "vyzaduje": [
   "akce.zobrazit"
  ]
 },
 {
  "id": "akce.upravit",
  "oblast": "Zákazníci a menu",
  "nazev": "Spravovat akce",
  "popis": "Založit, upravit a zrušit akci, přidělit obsluhu (zakládá směny), balení s výdejem ze skladu, zveřejnit akci, fotky, menu, kasa akce, oznámení týmu. Rozeslání hostům navíc vyžaduje zakaznici.zpravy.",
  "citlivost": "střední",
  "vyzaduje": [
   "akce.zobrazit"
  ]
 },
 {
  "id": "akce.obsluha",
  "oblast": "Zákazníci a menu",
  "nazev": "Přidělit obsluhu akce",
  "popis": "Přidělit lidi na akci — zakládá směny, proto vyžaduje i úpravu rozvrhu.",
  "citlivost": "střední",
  "vyzaduje": [
   "akce.upravit",
   "rozvrh.upravit"
  ]
 },
 {
  "id": "akce.mazat",
  "oblast": "Zákazníci a menu",
  "nazev": "Mazat akce",
  "popis": "Smazat akci včetně jejích směn.",
  "citlivost": "nízká",
  "vyzaduje": [
   "akce.zobrazit"
  ]
 },
 {
  "id": "akce.finance",
  "oblast": "Zákazníci a menu",
  "nazev": "Finance akcí",
  "popis": "Tržby, náklady a výsledek akce, součet uzávěrek, tržba z kasy za okno akce, ruční zadání tržby a nákladů.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "akce.zobrazit",
   "finance.trzby"
  ]
 },
 {
  "id": "pokladna.stav",
  "oblast": "Pokladna",
  "nazev": "Stav napojení pokladny",
  "popis": "Zda je pokladna připojena, provozovny, zdraví synchronizace a diagnostika. Bez tajemství webhooku.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "pokladna.nastavit",
  "oblast": "Pokladna",
  "nazev": "Připojit a odpojit pokladnu",
  "popis": "Připojit pokladnu Storyous (API tajemství) nebo ji odpojit, spravovat tajemství webhooku.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "pokladna.stav"
  ]
 },
 {
  "id": "pokladna.synchronizovat",
  "oblast": "Pokladna",
  "nazev": "Synchronizovat pokladnu",
  "popis": "Ruční synchronizace, stažení historie, odpis skladu podle prodejů, převzetí skladu Storyous.",
  "citlivost": "střední",
  "vyzaduje": [
   "pokladna.stav"
  ]
 },
 {
  "id": "podnik.nastaveni",
  "oblast": "Nastavení podniku",
  "nazev": "Nastavení podniku",
  "popis": "Název, typ podniku, měna, formát čísel, začátek týdne, otevírací doba a rozložení přehledů.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "podnik.oteviraci_doba",
  "oblast": "Nastavení podniku",
  "nazev": "Otevírací doba",
  "popis": "Otevírací doba a zavřené dny — z nich vychází rozvrh a připomínky.",
  "citlivost": "nízká",
  "vyzaduje": []
 },
 {
  "id": "predplatne.zobrazit",
  "oblast": "Nastavení podniku",
  "nazev": "Vidět předplatné",
  "popis": "Plán, ceny, stav předplatného a affiliate odkaz. Samotný tarif vidí UI všem kvůli omezením funkcí.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "predplatne.spravovat",
  "oblast": "Nastavení podniku",
  "nazev": "Spravovat předplatné",
  "popis": "Pokladna Stripe, zákaznický portál (karta, faktury, zrušení) a přechod na Max.",
  "citlivost": "vysoká",
  "vyzaduje": [
   "predplatne.zobrazit"
  ]
 },
 {
  "id": "kiosk.spravovat",
  "oblast": "Nastavení podniku",
  "nazev": "Účet tabletu",
  "popis": "Vidět, založit nebo změnit přihlášení tabletu (e-mail a heslo).",
  "citlivost": "vysoká",
  "vyzaduje": []
 },
 {
  "id": "sdileni.spravovat",
  "oblast": "Nastavení podniku",
  "nazev": "Veřejné sdílené odkazy",
  "popis": "Vytvořit, upravit, vypnout a smazat veřejné odkazy na sklad nebo návody a jejich vzhled.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "integrace.spravovat",
  "oblast": "Nastavení podniku",
  "nazev": "Integrace",
  "popis": "Připojit nebo odpojit Noisium (API token) a posílat do něj úkoly.",
  "citlivost": "vysoká",
  "vyzaduje": []
 },
 {
  "id": "audit.zobrazit",
  "oblast": "Nastavení podniku",
  "nazev": "Historie změn",
  "popis": "Kdo co kdy v podniku změnil, včetně změn rolí a oprávnění.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "data.zaloha",
  "oblast": "Nastavení podniku",
  "nazev": "Dostávat zálohu dat",
  "popis": "Denní e-mail s kompletní zálohou dat: mzdy, sazby, osobní údaje, chat. Oprávnění k příjmu, ne k akci.",
  "citlivost": "vysoká",
  "vyzaduje": []
 },
 {
  "id": "notifikace.denni_souhrn",
  "oblast": "Nastavení podniku",
  "nazev": "Denní souhrn",
  "popis": "Večerní souhrn dne (push a e-mail). Tržby a rozdíl v kase jsou v něm jen s finance.trzby.",
  "citlivost": "střední",
  "vyzaduje": []
 },
 {
  "id": "organizace.prehled",
  "oblast": "Organizace",
  "nazev": "Přehled všech podniků",
  "popis": "Konsolidovaný přehled poboček. Zahrne jen podniky, kde má člověk toto oprávnění; tržby a mzdy jen tam, kde má finance.trzby a finance.mzdy.",
  "citlivost": "vysoká",
  "vyzaduje": []
 },
 {
  "id": "organizace.kopirovat",
  "oblast": "Organizace",
  "nazev": "Kopírovat z jiného podniku",
  "popis": "Zkopírovat návody, postupy nebo menu z jiného podniku organizace. Ve zdroji musí mít *.zobrazit, v cíli *.vytvorit nebo *.upravit.",
  "citlivost": "střední",
  "vyzaduje": []
 }
];

export const SYSTEMOVE_ROLE: SystemovaRole[] = [
 {
  "klic": "vedeni",
  "nazev": "Majitel / Vedení",
  "popis": "Systémová role (nejde upravit, jde zkopírovat). Má všechna udělitelná oprávnění. Vlastník podniku (teams.owner_id) má navíc vždy všechno včetně organizace.nastaveni a organizace.zalozit_podnik, bez ohledu na roli. Dnešní employer má po migraci přesně to, co dnes; oprávnění vázaná na vlastnictví (organizace) se řídí vlastnictvím stejně jako dnes.",
  "typ": "vedeni",
  "opravneni": [
   "akce.checklist",
   "akce.finance",
   "akce.mazat",
   "akce.obsluha",
   "akce.upravit",
   "akce.zobrazit",
   "audit.zobrazit",
   "chat.pouzivat",
   "chat.prime",
   "data.zaloha",
   "dochazka.exportovat",
   "dochazka.mazat",
   "dochazka.piny",
   "dochazka.tablet",
   "dochazka.upravit",
   "dochazka.zobrazit",
   "dodavatele.upravit",
   "dodavatele.zobrazit",
   "dostupnost.upravit",
   "dostupnost.zobrazit",
   "finance.analyza",
   "finance.exportovat",
   "finance.marze",
   "finance.moje_mzda",
   "finance.mzdy",
   "finance.nastaveni",
   "finance.sazby_upravit",
   "finance.trzby",
   "finance.trzby_lide",
   "finance.uctenky_pridat",
   "finance.uctenky_upravit",
   "finance.uctenky_zobrazit",
   "finance.zobrazit",
   "finance.ztraty",
   "hodnoceni.hodnotit",
   "hodnoceni.zobrazit",
   "integrace.spravovat",
   "inventura.dokoncit",
   "inventura.pocitat",
   "inventura.spravovat",
   "kiosk.spravovat",
   "klient.nastaveni",
   "klient.prehled",
   "klient.vzhled",
   "kupony.spravovat",
   "kupony.uplatnit",
   "menu.ceny",
   "menu.mazat",
   "menu.upravit",
   "menu.vyprodano",
   "menu.zobrazit",
   "menu.zverejnit",
   "nakup.odeslat",
   "nakup.prijmout",
   "nakup.vytvorit",
   "nakup.zobrazit",
   "napady.pridat",
   "napady.spravovat",
   "navody.kategorie",
   "navody.mazat",
   "navody.navrhnout",
   "navody.povinne_cteni",
   "navody.schvalovat",
   "navody.upravit",
   "navody.vytvorit",
   "navody.zobrazit",
   "notifikace.denni_souhrn",
   "objednavky.vyridit",
   "objednavky.zobrazit",
   "odmeny.katalog",
   "odmeny.nastaveni",
   "odmeny.schvalovat",
   "odmeny.zebricek",
   "organizace.kopirovat",
   "organizace.prehled",
   "oznameni.spravovat",
   "planovani.upravit",
   "planovani.zobrazit",
   "podnik.nastaveni",
   "podnik.oteviraci_doba",
   "pokladna.nastavit",
   "pokladna.stav",
   "pokladna.synchronizovat",
   "postupy.mazat",
   "postupy.navrhnout",
   "postupy.prubehy_tymu",
   "postupy.schvalovat",
   "postupy.spoustet",
   "postupy.upravit",
   "postupy.vytvorit",
   "postupy.zobrazit",
   "predplatne.spravovat",
   "predplatne.zobrazit",
   "receptury.upravit",
   "receptury.zobrazit",
   "rezervace.schvalovat",
   "rezervace.usadit",
   "rezervace.zobrazit",
   "rozvrh.burza",
   "rozvrh.exportovat",
   "rozvrh.generovat",
   "rozvrh.mazat_mesic",
   "rozvrh.nahled",
   "rozvrh.nastaveni",
   "rozvrh.publikovat",
   "rozvrh.upravit",
   "rozvrh.vymeny_schvalovat",
   "rozvrh.zobrazit",
   "sdileni.spravovat",
   "sklad.ceny",
   "sklad.ceny_upravit",
   "sklad.historie",
   "sklad.hlaseni_vyridit",
   "sklad.hlasit",
   "sklad.kategorie",
   "sklad.mazat",
   "sklad.navrhnout",
   "sklad.pridat",
   "sklad.schvalovat",
   "sklad.upravit",
   "sklad.zapsat_stav",
   "sklad.zobrazit",
   "stoly.qr",
   "stoly.upravit",
   "stoly.zobrazit",
   "tym.kontakty",
   "tym.odebrat",
   "tym.pozvat",
   "tym.profil",
   "tym.role_prirazovat",
   "tym.role_spravovat",
   "tym.upravit",
   "tym.zalozit_ucet",
   "tym.zobrazit",
   "ukoly.mazat",
   "ukoly.plnit",
   "ukoly.upravit",
   "ukoly.zadavat",
   "ukoly.zobrazit_tym",
   "uzaverky.bez_schvaleni",
   "uzaverky.exportovat",
   "uzaverky.mazat",
   "uzaverky.mazat_vlastni",
   "uzaverky.nastaveni",
   "uzaverky.obejit_postupy",
   "uzaverky.predavka",
   "uzaverky.schvalovat",
   "uzaverky.vytvorit",
   "uzaverky.za_jineho",
   "uzaverky.zobrazit_vse",
   "vernost.body_z_castky",
   "vernost.kampane",
   "vernost.karta",
   "vernost.kredit_upravit",
   "vernost.platba_kreditem",
   "vernost.pravidla",
   "vernost.upravit_body",
   "vernost.zobrazit",
   "volno.schvalovat",
   "volno.zobrazit",
   "vyroba.receptura",
   "vyroba.vyrabet",
   "zakaznici.kontakty",
   "zakaznici.recenze",
   "zakaznici.skupiny",
   "zakaznici.zobrazit",
   "zakaznici.zpravy"
  ]
 },
 {
  "klic": "provozni",
  "nazev": "Provozní / Manažer směny",
  "popis": "Řídí provoz: rozvrh, docházku, sklad bez nákupních cen, uzávěrky a jejich schvalování, úkoly, postupy, návody, hodnocení směn a provoz pro hosty. Nevidí tržby z kasy, mzdy, sazby, marže, nastavení podniku, předplatné ani správu rolí.",
  "typ": "vedeni",
  "opravneni": [
   "akce.checklist",
   "akce.upravit",
   "akce.zobrazit",
   "chat.pouzivat",
   "chat.prime",
   "dochazka.upravit",
   "dochazka.zobrazit",
   "dodavatele.zobrazit",
   "dostupnost.upravit",
   "dostupnost.zobrazit",
   "finance.moje_mzda",
   "hodnoceni.hodnotit",
   "hodnoceni.zobrazit",
   "inventura.dokoncit",
   "inventura.pocitat",
   "inventura.spravovat",
   "kupony.uplatnit",
   "menu.vyprodano",
   "menu.zobrazit",
   "nakup.prijmout",
   "nakup.vytvorit",
   "nakup.zobrazit",
   "napady.pridat",
   "napady.spravovat",
   "navody.kategorie",
   "navody.mazat",
   "navody.navrhnout",
   "navody.povinne_cteni",
   "navody.schvalovat",
   "navody.upravit",
   "navody.vytvorit",
   "navody.zobrazit",
   "objednavky.vyridit",
   "objednavky.zobrazit",
   "odmeny.schvalovat",
   "odmeny.zebricek",
   "oznameni.spravovat",
   "planovani.upravit",
   "planovani.zobrazit",
   "podnik.oteviraci_doba",
   "pokladna.stav",
   "postupy.mazat",
   "postupy.navrhnout",
   "postupy.prubehy_tymu",
   "postupy.schvalovat",
   "postupy.spoustet",
   "postupy.upravit",
   "postupy.vytvorit",
   "postupy.zobrazit",
   "receptury.zobrazit",
   "rezervace.schvalovat",
   "rezervace.usadit",
   "rezervace.zobrazit",
   "rozvrh.burza",
   "rozvrh.exportovat",
   "rozvrh.generovat",
   "rozvrh.nahled",
   "rozvrh.publikovat",
   "rozvrh.upravit",
   "rozvrh.vymeny_schvalovat",
   "rozvrh.zobrazit",
   "sklad.historie",
   "sklad.hlaseni_vyridit",
   "sklad.hlasit",
   "sklad.kategorie",
   "sklad.navrhnout",
   "sklad.pridat",
   "sklad.schvalovat",
   "sklad.upravit",
   "sklad.zapsat_stav",
   "sklad.zobrazit",
   "stoly.qr",
   "stoly.zobrazit",
   "tym.profil",
   "tym.zobrazit",
   "ukoly.mazat",
   "ukoly.plnit",
   "ukoly.upravit",
   "ukoly.zadavat",
   "ukoly.zobrazit_tym",
   "uzaverky.mazat_vlastni",
   "uzaverky.predavka",
   "uzaverky.schvalovat",
   "uzaverky.vytvorit",
   "uzaverky.za_jineho",
   "uzaverky.zobrazit_vse",
   "vernost.body_z_castky",
   "vernost.karta",
   "vernost.platba_kreditem",
   "volno.schvalovat",
   "volno.zobrazit",
   "vyroba.vyrabet"
  ]
 },
 {
  "klic": "barista",
  "nazev": "Barista / Obsluha",
  "popis": "Výchozí role pro nové členy (join kód, pozvánka bez role). Odpovídá tomu, co dnes smí employee v UI: vlastní uzávěrka, stav skladu a návrhy, inventura, výroba, postupy, návody, chat, podněty, příjem objednávek a kartičky hostů, vyprodáno, akce s checklistem, náhled rozvrhu. Podniky s vypnutým show_team_schedule dostanou při migraci kopii této role bez rozvrh.nahled. Záměrně se zavírají jen úniky na úrovni API, které UI zaměstnanci nikdy neukazovalo (viz pravidla).",
  "typ": "zamestnanec",
  "opravneni": [
   "akce.checklist",
   "akce.zobrazit",
   "chat.pouzivat",
   "chat.prime",
   "finance.moje_mzda",
   "inventura.pocitat",
   "kupony.uplatnit",
   "menu.vyprodano",
   "napady.pridat",
   "navody.navrhnout",
   "navody.zobrazit",
   "objednavky.vyridit",
   "objednavky.zobrazit",
   "postupy.navrhnout",
   "postupy.spoustet",
   "postupy.zobrazit",
   "rozvrh.burza",
   "rozvrh.nahled",
   "sklad.hlasit",
   "sklad.navrhnout",
   "sklad.zapsat_stav",
   "sklad.zobrazit",
   "uzaverky.mazat_vlastni",
   "uzaverky.predavka",
   "uzaverky.vytvorit",
   "vernost.body_z_castky",
   "vernost.karta",
   "vernost.platba_kreditem",
   "vyroba.vyrabet"
  ]
 },
 {
  "klic": "kuchar",
  "nazev": "Kuchař",
  "popis": "Kuchyně: sklad a odpisy, výroba, inventura, postupy a návody (i návrhy), objednávky od stolu ke čtení, menu a vyprodáno. Bez uzávěrek kasy a bez věrnosti hostů.",
  "typ": "zamestnanec",
  "opravneni": [
   "akce.checklist",
   "akce.zobrazit",
   "chat.pouzivat",
   "chat.prime",
   "finance.moje_mzda",
   "inventura.pocitat",
   "menu.vyprodano",
   "menu.zobrazit",
   "napady.pridat",
   "navody.navrhnout",
   "navody.zobrazit",
   "objednavky.zobrazit",
   "postupy.navrhnout",
   "postupy.spoustet",
   "postupy.zobrazit",
   "rozvrh.burza",
   "rozvrh.nahled",
   "sklad.hlasit",
   "sklad.navrhnout",
   "sklad.zapsat_stav",
   "sklad.zobrazit",
   "uzaverky.predavka",
   "vyroba.vyrabet"
  ]
 },
 {
  "klic": "skladnik",
  "nazev": "Skladník",
  "popis": "Celý sklad včetně nákupních cen, nákupy u dodavatelů, dodavatelé, inventura, receptury a výroba, přidávání účtenek z nákupu. Bez mazání položek, tržeb a mezd.",
  "typ": "vedeni",
  "opravneni": [
   "akce.checklist",
   "akce.zobrazit",
   "chat.pouzivat",
   "chat.prime",
   "dodavatele.upravit",
   "dodavatele.zobrazit",
   "finance.moje_mzda",
   "finance.uctenky_pridat",
   "inventura.dokoncit",
   "inventura.pocitat",
   "inventura.spravovat",
   "nakup.odeslat",
   "nakup.prijmout",
   "nakup.vytvorit",
   "nakup.zobrazit",
   "napady.pridat",
   "navody.navrhnout",
   "navody.zobrazit",
   "postupy.spoustet",
   "postupy.zobrazit",
   "receptury.zobrazit",
   "rozvrh.burza",
   "rozvrh.nahled",
   "sklad.ceny",
   "sklad.ceny_upravit",
   "sklad.historie",
   "sklad.hlaseni_vyridit",
   "sklad.hlasit",
   "sklad.kategorie",
   "sklad.navrhnout",
   "sklad.pridat",
   "sklad.schvalovat",
   "sklad.upravit",
   "sklad.zapsat_stav",
   "sklad.zobrazit",
   "uzaverky.predavka",
   "vyroba.receptura",
   "vyroba.vyrabet"
  ]
 },
 {
  "klic": "ucetni",
  "nazev": "Účetní",
  "popis": "Finance bez provozu: tržby, mzdy, marže, ztráty, účtenky, exporty, uzávěrky ke čtení a export, docházka ke čtení a export, nákupy, předplatné ke čtení, historie změn. Nemůže nic provozního měnit, schvalovat ani měnit sazby.",
  "typ": "vedeni",
  "opravneni": [
   "akce.finance",
   "akce.zobrazit",
   "audit.zobrazit",
   "chat.pouzivat",
   "chat.prime",
   "dochazka.exportovat",
   "dochazka.zobrazit",
   "dodavatele.zobrazit",
   "finance.analyza",
   "finance.exportovat",
   "finance.marze",
   "finance.moje_mzda",
   "finance.mzdy",
   "finance.trzby",
   "finance.trzby_lide",
   "finance.uctenky_pridat",
   "finance.uctenky_upravit",
   "finance.uctenky_zobrazit",
   "finance.zobrazit",
   "finance.ztraty",
   "nakup.zobrazit",
   "organizace.prehled",
   "predplatne.zobrazit",
   "receptury.zobrazit",
   "sklad.ceny",
   "sklad.zobrazit",
   "tym.zobrazit",
   "uzaverky.exportovat",
   "uzaverky.zobrazit_vse"
  ]
 },
 {
  "klic": "kiosk",
  "nazev": "Kiosk (tablet)",
  "popis": "Systémová role pouze pro účty typu kiosk. Nejde přiřadit osobě a vlastní role nesmí kombinovat dochazka.tablet s finance.*. Vlastni.* má jen v rozsahu profil a notifikace. Odpovídá dnešnímu chování tabletu: píchání s PINem, uzávěrka za kohokoli, všechny úkoly týmu, postupy za osobu, sklad, inventura, výroba, příjem objednávek a rezervací, kartička hosta, vyprodáno, akce, žebříček.",
  "typ": "kiosk",
  "opravneni": [
   "akce.checklist",
   "akce.zobrazit",
   "chat.pouzivat",
   "dochazka.tablet",
   "inventura.pocitat",
   "kupony.uplatnit",
   "menu.vyprodano",
   "navody.zobrazit",
   "objednavky.vyridit",
   "objednavky.zobrazit",
   "odmeny.zebricek",
   "postupy.spoustet",
   "postupy.zobrazit",
   "rezervace.zobrazit",
   "sklad.hlasit",
   "sklad.navrhnout",
   "sklad.zapsat_stav",
   "sklad.zobrazit",
   "ukoly.plnit",
   "ukoly.zobrazit_tym",
   "uzaverky.predavka",
   "uzaverky.vytvorit",
   "uzaverky.za_jineho",
   "vernost.body_z_castky",
   "vernost.karta",
   "vernost.platba_kreditem",
   "vyroba.vyrabet"
  ]
 }
];
