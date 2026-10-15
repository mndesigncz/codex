// Ověření e-mailu vedení (spuštění, balík S): jen banner a záznam, nic neblokuje.
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { OVERENI_PLATNOST_MIN, nabizetOvereni, cestaOvereniEmailu, stavOvereni, tokenSediKUctu } from '../../lib/overeniEmailu.ts';
import { ZACHAZENI_TABULEK, OSOBNI_UDAJE, RESET_SLOUPCU } from '../../lib/smazaniUctu.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  eq('platnost: 48 hodin', OVERENI_PLATNOST_MIN, 2880);
  ok('nabídka: jen s RESEND_API_KEY', nabizetOvereni({ RESEND_API_KEY: 're_x' }) && !nabizetOvereni({}) && !nabizetOvereni({ RESEND_API_KEY: '  ' }));
  eq('odkaz: stránka ověření', cestaOvereniEmailu('ab_c-1'), '/overit-email?token=ab_c-1');
  eq('stav: ověřený je ověřený i bez odesílání', stavOvereni({ overenoAt: '2026-10-15', zahajeno: true, nabizi: false }), 'overeno');
  eq('stav: bez odesílání se nenabízí', stavOvereni({ overenoAt: null, zahajeno: true, nabizi: false }), 'nenabizi');
  eq('stav: odkaz poslaný a nepotvrzený = banner', stavOvereni({ overenoAt: null, zahajeno: true, nabizi: true }), 'ceka');
  eq('stav: starý účet bez odkazu = jen nabídka v Nastavení, žádný banner', stavOvereni({ overenoAt: null, zahajeno: false, nabizi: true }), 'nezahajeno');
  ok('token: e-mail účtu se nesměl změnit', tokenSediKUctu('Jan@Firma.cz', 'jan@firma.cz') && !tokenSediKUctu('jan@firma.cz', 'eva@firma.cz') && !tokenSediKUctu('', ''));

  const reg = cti('app/api/register/route.ts');
  ok('registrace: odkaz až po odpovědi (after), registrace na e-mailu nezávisí', /after\(\(\) => posliOvereni\(Number\(user\.id\)\)/.test(reg));
  const db = cti('lib/overeniEmailuDb.ts');
  ok('potvrzení: jednorázové (UPDATE … used_at IS NULL)', /SET used_at = NOW\(\) WHERE token_hash = \$\{hash\} AND used_at IS NULL RETURNING user_id/.test(db));
  ok('potvrzení: jen záznam email_verified_at, nic se nezamyká', /SET email_verified_at = COALESCE\(email_verified_at, NOW\(\)\)/.test(db));
  ok('databáze: jen otisk tokenu', /INSERT INTO email_verifications \(token_hash/.test(db) && /novyToken\(\)/.test(db));
  ok('e-mail jde přes lib/email', /sendEmailVerification/.test(db) && /export async function sendEmailVerification/.test(cti('lib/email.ts')));
  const api = cti('app/api/account/overeni-emailu/route.ts');
  ok('API: znovu nejvýš 3× za hodinu', /hit\(`overeni-email:\$\{me\.id\}`, OVERENI_ZNOVU_ZA_HODINU, 60 \* 60\)/.test(api));
  ok('API: jen vedení', /me\.role !== 'employer'/.test(api));
  ok('nic neblokuje: email_verified_at nečte žádná brána', !/email_verified_at/.test(cti('lib/auth.ts')) && !/email_verified_at/.test(cti('middleware.ts')));
  const init = cti('app/api/init/route.ts');
  ok('init: sloupec a tabulka', /ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP/.test(init) && /CREATE TABLE IF NOT EXISTS email_verifications/.test(init));
  ok('smazání účtu: odkazy se smažou, příznak vynuluje', ZACHAZENI_TABULEK.email_verifications === 'smazat' && OSOBNI_UDAJE.email_verifications?.zpusob === 'smazat' && RESET_SLOUPCU.some(([c]) => c === 'email_verified_at'));
  ok('ukázka zná endpoint', /\/api\/account\/overeni-emailu/.test(cti('lib/demo/routy/zaklad.ts')));
  ok('banner v aplikaci vedení', /<PotvrditEmailBanner \/>/.test(cti('components/employer/EmployerLayout.tsx')));
}
