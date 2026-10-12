// Kolo 6 UX, balík B1 — Plánovač rozvrhu: víc údajů v mřížce, týdenní pohled, Kč a kolize s volnem.
//
// Hlídá čisté výpočty, na kterých obrazovka stojí (lib/rozvrhPrehled.ts, lib/rozvrhFiltr.ts):
// avatar bez vybraného emoji (výchozí „👤" z databáze) kreslí iniciály; pilulka v mřížce
// má krátké jméno a „08–16"; hodiny za týden jsou součet délek směn těch sedmi dnů (ne
// měsíční vytížení); mzdový náklad plánu a lidé bez sazby (chybějící sazba není nula);
// kolize schvalovaného volna se směnami; výchozí měsíc plánovače (V02) a výchozí
// rozložení stránky (plánovač hned pod dostupností). A ve zdroji, že se to nevrátí:
// API posílá sazbu jen s finance.mzdy a kolize jedním dotazem.

import { readFileSync } from 'node:fs';
import * as modul from 'node:module';
import type { Testy } from './_testy.ts';
import {
  casKratce, hodinaKratce, souhrnDne, prvniDenTydne, dnyTydne, tydnyMesice, vychoziTyden, hodinyVeDnech,
  nakladPlanu, lideBezSazby, nakladCloveka, hodinyLidi, kolizeVolna, souhrnKolizi, mesicPlanovace, PRAH_PRISTIHO_MESICE,
} from '../../lib/rozvrhPrehled.ts';
import { kratkaJmena, klicPohledu, nactiPohled, KLIC_POHLEDU } from '../../lib/rozvrhFiltr.ts';
import { STRANKA as ROZVRH_V } from '../../lib/widgety/stranky/vedeni.rozvrh.ts';
import { WIDGETY as ROZVRH_W } from '../../lib/widgety/katalog/rozvrh.ts';

// Typy Node v projektu stripTypeScriptTypes ještě neznají (jako v k69-ramec).
const { stripTypeScriptTypes } = modul as unknown as { stripTypeScriptTypes: (kod: string) => string };
const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Funkce vytažená ze zdroje .tsx (testy JSX nespustí) — stejně jako `inicialy` v k69-ramec. */
function zeZdroje<T>(src: string, jmeno: string, predtim = ''): T {
  const od = src.indexOf(`export function ${jmeno}`);
  const kod = src.slice(od, src.indexOf('\n}\n', od) + 2).replace('export ', '');
  // eslint-disable-next-line no-new-func
  return new Function(`${predtim}${stripTypeScriptTypes(kod)}; return ${jmeno};`)() as T;
}

export default function ({ eq, ok }: Testy) {
  // ---- Avatar: výchozí „👤" není vybrané emoji → iniciály ----
  const avatar = cti('components/ui/Avatar.tsx');
  const maEmoji = zeZdroje<(e: string | null | undefined) => boolean>(avatar, 'maEmoji', "const VYCHOZI_AVATAR = '👤';");
  eq('avatar: „👤" z users.avatar DEFAULT se bere jako bez emoji', [maEmoji('👤'), maEmoji(' 👤 '), maEmoji(''), maEmoji(null), maEmoji(undefined)], [false, false, false, false, false]);
  eq('avatar: vybrané emoji zůstává', [maEmoji('🧑‍🍳'), maEmoji('👱‍♀️'), maEmoji('🧔')], [true, true, true]);
  ok('avatar: kreslí podle maEmoji (bez emoji → iniciály ze jména)', /const has = maEmoji\(emoji\)/.test(avatar) && /const zkratka = has \? '' : inicialy\(name\)/.test(avatar));
  ok('avatar 2xs: písmo nejmíň 11 px (check-contrast), kruh 18 px do 32px buňky', /'2xs': \{ box: 'h-\[18px\] w-\[18px\]', text: 'text-\[11px\]', icon: 11, pismo: 'text-\[11px\]' \}/.test(avatar));

  // ---- pilulka: krátké jméno a „08–16" ----
  eq('pilulka: celé hodiny bez minut, půlhodiny s minutami, přes půlnoc', [casKratce('08:00', '16:00'), casKratce('07:30', '15:00'), casKratce('22:00:00', '06:00')], ['08–16', '07:30–15', '22–06']);
  eq('pilulka: neplatný čas → bez něj', [casKratce('', '16:00'), casKratce('x', 'y'), hodinaKratce('8:05')], ['16', '', '08:05']);
  const kratce = kratkaJmena([{ id: 1, jmeno: 'Eva Testová' }, { id: 2, jmeno: 'Eva Malá' }, { id: 3, jmeno: 'Jakub Horák' }]);
  eq('pilulka: krátké jméno = křestní, u dvou Ev celé', [kratce.get(1), kratce.get(2), kratce.get(3)], ['Eva Testová', 'Eva Malá', 'Jakub']);
  const sb = cti('components/scheduling/ScheduleBuilder.tsx');
  ok('mřížka: pilulka s Avatarem (iniciály) jen na telefonu a krátkým jménem + od–do od sm',
    (sb.match(/<Avatar emoji=\{[sp]\.employeeAvatar\} name=\{[sp]\.employeeName\} size="2xs" ring=\{false\} className="sm:hidden" \/>/g) ?? []).length === 2
    && (sb.match(/kratkaFiltru\.get\(Number\([sp]\.employeeId\)\)/g) ?? []).length === 2
    && (sb.match(/casKratce\([sp]\.startTime, [sp]\.endTime\)/g) ?? []).length === 2);
  ok('mřížka: title pilulky zůstává (celé jméno · typ · od–do)', sb.includes('title={`${s.employeeName} · ${rt.label} · ${fmtHM(s.startTime)}–${fmtHM(s.endTime)}`}'));
  ok('mřížka: patička dne jen od sm', /className="hidden sm:block mt-auto t-meta tabular-nums truncate" data-paticka-dne/.test(sb));

  // ---- patička a týden ----
  eq('patička: počet a hodiny, noční přes půlnoc 8 h', souhrnDne([{ startTime: '08:00', endTime: '16:00' }, { startTime: '22:00', endTime: '06:00' }, { startTime: '10:00', endTime: '14:30' }]), { smen: 3, hodin: 20.5 });
  eq('týden: první den od pondělí i od neděle', [prvniDenTydne('2026-10-14', 1), prvniDenTydne('2026-10-14', 0), prvniDenTydne('2026-10-12', 1), prvniDenTydne('2026-10-18', 1)], ['2026-10-12', '2026-10-11', '2026-10-12', '2026-10-12']);
  eq('týden: sedm dní přes konec měsíce', dnyTydne('2026-10-26'), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  eq('týden: týdny měsíce (říjen 2026 od pondělí)', tydnyMesice('2026-10', 1), ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  eq('týden: výchozí = týden s dneškem', vychoziTyden('2026-10', '2026-10-14', 1), '2026-10-12');
  eq('týden: jiný měsíc = první týden se 4 dny měsíce (listopad 2026 začíná nedělí)', [vychoziTyden('2026-11', '2026-10-14', 1), vychoziTyden('2026-10', '2026-09-30', 1)], ['2026-11-02', '2026-09-28']);
  const smenyTydne = [
    { employeeId: 1, date: '2026-10-12', startTime: '08:00', endTime: '16:00' },
    { employeeId: 1, date: '2026-10-18', startTime: '22:00', endTime: '06:00' },
    { employeeId: 1, date: '2026-10-19', startTime: '08:00', endTime: '16:00' }, // další týden
    { employeeId: 2, date: '2026-10-14', startTime: '10:00', endTime: '14:30' },
  ];
  const zaTyden = hodinyVeDnech(smenyTydne, dnyTydne('2026-10-12'));
  eq('týden: hodiny za těch 7 dní z délky směn (noční 8 h, další týden ne)', [zaTyden.get(1), zaTyden.get(2), zaTyden.get(3)], [16, 4.5, undefined]);
  ok('týden: tabulka table-fixed v šířce karty, bez posuvu do strany', /<table className="w-full table-fixed/.test(sb) && !/data-tydenni-pohled[^>]*overflow-x/.test(sb));
  ok('týden: přepínač Měsíc | Týden jen od sm', /<div className="hidden sm:block">\s*<Segmented ariaLabel=\{t\('Pohled plánovače'\)\}/.test(sb));
  eq('týden: pohled v localStorage zvlášť pro uživatele a podnik, neznámá hodnota = měsíc',
    [klicPohledu('7', 3), klicPohledu(null, null), nactiPohled('tyden'), nactiPohled('cokoli'), nactiPohled(null)],
    [`${KLIC_POHLEDU}:7:3`, `${KLIC_POHLEDU}:nekdo:bez-podniku`, 'tyden', 'mesic', 'mesic']);

  // ---- mzdový náklad plánu ----
  const plan = [
    { employeeId: 1, startTime: '08:00', endTime: '16:00', hourlyRate: 180 },
    { employeeId: 1, startTime: '22:00', endTime: '06:00', hourlyRate: 180 },
    { employeeId: 2, startTime: '10:00', endTime: '14:30', hourlyRate: 0 },
    { employeeId: 3, startTime: '08:00', endTime: '12:00', hourlyRate: null },
    { employeeId: 4, startTime: '08:00', endTime: '09:20', hourlyRate: 200.5 },
  ];
  eq('náklad: hodiny všech, Kč jen ze směn se sazbou, zaokrouhleno až v součtu', nakladPlanu(plan), { hodin: 25.83, castka: Math.round(16 * 180 + (80 / 60) * 200.5) });
  eq('náklad: bez finance.mzdy (všude null) jen hodiny, žádné „0 Kč"', nakladPlanu(plan.map(s => ({ ...s, hourlyRate: null }))), { hodin: 25.83, castka: null });
  eq('náklad: lidé bez sazby = se směnou a sazbou 0/null', lideBezSazby(plan), 2);
  eq('náklad: člověk se sazbou u jedné směny se nepočítá jako bez sazby', lideBezSazby([{ employeeId: 5, startTime: '08:00', endTime: '10:00', hourlyRate: null }, { employeeId: 5, startTime: '10:00', endTime: '12:00', hourlyRate: 150 }]), 0);
  eq('náklad člověka: hodiny × sazba, bez sazby null', [nakladCloveka(7.5, 180), nakladCloveka(8, 0), nakladCloveka(8, null)], [1350, null, null]);
  const hod = hodinyLidi([
    { employeeId: 1, employeeName: 'Eva', date: '2026-10-02', startTime: '08:00', endTime: '16:00', hourlyRate: 180 },
    { employeeId: 1, employeeName: 'Eva', date: '2026-10-03', startTime: '22:00', endTime: '06:00', hourlyRate: 180 },
    { employeeId: 2, employeeName: 'Petr', date: '2026-10-04', startTime: '10:00', endTime: '14:00', hourlyRate: 0 },
    { employeeId: 3, employeeName: 'Adam', date: '2026-10-05', startTime: '08:00', endTime: '20:00' },
  ], '2026-10', null);
  eq('widget hodin: náklad po lidech (bez sazby null, ne 0)', hod.map(c => [c.jmeno, c.naklad]), [['Eva', 2880], ['Adam', null], ['Petr', null]]);
  const hodinyW = ROZVRH_W.find(w => w.id === 'rozvrh.hodiny_lidi');
  ok('katalog: Kč ve widgetu hodin jen s finance.mzdy (pole naklad) a popis to říká',
    hodinyW?.opravneni.pole?.naklad === 'finance.mzdy' && hodinyW?.opravneni.pole?.limit_hodin === 'rozvrh.nastaveni' && /oprávněním ke mzdám/.test(hodinyW?.popis ?? ''));
  const apiRozvrh = cti('app/api/schedule/route.ts');
  ok('API rozvrhu: sazba u směny jen s finance.mzdy, členství před zrcadlem users, fallback bez sloupce',
    apiRozvrh.includes("const sSazbou = ctx.role.opravneni.has('finance.mzdy');")
    && apiRozvrh.includes('THEN (CASE WHEN m.user_id IS NOT NULL THEN COALESCE(m.hourly_rate, 0) ELSE COALESCE(u.hourly_rate, 0) END)')
    && apiRozvrh.includes('NULL AS hourly_rate') && apiRozvrh.includes('hourlyRate: r.hourly_rate == null ? null'));
  ok('plánovač: Kč jen s finance.mzdy, sazba návrhu z člověka', sb.includes("return smiMzdy ? n : { ...n, castka: null };") && sb.includes('for (const m of members) if (m.hourly_rate != null)'));

  // ---- kolize volna ----
  eq('kolize: počet z API, starší server bez pole = 0, nesmysl = 0', [kolizeVolna({ conflicts: 2 }), kolizeVolna({}), kolizeVolna({ conflicts: null }), kolizeVolna({ conflicts: -1 }), kolizeVolna({ conflicts: Number.NaN })], [2, 0, 0, 0, 0]);
  eq('kolize: souhrn po schválení (i hromadném) — počet a nejbližší den',
    souhrnKolizi([[{ date: '2026-10-19' }, { date: '2026-10-17T00:00:00' }], null, [], [{ date: 'x' }, { date: '2026-10-21' }]]), { n: 3, prvniDen: '2026-10-17' });
  eq('kolize: bez směn nic', souhrnKolizi([[], undefined]), { n: 0, prvniDen: null });
  const apiVolno = cti('app/api/timeoff/route.ts');
  ok('API volna: kolize čekajících žádostí jedním dotazem (LATERAL), ne dotaz na žádost',
    /LEFT JOIN LATERAL \(\s*SELECT COUNT\(\*\)::int AS n FROM shifts s/.test(apiVolno) && apiVolno.includes("CASE WHEN t.status = 'pending' THEN k.n END AS conflicts"));
  ok('API volna: schválení vrací conflicts a nic neblokuje', apiVolno.includes("if (nextStatus === 'approved')") && apiVolno.includes('return NextResponse.json({ ok: true, request: shape(row), conflicts });'));
  const oblast = cti('components/widgety/oblasti/rozvrh.tsx');
  ok('widget volna: chip kolize tónem bad a toast „Upravit rozvrh" otevře den v plánovači',
    oblast.includes('detail={kolizeVolna(z) > 0') && oblast.includes('<Chip tone="bad" size="sm">{t(\'{n, plural, one {# směna v rozvrhu}')
    && oblast.includes('predejNastroji(nav, UDALOST_DEN, KLIC_DEN, d)') && oblast.includes('kolizeVsech.push(await patch({ id, status }))'));

  // ---- výchozí měsíc plánovače (V02) ----
  eq('měsíc: aktuální, dokud má směny po dnešku', mesicPlanovace('2026-10-12', [{ date: '2026-10-02' }, { date: '2026-10-20' }]), '2026-10');
  eq('měsíc: bez směn po dnešku příští (dnešní směna nestačí)', [mesicPlanovace('2026-10-12', [{ date: '2026-10-02' }, { date: '2026-10-12' }]), mesicPlanovace('2026-10-12', [])], ['2026-11', '2026-11']);
  eq('měsíc: před načtením aktuální, po 25. dni rovnou příští (i přes rok)', [mesicPlanovace('2026-10-12'), mesicPlanovace(`2026-10-${PRAH_PRISTIHO_MESICE}`), mesicPlanovace('2026-10-26', [{ date: '2026-10-30' }]), mesicPlanovace('2026-12-28')], ['2026-10', '2026-10', '2026-11', '2027-01']);
  ok('plánovač: výchozí měsíc rozhodne první načtení, změna měsíce ho zruší', sb.includes('useState(() => mesicPlanovace(pragueToday()))') && /const zmenMesic = \(m: string, den\?: string\) => \{\s*rozhodnoutMesicRef\.current = false;/.test(sb));
  ok('plánovač: Publikovat v „···" nese počet směn měsíce', sb.includes("t('Publikovat rozvrh ({n})', { n: shifts.length })"));

  // ---- výchozí rozložení: plánovač hned pod dostupností M ----
  eq('rozložení: dostupnost M, hned za ní plánovač, fronty až pod ním', (ROZVRH_V.vychozi['typ:vedeni'] ?? []).map(x => `${x.w}${x.s ? `:${x.s}` : ''}`),
    ['rozvrh.dostupnost_tymu:M', 'nastroj', 'rozvrh.diry:S', 'rozvrh.zadosti_volno:S', 'rozvrh.vymeny:S', 'rozvrh.hodiny_lidi:S']);
}
