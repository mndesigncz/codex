import { Icon } from '@/components/Icons';
import Reveal from '../Reveal';
import { JISTOTY } from '../obsah';

// Jistoty: věci, na které se majitel ptá dřív než na cenu. Jeden panel, šest
// položek (sudý počet: v mřížce po dvou ani po třech nezůstane osiřelá buňka).
export default function Jistoty() {
  return (
    <section id="jistoty" className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24" aria-labelledby="nadpis-jistoty">
      <div className="max-w-xl">
        <h2 id="nadpis-jistoty" className="text-2xl sm:text-4xl font-bold tracking-tight text-[#16181A]">Než se zeptáš na cenu</h2>
        <p className="mt-3 text-base text-black/60 text-pretty">Věci, kvůli kterým podniky software mění a kvůli kterým ho zase opouštějí.</p>
      </div>
      <Reveal>
        <ul className="mt-10 lgx rounded-[2rem] p-6 sm:p-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-9 list-none">
          {JISTOTY.map(j => (
            <li key={j.title} className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#C8F542]/25 text-[#5B7A08]">
                <Icon name={j.icon} size={20} aria-hidden />
              </span>
              <div>
                <h3 className="text-lg font-bold tracking-tight text-[#16181A]">{j.title}</h3>
                <p className="mt-1.5 text-sm text-black/60 leading-relaxed text-pretty">{j.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
