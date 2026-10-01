import Link from 'next/link';
import { Icon } from '@/components/Icons';
import { KROKY, TYPY_PODNIKU } from '../obsah';

// Jak začít: tři kroky vedle sebe na jedné lince, jako kolejnice, po které
// se jede zleva doprava. Pořadí tu nese informaci (nejdřív podnik, pak tým,
// pak rozvrh), proto jsou čísla velká; ikony ani karty nejsou potřeba.
// Pod prvním krokem typy podniků, ze kterých se v průvodci vybírá.
//
// Čas se tu záměrně neslibuje číslem: „za 5 minut" tvrdit, dokud průvodce není
// změřený, by bylo vymyšlené.
export default function JakZacit() {
  return (
    <section id="zacatek" className="ld-sekce" aria-labelledby="nadpis-zacatek">
      <div className="ld-obsah">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-x-16 gap-y-6 items-end">
          <h2 id="nadpis-zacatek" className="ld-h2">Jak se začíná</h2>
          <p className="ld-perex max-w-[40ch]">Tři kroky. Bez schůzky, bez implementace a bez toho, aby se celý tým musel něco učit.</p>
        </div>

        <ol className="mt-14 sm:mt-20 grid grid-cols-1 md:grid-cols-3 gap-x-10 list-none border-t border-[color:var(--ld-linka-2)]">
          {KROKY.map((k, i) => (
            <li key={k.n} className="relative pt-8 pb-10 md:pb-0 border-b md:border-b-0 border-[color:var(--ld-linka)]">
              {/* Bod na lince: tady krok začíná. */}
              <span className="absolute -top-[5px] left-0 h-[9px] w-[9px] rounded-full bg-[color:var(--ld-papir)]" aria-hidden />
              <p className="ld-cislo text-[clamp(3rem,5vw,4.5rem)] font-bold leading-none tracking-[-0.04em] text-[rgb(var(--ld-fg)/0.3)]" aria-hidden>{k.n}</p>
              <h3 className="ld-h3 mt-6">{k.title}</h3>
              <p className="ld-text mt-3 max-w-[36ch]">{k.text}</p>
              {i === 0 && (
                <ul className="mt-6 flex flex-wrap gap-2 list-none" aria-label="Typy podniků v prvním kroku">
                  {TYPY_PODNIKU.map(t => (
                    <li key={t} className="rounded-full px-3 py-1.5 text-[0.8125rem] font-medium text-[color:var(--ld-text-2)] shadow-[inset_0_0_0_1px_var(--ld-linka-2)]">{t}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>

        <div className="mt-14">
          <Link href="/register" className="ld-btn ld-btn-svetle w-full sm:w-auto">
            Založit podnik <Icon name="chevron" size={15} className="ld-sipka -rotate-90" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
