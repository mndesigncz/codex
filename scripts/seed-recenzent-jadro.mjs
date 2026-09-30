// Demo účty a ukázkový podnik pro recenzenty obchodů (Apple App Review, Google Play).
//
// Tohle je ČISTÉ JÁDRO: logika bez databáze, bez hashování a bez čtení prostředí.
// Databázi, hashování a čas dostane zvenčí (`db`, `hash`, `dnes`), takže se dá
// otestovat na paměťové atrapě (scripts/testy/k77-ucet.ts). Spouštěcí skript je
// scripts/seed-recenzent.mjs a NESPOUŠTÍ SE proti produkční databázi bez
// výslovného potvrzení (viz `kontrolaDatabaze`).
//
// Zásady:
//  * Hesla se NIKDY neukládají do repa ani nevypisují bez vyžádání: přijdou
//    z argumentu/prostředí, nebo je skript vygeneruje (`--generuj`) a vypíše
//    jednou na konci.
//  * Idempotence: všechno se hledá podle přirozeného klíče (e-mail, název,
//    datum) a opakované spuštění řádky jen aktualizuje, nezdvojuje.
//  * Izolace: vlastní tým „Café Demo", žádná vazba na Stripe ani pokladnu,
//    žádné skutečné e-maily (doména `managero.invalid`), žádný správce platformy.
//  * Objednávka od stolu funguje i bez fyzické přítomnosti: `order_geo = 'off'`
//    a QR stolu není povinný, ať recenzent nemusí sedět v podniku.

export const DEMO_TYM = 'Café Demo';
export const DEMO_SLUG = 'cafe-demo';
export const VYCHOZI_DOMENA = 'managero.invalid';
export const MIN_DELKA_HESLA = 12;

/** Heslo dost dlouhé na to, aby ho nešlo uhodnout ze zkušebního přihlášení. */
export function hesloStaci(h) {
  return typeof h === 'string' && h.length >= MIN_DELKA_HESLA && h.length <= 200;
}

/** Hodnota argumentu ve tvaru --nazev=hodnota. */
function arg(argv, nazev) {
  const p = `--${nazev}=`;
  const a = argv.find(x => x.startsWith(p));
  return a ? a.slice(p.length) : undefined;
}

export function emaily(domena = VYCHOZI_DOMENA) {
  return {
    provoz: `recenzent-provoz@${domena}`,
    zamestnanec: `recenzent-zamestnanec@${domena}`,
    host: `recenzent-host@${domena}`,
  };
}

/**
 * Hesla tří účtů. Pořadí: argument --heslo-provoz=… / --heslo-zamestnanec=… / --heslo-host=…,
 * pak společné --heslo=… nebo RECENZENT_HESLO, pak (s --generuj) náhodná. Bez ničeho z toho
 * skript skončí chybou: výchozí heslo v repu by byl průšvih.
 * `nahodne` je funkce (délka) → řetězec, ať je jádro deterministické v testech.
 */
/**
 * @param {{ argv?: string[], env?: Record<string, string | undefined>, nahodne?: (n: number) => string }} vstup
 * @returns {{ hesla: { provoz: string, zamestnanec: string, host: string }, vygenerovana: boolean }}
 */
export function nactiHesla({ argv = [], env = {}, nahodne }) {
  const spolecne = arg(argv, 'heslo') ?? env.RECENZENT_HESLO;
  const z = (role, envKlic) => arg(argv, `heslo-${role}`) ?? env[envKlic] ?? spolecne;
  const hesla = { provoz: z('provoz', 'RECENZENT_HESLO_PROVOZ'), zamestnanec: z('zamestnanec', 'RECENZENT_HESLO_ZAMESTNANEC'), host: z('host', 'RECENZENT_HESLO_HOST') };
  const generuj = argv.includes('--generuj');
  let vygenerovana = false;
  for (const role of Object.keys(hesla)) {
    if (hesla[role] == null || hesla[role] === '') {
      if (!generuj || typeof nahodne !== 'function') {
        throw new Error(`Chybí heslo účtu „${role}“. Zadej --heslo-${role}=…, --heslo=…, proměnnou RECENZENT_HESLO, nebo --generuj.`);
      }
      hesla[role] = nahodne(20);
      vygenerovana = true;
    }
    if (!hesloStaci(hesla[role])) throw new Error(`Heslo účtu „${role}“ musí mít aspoň ${MIN_DELKA_HESLA} znaků.`);
  }
  return { hesla: /** @type {any} */ (hesla), vygenerovana };
}

/**
 * Pojistka proti omylu: skript zapisuje do databáze, proto se musí potvrdit, NA KTEROU.
 * `--db=<hostitel>` musí přesně odpovídat hostiteli v DATABASE_URL. Tím se nedá spustit
 * naslepo proti té databázi, která zrovna sedí v prostředí (.env.local obvykle míří na produkci).
 */
/** @param {{ url?: string, argv?: string[] }} vstup */
export function kontrolaDatabaze({ url, argv = [] }) {
  if (!url) throw new Error('Chybí DATABASE_URL.');
  let host;
  try { host = new URL(url).hostname; } catch { throw new Error('DATABASE_URL není platná adresa.'); }
  const potvrzeno = arg(argv, 'db');
  if (!potvrzeno) {
    throw new Error(`Skript zapisuje do databáze ${host}. Potvrď to: --db=${host}. Nespouštěj ho proti produkci, demo data patří do zkušební databáze.`);
  }
  if (potvrzeno !== host) throw new Error(`--db=${potvrzeno} neodpovídá hostiteli v DATABASE_URL (${host}).`);
  // Produkce jen vědomě: recenzent obchodu se přihlašuje do produkční aplikace, takže demo podnik tam být MUSÍ,
  // ale ať na to nikdo nenarazí omylem. Hostitele produkce lze pojmenovat v PRODUKCNI_DB_HOST.
  const jeProdukce = process.env.VERCEL_ENV === 'production' || (process.env.PRODUKCNI_DB_HOST && process.env.PRODUKCNI_DB_HOST === host);
  if (jeProdukce && arg(argv, 'produkce') !== 'ANO-ZALOZIT-DEMO') {
    throw new Error(`${host} je produkční databáze. Demo podnik pro recenzenty tam založ jen vědomě: přidej --produkce=ANO-ZALOZIT-DEMO.`);
  }
  return host;
}

const pricti = (den, n) => {
  const d = new Date(`${den}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Dny, na které má demo směny: dnešek a 13 dalších (čtrnáct dní dopředu). */
export function dnyDopredu(dnes, n = 14) {
  return Array.from({ length: n }, (_, i) => pricti(dnes, i));
}

/**
 * Naplní demo podnik. `db` musí umět:
 *   upsert(tabulka, klic, hodnoty, jenPriVytvoreni?) → id   (najde podle klíče, jinak vloží)
 * `hash(heslo)` vrací bcrypt otisk, `dnes` je den (RRRR-MM-DD), `kod()` náhodný kód týmu a karty.
 */
/**
 * @param {{ upsert: (tabulka: string, klic: Record<string, unknown>, hodnoty: Record<string, unknown>, jenPriVytvoreni?: Record<string, unknown>) => Promise<number | null> }} db
 * @param {{ hesla: { provoz: string, zamestnanec: string, host: string }, hash: (h: string) => Promise<string>, dnes: string, domena?: string, kod: (n: number) => string }} volby
 */
export async function seed(db, { hesla, hash, dnes, domena = VYCHOZI_DOMENA, kod }) {
  const ml = emaily(domena);
  const ids = {};

  // ---- Účty ----
  const ucet = async (klicE, hodnoty) => db.upsert('users', { email: ml[klicE] }, hodnoty);
  ids.provoz = await ucet('provoz', { name: 'Petra Recenzentová', password_hash: await hash(hesla.provoz), role: 'employer', avatar: '👔', job_title: 'Provozovatel' });
  ids.zamestnanec = await ucet('zamestnanec', { name: 'Eva Recenzentová', password_hash: await hash(hesla.zamestnanec), role: 'employee', avatar: '🧑‍🍳', job_title: 'Barista' });
  ids.host = await ucet('host', { name: 'Host Recenzent', password_hash: await hash(hesla.host), role: 'customer', avatar: '👤', job_title: 'Host', notif_prefs: { novinky: false } });

  // ---- Podnik ----
  // Kód týmu se vytvoří jednou a nemění (nikdo cizí se přes uhodnutý kód do dema nepřipojí).
  ids.tym = await db.upsert('teams', { name: DEMO_TYM, owner_id: ids.provoz }, {
    plan_override: 'max', currency: 'CZK', business_type: 'cafe',
  }, { join_code: kod(6) });
  for (const k of ['provoz', 'zamestnanec']) await db.upsert('users', { id: ids[k] }, { team_id: ids.tym });
  await db.upsert('team_members', { user_id: ids.provoz, team_id: ids.tym }, { role: 'employer', job_title: 'Provozovatel' });
  await db.upsert('team_members', { user_id: ids.zamestnanec, team_id: ids.tym }, { role: 'employee', job_title: 'Barista', hourly_rate: 200 });

  // ---- Směny na dva týdny dopředu ----
  const typy = {};
  typy.rano = await db.upsert('shift_types', { team_id: ids.tym, name: 'Ranní' }, { start_time: '07:00', end_time: '15:00', color: '#C8F542', position: 1 });
  typy.vecer = await db.upsert('shift_types', { team_id: ids.tym, name: 'Odpolední' }, { start_time: '15:00', end_time: '22:00', color: '#0A84FF', position: 2 });
  for (const [i, den] of dnyDopredu(dnes).entries()) {
    await db.upsert('shifts', { team_id: ids.tym, employee_id: ids.zamestnanec, date: den }, { start_time: i % 2 ? '15:00' : '07:00', end_time: i % 2 ? '22:00' : '15:00', type: i % 2 ? 'Odpolední' : 'Ranní' });
    await db.upsert('shifts', { team_id: ids.tym, employee_id: ids.provoz, date: den }, { start_time: '09:00', end_time: '17:00', type: 'Ranní' });
  }

  // ---- Sklad (dvě položky pod limitem), úkoly, oznámení, chat ----
  const sklad = [
    ['Espresso zrna', 'Káva', 1.5, 3, 'kg'], ['Mléko 3,5 %', 'Mléčné', 4, 12, 'l'], ['Sirup vanilka', 'Sirupy', 6, 2, 'ks'],
    ['Kelímky 0,3 l', 'Obaly', 180, 100, 'ks'], ['Cukr', 'Sypké', 5, 2, 'kg'],
  ];
  for (const [name, category, quantity, min_quantity, unit] of sklad) {
    await db.upsert('inventory_items', { team_id: ids.tym, name }, { category, quantity, min_quantity, critical_quantity: Math.max(1, Math.floor(min_quantity / 2)), unit });
  }
  await db.upsert('tasks', { team_id: ids.tym, title: 'Doplnit mléko do lednice' }, { assigned_to: ids.zamestnanec, created_by: ids.provoz, priority: 'high', status: 'pending', due_date: dnes });
  await db.upsert('tasks', { team_id: ids.tym, title: 'Vyčistit kávovar' }, { assigned_to: ids.zamestnanec, created_by: ids.provoz, priority: 'medium', status: 'pending', due_date: pricti(dnes, 1) });
  await db.upsert('announcements', { team_id: ids.tym, content: 'Vítejte v ukázkovém podniku Café Demo. Všechna data jsou vymyšlená.' }, { author_id: ids.provoz, pinned: true });
  ids.chat = await db.upsert('conversations', { team_id: ids.tym, type: 'team' }, { name: 'Týmový chat' });
  for (const u of [ids.provoz, ids.zamestnanec]) await db.upsert('conversation_members', { conversation_id: ids.chat, user_id: u }, {});
  await db.upsert('chat_messages', { conversation_id: ids.chat, sender_id: ids.provoz, content: 'Dobré ráno, dnes máme rezervaci na šestnáctou.' }, {});
  await db.upsert('chat_messages', { conversation_id: ids.chat, sender_id: ids.zamestnanec, content: 'Rozumím, připravím stoly u okna.' }, {});

  // ---- Managero client: profil, stoly, kupon, kampaň, akce ----
  await db.upsert('client_profiles', { team_id: ids.tym }, {
    slug: DEMO_SLUG, enabled: true, tagline: 'Ukázkový podnik pro vyzkoušení aplikace', description: 'Všechna data jsou vymyšlená.',
    address: 'Ukázková 1, Praha', reservations_on: true, ordering_on: true, loyalty_on: true,
    // Recenzent v podniku fyzicky není: poloha se neověřuje a QR stolu není povinný.
    order_geo: 'off', order_qr_required: false, points_per_100: 5, stamp_target: 8, stamp_reward: 'Káva zdarma', max_party: 8,
  });
  const stoly = [];
  for (const [i, name] of ['Stůl 1', 'Stůl 2', 'Stůl u okna'].entries()) {
    stoly.push(await db.upsert('client_tables', { team_id: ids.tym, name }, { seats: 2 + i, active: true, position: i }, { token: kod(16) }));
  }
  ids.stoly = stoly;
  await db.upsert('client_coupons', { team_id: ids.tym, title: 'Zákusek k nápoji zdarma' }, { description: 'Jednou na návštěvu', cost_points: 20, kind: 'offer', active: true });
  await db.upsert('client_stamp_campaigns', { team_id: ids.tym, name: 'Osmá káva zdarma' }, { description: 'Za každý nápoj razítko', active: true, required_stamps: 8, reward_title: 'Káva zdarma', position: 1 });
  await db.upsert('events', { team_id: ids.tym, title: 'Degustace kávy', date: pricti(dnes, 7) }, { description: 'Ukázková veřejná akce', kind: 'event', start_time: '18:00', end_time: '20:00', public: true, status: 'planned', created_by: ids.provoz });

  // ---- Host: karta a členství s body, ať je v aplikaci co ukázat ----
  await db.upsert('client_cards', { customer_id: ids.host }, {}, { code: kod(8) });
  await db.upsert('client_memberships', { customer_id: ids.host, team_id: ids.tym }, { points: 35, stamps: 3, visits: 4 });

  return { ids, emaily: ml };
}
