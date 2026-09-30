// Kolo 71 — klepnutí na kartu widgetu v klidu: kdy smí navigovat (lib/widgety/klik.ts).
//
// Rozhodovací logika je čistá funkce nad fakty ze stisku a z clicku, takže jde
// otestovat bez prohlížeče. Hlídá se hlavně to, co by odhodilo člověka do jiné
// sekce uprostřed rozdělané práce: stisk na tlačítku, který ujel na kartu,
// a klepnutí, které jen zavřelo okno nebo menu. K tomu pojistka nad
// zdrojákem availability API (auto_created směny nejsou „naplánované").

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { smiKlepnutiNavigovat, SELEKTOR_INTERAKTIVNI, SELEKTOR_PREKRYV, type KlikKlid, type StiskKlid } from '../../lib/widgety/klik.ts';
import { HYSTEREZE_PX } from '../../lib/widgety/konstanty.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Kód bez komentářů — komentáře popisují, co se opravilo, a pojistky by chytaly je. */
const kod = (cesta: string) => zdroj(cesta).split('\n').filter(r => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(r)).join('\n');

const stisk = (x: Partial<StiskKlid> = {}): StiskKlid => ({ x: 100, y: 100, naInteraktivnim: false, prekryto: false, ...x });
const klik = (x: Partial<KlikKlid> = {}): KlikKlid => ({ x: 100, y: 100, naInteraktivnim: false, vPrekryvu: false, ...x });

export default function ({ eq, ok }: Testy) {
  // ---- základ ----
  eq('čisté klepnutí na tělo karty naviguje', smiKlepnutiNavigovat(stisk(), klik()), true);
  eq('klik bez stisku (klávesnice, odečítač) nenaviguje', smiKlepnutiNavigovat(null, klik()), false);
  eq('drobný posun pod hysterezí pořád naviguje', smiKlepnutiNavigovat(stisk(), klik({ x: 103, y: 104 })), true);
  eq('posun přesně o hysterezi ještě projde', smiKlepnutiNavigovat(stisk(), klik({ x: 100 + HYSTEREZE_PX })), true);
  eq('posun přes hysterezi (tah, rolování) nenaviguje', smiKlepnutiNavigovat(stisk(), klik({ x: 100, y: 100 + HYSTEREZE_PX + 1 })), false);

  // ---- interaktivní prvek: cíl clicku i cíl stisku ----
  eq('click na tlačítku nenaviguje', smiKlepnutiNavigovat(stisk(), klik({ naInteraktivnim: true })), false);
  eq('stisk na tlačítku, puštění na kartě (click na li) nenaviguje', smiKlepnutiNavigovat(stisk({ naInteraktivnim: true }), klik({ x: 106, y: 100 })), false);
  eq('totéž bez posunu (stisk začal na tlačítku) nenaviguje', smiKlepnutiNavigovat(stisk({ naInteraktivnim: true }), klik()), false);

  // ---- překryvy ----
  eq('klepnutí na pozadí okna (zavírá okno) nenaviguje', smiKlepnutiNavigovat(stisk({ prekryto: true }), klik({ vPrekryvu: true })), false);
  eq('click v překryvu i bez příznaku ze stisku nenaviguje', smiKlepnutiNavigovat(stisk(), klik({ vPrekryvu: true })), false);
  eq('klepnutí do karty, které zavřelo popover (byl otevřený při stisku), nenaviguje', smiKlepnutiNavigovat(stisk({ prekryto: true }), klik()), false);
  eq('po zavřeném překryvu se klepne zase normálně', smiKlepnutiNavigovat(stisk({ prekryto: false }), klik()), true);

  // ---- selektory: pokrývají, co se v aplikaci opravdu používá ----
  for (const s of ['button', 'a', 'input', 'select', 'textarea', 'label', '[data-bez-podrzeni]', '[data-plocha-chrom]']) {
    ok(`interaktivní selektor zná ${s}`, SELEKTOR_INTERAKTIVNI.includes(s));
  }
  for (const s of ['.modal-overlay', '[role="dialog"]', '[role="menu"]', '[aria-haspopup][aria-expanded="true"]']) {
    ok(`selektor překryvů zná ${s}`, SELEKTOR_PREKRYV.includes(s));
  }
  // Modal se kreslí inline a jeho pozadí nese tuhle třídu — kdyby ji Modal ztratil, klepnutí vedle okna by zase navigovalo.
  ok('Modal má pozadí s třídou modal-overlay', zdroj('components/ui/Modal.tsx').includes('modal-overlay'));
  ok('Menu panel má role="menu" a spoušť aria-haspopup', zdroj('components/ui/Menu.tsx').includes('role="menu"') && zdroj('components/ui/Menu.tsx').includes('aria-haspopup="menu"'));

  // ---- plocha: používá tuhle funkci a stisk si pamatuje ----
  const plocha = kod('components/widgety/PlochaWidgetu.tsx');
  ok('klikKlid rozhoduje přes smiKlepnutiNavigovat', plocha.includes('smiKlepnutiNavigovat('));
  ok('stisk v klidu ukládá cíl stisku i otevřený překryv', /naInteraktivnim: jeInteraktivniCil\(e\.target\), prekryto: jePrekryvOtevreny\(document\)/.test(plocha));

  // ---- availability API: automaticky vzniklé směny nejsou plán ----
  const api = kod('app/api/availability/route.ts');
  const dotaz = api.split('\n').find(r => r.includes('COUNT(*)') && r.includes('FROM shifts')) ?? '';
  ok('naplanovanoSmen počítá směny měsíce', dotaz.includes("date LIKE ${month + '-%'}"));
  ok('naplanovanoSmen nepočítá auto_created směny', dotaz.includes('auto_created IS NOT TRUE'));
}
