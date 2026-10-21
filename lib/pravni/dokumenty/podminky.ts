// Podmínky užívání pro uživatele (zaměstnanci a vedení v Manageru, hosté v Managero client) — /podminky.
//
// Hosté jsou spotřebitelé a služba je pro ně zdarma: informace podle § 1811 a § 1820 OZ
// (totožnost, adresa, telefon, e-mail, vlastnosti, cena, trvání, technické kroky, ADR ČOI
// podle § 14 ZOS — bez odkazu na zrušenou platformu ODR). Moderace podle DSA čl. 14, 16, 17,
// kontaktní místo čl. 11/12. Nahlášení v aplikaci: Nahlásit/Zablokovat v chatu a nápadech
// (content_reports, user_blocks), oznámení bez účtu na /nahlasit (lib/dsa).

import type { Firma } from '../../firma.ts';
import { LHUTY, RETENCE_TEXT, UCINNOST } from '../lhuty.ts';
import { kontakty, provozovatel, type Dokument } from './typy.ts';

export function podminkyCs(f: Firma): Dokument {
  return {
    titulek: 'Podmínky užívání',
    uvod: `Tyto podmínky upravují používání aplikací Managero (pro lidi v podniku: vedení, zaměstnance a brigádníky) a Managero client (pro hosty podniků). Pro podnik jako zákazníka platí navíc [[obchodni-podminky|obchodní podmínky]]. Platí od ${UCINNOST.cs}.`,
    aktualizace: UCINNOST.cs,
    obsah: true,
    sekce: [
      { id: 'provozovatel', h: 'Kdo službu poskytuje', p: [
        `${provozovatel(f, 'cs')}. Kontakt: ${kontakty(f, 'cs')}.`,
      ] },
      { id: 'sluzba', h: 'Co aplikace jsou a kolik stojí', li: [
        'Managero je nástroj pro provoz podniku: směny, docházka, úkoly, sklad, uzávěrky, odměny a týmový chat. Účet zakládá vedení podniku, nebo se člověk připojí pozvánkou či kódem podniku.',
        'Managero client je aplikace pro hosty: věrnostní karta, razítka a body, poukazy a kupony, rezervace, objednávky od stolu a novinky podniků.',
        'Pro uživatele jsou obě aplikace zdarma. Platíte jen připojení k internetu podle svého operátora. Objednávky a služby podniku platí hosté přímo v podniku; aplikace platby hostů nezpracovává a v mobilních aplikacích se nic nekupuje.',
      ] },
      { id: 'uzavreni', h: 'Založení účtu a uzavření smlouvy', li: [
        'Host si účet založí v Managero client zadáním jména, e-mailu a hesla, zaškrtnutím souhlasu s těmito podmínkami a potvrzením, že mu je aspoň 15 let. Člen týmu se připojí pozvánkou nebo kódem podniku a souhlas potvrdí stejně.',
        'Smlouva o užívání aplikace vzniká založením účtu. Před odesláním formuláře můžete údaje zkontrolovat a opravit. Smlouva se uzavírá v češtině (anglický překlad podmínek je informativní). Verzi podmínek, se kterou jste souhlasili, ukládáme u účtu a platné znění je vždy na této stránce, kde si ho můžete uložit nebo vytisknout.',
        'Technické požadavky: aktuální verze běžných prohlížečů (Safari, Chrome, Firefox, Edge) nebo mobilní aplikace pro iOS a Android podle požadavků v App Store a Google Play, a připojení k internetu. Údaje účtu si můžete kdykoli stáhnout ve strojově čitelném formátu (Nastavení → Data a soukromí).',
      ] },
      { id: 'ucet', h: 'Pravidla účtu', li: [
        'Uveďte pravdivé údaje a chraňte své heslo. Za činnost pod svým účtem odpovídáte.',
        'Jeden účet patří jednomu člověku. Účet hosta se nepoužívá v aplikaci pro podniky a naopak.',
        'Účet můžete kdykoli smazat v aplikaci nebo na stránce [[smazat-ucet|Smazání účtu]].',
      ] },
      { id: 'zamestnanci', h: 'Pro lidi v podniku', p: [
        'Co se o vaší práci v Manageru zaznamenává (směny, docházka, případně ověření polohy při příchodu, odměny, hodnocení, mzdové podklady), určuje podnik. Je vaším zaměstnavatelem nebo objednatelem a správcem těchto údajů; s otázkami k nim se obracejte na něj. Managero není stranou vašeho pracovního vztahu a o mzdách, prémiích ani trestech nerozhoduje.',
      ] },
      { id: 'hoste', h: 'Pro hosty: výhody, rezervace a objednávky', li: [
        'Věrnostní body, razítka, poukazy, kupony a akce nabízí a uznává konkrétní podnik. Podnik určuje jejich pravidla, hodnotu a platnost a za jejich plnění odpovídá. Managero je jen technický nástroj.',
        'Rezervace a objednávky od stolu uzavíráte s podnikem. Reklamace výhod, rezervací, jídla a služeb řešte s podnikem; rádi pomůžeme s technickou stránkou.',
      ] },
      { id: 'obsah', h: 'Pravidla obsahu a chování', p: [
        'Do aplikací nesmíte vkládat ani šířit obsah, který je nezákonný (například výhrůžky, podněcování k nenávisti nebo násilí, pomluvy, cizí osobní údaje bez oprávnění, obsah porušující autorská práva, sexuální obsah s nezletilými), ani obsah urážlivý, obtěžující, diskriminační nebo klamavý. Zakázané je také vydávat se za někoho jiného, rozesílat spam, šířit škodlivý kód a pokoušet se získat přístup k cizím účtům a datům.',
      ] },
      { id: 'moderace', h: 'Jak obsah moderujeme', li: [
        'Ve svém prostoru (chat, nápady, stránka podniku, nabídka a akce) moderuje obsah vedení podniku. Napříč službou moderuje provozovatel.',
        'Nevhodný obsah v chatu a v nápadech nahlásíte volbou Nahlásit a uživatele zablokujete volbou Zablokovat. Nahlášení vidí vedení podniku. Nezákonný obsah může kdokoli oznámit i bez účtu na stránce [[nahlasit|Nahlásit obsah]].',
        'Oznámení posuzuje člověk; automatické filtry ani algoritmické rozhodování o obsahu nepoužíváme. Hlášení řešíme bez zbytečného odkladu, zpravidla do 24 hodin v pracovní dny.',
        'Při porušení podmínek můžeme obsah odstranit nebo znepřístupnit, uživatele odebrat z podniku a při závažném nebo opakovaném porušení účet pozastavit nebo zrušit. Zásah volíme přiměřeně závažnosti; u méně závažných porušení nejdřív upozorníme.',
        'Kdo je zásahem dotčen, dostane od nás odůvodnění: co jsme omezili, na základě jakých skutečností, podle kterého pravidla nebo zákona a jak se může bránit. Proti rozhodnutí se můžete do 6 měsíců ohradit odpovědí na e-mail s rozhodnutím nebo na kontaktní adrese; ohrazení přezkoumá člověk a výsledek vám sdělíme. Možnost obrátit se na soud tím není dotčena.',
        'Pokud se dozvíme o obsahu, který nasvědčuje trestnému činu ohrožujícímu život nebo bezpečnost osob, oznámíme to orgánům činným v trestním řízení.',
      ] },
      { id: 'nahlaseni', h: 'Oznámení nezákonného obsahu', p: [
        'Na stránce [[nahlasit|Nahlásit obsah]] uveďte, proč obsah považujete za nezákonný, kde přesně je (odkaz nebo popis umístění), své jméno a e-mail (nemusíte u oznámení zneužívání dětí) a prohlášení, že oznámení podáváte v dobré víře a údaje jsou podle vašeho vědomí přesné. Pošleme potvrzení o přijetí a potom rozhodnutí s informací o možnostech nápravy.',
      ] },
      { id: 'kontaktni-misto', h: 'Kontaktní místo', p: [
        `Jednotné kontaktní místo podle Aktu o digitálních službách (čl. 11 a 12) pro orgány členských států, Evropskou komisi, Evropský sbor pro digitální služby i uživatele: ${f.emailPodpory}, telefon ${f.telefon}. Komunikujeme česky a anglicky.`,
      ] },
      { id: 'novinky', h: 'Novinky a obchodní sdělení', p: [
        'Novinky a akce od podniků vám chodí jen s vaším výslovným souhlasem. Odesílatelem je podnik, který je ve zprávě uvedený. Souhlas odvoláte v profilu nebo odkazem v každém e-mailu. Provozní zprávy (potvrzení rezervace, obnovení hesla, oznámení o směnách) nejsou obchodní sdělení a chodí bez ohledu na tento souhlas.',
      ] },
      { id: 'dostupnost', h: 'Dostupnost, vady a změny', li: [
        'Aplikace provozujeme s odbornou péčí a snažíme se o nepřetržitý provoz, ale výpadky a údržba se mohou stát. Funkce můžeme vyvíjet a měnit.',
        `Chybu nebo vadu aplikace nám prosím nahlaste na ${f.emailPodpory}. Vyřídíme ji bez zbytečného odkladu, nejpozději do ${LHUTY.vadyDni} dnů. Vaše práva podle zákona tím nejsou dotčena.`,
        'Podstatnou změnu těchto podmínek oznámíme předem v aplikaci nebo e-mailem a v aplikaci vás požádáme o nový souhlas. Pokud nesouhlasíte, můžete účet kdykoli smazat.',
      ] },
      { id: 'ukonceni', h: 'Ukončení', li: [
        'Smlouvu můžete kdykoli ukončit smazáním účtu. Jako spotřebitel můžete od smlouvy odstoupit i do 14 dnů od založení účtu bez udání důvodu (napište nám nebo účet smažte); služba je zdarma, nic se nevrací ani neplatí.',
        `Při závažném porušení podmínek můžeme účet zrušit; dozvíte se proč. Účet hosta, který ${RETENCE_TEXT.neaktivniHostMesicu} měsíců nikdo nepoužil, anonymizujeme; ${RETENCE_TEXT.upozorneniPredemDni} dní předem pošleme e-mail s možností si ho ponechat.`,
      ] },
      { id: 'odpovednost', h: 'Odpovědnost', p: [
        'Za škodu odpovídáme podle zákona. Neodpovídáme za plnění podniků (výhody, rezervace, objednávky) ani za obsah, který vložili jiní uživatelé, ani za to, jak podnik naloží s údaji svého týmu a hostů, kde je jejich správcem. Tím nejsou omezena práva, která vám dává zákon.',
      ] },
      { id: 'spory', h: 'Stížnosti a spory', p: [
        `Stížnosti posílejte na ${f.emailPodpory}. K mimosoudnímu řešení spotřebitelských sporů je příslušná Česká obchodní inspekce (adr.coi.gov.cz). Dozor nad ochranou spotřebitele vykonává Česká obchodní inspekce, nad ochranou osobních údajů Úřad pro ochranu osobních údajů. Smlouva se řídí českým právem; ochrana, kterou vám dávají předpisy státu vašeho bydliště, tím není dotčena.`,
      ] },
    ],
  };
}

export function podminkyEn(f: Firma): Dokument {
  return {
    titulek: 'Terms of use',
    uvod: `These terms govern the use of the Managero app (for people in a business: management, staff and temporary workers) and the Managero client app (for guests of businesses). For a business as customer, the [[obchodni-podminky|business terms]] also apply. Effective from ${UCINNOST.en}. This English version is for information only; the Czech version prevails.`,
    aktualizace: UCINNOST.en,
    obsah: true,
    sekce: [
      { id: 'provozovatel', h: 'Who provides the service', p: [`${provozovatel(f, 'en')}. Contact: ${kontakty(f, 'en')}.`] },
      { id: 'sluzba', h: 'What the apps are and what they cost', li: [
        'Managero is a tool for running a business: shifts, attendance, tasks, stock, closings, rewards and team chat. Accounts are created by management, or people join via an invitation or the business code.',
        'Managero client is for guests: loyalty card, stamps and points, vouchers and coupons, bookings, table orders and venue news.',
        'Both apps are free for users. You only pay for your internet connection. Guests pay the venue directly for orders and services; the app does not process guests\' payments and nothing is sold in the mobile apps.',
      ] },
      { id: 'uzavreni', h: 'Creating an account and concluding the contract', li: [
        'A guest creates an account in Managero client by entering name, email and password, agreeing to these terms and confirming they are at least 15. A team member joins via an invitation or business code and agrees the same way.',
        'The contract for using the app is concluded by creating the account. You can check and correct details before submitting. The contract is concluded in Czech (the English translation is informative). We store the version of the terms you agreed to with your account; the current version is always on this page, where you can save or print it.',
        'Technical requirements: current versions of common browsers (Safari, Chrome, Firefox, Edge) or the iOS and Android apps per the App Store and Google Play requirements, and an internet connection. You can download your account data in a machine-readable format at any time (Settings → Data and privacy).',
      ] },
      { id: 'ucet', h: 'Account rules', li: [
        'Give truthful details and protect your password. You are responsible for activity under your account.',
        'One account belongs to one person. A guest account is not used in the business app and vice versa.',
        'You can delete your account at any time in the app or on the [[smazat-ucet|Delete account]] page.',
      ] },
      { id: 'zamestnanci', h: 'For people in a business', p: [
        'What is recorded about your work in Managero (shifts, attendance, possibly a location check at clock-in, rewards, reviews, payroll data) is decided by the business. It is your employer or client and the controller of this data; direct questions about it to the business. Managero is not a party to your employment and does not decide on pay, bonuses or penalties.',
      ] },
      { id: 'hoste', h: 'For guests: benefits, bookings and orders', li: [
        'Loyalty points, stamps, vouchers, coupons and offers are offered and honoured by the individual venue, which sets their rules, value and validity and is responsible for them. Managero is only a technical tool.',
        'Bookings and table orders are made with the venue. Complaints about benefits, bookings, food and services are handled by the venue; we are happy to help with the technical side.',
      ] },
      { id: 'obsah', h: 'Content and conduct rules', p: [
        'You must not upload or share content that is illegal (for example threats, incitement to hatred or violence, defamation, others\' personal data without authorisation, copyright-infringing content, sexual content involving minors), or that is abusive, harassing, discriminatory or misleading. Impersonation, spam, malicious code and attempts to access others\' accounts or data are also prohibited.',
      ] },
      { id: 'moderace', h: 'How we moderate content', li: [
        'Within its own space (chat, ideas, venue page, menu and events) content is moderated by the business\'s management. Across the service the operator moderates.',
        'Report inappropriate content in chat and ideas with Report and block a user with Block. Reports are visible to the business\'s management. Anyone can report illegal content without an account on the [[nahlasit|Report content]] page.',
        'A person reviews every notice; we use no automated filters or algorithmic content decisions. We handle reports without undue delay, usually within 24 hours on working days.',
        'For breaches we may remove or disable content, remove a user from a business and, for serious or repeated breaches, suspend or close the account. Measures are proportionate; for minor breaches we warn first.',
        'Anyone affected receives a statement of reasons: what we restricted, based on which facts, under which rule or law and how to challenge it. You can object within 6 months by replying to the decision email or writing to the contact address; a person reviews the objection and we tell you the outcome. Your right to go to court is not affected.',
        'If we become aware of content suggesting a criminal offence threatening the life or safety of persons, we notify law enforcement authorities.',
      ] },
      { id: 'nahlaseni', h: 'Notices of illegal content', p: [
        'On the [[nahlasit|Report content]] page, explain why you consider the content illegal, where exactly it is (link or description), your name and email (not required for notices of child abuse), and a statement that the notice is made in good faith and is accurate to your knowledge. We confirm receipt and then send the decision with information on redress.',
      ] },
      { id: 'kontaktni-misto', h: 'Point of contact', p: [
        `Single point of contact under the Digital Services Act (Articles 11 and 12) for Member State authorities, the European Commission, the European Board for Digital Services and users: ${f.emailPodpory}, phone ${f.telefon}. We communicate in Czech and English.`,
      ] },
      { id: 'novinky', h: 'News and commercial communications', p: [
        'News and offers from venues are sent only with your explicit consent. The sender is the venue named in the message. Withdraw consent in your profile or via the link in every email. Service messages (booking confirmations, password reset, shift notices) are not commercial communications and are sent regardless of this consent.',
      ] },
      { id: 'dostupnost', h: 'Availability, defects and changes', li: [
        'We operate the apps with professional care and aim for continuous operation, but outages and maintenance can happen. We may develop and change features.',
        `Please report errors or defects to ${f.emailPodpory}. We handle them without undue delay, within ${LHUTY.vadyDni} days at the latest. Your statutory rights are not affected.`,
        'We announce material changes to these terms in advance in the app or by email and ask for your new consent in the app. If you disagree, you can delete your account at any time.',
      ] },
      { id: 'ukonceni', h: 'Termination', li: [
        'You can end the contract at any time by deleting your account. As a consumer you may also withdraw within 14 days of creating the account without giving a reason (write to us or delete the account); the service is free, so nothing is refunded or charged.',
        `For serious breaches we may close the account and tell you why. A guest account unused for ${RETENCE_TEXT.neaktivniHostMesicu} months is anonymised; ${RETENCE_TEXT.upozorneniPredemDni} days before, we email you an option to keep it.`,
      ] },
      { id: 'odpovednost', h: 'Liability', p: [
        'We are liable for damage as provided by law. We are not responsible for the venues\' performance (benefits, bookings, orders), for content added by other users, or for how a business handles data of its team and guests where it is the controller. This does not limit your statutory rights.',
      ] },
      { id: 'spory', h: 'Complaints and disputes', p: [
        `Send complaints to ${f.emailPodpory}. The Czech Trade Inspection Authority is competent for out-of-court resolution of consumer disputes (adr.coi.gov.cz). Consumer protection is supervised by the Czech Trade Inspection Authority and data protection by the Office for Personal Data Protection. Czech law applies; the protection given to you by the law of your country of residence is not affected.`,
      ] },
    ],
  };
}
