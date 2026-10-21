// Šablona „Informace pro zaměstnance" — /informace-pro-zamestnance. Podnik (zaměstnavatel,
// správce) ji upraví a předá týmu: čl. 13 GDPR a § 316 odst. 3 zákoníku práce (informování
// o kontrole). Hranaté závorky jsou místa k doplnění podnikem (záměrně ne {{…}}, která by
// sonda brala jako nevyplněné údaje provozovatele).

import type { Firma } from '../../firma.ts';
import { RETENCE_TEXT, UCINNOST } from '../lhuty.ts';
import type { Dokument } from './typy.ts';

export function informaceCs(f: Firma): Dokument {
  return {
    titulek: 'Informace pro zaměstnance',
    uvod: 'Šablona pro podniky: co Managero o lidech v týmu zpracovává. Podnik je zaměstnavatel a správce těchto údajů, proto má tým informovat on. Text níž si zkopírujte, doplňte údaje v hranatých závorkách, smažte, co nepoužíváte, a předejte týmu (například e-mailem nebo jako oznámení v aplikaci).',
    aktualizace: UCINNOST.cs,
    sekce: [
      { id: 'kdo', h: 'Kdo vaše údaje zpracovává', p: [
        'Správcem je [název podniku nebo jméno zaměstnavatele], IČO [IČO], [adresa], kontakt [e-mail, telefon]. K plánování a evidenci práce používáme aplikaci Managero. Jejím provozovatelem je ' + `${f.nazev}, IČO ${f.ico}` + ', který údaje zpracovává jen pro nás jako zpracovatel podle zpracovatelské smlouvy; údaje leží v databázi v Evropské unii.',
      ] },
      { id: 'co', h: 'Jaké údaje a proč', li: [
        'Jméno, e-mail, telefon, pozice a role: abyste měli účet a mohli jsme vás kontaktovat (plnění pracovní smlouvy).',
        'Směny, dostupnost, žádosti o volno a docházka (příchody, odchody, přestávky): plánování práce a evidence pracovní doby, kterou nám ukládá zákoník práce (právní povinnost).',
        '[Jen pokud zapnete píchání u podniku:] Při příchodu z telefonu aplikace ověří, že jste do [100/200/500] m od podniku. Ukládá se jen výsledek a vzdálenost v metrech, ne vaše souřadnice; poloha se nesleduje průběžně ani na pozadí. Důvod: [například ověření, že příchod zapisuje člověk na pracovišti] (oprávněný zájem a § 316 zákoníku práce).',
        'Hodinová sazba, odpracované hodiny, prémie a výplatní podklady: výpočet mzdy (plnění smlouvy a právní povinnost). Vidí je jen vedení.',
        '[Jen pokud používáte:] Body, odměny, hodnocení směn a napomenutí (případně s fotkou, kterou přiloží vedení, a s vaším vyjádřením). Nenárokovou prémii můžeme nepřiznat nebo snížit jen tehdy, když nesplníte kritéria, která jsme předem stanovili v [mzdovém výměru nebo vnitřním předpisu] pro daný měsíc. Pokuty neukládáme. O odměnách a prémiích rozhoduje vždy člověk ve vedení, aplikace jen počítá a navrhuje.',
        'Zprávy v týmovém chatu, fotky, úkoly, uzávěrky a nápady: komunikace a organizace provozu (oprávněný zájem). Soukromé zprávy mezi kolegy vedení nevidí.',
      ] },
      { id: 'komu', h: 'Komu údaje předáváme', p: [
        'Provozovateli aplikace Managero a jeho poskytovatelům (hosting, databáze, e-maily, doručování oznámení), jejichž seznam je na stránce [[subzpracovatele|Subzpracovatelé]]; [dále například mzdové účetní, úřadům podle zákona].',
      ] },
      { id: 'jak-dlouho', h: 'Jak dlouho', p: [
        `Po dobu pracovního vztahu a poté po dobu, kterou ukládají předpisy (například evidence pracovní doby a mzdové listy) [doplňte lhůty]. Po smazání vašeho účtu zůstanou provozní záznamy bez jména. Protokol změn v aplikaci se maže po ${RETENCE_TEXT.auditLogLet} letech.`,
      ] },
      { id: 'prava', h: 'Vaše práva', p: [
        'Máte právo na přístup ke svým údajům, opravu, výmaz, omezení zpracování, přenositelnost a vznést námitku proti zpracování na základě oprávněného zájmu. Údaje svého účtu si stáhnete v aplikaci (Nastavení → Data a soukromí). Ostatní žádosti posílejte na [kontakt zaměstnavatele]. Stížnost můžete podat u Úřadu pro ochranu osobních údajů (uoou.gov.cz).',
      ] },
    ],
  };
}

export function informaceEn(f: Firma): Dokument {
  return {
    titulek: 'Information for staff',
    uvod: 'A template for businesses: what Managero processes about team members. The business is the employer and controller of this data, so it must inform its team. Copy the text below, fill in the details in square brackets, remove what you do not use and give it to your team (for example by email or as an announcement in the app).',
    aktualizace: UCINNOST.en,
    sekce: [
      { id: 'kdo', h: 'Who processes your data', p: [
        'The controller is [business or employer name], company ID [ID], [address], contact [email, phone]. We use the Managero app to plan and record work. It is operated by ' + `${f.nazev}, company ID ${f.ico}` + ', who processes the data only for us as processor under a data processing agreement; the data is stored in a database in the European Union.',
      ] },
      { id: 'co', h: 'What data and why', li: [
        'Name, email, phone, job title and role: so you have an account and we can contact you (performance of the employment contract).',
        'Shifts, availability, time-off requests and attendance (clock-in, clock-out, breaks): planning work and recording working time required by the Labour Code (legal obligation).',
        '[Only if you enable clock-in at the venue:] When clocking in from a phone, the app checks that you are within [100/200/500] m of the venue. Only the result and the distance in metres are stored, not your coordinates; location is never tracked continuously or in the background. Reason: [for example verifying that the clock-in is made by a person at the workplace] (legitimate interest and section 316 of the Labour Code).',
        'Hourly rate, hours worked, bonuses and payroll data: calculating pay (contract and legal obligation). Visible to management only.',
        '[Only if you use them:] Points, rewards, shift reviews and warnings (possibly with a photo attached by management, and with your response). We may withhold or reduce a discretionary bonus only if you do not meet the criteria we set in advance in [pay statement or internal rules] for the month. We do not impose fines. Decisions on rewards and bonuses are always made by a person in management; the app only calculates and suggests.',
        'Team chat messages, photos, tasks, closings and ideas: communication and organising operations (legitimate interest). Management cannot see private messages between colleagues.',
      ] },
      { id: 'komu', h: 'Who receives the data', p: [
        'The operator of the Managero app and its providers (hosting, database, email, notification delivery), listed on the [[subzpracovatele|Subprocessors]] page; [also for example payroll accountants, authorities as required by law].',
      ] },
      { id: 'jak-dlouho', h: 'How long', p: [
        `For the duration of employment and afterwards as long as the law requires (for example working time records and payroll sheets) [fill in periods]. After your account is deleted, operational records remain without your name. The app's change log is deleted after ${RETENCE_TEXT.auditLogLet} years.`,
      ] },
      { id: 'prava', h: 'Your rights', p: [
        'You have the right of access, rectification, erasure, restriction, portability and to object to processing based on legitimate interest. Download your account data in the app (Settings → Data and privacy). Send other requests to [employer contact]. You may complain to the Office for Personal Data Protection (uoou.gov.cz).',
      ] },
    ],
  };
}
