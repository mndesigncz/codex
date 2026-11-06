// Pokladna Stripe ve třech podobách — co se mezi nimi liší (čistý modul, testy:
// scripts/testy/k95-vlastni-pokladna.ts).
//
//  - `hosted`   přesměrování na stránku Stripe (záloha bez veřejného klíče),
//  - `embedded` vložená stránka Stripe (`ui_mode: 'embedded_page'`) — jen pro starší
//               klienty, kteří ještě posílají `embedded: true`,
//  - `elements` vlastní pokladna v designu Manageru (`ui_mode: 'elements'`, dřív
//               „custom"): platební pole jsou Stripe Elements, všechno ostatní je naše.
//
// Režim `elements` podle dokumentace Stripe nepovoluje `custom_fields` ani `custom_text`
// (API reference Checkout Sessions: „You can't set this parameter if ui_mode is
// elements"). Povinné IČO proto sbírá naše pole a server ho před potvrzením zapíše do
// metadat relace (`metadata.ico`) a na faktury zákazníka (`invoice_settings.custom_fields`).
// Souhlas s obchodními podmínkami: zaškrtávátko Stripe (`consent_collection`) v tomto
// režimu kreslí jen Terms Element, který je v Stripe.js 9.x v uzavřené betě — souhlas
// proto sbírá naše zaškrtávátko a server ho zapíše do metadat relace (`souhlas_op`:
// verze podmínek a čas). Bez souhlasu server přípravu odmítne a platba se nespustí.

import type Stripe from 'stripe';
import { poleIcoPokladny, platneIco, KLIC_POLE_ICO } from './icoPokladna.ts';

export type RezimPokladny = 'hosted' | 'embedded' | 'elements';

/** Klíč souhlasu s obchodními podmínkami v metadatech relace (a předplatného). */
export const KLIC_SOUHLASU = 'souhlas_op';

/** Z těla POST /api/billing/checkout: `ui: 'elements'` = vlastní pokladna, `embedded: true` = starší vložená. */
export function rezimZTela(b: unknown): RezimPokladny {
  const t = (b ?? {}) as { ui?: unknown; embedded?: unknown };
  if (t.ui === 'elements') return 'elements';
  if (t.embedded === true) return 'embedded';
  return 'hosted';
}

type CastRelace = Pick<Stripe.Checkout.SessionCreateParams,
  'ui_mode' | 'custom_fields' | 'consent_collection' | 'return_url' | 'redirect_on_completion' | 'success_url' | 'cancel_url'>;

/**
 * Část parametrů `checkout.sessions.create`, která závisí na režimu. Ostatní (zákazník,
 * cena, trial, metadata, kupony, DIČ) je společné a skládá ho lib/billing.ts.
 */
export function parametryRezimu(rezim: RezimPokladny, o: { icoPodniku: unknown; jazyk?: string; souhlas: boolean; navrat: string; zruseno: string }): CastRelace {
  if (rezim === 'elements') {
    // Žádné custom_fields / custom_text / consent_collection: v režimu elements je Stripe odmítne
    // nebo by bez betového Terms Elementu nešlo zaplatit. IČO a souhlas sbírá naše okno.
    return { ui_mode: 'elements', return_url: o.navrat };
  }
  const spolecne: CastRelace = {
    custom_fields: [poleIcoPokladny(o.icoPodniku, o.jazyk)],
    ...(o.souhlas ? { consent_collection: { terms_of_service: 'required' } } : {}),
  };
  if (rezim === 'embedded') {
    return {
      ...spolecne,
      // Stripe hodnotu přejmenoval: „embedded“ už neexistuje, platí „embedded_page“.
      ui_mode: 'embedded_page',
      // Zůstat v aplikaci; přesměruje se jen když to banka po 3D Secure vyžaduje.
      redirect_on_completion: 'if_required',
      return_url: o.navrat,
    };
  }
  return { ...spolecne, success_url: o.navrat, cancel_url: o.zruseno };
}

/** Metadata relace hned při založení: IČO z profilu podniku, ať ho webhook má, i kdyby příprava nedoběhla. */
export function metadataZalozeni(rezim: RezimPokladny, icoPodniku: unknown): Record<string, string> {
  const ico = platneIco(icoPodniku);
  return rezim === 'elements' && ico ? { [KLIC_POLE_ICO]: ico } : {};
}

export type Priprava =
  | { ok: true; sessionId: string; ico: string; souhlas: boolean }
  | { ok: false; chyba: 'relace' | 'ico' | 'souhlas' };

/**
 * Tělo PATCH /api/billing/checkout (příprava těsně před potvrzením platby): id relace,
 * IČO (8 číslic s kontrolním součtem) a souhlas s podmínkami, je-li povinný.
 */
export function overPripravu(b: unknown, o: { souhlasPovinny: boolean }): Priprava {
  const t = (b ?? {}) as { sessionId?: unknown; ico?: unknown; souhlas?: unknown };
  const sessionId = typeof t.sessionId === 'string' ? t.sessionId.trim() : '';
  if (!/^cs_(test|live)_[A-Za-z0-9]{8,200}$/.test(sessionId)) return { ok: false, chyba: 'relace' };
  const ico = platneIco(t.ico);
  if (!ico) return { ok: false, chyba: 'ico' };
  const souhlas = t.souhlas === true;
  if (o.souhlasPovinny && !souhlas) return { ok: false, chyba: 'souhlas' };
  return { ok: true, sessionId, ico, souhlas };
}

type RelaceKOvereni = Pick<Stripe.Checkout.Session, 'client_reference_id' | 'metadata' | 'status' | 'ui_mode' | 'mode'>;

/** Smí podnik relaci připravit? Jen svou, otevřenou, předplatitelskou a v režimu elements. */
export function relacePatriPodniku(s: RelaceKOvereni | null | undefined, teamId: number): boolean {
  if (!s) return false;
  const tym = String(teamId);
  const patri = s.client_reference_id === tym || s.metadata?.teamId === tym;
  // „custom" je jméno téhož režimu ve verzích API před 2026-03-25 (účet se starší výchozí verzí).
  return patri && s.status === 'open' && s.mode === 'subscription' && (s.ui_mode === 'elements' || s.ui_mode === 'custom');
}

/** Metadata, která příprava zapíše do relace: IČO a doklad souhlasu (verze podmínek + čas), nebo prázdno. */
export function metadataPripravy(o: { ico: string; souhlas: boolean; verzePodminek: string; ted: Date }): Record<string, string> {
  return {
    [KLIC_POLE_ICO]: o.ico,
    // Prázdná hodnota klíč v metadatech Stripe smaže — bez souhlasu tam nic nezůstane.
    [KLIC_SOUHLASU]: o.souhlas ? `${o.verzePodminek}@${o.ted.toISOString()}` : '',
  };
}
