// IČO při objednávce placeného tarifu (B2B: předplatné smí objednat jen podnikatel, OP čl. 1).
//
// Pokladna Stripe dostane povinné vlastní pole „IČO“ (8 číslic; Stripe hlídá délku, kontrolní
// součet modulo 11 ověřujeme my ve webhooku). Když podnik IČO už má v Nastavení → Profil podniku,
// pole je předvyplněné a stejné IČO jde do faktury už předem (custom_fields zákazníka Stripe).
// Po zaplacení (checkout.session.completed) se IČO uloží k podniku a na faktury zákazníka.
//
// Čistý modul (testy: scripts/testy/k92-ico-pokladna.ts). Kontrolní součet je
// lib/podnikProfil.ts (icoMaPlatnouKontrolu) — stejné pravidlo jako formulář profilu podniku.

import type Stripe from 'stripe';
import { cistyIco } from './podnikProfil.ts';

/** Klíč vlastního pole v pokladně Stripe (alfanumerický, jedinečný). */
export const KLIC_POLE_ICO = 'ico';

/** Platné IČO podniku (8 číslic s kontrolním součtem), jinak null. */
export function platneIco(v: unknown): string | null {
  const ico = cistyIco(v);
  return typeof ico === 'string' ? ico : null;
}

/** Povinné pole IČO pro `checkout.sessions.create({ custom_fields })`; předvyplněné, když ho podnik má. */
export function poleIcoPokladny(icoPodniku: unknown, jazyk?: string): Stripe.Checkout.SessionCreateParams.CustomField {
  const ico = platneIco(icoPodniku);
  return {
    key: KLIC_POLE_ICO,
    // Stripe popisky nepřekládá; do 50 znaků.
    label: { type: 'custom', custom: jazyk && jazyk !== 'cs' && jazyk !== 'sk' ? 'Company ID (IČO, 8 digits)' : 'IČO (8 číslic)' },
    type: 'numeric',
    numeric: { minimum_length: 8, maximum_length: 8, ...(ico ? { default_value: ico } : {}) },
    optional: false,
  };
}

/** Pole faktury zákazníka Stripe s IČO odběratele (`invoice_settings.custom_fields`). */
export function fakturacniPoleIco(ico: string): { name: string; value: string }[] {
  return [{ name: 'IČO', value: ico }];
}

type PolePokladny = { key?: string | null; numeric?: { value?: string | null } | null; text?: { value?: string | null } | null };

/**
 * IČO z dokončené pokladny. `zadano` = co člověk vyplnil (i neplatné, pro záznam), `ico` = platné
 * IČO po kontrole součtu, jinak null.
 */
export function icoZPokladny(pole: readonly PolePokladny[] | null | undefined): { ico: string | null; zadano: string | null } {
  const p = (pole ?? []).find(x => x?.key === KLIC_POLE_ICO);
  const zadano = String(p?.numeric?.value ?? p?.text?.value ?? '').replace(/\s+/g, '') || null;
  return { ico: zadano && /^\d{8}$/.test(zadano) ? platneIco(zadano) : null, zadano };
}
