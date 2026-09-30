import { Icon } from '@/components/Icons';
import UkazVUkazce from '../UkazVUkazce';
import { FUNKCE, FUNKCE_DALSI } from '../obsah';

// Pás funkcí: osm věcí, které aplikace umí, bez karet (osm stejných bílých
// dlaždic je šablona, ne sdělení). Kde ukázka umí totéž, je vedle funkce
// tlačítko, které ukázku nahoře přepne na příslušnou scénu.
export default function PasFunkci() {
  return (
    <section id="funkce" className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24 scroll-mt-24" aria-labelledby="nadpis-funkce">
      <div className="max-w-xl">
        <h2 id="nadpis-funkce" className="text-2xl sm:text-4xl font-bold tracking-tight text-[#16181A]">Všechno, co provoz potřebuje</h2>
        <p className="mt-3 text-base text-black/60 text-pretty">Věci, které jinak děláte ve třech aplikacích, dvou sešitech a jedné hlavě.</p>
      </div>
      <ul className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10 border-t border-black/[0.08] pt-8">
        {FUNKCE.map(f => (
          <li key={f.title} className="flex flex-col items-start">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#C8F542]/25 text-[#5B7A08]">
              <Icon name={f.icon} size={20} aria-hidden />
            </span>
            <h3 className="mt-4 text-lg font-bold tracking-tight text-[#16181A]">{f.title}</h3>
            <p className="mt-1.5 text-sm text-black/60 leading-relaxed text-pretty">{f.text}</p>
            {f.scena && (
              <UkazVUkazce scena={f.scena} className="tap-target-sm mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#16181A] underline decoration-black/25 underline-offset-4 hover:decoration-[#16181A]">
                Ukaž v ukázce <Icon name="chevron" size={13} className="-rotate-90" aria-hidden />
              </UkazVUkazce>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-10 max-w-2xl text-sm text-black/55 text-pretty">{FUNKCE_DALSI}</p>
    </section>
  );
}
