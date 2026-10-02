// Texty e-mailů pro dodavatele a pozvané (kolo 76): objednávka a pozvánka do týmu.
//
// E-mail nejde uživateli přes slovník aplikace (server ho skládá v okamžiku
// odeslání), proto jsou věty tady, po jazycích, jako obyčejná data. Čeština je
// původní text. Příjemce je cizí člověk (dodavatel, pozvaný), proto formální
// oslovení: německy „Sie“, slovensky vykanie, polsky neutrálně. Překlady jsou
// strojové a čekají na kontrolu rodilým mluvčím.
//
// Hodnoty (jména, e-maily) se vkládají ESCAPOVANÉ až ve složeném HTML: `sazejHtml`
// nejdřív dosadí zástupné značky, escapuje celou větu a teprve pak značky nahradí
// hotovým HTML (např. <strong>). Bez toho by jméno s `<` prošlo do e-mailu.
//
// Digest (denní souhrn) se zatím nepřekládá: jeho tělo skládá route z mnoha českých
// vět, a napůl přeložený e-mail je horší než celý český.

import { formatuj } from './core.ts';
import type { Jazyk } from './config.ts';

type Texty = Record<Jazyk, string>;

export const EMAIL = {
  objednavkaPredmet: {
    cs: 'Objednávka — {podnik} ({datum})', en: 'Order — {podnik} ({datum})', de: 'Bestellung — {podnik} ({datum})',
    sk: 'Objednávka — {podnik} ({datum})', pl: 'Zamówienie — {podnik} ({datum})',
  },
  objednavkaNadpis: {
    cs: 'Objednávka — {podnik}', en: 'Order — {podnik}', de: 'Bestellung — {podnik}', sk: 'Objednávka — {podnik}', pl: 'Zamówienie — {podnik}',
  },
  objednavkaOdeslano: {
    cs: 'Odesláno z aplikace Managero.', en: 'Sent from the Managero app.', de: 'Gesendet aus der Managero-App.',
    sk: 'Odoslané z aplikácie Managero.', pl: 'Wysłano z aplikacji Managero.',
  },
  objednavkaOdpoved: {
    cs: 'Odpovězte prosím na tento e-mail s potvrzením a termínem dodání — odpověď dorazí na {adresa}.',
    en: 'Please reply to this email with a confirmation and a delivery date — your reply will reach {adresa}.',
    de: 'Bitte antworten Sie auf diese E-Mail mit einer Bestätigung und dem Liefertermin – Ihre Antwort erreicht {adresa}.',
    sk: 'Odpovedzte prosím na tento e-mail s potvrdením a termínom dodania — odpoveď príde na {adresa}.',
    pl: 'Prosimy o odpowiedź na tę wiadomość z potwierdzeniem i terminem dostawy — odpowiedź trafi na adres {adresa}.',
  },
  objednavkaBezOdpovedi: {
    cs: 'Potvrzení a termín dodání pošlete prosím na kontakt podniku.',
    en: 'Please send the confirmation and delivery date to the business\'s contact.',
    de: 'Bitte senden Sie die Bestätigung und den Liefertermin an den Kontakt des Betriebs.',
    sk: 'Potvrdenie a termín dodania pošlite prosím na kontakt podniku.',
    pl: 'Potwierdzenie i termin dostawy prosimy przesłać na kontakt lokalu.',
  },
  pozvankaPredmet: {
    cs: 'Pozvánka do týmu {tym}', en: 'Invitation to the team {tym}', de: 'Einladung in das Team {tym}',
    sk: 'Pozvánka do tímu {tym}', pl: 'Zaproszenie do zespołu {tym}',
  },
  pozvankaNadpis: {
    cs: 'Pozvánka do týmu', en: 'Team invitation', de: 'Einladung in ein Team', sk: 'Pozvánka do tímu', pl: 'Zaproszenie do zespołu',
  },
  pozvankaText: {
    cs: '{kdo} vás zve do týmu {tym} v aplikaci pro správu podniku.',
    en: '{kdo} invites you to the team {tym} in the business management app.',
    de: '{kdo} lädt Sie in das Team {tym} in der App zur Betriebsverwaltung ein.',
    sk: '{kdo} vás pozýva do tímu {tym} v aplikácii na správu podniku.',
    pl: '{kdo} zaprasza Cię do zespołu {tym} w aplikacji do zarządzania lokalem.',
  },
  pozvankaPokyn: {
    cs: 'Klikněte na tlačítko níže a vytvořte si účet zaměstnance.',
    en: 'Click the button below to create your employee account.',
    de: 'Klicken Sie auf die Schaltfläche unten und erstellen Sie Ihr Mitarbeiterkonto.',
    sk: 'Kliknite na tlačidlo nižšie a vytvorte si účet zamestnanca.',
    pl: 'Kliknij przycisk poniżej, aby utworzyć konto pracownika.',
  },
  pozvankaTlacitko: {
    cs: 'Přijmout pozvánku →', en: 'Accept the invitation →', de: 'Einladung annehmen →', sk: 'Prijať pozvánku →', pl: 'Przyjmij zaproszenie →',
  },
  pozvankaOdkaz: {
    cs: 'Pokud tlačítko nefunguje, otevřete: {url}', en: 'If the button doesn\'t work, open: {url}',
    de: 'Falls die Schaltfläche nicht funktioniert, öffnen Sie: {url}', sk: 'Ak tlačidlo nefunguje, otvorte: {url}',
    pl: 'Jeśli przycisk nie działa, otwórz: {url}',
  },
  novinkyPaticka: {
    cs: 'Tuhle zprávu dostáváš, protože jsi členem klubu {podnik} a souhlasil(a) jsi s novinkami.',
    en: 'You are receiving this because you are a member of the {podnik} club and agreed to news.',
    de: 'Du erhältst diese Nachricht, weil du Mitglied im Club {podnik} bist und Neuigkeiten zugestimmt hast.',
    sk: 'Túto správu dostávaš, pretože si členom klubu {podnik} a súhlasil(a) si s novinkami.',
    pl: 'Dostajesz tę wiadomość, bo jesteś członkiem klubu {podnik} i zgodziłeś(-aś) się na nowości.',
  },
  novinkyOdhlasit: {
    cs: 'Odhlásit se z e-mailů', en: 'Unsubscribe from emails', de: 'Von E-Mails abmelden',
    sk: 'Odhlásiť sa z e-mailov', pl: 'Wypisz się z e-maili',
  },
  novinkyKupon: {
    cs: 'Kupon máš v aplikaci mezi kupony.', en: 'Your coupon is in the app, under coupons.', de: 'Dein Gutschein ist in der App unter Gutscheine.',
    sk: 'Kupón máš v aplikácii medzi kupónmi.', pl: 'Kupon masz w aplikacji, w kuponach.',
  },
  novinkyPromo: {
    cs: 'Promo kód: {kod}', en: 'Promo code: {kod}', de: 'Promo-Code: {kod}', sk: 'Promo kód: {kod}', pl: 'Kod promocyjny: {kod}',
  },
  novinkyOtevrit: {
    cs: 'Otevřít', en: 'Open', de: 'Öffnen', sk: 'Otvoriť', pl: 'Otwórz',
  },
} satisfies Record<string, Texty>;

export type KlicEmailu = keyof typeof EMAIL;

/** Prostý text (předmět e-mailu): věta v jazyce s dosazenými hodnotami. */
export function emailText(klic: KlicEmailu, jazyk: Jazyk, hodnoty?: Record<string, string | number>): string {
  return formatuj(EMAIL[klic][jazyk] ?? EMAIL[klic].cs, hodnoty, jazyk);
}

/**
 * Věta pro HTML: statický text i hodnoty jsou escapované, `html` přidává hotové
 * kousky (už escapované volajícím), třeba `<strong>…</strong>`.
 */
export function sazejHtml(klic: KlicEmailu, jazyk: Jazyk, html: Record<string, string>, text: Record<string, string | number> = {}, esc: (s: string) => string): string {
  const znacky = Object.fromEntries(Object.keys(html).map(k => [k, `⟦${k}⟧`]));
  const veta = formatuj(EMAIL[klic][jazyk] ?? EMAIL[klic].cs, { ...text, ...znacky }, jazyk);
  let out = esc(veta);
  for (const [k, v] of Object.entries(html)) out = out.split(`⟦${k}⟧`).join(v);
  return out;
}
