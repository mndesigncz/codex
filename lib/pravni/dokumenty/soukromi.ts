// Zásady ochrany osobních údajů (čl. 13 a 14 GDPR) — /soukromi.
//
// Co kód sbírá (zdroj pro seznamy; tabulky v app/api/init/route.ts):
//  * účet: jméno, e-mail, telefon (nepovinný), heslo (jen bcrypt otisk), avatar, pozice,
//    jazyk, motiv, nastavení oznámení, verze a čas souhlasu (users.terms_version…)
//  * host: narozeniny (nepovinné), kód karty, členství (body, razítka, kredit, návštěvy),
//    rezervace, objednávky (poloha jen pro okamžité ověření, ukládá se vzdálenost), kupony,
//    hodnocení, souhlasy s novinkami (tabulka consents)
//  * zaměstnanec: směny, dostupnost, volno, docházka (u píchání z telefonu jen výsledek
//    kontroly polohy a vzdálenost, lib/geoPichani), sazby, odměny, tresty, chat
//  * technické: push token (web, APNs, FCM), auth_attempts (e-mail/IP, mazání po 1 dni),
//    audit_log (3 roky), notifications (365 dní)
//  * cookies: NextAuth relace (30 dní, lib/authRelace), CSRF a callback NextAuth,
//    managero-lang (1 rok), kiosk „kdo je u tabletu" (hodina); localStorage jen nastavení
//    (motiv, jazyk, formát, režim aplikace, nápovědy, rozložení) a kód doporučení
// Analytika, reklamní a sledovací SDK v aplikaci nejsou (hlídat při přidávání!).
//
// ⚖ K ověření advokátem (v kódu, ne na stránce): role u účtu hosta napříč podniky
// (zvoleno: účet = Managero správce, data v podniku = zpracovatel pro podnik).

import type { Firma } from '../../firma.ts';
import { LHUTY, RETENCE_TEXT, UCINNOST } from '../lhuty.ts';
import { kontakty, provozovatel, type Dokument } from './typy.ts';

export function soukromiCs(f: Firma): Dokument {
  const R = RETENCE_TEXT, L = LHUTY;
  return {
    titulek: 'Zásady ochrany osobních údajů',
    uvod: 'Jaké osobní údaje zpracovávají aplikace Managero (pro podniky a jejich týmy) a Managero client (pro hosty), proč, komu je předáváme, jak dlouho je držíme a jaká máte práva.',
    aktualizace: UCINNOST.cs,
    obsah: true,
    sekce: [
      { id: 'spravce', h: 'Kdo jsme', p: [
        `Provozovatelem aplikací a správcem osobních údajů v rozsahu popsaném níže je ${provozovatel(f, 'cs')}. Kontakt pro všechny dotazy k soukromí: ${kontakty(f, 'cs')}. Pověřence pro ochranu osobních údajů jsme nejmenovali; obracejte se přímo na nás.`,
      ] },
      { id: 'role', h: 'Kdy jsme správce a kdy zpracovatel', li: [
        'Údaje, které podnik v Manageru vede o svém týmu a hostech (směny, docházka, mzdové podklady, odměny, chat, členství ve věrnostním programu podniku, rezervace, objednávky, novinky podniku), zpracováváme pro podnik podle [[zpracovatelska-smlouva|zpracovatelské smlouvy]]. Jejich správcem je podnik: rozhoduje, proč a jak dlouho je potřebuje, a vaše žádosti k nim vyřizuje on. Když nám takovou žádost pošlete, předáme ji podniku.',
        'Jako správce zpracováváme: váš uživatelský účet a přihlášení (u hostů jeden účet, který funguje ve všech podnicích), zabezpečení a prevenci zneužití, podporu, fakturaci podnikům, moderaci obsahu a oznámení podle Aktu o digitálních službách a souhrnné anonymní statistiky. Tyto zásady popisují hlavně tato zpracování a pro přehlednost i to, co podniky v aplikaci zpracovávají.',
      ] },
      { id: 'ucet', h: 'Údaje, které zpracováváme jako správce', li: [
        'Účet: jméno, e-mail, heslo (jen jako jednosměrný otisk, přečíst ho neumíme), telefon (nepovinný), avatar, jazyk, motiv a nastavení oznámení, verze podmínek a zásad, se kterými jste souhlasili, a čas souhlasu a den, kdy jste aplikaci naposledy otevřeli (podle něj počítáme lhůty uložení u neaktivních účtů a podniků).',
        'Zařízení: token pro doručení oznámení (web, iPhone, Android) a druh zařízení.',
        'Zabezpečení: počet neúspěšných pokusů o přihlášení s e-mailem a IP adresou; technické záznamy u poskytovatele hostingu.',
        'Podpora a komunikace: co nám napíšete nebo řeknete po telefonu, a odpověď.',
        'Podniky jako zákazníci: název, fakturační adresa, IČO nebo DIČ (pokud je vyplníte), e-mail vlastníka, tarif a historie plateb. Údaje o kartě zpracovává jen Stripe.',
        'Oznámení nezákonného obsahu: jméno a e-mail oznamovatele, obsah oznámení a naše rozhodnutí.',
      ] },
      { id: 'hoste', h: 'Co se zpracovává o hostech (Managero client)', li: [
        'Jméno, e-mail a heslo (jen otisk). Telefon a datum narození jsou nepovinné: telefon uvidí podnik u vaší rezervace, aby vás mohl kontaktovat; narozeniny slouží k přání nebo odměně v podnicích, kde jste členem.',
        'Kód věrnostní karty a členství v podnicích: body, razítka, kredit, počet návštěv, poukazy, kupony, hodnocení a účtenky z pokladny přiřazené ke kartě.',
        'Rezervace a objednávky od stolu: termín, počet osob, položky, stůl a poznámka. Platí se u obsluhy, aplikace platební údaje hostů nezpracovává.',
        'Poloha: při objednávce od stolu se zařízení zeptá, zda smí použít polohu, aby šlo ověřit, že sedíte v podniku. Souřadnice se neukládají, zapíše se jen vzdálenost od podniku a výsledek kontroly.',
        'Novinky a akce od podniků chodí jen tehdy, když jste je výslovně povolili. Ukládáme, kdy a kde jste souhlas dali; vypnout je můžete v aplikaci (Moje → Oznámení a soukromí) nebo odkazem v každém e-mailu.',
      ] },
      { id: 'provoz', h: 'Co se zpracovává o lidech v podniku (Managero)', li: [
        'Jméno, e-mail, telefon, pozice, avatar, role a heslo nebo PIN k tabletu (jen otisk).',
        'Směny, dostupnost, žádosti o volno, docházka (příchody, odchody, přestávky). Pokud to podnik zapne, ověří se při příchodu z telefonu, že jste u podniku: souřadnice se neukládají, jen výsledek a vzdálenost v metrech. Poloha se nesleduje průběžně ani na pozadí.',
        'Mzdové podklady (hodinová sazba, prémie, výplaty) vidí jen vedení podniku. Dále hodnocení směn, body, odměny, napomenutí a tresty včetně vašeho vyjádření.',
        'Obsah, který tým vytváří: zprávy v chatu včetně fotek, hlasových zpráv a videí, nápady, úkoly, účtenky, sklad, uzávěrky a postupy.',
        'Protokol změn podniku: kdo a kdy změnil důležité nastavení.',
      ] },
      { id: 'ucely', h: 'Proč údaje zpracováváme a na jakém základě', li: [
        'Poskytování aplikace a vašeho účtu (přihlášení, oznámení, funkce aplikace): plnění smlouvy, tedy [[podminky|podmínek užívání]] nebo [[obchodni-podminky|obchodních podmínek]] (čl. 6 odst. 1 písm. b) GDPR).',
        'Fakturace a účetnictví podniků: plnění právní povinnosti (písm. c)) a smlouvy.',
        'Zabezpečení účtů a služby, prevence zneužití a podvodů, technické záznamy: oprávněný zájem na bezpečném provozu (písm. f)).',
        'Podpora a provozní sdělení (například že končí zkušební doba nebo se nepodařila platba): plnění smlouvy, u ostatních oprávněný zájem.',
        'Vyřizování oznámení nezákonného obsahu a moderace: právní povinnost podle Aktu o digitálních službách a oprávněný zájem na bezpečné službě.',
        'Souhrnné anonymní statistiky ke zlepšování služby: oprávněný zájem; ze statistik nejde poznat konkrétní člověka ani podnik.',
        'Uplatnění a obhajoba právních nároků: oprávněný zájem.',
        'Novinky od podniků hostům: souhlas hosta; správcem a odesílatelem je podnik, my souhlas evidujeme a novinky doručujeme.',
      ], po: [
        'Proti zpracování založenému na oprávněném zájmu můžete vznést námitku. Marketingové e-maily o Manageru zatím neposíláme; kdybychom začali, pošleme je jen tam, kde to zákon dovoluje, a s odhlášením v každé zprávě.',
        'Uvedení jména, e-mailu a hesla je nutné k založení účtu; bez nich aplikaci používat nejde. Ostatní údaje (telefon, narozeniny, avatar) jsou nepovinné.',
      ] },
      { id: 'automatizace', h: 'Automatizované rozhodování', p: [
        'Aplikace počítá body, razítka, žebříčky, součty hodin a navrhuje vedení podniku například trest za pozdní příchod. Jsou to výpočty a návrhy: rozhodnutí, která mají pro zaměstnance právní nebo podobně závažné účinky (mzda, prémie, tresty), dělá vždy člověk ve vedení podniku. Automatizované rozhodování ve smyslu čl. 22 GDPR neprovádíme a údaje nepoužíváme k profilování pro reklamu. Automatické akce věrnostního programu (například odměna k narozeninám) běží podle pravidel, která nastaví podnik.',
      ] },
      { id: 'prijemci', h: 'Komu údaje předáváme', li: [
        'Poskytovatelům, kteří pro nás údaje zpracovávají (hosting Vercel, databáze Neon, e-maily Resend, oznámení Apple a Google a další). Úplný seznam s umístěním a zárukami je na stránce [[subzpracovatele|Subzpracovatelé]].',
        'Stripe zpracovává platby předplatného podniků, zčásti jako samostatný správce. Hostů a zaměstnanců se netýká a v mobilních aplikacích se nepoužívá.',
        'Podniku, ke kterému se jako host nebo člen týmu připojíte, a to v rozsahu, který k tomu patří (například kód karty a body vidí podnik, ve kterém jste členem, ne ostatní).',
        'Orgánům veřejné moci, jen když nám to ukládá zákon.',
      ], po: ['Údaje neprodáváme a nepoužíváme reklamní ani sledovací nástroje.'] },
      { id: 'predani', h: 'Předávání mimo EU', p: [
        `Kde data leží: ${f.regionDat}. Někteří poskytovatelé jsou z USA; předání se opírá o rozhodnutí Evropské komise o odpovídající ochraně (EU–US Data Privacy Framework) u certifikovaných poskytovatelů, nebo o standardní smluvní doložky schválené Komisí. Záruku u každého poskytovatele uvádí [[subzpracovatele|seznam subzpracovatelů]].`,
      ] },
      { id: 'retence', h: 'Jak dlouho údaje uchováváme', li: [
        'Účet: po dobu, kdy existuje. Smažete-li ho, údaje se smažou nebo anonymizují ihned.',
        `Neaktivní účet hosta (žádná návštěva, objednávka, rezervace ani otevření aplikace): po ${R.neaktivniHostMesicu} měsících ho anonymizujeme; ${R.upozorneniPredemDni} dní předem pošleme e-mail s možností si ho ponechat.`,
        `Počítadla neúspěšných přihlášení: ${R.pokusyPrihlaseniDni} den. Protokol změn podniku: ${R.auditLogLet} roky. Oznámení v aplikaci: ${R.oznameniDni} dní.`,
        `Podnik, jehož placené předplatné (nebo zkušební doba) skončilo a který pak ${R.zrusenyPodnikDni} dní nikdo nepoužívá (nikdo z podniku se nepřihlásil ani neotevřel aplikaci, nenapsal zprávu, nezapsal docházku, směnu, úkol ani uzávěrku a nic nezměnil): smažeme ho i s daty. Vlastník a správci předplatného dostanou e-mail nejméně ${R.podnikUpozorneniDni} a znovu ${R.podnikDruheUpozorneniDni} dní předem; přihlášení smazání zruší.`,
        'Fakturační doklady podniků: po dobu, kterou ukládají daňové a účetní předpisy (až 10 let).',
        'Oznámení nezákonného obsahu a rozhodnutí o nich: po dobu nutnou k vyřízení a k obhajobě právních nároků.',
        'Komunikace s podporou: po dobu vyřízení a potom nejdéle 3 roky (běžná promlčecí lhůta), kdyby bylo potřeba doložit, co jsme si řekli.',
        'Technické záznamy u poskytovatele hostingu: jen krátce, podle jeho nastavení (dny).',
        `Zálohy u poskytovatelů: přepíšou se nejpozději do ${L.zalohyDni} dnů.`,
      ], po: ['Údaje, které spravuje podnik, uchovává podnik podle svých potřeb a povinností; po smazání vašeho účtu v něm zůstanou provozní záznamy (směny, docházka, uzávěrky, vyřízené objednávky) bez vašeho jména.'] },
      { id: 'cookies', h: 'Cookies a úložiště v zařízení', p: [
        'Ukládáme do vašeho zařízení jen to, co je nutné pro fungování služby, o kterou jste požádali. Souhlas k tomu podle zákona není potřeba, proto nemáme cookie lištu. Analytické, reklamní ani sledovací cookies nepoužíváme.',
      ], li: [
        `Přihlášení: cookie relace (platí až ${L.relaceDni} dní nebo do odhlášení) a pomocné cookies přihlášení (ochrana před podvrženými požadavky, návrat na stránku po přihlášení).`,
        'Jazyk: cookie se zvoleným jazykem (1 rok).',
        'Sdílený tablet v podniku: cookie s tím, kdo je u tabletu právě přihlášený (nejvýš hodinu).',
        'Úložiště prohlížeče (localStorage, sessionStorage): vaše nastavení (motiv, jazyk, formát data, zobrazení, skryté nápovědy), kód doporučení z odkazu do dokončení registrace a informace, že jste v této relaci potvrdili aktuální podmínky.',
        'Offline režim: u hosta věrnostní kartička (kód, jméno a QR kód), aby šla ukázat i bez signálu; smaže se odhlášením. Sdílený tablet v podniku si drží rozpis, otisky PINů (ne PINy samotné) a příchody zapsané bez internetu, dokud je neodešle. Prohlížeč si ukládá části aplikace (service worker), aby se rychle načetla.',
        'V mobilních aplikacích: token zařízení pro oznámení a kartička pro offline režim v úložišti aplikace.',
      ] },
      { id: 'opravneni', h: 'Oprávnění v aplikaci', li: [
        'Poloha: jen v okamžiku objednávky od stolu nebo příchodu do práce (pokud to podnik zapnul), nikdy na pozadí.',
        'Fotoaparát a fotky: načtení QR kódu, fotky do chatu, účtenek a profilu.',
        'Mikrofon: hlasové zprávy v chatu.',
        'Oznámení: zprávy o směnách, rezervacích, objednávkách a z chatu.',
      ], po: ['Každé oprávnění můžete kdykoli odebrat v nastavení telefonu nebo prohlížeče; příslušná funkce pak nebude fungovat.'] },
      { id: 'prava', h: 'Vaše práva', p: [
        `Máte právo na přístup ke svým údajům, jejich opravu, výmaz, omezení zpracování, přenositelnost, právo vznést námitku a odvolat souhlas. Údaje účtu si můžete stáhnout v aplikaci (Managero: Nastavení → Data a soukromí; Managero client: Moje → Stáhnout moje data) a většinu opravit v nastavení účtu. Ostatní žádosti posílejte na ${f.emailPodpory}; vyřídíme je do měsíce. Jde-li o údaje, které spravuje podnik, předáme žádost podniku.`,
        'Pokud se domníváte, že zpracováním porušujeme předpisy, můžete podat stížnost u Úřadu pro ochranu osobních údajů, Pplk. Sochora 27, 170 00 Praha 7, uoou.gov.cz.',
      ] },
      { id: 'smazani', h: 'Smazání účtu', p: [
        'Účet smažete přímo v aplikaci (Managero client: Moje → Smazat účet; Managero: Nastavení → Data a soukromí → Smazat účet), nebo na stránce [[smazat-ucet|Smazání účtu]], i když aplikaci nemáte nainstalovanou. Tam je i přehled, co se smaže a co zůstane.',
      ] },
      { id: 'deti', h: 'Děti', p: ['Účet hosta si můžete založit od 15 let. Pokud zjistíme, že účet založilo mladší dítě bez souhlasu zákonného zástupce, smažeme ho. Brigádníky mladší 18 let přizývá podnik, který za to odpovídá jako zaměstnavatel.'] },
      { id: 'zmeny', h: 'Změny těchto zásad', p: [`Podstatnou změnu oznámíme v aplikaci nebo e-mailem a v aplikaci vás požádáme o potvrzení. Platné znění je vždy na této stránce. Tato verze platí od ${UCINNOST.cs}.`] },
    ],
  };
}

export function soukromiEn(f: Firma): Dokument {
  const R = RETENCE_TEXT, L = LHUTY;
  return {
    titulek: 'Privacy policy',
    uvod: 'What personal data the Managero (for businesses and their teams) and Managero client (for guests) apps process, why, who receives it, how long we keep it and what rights you have. The apps are currently available mainly in Czech; this English version is for information.',
    aktualizace: UCINNOST.en,
    obsah: true,
    sekce: [
      { id: 'spravce', h: 'Who we are', p: [
        `The apps are operated, and personal data is controlled to the extent described below, by ${provozovatel(f, 'en')}. Contact for all privacy questions: ${kontakty(f, 'en')}. We have not appointed a data protection officer; contact us directly.`,
      ] },
      { id: 'role', h: 'When we are controller and when processor', li: [
        'Data that a business keeps in Managero about its team and guests (shifts, attendance, payroll data, rewards, chat, membership in its loyalty programme, bookings, orders, its news) is processed on behalf of the business under the [[zpracovatelska-smlouva|data processing agreement]]. The business is the controller: it decides why and for how long it needs the data and handles your requests about it. If you send such a request to us, we forward it to the business.',
        'We are the controller for: your user account and sign-in (for guests one account that works at all venues), security and abuse prevention, support, billing of businesses, content moderation and notices under the Digital Services Act, and aggregated anonymous statistics. This policy mainly describes these, and for clarity also what businesses process in the app.',
      ] },
      { id: 'ucet', h: 'Data we process as controller', li: [
        'Account: name, email, password (only as a one-way hash we cannot read), phone (optional), avatar, language, theme and notification settings, the version of the terms and policy you agreed to and when, and the day you last opened the app (used to count retention periods for inactive accounts and businesses).',
        'Devices: a token for delivering notifications (web, iPhone, Android) and device type.',
        'Security: the number of failed sign-in attempts with email and IP address; technical logs at the hosting provider.',
        'Support and communication: what you write or tell us by phone, and our reply.',
        'Businesses as customers: name, billing address, company ID or VAT ID (if you enter them), owner email, plan and payment history. Card details are processed only by Stripe.',
        'Notices of illegal content: the reporter\'s name and email, the notice and our decision.',
      ] },
      { id: 'hoste', h: 'Data about guests (Managero client)', li: [
        'Name, email and password (hash only). Phone and date of birth are optional: the venue sees your phone with your booking so it can contact you; the birthday is used for a greeting or reward at venues you joined.',
        'Loyalty card code and memberships: points, stamps, credit, visits, vouchers, coupons, ratings and POS receipts linked to the card.',
        'Bookings and table orders: time, party size, items, table and note. You pay at the venue; the app does not process guests\' payment details.',
        'Location: when ordering from a table the device asks whether the app may use your location to check you are at the venue. Coordinates are not stored, only the distance to the venue and the result.',
        'News and offers from venues are sent only if you explicitly allow them. We record when and where you consented; switch them off in the app (My page → Notifications and privacy) or via the link in every email.',
      ] },
      { id: 'provoz', h: 'Data about people in a business (Managero)', li: [
        'Name, email, phone, job title, avatar, role and password or tablet PIN (hash only).',
        'Shifts, availability, time-off requests, attendance (clock-in, clock-out, breaks). If the business enables it, a phone clock-in checks that you are at the venue: coordinates are not stored, only the result and distance in metres. Location is never tracked continuously or in the background.',
        'Payroll data (hourly rate, bonuses, payouts) is visible to management only. Also shift reviews, points, rewards, warnings and penalties including your response.',
        'Content the team creates: chat messages including photos, voice messages and videos, ideas, tasks, receipts, stock, closings and procedures.',
        'Business change log: who changed important settings and when.',
      ] },
      { id: 'ucely', h: 'Why we process data and on what basis', li: [
        'Providing the app and your account (sign-in, notifications, features): performance of a contract, i.e. the [[podminky|terms of use]] or [[obchodni-podminky|business terms]] (Article 6(1)(b) GDPR).',
        'Billing and accounting of businesses: legal obligation (point (c)) and contract.',
        'Security of accounts and the service, abuse and fraud prevention, technical logs: legitimate interest in safe operation (point (f)).',
        'Support and service messages (for example the trial is ending or a payment failed): contract, otherwise legitimate interest.',
        'Handling notices of illegal content and moderation: legal obligation under the Digital Services Act and legitimate interest in a safe service.',
        'Aggregated anonymous statistics to improve the service: legitimate interest; no person or business can be identified from them.',
        'Establishing and defending legal claims: legitimate interest.',
        'News from venues to guests: the guest\'s consent; the venue is the controller and sender, we record the consent and deliver the news.',
      ], po: [
        'You may object to processing based on legitimate interest. We do not currently send marketing emails about Managero; if we start, we will do so only where the law allows and with an unsubscribe link in every message.',
        'Name, email and password are required to create an account. Other data (phone, birthday, avatar) is optional.',
      ] },
      { id: 'automatizace', h: 'Automated decision-making', p: [
        'The app calculates points, stamps, rankings, hour totals and suggests actions to management, for example a penalty for being late. These are calculations and suggestions: decisions with legal or similarly significant effects for employees (pay, bonuses, penalties) are always made by a person in the business\'s management. We do not carry out automated decision-making within Article 22 GDPR and do not use data for advertising profiles. Automatic loyalty actions (for example a birthday reward) follow rules set by the venue.',
      ] },
      { id: 'prijemci', h: 'Who receives data', li: [
        'Providers processing data for us (Vercel hosting, Neon database, Resend email, Apple and Google notifications and others). The full list with location and safeguards is on the [[subzpracovatele|Subprocessors]] page.',
        'Stripe processes businesses\' subscription payments, partly as an independent controller. It does not concern guests or staff and is not used in the mobile apps.',
        'The business you join as a guest or team member, to the relevant extent (for example your card code and points are visible to the venue you joined, not to others).',
        'Public authorities, only where required by law.',
      ], po: ['We do not sell data and use no advertising or tracking tools.'] },
      { id: 'predani', h: 'Transfers outside the EU', p: [
        `Where data is stored: ${f.regionDatEn}. Some providers are based in the USA; transfers rely on the European Commission adequacy decision (EU–US Data Privacy Framework) for certified providers or on Commission-approved standard contractual clauses. The [[subzpracovatele|list of subprocessors]] states the safeguard for each.`,
      ] },
      { id: 'retence', h: 'How long we keep data', li: [
        'Account: as long as it exists. If you delete it, data is deleted or anonymised immediately.',
        `Inactive guest account (no visit, order, booking or app opening): anonymised after ${R.neaktivniHostMesicu} months; ${R.upozorneniPredemDni} days before, we email you an option to keep it.`,
        `Failed sign-in counters: ${R.pokusyPrihlaseniDni} day. Business change log: ${R.auditLogLet} years. In-app notifications: ${R.oznameniDni} days.`,
        `A business whose paid subscription (or trial) ended and which nobody then uses for ${R.zrusenyPodnikDni} days (none of its people signs in or opens the app, writes a message, records attendance, a shift, a task or a closing, or changes anything): deleted with its data. The owner and subscription managers get an email at least ${R.podnikUpozorneniDni} days and again ${R.podnikDruheUpozorneniDni} days before; signing in cancels the deletion.`,
        'Billing records of businesses: as long as tax and accounting rules require (up to 10 years).',
        'Notices of illegal content and decisions: as long as needed to handle them and to defend legal claims.',
        'Communication with support: until resolved and then for at most 3 years (the general limitation period), in case we need to show what was agreed.',
        'Technical logs at the hosting provider: only briefly, according to its settings (days).',
        `Backups at providers: overwritten within ${L.zalohyDni} days at the latest.`,
      ], po: ['Data controlled by a business is kept by the business according to its needs and obligations; after you delete your account, operational records (shifts, attendance, closings, handled orders) remain there without your name.'] },
      { id: 'cookies', h: 'Cookies and storage on your device', p: [
        'We store on your device only what is necessary for the service you requested. No consent is required for that by law, so there is no cookie banner. We use no analytics, advertising or tracking cookies.',
      ], li: [
        `Sign-in: a session cookie (valid up to ${L.relaceDni} days or until you sign out) and helper sign-in cookies (protection against forged requests, return to the page after sign-in).`,
        'Language: a cookie with the chosen language (1 year).',
        'Shared tablet at a venue: a cookie with who is currently signed in at the tablet (at most one hour).',
        'Browser storage (localStorage, sessionStorage): your settings (theme, language, date format, views, hidden hints), a referral code from a link until registration is completed, and that you confirmed the current terms in this session.',
        'Offline mode: for guests, the loyalty card (code, name and QR code) so it can be shown without signal; deleted on sign-out. A shared tablet at a venue keeps the rota, PIN hashes (not the PINs) and clock-ins made without internet until it sends them. The browser stores parts of the app (service worker) so it loads quickly.',
        'In the mobile apps: a device token for notifications and the card for offline mode in the app storage.',
      ] },
      { id: 'opravneni', h: 'App permissions', li: [
        'Location: only at the moment of a table order or clock-in (if the business enabled it), never in the background.',
        'Camera and photos: scanning QR codes, photos for chat, receipts and profile.',
        'Microphone: voice messages in chat.',
        'Notifications: updates about shifts, bookings, orders and chat.',
      ], po: ['You can revoke any permission at any time in your phone or browser settings; the related feature will then not work.'] },
      { id: 'prava', h: 'Your rights', p: [
        `You have the right of access, rectification, erasure, restriction, portability, to object and to withdraw consent. You can download your account data in the app (Managero: Settings → Data and privacy; Managero client: My page → Download my data) and correct most of it in your account settings. Send other requests to ${f.emailPodpory}; we handle them within one month. If the data is controlled by a business, we forward the request to it.`,
        'You may lodge a complaint with the Czech Office for Personal Data Protection, Pplk. Sochora 27, 170 00 Praha 7, uoou.gov.cz.',
      ] },
      { id: 'smazani', h: 'Deleting your account', p: [
        'Delete your account directly in the app (Managero client: My page → Delete account; Managero: Settings → Data and privacy → Delete account), or on the [[smazat-ucet|Delete account]] page even without the app installed. It also explains what is deleted and what remains.',
      ] },
      { id: 'deti', h: 'Children', p: ['You can create a guest account from the age of 15. If we learn that a younger child created an account without parental consent, we delete it. Workers under 18 are invited by the business, which is responsible as their employer.'] },
      { id: 'zmeny', h: 'Changes', p: [`We announce material changes in the app or by email and ask you to confirm them in the app. The current version is always on this page. This version applies from ${UCINNOST.en}.`] },
    ],
  };
}
