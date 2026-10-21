// Podpora a kontakt — /podpora. E-mail a telefon (Stripe chce víc kanálů, § 1820 OZ telefon),
// kontaktní místo DSA čl. 11/12, identifikace provozovatele (§ 435 OZ).

import type { Firma } from '../../firma.ts';
import { identifikace } from '../../firma.ts';
import { LHUTY, UCINNOST } from '../lhuty.ts';
import type { Dokument } from './typy.ts';

export function podporaCs(f: Firma): Dokument {
  return {
    titulek: 'Podpora',
    uvod: 'Potřebujete pomoc s aplikací Managero nebo Managero client? Tady najdete kontakt i odpovědi na nejčastější věci.',
    aktualizace: UCINNOST.cs,
    sekce: [
      { id: 'kontakt', h: 'Kontakt', li: [
        `E-mail: ${f.emailPodpory}. Odpovídáme zpravidla do ${LHUTY.podporaPracDni} pracovních dnů.`,
        `Telefon: ${f.telefon}.`,
        `Adresa: ${f.adresa}.`,
      ], po: [
        'Uveďte e-mail účtu a v jaké aplikaci se problém děje. Heslo nikdy nepište.',
        identifikace(f, 'cs'),
        `Kontaktní místo podle Aktu o digitálních službách (čl. 11 a 12) pro orgány členských států, Evropskou komisi i uživatele: ${f.emailPodpory}. Komunikujeme česky a anglicky.`,
      ] },
      { id: 'heslo', h: 'Zapomenuté heslo', p: ['Na přihlašovací obrazovce zvolte Zapomenuté heslo. Pošleme odkaz na obnovení, který platí krátce a dá se použít jednou.'] },
      { id: 'smazani', h: 'Smazání účtu', p: ['V aplikaci Managero: Nastavení → Data a soukromí → Smazat účet. V Managero client: Moje → Smazat účet. Bez aplikace: stránka [[smazat-ucet|Smazání účtu]].'] },
      { id: 'nahlaseni', h: 'Nahlášení obsahu nebo uživatele', p: [
        `V chatu a u nápadů je u každé zprávy volba Nahlásit a u uživatele Zablokovat. Vážné případy napište také na ${f.emailPodpory}.`,
        'Nezákonný obsah (například na stránce podniku, v nabídce nebo v akci) může kdokoli oznámit i bez účtu na stránce [[nahlasit|Nahlásit obsah]]. Oznámení posoudí člověk, oznamovatel dostane potvrzení i rozhodnutí a autor odstraněného obsahu odůvodnění s možností se ohradit.',
      ] },
      { id: 'hoste', h: 'Pro hosty', li: [
        'Razítka a body přidává obsluha u kasy po načtení vaší karty, aplikace je sama nepřidává.',
        'Objednávka od stolu vyžaduje QR kód ze stolu a povolení polohy v podnicích, které si to zapnuly.',
        'Novinky od podniků vypnete v Moje → Oznámení a soukromí.',
        'Výhody, rezervace a objednávky řeší podnik; pravidla jsou v [[podminky|podmínkách užívání]].',
      ] },
      { id: 'podniky', h: 'Pro podniky', li: [
        'Nastavení podniku, role, tarify a fakturace se spravují na webu po přihlášení. Mobilní aplikace předplatné nenabízí ani nespravují.',
        'Smluvní dokumenty: [[obchodni-podminky|Obchodní podmínky]], [[zpracovatelska-smlouva|Zpracovatelská smlouva]], [[subzpracovatele|Subzpracovatelé]], [[zruseni-predplatneho|Zrušení předplatného a vrácení peněz]] a [[/#cenik|ceník]].',
        'Šablona pro informování týmu: [[informace-pro-zamestnance|Informace pro zaměstnance]].',
      ] },
    ],
  };
}

export function podporaEn(f: Firma): Dokument {
  return {
    titulek: 'Support',
    uvod: 'Need help with Managero or Managero client? Here is how to reach us and answers to common questions. The apps are currently available mainly in Czech.',
    aktualizace: UCINNOST.en,
    sekce: [
      { id: 'kontakt', h: 'Contact', li: [
        `Email: ${f.emailPodpory}. We usually reply within ${LHUTY.podporaPracDni} working days.`,
        `Phone: ${f.telefon}.`,
        `Address: ${f.adresa}, Czech Republic.`,
      ], po: [
        'Include the account email and which app the problem is in. Never send your password.',
        identifikace(f, 'en'),
        `Single point of contact under the Digital Services Act (Articles 11 and 12) for Member State authorities, the European Commission and users: ${f.emailPodpory}. We communicate in Czech and English.`,
      ] },
      { id: 'heslo', h: 'Forgot password', p: ['On the sign-in screen choose Forgot password. We email a reset link that is valid for a short time and can be used once.'] },
      { id: 'smazani', h: 'Delete account', p: ['In Managero: Settings → Data and privacy → Delete account. In Managero client: My page → Delete account. Without the app: the [[smazat-ucet|Delete account]] page.'] },
      { id: 'nahlaseni', h: 'Report content or a user', p: [
        `In chat and ideas every message has Report and every user can be blocked. For serious cases also write to ${f.emailPodpory}.`,
        'Anyone can report illegal content (for example on a venue page, in a menu or an event) without an account on the [[nahlasit|Report content]] page. A person reviews every notice; the reporter receives a confirmation and the decision, and the author of removed content receives a statement of reasons with a way to object.',
      ] },
      { id: 'hoste', h: 'For guests', li: [
        'Stamps and points are added by staff at the till after scanning your card; the app does not add them itself.',
        'Table ordering requires the QR code on the table and location permission at venues that enabled it.',
        'Turn off news from venues in My page → Notifications and privacy.',
        'Benefits, bookings and orders are handled by the venue; see the [[podminky|terms of use]].',
      ] },
      { id: 'podniky', h: 'For businesses', li: [
        'Business settings, roles, plans and billing are managed on the web after signing in. The mobile apps neither offer nor manage subscriptions.',
        'Contract documents: [[obchodni-podminky|Business terms]], [[zpracovatelska-smlouva|Data processing agreement]], [[subzpracovatele|Subprocessors]], [[zruseni-predplatneho|Cancellation and refunds]] and the [[/#cenik|price list]].',
        'Template for informing your team: [[informace-pro-zamestnance|Information for staff]].',
      ] },
    ],
  };
}
