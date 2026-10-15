// Spuštění, balík G — „Stáhnout moje data“ pro hosta (GDPR čl. 15 a 20).
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { sestavExportHosta, nazevExportuHosta, POLE_PROFILU_HOSTA, type SekceExportuHosta } from '../../lib/exportHosta.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  const prazdne: SekceExportuHosta = {
    ucet: null, karta: null, clenstvi: [], body: [], razitka: [], razitkaHistorie: [], kupony: [], promoKody: [], objednavky: [],
    rezervace: [], hodnoceni: [], poukazy: [], akce: [], souhlasy: [],
  };
  const d = sestavExportHosta({
    ...prazdne,
    ucet: { id: 18, name: 'Klára', email: 'klara@priklad.cz', password_hash: '$2b$…', pin_hash: 'x', notif_prefs: { a: 1 } },
    karta: { code: 'AB12CD34', created_at: '2026-01-01' },
    body: [{ id: 1, team_id: 5, delta: 10, kind: 'visit', staff_id: 7 }],
    kupony: [{ id: 2, code: 'K1', redeemed_by: 9 }],
    souhlasy: [{ podnik: 5, typ: 'novinky_push', stav: 'udelen', kanal: 'clenstvi' }],
    razitka: null,
  }, new Date('2026-10-15T10:00:00Z'), 1);
  ok('profil jen z bílé listiny: bez hesla, PINu a interních nastavení', !('password_hash' in (d.ucet ?? {})) && !('pin_hash' in (d.ucet ?? {})) && !('notif_prefs' in (d.ucet ?? {})) && d.ucet?.email === 'klara@priklad.cz');
  ok('bílá listina profilu nemá citlivá pole', !POLE_PROFILU_HOSTA.some(p => /password|pin|token|hash/.test(p)));
  ok('kdo z obsluhy co udělal, do souboru nepatří', !('staff_id' in d.body[0]) && !('redeemed_by' in d.kupony[0]));
  eq('kartička a souhlasy jsou v souboru', [d.karta?.code, d.souhlasy.length], ['AB12CD34', 1]);
  eq('sekce, kterou se nepodařilo načíst, je v nedostupne (ne tiše prázdná)', d.nedostupne, ['razitka']);
  ok('oříznutá sekce se přizná', d.oriznute.includes('body') && d.oriznute.includes('kupony'));
  ok('poznámka říká, co v souboru není a proč', /poznámky obsluhy/i.test(d.poznamka) && /vydá ti je na žádost přímo podnik/.test(d.poznamka));
  eq('název souboru', nazevExportuHosta(new Date('2026-10-15T10:00:00Z')), 'managero-client-moje-data-2026-10-15.json');
  for (const k of ['clenstvi', 'body', 'razitka', 'razitkaHistorie', 'kupony', 'promoKody', 'objednavky', 'rezervace', 'hodnoceni', 'poukazy', 'akce', 'souhlasy'] as const) {
    ok(`sekce ${k} je pole`, Array.isArray(d[k]));
  }

  const route = cti('app/api/client/account/export/route.ts');
  ok('export: jen přihlášený host', /const me = await customer\(\)/.test(route) && /status: 401/.test(route));
  ok('export: každý dotaz omezený na vlastní id', (route.match(/customer_id = \$\{id\}/g) ?? []).length >= 10 && /WHERE id = \$\{id\}/.test(route));
  ok('export: omezení počtu stažení', /hit\(`export-dat-host:\$\{id\}`/.test(route));
  ok('export: stažení jako příloha bez cache', /Content-Disposition/.test(route) && /no-store/.test(route));
  const ui = cti('components/client/UcetHosta.tsx');
  ok('profil hosta: tlačítko „Stáhnout moje data“ přes lib/stahni (v obalu sdílení)', /ulozZAdresy\('\/api\/client\/account\/export'/.test(ui) && /Stáhnout moje data/.test(ui));
}
