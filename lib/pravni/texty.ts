// Texty právních a podpůrných stránek: zásady, podmínky, podpora, smazání účtu.
//
// ⚠ PŘED ZVEŘEJNĚNÍM JE MUSÍ SCHVÁLIT PRÁVNÍK. Jsou napsané věcně podle toho,
// jaká data kód skutečně sbírá (tabulky v app/api/init/route.ts), ne jako
// právní služba. Zvlášť je potřeba ověřit: roli správce a zpracovatele,
// zpracovatelské smlouvy s podniky, dobu uchování, region uložení dat,
// podmínky ceníku a odpovědnosti.
//
// Údaje provozovatele (název, IČO, adresa, e-mail, region dat) se nikdy
// nevymýšlejí: berou se z lib/firma.ts, kde chybějící hodnota zůstane
// viditelným polem {{…}}.
//
// Co kód sbírá (zdroj pro seznamy níže):
//  * účet: jméno, e-mail, telefon (nepovinný), heslo (jen bcrypt otisk),
//    avatar, pozice, preference směn a motivu, nastavení oznámení
//  * host navíc: narozeniny (nepovinné), kód věrnostní karty, členství
//    v podnicích (body, razítka, kredit, návštěvy), rezervace, objednávky
//    (položky, poznámka, stůl; poloha jen pro okamžité ověření vzdálenosti
//    od podniku, ukládá se pouze vzdálenost), kupony, hodnocení
//  * zaměstnanec: směny, dostupnost, dovolené, docházka (příchody a odchody),
//    hodinová sazba (vidí ji jen vedení), hodnocení směn, odměny
//  * obsah týmu: zprávy a přílohy chatu (foto, hlas, video), nápady, úkoly,
//    účtenky, sklad, uzávěrky
//  * technické: push token (web, APNs, FCM), počítadla pokusů přihlášení
//    (IP adresa, krátce), protokol změn podniku
// Tracking a reklamní SDK v aplikaci nejsou.

import type { Firma } from '../firma';

export type Jazyk = 'cs' | 'en';
export type KlicDokumentu = 'soukromi' | 'podminky' | 'podpora' | 'smazat-ucet';

export interface Sekce { id: string; h: string; p?: string[]; li?: string[] }
export interface Dokument { titulek: string; uvod: string; aktualizace: string; sekce: Sekce[] }

/** Datum poslední úpravy textu; s každou věcnou změnou přepsat. */
const AKTUALIZACE = { cs: '30. 9. 2026', en: '30 September 2026' };

function soukromiCs(f: Firma): Dokument {
  return {
    titulek: 'Zásady ochrany osobních údajů',
    uvod: 'Tady je popsáno, jaké údaje aplikace Managero (pro podniky) a Managero client (pro hosty) zpracovávají, proč, komu je předávají a jak o ně můžete požádat nebo je smazat.',
    aktualizace: AKTUALIZACE.cs,
    sekce: [
      { id: 'spravce', h: 'Kdo údaje zpracovává', p: [
        `Provozovatelem aplikací je ${f.nazev}, IČO ${f.ico}, ${f.adresa}. Kontakt pro všechny dotazy k soukromí: ${f.emailPodpory}.`,
        'Role se liší podle toho, o čí údaje jde. Údaje o vašem účtu a o používání aplikace (přihlášení, oznámení, zařízení) zpracováváme jako správce my. Údaje, které do aplikace vkládá podnik o svých hostech a zaměstnancích (věrnostní program, rezervace, objednávky, směny, docházka), zpracováváme pro daný podnik. Podnik je jejich správcem a rozhoduje, proč a jak dlouho je potřebuje; my je pro něj ukládáme a chráníme.',
      ] },
      { id: 'hoste', h: 'Co zpracováváme o hostech (Managero client)', li: [
        'Jméno, e-mail a heslo. Heslo ukládáme jen jako jednosměrný otisk, přečíst ho neumíme.',
        'Telefon a datum narození. Obojí je nepovinné. Telefon slouží k potvrzení rezervace, narozeniny k přání a případné odměně v podnicích, kde jste členem.',
        'Kód vaší věrnostní karty a členství v podnicích: body, razítka, kredit, počet návštěv, kupony a hodnocení, která podniku zašlete.',
        'Rezervace a objednávky od stolu: termín, počet osob, položky, stůl a poznámka, kterou napíšete. Platí se u obsluhy, aplikace platební údaje nezpracovává.',
        'Poloha: při objednávce od stolu se zařízení zeptá, zda smí použít polohu, aby šlo ověřit, že sedíte v podniku. Souřadnice se neukládají, zapíše se pouze vzdálenost od podniku a výsledek kontroly.',
        'Oznámení: token zařízení pro doručení zpráv o rezervacích a objednávkách. Novinky a akce od podniků chodí jen tehdy, když jste to výslovně povolili, a kdykoli to můžete vypnout v profilu.',
      ] },
      { id: 'provoz', h: 'Co zpracováváme o lidech v podniku (Managero)', li: [
        'Jméno, e-mail, telefon, pozici, avatar a heslo (jen otisk).',
        'Směny, dostupnost, žádosti o volno, docházku (příchody a odchody), hodnocení směn a odměny. Hodinovou sazbu vidí jen vedení podniku.',
        'Obsah, který tým vytváří: zprávy v chatu včetně fotek, hlasových zpráv a videí, nápady, úkoly, účtenky, sklad, uzávěrky a postupy.',
        'Protokol změn podniku: kdo a kdy změnil důležité nastavení.',
      ] },
      { id: 'technicke', h: 'Technické údaje', p: [
        'Pro zabezpečení přihlášení si krátce ukládáme počet neúspěšných pokusů spolu s e-mailem a IP adresou; záznamy se po krátké době (řádově dny) mažou. Další technické protokoly vznikají u poskytovatele hostingu.',
        'Nepoužíváme reklamní ani sledovací nástroje, neprodáváme údaje a nesledujeme vás napříč jinými aplikacemi a weby.',
      ] },
      { id: 'ucely', h: 'Proč údaje zpracováváme', li: [
        'Abychom vám mohli poskytnout aplikaci: přihlášení, věrnostní program, rezervace, objednávky, rozvrh, chat (plnění smlouvy).',
        'Abychom účet a službu zabezpečili a předešli zneužití (oprávněný zájem).',
        'Abychom vám poslali novinky a akce podniků, ale jen s vaším souhlasem, který můžete kdykoli odvolat.',
        'Abychom splnili zákonné povinnosti, zejména účetní a daňové, které mají podniky.',
      ] },
      { id: 'zpracovatele', h: 'Komu údaje předáváme', p: [
        'Používáme poskytovatele, kteří pro nás údaje zpracovávají:',
      ], li: [
        'Neon (databáze Postgres) a Vercel (hosting aplikace a úložiště souborů),',
        'Resend (odesílání e-mailů, například obnovení hesla),',
        'Apple (doručování oznámení na iPhone) a Google (doručování oznámení na Android),',
        'Stripe (platby předplatného podniků; hostů se netýká a v mobilních aplikacích se nepoužívá),',
        'Storyous (pokladna, jen pokud ji podnik sám propojí).',
        `Místo uložení dat: ${f.regionDat}.`,
      ] },
      { id: 'doba', h: 'Jak dlouho údaje uchováváme', p: [
        'Po dobu, kdy účet existuje. Když účet smažete, osobní údaje se odstraní nebo anonymizují (viz níže). Záznamy, které musí podnik vést ze zákona nebo které patří k provozu podniku, jako jsou směny, docházka a uzávěrky, v podniku zůstanou bez vazby na vaše jméno.',
      ] },
      { id: 'prava', h: 'Vaše práva', p: [
        `Máte právo na přístup k údajům, opravu, výmaz, omezení zpracování, přenositelnost, námitku a právo odvolat souhlas. Napište na ${f.emailPodpory}. Když se nám nepodaří věc vyřešit, můžete podat stížnost u Úřadu pro ochranu osobních údajů (uoou.gov.cz).`,
        'Účet můžete smazat přímo v aplikaci (Nastavení nebo Profil, Smazat účet) nebo na stránce /smazat-ucet, i když aplikaci nemáte nainstalovanou.',
      ] },
      { id: 'deti', h: 'Děti', p: ['Aplikace není určena dětem do 15 let. Pokud zjistíme, že účet založilo dítě bez souhlasu zákonného zástupce, smažeme ho.'] },
      { id: 'zmeny', h: 'Změny těchto zásad', p: ['Podstatnou změnu oznámíme v aplikaci nebo e-mailem. Platné znění je vždy na této stránce.'] },
    ],
  };
}

function soukromiEn(f: Firma): Dokument {
  return {
    titulek: 'Privacy policy',
    uvod: 'This page explains what data the Managero (for businesses) and Managero client (for guests) apps process, why, who receives it, and how you can ask for it or delete it. The apps are currently available in Czech only.',
    aktualizace: AKTUALIZACE.en,
    sekce: [
      { id: 'spravce', h: 'Who processes your data', p: [
        `The apps are operated by ${f.nazev}, company ID ${f.ico}, ${f.adresa}. Contact for all privacy questions: ${f.emailPodpory}.`,
        'Roles differ by whose data it is. We are the controller for your account and how you use the app (sign-in, notifications, devices). Data that a business enters about its guests and staff (loyalty programme, bookings, orders, shifts, attendance) is processed on behalf of that business, which is the controller and decides why and for how long it needs it.',
      ] },
      { id: 'hoste', h: 'Guests (Managero client)', li: [
        'Name, email and password (stored only as a one-way hash).',
        'Phone number and date of birth, both optional. The phone number is used to confirm a booking, the birthday for a greeting or reward at venues you joined.',
        'Your loyalty card code and memberships: points, stamps, credit, visits, coupons and ratings you send to a venue.',
        'Bookings and table orders: time, party size, items, table and any note you write. You pay at the venue; the app does not process payment details.',
        'Location: when you order from a table, the device asks whether the app may use your location, to check that you are at the venue. Coordinates are not stored, only the distance to the venue and the result of the check.',
        'Notifications: a device token to deliver booking and order updates. News and offers from venues are sent only if you explicitly allow them, and you can switch them off in your profile at any time.',
      ] },
      { id: 'provoz', h: 'People in a business (Managero)', li: [
        'Name, email, phone, job title, avatar and password (hash only).',
        'Shifts, availability, time-off requests, attendance (clock-in and clock-out), shift ratings and rewards. Only management sees the hourly rate.',
        'Content the team creates: chat messages including photos, voice messages and videos, ideas, tasks, receipts, stock, closings and procedures.',
        'Change log of the business: who changed important settings and when.',
      ] },
      { id: 'technicke', h: 'Technical data', p: [
        'To protect sign-in we briefly store the number of failed attempts with the email and IP address; these records are deleted after a short time (days). Other technical logs are kept by the hosting provider.',
        'We use no advertising or tracking tools, we do not sell data and we do not track you across other apps and websites.',
      ] },
      { id: 'ucely', h: 'Why we process data', li: [
        'To provide the app: sign-in, loyalty programme, bookings, orders, rota, chat (performance of a contract).',
        'To secure the account and service and prevent abuse (legitimate interest).',
        'To send news and offers of venues, only with your consent, which you can withdraw at any time.',
        'To meet legal obligations, in particular accounting and tax duties of businesses.',
      ] },
      { id: 'zpracovatele', h: 'Who receives data', p: ['We use providers that process data for us:'], li: [
        'Neon (Postgres database) and Vercel (app hosting and file storage),',
        'Resend (sending email, for example password reset),',
        'Apple (notifications on iPhone) and Google (notifications on Android),',
        'Stripe (subscription payments of businesses; not relevant to guests and not used in the mobile apps),',
        'Storyous (point of sale, only if a business connects it).',
        `Where data is stored: ${f.regionDat}.`,
      ] },
      { id: 'doba', h: 'How long we keep data', p: [
        'For as long as the account exists. When you delete your account, personal data is removed or anonymised (see below). Records a business must keep by law or needs for operations, such as shifts, attendance and closings, stay in the business without a link to your name.',
      ] },
      { id: 'prava', h: 'Your rights', p: [
        `You have the right of access, rectification, erasure, restriction, portability, objection and to withdraw consent. Write to ${f.emailPodpory}. If we cannot resolve the matter you may complain to the Czech Office for Personal Data Protection (uoou.gov.cz).`,
        'You can delete your account directly in the app (Settings or Profile, Delete account) or on the /smazat-ucet page, even without the app installed.',
      ] },
      { id: 'deti', h: 'Children', p: ['The apps are not intended for children under 15. If we learn that a child created an account without parental consent, we will delete it.'] },
      { id: 'zmeny', h: 'Changes', p: ['We will announce material changes in the app or by email. The current version is always on this page.'] },
    ],
  };
}

function podminkyCs(f: Firma): Dokument {
  return {
    titulek: 'Podmínky užívání',
    uvod: `Tyto podmínky upravují používání aplikací Managero a Managero client, které provozuje ${f.nazev}, IČO ${f.ico}. Používáním aplikace s nimi souhlasíte.`,
    aktualizace: AKTUALIZACE.cs,
    sekce: [
      { id: 'sluzba', h: 'Co aplikace jsou', p: [
        'Managero je nástroj pro provoz podniku: směny, docházka, sklad, uzávěrky, úkoly a týmový chat. Účet zakládá vedení podniku nebo člověk přijme pozvánku do týmu.',
        'Managero client je aplikace pro hosty: věrnostní karta, rezervace, objednávky od stolu, kupony a akce podniků. Objednávky a služby hosté platí přímo v podniku, aplikace platby nezpracovává.',
        'V mobilních aplikacích se nic nekupuje a nespravuje se v nich předplatné. Smluvní vztah podniku k Managero (tarif, fakturace) řeší provozovatel mimo aplikaci.',
      ] },
      { id: 'ucet', h: 'Účet', li: [
        'Uveďte pravdivé údaje a chraňte své heslo. Za činnost pod svým účtem odpovídáte.',
        'Jeden účet patří jednomu člověku. Účet hosta se nepoužívá v provozní aplikaci a naopak.',
        'Účet můžete kdykoli smazat v aplikaci nebo na stránce /smazat-ucet.',
      ] },
      { id: 'obsah', h: 'Obsah a chování', p: ['Zprávy, nápady, poznámky a fotky, které do aplikace vložíte, nesmějí být nezákonné, urážlivé, obtěžující, nenávistné ani porušovat cizí práva. Zakázané je také vydávat se za někoho jiného a snažit se získat přístup k cizím účtům a datům.'],
        li: [
          'Nevhodný obsah v chatu a v nápadech můžete nahlásit a uživatele zablokovat (Nahlásit, Zablokovat). Nahlášení vidí vedení podniku.',
          'Vedení podniku i provozovatel mohou obsah odebrat a uživatele z podniku nebo z aplikace vyloučit, pokud porušuje tyto podmínky. Hlášení řešíme zpravidla do 24 hodin v pracovní dny.',
        ] },
      { id: 'hoste', h: 'Hosté a podniky', p: [
        'Věrnostní body, razítka, kupony a rezervace nabízí a uznává konkrétní podnik. Podnik určuje jejich pravidla a hodnotu; provozovatel aplikace za jejich plnění neodpovídá.',
        'Novinky a akce od podniků dostanete jen se svým souhlasem, který můžete odvolat v profilu.',
      ] },
      { id: 'dostupnost', h: 'Dostupnost a změny', p: ['Aplikaci poskytujeme, jak je. Snažíme se o nepřetržitý provoz, ale výpadky se mohou stát. Aplikaci a tyto podmínky můžeme měnit; podstatnou změnu oznámíme předem.'] },
      { id: 'odpovednost', h: 'Odpovědnost', p: ['Odpovědnost provozovatele je omezena v rozsahu, který dovoluje zákon. Nenese odpovědnost za obsah vložený uživateli ani za to, jak podnik naloží s údaji svých zaměstnanců a hostů, kde je jejich správcem.'] },
      { id: 'pravo', h: 'Rozhodné právo a kontakt', p: [`Vztah se řídí českým právem. Dotazy a stížnosti posílejte na ${f.emailPodpory}. Spotřebitelé mohou využít mimosoudní řešení sporů u České obchodní inspekce (coi.cz).`] },
    ],
  };
}

function podminkyEn(f: Firma): Dokument {
  return {
    titulek: 'Terms of use',
    uvod: `These terms govern the use of the Managero and Managero client apps operated by ${f.nazev}, company ID ${f.ico}. By using the apps you agree to them.`,
    aktualizace: AKTUALIZACE.en,
    sekce: [
      { id: 'sluzba', h: 'What the apps are', p: [
        'Managero is a tool for running a business: shifts, attendance, stock, closings, tasks and team chat. Accounts are created by business management or by accepting a team invitation.',
        'Managero client is for guests: loyalty card, bookings, table orders, coupons and venue events. Guests pay the venue directly; the app does not process payments.',
        'Nothing is sold in the mobile apps and subscriptions are not managed there. The business contract with Managero (plan, billing) is handled by the operator outside the app.',
      ] },
      { id: 'ucet', h: 'Account', li: [
        'Give truthful details and protect your password. You are responsible for activity under your account.',
        'One account belongs to one person. A guest account is not used in the business app and vice versa.',
        'You can delete your account at any time in the app or on the /smazat-ucet page.',
      ] },
      { id: 'obsah', h: 'Content and conduct', p: ['Messages, ideas, notes and photos you add must not be unlawful, abusive, harassing or hateful, or infringe the rights of others. Impersonation and attempts to access other accounts or data are also prohibited.'],
        li: [
          'You can report inappropriate content in chat and ideas and block a user (Report, Block). Reports are visible to business management.',
          'Business management and the operator may remove content and remove a user from a business or the app for violating these terms. We usually handle reports within 24 hours on working days.',
        ] },
      { id: 'hoste', h: 'Guests and businesses', p: [
        'Loyalty points, stamps, coupons and bookings are offered and honoured by the individual business, which sets their rules and value; the operator is not responsible for their fulfilment.',
        'You receive news and offers from businesses only with your consent, which you can withdraw in your profile.',
      ] },
      { id: 'dostupnost', h: 'Availability and changes', p: ['The apps are provided as is. We aim for continuous operation but outages can happen. We may change the apps and these terms and will announce material changes in advance.'] },
      { id: 'odpovednost', h: 'Liability', p: ['The operator\'s liability is limited to the extent the law allows. It is not responsible for content added by users or for how a business handles data of its staff and guests where it is the controller.'] },
      { id: 'pravo', h: 'Governing law and contact', p: [`Czech law applies. Send questions and complaints to ${f.emailPodpory}. Consumers may use out-of-court dispute resolution at the Czech Trade Inspection Authority (coi.cz).`] },
    ],
  };
}

function podporaCs(f: Firma): Dokument {
  return {
    titulek: 'Podpora',
    uvod: 'Potřebujete pomoc s aplikací Managero nebo Managero client? Tady najdete kontakt i odpovědi na nejčastější věci.',
    aktualizace: AKTUALIZACE.cs,
    sekce: [
      { id: 'kontakt', h: 'Kontakt', p: [`E-mail: ${f.emailPodpory}. Odpovídáme zpravidla do dvou pracovních dnů. Uveďte e-mail účtu a v jaké aplikaci se problém děje, heslo nikdy nepište.`, `Provozovatel: ${f.nazev}, IČO ${f.ico}, ${f.adresa}.`] },
      { id: 'heslo', h: 'Zapomenuté heslo', p: ['Na přihlašovací obrazovce zvolte Zapomenuté heslo. Pošleme odkaz na obnovení, který platí krátce a dá se použít jednou.'] },
      { id: 'smazani', h: 'Smazání účtu', p: ['V aplikaci: Nastavení nebo Profil, Smazat účet. Bez aplikace: stránka /smazat-ucet.'] },
      { id: 'nahlaseni', h: 'Nahlášení obsahu nebo uživatele', p: [`V chatu a u nápadů je u každé zprávy volba Nahlásit a u uživatele Zablokovat. Vážné případy napište také na ${f.emailPodpory}.`] },
      { id: 'hoste', h: 'Pro hosty', li: [
        'Razítka a body přidává obsluha u kasy po načtení vaší karty, aplikace je sama nepřidává.',
        'Objednávka od stolu vyžaduje QR kód ze stolu a povolení polohy v podnicích, které si to zapnuly.',
        'Novinky od podniků vypnete v profilu.',
      ] },
      { id: 'podniky', h: 'Pro podniky', p: ['Nastavení podniku, role, tarify a fakturace se spravují na webu po přihlášení. Mobilní aplikace předplatné nenabízí ani nespravuje.'] },
    ],
  };
}

function podporaEn(f: Firma): Dokument {
  return {
    titulek: 'Support',
    uvod: 'Need help with Managero or Managero client? Here is how to reach us and answers to common questions. The apps are currently available in Czech only.',
    aktualizace: AKTUALIZACE.en,
    sekce: [
      { id: 'kontakt', h: 'Contact', p: [`Email: ${f.emailPodpory}. We usually reply within two working days. Include the account email and which app the problem is in; never send your password.`, `Operator: ${f.nazev}, company ID ${f.ico}, ${f.adresa}.`] },
      { id: 'heslo', h: 'Forgot password', p: ['On the sign-in screen choose Forgot password. We email a reset link that is valid for a short time and can be used once.'] },
      { id: 'smazani', h: 'Delete account', p: ['In the app: Settings or Profile, Delete account. Without the app: the /smazat-ucet page.'] },
      { id: 'nahlaseni', h: 'Report content or a user', p: [`In chat and ideas every message has Report and every user can be blocked. For serious cases also write to ${f.emailPodpory}.`] },
      { id: 'hoste', h: 'For guests', li: [
        'Stamps and points are added by staff at the till after scanning your card; the app does not add them itself.',
        'Table ordering requires the QR code on the table and location permission at venues that enabled it.',
        'Turn off news from venues in your profile.',
      ] },
      { id: 'podniky', h: 'For businesses', p: ['Business settings, roles, plans and billing are managed on the web after signing in. The mobile apps neither offer nor manage subscriptions.'] },
    ],
  };
}

function smazatCs(f: Firma): Dokument {
  return {
    titulek: 'Smazání účtu a dat',
    uvod: 'Tato stránka platí pro aplikace Managero (pro podniky) a Managero client (pro hosty), které provozuje ' + f.nazev + '. Smazat účet můžete v aplikaci, nebo tady na webu, i když aplikaci nemáte nainstalovanou.',
    aktualizace: AKTUALIZACE.cs,
    sekce: [
      { id: 'aplikace', h: 'Přímo v aplikaci', p: ['Managero client: Profil, Smazat účet. Managero: Nastavení, Účet, Smazat účet. Smazání potvrdíte heslem.'] },
      { id: 'web', h: 'Na webu bez přihlášení', p: ['Zadejte e-mail účtu ve formuláři níže. Pošleme na něj odkaz pro potvrzení a teprve po jeho otevření se účet smaže. Bez přístupu k e-mailu účtu žádost nikdo cizí potvrdit nemůže.'] },
      { id: 'host', h: 'Co se smaže u hosta', li: [
        'Jméno, e-mail, telefon, datum narození, heslo a oznámení zařízení.',
        'Věrnostní karta, členství v podnicích, body, razítka, kredit, kupony a hodnocení.',
        'Budoucí rezervace se zruší. Objednávky a rezervace, které už podnik vyřídil, u podniku zůstanou jako anonymní provozní záznam bez jména a bez poznámky.',
      ] },
      { id: 'provoz', h: 'Co se smaže u zaměstnance a vedení', li: [
        'Jméno, e-mail, telefon, heslo, avatar, oznámení zařízení a členství v podnicích.',
        'Směny, docházka, uzávěrky a zprávy, které podnik vede jako správce, v podniku zůstanou kvůli jeho povinnostem (mzdy, účetnictví), ale bez vašeho jména: zobrazí se jako Smazaný uživatel.',
        'Vlastník podniku: účet nejde smazat, dokud v podniku zůstávají další lidé, pokud nesmažete celý podnik. Smazání podniku zruší předplatné, smaže zákazníka ve Stripe a odstraní všechna data podniku včetně nahraných souborů. Na webu stejný odkaz z e-mailu nabídne druhý krok: heslo a slovo SMAZAT.',
        'Pozvánky s vaším e-mailem a soubory, které patří jen vám, se smažou. Text v protokolu akcí a v nahlášeních k vám se vymaže, PIN, hodinová sazba a limity směn se vynulují.',
      ] },
      { id: 'kdy', h: 'Kdy a co zůstane', p: [`Smazání proběhne ihned po potvrzení. Zálohy u poskytovatelů se přepíšou nejpozději do 30 dnů. Zákonná evidence, kterou musíme zachovat (záznamy o fakturaci podniku a faktury ve Stripe, bez vašich osobních údajů), zůstává v nezbytném rozsahu. Chat a návrhy, které jste sdíleli v podniku, zůstanou podniku jako zpráva od Smazaného uživatele. Dotazy: ${f.emailPodpory}.`] },
    ],
  };
}

function smazatEn(f: Firma): Dokument {
  return {
    titulek: 'Delete your account and data',
    uvod: 'This page applies to the Managero (for businesses) and Managero client (for guests) apps operated by ' + f.nazev + '. You can delete your account in the app, or here on the web even if the app is not installed.',
    aktualizace: AKTUALIZACE.en,
    sekce: [
      { id: 'aplikace', h: 'In the app', p: ['Managero client: Profile, Delete account. Managero: Settings, Account, Delete account. You confirm with your password.'] },
      { id: 'web', h: 'On the web without signing in', p: ['Enter the account email in the form below. We send a confirmation link to it, and the account is deleted only after you open it. Nobody without access to the account email can confirm a request.'] },
      { id: 'host', h: 'What is deleted for a guest', li: [
        'Name, email, phone, date of birth, password and device notification tokens.',
        'Loyalty card, memberships, points, stamps, credit, coupons and ratings.',
        'Future bookings are cancelled. Orders and bookings the venue already handled stay at the venue as an anonymous operational record without a name or note.',
      ] },
      { id: 'provoz', h: 'What is deleted for staff and management', li: [
        'Name, email, phone, password, avatar, device notification tokens and business memberships.',
        'Shifts, attendance, closings and messages that the business keeps as controller stay in the business because of its obligations (payroll, accounting), but without your name: they appear as a deleted user.',
        'Business owner: the account cannot be deleted while other people remain in the business, unless you delete the whole business. Deleting the business cancels the subscription, deletes the Stripe customer and removes all business data including uploaded files. On the web the same email link offers a second step: password and the word SMAZAT.',
        'Invitations with your email and files that belong only to you are deleted. Free text about you in the action log and in reports is cleared; PIN, hourly rate and shift limits are reset.',
      ] },
      { id: 'kdy', h: 'When, and what remains', p: [`Deletion happens right after confirmation. Backups at providers are overwritten within 30 days at the latest. Records we must keep by law (business billing records and Stripe invoices, without your personal data) remain to the extent necessary. Chat messages and suggestions you shared in a business stay with the business as a message from a deleted user. Questions: ${f.emailPodpory}.`] },
    ],
  };
}

const ZDROJE: Record<KlicDokumentu, Record<Jazyk, (f: Firma) => Dokument>> = {
  soukromi: { cs: soukromiCs, en: soukromiEn },
  podminky: { cs: podminkyCs, en: podminkyEn },
  podpora: { cs: podporaCs, en: podporaEn },
  'smazat-ucet': { cs: smazatCs, en: smazatEn },
};

export function dokument(klic: KlicDokumentu, jazyk: Jazyk, f: Firma): Dokument {
  return ZDROJE[klic][jazyk](f);
}

export const KLICE_DOKUMENTU: KlicDokumentu[] = ['soukromi', 'podminky', 'podpora', 'smazat-ucet'];

/** Názvy odkazů v patičkách a v nastavení. */
export const ODKAZY_PRAVNI: { klic: KlicDokumentu; cs: string; en: string }[] = [
  { klic: 'soukromi', cs: 'Zásady ochrany osobních údajů', en: 'Privacy policy' },
  { klic: 'podminky', cs: 'Podmínky užívání', en: 'Terms of use' },
  { klic: 'podpora', cs: 'Podpora', en: 'Support' },
  { klic: 'smazat-ucet', cs: 'Smazání účtu', en: 'Delete account' },
];
