// Kolo 72 — přihlášení, registrace a platby: jednotkové testy čistých pravidel.
//
// Hlídá se to, co by v sandboxu nikdo nezkusil a v ostrém provozu stálo
// peníze nebo účet: e-mail „Jan@x" musí najít účet „jan@x", ID zákazníka ze
// sandboxu se nesmí poslat živému Stripe (a živé ID zase nesmí zahodit
// testovací prostředí), nedokončená pokladna nesmí shodit placený podnik
// a texty nesmí slibovat zkoušku, kterou Stripe nedá.

import type { Testy } from './_testy.ts';
import { normalizujEmail, vypadaJakoEmail, poradiKandidatu } from '../../lib/emailAdresa.ts';
import {
  rezimZKlice, rezimZLivemode, rozhodniOZdroji, jeChybejiciZdroj, jeChybejiciZakaznik, jeSmazanyZakaznik,
  udalostPatriDoRezimu, vyhodnotPredplatne, nabidnoutTrial,
} from '../../lib/billingPravidla.ts';
import { slibZamku, textPoRegistraci, textZkousky } from '../../lib/predplatneTexty.ts';

export default function ({ eq, ok }: Testy) {
  // ---- e-mail ----
  eq('e-mail: velikost písmen a okraje', normalizujEmail('  Jan@Firma.CZ \n'), 'jan@firma.cz');
  eq('e-mail: prázdné a nesmysl', [normalizujEmail(undefined), normalizujEmail(null), normalizujEmail(42)], ['', '', '42']);
  ok('e-mail: tvar projde', vypadaJakoEmail('jan@firma.cz'));
  ok('e-mail: bez zavináče neprojde', !vypadaJakoEmail('janfirma.cz'));
  ok('e-mail: mezera uvnitř neprojde', !vypadaJakoEmail('jan novak@firma.cz'));
  ok('e-mail: bez tečky v doméně neprojde', !vypadaJakoEmail('jan@firma'));

  // Dva historické účty lišící se velikostí písmen: kdo píše přesně svůj tvar, je první.
  const dvojnici = [{ id: 9, email: 'jan@x.cz' }, { id: 4, email: 'Jan@x.cz' }];
  eq('kandidáti: přesná shoda první', poradiKandidatu('jan@x.cz', dvojnici).map(k => k.id), [9, 4]);
  eq('kandidáti: jiná velikost → přesná shoda pro „Jan@x.cz"', poradiKandidatu(' Jan@x.cz ', dvojnici).map(k => k.id), [4, 9]);
  eq('kandidáti: bez přesné shody podle id', poradiKandidatu('JAN@X.CZ', dvojnici).map(k => k.id), [4, 9]);
  eq('kandidáti: strop počtu (bcrypt nesmí zdržovat)', poradiKandidatu('a', [1, 2, 3, 4, 5].map(id => ({ id, email: `A${id}` })), 3).length, 3);
  eq('kandidáti: vstup se nemění', dvojnici.map(k => k.id), [9, 4]);

  // ---- režim Stripe ----
  eq('režim: živý klíč', [rezimZKlice('sk_live_abc'), rezimZKlice('rk_live_abc')], ['live', 'live']);
  eq('režim: testovací klíč', [rezimZKlice('sk_test_abc'), rezimZKlice(' rk_test_abc')], ['test', 'test']);
  eq('režim: cizí či prázdný klíč je neznámý', [rezimZKlice(''), rezimZKlice(undefined), rezimZKlice('pk_live_x'), rezimZKlice('whsec_x')], [null, null, null, null]);
  eq('režim: livemode', [rezimZLivemode(true), rezimZLivemode(false), rezimZLivemode(undefined)], ['live', 'test', null]);

  // ---- ID zákazníka / předplatného × režim ----
  eq('zákazník: bez ID se zakládá nový', rozhodniOZdroji({ id: null, ulozeny: 'live', aktualni: 'live' }), 'nahradit');
  eq('zákazník: stejný režim se použije', rozhodniOZdroji({ id: 'cus_1', ulozeny: 'live', aktualni: 'live' }), 'pouzit');
  eq('zákazník: sandbox ID po přepnutí na živé klíče se nahradí', rozhodniOZdroji({ id: 'cus_1', ulozeny: 'test', aktualni: 'live' }), 'nahradit');
  eq('zákazník: ID bez značky (starý záznam) se ověří u Stripe', rozhodniOZdroji({ id: 'cus_1', ulozeny: null, aktualni: 'live' }), 'overit');
  eq('zákazník: neznámá hodnota značky je jako žádná', rozhodniOZdroji({ id: 'cus_1', ulozeny: 'prod', aktualni: 'test' }), 'overit');
  eq('zákazník: ŽIVÉ ID se z testovacího klíče nezahodí', rozhodniOZdroji({ id: 'cus_1', ulozeny: 'live', aktualni: 'test' }), 'odmitnout');
  eq('zákazník: neznámý režim klíče nic nevyvozuje', rozhodniOZdroji({ id: 'cus_1', ulozeny: 'test', aktualni: null }), 'pouzit');

  // ---- chyby ze Stripe ----
  ok('chyba: resource_missing je chybějící objekt', jeChybejiciZdroj({ code: 'resource_missing', type: 'StripeInvalidRequestError' }));
  ok('chyba: 404 na neplatný požadavek také', jeChybejiciZdroj({ statusCode: 404, type: 'StripeInvalidRequestError' }));
  ok('chyba: výpadek sítě není chybějící objekt', !jeChybejiciZdroj({ type: 'StripeConnectionError', message: 'timeout' }));
  ok('chyba: limit požadavků není chybějící objekt', !jeChybejiciZdroj({ code: 'rate_limit', statusCode: 429 }));
  ok('chyba: nic a řetězec', !jeChybejiciZdroj(null) && !jeChybejiciZdroj('resource_missing'));
  ok('chyba: chybějící cena není chybějící zákazník', !jeChybejiciZakaznik({ code: 'resource_missing', param: 'line_items[0][price]', message: 'No such price: price_1' }));
  ok('chyba: „No such customer" se pozná', jeChybejiciZakaznik({ code: 'resource_missing', param: 'customer', message: 'No such customer: cus_1' }));
  ok('chyba: zákazník podle textu bez param', jeChybejiciZakaznik({ code: 'resource_missing', message: 'No such customer: cus_1' }));
  ok('zákazník: smazaný objekt', jeSmazanyZakaznik({ id: 'cus_1', deleted: true }) && !jeSmazanyZakaznik({ id: 'cus_1' }));

  // ---- událost z cizího režimu ----
  ok('událost: stejný režim projde', udalostPatriDoRezimu(true, 'live') && udalostPatriDoRezimu(false, 'test'));
  ok('událost: sandbox při živých klíčích se přeskočí', !udalostPatriDoRezimu(false, 'live'));
  ok('událost: živá při testovacích klíčích se přeskočí', !udalostPatriDoRezimu(true, 'test'));
  ok('událost: neznámý režim klíče nic nevyřazuje', udalostPatriDoRezimu(false, null));

  // ---- co udělá zpráva o předplatném s podnikem ----
  const zaklad = { planZCeny: 'pro' as const, ulozenyPlan: 'free', ulozeneSubId: null, subId: 'sub_1', nabidkaDo: null };
  const trial = vyhodnotPredplatne({ ...zaklad, status: 'trialing' });
  eq('předplatné: zkouška → Pro, nabídka Max, „už měl"', [trial.akce, trial.plan, trial.zacitNabidkuMax, trial.meloPredplatne], ['zapsat', 'pro', true, true]);
  const nedokoncene = vyhodnotPredplatne({ ...zaklad, status: 'incomplete', ulozenyPlan: 'max' });
  eq('předplatné: nedokončená pokladna se týmu nedotkne (starý Max zůstane)', nedokoncene.akce, 'preskocit');
  eq('předplatné: incomplete_expired také', vyhodnotPredplatne({ ...zaklad, status: 'incomplete_expired' }).akce, 'preskocit');
  const zruseno = vyhodnotPredplatne({ ...zaklad, status: 'canceled', ulozeneSubId: 'sub_1', ulozenyPlan: 'pro' });
  eq('předplatné: zrušené vlastní → Zdarma, historie zůstává', [zruseno.akce, zruseno.plan, zruseno.meloPredplatne, zruseno.zacitNabidkuMax], ['zapsat', 'free', true, false]);
  eq('předplatné: zrušené staré, když už běží jiné, se nepřepíše', vyhodnotPredplatne({ ...zaklad, status: 'canceled', ulozeneSubId: 'sub_NOVE' }).akce, 'preskocit');
  eq('předplatné: živé nové přepíše staré', vyhodnotPredplatne({ ...zaklad, status: 'active', ulozeneSubId: 'sub_STARE' }).akce, 'zapsat');
  eq('předplatné: past_due drží tarif', vyhodnotPredplatne({ ...zaklad, status: 'past_due', ulozenyPlan: 'pro', ulozeneSubId: 'sub_1' }).plan, 'pro');
  eq('předplatné: unpaid → Zdarma', vyhodnotPredplatne({ ...zaklad, status: 'unpaid', ulozeneSubId: 'sub_1' }).plan, 'free');
  eq('předplatné: nabídka Max jen jednou', vyhodnotPredplatne({ ...zaklad, status: 'active', nabidkaDo: '2026-01-01' }).zacitNabidkuMax, false);
  eq('předplatné: nabídka Max jen při přechodu na Pro (ne u Max)', vyhodnotPredplatne({ ...zaklad, planZCeny: 'max', status: 'active' }).zacitNabidkuMax, false);
  eq('předplatné: ne při obnově už placeného Pro', vyhodnotPredplatne({ ...zaklad, status: 'active', ulozenyPlan: 'pro', ulozeneSubId: 'sub_1' }).zacitNabidkuMax, false);
  eq('předplatné: cena, kterou neznáme, dá Zdarma', vyhodnotPredplatne({ ...zaklad, planZCeny: null, status: 'active' }).plan, 'free');

  eq('zkouška: nový podnik ji dostane', nabidnoutTrial({ hadSubscription: false, stripeSubscriptionId: null }), true);
  eq('zkouška: kdo předplatné měl, ne', nabidnoutTrial({ hadSubscription: true, stripeSubscriptionId: null }), false);
  eq('zkouška: kdo předplatné právě má, ne', nabidnoutTrial({ hadSubscription: false, stripeSubscriptionId: 'sub_1' }), false);

  // ---- texty: slib nesmí překročit skutečnost ----
  ok('slib zámku: nový podnik vidí 30 dní', slibZamku({ nacteno: true, hadSubscription: false }).includes('30 dní zdarma'));
  ok('slib zámku: kdo už předplatné měl, zkoušku nedostane', !/zdarma/.test(slibZamku({ nacteno: true, hadSubscription: true })) && /hned/.test(slibZamku({ nacteno: true, hadSubscription: true })));
  ok('slib zámku: dokud nevíme, nic neslibujeme', !/zdarma/.test(slibZamku({ nacteno: false, hadSubscription: false })));

  const po = (plan: 'free' | 'pro' | 'max', stav: 'aktivni' | 'zdarma' | 'zavrenaPokladna') => textPoRegistraci({ plan, stav, interval: 'month' });
  ok('po registraci: bez karty nikdy „30 dní Pro zdarma"', !/30 dní.*zdarma.*Pro|Prvních 30/.test(po('free', 'zdarma')) && /Zdarma/.test(po('free', 'zdarma')));
  ok('po registraci: zavřená pokladna říká, že podnik je na Zdarma', /běží na tarifu Zdarma/.test(po('pro', 'zavrenaPokladna')) && /Pro/.test(po('pro', 'zavrenaPokladna')));
  ok('po registraci: zaplacená zkouška nese cenu po ní', /Prvních 30 dní zdarma, pak 499 Kč měsíčně/.test(po('pro', 'aktivni')));
  ok('po registraci: Zdarma s „aktivní" stavem nelže', !/Prvních 30/.test(po('free', 'aktivni')));

  const banner = (p: Partial<Parameters<typeof textZkousky>[0]>) => textZkousky({ subscriptionStatus: 'trialing', effective: 'pro', trialDaysLeft: 12, cancelAt: null, ...p });
  ok('banner: běžící zkouška varuje před platbou', /12 dní, potom se strhne první platba/.test(banner({})));
  ok('banner: zrušená zkouška neslibuje platbu', !/strhne první platba/.test(banner({ cancelAt: '2026-10-20T00:00:00Z' })) && /nic se nestrhne/.test(banner({ cancelAt: '2026-10-20T00:00:00Z' })));
  ok('banner: skloňuje dny', /zbývá 3 dny/.test(banner({ trialDaysLeft: 3 })) && /zbývá 1 den,/.test(banner({ trialDaysLeft: 1 })));
  ok('banner: starý trial bez karty', /Kliknutím zjistíte/.test(banner({ subscriptionStatus: null })));
  ok('banner: Max se jmenuje Max', /Zkoušíte Max/.test(banner({ effective: 'max' })));
}
