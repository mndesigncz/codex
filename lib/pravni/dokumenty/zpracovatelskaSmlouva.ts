// Zpracovatelská smlouva (DPA, čl. 28 GDPR) mezi podnikem (správce) a provozovatelem
// (zpracovatel) — /zpracovatelska-smlouva. Uzavírá se přijetím obchodních podmínek.
//
// Kategorie údajů odpovídají tabulkám v app/api/init/route.ts; opatření (čl. 32)
// tomu, co kód skutečně dělá: bcrypt otisky hesel a PINů (bcryptjs, cost 12),
// HTTPS + HSTS (next.config.js), privátní úložiště souborů (app/api/upload),
// oprávnění rolí (lib/opravneniDb), protokol změn (audit_log), omezení pokusů
// přihlášení (lib/rateLimit), odvolání relací při změně hesla (lib/authVerze),
// poloha při píchání jen jako vzdálenost (lib/geoPichani), denní záloha přes
// podepsaný odkaz (lib/pravni/zalohaOdkaz). Šifrování v klidu a dvoufázové ověření
// účtů u poskytovatelů jsou závazky provozovatele — viz docs/PRAVNI.md.
//
// ⚖ K ověření advokátem (komentář v kódu, ne na stránce): role u účtu hosta napříč
// podniky — zvolena varianta „účet hosta a přihlášení = Managero správce, data
// věrnosti a novinky konkrétního podniku = zpracovatel pro podnik“ (podklad kap. 2.3).

import type { Firma } from '../../firma.ts';
import { LHUTY, RETENCE_TEXT, UCINNOST } from '../lhuty.ts';
import { kontakty, provozovatel, type Dokument } from './typy.ts';

export function zpracovatelskaSmlouvaCs(f: Firma): Dokument {
  const L = LHUTY, R = RETENCE_TEXT;
  return {
    titulek: 'Zpracovatelská smlouva',
    uvod: `Smlouva o zpracování osobních údajů podle čl. 28 obecného nařízení o ochraně osobních údajů (GDPR) mezi zákazníkem, který v Manageru provozuje podnik (správce), a poskytovatelem služby Managero (zpracovatel). Je nedílnou součástí [[obchodni-podminky|obchodních podmínek]] a uzavírá se jejich přijetím. Platí od ${UCINNOST.cs}.`,
    aktualizace: UCINNOST.cs,
    obsah: true,
    sekce: [
      { id: 'strany', h: '1. Strany a předmět', li: [
        'Správce: zákazník podle obchodních podmínek, tedy podnikatel, který si v Manageru založil podnik.',
        `Zpracovatel: ${provozovatel(f, 'cs')}. Kontakt pro ochranu osobních údajů: ${kontakty(f, 'cs')}.`,
        'Předmětem je zpracování osobních údajů, které správce nebo jeho uživatelé vkládají do služby Managero nebo které v ní pro podnik vznikají, v rozsahu nutném k poskytování služby podle obchodních podmínek.',
      ] },
      { id: 'doba', h: '2. Doba zpracování', p: [
        'Zpracování trvá po dobu smlouvy o poskytování služby a dále do vrácení nebo výmazu údajů podle článku 13.',
      ] },
      { id: 'povaha-ucel', h: '3. Povaha a účel zpracování', p: [
        'Zpracovatel údaje ukládá, zobrazuje oprávněným uživatelům, přenáší mezi zařízeními, zálohuje, vyhodnocuje podle nastavení podniku (například součty hodin, body, razítka) a jménem podniku doručuje oznámení a e-maily. Účelem je výhradně poskytování služby Managero správci: plánování směn a docházka, komunikace týmu, úkoly, sklad a uzávěrky, mzdové podklady, odměny a hodnocení, věrnostní program, rezervace a objednávky hostů a novinky pro hosty.',
      ] },
      { id: 'subjekty', h: '4. Kategorie subjektů údajů', li: [
        'zaměstnanci, brigádníci a další spolupracovníci podniku a jeho vedení;',
        'hosté a zákazníci podniku (členové věrnostního programu, lidé s rezervací nebo objednávkou, odběratelé novinek);',
        'kontaktní osoby dodavatelů a obchodních partnerů podniku;',
        'další osoby, které se objeví v obsahu vloženém uživateli (například na fotografii nebo ve zprávě).',
      ] },
      { id: 'udaje', h: '5. Kategorie osobních údajů', p: ['U zaměstnanců a vedení:'], li: [
        'identifikační a kontaktní údaje: jméno, e-mail, telefon, avatar, pozice, role a oprávnění v podniku; otisk hesla a PINu k tabletu;',
        'směny, dostupnost, žádosti o volno a výměny směn;',
        'docházka: časy příchodů, odchodů a přestávek a odkud byly zapsány (telefon, tablet, ručně). Pokud podnik zapne píchání jen u podniku, uloží se k příchodu z telefonu výsledek kontroly a vzdálenost od podniku v metrech; souřadnice telefonu se neukládají;',
        'mzdové podklady: hodinová sazba, odpracované hodiny, prémie a úpravy mezd, výplaty a uzavřená výplatní období;',
        'hodnocení směn, body, odměny a jejich výběr, tresty a napomenutí (text, případně fotografie přiložená vedením, body, krácení nenárokové prémie a vyjádření zaměstnance), úkoly, uzávěrky kasy včetně rozdílů;',
        'obsah komunikace: zprávy v chatu včetně fotografií, hlasových zpráv a videí, reakce, nápady a hlasování, ankety, oznámení a potvrzení přečtení návodů;',
        'technické údaje: tokeny zařízení pro oznámení a protokol změn podniku (kdo a kdy změnil důležité nastavení).',
      ], po: [
        'U hostů: jméno, e-mail, telefon a datum narození (nepovinné), kód věrnostní karty, body, razítka, kredit, návštěvy, poukazy a kupony, hodnocení, rezervace, objednávky od stolu (položky, stůl, poznámka; při ověření polohy jen vzdálenost od podniku), účtenky z pokladny přiřazené ke kartě, souhlas s novinkami (čas a kanál), skupiny a poznámky podniku k hostovi a údaje, které podnik importuje z dřívějšího věrnostního systému.',
        'U dodavatelů: jméno, e-mail a telefon kontaktní osoby a obsah objednávek.',
        'Služba není určena ke zpracování zvláštních kategorií údajů (čl. 9 GDPR). Pokud je správce přesto vloží (například zdravotní důvod nepřítomnosti v poznámce), odpovídá za jejich právní základ. Zpracovatel neprovádí biometrické zpracování ani rozpoznávání obličeje.',
      ] },
      { id: 'pokyny', h: '6. Pokyny správce', li: [
        'Zpracovatel zpracovává údaje jen na doložené pokyny správce, a to i pokud jde o předání do třetích zemí. Pokyny jsou obchodní podmínky, tato smlouva a nastavení a úkony, které správce a jeho uživatelé v aplikaci provedou. Další pokyny dává správce e-mailem.',
        'Zpracovatel správce bez zbytečného odkladu upozorní, pokud má za to, že pokyn porušuje GDPR nebo jiný předpis o ochraně údajů.',
        'Zpracovat údaje jinak smí zpracovatel jen tehdy, když mu to ukládá právo EU nebo členského státu; pak správce předem informuje, pokud to právo nezakazuje.',
      ] },
      { id: 'spravce', h: '7. Povinnosti správce', p: [
        'Správce odpovídá za zákonnost zpracování: za právní základ, za informování subjektů údajů (pomůže šablona [[informace-pro-zamestnance|Informace pro zaměstnance]]), za souhlasy hostů s novinkami, za posouzení vlivu na ochranu osobních údajů tam, kde je potřeba (například u kontroly polohy při píchání), a za nastavení, která v aplikaci zvolí.',
      ] },
      { id: 'mlcenlivost', h: '8. Mlčenlivost', p: [
        'Zpracovatel zachovává mlčenlivost o údajích a opatřeních k jejich ochraně. Kdokoli, koho zpracovatel k práci s údaji přizve, je zavázán mlčenlivostí smluvně nebo ze zákona. Mlčenlivost trvá i po skončení smlouvy.',
      ] },
      { id: 'zabezpeceni', h: '9. Zabezpečení (čl. 32 GDPR)', p: ['Zpracovatel přijal tato technická a organizační opatření:'], li: [
        'šifrovaný přenos (HTTPS/TLS s vynuceným HSTS) mezi zařízeními a službou i mezi službou a jejími poskytovateli; databáze a úložiště souborů jsou u poskytovatelů šifrované i v klidu;',
        'hesla a PINy jen jako jednosměrný otisk (bcrypt), nikdy v čitelné podobě; omezení počtu pokusů o přihlášení; přihlášení v zabezpečené cookie (httpOnly) s omezenou platností; změna hesla odhlásí ostatní zařízení;',
        'oddělení dat podniků: každý dotaz je omezený na podnik, ve kterém je uživatel členem; přístup uvnitř podniku řídí role a oprávnění (například hodinové sazby vidí jen vedení, soukromé zprávy nevidí ani vlastník podniku);',
        'soubory (fotky, účtenky, přílohy) v neveřejném úložišti, vydávané jen přihlášeným oprávněným uživatelům;',
        'protokol změn podniku a samostatný protokol zásahů správy platformy;',
        `zálohy: databáze s obnovou k bodu v čase u poskytovatele databáze a denní záloha podniku pro správce přes podepsaný odkaz, který platí ${L.odkazZalohyDni} dní a funguje jen po přihlášení oprávněného člověka;`,
        'minimalizace: poloha se neukládá, jen vzdálenost a výsledek kontroly; staré údaje se mažou podle lhůt v článku 13;',
        'přístup k produkčním systémům má jen zpracovatel; účty u poskytovatelů infrastruktury chrání silným heslem a dvoufázovým ověřením;',
        'bezpečný vývoj: automatické testy a kontroly před nasazením, bezpečnostní hlavičky (Content Security Policy), aktualizace závislostí;',
        'postup pro řešení bezpečnostních incidentů (článek 12).',
      ] },
      { id: 'subzpracovatele', h: '10. Subzpracovatelé', li: [
        'Správce uděluje zpracovateli obecné povolení zapojit další zpracovatele (subzpracovatele). Jejich aktuální seznam s účelem, umístěním a zárukami je na stránce [[subzpracovatele|Subzpracovatelé]] a je přílohou této smlouvy.',
        `Zamýšlené přidání nebo nahrazení subzpracovatele oznámí zpracovatel e-mailem vlastníkovi podniku a na stránce seznamu nejméně ${L.subzpracovatelDni} dní předem. Správce může do ${L.subzpracovatelDni} dní od oznámení vznést odůvodněnou námitku. Když ji nevyřešíme, může správce smlouvu vypovědět bez sankce ke dni před zapojením subzpracovatele a nevyčerpanou část předplatného mu poměrně vrátíme.`,
        'Kratší lhůtu lze použít jen v naléhavém případě (bezpečnost, náhlé ukončení služby subzpracovatelem); i pak zpracovatel změnu oznámí bez zbytečného odkladu.',
        'Zpracovatel ukládá subzpracovatelům smluvně stejné povinnosti ochrany údajů, jaké má sám, a za jejich plnění správci odpovídá.',
      ] },
      { id: 'predavani', h: '11. Předávání mimo EU', p: [
        `Databáze leží v Evropské unii (${f.regionDat}). Někteří subzpracovatelé jsou usazeni v USA. Údaje jim zpracovatel předává jen na základě rozhodnutí Komise o odpovídající ochraně (EU–US Data Privacy Framework, prováděcí rozhodnutí (EU) 2023/1795) u certifikovaných příjemců, nebo standardních smluvních doložek podle prováděcího rozhodnutí (EU) 2021/914, které jsou součástí jejich zpracovatelských smluv. Konkrétní záruka u každého je v seznamu subzpracovatelů.`,
      ] },
      { id: 'soucinnost', h: '12. Práva subjektů, součinnost a porušení zabezpečení', li: [
        'Zpracovatel pomáhá správci plnit žádosti subjektů údajů. Aplikace k tomu má nástroje: stažení údajů účtu, opravu v profilu, smazání účtu, export členů věrnostního programu a smazání nebo anonymizaci hosta.',
        `Žádost subjektu údajů, která se týká údajů podniku a přijde zpracovateli, předá zpracovatel správci nejpozději do ${L.predaniZadostiPracDni} pracovních dnů a sám na ni věcně neodpovídá, pokud se nedohodnou jinak.`,
        'Zpracovatel poskytne správci informace potřebné pro zajištění bezpečnosti, posouzení vlivu na ochranu osobních údajů a předchozí konzultaci s úřadem (čl. 32 až 36 GDPR).',
        `Porušení zabezpečení osobních údajů podniku oznámí zpracovatel správci bez zbytečného odkladu, nejpozději do ${L.incidentHodin} hodin od zjištění, e-mailem vlastníkovi podniku. Uvede povahu porušení, kategorie a přibližný počet dotčených osob a záznamů, pravděpodobné důsledky a přijatá opatření; co ještě neví, doplní postupně. Ohlášení Úřadu pro ochranu osobních údajů a dotčeným osobám činí správce, zpracovatel mu s tím pomůže.`,
      ] },
      { id: 'vymaz', h: '13. Doba uložení, výmaz a vrácení údajů', li: [
        `Během smlouvy platí tyto lhůty, které správce přijímá jako svůj pokyn: neaktivní účet hosta (žádná návštěva, objednávka, rezervace ani otevření aplikace) se po ${R.neaktivniHostMesicu} měsících anonymizuje, host dostane ${R.upozorneniPredemDni} dní předem e-mail s možností účet ponechat; protokol změn podniku se maže po ${R.auditLogLet} letech; oznámení v aplikaci po ${R.oznameniDni} dnech.`,
        'Smaže-li svůj účet zaměstnanec nebo host, jeho osobní údaje se smažou nebo anonymizují. Záznamy, které podnik potřebuje k provozu a ze zákona (směny, docházka, uzávěrky, vyřízené objednávky), zůstanou bez jména.',
        `Po skončení smlouvy zpracovatel podle volby správce údaje vrátí (export podle článku 20 obchodních podmínek) a vymaže, v lhůtách tam uvedených. Kopie v zálohách zaniknou nejpozději do ${L.zalohyDni} dnů. Zpracovatel ponechá jen údaje, jejichž uložení vyžaduje právo EU nebo České republiky.`,
      ] },
      { id: 'audit', h: '14. Informace a audit', p: [
        `Zpracovatel na požádání poskytne správci informace potřebné k doložení plnění této smlouvy (popis opatření, seznam subzpracovatelů a jejich zpracovatelské smlouvy, odpovědi na bezpečnostní dotazník). Audit nebo inspekci provedenou správcem nebo pověřeným auditorem vázaným mlčenlivostí umožní po ohlášení nejméně ${L.oznameniZmenDni} dní předem, nejvýš jednou za rok (kromě situace po porušení zabezpečení nebo na žádost úřadu), na náklady správce a bez narušení provozu služby a ochrany dat ostatních podniků. Prověrky datových center nahrazují certifikace a zprávy poskytovatelů infrastruktury.`,
      ] },
      { id: 'mimo-smlouvu', h: '15. Kdy je Managero samostatným správcem', p: [
        'Tato smlouva se nevztahuje na zpracování, při kterém o účelu rozhoduje provozovatel sám: uživatelské účty a přihlášení (včetně účtu hosta, který funguje napříč podniky), zabezpečení a prevence zneužití, podpora, fakturace podnikům, moderace obsahu a oznámení podle Aktu o digitálních službách a souhrnné anonymní statistiky. Tato zpracování popisují [[soukromi|zásady ochrany osobních údajů]].',
      ] },
      { id: 'odpovednost', h: '16. Odpovědnost a závěrečná ustanovení', li: [
        'Každá strana odpovídá za porušení svých povinností podle GDPR. Mezi stranami platí omezení odpovědnosti podle článku 17 obchodních podmínek; nedotýká se odpovědnosti vůči subjektům údajů (čl. 82 GDPR) ani pokut uložených úřadem.',
        'Změny této smlouvy a její postoupení se řídí články 18 a 21 obchodních podmínek. Ve věcech osobních údajů má tato smlouva přednost před obchodními podmínkami; v rozporu s GDPR platí GDPR.',
        `Smlouva platí od ${UCINNOST.cs} (verze 2026-10-21).`,
      ] },
    ],
  };
}

export function zpracovatelskaSmlouvaEn(f: Firma): Dokument {
  const L = LHUTY, R = RETENCE_TEXT;
  return {
    titulek: 'Data processing agreement',
    uvod: `Agreement on the processing of personal data under Article 28 of the General Data Protection Regulation (GDPR) between the customer running a business in Managero (controller) and the provider of the Managero service (processor). It forms an integral part of the [[obchodni-podminky|business terms]] and is concluded by accepting them. Effective from ${UCINNOST.en}. This English version is for information only; the Czech version prevails.`,
    aktualizace: UCINNOST.en,
    obsah: true,
    sekce: [
      { id: 'strany', h: '1. Parties and subject', li: [
        'Controller: the customer under the business terms, i.e. an entrepreneur who created a business in Managero.',
        `Processor: ${provozovatel(f, 'en')}. Data protection contact: ${kontakty(f, 'en')}.`,
        'Subject: processing of personal data that the controller or its users put into the Managero service or that is created in it for the business, to the extent necessary to provide the service under the business terms.',
      ] },
      { id: 'doba', h: '2. Duration', p: ['Processing lasts for the term of the service contract and until the data is returned or erased under section 13.'] },
      { id: 'povaha-ucel', h: '3. Nature and purpose', p: [
        'The processor stores data, displays it to authorised users, transfers it between devices, backs it up, evaluates it according to the business\'s settings (for example hour totals, points, stamps) and delivers notifications and emails on behalf of the business. The sole purpose is providing the Managero service to the controller: rota and attendance, team communication, tasks, stock and closings, payroll data, rewards and reviews, loyalty programme, guest bookings and orders, and news for guests.',
      ] },
      { id: 'subjekty', h: '4. Categories of data subjects', li: [
        'employees, temporary workers and other collaborators of the business and its management;',
        'guests and customers of the business (loyalty members, people with bookings or orders, news subscribers);',
        'contact persons of suppliers and business partners;',
        'other people appearing in content added by users (for example in a photo or message).',
      ] },
      { id: 'udaje', h: '5. Categories of personal data', p: ['Staff and management:'], li: [
        'identification and contact data: name, email, phone, avatar, job title, role and permissions; password and tablet PIN hashes;',
        'shifts, availability, time-off and shift-swap requests;',
        'attendance: clock-in, clock-out and break times and where they were recorded (phone, tablet, manually). If the business enables clock-in only at the venue, the result of the check and the distance from the venue in metres are stored with a phone clock-in; phone coordinates are not stored;',
        'payroll data: hourly rate, hours worked, bonuses and wage adjustments, payouts and closed pay periods;',
        'shift reviews, points, rewards and redemptions, penalties and warnings (text, a photo attached by management if any, points, reduction of a discretionary bonus and the employee\'s response), tasks, till closings including differences;',
        'communication content: chat messages including photos, voice messages and videos, reactions, ideas and votes, polls, announcements and guide read receipts;',
        'technical data: device tokens for notifications and the business change log (who changed important settings and when).',
      ], po: [
        'Guests: name, email, phone and date of birth (optional), loyalty card code, points, stamps, credit, visits, vouchers and coupons, ratings, bookings, table orders (items, table, note; with a location check only the distance from the venue), POS receipts linked to the card, consent to news (time and channel), groups and the business\'s notes about the guest, and data the business imports from an earlier loyalty system.',
        'Suppliers: name, email and phone of the contact person and order content.',
        'The service is not intended for special categories of data (Article 9 GDPR). If the controller nevertheless enters them (for example a health reason for absence in a note), it is responsible for the legal basis. The processor performs no biometric processing or face recognition.',
      ] },
      { id: 'pokyny', h: '6. Controller\'s instructions', li: [
        'The processor processes data only on documented instructions from the controller, including with regard to transfers to third countries. Instructions are the business terms, this agreement and the settings and actions the controller and its users make in the app. Further instructions are given by email.',
        'The processor informs the controller without undue delay if it considers an instruction to infringe the GDPR or other data protection law.',
        'The processor may process data otherwise only where required by EU or Member State law, informing the controller beforehand unless that law prohibits it.',
      ] },
      { id: 'spravce', h: '7. Controller\'s obligations', p: [
        'The controller is responsible for the lawfulness of processing: the legal basis, informing data subjects (the [[informace-pro-zamestnance|Information for staff]] template helps), guests\' consent to news, a data protection impact assessment where needed (for example for location checks at clock-in), and the settings it chooses in the app.',
      ] },
      { id: 'mlcenlivost', h: '8. Confidentiality', p: [
        'The processor keeps the data and the measures protecting it confidential. Anyone the processor involves in handling the data is bound by confidentiality by contract or by law. Confidentiality survives the end of the contract.',
      ] },
      { id: 'zabezpeceni', h: '9. Security (Article 32 GDPR)', p: ['The processor has adopted these technical and organisational measures:'], li: [
        'encrypted transfer (HTTPS/TLS with enforced HSTS) between devices and the service and between the service and its providers; the database and file storage are also encrypted at rest at the providers;',
        'passwords and PINs only as one-way hashes (bcrypt), never readable; rate-limited sign-in; sign-in in a secure (httpOnly) cookie with limited validity; changing the password signs out other devices;',
        'separation of businesses: every query is limited to the business the user is a member of; access within a business is governed by roles and permissions (for example only management sees hourly rates, not even the owner sees private messages);',
        'files (photos, receipts, attachments) in non-public storage, served only to signed-in authorised users;',
        'a business change log and a separate log of platform administration actions;',
        `backups: point-in-time recovery of the database at the database provider and a daily business backup for the controller via a signed link valid ${L.odkazZalohyDni} days that works only after an authorised person signs in;`,
        'minimisation: location is not stored, only the distance and the result of the check; old data is deleted according to section 13;',
        'only the processor has access to production systems; accounts at infrastructure providers are protected by strong passwords and two-factor authentication;',
        'secure development: automated tests and checks before deployment, security headers (Content Security Policy), dependency updates;',
        'an incident response procedure (section 12).',
      ] },
      { id: 'subzpracovatele', h: '10. Subprocessors', li: [
        'The controller gives the processor general authorisation to engage other processors (subprocessors). The current list with purpose, location and safeguards is on the [[subzpracovatele|Subprocessors]] page and forms an annex to this agreement.',
        `The processor announces an intended addition or replacement of a subprocessor by email to the business owner and on the list page at least ${L.subzpracovatelDni} days in advance. The controller may raise a reasoned objection within ${L.subzpracovatelDni} days of the notice. If we cannot resolve it, the controller may terminate without penalty as of the day before the subprocessor is engaged and we refund the unused part of the subscription pro rata.`,
        'A shorter period may be used only in urgent cases (security, sudden termination by a subprocessor); the change is then announced without undue delay.',
        'The processor imposes the same data protection obligations on subprocessors by contract and remains liable to the controller for their performance.',
      ] },
      { id: 'predavani', h: '11. Transfers outside the EU', p: [
        `The database is located in the European Union (Neon database in AWS eu-central-1, Frankfurt). Some subprocessors are established in the USA. Data is transferred to them only on the basis of the Commission adequacy decision (EU–US Data Privacy Framework, Implementing Decision (EU) 2023/1795) for certified recipients, or of standard contractual clauses under Implementing Decision (EU) 2021/914 included in their data processing agreements. The safeguard for each is stated in the list of subprocessors.`,
      ] },
      { id: 'soucinnost', h: '12. Data subject rights, assistance and breaches', li: [
        'The processor helps the controller respond to data subject requests. The app provides tools for this: downloading account data, correcting the profile, deleting an account, exporting loyalty members and deleting or anonymising a guest.',
        `A data subject request concerning business data that reaches the processor is forwarded to the controller within ${L.predaniZadostiPracDni} working days; the processor does not answer it on the merits unless agreed otherwise.`,
        'The processor provides the controller with information needed for security, data protection impact assessments and prior consultation (Articles 32 to 36 GDPR).',
        `The processor notifies the controller of a personal data breach affecting the business without undue delay and at the latest within ${L.incidentHodin} hours of becoming aware of it, by email to the business owner, stating the nature of the breach, categories and approximate numbers of people and records concerned, likely consequences and measures taken, and supplementing what is not yet known. Notification to the supervisory authority and data subjects is made by the controller with the processor's help.`,
      ] },
      { id: 'vymaz', h: '13. Retention, erasure and return', li: [
        `During the contract these periods apply as the controller's instruction: an inactive guest account (no visit, order, booking or app opening) is anonymised after ${R.neaktivniHostMesicu} months, with an email ${R.upozorneniPredemDni} days before offering to keep it; the business change log is deleted after ${R.auditLogLet} years; in-app notifications after ${R.oznameniDni} days.`,
        'When an employee or guest deletes their account, their personal data is deleted or anonymised. Records the business needs for operations and by law (shifts, attendance, closings, handled orders) remain without the name.',
        `When the contract ends, the processor returns the data at the controller's choice (export under section 20 of the business terms) and erases it within the periods stated there. Copies in backups disappear within ${L.zalohyDni} days at the latest. The processor keeps only data whose storage is required by EU or Czech law.`,
      ] },
      { id: 'audit', h: '14. Information and audits', p: [
        `On request the processor provides the controller with the information needed to demonstrate compliance with this agreement (description of measures, list of subprocessors and their data processing agreements, answers to a security questionnaire). It allows audits or inspections by the controller or an auditor bound by confidentiality, announced at least ${L.oznameniZmenDni} days in advance, at most once a year (except after a breach or at an authority's request), at the controller's cost and without disrupting the service or the protection of other businesses' data. Data centre audits are replaced by the certifications and reports of the infrastructure providers.`,
      ] },
      { id: 'mimo-smlouvu', h: '15. When Managero is an independent controller', p: [
        'This agreement does not cover processing whose purpose the provider determines itself: user accounts and sign-in (including the guest account that works across businesses), security and abuse prevention, support, billing of businesses, content moderation and notices under the Digital Services Act, and aggregated anonymous statistics. These are described in the [[soukromi|privacy policy]].',
      ] },
      { id: 'odpovednost', h: '16. Liability and final provisions', li: [
        'Each party is liable for breaching its own GDPR obligations. Between the parties the limitation of liability in section 17 of the business terms applies; it does not affect liability towards data subjects (Article 82 GDPR) or fines imposed by an authority.',
        'Changes to and assignment of this agreement follow sections 18 and 21 of the business terms. In matters of personal data this agreement prevails over the business terms; in case of conflict with the GDPR, the GDPR applies.',
        `This agreement applies from ${UCINNOST.en} (version 2026-10-21).`,
      ] },
    ],
  };
}
