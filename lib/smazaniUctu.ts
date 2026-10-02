// Smazání účtu (Apple 5.1.1(v), Google Play „Account deletion“, GDPR čl. 17).
//
// Čisté: bez databáze a bez importů aplikace, aby se dalo testovat přímo
// (scripts/testy/k77-ucet.ts). Skutečné dotazy prožene přes `Exec` routa
// app/api/account/route.ts; test si podstrčí záznamník.
//
// Schéma NEMÁ cizí klíče, databáze tedy nic sama nekaskáduje — co se má
// smazat, je tady vyjmenované ručně. Hlídá to scripts/check-smazani.mjs:
// z DDL v app/api/init/route.ts vytáhne každou tabulku se sloupcem
// odkazujícím na uživatele a chce ji mít v `ZACHAZENI_TABULEK`. Nová tabulka
// s `user_id` bez rozhodnutí, co se s ní při smazání účtu stane, shodí CI.
//
// Zásady:
//  * Řádek `users` se NEMAZE, ale anonymizuje. Provozní pohledy (obsluha,
//    rezervace, zákazníci) dělají INNER JOIN na users, směny/docházka/uzávěrky
//    patří podniku (účetnictví, mzdy) a bez FK by tvrdé smazání nechalo díry.
//    Po anonymizaci nejde údaje přiřadit osobě (jméno, e-mail, telefon,
//    narozeniny pryč, heslo nepoužitelné) — to je smazání ve smyslu GDPR.
//  * Host: smaže se karta, členství, body, razítka, kupony, hodnocení.
//  * Zaměstnanec / tablet: pryč z podniků, osobní údaje pryč; záznamy, které
//    podnik vede jako správce (směny, docházka), zůstanou pod anonymním jménem.
//  * Vlastník podniku: bezpečný postup. Podnik se nesmí tiše osiřet ani
//    smazat: bez výslovného „smazat podnik“ se účet nesmaže, a s dalšími členy
//    jen se slovem SMAZAT (předat vlastnictví zatím aplikace neumí).
//  * Správce platformy se sám smazat nemůže.

export type Zachazeni = 'smazat' | 'ponechat' | 'upravit' | 'tym';

/**
 * Co se stane s tabulkami, které odkazují na uživatele.
 *  smazat    — řádky uživatele zmizí vždy
 *  upravit   — řádek zůstane, osobní text se vymaže (poznámka), vazba jde na anonymní účet
 *  ponechat  — záznam patří podniku (správci); vazba jde na anonymizovaný řádek users
 *  tym       — smaže se jen se smazáním celého podniku
 * Klíč je název tabulky z DDL; `ZACHAZENI_TABULEK` hlídá check-smazani.mjs.
 */
export const ZACHAZENI_TABULEK: Record<string, Zachazeni> = {
  // osobní věci účtu
  push_subscriptions: 'smazat', device_tokens: 'smazat', notifications: 'smazat', password_resets: 'smazat',
  account_delete_requests: 'smazat', user_blocks: 'smazat', guide_reads: 'smazat', poll_votes: 'smazat',
  suggestion_votes: 'smazat', conversation_members: 'smazat', team_members: 'smazat', billing_interest: 'smazat',
  rozlozeni_stranek: 'smazat', invitations: 'smazat',
  // host
  client_cards: 'smazat', client_memberships: 'smazat', client_loyalty_ledger: 'smazat', client_stamp_progress: 'smazat',
  client_coupon_claims: 'smazat', client_promo_uses: 'smazat', client_group_members: 'smazat', client_event_follows: 'smazat',
  client_reviews: 'smazat', client_bill_awards: 'smazat', client_import_clenove: 'smazat',
  client_reservations: 'upravit', client_orders: 'upravit',
  // dárkový poukaz je závazek podniku: zůstane platný, jen se odpojí od účtu a vymažou se osobní texty (viz planUzivatele)
  client_vouchers: 'upravit',
  // osobní text a soubory: řádek zůstává podniku, osobní obsah se maže (viz OSOBNI_UDAJE)
  uploads: 'upravit', audit_log: 'upravit', content_reports: 'upravit',
  // záznamy podniku: anonymní autor, obsah patří podniku
  shifts: 'ponechat', shift_requests: 'ponechat', availability_requests: 'ponechat', shift_offers: 'ponechat',
  time_entries: 'ponechat', fixed_assignments: 'ponechat', time_off_requests: 'ponechat', shift_reviews: 'ponechat',
  shift_review_items: 'ponechat', reward_redemptions: 'ponechat', inventory_log: 'ponechat', inventory_reports: 'ponechat',
  inventory_items: 'ponechat', chat_messages: 'ponechat', messages: 'ponechat', procedure_runs: 'ponechat',
  suggestions: 'ponechat', announcements: 'ponechat', receipts: 'ponechat',
  cash_closings: 'ponechat', orders: 'ponechat', events: 'ponechat', tasks: 'ponechat', planning_cards: 'ponechat',
  daily_reports: 'ponechat', recipes: 'ponechat', guides: 'ponechat', procedures: 'ponechat', polls: 'ponechat',
  stocktakes: 'ponechat', share_links: 'ponechat', menu_boards: 'ponechat', roles: 'ponechat', role_upravy: 'ponechat',
  pos_bills: 'ponechat', client_broadcasts: 'ponechat',
  // vlastnictví: řeší se u podniku
  teams: 'tym', organizations: 'tym',
};


/**
 * Tabulky s osobními údaji (e-mail, telefon, volný text, soubory, vazba na Stripe) a co se s nimi při smazání
 * účtu děje. Pokrytí hlídá scripts/check-smazani.mjs: tabulka se sloupcem ze `SLOUPCE_OSOBNI_UDAJE`
 * (scripts/ddl-schema.mjs) bez záznamu tady shodí CI.
 *  smazat       — řádky osoby zmizí (kroky v planUzivatele)
 *  anonymizovat — řádek zůstane, osobní obsah se vymaže nebo vazba přejde na anonymní účet
 *  podnik       — údaje patří podniku a zmizí se smazáním podniku (planPodniku); kontakt na dodavatele není osoba účtu
 *  ponechat     — zákonná evidence (účetnictví, fakturace, bezpečnostní protokol správce platformy), bez osobních údajů uživatele
 */
export type ZpusobOsobni = 'smazat' | 'anonymizovat' | 'podnik' | 'ponechat';
export const OSOBNI_UDAJE: Record<string, { zpusob: ZpusobOsobni; co: string }> = {
  users: { zpusob: 'anonymizovat', co: 'Jméno, e-mail, telefon, narozeniny, avatar, heslo, PIN, hodinová sazba, limity a preference směn, pozice, aktivní podnik a nastavení oznámení se přepíšou nebo vymažou; řádek zůstane pod anonymním jménem kvůli provozním záznamům podniku.' },
  invitations: { zpusob: 'smazat', co: 'Pozvánky s e-mailem osoby (i pozvánky, které osoba rozeslala) se smažou včetně tokenu.' },
  uploads: { zpusob: 'anonymizovat', co: 'Soubory osoby mimo podnik se smažou i s blobem; soubory v podniku (fotky účtenek, přílohy chatu) zůstanou podniku bez vazby na osobu a s obecným názvem. Soubory smazaného podniku se smažou i s blobem.' },
  audit_log: { zpusob: 'anonymizovat', co: 'Záznamy o akcích zůstanou (kdo=anonymní účet, co, kdy); volný text `detail` k osobě se vymaže. Záznamy smazaného podniku zmizí s ním.' },
  content_reports: { zpusob: 'anonymizovat', co: 'Nahlášení zůstanou pro moderaci; text podatele a opis nahlášeného obsahu osoby se vymaže.' },
  teams: { zpusob: 'smazat', co: 'Smazáním podniku zmizí i stripe_customer_id a stripe_subscription_id; ve Stripe se zruší předplatné a smaže zákazník (chyba Stripe smazání neblokuje, vrací se jako varování a zapíše do protokolu).' },
  organizations: { zpusob: 'smazat', co: 'Organizace (název firmy, sdílená nastavení) se smaže se smazáním posledního podniku v ní; prázdná organizace vlastníka se smaže vždy.' },
  team_members: { zpusob: 'smazat', co: 'Členství v podniku včetně pozice a hodinové sazby se smaže.' },
  menu_boards: { zpusob: 'podnik', co: 'PIN tabule s menu patří podniku (ne osobě) a maže se s ním.' },
  suppliers: { zpusob: 'podnik', co: 'Kontakty na dodavatele patří podniku a mažou se s ním.' },
  billing_events: { zpusob: 'ponechat', co: 'Id událostí Stripe bez osobních údajů; evidence fakturace podniku (zákon o účetnictví). Faktury samotné zůstávají ve Stripe.' },
  referral_rewards: { zpusob: 'ponechat', co: 'Provize za doporučení, jen čísla podniků a částka; účetní záznam platformy.' },
  admin_audit: { zpusob: 'ponechat', co: 'Bezpečnostní protokol zásahů správce platformy (actor je e-mail správce, ne dotčené osoby); správce se sám smazat nemůže.' },
};

/** Tabulky s `team_id`, které se mažou se smazáním podniku (kromě účetních záznamů platformy). */
export const TYMOVE_TABULKY = [
  'invitations', 'shifts', 'shift_requests', 'availability_requests', 'inventory_items', 'shift_offers', 'inventory_reports',
  'conversations', 'messages', 'guide_categories', 'guides', 'procedures', 'procedure_runs', 'inventory_categories', 'tasks',
  'planning_cards', 'daily_reports', 'recipes', 'shift_types', 'fixed_assignments', 'cash_closings', 'time_entries', 'uploads',
  'receipts', 'announcements', 'time_off_requests', 'orders', 'suggestions', 'shift_reviews', 'billing_interest', 'share_links',
  'menu_boards', 'shift_review_items', 'stocktakes', 'suppliers', 'rewards_catalog', 'reward_redemptions', 'team_members', 'roles',
  'role_upravy', 'polls', 'audit_log', 'events', 'pos_connections', 'pos_product_map', 'pos_sales', 'pos_processed_bills',
  'pos_unmapped', 'pos_bills', 'pos_bill_items', 'pos_products', 'item_recipes', 'purchase_flags', 'client_profiles', 'client_tables',
  'client_memberships', 'client_reservations', 'client_orders', 'client_coupons', 'client_coupon_claims', 'client_loyalty_ledger',
  'client_stamp_progress', 'client_stamp_campaigns', 'client_bill_awards', 'client_groups', 'client_group_members', 'client_reviews',
  'client_broadcasts', 'client_promos', 'client_banners', 'rozlozeni_stranek', 'content_reports', 'client_importy', 'client_vouchers', 'client_voucher_uses', 'client_bonus_rules',
];
/** Tabulky s `team_id`, které se při smazání podniku ZÁMĚRNĚ nemažou: účetní záznamy platformy (fakturace, provize). */
export const TYMOVE_PONECHAT = ['billing_events', 'referral_rewards', 'admin_audit'];

/** Tabulky bez `team_id`, které se k podniku vážou přes nadřazený řádek. Mažou se PŘED nadřazenými. */
export const TYMOVE_NEPRIME: { tabulka: string; kde: string }[] = [
  { tabulka: 'chat_messages', kde: 'conversation_id IN (SELECT id FROM conversations WHERE team_id = $1)' },
  { tabulka: 'conversation_members', kde: 'conversation_id IN (SELECT id FROM conversations WHERE team_id = $1)' },
  { tabulka: 'menu_items', kde: 'section_id IN (SELECT id FROM menu_sections WHERE board_id IN (SELECT id FROM menu_boards WHERE team_id = $1))' },
  { tabulka: 'menu_sections', kde: 'board_id IN (SELECT id FROM menu_boards WHERE team_id = $1)' },
  { tabulka: 'inventory_log', kde: 'item_id IN (SELECT id FROM inventory_items WHERE team_id = $1)' },
  { tabulka: 'guide_reads', kde: 'guide_id IN (SELECT id FROM guides WHERE team_id = $1)' },
  { tabulka: 'poll_votes', kde: 'poll_id IN (SELECT id FROM polls WHERE team_id = $1)' },
  { tabulka: 'suggestion_votes', kde: 'suggestion_id IN (SELECT id FROM suggestions WHERE team_id = $1)' },
  { tabulka: 'client_event_follows', kde: 'event_id IN (SELECT id FROM events WHERE team_id = $1)' },
  { tabulka: 'client_promo_uses', kde: 'promo_id IN (SELECT id FROM client_promos WHERE team_id = $1)' },
  { tabulka: 'client_import_clenove', kde: 'import_id IN (SELECT id FROM client_importy WHERE team_id = $1)' },
];

// ---- Rozhodnutí -------------------------------------------------------------------

export interface VlastnenyPodnik { id: number; nazev: string; dalsiClenove: number }

export type RozhodnutiSmazani =
  | { ok: true; smazatPodniky: number[] }
  | { ok: false; status: 400 | 403 | 409; kod: string; zprava: string };

export const POTVRZENI_PODNIKU = 'SMAZAT';

export function rozhodniSmazani(v: {
  superadmin: boolean;
  vlastnene: VlastnenyPodnik[];
  smazatPodnik: boolean;
  potvrzeni?: string | null;
}): RozhodnutiSmazani {
  if (v.superadmin) {
    return { ok: false, status: 403, kod: 'SPRAVCE', zprava: 'Správce platformy se nemůže smazat sám. Nejdřív mu odeberte roli správce.' };
  }
  if (v.vlastnene.length === 0) return { ok: true, smazatPodniky: [] };
  const sCleny = v.vlastnene.filter(p => p.dalsiClenove > 0);
  if (!v.smazatPodnik) {
    if (sCleny.length) {
      return {
        ok: false, status: 409, kod: 'VLASTNIK_S_CLENY',
        zprava: `V podniku ${sCleny.map(p => `„${p.nazev}“`).join(', ')} jsou další lidé. Nejdřív předejte vedení, nebo smažte celý podnik i s účtem.`,
      };
    }
    return {
      ok: false, status: 409, kod: 'VLASTNIK_PODNIKU',
      zprava: `Smazáním účtu zanikne i podnik ${v.vlastnene.map(p => `„${p.nazev}“`).join(', ')} a všechna jeho data. Potvrďte, že ho chcete smazat.`,
    };
  }
  if (String(v.potvrzeni ?? '').trim() !== POTVRZENI_PODNIKU) {
    return { ok: false, status: 400, kod: 'POTVRZENI', zprava: `Pro smazání podniku napište slovo ${POTVRZENI_PODNIKU}.` };
  }
  return { ok: true, smazatPodniky: v.vlastnene.map(p => p.id) };
}

// ---- Plán dotazů -------------------------------------------------------------------

export interface Krok {
  /** Text SQL s parametry $1…; názvy tabulek jsou jen z konstant výše. */
  text: string;
  params: unknown[];
  /** Povinný krok: selhání přeruší smazání. Volitelný (tabulka před migrací) se přeskočí. */
  povinny: boolean;
  /** Krátký popis pro testy a log. */
  popis: string;
}

const volitelny = (popis: string, text: string, params: unknown[]): Krok => ({ text, params, povinny: false, popis });

/** Sloupce `users`, které se při smazání vrátí do prázdné hodnoty (hodnota je literál SQL z konstanty). */
export const RESET_SLOUPCU: [string, string][] = [
  ['pin', 'NULL'], ['pin_hash', 'NULL'], ['hourly_rate', '0'], ['max_consecutive_days', 'NULL'], ['max_month_hours', 'NULL'],
  ['split_shifts_ok', 'NULL'], ['shift_preference', `'flexible'`], ['job_title', 'NULL'], ['active_team_id', 'NULL'],
];

/** Kroky pro jednoho uživatele. Pořadí: nejdřív mazání, nakonec anonymizace řádku users. */
export function planUzivatele(u: { id: number; email: string; role: string; hash: string; dnes: string }): Krok[] {
  const id = u.id;
  const k: Krok[] = [];
  const del = (t: string, sloupec = 'user_id') => k.push(volitelny(`smazat ${t}`, `DELETE FROM ${t} WHERE ${sloupec} = $1`, [id]));
  for (const t of ['push_subscriptions', 'device_tokens', 'notifications', 'password_resets', 'account_delete_requests', 'guide_reads',
    'poll_votes', 'suggestion_votes', 'conversation_members', 'team_members', 'billing_interest']) del(t);
  k.push(volitelny('smazat osobní rozložení stránek', `DELETE FROM rozlozeni_stranek WHERE user_id = $1`, [id]));
  k.push(volitelny('smazat blokace', `DELETE FROM user_blocks WHERE blocker_id = $1 OR blocked_id = $1`, [id]));
  k.push(volitelny('smazat počítadla přihlášení', `DELETE FROM auth_attempts WHERE key = ANY($1)`,
    [[`login:${u.email}`, `client-register:${u.email}`, `reset:${u.email}`, `smazani:${id}`]]));
  if (u.role === 'customer') {
    for (const t of ['client_cards', 'client_memberships', 'client_loyalty_ledger', 'client_stamp_progress', 'client_coupon_claims',
      'client_promo_uses', 'client_group_members', 'client_event_follows', 'client_reviews', 'client_bill_awards', 'client_import_clenove']) del(t, 'customer_id');
    // Budoucí rezervace se zruší (podnik s nimi nepočítá s anonymem), minulým zmizí poznámka.
    k.push(volitelny('zrušit budoucí rezervace', `UPDATE client_reservations SET status = 'cancelled', note = NULL WHERE customer_id = $1 AND date >= $2 AND status IN ('requested', 'confirmed')`, [id, u.dnes]));
    k.push(volitelny('vymazat poznámky rezervací', `UPDATE client_reservations SET note = NULL WHERE customer_id = $1`, [id]));
    k.push(volitelny('vymazat poznámky objednávek', `UPDATE client_orders SET note = NULL WHERE customer_id = $1`, [id]));
    k.push(volitelny('odpojit dárkové poukazy od účtu', `UPDATE client_vouchers SET customer_id = NULL, recipient_name = NULL, buyer_name = NULL, note = NULL WHERE customer_id = $1`, [id]));
  }
  // Pozvánky s e-mailem osoby (a ty, které rozeslala): e-mail + token jsou osobní údaj.
  k.push(volitelny('smazat pozvánky', `DELETE FROM invitations WHERE LOWER(email) = LOWER($2) OR invited_by = $1`, [id, u.email]));
  // Soubory: bez podniku patří jen osobě (mažou se; blob maže smazUcet), v podniku zůstanou bez vazby na osobu.
  k.push(volitelny('smazat soubory mimo podnik', `DELETE FROM uploads WHERE user_id = $1 AND team_id IS NULL`, [id]));
  k.push(volitelny('odpojit soubory podniku od osoby', `UPDATE uploads SET user_id = NULL, name = 'Příloha' WHERE user_id = $1`, [id]));
  // Protokol akcí: zůstane, vymaže se volný text. Záznam o samotném smazání (bez osobních údajů) se zachová.
  k.push(volitelny('vymazat text protokolu', `UPDATE audit_log SET detail = NULL WHERE (user_id = $1 OR (entity = 'user' AND entity_id = $1))
    AND action NOT IN ('ucet.smazan', 'podnik.smazan', 'ucet.stripe_chyba')`, [id]));
  k.push(volitelny('vymazat text nahlášení podatele', `UPDATE content_reports SET detail = NULL WHERE reporter_id = $1`, [id]));
  k.push(volitelny('vymazat opis nahlášeného obsahu', `UPDATE content_reports SET snapshot = NULL WHERE reported_user_id = $1`, [id]));
  // Prázdná organizace vlastníka (po smazání jeho podniků) nemá smysl držet.
  k.push(volitelny('smazat prázdné organizace vlastníka', `DELETE FROM organizations WHERE owner_id = $1
    AND NOT EXISTS (SELECT 1 FROM teams WHERE organization_id = organizations.id)`, [id]));
  // Mzdová sazba, PIN a limity jsou osobní údaje svázané s účtem. Po jednom sloupci: chybějící sloupec (před migrací) nic nezastaví.
  for (const [sloupec, hodnota] of RESET_SLOUPCU) k.push(volitelny(`reset users.${sloupec}`, `UPDATE users SET ${sloupec} = ${hodnota} WHERE id = $1`, [id]));
  k.push(volitelny('odpojit pozvané hosty', `UPDATE users SET referred_by = NULL WHERE referred_by = $1`, [id]));
  const jmeno = u.role === 'customer' ? 'Smazaný host' : 'Smazaný uživatel';
  const anonymniEmail = `smazan-${id}@managero.invalid`;
  // S `deleted_at` (po migraci) — povinný je jen jeden ze dvou kroků, druhý je záloha.
  k.push({
    popis: 'anonymizovat účet', povinny: true,
    text: `UPDATE users SET name = $2, email = $3, phone = NULL, birthday = NULL, avatar = '👤', password_hash = $4,
             team_id = NULL, employer_id = NULL, notif_prefs = '{}'::jsonb, deleted_at = NOW() WHERE id = $1`,
    params: [id, jmeno, anonymniEmail, u.hash],
  });
  return k;
}

/** Záložní anonymizace pro databázi před migrací (bez `deleted_at` a `notif_prefs`). */
export function anonymizaceBezMigrace(u: { id: number; role: string; hash: string }): Krok {
  return {
    popis: 'anonymizovat účet (bez migrace)', povinny: true,
    text: `UPDATE users SET name = $2, email = $3, phone = NULL, avatar = '👤', password_hash = $4, team_id = NULL, employer_id = NULL WHERE id = $1`,
    params: [u.id, u.role === 'customer' ? 'Smazaný host' : 'Smazaný uživatel', `smazan-${u.id}@managero.invalid`, u.hash],
  };
}

/** Kroky smazání podniku: nejdřív tabulky přes nadřazený řádek, pak tabulky s team_id, nakonec tým. */
export function planPodniku(teamId: number, vlastnikId: number): Krok[] {
  const k: Krok[] = [];
  for (const n of TYMOVE_NEPRIME) k.push(volitelny(`podnik: ${n.tabulka}`, `DELETE FROM ${n.tabulka} WHERE ${n.kde}`, [teamId]));
  for (const t of TYMOVE_TABULKY) k.push(volitelny(`podnik: ${t}`, `DELETE FROM ${t} WHERE team_id = $1`, [teamId]));
  // Ostatní členové zůstanou bez podniku; jejich účty se nemažou.
  k.push(volitelny('podnik: uvolnit členy', `UPDATE users SET team_id = NULL WHERE team_id = $1 AND id <> $2`, [teamId, vlastnikId]));
  // Organizace zanikne s posledním podnikem; jinak se jen odpojí (ostatní podniky ji dál používají).
  k.push(volitelny('podnik: smazat prázdnou organizaci', `DELETE FROM organizations WHERE id = (SELECT organization_id FROM teams WHERE id = $1)
    AND NOT EXISTS (SELECT 1 FROM teams WHERE organization_id = organizations.id AND id <> $1)`, [teamId]));
  k.push(volitelny('podnik: odpojit od organizace', `UPDATE teams SET organization_id = NULL WHERE id = $1`, [teamId]));
  k.push({ popis: 'podnik: smazat tým', povinny: true, text: `DELETE FROM teams WHERE id = $1`, params: [teamId] });
  return k;
}

export type Exec = (text: string, params: unknown[]) => Promise<unknown>;

/** Chyba „tabulka/sloupec ještě neexistuje“ (migrace neproběhla): u volitelných kroků se přeskočí. */
export function jeChybejiciObjekt(e: unknown): boolean {
  const s = String((e as any)?.message ?? e);
  return /does not exist|neexistuje|undefined_(table|column)|42P01|42703/i.test(s);
}

export interface VysledekKroku { popis: string; stav: 'ok' | 'preskoceno' }

/**
 * Provede kroky popořadě. Volitelný krok, který selže na chybějící tabulce
 * (kód je fail-open před migrací), se přeskočí. Jakákoli JINÁ chyba krok
 * přeruší, i když je volitelný: osobní údaje, které se nepodařilo smazat,
 * nesmí zůstat za potvrzením „účet smazán“. Kroky jsou idempotentní, takže
 * opakované volání doběhne tam, kde se přestalo.
 */
export async function proved(exec: Exec, kroky: Krok[]): Promise<VysledekKroku[]> {
  const out: VysledekKroku[] = [];
  for (const k of kroky) {
    try {
      await exec(k.text, k.params);
      out.push({ popis: k.popis, stav: 'ok' });
    } catch (e) {
      if (k.povinny || !jeChybejiciObjekt(e)) throw e;
      out.push({ popis: k.popis, stav: 'preskoceno' });
    }
  }
  return out;
}
