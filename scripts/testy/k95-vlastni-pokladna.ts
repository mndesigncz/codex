// Vlastní pokladna (Stripe Checkout Sessions, ui_mode 'elements'): co se liší podle režimu,
// příprava relace před potvrzením (IČO, souhlas), IČO z relace pro webhook (staré i nové relace)
// a vzhled platebních polí podle tokenů Manageru.
import { readFileSync, existsSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { rezimZTela, parametryRezimu, metadataZalozeni, overPripravu, relacePatriPodniku, metadataPripravy, KLIC_SOUHLASU } from '../../lib/pokladnaRezim.ts';
import { icoZRelace, KLIC_POLE_ICO } from '../../lib/icoPokladna.ts';
import { vzhledPokladny, pismaPokladny, CESTA_PISMA } from '../../lib/pokladnaVzhled.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  // ---- režim z těla požadavku ----
  eq('režim: ui elements / starší embedded / hostovaná', [rezimZTela({ ui: 'elements' }), rezimZTela({ embedded: true }), rezimZTela({}), rezimZTela(null), rezimZTela({ ui: 'cokoli' })],
    ['elements', 'embedded', 'hosted', 'hosted', 'hosted']);

  // ---- parametry relace podle režimu ----
  const o = { icoPodniku: '27082440', jazyk: 'cs', souhlas: true, navrat: 'https://x/ok', zruseno: 'https://x/zpet' };
  const el = parametryRezimu('elements', o) as Record<string, unknown>;
  ok('elements: ui_mode elements a return_url (3D Secure, Klarna)', el.ui_mode === 'elements' && el.return_url === 'https://x/ok');
  ok('elements: bez custom_fields, custom_text a consent_collection (Stripe je v režimu elements nepovoluje / bez bety nejde zaplatit)',
    !('custom_fields' in el) && !('custom_text' in el) && !('consent_collection' in el));
  ok('elements: bez success_url, cancel_url a redirect_on_completion', !('success_url' in el) && !('cancel_url' in el) && !('redirect_on_completion' in el));
  const ho = parametryRezimu('hosted', o);
  ok('hostovaná: povinné IČO v custom_fields, souhlas přes consent_collection, success/cancel',
    ho.custom_fields?.[0]?.key === KLIC_POLE_ICO && ho.custom_fields?.[0]?.optional === false && ho.consent_collection?.terms_of_service === 'required'
    && ho.success_url === 'https://x/ok' && ho.cancel_url === 'https://x/zpet' && ho.ui_mode === undefined);
  ok('hostovaná bez STRIPE_SOUHLAS_PODMINEK: žádné consent_collection', !('consent_collection' in parametryRezimu('hosted', { ...o, souhlas: false })));
  const em = parametryRezimu('embedded', o);
  ok('starší vložená: embedded_page, if_required, return_url, IČO i souhlas jako dřív',
    em.ui_mode === 'embedded_page' && em.redirect_on_completion === 'if_required' && em.return_url === 'https://x/ok' && em.custom_fields?.length === 1 && !!em.consent_collection);
  eq('metadata při založení: IČO z profilu jen u elements a jen platné',
    [metadataZalozeni('elements', '27082440'), metadataZalozeni('elements', '27082441'), metadataZalozeni('hosted', '27082440')],
    [{ ico: '27082440' }, {}, {}]);

  // ---- příprava před potvrzením (PATCH /api/billing/checkout) ----
  const sid = 'cs_test_a1B2c3D4e5F6g7';
  eq('příprava: platná', overPripravu({ sessionId: sid, ico: '270 824 40', souhlas: true }, { souhlasPovinny: true }), { ok: true, sessionId: sid, ico: '27082440', souhlas: true });
  eq('příprava: špatný součet IČO', overPripravu({ sessionId: sid, ico: '27082441', souhlas: true }, { souhlasPovinny: true }), { ok: false, chyba: 'ico' });
  // Stejně jako formulář profilu podniku (cistyIco): krátké IČO se doplní nulami zleva a ověří součtem.
  eq('příprava: krátké IČO doplněné nulami jako v profilu podniku', overPripravu({ sessionId: sid, ico: '6947', souhlas: true }, { souhlasPovinny: false }), { ok: true, sessionId: sid, ico: '00006947', souhlas: true });
  eq('příprava: písmena v IČO neprojdou', overPripravu({ sessionId: sid, ico: '2708244O' }, { souhlasPovinny: false }), { ok: false, chyba: 'ico' });
  eq('příprava: bez souhlasu, když je povinný', overPripravu({ sessionId: sid, ico: '27082440' }, { souhlasPovinny: true }), { ok: false, chyba: 'souhlas' });
  eq('příprava: souhlas jen jako true (ne "true")', overPripravu({ sessionId: sid, ico: '27082440', souhlas: 'true' }, { souhlasPovinny: true }), { ok: false, chyba: 'souhlas' });
  eq('příprava: bez povinného souhlasu projde', overPripravu({ sessionId: sid, ico: '27082440' }, { souhlasPovinny: false }), { ok: true, sessionId: sid, ico: '27082440', souhlas: false });
  ok('příprava: id relace musí vypadat jako relace Stripe', ['', 'pi_123', 'cs_test_', 'cs_test_abc/../x', 42].every(s => !overPripravu({ sessionId: s, ico: '27082440' }, { souhlasPovinny: false }).ok));

  const rel = { client_reference_id: '7', metadata: { teamId: '7' }, status: 'open', ui_mode: 'elements', mode: 'subscription' } as const;
  ok('relace podniku: vlastní, otevřená, elements (i starší jméno custom)', relacePatriPodniku(rel as any, 7) && relacePatriPodniku({ ...rel, ui_mode: 'custom' } as any, 7));
  ok('relace podniku: cizí podnik, dokončená, hostovaná ani null neprojde',
    !relacePatriPodniku(rel as any, 8) && !relacePatriPodniku({ ...rel, status: 'complete' } as any, 7)
    && !relacePatriPodniku({ ...rel, ui_mode: 'hosted_page' } as any, 7) && !relacePatriPodniku(null, 7)
    && !relacePatriPodniku({ ...rel, client_reference_id: null, metadata: {} } as any, 7));
  const ted = new Date('2026-11-06T10:00:00Z');
  eq('metadata přípravy: IČO a doklad souhlasu (verze@čas)', metadataPripravy({ ico: '27082440', souhlas: true, verzePodminek: '2026-10-21', ted }),
    { ico: '27082440', [KLIC_SOUHLASU]: '2026-10-21@2026-11-06T10:00:00.000Z' });
  eq('metadata přípravy: bez souhlasu prázdná hodnota (smaže starý)', metadataPripravy({ ico: '27082440', souhlas: false, verzePodminek: 'v', ted })[KLIC_SOUHLASU], '');

  // ---- IČO z dokončené relace (webhook) — zpětně kompatibilní ----
  eq('webhook: starší relace s custom_fields', icoZRelace({ custom_fields: [{ key: 'ico', numeric: { value: '27082440' } }], metadata: {} }), { ico: '27082440', zadano: '27082440' });
  eq('webhook: vlastní pokladna z metadata.ico', icoZRelace({ custom_fields: [], metadata: { ico: '17944953' } }), { ico: '17944953', zadano: '17944953' });
  eq('webhook: pole má přednost před metadaty', icoZRelace({ custom_fields: [{ key: 'ico', numeric: { value: '27082440' } }], metadata: { ico: '17944953' } }).ico, '27082440');
  eq('webhook: neplatné IČO v metadatech se zaznamená, neuloží', icoZRelace({ metadata: { ico: '17944954' } }), { ico: null, zadano: '17944954' });
  eq('webhook: nic', icoZRelace(null), { ico: null, zadano: null });

  // ---- vzhled platebních polí (Appearance API) podle DESIGN.md ----
  const sv = vzhledPokladny('light'), tm = vzhledPokladny('dark');
  ok('vzhled: Geist, rádius 14, inkoust, limetkový prstenec fokusu',
    /^Geist,/.test(sv.variables?.fontFamily ?? '') && sv.variables?.borderRadius === '14px' && sv.variables?.colorPrimary === '#16181A'
    && /200,245,66/.test(String((sv.rules?.['.Input:focus'] as any)?.boxShadow)) && (sv.rules?.['.Input:focus'] as any)?.borderColor === '#9FC22A');
  ok('vzhled: pole jako .field (jamka bez rámečku, popisek 13/500)',
    (sv.rules?.['.Input'] as any)?.backgroundColor === 'rgba(22,24,26,0.045)' && (sv.rules?.['.Label'] as any)?.fontSize === '13px' && (sv.rules?.['.Label'] as any)?.fontWeight === '500');
  ok('vzhled tmavý: povrch okna, světlý text, limetka', tm.variables?.colorBackground === '#1E2124' && tm.variables?.colorText === '#EDF2E4' && tm.variables?.colorPrimary === '#C8F542');
  const pisma = pismaPokladny('https://www.managero.app/');
  ok('písmo: Geist z našeho původu (ne Google Fonts), tři řezy', pisma.length === 3 && pisma.every(p => p.family === 'Geist' && p.src.startsWith(`url(https://www.managero.app${CESTA_PISMA})`)) && pisma.map(p => p.weight).join() === '400,500,600');
  ok('písmo: soubor je v public/ a next.config.js ho pouští s CORS do rámu Stripe',
    existsSync(new URL(`../../public${CESTA_PISMA}`, import.meta.url)) && /source: '\/fonts\/:soubor\*'[\s\S]{0,120}Access-Control-Allow-Origin/.test(cti('next.config.js')));

  // ---- napojení (zdroj) ----
  const b = cti('lib/billing.ts');
  ok('billing: parametry podle režimu z lib/pokladnaRezim.ts, odpověď elements s IČO, firmou, souhlasem a trialem',
    /\.\.\.parametryRezimu\(mode, \{/.test(b) && /ui: 'elements', ico: icoPodniku, firma: String\(t\.name \?\? ''\), souhlas, trial/.test(b));
  ok('billing: příprava ověří vlastnictví relace, zapíše metadata a IČO na faktury',
    /relacePatriPodniku\(session, teamId\)/.test(b) && /sessions\.update\(session\.id, \{\s*metadata: metadataPripravy/.test(b) && /nastavPatickuFaktury\(s, customer, p\.ico\)/.test(b));
  ok('webhook: IČO z relace (pole i metadata) a doklad souhlasu na předplatné', /icoZRelace\(session\)/.test(b) && /prenesNaPredplatne\(s, session, sub\)/.test(b));
  const r = cti('app/api/billing/checkout/route.ts');
  ok('routa: PATCH s oprávněním předplatné.spravovat a kontrolou těla', /export async function PATCH[\s\S]{0,200}pozaduj\('predplatne\.spravovat'\)/.test(r) && /overPripravu\(/.test(r) && /souhlasPovinny: souhlasVPokladne\(\)/.test(r));
  const m = cti('components/CheckoutModal.tsx');
  ok('okno: vlastní pokladna s ui elements, bez klíče nebo Stripe.js hostovaná pokladna',
    /ui: 'elements'/.test(m) && /if \(!js\) \{ const d = await otevriPokladnu\(\{ plan, interval \}/.test(m) && /!stripe \|\| d\.ui !== 'elements'/.test(m) && !/createEmbeddedCheckoutPage/.test(m));
  const v = cti('components/pokladna/VlastniPokladna.tsx');
  ok('pokladna: Checkout Elements SDK, Payment Element, náš vzhled a písmo', /initCheckoutElementsSdk\(/.test(v) && /createPaymentElement\(/.test(v) && /vzhledPokladny\(theme\)/.test(v) && /changeAppearance/.test(v));
  ok('pokladna: příprava na serveru uvnitř runServerUpdate, pak confirm s redirect if_required', /runServerUpdate\(async \(\) => \{\s*const res = await fetch\('\/api\/billing\/checkout', \{\s*method: 'PATCH'/.test(v) && /confirm\(\{ redirect: 'if_required' \}\)/.test(v));
  ok('pokladna: slevový kód, DIČ a celková částka ze Stripe', /applyPromotionCode\(/.test(v) && /removePromotionCode\(/.test(v) && /updateTaxIdInfo\(/.test(v) && /session\?\.total\.total\.minorUnitsAmount/.test(v));
  ok('pokladna: souhlas jen se STRIPE_SOUHLAS_PODMINEK (data.souhlas) a odkaz na obchodní podmínky', /data\.souhlas && \(/.test(v) && /cestaDokumentu\('obchodni-podminky'/.test(v));
  const csp = cti('next.config.js');
  ok('CSP: Stripe.js, API Stripe a rámy Stripe dál povolené', /script-src[^"]*https:\/\/js\.stripe\.com/.test(csp) && /connect-src[^"]*https:\/\/api\.stripe\.com/.test(csp) && /frame-src[^"]*https:\/\/js\.stripe\.com[^"]*https:\/\/hooks\.stripe\.com/.test(csp));
  // Rámy Payment Elementu vznikají v našem dokumentu: subdomény js.stripe.com a Link (docs.stripe.com/security/guide).
  ok('CSP: rámy Elements na *.js.stripe.com a Link (link.com) pro vlastní pokladnu',
    /script-src[^`]*https:\/\/\*\.js\.stripe\.com/.test(csp) && /frame-src[^"]*https:\/\/\*\.js\.stripe\.com[^"]*https:\/\/\*\.link\.com/.test(csp) && /connect-src[^"]*https:\/\/\*\.link\.com/.test(csp)
    && /payment=\(self "https:\/\/js\.stripe\.com" "https:\/\/\*\.js\.stripe\.com"/.test(csp));
}
