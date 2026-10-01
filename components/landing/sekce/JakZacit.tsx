import Link from 'next/link';
import { Icon } from '@/components/Icons';
import Foto from '../Foto';
import Reveal from '../Reveal';
import { KROKY, TYPY_PODNIKU } from '../obsah';

// Jak začít: tři kroky v jednom panelu s linkou. Za nadpisy kroků dřív stály
// ikony (plus, lidé, kalendář): tři různé značky bez významu vedle čísla, které
// pořadí už říká, a stránka vypadala jako skládačka.
// Tři stejné karty vedle sebe
// jsou nejčastější šablona na webu; číslo je velké a tlumené, aby pořadí bylo
// vidět, ne aby křičelo. Vpravo typy podniků, ze kterých se vybírá v prvním kroku
// (stejné fotky jako v průvodci nastavením).
//
// Čas se tu záměrně neslibuje číslem: „za 5 minut" tvrdit, dokud průvodce není
// změřený, by bylo vymyšlené. Stojí tu, co se dá ověřit: tři kroky, jeden kód,
// bez schůzky a bez implementace.
export default function JakZacit() {
  return (
    <section id="zacatek" className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24 scroll-mt-24" aria-labelledby="nadpis-zacatek">
      <div className="max-w-xl">
        <h2 id="nadpis-zacatek" className="text-2xl sm:text-4xl font-bold tracking-tight text-[#16181A]">Jak se začíná</h2>
        <p className="mt-3 text-base text-black/60 text-pretty">Tři kroky. Bez schůzky, bez implementace a bez toho, aby se celý tým musel něco učit.</p>
      </div>
      <Reveal>
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-10 lg:gap-14 items-start">
          <ol className="list-none relative">
            {KROKY.map((k, i) => (
              <li key={k.n} className="relative flex gap-5 pb-9 last:pb-0">
                {/* Linka mezi kroky. */}
                {i < KROKY.length - 1 && <span className="absolute left-[1.4rem] top-12 bottom-1 w-px bg-black/[0.12]" aria-hidden />}
                <span className="relative z-[1] flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#16181A] text-sm font-bold text-white tabular-nums">{k.n}</span>
                <div className="pt-0.5">
                  <h3 className="text-lg font-bold tracking-tight text-[#16181A]">{k.title}</h3>
                  <p className="mt-1.5 text-sm sm:text-base text-black/60 leading-relaxed text-pretty max-w-[44ch]">{k.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <div>
            <p className="t-label text-black/50">V prvním kroku si vybereš typ podniku</p>
            <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 list-none">
              {TYPY_PODNIKU.map(t => (
                <li key={t.id}>
                  <Foto id={t.id} pomer="aspect-[4/3]" sizes="(max-width: 640px) 44vw, 14rem" paralax={false} />
                  <p className="mt-1.5 text-sm font-semibold text-[#16181A]">{t.label}</p>
                </li>
              ))}
            </ul>
            <Link href="/register" className="pressable mt-6 btn btn-primary btn-lg inline-flex w-full sm:w-auto items-center justify-center gap-2 active:scale-[0.97]">
              Založit podnik <Icon name="chevron" size={15} className="ld-sipka -rotate-90" />
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
