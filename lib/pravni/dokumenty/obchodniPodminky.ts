// Obchodní podmínky pro podniky (B2B předplatné služby Managero) — /obchodni-podminky.
//
// Psáno podle toho, co kód skutečně dělá: tarify a ceny z lib/plan.ts, zkušební doba
// a prodlužování ze Stripe (lib/billing.ts: trial_period_days, trial_will_end → e-mail,
// invoice.payment_failed → upozornění, portál se zrušením „at_period_end“), zálohy
// a export (app/api/backup, CSV exporty v modulech), retence zrušených podniků
// (lib/retence.ts). Body označené v docs/PRAVNI.md „k ověření advokátem“ jsou tu
// v konzervativní variantě (např. právo vypovědět při změně kvůli DPH).

import type { Firma } from '../../firma.ts';
import { LHUTY, RETENCE_TEXT, TARIFY, UCINNOST, czk, kc } from '../lhuty.ts';
import { kontakty, provozovatel, type Dokument } from './typy.ts';

const P = TARIFY.ceny;

function vetaCen(f: Firma, jazyk: 'cs' | 'en'): string {
  if (f.platceDph) {
    return jazyk === 'en'
      ? 'Prices are stated in Czech crowns (CZK) excluding VAT; VAT is added at the statutory rate.'
      : 'Ceny jsou uvedené v korunách českých bez DPH; DPH se k nim připočte v zákonné výši.';
  }
  return jazyk === 'en'
    ? 'Prices are stated in Czech crowns (CZK) and are final. The provider is not a VAT payer, so no VAT is added.'
    : 'Ceny jsou uvedené v korunách českých a jsou konečné. Poskytovatel není plátcem DPH, DPH se k nim proto nepřipočítává.';
}

export function obchodniPodminkyCs(f: Firma): Dokument {
  const L = LHUTY;
  return {
    titulek: 'Obchodní podmínky pro podniky',
    uvod: `Tyto obchodní podmínky upravují smlouvu o poskytování služby Managero podnikům, tedy používání aplikace pro provoz podniku a předplatné placených tarifů. Uzavírají se mezi poskytovatelem a podnikatelem, který si v Manageru založí podnik.`,
    aktualizace: UCINNOST.cs,
    obsah: true,
    sekce: [
      { id: 'strany', h: '1. Smluvní strany', li: [
        `Poskytovatel: ${provozovatel(f, 'cs')}. Kontakt: ${kontakty(f, 'cs')}. Managero je obchodní značka poskytovatele, ne samostatná společnost.`,
        'Zákazník: podnikatel (fyzická nebo právnická osoba), který si založí podnik v Manageru nebo objedná placený tarif v rámci své podnikatelské činnosti. Službu nelze objednat jako spotřebitel.',
        'Kdo za zákazníka podnik zakládá nebo tarif objednává, prohlašuje, že je k tomu oprávněn. Poskytovatel může požádat o doložení IČO nebo oprávnění k podnikání a bez něj placený tarif nezřídit nebo smlouvu ukončit.',
      ] },
      { id: 'pojmy', h: '2. Pojmy', li: [
        'Služba: webová aplikace Managero na managero.app a mobilní aplikace Managero (pro podnik a jeho tým) a Managero client (pro hosty podniku).',
        'Podnik: účet zákazníka v Manageru s jeho daty, nastavením a tarifem. Jeden zákazník může mít víc podniků; tarif se platí za každý podnik zvlášť.',
        'Uživatelé: lidé, které zákazník do podniku přizve nebo připojí (vedení, zaměstnanci, brigádníci, sdílený tablet). Hosté: lidé, kteří s podnikem komunikují přes Managero client nebo stránku podniku.',
        'Data zákazníka: vše, co zákazník a jeho uživatelé do služby vloží nebo co v ní pro podnik vznikne, včetně osobních údajů zaměstnanců a hostů.',
        '[[/#cenik|Ceník]]: aktuální přehled tarifů a cen na webu managero.app.',
      ] },
      { id: 'predmet', h: '3. Předmět smlouvy', p: [
        'Poskytovatel zákazníkovi zpřístupní službu v rozsahu zvoleného tarifu a udělí mu po dobu trvání smlouvy nevýhradní a nepřevoditelné oprávnění ji užívat pro potřeby jeho podniků. Jde o službu poskytovanou přes internet (SaaS), ne o prodej softwaru.',
        'Službu průběžně vyvíjíme. Funkce můžeme přidávat, měnit nebo nahrazovat; podstatné omezení funkce placeného tarifu oznámíme jako změnu podmínek podle článku 18.',
      ] },
      { id: 'uzavreni', h: '4. Uzavření smlouvy', li: [
        'Smlouva vzniká registrací podniku na webu managero.app, při které zákazník zaškrtnutím potvrdí, že jedná jako podnikatel v rámci své podnikatelské činnosti, souhlasí s těmito obchodními podmínkami a se [[zpracovatelska-smlouva|zpracovatelskou smlouvou]] a bere na vědomí [[soukromi|zásady ochrany osobních údajů]]. Smlouva se uzavírá na dobu neurčitou, nejdřív v tarifu Zdarma.',
        'Placený tarif zákazník objedná v aplikaci (Nastavení → Předplatné) a zaplatí v pokladně Stripe. Smlouva o placeném tarifu je uzavřená potvrzením objednávky.',
        'Před odesláním registrace nebo objednávky může zákazník údaje zkontrolovat a opravit. Verzi podmínek, se kterou souhlasil, a čas souhlasu ukládáme u účtu. Aktuální znění je vždy na této stránce a zákazník si ho může uložit nebo vytisknout; starší znění pošleme na požádání. Smlouva se uzavírá v češtině.',
        'Mobilní aplikace předplatné neprodávají ani nespravují. Podnik se zakládá a tarif se objednává na webu.',
      ] },
      { id: 'tarify', h: '5. Tarify a ceny', li: [
        `Zdarma: napořád, pro podnik až se ${TARIFY.zdarmaClenu} lidmi, v rozsahu podle ceníku.`,
        `Pro: ${kc(P.pro.month)} měsíčně nebo ${kc(P.pro.year)} ročně za podnik.`,
        `Max: ${kc(P.max.month)} měsíčně nebo ${kc(P.max.year)} ročně za podnik.`,
      ], po: [
        `${vetaCen(f, 'cs')} Co který tarif obsahuje, uvádí [[/#cenik|ceník]].`,
        `Stane-li se poskytovatel plátcem DPH, připočte se od dne registrace k cenám DPH v zákonné výši. Poskytovatel to oznámí nejméně ${L.oznameniZmenDni} dní předem (pokud to dovolí lhůta stanovená zákonem) a zákazník může smlouvu z tohoto důvodu vypovědět podle článku 18 bez jakékoli sankce.`,
      ] },
      { id: 'zkusebni-doba', h: '6. Zkušební doba', li: [
        `Nový podnik si může tarif Pro nebo Max vyzkoušet ${TARIFY.zkusebniDni} dní zdarma, a to jednou za dobu existence podniku. Na začátku zkušební doby se zadává platební karta.`,
        `Zhruba ${L.konecZkouskyPredemDni} dny před koncem zkušební doby pošleme vlastníkovi podniku upozornění e-mailem a v aplikaci.`,
        'Pokud zákazník předplatné během zkušební doby nezruší, strhne se po jejím skončení z karty první platba za zvolené období a předplatné dál pokračuje podle článku 7.',
        'Když zákazník předplatné během zkušební doby zruší, nic se nestrhne a po skončení zkušební doby se podnik vrátí na tarif Zdarma.',
      ] },
      { id: 'platby', h: '7. Platby, automatické prodlužování a faktury', li: [
        'Placený tarif se platí předem za zvolené období (měsíc nebo rok) platební kartou přes platební bránu Stripe (Stripe Payments Europe, Limited, Irsko). Údaje o kartě zadává zákazník přímo do Stripe; poskytovatel je nevidí ani neukládá.',
        'Předplatné se automaticky prodlužuje o stejné období, dokud ho zákazník nezruší. Platba za další období se strhne na jeho začátku.',
        `Fakturu (doklad o platbě) vystaví Stripe jménem poskytovatele a pošle ji e-mailem; všechny faktury jsou i ve správě předplatného (Nastavení → Předplatné → Spravovat předplatné). ${f.platceDph ? '' : 'Faktura nese údaj, že poskytovatel není plátcem DPH. '}Za správnost fakturačních údajů (název, adresa, IČO, případně DIČ) odpovídá zákazník; vyplní je v pokladně nebo ve správě předplatného.`,
      ] },
      { id: 'neuspesna-platba', h: '8. Neúspěšná platba', p: [
        'Když se platba nepodaří, Stripe ji zkusí opakovat a vlastníkovi podniku pošleme upozornění e-mailem a v aplikaci. Během opakovaných pokusů služba v placeném tarifu běží dál. Když neprojde ani poslední pokus, předplatné skončí a podnik přejde na tarif Zdarma: data zůstávají, jen funkce nad rámec tarifu Zdarma přestanou být dostupné. Žádné poplatky z prodlení ani smluvní pokuty neúčtujeme.',
      ] },
      { id: 'zmena-tarifu', h: '9. Změna tarifu', p: [
        'Tarif i období lze kdykoli změnit ve správě předplatného. Rozdíl ceny se poměrně započte podle toho, kolik zbývá ze zaplaceného období (doplatek, nebo kredit na další fakturu), jak ho vypočítá Stripe. Přechod na tarif Zdarma je zrušení předplatného podle článku 10.',
      ] },
      { id: 'zruseni', h: '10. Zrušení předplatného a vracení peněz', li: [
        'Předplatné zákazník zruší kdykoli v Nastavení → Předplatné → Spravovat předplatné, nebo e-mailem na podporu. Podrobný postup je na stránce [[zruseni-predplatneho|Zrušení předplatného a vrácení peněz]].',
        'Zrušení platí ke konci zaplaceného období (měsíce nebo roku). Do té doby podnik placený tarif používá dál, potom přejde na tarif Zdarma. Zrušení předplatného neukončuje smlouvu ani nemaže data.',
        'Cena za zaplacené období se po zrušení nevrací, ani poměrně u ročního předplatného.',
        `Výjimky, kdy vrátíme peníze (poměrnou nebo celou částku): chybná nebo dvojí platba; služba nebyla podstatnou část období dostupná z důvodů na straně poskytovatele nebo měla podstatnou vadu, kterou jsme neodstranili (článek 12); smlouvu vypověděl poskytovatel, aniž ji zákazník porušil; zákazník vypověděl smlouvu kvůli změně podmínek nebo cen (článek 18); a další případy, které stanoví zákon. Peníze vracíme na kartu, ze které platba proběhla, zpravidla do ${L.vraceniDni} dnů.`,
      ] },
      { id: 'akce', h: '11. Akce, kupony a doporučení', li: [
        `Nabídka Max: po koupi tarifu Pro má podnik ${TARIFY.maxNabidkaDni} dní možnost přejít na Max se slevou ${TARIFY.maxNabidkaProcent} % na první platbu tarifu Max, jak ji uvádí nabídka v aplikaci.`,
        `Doporučení: každý podnik má vlastní odkaz pro doporučení. Když doporučený nový podnik poprvé zaplatí předplatné, dostane doporučující podnik kredit ve výši jedné měsíční ceny svého tarifu (u tarifu Zdarma ceny tarifu Pro), který se odečte z jeho dalších faktur. Odměnu lze získat nejvýš ${TARIFY.doporuceniMesicne}× za kalendářní měsíc.`,
        'Kredit a slevy nelze vyplatit v penězích ani převést a zanikají smazáním podniku. Slevové kódy se nesčítají, pokud nabídka neříká jinak. Při zneužití (například doporučení sebe sama nebo fiktivních podniků) můžeme kredit nebo slevu odebrat.',
      ] },
      { id: 'dostupnost', h: '12. Dostupnost, vady a podpora', li: [
        'Službu provozujeme s odbornou péčí a usilujeme o její nepřetržitou dostupnost, ale negarantujeme konkrétní dostupnost (SLA). Údržbu děláme přednostně v noci; delší plánovanou odstávku oznámíme předem.',
        'Výpadky způsobené poskytovateli infrastruktury (hosting, databáze, e-maily, platby, doručování oznámení), výpadky internetu, zařízení zákazníka nebo vyšší mocí nejsou porušením smlouvy, pokud je poskytovatel nezavinil.',
        'Vadu služby zákazník oznámí bez zbytečného odkladu na podporu. Poskytovatel ji odstraní v přiměřené lhůtě. Pokud vada podstatně brání užívání a poskytovatel ji neodstraní ani v dodatečné přiměřené lhůtě, má zákazník nárok na přiměřenou slevu nebo vrácení poměrné části ceny za dobu trvání vady, případně může smlouvu vypovědět s okamžitou účinností.',
        `Podpora: ${f.emailPodpory}, telefon ${f.telefon}. Odpovídáme zpravidla do ${L.podporaPracDni} pracovních dnů; dobu vyřešení negarantujeme. Více na stránce [[podpora|Podpora]].`,
      ] },
      { id: 'povinnosti', h: '13. Povinnosti zákazníka', li: [
        'Uvádět pravdivé údaje a chránit přístupy do podniku. Zákazník odpovídá za to, komu přístup a jaká oprávnění dá, a za činnost svých uživatelů.',
        'Nezneužívat službu: nepokoušet se o neoprávněný přístup k cizím datům, neobcházet limity tarifů, nezatěžovat službu automatizovanými dotazy nad rámec běžného užívání, nešířit škodlivý kód a nevkládat nezákonný obsah. Pro obsah platí také [[podminky|podmínky užívání]].',
        'Data zákazníka jsou v jeho odpovědnosti. Zákazník je správcem osobních údajů svých zaměstnanců a hostů: odpovídá za právní základ zpracování, za informování lidí, jejichž údaje do služby vkládá (pomůže mu šablona [[informace-pro-zamestnance|Informace pro zaměstnance]]), za souhlasy hostů s novinkami a za obsah zpráv, které hostům posílá.',
        'Pokud podnik pošle hostům novinky nebo akce, je jejich odesílatelem podnik, ne poskytovatel. Zákazník odpovídá za to, že má od hostů souhlas, nebo jinak splňuje pravidla pro obchodní sdělení.',
      ] },
      { id: 'pracovni-pravo', h: '14. Nástroje pro práci s týmem a zákoník práce', p: [
        'Rozvrh směn, docházka, kontrola polohy při píchání, odměny, body, prémie, tresty a napomenutí, mzdové podklady a hodnocení jsou nástroje. O jejich použití rozhoduje zákazník jako zaměstnavatel a odpovídá za soulad se zákoníkem práce a ochranou osobních údajů. Zejména:',
      ], li: [
        'zaměstnancům se nesmějí ukládat peněžní postihy (pokuty) za porušení povinností (§ 346b zákoníku práce); krátit lze jen nenárokovou prémii, a to podle kritérií stanovených předem pro dané období;',
        'srážky ze mzdy jsou možné jen podle zákona nebo na základě dohody o srážkách ze mzdy (§ 146 a 147 zákoníku práce); náhradu škody a schodku lze požadovat jen podle § 250 a násl., u schodku na svěřených hodnotách jen s dohodou o odpovědnosti (§ 252);',
        'napomenutí v aplikaci není výtkou podle § 52 písm. g) zákoníku práce;',
        'kontrolu zaměstnanců, včetně ověření polohy při příchodu, smí zaměstnavatel zavést jen v souladu s § 316 zákoníku práce a o jejím rozsahu a způsobu musí zaměstnance předem informovat;',
        'body, žebříčky a návrhy aplikace (například na trest za pozdní příchod) jsou podklady. Rozhoduje vždy člověk ve vedení podniku.',
      ], po: [
        'Poskytovatel neposkytuje právní, daňové, účetní ani mzdové poradenství. Výpočty mezd a výplatních podkladů jsou orientační a zákazník je před použitím ověří.',
      ] },
      { id: 'data', h: '15. Data zákazníka, zálohy a osobní údaje', li: [
        'Data zákazníka patří zákazníkovi. Poskytovatel je používá jen k poskytování a zabezpečení služby, k podpoře a k plnění svých právních povinností. Z dat smí vytvářet souhrnné anonymní statistiky, ze kterých nejde poznat podnik ani člověka, a používat je ke zlepšování služby.',
        'Zpracování osobních údajů pro zákazníka upravuje [[zpracovatelska-smlouva|zpracovatelská smlouva]], která je nedílnou součástí těchto podmínek. Kde je poskytovatel správcem (účty, fakturace, podpora, bezpečnost), platí [[soukromi|zásady ochrany osobních údajů]].',
        `Každý den posíláme lidem s oprávněním k zálohám odkaz ke stažení zálohy podniku ve formátu JSON (odkaz platí ${L.odkazZalohyDni} dní a funguje jen po přihlášení). Databáze má u svého poskytovatele zálohu pro obnovu k bodu v čase. Zákazník si důležitá data průběžně ukládá sám (zálohy a exporty).`,
      ] },
      { id: 'dusevni-vlastnictvi', h: '16. Duševní vlastnictví', p: [
        'Software, design, texty a značka Managero patří poskytovateli. Zákazník je nesmí kopírovat, upravovat ani zpětně analyzovat, kromě případů, které výslovně dovoluje zákon. K datům zákazníka (texty, fotky, logo, nabídka) má poskytovatel licenci jen v rozsahu potřebném k poskytování služby: ukládat je, zobrazovat uživatelům a hostům (například veřejnou stránku podniku), přenášet a zálohovat. Návrhy a zpětnou vazbu ke službě smí poskytovatel použít bez nároku na odměnu.',
      ] },
      { id: 'odpovednost', h: '17. Odpovědnost a její omezení', p: [
        'Tento článek omezuje odpovědnost poskytovatele. Prosíme o pozornost.',
      ], li: [
        `Celková odpovědnost poskytovatele za škodu ze smlouvy nebo v souvislosti s ní je omezena součtem cen, které zákazník zaplatil za posledních ${L.stropMesicu} měsíců před událostí, ze které škoda vznikla, nejméně však částkou ${kc(L.stropMinKc)}.`,
        'Poskytovatel nehradí ušlý zisk, nepřímé a následné škody ani ztrátu dobrého jména. Neodpovídá za škodu způsobenou rozhodnutími zákazníka (například o mzdách, prémiích a trestech), nesprávnými údaji, které zákazník do služby vložil, výpadky třetích stran mimo kontrolu poskytovatele ani vyšší mocí.',
        'Při ztrátě dat poskytovatel obnoví data z poslední dostupné zálohy a poskytne zákazníkovi přiměřenou součinnost.',
        'Omezení neplatí pro škodu způsobenou úmyslně nebo z hrubé nedbalosti, pro újmu na přirozených právech člověka ani tam, kde je zákon nedovoluje. Nemění odpovědnost vůči subjektům údajů podle čl. 82 GDPR.',
        'Zákazník odpovídá za škodu způsobenou porušením svých povinností, zejména nezákonným zpracováním údajů svých zaměstnanců a hostů nebo nezákonným obsahem, a nahradí poskytovateli to, co musel kvůli takovému porušení zaplatit třetím osobám nebo úřadům.',
      ] },
      { id: 'zmeny', h: '18. Změny podmínek a cen', li: [
        `Podmínky, zpracovatelskou smlouvu a ceny můžeme měnit. Změnu oznámíme e-mailem vlastníkovi podniku a v aplikaci nejméně ${L.oznameniZmenDni} dní před její účinností.`,
        'Pokud zákazník se změnou nesouhlasí, může ji odmítnout a smlouvu vypovědět ke dni před účinností změny, bez jakékoli sankce. Nevyčerpanou část předplatného mu poměrně vrátíme. Jinak změna platí od svého dne účinnosti.',
        'Změna ceny se nedotkne již zaplaceného období. Kratší lhůtu můžeme použít jen u změn, které zákazníkovi neubírají práva, nebo u změn vynucených zákonem či rozhodnutím úřadu; i ty oznámíme.',
      ] },
      { id: 'ukonceni', h: '19. Trvání a ukončení smlouvy', li: [
        'Zákazník může smlouvu kdykoli vypovědět e-mailem na podporu nebo smazáním podniku v aplikaci. Zaplacené předplatné tím nevrací (s výjimkami podle článku 10).',
        `Poskytovatel může smlouvu vypovědět s výpovědní dobou ${L.vypovedProvozovateleMesicu} měsíce; nevyčerpanou část předplatného poměrně vrátí.`,
        'Poskytovatel může smlouvu vypovědět s okamžitou účinností nebo omezit přístup, pokud zákazník podstatně porušuje tyto podmínky (například nezákonný obsah, útoky na službu, zneužití cizích údajů) a nápravu nezjedná ani po výzvě, nebo bez výzvy, pokud porušení nelze napravit nebo hrozí vážná škoda.',
        `Podnik, jehož placené předplatné skončilo a ve kterém od té doby ${RETENCE_TEXT.zrusenyPodnikDni} dní nikdo nebyl aktivní (žádná změna ani docházka), smažeme včetně dat, protože ho zákazník zjevně přestal používat.`,
      ] },
      { id: 'po-ukonceni', h: '20. Data po ukončení a přechod k jinému poskytovateli', li: [
        'Během trvání smlouvy si zákazník může data kdykoli stáhnout: denní zálohu podniku ve formátu JSON (obsah podniku kromě soukromých zpráv a mzdových údajů, které záloha z důvodu ochrany soukromí nenese) a exporty CSV v jednotlivých modulech (například docházka, rozvrh, věrnostní program, kupony a poukazy). Na požádání vydáme bezplatně i další data podniku ve strojově čitelném formátu (JSON nebo CSV).',
        `Když smlouva skončí výpovědí, zůstane podnik ještě ${L.prechodneObdobiDni} dní (přechodné období) přístupný ke stažení dat a na požádání poskytneme součinnost s přechodem k jinému poskytovateli. Po přechodném období data uchováme ještě nejméně ${L.vyzvednutiDatDni} dní, během nichž si je zákazník může vyžádat. Potom je smažeme; ze záloh u poskytovatelů zmizí nejpozději do dalších ${L.zalohyDni} dnů. Ponecháme jen to, co nám ukládá zákon (například účetní doklady).`,
        'Smaže-li zákazník podnik sám v aplikaci, je to jeho pokyn k okamžitému výmazu: aplikace na to předem upozorní, smazání se potvrzuje heslem a data se smažou ihned.',
        'Za přechod k jinému poskytovateli ani za export dat nic neúčtujeme.',
      ] },
      { id: 'postoupeni', h: '21. Postoupení smlouvy', p: [
        `Zákazník předem souhlasí s tím, že poskytovatel smí tuto smlouvu včetně zpracovatelské smlouvy postoupit na právnickou osobu, kterou ovládá nebo na kterou převede provoz služby Managero (například na svou budoucí společnost s ručením omezeným). Postoupení oznámíme e-mailem nejméně ${L.oznameniZmenDni} dní předem a zákazník může smlouvu do dne postoupení vypovědět bez sankce. Zákazník smí smlouvu postoupit jen s předchozím souhlasem poskytovatele.`,
      ] },
      { id: 'komunikace', h: '22. Komunikace a doručování', p: [
        `Oznámení zákazníkovi posíláme na e-mail vlastníka podniku uvedený v účtu nebo v aplikaci; e-mail se považuje za doručený dnem odeslání, pokud se nevrátí jako nedoručitelný. Zákazník posílá oznámení na ${f.emailPodpory}.`,
      ] },
      { id: 'pravo', h: '23. Rozhodné právo a spory', p: [
        'Smlouva se řídí českým právem, zejména občanským zákoníkem. Spory bude rozhodovat obecný soud příslušný podle sídla poskytovatele. Ve věcech osobních údajů má přednost zpracovatelská smlouva. Je-li některé ustanovení neplatné, ostatní platí dál. Rozhodné je české znění; anglický překlad je jen informativní.',
      ] },
      { id: 'ucinnost', h: '24. Účinnost', p: [
        `Tyto obchodní podmínky platí od ${UCINNOST.cs} (verze 2026-10-21).`,
      ] },
    ],
  };
}

export function obchodniPodminkyEn(f: Firma): Dokument {
  const L = LHUTY;
  return {
    titulek: 'Business terms',
    uvod: `These business terms govern the contract for the Managero service provided to businesses: use of the app for running a business and subscriptions to paid plans. They are concluded between the provider and an entrepreneur who creates a business in Managero. This English version is for information only; the Czech version prevails.`,
    aktualizace: UCINNOST.en,
    obsah: true,
    sekce: [
      { id: 'strany', h: '1. Parties', li: [
        `Provider: ${provozovatel(f, 'en')}. Contact: ${kontakty(f, 'en')}. Managero is the provider's trade name, not a separate company.`,
        'Customer: an entrepreneur (natural or legal person) who creates a business in Managero or orders a paid plan in the course of their business. The service cannot be ordered as a consumer.',
        'Whoever creates a business or orders a plan on behalf of the customer confirms they are authorised to do so. The provider may ask for proof of the company ID or trade licence and refuse a paid plan or end the contract without it.',
      ] },
      { id: 'pojmy', h: '2. Definitions', li: [
        'Service: the Managero web app at managero.app and the mobile apps Managero (for the business and its team) and Managero client (for guests of the business).',
        'Business: the customer\'s account in Managero with its data, settings and plan. A customer may have several businesses; the plan is paid per business.',
        'Users: people the customer invites to or connects with the business (management, staff, temporary workers, shared tablet). Guests: people who interact with the business through Managero client or the business page.',
        'Customer data: everything the customer and its users put into the service or that is created in it for the business, including personal data of staff and guests.',
        '[[/#cenik|Price list]]: the current overview of plans and prices on managero.app.',
      ] },
      { id: 'predmet', h: '3. Subject of the contract', p: [
        'The provider makes the service available within the chosen plan and grants the customer, for the term of the contract, a non-exclusive, non-transferable right to use it for its businesses. It is a service provided over the internet (SaaS), not a sale of software.',
        'We develop the service continuously and may add, change or replace features; a material reduction of a paid-plan feature will be announced as a change of terms under section 18.',
      ] },
      { id: 'uzavreni', h: '4. Conclusion of the contract', li: [
        'The contract is concluded by registering a business on managero.app, where the customer ticks a box confirming they act as an entrepreneur in the course of their business, agree to these terms and to the [[zpracovatelska-smlouva|data processing agreement]], and acknowledge the [[soukromi|privacy policy]]. It is concluded for an indefinite period, starting on the Free plan.',
        'A paid plan is ordered in the app (Settings → Subscription) and paid in the Stripe checkout. The contract for the paid plan is concluded when the order is confirmed.',
        'The customer can check and correct details before submitting. We store the version of the terms agreed to and the time of consent with the account. The current version is always on this page and can be saved or printed; we send earlier versions on request. The contract is concluded in Czech.',
        'The mobile apps neither sell nor manage subscriptions. Businesses are created and plans ordered on the web.',
      ] },
      { id: 'tarify', h: '5. Plans and prices', li: [
        `Free: forever, for a business of up to ${TARIFY.zdarmaClenu} people, as listed in the price list.`,
        `Pro: ${czk(P.pro.month)} per month or ${czk(P.pro.year)} per year per business.`,
        `Max: ${czk(P.max.month)} per month or ${czk(P.max.year)} per year per business.`,
      ], po: [
        `${vetaCen(f, 'en')} The [[/#cenik|price list]] shows what each plan includes.`,
        `If the provider becomes a VAT payer, VAT at the statutory rate will be added to prices from the date of registration. The provider will announce this at least ${L.oznameniZmenDni} days in advance (where the statutory deadline allows) and the customer may terminate the contract for this reason under section 18 without any penalty.`,
      ] },
      { id: 'zkusebni-doba', h: '6. Trial period', li: [
        `A new business can try the Pro or Max plan free of charge for ${TARIFY.zkusebniDni} days, once per business. A payment card is entered at the start of the trial.`,
        `About ${L.konecZkouskyPredemDni} days before the trial ends we notify the business owner by email and in the app.`,
        'If the customer does not cancel during the trial, the first payment for the chosen period is charged to the card when the trial ends and the subscription continues under section 7.',
        'If the customer cancels during the trial, nothing is charged and the business returns to the Free plan when the trial ends.',
      ] },
      { id: 'platby', h: '7. Payments, automatic renewal and invoices', li: [
        'A paid plan is paid in advance for the chosen period (month or year) by card through the Stripe payment gateway (Stripe Payments Europe, Limited, Ireland). Card details are entered directly into Stripe; the provider neither sees nor stores them.',
        'The subscription renews automatically for the same period until cancelled. Payment for the next period is charged at its start.',
        `Stripe issues the invoice (proof of payment) on behalf of the provider and sends it by email; all invoices are also available in subscription management (Settings → Subscription → Manage subscription). ${f.platceDph ? '' : 'The invoice states that the provider is not a VAT payer. '}The customer is responsible for correct billing details (name, address, company ID, VAT ID if any), entered at checkout or in subscription management.`,
      ] },
      { id: 'neuspesna-platba', h: '8. Failed payment', p: [
        'If a payment fails, Stripe retries it and we notify the business owner by email and in the app. The paid plan keeps running during the retries. If the last retry also fails, the subscription ends and the business moves to the Free plan: the data stays, only features beyond the Free plan become unavailable. We charge no late fees or contractual penalties.',
      ] },
      { id: 'zmena-tarifu', h: '9. Changing plans', p: [
        'The plan and period can be changed at any time in subscription management. The price difference is prorated for the remainder of the paid period (an extra charge or a credit on the next invoice), as calculated by Stripe. Moving to the Free plan is a cancellation under section 10.',
      ] },
      { id: 'zruseni', h: '10. Cancellation and refunds', li: [
        'The customer can cancel at any time in Settings → Subscription → Manage subscription, or by email to support. Details are on the [[zruseni-predplatneho|Cancellation and refunds]] page.',
        'Cancellation takes effect at the end of the paid period (month or year). Until then the business keeps the paid plan; afterwards it moves to the Free plan. Cancelling a subscription does not end the contract or delete data.',
        'The price for a paid period is not refunded after cancellation, not even pro rata for an annual subscription.',
        `Exceptions where we refund (pro rata or in full): an erroneous or duplicate payment; the service was unavailable for a substantial part of the period for reasons on the provider's side or had a material defect we did not fix (section 12); the provider terminated the contract without breach by the customer; the customer terminated because of a change of terms or prices (section 18); and other cases set by law. Refunds go to the card used for the payment, usually within ${L.vraceniDni} days.`,
      ] },
      { id: 'akce', h: '11. Offers, coupons and referrals', li: [
        `Max offer: after buying Pro, the business has ${TARIFY.maxNabidkaDni} days to switch to Max with a ${TARIFY.maxNabidkaProcent} % discount on the first Max payment, as stated in the offer in the app.`,
        `Referrals: every business has its own referral link. When a referred new business pays its first subscription, the referring business receives a credit equal to one month of its plan (for the Free plan, of the Pro plan), deducted from its next invoices. The reward can be earned at most ${TARIFY.doporuceniMesicne} times per calendar month.`,
        'Credits and discounts cannot be paid out or transferred and expire when the business is deleted. Discount codes cannot be combined unless the offer says otherwise. In case of abuse (for example self-referral or fictitious businesses) we may remove the credit or discount.',
      ] },
      { id: 'dostupnost', h: '12. Availability, defects and support', li: [
        'We operate the service with professional care and aim for continuous availability, but we do not guarantee a specific availability (SLA). Maintenance is done preferably at night; longer planned downtime is announced in advance.',
        'Outages caused by infrastructure providers (hosting, database, email, payments, notification delivery), the internet, the customer\'s devices or force majeure are not a breach of contract unless caused by the provider.',
        'The customer reports a defect to support without undue delay. The provider fixes it within a reasonable time. If the defect substantially prevents use and is not fixed even within an additional reasonable period, the customer is entitled to a reasonable discount or a pro rata refund for the duration of the defect, or may terminate with immediate effect.',
        `Support: ${f.emailPodpory}, phone ${f.telefon}. We usually reply within ${L.podporaPracDni} working days; resolution time is not guaranteed. See the [[podpora|Support]] page.`,
      ] },
      { id: 'povinnosti', h: '13. Customer obligations', li: [
        'Provide truthful details and protect access to the business. The customer is responsible for who gets access and which permissions, and for the activity of its users.',
        'Do not misuse the service: no attempts to access others\' data, circumvent plan limits, load the service with automated requests beyond normal use, spread malicious code or upload unlawful content. The [[podminky|terms of use]] also apply to content.',
        'Customer data is the customer\'s responsibility. The customer is the controller of its staff\'s and guests\' personal data: it is responsible for the legal basis, for informing the people whose data it enters (the [[informace-pro-zamestnance|Information for staff]] template helps), for guests\' consent to news and for the content of messages sent to guests.',
        'If a business sends news or offers to guests, the business is the sender, not the provider. The customer is responsible for having guests\' consent or otherwise meeting the rules for commercial communications.',
      ] },
      { id: 'pracovni-pravo', h: '14. Team tools and Czech labour law', p: [
        'Rotas, attendance, location checks at clock-in, rewards, points, bonuses, penalties and warnings, payroll data and reviews are tools. The customer as employer decides how to use them and is responsible for compliance with the Labour Code and data protection law. In particular:',
      ], li: [
        'employees must not be fined for breaching their duties (section 346b of the Labour Code); only a discretionary bonus may be reduced, according to criteria set in advance for the period;',
        'deductions from wages are allowed only by law or under a wage deduction agreement (sections 146 and 147); damages and shortfalls only under section 250 et seq., shortfalls in entrusted assets only with a liability agreement (section 252);',
        'a warning in the app is not a formal reprimand under section 52(g) of the Labour Code;',
        'monitoring of employees, including location checks at clock-in, may be introduced only in line with section 316 of the Labour Code and employees must be informed in advance of its scope and method;',
        'points, rankings and suggestions made by the app (for example a penalty for being late) are inputs only. A person in the business\'s management always decides.',
      ], po: [
        'The provider gives no legal, tax, accounting or payroll advice. Payroll calculations are indicative and the customer verifies them before use.',
      ] },
      { id: 'data', h: '15. Customer data, backups and personal data', li: [
        'Customer data belongs to the customer. The provider uses it only to provide and secure the service, for support and to meet its legal obligations. It may create aggregated anonymous statistics that identify neither a business nor a person and use them to improve the service.',
        'Processing of personal data on behalf of the customer is governed by the [[zpracovatelska-smlouva|data processing agreement]], which forms an integral part of these terms. Where the provider is the controller (accounts, billing, support, security), the [[soukromi|privacy policy]] applies.',
        `Every day, people with the backup permission receive a link to download a backup of the business in JSON (valid ${L.odkazZalohyDni} days, works only after signing in). The database has point-in-time recovery at its provider. The customer keeps its own copies of important data (backups and exports).`,
      ] },
      { id: 'dusevni-vlastnictvi', h: '16. Intellectual property', p: [
        'The software, design, texts and the Managero brand belong to the provider. The customer may not copy, modify or reverse-engineer them except where the law expressly allows. The provider has a licence to customer data (texts, photos, logo, menu) only to the extent needed to provide the service: to store it, show it to users and guests (for example the public business page), transmit and back it up. The provider may use suggestions and feedback about the service without compensation.',
      ] },
      { id: 'odpovednost', h: '17. Liability and its limitation', p: [
        'This section limits the provider\'s liability. Please read it carefully.',
      ], li: [
        `The provider's total liability for damage under or in connection with the contract is limited to the sum of prices the customer paid in the ${L.stropMesicu} months before the event giving rise to the damage, but at least ${czk(L.stropMinKc)}.`,
        'The provider does not compensate lost profit, indirect or consequential damage or loss of reputation. It is not liable for damage caused by the customer\'s decisions (for example on wages, bonuses and penalties), by incorrect data entered by the customer, by outages of third parties beyond the provider\'s control or by force majeure.',
        'If data is lost, the provider restores it from the latest available backup and gives the customer reasonable assistance.',
        'The limitation does not apply to damage caused intentionally or by gross negligence, to harm to a person\'s natural rights, or where the law does not allow it. It does not change liability towards data subjects under Article 82 GDPR.',
        'The customer is liable for damage caused by breaching its obligations, in particular unlawful processing of its staff\'s and guests\' data or unlawful content, and will reimburse the provider for what it had to pay third parties or authorities because of such breach.',
      ] },
      { id: 'zmeny', h: '18. Changes to terms and prices', li: [
        `We may change these terms, the data processing agreement and prices. We announce a change by email to the business owner and in the app at least ${L.oznameniZmenDni} days before it takes effect.`,
        'If the customer disagrees, it may reject the change and terminate the contract as of the day before the change takes effect, without any penalty; we refund the unused part of the subscription pro rata. Otherwise the change applies from its effective date.',
        'A price change does not affect an already paid period. A shorter period may be used only for changes that do not reduce the customer\'s rights or that are required by law or an authority; these are announced too.',
      ] },
      { id: 'ukonceni', h: '19. Term and termination', li: [
        'The customer may terminate at any time by email to support or by deleting the business in the app. Paid subscription fees are not refunded (with the exceptions in section 10).',
        `The provider may terminate with ${L.vypovedProvozovateleMesicu} months' notice and refunds the unused part of the subscription pro rata.`,
        'The provider may terminate with immediate effect or restrict access if the customer materially breaches these terms (for example unlawful content, attacks on the service, misuse of others\' data) and does not remedy it after a request, or without a request if the breach cannot be remedied or serious harm is imminent.',
        `A business whose paid subscription has ended and in which nobody has been active (no change, no attendance) for ${RETENCE_TEXT.zrusenyPodnikDni} days since then is deleted including its data, as the customer has evidently stopped using it.`,
      ] },
      { id: 'po-ukonceni', h: '20. Data after termination and switching providers', li: [
        'During the contract the customer can download data at any time: the daily business backup in JSON (business content except private messages and payroll data, which the backup leaves out for privacy) and CSV exports in individual modules (for example attendance, rota, loyalty programme, coupons and vouchers). On request we provide other business data in a machine-readable format (JSON or CSV) free of charge.',
        `When the contract ends by termination, the business stays accessible for downloading data for another ${L.prechodneObdobiDni} days (transition period) and on request we assist with switching to another provider. After the transition period we keep the data for at least ${L.vyzvednutiDatDni} more days, during which the customer can request it. Then we delete it; it disappears from provider backups within another ${L.zalohyDni} days. We keep only what the law requires (for example accounting records).`,
        'If the customer deletes the business in the app, that is an instruction for immediate erasure: the app warns beforehand, deletion is confirmed with the password and data is deleted immediately.',
        'We charge nothing for switching or for data export.',
      ] },
      { id: 'postoupeni', h: '21. Assignment', p: [
        `The customer agrees in advance that the provider may assign this contract, including the data processing agreement, to a legal entity it controls or to which it transfers the Managero business (for example its future limited liability company). We announce the assignment by email at least ${L.oznameniZmenDni} days in advance and the customer may terminate without penalty until the assignment date. The customer may assign the contract only with the provider's prior consent.`,
      ] },
      { id: 'komunikace', h: '22. Communication and notices', p: [
        `We send notices to the business owner's email stored in the account or in the app; an email is deemed delivered on the day it is sent unless it bounces. The customer sends notices to ${f.emailPodpory}.`,
      ] },
      { id: 'pravo', h: '23. Governing law and disputes', p: [
        'The contract is governed by Czech law, in particular the Civil Code. Disputes will be decided by the general court competent for the provider\'s registered office. In matters of personal data the data processing agreement prevails. If any provision is invalid, the rest remains in force. The Czech version prevails; the English translation is for information only.',
      ] },
      { id: 'ucinnost', h: '24. Effective date', p: [
        `These business terms apply from ${UCINNOST.en} (version 2026-10-21).`,
      ] },
    ],
  };
}
