// Oprava „V hodnocení nemůžu dávat mínusové body" (Martin).
//
// Server hodnocení směny záporné body bere odjakživa (POST /api/shift-reviews: −500…500, položky −100…100)
// a bilance je sčítá (SUM(points) v lib/pointsBalance; denní strop bere jen plus, srážky platí vždy).
// Chyba byla v okně hodnocení: pole „Body za směnu" bylo <input type="number" inputMode="numeric"> řízené
// číslem a měnilo se přes parseInt(...) || 0 — samotné „-" (rozepsaný zápor) prohlížeč hlásí jako prázdnou
// hodnotu, takže se pole hned přepsalo na 0, a iPhone u inputMode="numeric" klávesu minus vůbec nemá.
// Stejně dopadala záporná pole „Automatické body za směnu" (srážky) v Nastavení bodů.
// Teď je jedno pole s textem (rozepsané „-" vydrží), krokovačem −/+ a tlačítkem ± (na iPhonu jediná cesta k minusu).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { cistiTextBodu, hodnotaBodu, krokBodu, otocZnamenko, textBodu } from '../../lib/bodyVstup.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  // ---- rozepsaný text ----
  eq('vstup: samotné „-" vydrží (rozepsaný zápor), ne 0', cistiTextBodu('-'), '-');
  eq('vstup: typografické minus a pomlčka z klávesnice telefonu = „-"', [cistiTextBodu('−5'), cistiTextBodu('–12')], ['-5', '-12']);
  eq('vstup: písmena, mezery a druhé minus pryč, nejvýš 4 číslice', [cistiTextBodu(' 1a2 '), cistiTextBodu('--5'), cistiTextBodu('5-'), cistiTextBodu('123456')], ['12', '-5', '5', '1234']);
  eq('vstup: „+5" je 5', cistiTextBodu('+5'), '5');

  // ---- hodnota ----
  eq('hodnota: „-" a „" ještě nejsou číslo (null — pole se nepřepíše na 0)', [hodnotaBodu('-', -500, 500), hodnotaBodu('', -500, 500)], [null, null]);
  eq('hodnota: „-15" = −15', hodnotaBodu('-15', -500, 500), -15);
  eq('hodnota: mimo rozsah se ořízne', [hodnotaBodu('-900', -500, 500), hodnotaBodu('900', -500, 500), hodnotaBodu('-5', 0, 100)], [-500, 500, 0]);
  eq('text: z čísla zpátky (0 → „0", −5 → „-5")', [textBodu(0), textBodu(-5), textBodu(12)], ['0', '-5', '12']);

  // ---- krokovač a znaménko ----
  eq('krok: z 0 dolů do minusu (srážka), ne zastavit na 0', [krokBodu(0, -1, -500, 500), krokBodu(-499, -5, -500, 500), krokBodu(3, 1, -10, 10)], [-1, -500, 4]);
  eq('krok: bez dovoleného minusu (min 0) pod 0 neklesne', krokBodu(0, -1, 0, 100), 0);
  eq('znaménko: ± otočí rozepsaný text (iPhone nemá minus na číselné klávesnici)', [otocZnamenko('15'), otocZnamenko('-15'), otocZnamenko(''), otocZnamenko('-'), otocZnamenko('0')], ['-15', '15', '-', '', '-0']);

  // ---- napojení ----
  const okno = zdroj('components/employer/ShiftReviewModal.tsx');
  ok('hodnocení směny: „Body za směnu" jde přes BodyVstup s minusem (ne type=number + parseInt || 0)', okno.includes('<BodyVstup') && !/type="number"[^>]*parseInt\(e\.target\.value\) \|\| 0/.test(okno) && /min=\{-500\}/.test(okno));
  const nastaveni = zdroj('components/employer/RewardsView.tsx');
  ok('Nastavení bodů: srážky (záporná pole) přes BodyVstup, odměny zůstávají ≥ 0', nastaveni.includes('<BodyVstup') && /min=\{zaporne \? -100 : 0\}/.test(nastaveni));
  const vstup = zdroj('components/employer/BodyVstup.tsx');
  ok('BodyVstup: textové pole (ne type=number), ± a krokovač s popisky pro odečítač', vstup.includes('type="text"') && !vstup.includes('type="number"') && vstup.includes("t('Otočit znaménko')") && vstup.includes("t('Ubrat bod')") && vstup.includes("t('Přidat bod')"));
  const api = zdroj('app/api/shift-reviews/route.ts');
  ok('server: hodnocení směny bere zápor (−500…500) a položky (−100…100)', api.includes('Math.max(-500, Math.min(500') && api.includes('Math.max(-100, Math.min(100'));
  ok('server: oznámení u záporných bodů neříká „+-5"', /pointsAwarded > 0 \? '\+' : ''/.test(api));
  const bilance = zdroj('lib/bodyDenDb.ts');
  ok('bilance: denní strop bere z ručního hodnocení jen plus (GREATEST), zápor jde do zůstatku vždy (SUM v pointsBalance)', bilance.includes('GREATEST(COALESCE(points, 0), 0)') && zdroj('lib/pointsBalance.ts').includes('COALESCE(SUM(points),0)::int AS pts'));
}
