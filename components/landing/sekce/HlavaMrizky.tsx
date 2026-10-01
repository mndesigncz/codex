import { Icon } from '@/components/Icons';
import Ukazka from '../ukazka/Ukazka';
import UkazVUkazce from '../UkazVUkazce';
import Zkusit from '../Zkusit';
import { FUNKCE, FUNKCE_DALSI, HERO, TYPY_PODNIKU } from '../obsah';

// Rozvrh jako mřížka: horní polovina stránky (hero, ukázka, pro koho, funkce).
//
// Stránka stojí na mřížce rozvrhu z aplikace: vlevo sloupec řádků (časy a názvy,
// kreslí je CSS z `data-radek`), vpravo dvanáct sloupců vymezených vlasovými
// linkami. Všechno, co na stránce je, sedí v buňkách téže mřížky, takže šířky
// a okraje nemůžou ujet: přesně to, co na staré stránce vadilo. Den začíná
// v 7:30 nadpisem a končí ve 22:00 závěrečnou výzvou.
export default function HlavaMrizky() {
  return (
    <>
      <section id="ukazka" className="ld-sekce ld-hero-m" data-radek="7:30" data-ted aria-labelledby="nadpis-hero">
        <div className="ld-obsah">
          <div className="ld-split ld-split-hero grid grid-cols-1 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] gap-y-8 items-end">
            {/* LCP: obyčejné HTML bez animace vstupu. */}
            <h1 id="nadpis-hero" className="ld-h1 ld-h1-m">{HERO.h1}</h1>
            <div>
              <p className="ld-perex max-w-[24ch]">Skutečná aplikace s vymyšlenými daty. Klikej.</p>
              <div className="mt-6"><Zkusit /></div>
              <p className="ld-meta mt-4 max-w-[34ch]">{HERO.mikro}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="ld-sekce ld-sekce-tesna" data-radek="9:00" aria-label="Živá ukázka aplikace">
        <div className="ld-obsah">
          <div className="ld-bunka">
            <Ukazka />
          </div>
        </div>
      </section>

      {/* Pro koho: dřív pás fotek, teď šest buněk jednoho řádku. */}
      <section className="ld-sekce" data-radek="Pro koho" aria-labelledby="pas-nadpis">
        <div className="ld-obsah">
          <h2 id="pas-nadpis" className="ld-bunka ld-h3 text-[color:var(--ld-text-2)]">Pro koho je Managero</h2>
          <ul className="ld-split mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 list-none">
            {TYPY_PODNIKU.map(t => (
              <li key={t} className="ld-typ-m py-5 border-t border-[color:var(--ld-linka-2)]">{t}</li>
            ))}
          </ul>
          <p className="ld-bunka ld-text mt-8 max-w-[52ch]">Pro každý podnik, kde se točí směny, počítá kasa a dochází mléko. Jeden podnik nebo víc poboček.</p>
        </div>
      </section>

      <section id="funkce" className="ld-sekce" data-radek="Funkce" aria-labelledby="nadpis-funkce">
        <div className="ld-obsah">
          <div className="ld-split grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-y-5 items-end">
            <h2 id="nadpis-funkce" className="ld-h2">Všechno, co provoz potřebuje</h2>
            <p className="ld-perex max-w-[34ch]">Věci, které jinak děláte ve třech aplikacích, dvou sešitech a jedné hlavě.</p>
          </div>
          <ul className="ld-split mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 list-none">
            {FUNKCE.map(f => (
              <li key={f.title} className="flex flex-col items-start border-t border-[color:var(--ld-linka-2)] pt-6 pb-12">
                <h3 className="text-xl font-semibold tracking-tight">{f.title}</h3>
                <p className="ld-text mt-3">{f.text}</p>
                {f.scena && (
                  <UkazVUkazce scena={f.scena} className="mt-auto pt-5 tap-target-sm inline-flex items-center gap-1.5 text-[0.9375rem] font-semibold underline decoration-[color:var(--ld-linka-2)] underline-offset-4 hover:decoration-current">
                    Ukaž v ukázce <Icon name="chevron" size={14} className="ld-sipka -rotate-90" aria-hidden />
                  </UkazVUkazce>
                )}
              </li>
            ))}
          </ul>
          <p className="ld-bunka ld-meta mt-2 max-w-[60ch]">{FUNKCE_DALSI}</p>
        </div>
      </section>
    </>
  );
}
