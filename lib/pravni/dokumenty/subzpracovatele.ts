// Seznam subzpracovatelů (příloha zpracovatelské smlouvy, čl. 28 odst. 2 a 4 GDPR) — /subzpracovatele.
//
// Podle kódu (package.json, lib/email.ts, lib/push.ts, lib/walletGoogle.ts, lib/billing.ts,
// app/api/mcp) a ověřených dokumentů poskytovatelů (21. 10. 2026):
//  * Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723 — DPA vercel.com/legal/dpa (SCC 2021/914),
//    certifikace DPF podle vercel.com/kb/guide/is-vercel-certified-under-dpf; DPA platí jen pro plán Pro;
//  * Neon (Databricks), projekt v regionu aws-eu-central-1 (ověřeno přes Neon API);
//  * Resend = Plus Five Five, Inc., 2261 Market Street #5039, San Francisco — DPA resend.com/legal/dpa
//    (SCC + DPF), oznámení nových subzpracovatelů 14 dní;
//  * Apple (APNs, aktualizace karet Wallet), Google (FCM, Google Peněženka) — obecně podle jejich podmínek;
//  * Anthropic — jen pokud provozovatel používá MCP správy platformy (app/api/mcp) s ostrými daty; viz docs/PRAVNI.md.
// Při změně: oznámit vlastníkům podniků 30 dní předem (LHUTY.subzpracovatelDni) a zapsat do „Historie změn".

import type { Firma } from '../../firma.ts';
import { LHUTY, UCINNOST } from '../lhuty.ts';
import type { Dokument } from './typy.ts';

export function subzpracovateleCs(f: Firma): Dokument {
  return {
    titulek: 'Subzpracovatelé',
    uvod: `Poskytovatelé, kteří pro Managero zpracovávají osobní údaje. Seznam je přílohou [[zpracovatelska-smlouva|zpracovatelské smlouvy]] a týká se i údajů, které zpracováváme jako správce (viz [[soukromi|zásady ochrany osobních údajů]]). Provozovatel: ${f.nazev}, IČO ${f.ico}.`,
    aktualizace: UCINNOST.cs,
    sekce: [
      { id: 'seznam', h: 'Seznam', li: [
        'Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA. Účel: hosting webu a aplikace, serverové funkce, plánované úlohy a úložiště souborů (fotky, účtenky, přílohy). Umístění: serverové funkce v regionu Frankfurt (Německo), doručování statického obsahu přes globální síť. Záruka: EU–US Data Privacy Framework (Vercel je certifikován) a standardní smluvní doložky ve zpracovatelské smlouvě Vercelu.',
        'Neon (skupina Databricks, USA). Účel: databáze PostgreSQL se všemi daty aplikace. Umístění: Evropská unie, infrastruktura Amazon Web Services v regionu eu-central-1 (Frankfurt, Německo). Záruka: zpracovatelská smlouva poskytovatele se standardními smluvními doložkami pro případ přístupu z USA.',
        'Plus Five Five, Inc. (služba Resend), 2261 Market Street #5039, San Francisco, CA 94114, USA. Účel: odesílání e-mailů (obnovení hesla, pozvánky, potvrzení rezervací, novinky podniků, zálohy, upozornění na platby). Záruka: EU–US Data Privacy Framework a standardní smluvní doložky.',
        'Apple (služba Apple Push Notification service), USA. Účel: doručování oznámení na iPhone a aktualizace věrnostních karet v Apple Wallet. Předává se jen token zařízení a text oznámení. Záruka: EU–US Data Privacy Framework, případně standardní smluvní doložky podle podmínek Apple.',
        'Google (Firebase Cloud Messaging a Google Peněženka), USA a Irsko. Účel: doručování oznámení na Android a věrnostní karta v Google Peněžence, pokud si ji host přidá (kód karty, název podniku, stav razítek). Záruka: EU–US Data Privacy Framework, případně standardní smluvní doložky podle podmínek Google.',
        'Anthropic, PBC, USA. Účel: AI asistent, přes který provozovatel obsluhuje správu platformy a podporu. Dostane jen údaje nutné k vyřízení konkrétního požadavku (název podniku, jména, e-maily a role jeho uživatelů, stav předplatného). Záruka: standardní smluvní doložky ve zpracovatelských podmínkách Anthropic.',
      ] },
      { id: 'samostatni-spravci', h: 'Platby: Stripe', p: [
        'Stripe Payments Europe, Limited, 1 Grand Canal Street Lower, Grand Canal Dock, Dublin, D02 H210, Irsko. Zpracovává platby předplatného a vystavuje faktury podnikům. U platebních údajů (karta, prevence podvodů, plnění předpisů o platebních službách) je Stripe samostatným správcem podle svých zásad; u fakturačních údajů zákazníka pro nás jedná jako zpracovatel. Týká se jen podniků, ne zaměstnanců ani hostů. Pro přenos do USA v rámci skupiny Stripe platí EU–US Data Privacy Framework a standardní smluvní doložky.',
      ] },
      { id: 'integrace', h: 'Napojení, která si zapíná podnik', p: [
        'Tito poskytovatelé nejsou našimi subzpracovateli. Podnik s nimi má vlastní smlouvu a Managero jim předává data jen na jeho pokyn, když napojení sám zapne:',
      ], li: [
        'pokladní systém Storyous (prodeje, položky účtenek a jejich přiřazení k věrnostní kartě),',
        'plánovací aplikace Noisium (projekty a úkoly, které do ní podnik pošle).',
      ], po: [
        'Oznámení v prohlížeči (web push) doručuje služba, kterou určuje prohlížeč uživatele (například Google u Chrome, Mozilla u Firefoxu, Apple u Safari). Předává se jen šifrovaný obsah oznámení a adresa odběru.',
      ] },
      { id: 'zmeny', h: 'Oznamování změn', p: [
        `Přidání nebo nahrazení subzpracovatele oznamujeme vlastníkům podniků e-mailem a na této stránce nejméně ${LHUTY.subzpracovatelDni} dní předem. Podnik může do ${LHUTY.subzpracovatelDni} dní vznést námitku na ${f.emailPodpory}; postup upravuje článek 10 [[zpracovatelska-smlouva|zpracovatelské smlouvy]].`,
      ] },
      { id: 'historie', h: 'Historie změn', li: [
        `${UCINNOST.cs}: první zveřejnění seznamu.`,
      ] },
    ],
  };
}

export function subzpracovateleEn(f: Firma): Dokument {
  return {
    titulek: 'Subprocessors',
    uvod: `Providers that process personal data for Managero. This list is an annex to the [[zpracovatelska-smlouva|data processing agreement]] and also covers data we process as controller (see the [[soukromi|privacy policy]]). Operator: ${f.nazev}, company ID ${f.ico}.`,
    aktualizace: UCINNOST.en,
    sekce: [
      { id: 'seznam', h: 'List', li: [
        'Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA. Purpose: hosting of the website and app, server functions, scheduled jobs and file storage (photos, receipts, attachments). Location: server functions in the Frankfurt region (Germany), static content delivered through a global network. Safeguard: EU–US Data Privacy Framework (Vercel is certified) and standard contractual clauses in Vercel\'s data processing agreement.',
        'Neon (Databricks group, USA). Purpose: PostgreSQL database holding all app data. Location: European Union, Amazon Web Services infrastructure in the eu-central-1 region (Frankfurt, Germany). Safeguard: the provider\'s data processing agreement with standard contractual clauses for any access from the USA.',
        'Plus Five Five, Inc. (Resend), 2261 Market Street #5039, San Francisco, CA 94114, USA. Purpose: sending email (password reset, invitations, booking confirmations, venue news, backups, payment notices). Safeguard: EU–US Data Privacy Framework and standard contractual clauses.',
        'Apple (Apple Push Notification service), USA. Purpose: delivering notifications to iPhones and updating loyalty cards in Apple Wallet. Only the device token and notification text are transferred. Safeguard: EU–US Data Privacy Framework or standard contractual clauses under Apple\'s terms.',
        'Google (Firebase Cloud Messaging and Google Wallet), USA and Ireland. Purpose: delivering notifications to Android and the loyalty card in Google Wallet if a guest adds it (card code, venue name, stamp status). Safeguard: EU–US Data Privacy Framework or standard contractual clauses under Google\'s terms.',
        'Anthropic, PBC, USA. Purpose: an AI assistant the operator uses for platform administration and support. It receives only the data needed for a specific request (business name, names, emails and roles of its users, subscription status). Safeguard: standard contractual clauses in Anthropic\'s data processing terms.',
      ] },
      { id: 'samostatni-spravci', h: 'Payments: Stripe', p: [
        'Stripe Payments Europe, Limited, 1 Grand Canal Street Lower, Grand Canal Dock, Dublin, D02 H210, Ireland. Processes subscription payments and issues invoices to businesses. For payment data (card, fraud prevention, payment services regulation) Stripe is an independent controller under its own policy; for customer billing data it acts as our processor. It concerns businesses only, not staff or guests. Transfers to the USA within the Stripe group rely on the EU–US Data Privacy Framework and standard contractual clauses.',
      ] },
      { id: 'integrace', h: 'Integrations enabled by the business', p: [
        'These providers are not our subprocessors. The business has its own contract with them and Managero sends them data only on its instruction when it enables the integration:',
      ], li: [
        'Storyous point of sale (sales, receipt items and their link to a loyalty card),',
        'Noisium planning app (projects and tasks the business sends to it).',
      ], po: [
        'Browser notifications (web push) are delivered by the service chosen by the user\'s browser (for example Google for Chrome, Mozilla for Firefox, Apple for Safari). Only the encrypted notification content and subscription address are transferred.',
      ] },
      { id: 'zmeny', h: 'Notice of changes', p: [
        `We announce an addition or replacement of a subprocessor to business owners by email and on this page at least ${LHUTY.subzpracovatelDni} days in advance. A business may object within ${LHUTY.subzpracovatelDni} days at ${f.emailPodpory}; the procedure is in section 10 of the [[zpracovatelska-smlouva|data processing agreement]].`,
      ] },
      { id: 'historie', h: 'Change history', li: [
        `${UCINNOST.en}: first publication of the list.`,
      ] },
    ],
  };
}
