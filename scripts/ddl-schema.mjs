// Schéma databáze vyčtené z DDL v app/api/init/route.ts (CREATE TABLE a ALTER TABLE … ADD COLUMN).
// Společné pro scripts/check-smazani.mjs a testy (k77-ucet.ts), ať každý nemá vlastní regex.
// Vrací Map: tabulka → Set názvů sloupců.

import { readFileSync } from 'node:fs';

const TVRDE = new Set(['PRIMARY', 'UNIQUE', 'CONSTRAINT', 'FOREIGN', 'CHECK']);

export function nactiSchema(text = readFileSync(new URL('../app/api/init/route.ts', import.meta.url), 'utf8')) {
  const tabulky = new Map();
  for (const m of text.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\s*\)`/g)) {
    const cols = tabulky.get(m[1]) ?? new Set();
    for (const radek of m[2].split('\n')) {
      const r = radek.trim();
      if (!r || r.startsWith('--')) continue;
      const w = r.split(/\s+/)[0].replace(/,$/, '').replace(/^"|"$/g, '');
      if (/^[a-z_][a-z0-9_]*$/i.test(w) && !TVRDE.has(w.toUpperCase())) cols.add(w);
    }
    tabulky.set(m[1], cols);
  }
  for (const m of text.matchAll(/ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+)/g)) {
    if (!tabulky.has(m[1])) tabulky.set(m[1], new Set());
    tabulky.get(m[1]).add(m[2]);
  }
  return tabulky;
}

/** Sloupce, které odkazují na uživatele (kdo co vytvořil, komu co patří). */
export const SLOUPCE_NA_UZIVATELE = /^(user_id|customer_id|employee_id|sender_id|author_id|reported_by|offered_by|claimed_by|assigned_to|decided_by|reviewed_by|updated_by|invited_by|blocker_id|blocked_id|reporter_id|reported_user_id|resolved_by|sent_by|upravil|created_by|completed_by|approved_by|covered_by|submitted_by|referred_by|created_by_id|paid_by_id|owner_id)$/;

/** Sloupce s osobními údaji mimo `users` (kontakt, volný text, soubor, Stripe, mzdová sazba). Tabulka s takovým sloupcem musí být v OSOBNI_UDAJE (lib/smazaniUctu.ts). */
export const SLOUPCE_OSOBNI_UDAJE = /^(email|phone|birthday|snapshot|detail|blob_path|stripe_customer_id|stripe_subscription_id|pin|pin_hash|hourly_rate)$/;
