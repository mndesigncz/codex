// Smazání účtu a dat — /smazat-ucet (Google Play: webová stránka pro smazání bez instalace,
// co se maže, co zůstává a jak dlouho; Apple 5.1.1(v)). Odpovídá lib/smazaniUctu.ts.

import type { Firma } from '../../firma.ts';
import { LHUTY, UCINNOST } from '../lhuty.ts';
import type { Dokument } from './typy.ts';

export function smazatCs(f: Firma): Dokument {
  return {
    titulek: 'Smazání účtu a dat',
    uvod: `Tato stránka platí pro aplikace Managero (pro podniky) a Managero client (pro hosty), které provozuje ${f.nazev}, IČO ${f.ico}. Smazat účet můžete v aplikaci, nebo tady na webu, i když aplikaci nemáte nainstalovanou.`,
    aktualizace: UCINNOST.cs,
    sekce: [
      { id: 'aplikace', h: 'Přímo v aplikaci', p: ['Managero client: Moje → Smazat účet. Managero: Nastavení → Data a soukromí → Smazat účet. Smazání potvrdíte heslem.'] },
      { id: 'web', h: 'Na webu bez přihlášení', p: ['Zadejte e-mail účtu ve formuláři níže. Pošleme na něj odkaz pro potvrzení a teprve po jeho otevření se účet smaže. Bez přístupu k e-mailu účtu žádost nikdo cizí potvrdit nemůže.'] },
      { id: 'host', h: 'Co se smaže u hosta', li: [
        'Jméno, e-mail, telefon, datum narození, heslo a oznámení zařízení.',
        'Věrnostní karta, členství v podnicích, body, razítka, kredit, kupony a hodnocení.',
        'Budoucí rezervace se zruší. Objednávky a rezervace, které už podnik vyřídil, u podniku zůstanou jako anonymní provozní záznam bez jména a bez poznámky.',
      ] },
      { id: 'provoz', h: 'Co se smaže u zaměstnance a vedení', li: [
        'Jméno, e-mail, telefon, heslo, avatar, oznámení zařízení a členství v podnicích.',
        'Směny, docházka, uzávěrky a zprávy, které podnik vede jako správce, v podniku zůstanou kvůli jeho povinnostem (mzdy, účetnictví), ale bez vašeho jména: zobrazí se jako Smazaný uživatel.',
        'Vlastník podniku: účet nejde smazat samostatně, dokud v podniku zůstávají další lidé. Můžete ale smazat účet i s podnikem (napíšete slovo SMAZAT); smažou se tím všechny podniky, které vlastníte. Smazání podniku hned zruší předplatné (bez vrácení zaplacené částky), smaže zákazníka ve Stripe a odstraní všechna data podniku včetně nahraných souborů. Před smazáním si stáhněte zálohu. Na webu stejný odkaz z e-mailu nabídne druhý krok: heslo a slovo SMAZAT.',
        'Pozvánky s vaším e-mailem a soubory, které patří jen vám, se smažou. Text v protokolu akcí a v nahlášeních k vám se vymaže, PIN, hodinová sazba a limity směn se vynulují.',
      ] },
      { id: 'kdy', h: 'Kdy a co zůstane', p: [
        `Smazání proběhne ihned po potvrzení. Zálohy u poskytovatelů se přepíšou nejpozději do ${LHUTY.zalohyDni} dnů. Zákonná evidence, kterou musíme zachovat (záznamy o fakturaci podniku a faktury ve Stripe, bez vašich osobních údajů), zůstává po dobu, kterou ukládají daňové a účetní předpisy. Chat a návrhy, které jste sdíleli v podniku, zůstanou podniku jako zpráva od Smazaného uživatele.`,
        `Dotazy: ${f.emailPodpory}, telefon ${f.telefon}. Víc o tom, co a jak dlouho uchováváme, je v [[soukromi|zásadách ochrany osobních údajů]].`,
      ] },
    ],
  };
}

export function smazatEn(f: Firma): Dokument {
  return {
    titulek: 'Delete your account and data',
    uvod: `This page applies to the Managero (for businesses) and Managero client (for guests) apps operated by ${f.nazev}, company ID ${f.ico}. You can delete your account in the app, or here on the web even if the app is not installed.`,
    aktualizace: UCINNOST.en,
    sekce: [
      { id: 'aplikace', h: 'In the app', p: ['Managero client: My page → Delete account. Managero: Settings → Data and privacy → Delete account. You confirm with your password.'] },
      { id: 'web', h: 'On the web without signing in', p: ['Enter the account email in the form below. We send a confirmation link to it, and the account is deleted only after you open it. Nobody without access to the account email can confirm a request.'] },
      { id: 'host', h: 'What is deleted for a guest', li: [
        'Name, email, phone, date of birth, password and device notification tokens.',
        'Loyalty card, memberships, points, stamps, credit, coupons and ratings.',
        'Future bookings are cancelled. Orders and bookings the venue already handled stay at the venue as an anonymous operational record without a name or note.',
      ] },
      { id: 'provoz', h: 'What is deleted for staff and management', li: [
        'Name, email, phone, password, avatar, device notification tokens and business memberships.',
        'Shifts, attendance, closings and messages that the business keeps as controller stay in the business because of its obligations (payroll, accounting), but without your name: they appear as a deleted user.',
        'Business owner: the account cannot be deleted on its own while other people remain in the business. You can delete the account together with the business (by typing the word SMAZAT); this deletes all businesses you own. Deleting the business cancels the subscription immediately (without refunding what was paid), deletes the Stripe customer and removes all business data including uploaded files. Download a backup first. On the web the same email link offers a second step: password and the word SMAZAT.',
        'Invitations with your email and files that belong only to you are deleted. Free text about you in the action log and in reports is cleared; PIN, hourly rate and shift limits are reset.',
      ] },
      { id: 'kdy', h: 'When, and what remains', p: [
        `Deletion happens right after confirmation. Backups at providers are overwritten within ${LHUTY.zalohyDni} days at the latest. Records we must keep by law (business billing records and Stripe invoices, without your personal data) remain for as long as tax and accounting rules require. Chat messages and suggestions you shared in a business stay with the business as a message from a deleted user.`,
        `Questions: ${f.emailPodpory}, phone ${f.telefon}. More about what we keep and for how long is in the [[soukromi|privacy policy]].`,
      ] },
    ],
  };
}
