// Kolo 77 — smazání účtu, jednorázové odkazy (heslo, smazání z webu), moderace
// obsahu a demo účty pro recenzenty. Čistá logika bez databáze.
//
// Smazání účtu se ověřuje na záznamníku dotazů: test sleduje, které tabulky
// se dotknou u hosta, zaměstnance a vlastníka podniku, a hlídá, že schéma
// (DDL v app/api/init/route.ts) nemá tabulku s odkazem na uživatele, o které
// smazání neví.

import { createHash } from 'node:crypto';
import type { Testy } from './_testy.ts';
import {
  rozhodniSmazani, planUzivatele, planPodniku, anonymizaceBezMigrace, proved, jeChybejiciObjekt,
  ZACHAZENI_TABULEK, OSOBNI_UDAJE, RESET_SLOUPCU, TYMOVE_TABULKY, TYMOVE_PONECHAT, TYMOVE_NEPRIME, POTVRZENI_PODNIKU, type Krok,
} from '../../lib/smazaniUctu.ts';
import {
  hashTokenu, novyToken, vypadaJakoToken, jePlatny, vyprseni, hesloStaci, cestaObnoveniHesla, RESET_PLATNOST_MIN,
} from '../../lib/jednorazovyToken.ts';
import {
  platneNahlaseni, vyfiltrujZablokovane, smiSmazatZpravu, smiZablokovat, stavPoAkci, opisObsahu, nazevDuvodu, DUVODY,
} from '../../lib/moderace.ts';
import { nactiSchema, SLOUPCE_NA_UZIVATELE, SLOUPCE_OSOBNI_UDAJE } from '../ddl-schema.mjs';
import {
  seed, nactiHesla, kontrolaDatabaze, emaily, dnyDopredu, hesloStaci as hesloRecenzenta, DEMO_TYM, DEMO_SLUG, MIN_DELKA_HESLA,
} from '../seed-recenzent-jadro.mjs';

const schema: Map<string, Set<string>> = nactiSchema();

export default async function ({ eq, ok }: Testy) {
  // ---- rozhodnutí o smazání ----
  const vlast = (dalsi: number) => [{ id: 7, nazev: 'Kavárna', dalsiClenove: dalsi }];
  eq('smazání: host bez podniku smí', rozhodniSmazani({ superadmin: false, vlastnene: [], smazatPodnik: false }), { ok: true, smazatPodniky: [] });
  ok('smazání: správce platformy ne (403)', (() => { const r = rozhodniSmazani({ superadmin: true, vlastnene: [], smazatPodnik: false }); return !r.ok && r.status === 403; })());
  const sCleny = rozhodniSmazani({ superadmin: false, vlastnene: vlast(3), smazatPodnik: false });
  ok('smazání: vlastník s dalšími členy bez volby podniku ne (409)', !sCleny.ok && sCleny.status === 409 && sCleny.kod === 'VLASTNIK_S_CLENY' && /Kavárna/.test(sCleny.zprava));
  const sam = rozhodniSmazani({ superadmin: false, vlastnene: vlast(0), smazatPodnik: false });
  ok('smazání: vlastník bez členů musí výslovně potvrdit podnik (409)', !sam.ok && sam.status === 409 && sam.kod === 'VLASTNIK_PODNIKU');
  ok('smazání: smazat podnik vyžaduje slovo SMAZAT (400)', (() => { const r = rozhodniSmazani({ superadmin: false, vlastnene: vlast(2), smazatPodnik: true, potvrzeni: 'smazat' }); return !r.ok && r.status === 400 && r.kod === 'POTVRZENI'; })());
  eq('smazání: s potvrzením se smažou všechny vlastněné podniky', rozhodniSmazani({ superadmin: false, vlastnene: [{ id: 1, nazev: 'A', dalsiClenove: 2 }, { id: 2, nazev: 'B', dalsiClenove: 0 }], smazatPodnik: true, potvrzeni: POTVRZENI_PODNIKU }), { ok: true, smazatPodniky: [1, 2] });
  ok('smazání: správce má přednost i před potvrzením podniku', !rozhodniSmazani({ superadmin: true, vlastnene: vlast(0), smazatPodnik: true, potvrzeni: 'SMAZAT' }).ok);

  // ---- kroky pro hosta, zaměstnance, vlastníka ----
  const tabulky = (kroky: Krok[]) => kroky.map(k => k.text.match(/(?:FROM|UPDATE)\s+(\w+)/)?.[1] ?? '');
  const host = planUzivatele({ id: 5, email: 'host@x.cz', role: 'customer', hash: '!x', dnes: '2026-09-30' });
  const zam = planUzivatele({ id: 6, email: 'eva@x.cz', role: 'employee', hash: '!x', dnes: '2026-09-30' });
  for (const t of ['client_cards', 'client_memberships', 'client_loyalty_ledger', 'client_stamp_progress', 'client_coupon_claims', 'client_promo_uses', 'client_group_members', 'client_event_follows', 'client_reviews', 'client_bill_awards', 'push_subscriptions', 'device_tokens', 'notifications', 'password_resets']) {
    ok(`smazání hosta: maže ${t}`, tabulky(host).includes(t));
  }
  ok('smazání hosta: ruší budoucí rezervace a maže poznámky', host.some(k => /client_reservations SET status = 'cancelled'/.test(k.text)) && host.some(k => /client_orders SET note = NULL/.test(k.text)));
  ok('smazání zaměstnance: nemaže hostovské tabulky, ale pryč z podniků a chatu', !tabulky(zam).includes('client_cards') && tabulky(zam).includes('team_members') && tabulky(zam).includes('conversation_members'));
  ok('smazání: nemaže směny ani docházku (patří podniku)', !tabulky(zam).includes('shifts') && !tabulky(zam).includes('time_entries'));
  for (const kroky of [host, zam]) {
    const posledni = kroky[kroky.length - 1];
    ok('smazání: poslední krok je povinná anonymizace řádku users', posledni.povinny && /UPDATE users SET/.test(posledni.text) && /deleted_at = NOW\(\)/.test(posledni.text));
    ok('smazání: e-mail se anonymizuje unikátně podle id a heslo se znehodnotí', /^smazan-\d+@managero\.invalid$/.test(String(posledni.params[2])) && String(posledni.params[3]).startsWith('!'));
    ok('smazání: všechny kroky před anonymizací jsou volitelné (tabulka před migrací nesmí smazání shodit)', kroky.slice(0, -1).every(k => !k.povinny));
  }
  ok('smazání: záložní anonymizace bez nových sloupců', !/deleted_at|notif_prefs/.test(anonymizaceBezMigrace({ id: 1, role: 'employee', hash: '!x' }).text));
  ok('smazání: jméno podle role', planUzivatele({ id: 1, email: 'a@b.c', role: 'customer', hash: '!', dnes: '2026-01-01' }).at(-1)!.params[1] === 'Smazaný host'
    && planUzivatele({ id: 1, email: 'a@b.c', role: 'employer', hash: '!', dnes: '2026-01-01' }).at(-1)!.params[1] === 'Smazaný uživatel');

  // ---- pokrytí schématu: žádná tabulka s odkazem na uživatele bez rozhodnutí ----
  const bezRozhodnuti: string[] = [];
  for (const [tabulka, sloupce] of schema) {
    if (tabulka === 'users') continue;
    if ([...sloupce].some(s => SLOUPCE_NA_UZIVATELE.test(s)) && !(tabulka in ZACHAZENI_TABULEK)) bezRozhodnuti.push(tabulka);
  }
  eq('schéma: každá tabulka s odkazem na uživatele má v lib/smazaniUctu rozhodnutí', bezRozhodnuti, []);
  const nadbytecne = Object.keys(ZACHAZENI_TABULEK).filter(t => !schema.has(t));
  eq('schéma: rozhodnutí neodkazují na neexistující tabulky', nadbytecne, []);
  ok('schéma: hostovské tabulky jsou k smazání, ne k ponechání', ['client_cards', 'client_memberships', 'client_reviews'].every(t => ZACHAZENI_TABULEK[t] === 'smazat'));

  // ---- smazání podniku ----
  const tymSTeamId = [...schema].filter(([t, s]) => s.has('team_id') && t !== 'users').map(([t]) => t);
  const nepokryte = tymSTeamId.filter(t => !TYMOVE_TABULKY.includes(t) && !TYMOVE_PONECHAT.includes(t));
  eq('podnik: každá tabulka s team_id se smaže se podnikem, nebo je výslovně ponechána', nepokryte, []);
  eq('podnik: seznam smazání neobsahuje neexistující tabulky', TYMOVE_TABULKY.filter(t => !schema.has(t) && t !== 'content_reports'), []);
  eq('podnik: nepřímé tabulky existují a mažou se před rodiči', [TYMOVE_NEPRIME.filter(n => !schema.has(n.tabulka)).map(n => n.tabulka), planPodniku(3, 1).findIndex(k => /DELETE FROM chat_messages/.test(k.text)) < planPodniku(3, 1).findIndex(k => /DELETE FROM conversations/.test(k.text))], [[], true]);
  const pp = planPodniku(3, 1);
  ok('podnik: nakonec povinně smaže tým a uvolní ostatní členy', pp.at(-1)!.povinny && /DELETE FROM teams WHERE id = \$1/.test(pp.at(-1)!.text) && pp.some(k => /UPDATE users SET team_id = NULL WHERE team_id = \$1 AND id <> \$2/.test(k.text)));
  ok('podnik: účetní záznamy platformy (fakturace) se nemažou', !pp.some(k => /billing_events|referral_rewards|admin_audit/.test(k.text)));
  ok('podnik: každý dotaz je omezený na tenhle podnik (parametr $1)', pp.filter(k => /DELETE FROM/.test(k.text)).every(k => /\$1/.test(k.text)));


  // ---- osobní údaje mimo users: každá tabulka má zacházení a skutečný krok ----
  const vsechnyKroky = [...planUzivatele({ id: 9, email: 'Eva@X.cz', role: 'employer', hash: '!x', dnes: '2026-09-30' }), ...planPodniku(3, 9)];
  const kMaKrok = (t: string) => vsechnyKroky.some(k => new RegExp(`(FROM|UPDATE)\\s+${t}\\b`).test(k.text));
  const osobniBez: string[] = [];
  for (const [tabulka, sloupce] of schema) {
    if (tabulka !== 'users' && [...sloupce].some(c => SLOUPCE_OSOBNI_UDAJE.test(c)) && !(tabulka in OSOBNI_UDAJE)) osobniBez.push(tabulka);
  }
  eq('osobní údaje: každá tabulka s e-mailem, telefonem, volným textem, souborem nebo Stripe má zacházení', osobniBez, []);
  eq('osobní údaje: zacházení neodkazuje na neexistující tabulky', Object.keys(OSOBNI_UDAJE).filter(t => !schema.has(t)), []);
  eq('osobní údaje: co se slibuje smazat nebo anonymizovat, má v plánu krok', Object.entries(OSOBNI_UDAJE).filter(([t, d]) => d.zpusob !== 'ponechat' && t !== 'users' && !kMaKrok(t)).map(([t]) => t), []);
  eq('osobní údaje: účetní záznamy platformy plán nemění', Object.entries(OSOBNI_UDAJE).filter(([t, d]) => d.zpusob === 'ponechat' && kMaKrok(t)).map(([t]) => t), []);
  ok('osobní údaje: každé zacházení je popsané', Object.values(OSOBNI_UDAJE).every(d => d.co.length >= 20));
  const vlastnik = planUzivatele({ id: 9, email: 'Eva@X.cz', role: 'employer', hash: '!x', dnes: '2026-09-30' });
  const krok = (re: RegExp) => vlastnik.find(k => re.test(k.text));
  const pozv = krok(/DELETE FROM invitations/);
  ok('smazání: pozvánky se mažou podle e-mailu (bez ohledu na velikost písmen) i podle pozvávajícího', !!pozv && /LOWER\(email\) = LOWER\(\$2\)/.test(pozv.text) && /invited_by = \$1/.test(pozv.text) && pozv.params[1] === 'Eva@X.cz');
  ok('smazání: soubory mimo podnik se mažou, soubory podniku se odpojí od osoby a přejmenují', !!krok(/DELETE FROM uploads WHERE user_id = \$1 AND team_id IS NULL/) && !!krok(/UPDATE uploads SET user_id = NULL, name = /));
  ok('smazání: volný text protokolu a nahlášení se vymaže, záznam o smazání zůstane', !!krok(/UPDATE audit_log SET detail = NULL[\s\S]*NOT IN \('ucet\.smazan', 'podnik\.smazan', 'ucet\.stripe_chyba'\)/) && !!krok(/UPDATE content_reports SET detail = NULL WHERE reporter_id/) && !!krok(/UPDATE content_reports SET snapshot = NULL WHERE reported_user_id/));
  for (const c of ['pin', 'pin_hash', 'hourly_rate', 'max_consecutive_days', 'max_month_hours', 'job_title', 'active_team_id', 'shift_preference', 'split_shifts_ok']) {
    ok(`smazání: users.${c} se vynuluje samostatným volitelným krokem`, RESET_SLOUPCU.some(([s]) => s === c) && vlastnik.some(k => !k.povinny && new RegExp(`UPDATE users SET ${c} = `).test(k.text)) && schema.get('users')!.has(c));
  }
  ok('smazání: mzdová sazba se nuluje na 0, ne na NULL', vlastnik.some(k => /UPDATE users SET hourly_rate = 0 WHERE/.test(k.text)));
  ok('smazání: všechny kroky před anonymizací zůstávají volitelné i s novými kroky', vlastnik.slice(0, -1).every(k => !k.povinny) && vlastnik.at(-1)!.povinny);
  ok('smazání: prázdná organizace vlastníka se smaže', !!krok(/DELETE FROM organizations WHERE owner_id = \$1[\s\S]*NOT EXISTS/));
  const orgKrok = pp.findIndex(k => /DELETE FROM organizations/.test(k.text));
  ok('podnik: organizace se maže s posledním podnikem, před odpojením a před smazáním týmu', orgKrok >= 0 && /NOT EXISTS \(SELECT 1 FROM teams WHERE organization_id = organizations\.id AND id <> \$1\)/.test(pp[orgKrok].text)
    && orgKrok < pp.findIndex(k => /SET organization_id = NULL/.test(k.text)) && orgKrok < pp.findIndex(k => /DELETE FROM teams WHERE id/.test(k.text)) && !pp[orgKrok].povinny);
  ok('podnik: soubory a protokol podniku se mažou s ním', ['uploads', 'audit_log', 'content_reports', 'invitations'].every(t => pp.some(k => new RegExp(`DELETE FROM ${t} WHERE team_id`).test(k.text))));

  // ---- provádění: přeskočí chybějící tabulku, jinou chybu nepřežije ----
  const zapsano: string[] = [];
  const vysl = await proved(async (text) => {
    if (/device_tokens/.test(text)) throw new Error('relation "device_tokens" does not exist');
    zapsano.push(text);
  }, host);
  ok('provádění: chybějící tabulka (před migrací) se přeskočí a smazání doběhne', vysl.some(v => v.stav === 'preskoceno') && zapsano.at(-1)!.includes('UPDATE users SET'));
  let spadlo = '';
  try { await proved(async (text) => { if (/notifications/.test(text)) throw new Error('connection reset'); }, host); } catch (e) { spadlo = String((e as Error).message); }
  eq('provádění: jiná chyba u volitelného kroku smazání přeruší (osobní údaje nesmí zůstat za potvrzením)', spadlo, 'connection reset');
  ok('provádění: rozpoznání chybějícího objektu', jeChybejiciObjekt(new Error('column "deleted_at" of relation "users" does not exist')) && !jeChybejiciObjekt(new Error('timeout')));
  const znovu: string[] = [];
  await proved(async (t) => { znovu.push(t); }, host);
  await proved(async (t) => { znovu.push(t); }, host);
  eq('provádění: opakované volání je bezpečné (stejné kroky podruhé)', znovu.length, host.length * 2);

  // ---- jednorázové odkazy ----
  const t = novyToken();
  ok('token: 256 bitů, base64url, v databázi jen otisk', t.token.length === 43 && vypadaJakoToken(t.token) && t.hash === hashTokenu(t.token) && t.hash === createHash('sha256').update(t.token).digest('hex') && t.hash !== t.token);
  ok('token: dva různé', novyToken().token !== novyToken().token);
  ok('token: smetí ze vstupu se odmítne', !vypadaJakoToken('abc') && !vypadaJakoToken('a'.repeat(200)) && !vypadaJakoToken(null) && !vypadaJakoToken('x y'.repeat(20)) && !vypadaJakoToken({}));
  const ted = new Date('2026-09-30T12:00:00Z');
  ok('token: platí jen nevypršený a nepoužitý', jePlatny({ expires_at: vyprseni(RESET_PLATNOST_MIN, ted), used_at: null }, ted)
    && !jePlatny({ expires_at: new Date(ted.getTime() - 1000), used_at: null }, ted)
    && !jePlatny({ expires_at: vyprseni(60, ted), used_at: ted }, ted) && !jePlatny(null, ted) && !jePlatny({ expires_at: 'nesmysl', used_at: null }, ted));
  eq('token: platí hodinu', vyprseni(60, ted).toISOString(), '2026-09-30T13:00:00.000Z');
  ok('heslo: aspoň 8 znaků', hesloStaci('12345678') && !hesloStaci('1234567') && !hesloStaci(undefined) && !hesloStaci(12345678));
  eq('odkaz na obnovení hesla: host do hostovské části, ostatní do provozní', [cestaObnoveniHesla('customer', 'tok'), cestaObnoveniHesla('employer', 'tok'), cestaObnoveniHesla('employee', 'a b')], ['/client/nove-heslo?token=tok', '/nove-heslo?token=tok', '/nove-heslo?token=a%20b']);

  // ---- moderace ----
  eq('nahlášení: platné tělo', platneNahlaseni({ kind: 'zprava', refId: 12, reason: 'spam', detail: '  hodně reklamy  ' }), { ok: true, kind: 'zprava', refId: 12, reason: 'spam', detail: 'hodně reklamy' });
  ok('nahlášení: neznámý druh, důvod a id se odmítnou', !platneNahlaseni({ kind: 'recenze', refId: 1, reason: 'spam' }).ok && !platneNahlaseni({ kind: 'napad', refId: 1, reason: 'cokoli' }).ok && !platneNahlaseni({ kind: 'napad', refId: -4, reason: 'spam' }).ok && !platneNahlaseni(null).ok);
  ok('nahlášení: detail se ořízne a prázdný je null', (() => { const r = platneNahlaseni({ kind: 'napad', refId: 1, reason: 'jine', detail: 'x'.repeat(900) }); const p = platneNahlaseni({ kind: 'napad', refId: 1, reason: 'jine', detail: '  ' }); return r.ok && r.detail!.length === 500 && p.ok && p.detail === null; })());
  ok('důvody: pět, každý s názvem', DUVODY.length === 5 && DUVODY.every(d => nazevDuvodu(d.id) === d.nazev) && nazevDuvodu('???') === 'Jiný důvod');
  eq('opis obsahu: zkrátí a zjednoduší mezery', [opisObsahu('  ahoj \n  světe  '), opisObsahu('a'.repeat(400)).length, opisObsahu(null, '/u/1'), opisObsahu(null)], ['ahoj světe', 298, '[příloha]', '']);
  eq('akce nad nahlášením → stav', [stavPoAkci('odstranit'), stavPoAkci('vyreseno'), stavPoAkci('zamitnout'), stavPoAkci('smazat')], ['removed', 'resolved', 'dismissed', null]);
  const zpravy = [{ id: 1, senderId: 2 }, { id: 2, senderId: 3 }, { id: 3, senderId: 9 }, { id: 4, senderId: 3 }];
  eq('blokace: zprávy zablokovaných se skryjí', vyfiltrujZablokovane(zpravy, new Set([3])).map(z => z.id), [1, 3]);
  eq('blokace: bez blokací se nic neskrývá', vyfiltrujZablokovane(zpravy, new Set()).length, 4);
  eq('blokace: vlastní zprávy se nikdy neskrývají', vyfiltrujZablokovane(zpravy, new Set([9]), 9).map(z => z.id), [1, 2, 3, 4]);
  ok('mazání zprávy: autor nebo moderátor, cizí ne', smiSmazatZpravu({ meId: 1, autorId: 1, moderator: false }) && smiSmazatZpravu({ meId: 1, autorId: 2, moderator: true }) && !smiSmazatZpravu({ meId: 1, autorId: 2, moderator: false }));
  ok('blokace: sebe ne, neplatné id ne', !smiZablokovat(4, 4) && !smiZablokovat(4, 0) && !smiZablokovat(4, NaN) && smiZablokovat(4, 5));
  ok('schéma moderace: tabulky content_reports a user_blocks mají sloupce, které kód používá',
    ['team_id', 'reporter_id', 'reported_user_id', 'kind', 'ref_id', 'reason', 'detail', 'snapshot', 'status', 'resolved_by', 'resolved_at'].every(c => schema.get('content_reports')?.has(c))
    && ['blocker_id', 'blocked_id'].every(c => schema.get('user_blocks')?.has(c)));
  ok('schéma obalu: device_tokens, password_resets, account_delete_requests, users.deleted_at',
    ['user_id', 'app', 'platform', 'token', 'env'].every(c => schema.get('device_tokens')?.has(c))
    && ['token_hash', 'user_id', 'expires_at', 'used_at'].every(c => schema.get('password_resets')?.has(c) && schema.get('account_delete_requests')?.has(c))
    && schema.get('users')!.has('deleted_at') && schema.get('users')!.has('terms_accepted_at'));

  // ---- demo účty pro recenzenty: jádro seedu na paměťové atrapě ----
  // Paměťová atrapa databáze: řádky v poli, hledání podle klíče jako v SQL (WHERE všechny sloupce klíče sedí).
  const uloziste = new Map<string, Record<string, unknown>[]>();
  let nextId = 100;
  const neplatne: string[] = [];
  const db = {
    async upsert(tabulka: string, klic: Record<string, unknown>, hodnoty: Record<string, unknown>, jenNove: Record<string, unknown> = {}) {
      const sloupce = schema.get(tabulka);
      if (!sloupce) neplatne.push(`tabulka ${tabulka}`);
      for (const k of [...Object.keys(klic), ...Object.keys(hodnoty), ...Object.keys(jenNove)]) if (sloupce && !sloupce.has(k)) neplatne.push(`${tabulka}.${k}`);
      const radky = uloziste.get(tabulka) ?? [];
      uloziste.set(tabulka, radky);
      const radek = radky.find(r => Object.entries(klic).every(([k, v]) => r[k] === v));
      if (radek) { Object.assign(radek, hodnoty); return (radek.id ?? radek.team_id ?? radek.customer_id ?? null) as number | null; }
      const novy: Record<string, unknown> = { ...klic, ...hodnoty, ...jenNove };
      // Tabulky s přirozeným primárním klíčem (team_id, customer_id) id nemají.
      if (tabulka !== 'client_profiles' && tabulka !== 'client_cards') novy.id = nextId++;
      radky.push(novy);
      return (novy.id ?? novy.team_id ?? novy.customer_id ?? null) as number | null;
    },
  };
  const hesla = { provoz: 'Provoz-Heslo-1234', zamestnanec: 'Zam-Heslo-56789', host: 'Host-Heslo-9876' };
  let pocetKodu = 0;
  const volby = { hesla, hash: async (h: string) => `hash:${h}`, dnes: '2026-09-30', kod: (n: number) => 'K'.repeat(n) + String(pocetKodu++) };
  const v1 = await seed(db, volby);
  const po1 = [...uloziste].map(([t, m]) => [t, m.length] as const);
  const v2 = await seed(db, { ...volby, kod: () => 'JINY' });
  const po2 = [...uloziste].map(([t, m]) => [t, m.length] as const);
  eq('seed: sloupce a tabulky existují v DDL', neplatne, []);
  eq('seed: opakované spuštění nezdvojí žádný řádek (idempotence)', po2, po1);
  eq('seed: stejná id podruhé', v2.ids, v1.ids);
  const users = uloziste.get('users')!;
  ok('seed: tři účty s rolemi vlastník, zaměstnanec, host', users.length === 3 && ['employer', 'employee', 'customer'].every(r => users.some(u => u.role === r)));
  ok('seed: hesla jsou jen jako otisk, nikde otevřeně', JSON.stringify([...uloziste]).includes('hash:Provoz-Heslo-1234') && !JSON.stringify([...uloziste]).replace(/hash:[A-Za-z0-9-]+/g, '').includes('Heslo'));
  ok('seed: e-maily jsou na nedoručitelné doméně, ne na skutečné', Object.values(v1.emaily).every(e => e.endsWith('@managero.invalid')) && users.every(u => String(u.email).endsWith('@managero.invalid')));
  const tym = uloziste.get('teams')![0];
  ok('seed: tým Café Demo má plán Max a kód, který se při opakování nemění', tym.name === DEMO_TYM && tym.plan_override === 'max' && String(tym.join_code).startsWith('KKKKKK'));
  const profil = uloziste.get('client_profiles')![0];
  ok('seed: podnik je v adresáři hostů a objednávka od stolu nevyžaduje polohu ani QR', profil.slug === DEMO_SLUG && profil.enabled === true && profil.order_geo === 'off' && profil.order_qr_required === false && profil.ordering_on === true && profil.loyalty_on === true && profil.reservations_on === true);
  ok('seed: tři stoly s tokenem, kupon, kampaň, veřejná akce, karta a členství hosta',
    uloziste.get('client_tables')!.length === 3 && uloziste.get('client_tables')!.every(s => typeof s.token === 'string' && String(s.token).length >= 16)
    && uloziste.get('client_coupons')!.length === 1 && uloziste.get('client_stamp_campaigns')!.length === 1 && uloziste.get('events')![0].public === true
    && uloziste.get('client_cards')!.length === 1 && uloziste.get('client_memberships')![0].points === 35);
  eq('seed: směny na čtrnáct dní pro dva lidi', uloziste.get('shifts')!.length, 28);
  ok('seed: dvě položky skladu pod limitem', uloziste.get('inventory_items')!.filter(i => Number(i.quantity) < Number(i.min_quantity)).length === 2);
  ok('seed: žádná vazba na platby ani pokladnu', !uloziste.has('pos_connections') && !users.some(u => 'stripe_customer_id' in u));
  eq('seed: dny dopředu nezávisí na čase běhu, jen na předaném dni', [dnyDopredu('2026-09-30', 3), dnyDopredu('2026-12-30', 3)], [['2026-09-30', '2026-10-01', '2026-10-02'], ['2026-12-30', '2026-12-31', '2027-01-01']]);

  // hesla a pojistky spuštění
  const chyba = (fn: () => unknown) => { try { fn(); return ''; } catch (e) { return (e as Error).message; } };
  ok('seed: bez hesla skript skončí chybou, žádné výchozí heslo', /Chybí heslo/.test(chyba(() => nactiHesla({ argv: [], env: {} }))));
  ok('seed: krátké heslo se odmítne', /aspoň 12/.test(chyba(() => nactiHesla({ argv: ['--heslo=kratke'], env: {} }))));
  eq('seed: společné heslo z argumentu pro všechny účty', nactiHesla({ argv: ['--heslo=DlouheHeslo12345'], env: {} }), { hesla: { provoz: 'DlouheHeslo12345', zamestnanec: 'DlouheHeslo12345', host: 'DlouheHeslo12345' }, vygenerovana: false });
  eq('seed: hesla z prostředí po rolích', nactiHesla({ argv: [], env: { RECENZENT_HESLO_PROVOZ: 'Provoz-Heslo-1234', RECENZENT_HESLO_ZAMESTNANEC: 'Zam-Heslo-56789', RECENZENT_HESLO_HOST: 'Host-Heslo-9876' } }).hesla, hesla);
  const gen = nactiHesla({ argv: ['--generuj'], env: {}, nahodne: (n: number) => 'x'.repeat(n) });
  ok('seed: --generuj vytvoří hesla a řekne to', gen.vygenerovana && Object.values(gen.hesla).every(h => h.length === 20));
  ok('seed: pojistka databáze: bez --db skončí, s jiným hostitelem skončí, se správným projde',
    /Potvrď/.test(chyba(() => kontrolaDatabaze({ url: 'postgres://u:p@ep-zkusebni.neon.tech/db', argv: [] })))
    && /neodpovídá/.test(chyba(() => kontrolaDatabaze({ url: 'postgres://u:p@ep-zkusebni.neon.tech/db', argv: ['--db=jiny.host'] })))
    && kontrolaDatabaze({ url: 'postgres://u:p@ep-zkusebni.neon.tech/db', argv: ['--db=ep-zkusebni.neon.tech'] }) === 'ep-zkusebni.neon.tech'
    && /DATABASE_URL/.test(chyba(() => kontrolaDatabaze({ url: '', argv: [] }))));
  ok('seed: minimální délka hesla recenzenta', MIN_DELKA_HESLA >= 12 && hesloRecenzenta('x'.repeat(12)) && !hesloRecenzenta('x'.repeat(11)));
  eq('seed: e-maily účtů podle domény', emaily('priklad.test'), { provoz: 'recenzent-provoz@priklad.test', zamestnanec: 'recenzent-zamestnanec@priklad.test', host: 'recenzent-host@priklad.test' });
}
