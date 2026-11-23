// Podklady pro účetní (lib/ucetniExport, lib/xlsx, lib/ucetniZip, lib/ucetniOdkaz): pojmenování a unikátnost
// fotek, CSV pro české programy, sešit XLSX jako platný ZIP se správnými listy, souhrn a varování,
// streamovaný ZIP s chybějící fotkou, podpis / platnost / verze odkazu pro účetní a den automatu.
import type { Testy } from './_testy.ts';
import { unzipSync, strFromU8 } from 'fflate';
import {
  bezpecnyText, castkaCs, csvListu, kratkeId, mesicProAutomat, minulyMesic, naplanujFotky, nazevZipu, obdobiMesice, overObdobi,
  precteMe, priponaZTypu, sestavListy, spocitejSouhrn, textVarovani, celyMesic, type DataExportu,
} from '../../lib/ucetniExport.ts';
import { zapisXlsx, nazevListu, pismenoSloupce } from '../../lib/xlsx.ts';
import { proudPodkladu } from '../../lib/ucetniZip.ts';
import { podepisOdkazUcetni, overOdkazUcetni, platnaVerze, cestaOdkazuUcetni, PLATNOST_ODKAZU_UCETNI_DNI } from '../../lib/ucetniOdkaz.ts';

function data(o: Partial<DataExportu> = {}): DataExportu {
  return {
    podnik: { nazev: 'Kavárna Čajovna', ico: '17944953', dic: 'CZ17944953', adresa: 'Javorník 1', mena: 'CZK' },
    od: '2026-10-01', do: '2026-10-31',
    uctenky: [
      { id: 7, datum: '2026-10-03', dodavatel: 'Makro Cash & Carry', castka: 1234.5, kategorie: 'suroviny', poznamka: 'mléko; káva', foto: '/api/upload/11' },
      { id: 8, datum: '2026-10-03', dodavatel: 'Makro Cash & Carry', castka: 1234.5, kategorie: 'suroviny', poznamka: null, foto: '/api/upload/12' },
      { id: 9, datum: '2026-10-05', dodavatel: 'Žabka', castka: null, kategorie: null, poznamka: '=SUM(A1)', foto: null },
    ],
    prijemky: [{ id: 3, datum: '2026-10-04', dodavatel: 'Pražírna', castka: 2500, cisloDokladu: 'FA 2026/15', fotky: ['/api/upload/13', '/api/upload/99'], polozek: 2 }],
    uzaverky: [{
      id: 21, den: '2026-10-03', popis: 'Ranní', createdBy: 5, opening_cash: 2000, cash_revenue: 5000, card_revenue: 3000, tips: 300, tips_card: 100,
      expenses: 200, cash_removed: 1000, self_payout: 800, final_removal: 500, closing_cash: 5000, payout_from_register: true, tips_in_drawer: false,
      approved: false,
      movements: [{ kind: 'expense', amount: 200, note: 'pečivo' }, { kind: 'removal', amount: 1000 }, { kind: 'payout', amount: 800, userId: 6, userName: 'Jana Nováková' }],
      photos: [{ url: '/api/upload/14', druh: 'zreport' }],
    }],
    pos: [
      { den: '2026-10-03', finalPrice: 121, withoutTax: 100, tips: 0, cash: 121, card: 0, other: 0, refunded: false, deleted: false, taxSummaries: { '21': 21 } },
      { den: '2026-10-03', finalPrice: 112, withoutTax: 100, tips: 5, cash: 0, card: 112, other: 0, refunded: false, deleted: false, taxSummaries: { '12': 12 } },
      { den: '2026-10-03', finalPrice: 500, withoutTax: null, tips: 0, cash: 500, card: 0, other: 0, refunded: true, deleted: false, taxSummaries: { '21': 86.78 } },
    ],
    vyplaty: null,
    soubory: { '/api/upload/11': { mime: 'image/jpeg' }, '/api/upload/12': { mime: 'image/jpeg' }, '/api/upload/13': { mime: 'application/pdf' }, '/api/upload/14': { mime: 'image/png' } },
    ...o,
  };
}

export default async function ({ eq, ok }: Testy) {
  // --- Období a automat ---
  eq('účetní: období měsíce', obdobiMesice('2026-02'), { od: '2026-02-01', do: '2026-02-28' });
  eq('účetní: minulý měsíc přes rok', minulyMesic('2026-01-03'), '2025-12');
  eq('účetní: celý měsíc pozná', [celyMesic('2026-10-01', '2026-10-31'), celyMesic('2026-10-01', '2026-10-30')], ['2026-10', null]);
  ok('účetní: období nad rok odmítne', !overObdobi('2025-01-01', '2026-01-02').ok);
  ok('účetní: rok přesně projde', overObdobi('2025-01-01', '2025-12-31').ok);
  ok('účetní: obrácené období odmítne', !overObdobi('2026-10-05', '2026-10-01').ok);
  ok('účetní: neexistující den odmítne', !overObdobi('2026-02-30', '2026-03-01').ok);
  eq('cron: 3. den pošle za minulý měsíc', mesicProAutomat('2026-11-03', '2026-09'), '2026-10');
  eq('cron: 2. den ještě ne', mesicProAutomat('2026-11-02', null), null);
  eq('cron: podruhé v měsíci už ne (idempotence)', mesicProAutomat('2026-11-05', '2026-10'), null);
  eq('cron: v lednu za prosinec', mesicProAutomat('2027-01-03', null), '2026-12');
  eq('cron: zmeškaný běh dožene později v měsíci', mesicProAutomat('2026-11-20', '2026-09'), '2026-10');

  // --- Názvy souborů ---
  eq('soubor: bez diakritiky a zakázaných znaků', bezpecnyText('Žluťoučký kůň / Makro: „A&B"'), 'Zlutoucky-kun-Makro-A-B');
  eq('soubor: částka s čárkou', castkaCs(1234.5), '1234,50');
  eq('soubor: přípona z typu', [priponaZTypu('image/jpeg'), priponaZTypu('application/pdf'), priponaZTypu('text/html')], ['jpg', 'pdf', 'bin']);
  eq('soubor: krátké id je stabilní a 4 znaky', [kratkeId('/api/upload/11') === kratkeId('/api/upload/11'), kratkeId('/api/upload/11').length], [true, 4]);
  const d = data();
  const plan = naplanujFotky(d);
  const cesta11 = plan.podleUrl.get('/api/upload/11')!;
  eq('soubor: tvar cesty účtenky', cesta11, `fotky/uctenky/2026-10-03_Makro-Cash-Carry_1234,50Kc_${kratkeId('/api/upload/11')}.jpg`);
  const cesty = plan.fotky.map(f => f.cesta.toLowerCase());
  eq('soubor: všechny cesty unikátní', new Set(cesty).size, cesty.length);
  ok('soubor: příjemka s číslem dokladu a pdf', /^fotky\/prijemky\/2026-10-04_Prazirna_FA-2026-15_2500,00Kc_\w{4}\.pdf$/.test(plan.podleUrl.get('/api/upload/13') ?? ''));
  ok('soubor: Z-report uzávěrky', /^fotky\/uzaverky\/2026-10-03_z-report_\w{4}\.png$/.test(plan.podleUrl.get('/api/upload/14') ?? ''));
  eq('soubor: cizí / neexistující upload se nenaplánuje', plan.chybiZaznam, ['/api/upload/99']);
  // Kolize stejných názvů (stejné krátké id nejde vyrobit snadno, tak dvakrát tatáž adresa = jeden soubor).
  const dvakrat = naplanujFotky(data({ uctenky: [d.uctenky[0], { ...d.uctenky[1], foto: '/api/upload/11' }] }));
  eq('soubor: tatáž fotka u dvou účtenek = jeden soubor', dvakrat.fotky.filter(f => f.url === '/api/upload/11').length, 1);
  eq('zip: název za celý měsíc', nazevZipu('Kavárna Čajovna', '2026-10-01', '2026-10-31'), 'ucetni-podklady_Kavarna-Cajovna_2026-10.zip');
  eq('zip: název za vlastní období', nazevZipu('Bistro', '2026-10-01', '2026-10-15'), 'ucetni-podklady_Bistro_2026-10-01_2026-10-15.zip');

  // --- Souhrn ---
  const s = spocitejSouhrn(d, plan);
  eq('souhrn: účtenky', s.uctenky, { pocet: 3, soucet: 2469, bezFotky: 1, bezCastky: 1 });
  eq('souhrn: tržby z uzávěrek', [s.uzaverky.hotove, s.uzaverky.kartou, s.uzaverky.celkem, s.uzaverky.spropitneHotove, s.uzaverky.spropitneKartou], [5000, 3000, 8000, 200, 100]);
  eq('souhrn: odvod = během směny + po přepočtu', s.uzaverky.odvody, 1500);
  eq('souhrn: pokladna bez refundované', [s.pokladna?.uctenek, s.pokladna?.celkem, s.pokladna?.hotove, s.pokladna?.kartou], [2, 233, 121, 112]);
  eq('souhrn: DPH podle sazeb', s.pokladna?.dph, [{ sazba: 21, zaklad: 100, dph: 21 }, { sazba: 12, zaklad: 100, dph: 12 }]);
  eq('souhrn: výplaty bez svolení nejsou', s.vyplaty, null);
  eq('souhrn: varování', s.varovani.map(v => `${v.kod}:${v.pocet}`), ['uctenky_bez_fotky:1', 'uctenky_bez_castky:1', 'uzaverky_neschvalene:1', 'fotky_chybi:1']);
  eq('souhrn: text varování česky', textVarovani({ kod: 'uctenky_bez_fotky', pocet: 2 }), 'Účtenky bez fotky: 2');

  // --- Listy a CSV ---
  const listy = sestavListy(d, plan, s);
  eq('listy: bez mezd', listy.map(l => l.id), ['souhrn', 'uctenky', 'prijemky', 'uzaverky', 'pohyby', 'trzby']);
  const csv = csvListu(listy.find(l => l.id === 'uctenky')!);
  ok('csv: BOM na začátku', csv.charCodeAt(0) === 0xfeff);
  const radky = csv.slice(1).split('\r\n');
  eq('csv: hlavička se středníky', radky[0], 'Datum;Dodavatel;Kategorie;Částka (Kč);Poznámka;Soubor;ID');
  eq('csv: desetinná čárka, ISO datum, středník v textu v uvozovkách', radky[1], `2026-10-03;Makro Cash & Carry;Suroviny;1234,50;"mléko; káva";${cesta11};7`);
  ok('csv: vzorec se zneškodní', radky[3].includes("'=SUM(A1)") && radky[3].includes('bez fotky'));
  const pohyby = listy.find(l => l.id === 'pohyby')!;
  ok('csv: bez mezd žádná jména v pohybech', !csvListu(pohyby).includes('Jana') && !pohyby.sloupce.some(x => x.nazev === 'Komu'));
  const trzby = listy.find(l => l.id === 'trzby')!;
  eq('csv: tržby a DPH sloupce sazeb', trzby.sloupce.slice(8).map(x => x.nazev), ['Základ 21 % (Kč)', 'DPH 21 % (Kč)', 'Základ 12 % (Kč)', 'DPH 12 % (Kč)']);
  const sMzdami = data({ vyplaty: [{ datum: '2026-10-10', jmeno: 'Petr', od: '2026-09-01', do: '2026-09-30', castka: 12000, zpusob: 'převod', poznamka: null }] });
  const listyM = sestavListy(sMzdami, naplanujFotky(sMzdami), spocitejSouhrn(sMzdami, naplanujFotky(sMzdami)));
  eq('listy: s mezdami přibudou výplaty', listyM.map(l => l.id).includes('vyplaty'), true);
  eq('listy: výplaty včetně výplaty z kasy', listyM.find(l => l.id === 'vyplaty')!.radky.map(r => `${r[1]}:${r[5]}`), ['Jana Nováková:800', 'Petr:12000']);

  // --- XLSX ---
  eq('xlsx: písmena sloupců', [pismenoSloupce(0), pismenoSloupce(25), pismenoSloupce(26), pismenoSloupce(701)], ['A', 'Z', 'AA', 'ZZ']);
  const pouzite = new Set<string>();
  eq('xlsx: název listu bez zakázaných znaků a unikátní', [nazevListu('Tržby/DPH: [říjen]', 1, pouzite), nazevListu('Tržby/DPH: [říjen]', 2, pouzite)], ['Tržby DPH   říjen', 'Tržby DPH   říjen 2']);
  const xlsx = unzipSync(zapisXlsx(listy));
  ok('xlsx: platný zip s workbookem a styly', !!xlsx['xl/workbook.xml'] && !!xlsx['xl/styles.xml'] && !!xlsx['[Content_Types].xml']);
  const wb = strFromU8(xlsx['xl/workbook.xml']);
  eq('xlsx: listy ve správném pořadí', [...wb.matchAll(/<sheet name="([^"]+)"/g)].map(m => m[1]), ['Souhrn', 'Účtenky', 'Příjemky', 'Uzávěrky', 'Pokladní pohyby', 'Tržby a DPH']);
  const list2 = strFromU8(xlsx['xl/worksheets/sheet2.xml']);
  ok('xlsx: částka jako číslo se stylem', list2.includes('<c r="D2" s="2"><v>1234.5</v></c>'));
  ok('xlsx: datum jako text ISO', list2.includes('<t xml:space="preserve">2026-10-03</t>'));
  ok('xlsx: tučná hlavička', list2.includes('<c r="A1" t="inlineStr" s="1">'));
  ok('xlsx: šířky sloupců', /<col min="1" max="1" width="\d+" customWidth="1"\/>/.test(list2));
  ok('xlsx: escapuje &', list2.includes('Makro Cash &amp; Carry'));

  // --- PRECTI-ME ---
  const pm = precteMe(d, s, listy, { vygenerovano: '2026-11-03T06:17:00Z', chybejici: ['fotky/x.jpg'] });
  ok('precti-me: IČO, DIČ a období', pm.includes('IČO: 17944953') && pm.includes('DIČ: CZ17944953') && pm.includes('2026-10-01 – 2026-10-31'));
  ok('precti-me: bez mezd to řekne', pm.includes('Výplaty zaměstnanců nejsou součástí'));
  ok('precti-me: chybějící fotka', pm.includes('fotka fotky/x.jpg se nepodařila načíst'));

  // --- Streamovaný ZIP (fotka 12 v úložišti chybí, 14 přijde po kouscích) ---
  let hotovo: string[] | null = null;
  const proud = proudPodkladu(d, {
    vygenerovano: '2026-11-03T06:17:00Z',
    poDokonceni: (_s, ch) => { hotovo = ch; },
    otevri: async (id) => {
      if (id === 12) return null;
      if (id === 14) return new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([1, 2])); c.enqueue(new Uint8Array([3])); c.close(); } });
      return new Uint8Array([id, id, id]);
    },
  });
  const kusy: Uint8Array[] = [];
  const cteni = proud.getReader();
  for (;;) { const { done, value } = await cteni.read(); if (done) break; kusy.push(value); }
  const celek = new Uint8Array(kusy.reduce((n, k) => n + k.length, 0));
  let pos = 0; for (const k of kusy) { celek.set(k, pos); pos += k.length; }
  const zip = unzipSync(celek);
  const jmena = Object.keys(zip).sort();
  ok('zip: obsahuje tabulky, sešit a PRECTI-ME', ['PRECTI-ME.txt', 'podklady.xlsx', 'souhrn.csv', 'uctenky.csv', 'prijemky.csv', 'uzaverky.csv', 'pokladni-pohyby.csv', 'trzby-dph.csv'].every(j => jmena.includes(j)));
  ok('zip: bez mezd žádné vyplaty.csv', !jmena.includes('vyplaty.csv'));
  eq('zip: fotka po kouscích celá', Array.from(zip[plan.podleUrl.get('/api/upload/14')!] ?? []), [1, 2, 3]);
  ok('zip: chybějící fotka v ZIPu není', !zip[plan.podleUrl.get('/api/upload/12')!]);
  ok('zip: chybějící fotka je v PRECTI-ME', strFromU8(zip['PRECTI-ME.txt']).includes(plan.podleUrl.get('/api/upload/12')!));
  ok('zip: v tabulce u ní „chybí"', strFromU8(zip['uctenky.csv']).split('\r\n')[2].includes(';chybí;'));
  ok('zip: vnořený sešit je platný', !!unzipSync(zip['podklady.xlsx'])['xl/worksheets/sheet1.xml']);
  eq('zip: dokončení ohlášeno s chybějícími', (hotovo ?? []).length, 1);

  // --- Odkaz pro účetní ---
  const T = 'tajemstvi-pro-test-0123456789';
  const ted = new Date('2026-11-03T06:00:00Z');
  const tok = podepisOdkazUcetni({ teamId: 42, od: '2026-10-01', do: '2026-10-31', mzdy: true, verze: 3 }, T, ted)!;
  ok('odkaz: vznikne', typeof tok === 'string' && tok.startsWith('42.20261001.20261031.1.3.'));
  const ov = overOdkazUcetni(tok, T, new Date('2026-11-10T00:00:00Z'));
  eq('odkaz: platný vrátí obsah', ov.ok ? ov.obsah : null, { teamId: 42, od: '2026-10-01', do: '2026-10-31', mzdy: true, verze: 3 });
  eq('odkaz: po 14 dnech vypršel', overOdkazUcetni(tok, T, new Date(ted.getTime() + (PLATNOST_ODKAZU_UCETNI_DNI * 86400 + 1) * 1000)), { ok: false, duvod: 'vyprsel' });
  eq('odkaz: změněné mzdy = neplatný', overOdkazUcetni(tok.replace('.1.3.', '.0.3.'), T, ted), { ok: false, duvod: 'neplatny' });
  eq('odkaz: změněné období = neplatný', overOdkazUcetni(tok.replace('20261031', '20261130'), T, ted), { ok: false, duvod: 'neplatny' });
  eq('odkaz: jiné tajemství = neplatný', overOdkazUcetni(tok, 'jine-tajemstvi-0123456789', ted), { ok: false, duvod: 'neplatny' });
  eq('odkaz: krátké tajemství nepodepíše', podepisOdkazUcetni({ teamId: 1, od: '2026-10-01', do: '2026-10-31', mzdy: false, verze: 1 }, 'kratke'), null);
  ok('odkaz: verze sedí / po zneplatnění ne', platnaVerze({ verze: 3 }, 3) && !platnaVerze({ verze: 3 }, 4));
  ok('odkaz: cesta', cestaOdkazuUcetni('a.b').startsWith('/api/ucetni/odkaz?t='));
}
