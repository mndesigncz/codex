// Zrušení předplatného a vracení peněz — /zruseni-predplatneho (Stripe chce zveřejněnou
// refund a cancellation policy). Shrnutí článků 6, 7, 10 a 18 obchodních podmínek; čísla
// z lib/pravni/lhuty.ts, aby se nerozešla. Zrušení v portálu Stripe je „at_period_end“
// (lib/billing.ts → portalConfiguration).

import type { Firma } from '../../firma.ts';
import { LHUTY, TARIFY, UCINNOST } from '../lhuty.ts';
import type { Dokument } from './typy.ts';

export function zruseniPredplatnehoCs(f: Firma): Dokument {
  return {
    titulek: 'Zrušení předplatného a vrácení peněz',
    uvod: 'Jak zrušit placený tarif Managero, co se stane potom a kdy vracíme peníze. Podrobně to upravují [[obchodni-podminky|obchodní podmínky]].',
    aktualizace: UCINNOST.cs,
    sekce: [
      { id: 'jak', h: 'Jak předplatné zrušit', li: [
        'V aplikaci na webu: Nastavení → Předplatné → Spravovat předplatné → Zrušit předplatné. Zrušit může vlastník podniku nebo člověk s oprávněním spravovat předplatné.',
        `Nebo napište na ${f.emailPodpory} nebo zavolejte na ${f.telefon}; zrušení potvrdíme e-mailem.`,
        'Mobilní aplikace předplatné nespravují, zrušení se dělá na webu.',
      ] },
      { id: 'co-potom', h: 'Co se stane po zrušení', li: [
        'Předplatné doběhne do konce zaplaceného období (měsíce nebo roku). Do té doby máte placený tarif dál a nic dalšího se nestrhne.',
        'Potom podnik přejde na tarif Zdarma. Data zůstávají, jen funkce nad rámec tarifu Zdarma přestanou být dostupné. Předplatné můžete kdykoli obnovit.',
        `Zrušení během ${TARIFY.zkusebniDni}denní zkušební doby: nic se nestrhne a po jejím konci se podnik vrátí na tarif Zdarma.`,
      ] },
      { id: 'vraceni', h: 'Vracení peněz', p: [
        'Za zaplacené období peníze po zrušení nevracíme, ani poměrně u ročního předplatného. Vrátíme je (celé nebo poměrně), když:',
      ], li: [
        'platba proběhla omylem nebo dvakrát;',
        'služba nebyla podstatnou část období dostupná z důvodů na naší straně, nebo měla podstatnou vadu, kterou jsme neodstranili;',
        'jsme smlouvu vypověděli my, aniž jste ji porušili;',
        'jste smlouvu vypověděli kvůli změně podmínek nebo cen, se kterou nesouhlasíte;',
        'to stanoví zákon.',
      ], po: [
        `O vrácení požádejte na ${f.emailPodpory}. Peníze vracíme na kartu, ze které platba proběhla, zpravidla do ${LHUTY.vraceniDni} dnů.`,
      ] },
      { id: 'smazani', h: 'Smazání podniku', p: [
        'Zrušení předplatného podnik ani data nemaže. Pokud chcete Managero opustit úplně, stáhněte si zálohu a smažte podnik v Nastavení, nebo nám napište; postup a lhůty pro vyzvednutí dat jsou v článku 20 [[obchodni-podminky|obchodních podmínek]]. Viz také [[smazat-ucet|Smazání účtu]].',
      ] },
    ],
  };
}

export function zruseniPredplatnehoEn(f: Firma): Dokument {
  return {
    titulek: 'Cancellation and refunds',
    uvod: 'How to cancel a paid Managero plan, what happens next and when we refund. The [[obchodni-podminky|business terms]] contain the full rules. This English version is for information only.',
    aktualizace: UCINNOST.en,
    sekce: [
      { id: 'jak', h: 'How to cancel', li: [
        'In the web app: Settings → Subscription → Manage subscription → Cancel subscription. The business owner or a person with permission to manage the subscription can cancel.',
        `Or email ${f.emailPodpory} or call ${f.telefon}; we confirm the cancellation by email.`,
        'The mobile apps do not manage subscriptions; cancel on the web.',
      ] },
      { id: 'co-potom', h: 'What happens after cancelling', li: [
        'The subscription runs until the end of the paid period (month or year). Until then you keep the paid plan and nothing more is charged.',
        'Then the business moves to the Free plan. Data stays; only features beyond the Free plan become unavailable. You can resubscribe at any time.',
        `Cancelling during the ${TARIFY.zkusebniDni}-day trial: nothing is charged and the business returns to the Free plan when the trial ends.`,
      ] },
      { id: 'vraceni', h: 'Refunds', p: [
        'We do not refund a paid period after cancellation, not even pro rata for an annual subscription. We refund (in full or pro rata) when:',
      ], li: [
        'a payment was made by mistake or twice;',
        'the service was unavailable for a substantial part of the period for reasons on our side or had a material defect we did not fix;',
        'we terminated the contract without breach on your part;',
        'you terminated because of a change of terms or prices you disagree with;',
        'the law requires it.',
      ], po: [
        `Request a refund at ${f.emailPodpory}. Refunds go to the card used for the payment, usually within ${LHUTY.vraceniDni} days.`,
      ] },
      { id: 'smazani', h: 'Deleting the business', p: [
        'Cancelling the subscription does not delete the business or data. To leave Managero completely, download a backup and delete the business in Settings, or write to us; the procedure and data retrieval periods are in section 20 of the [[obchodni-podminky|business terms]]. See also [[smazat-ucet|Delete account]].',
      ] },
    ],
  };
}
