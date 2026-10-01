import { Icon } from '@/components/Icons';
import { FAQ } from '../obsah';

// Časté otázky: nativní <details>, funguje bez skriptu i s klávesnicí.
//
// Jeden skleněný panel s linkami mezi otázkami, stejně jako Jistoty nad ceníkem.
// Dřív měla každá otázka vlastní plovoucí sklo se stínem: deset stínů pod sebou
// se slilo do šedé šmouhy a seznam vypadal těžší než ceník. Otevření se v
// prohlížečích, které umí ::details-content, rozbalí plynule (landing.css),
// ostatní ho otevřou hned.
export default function Faq() {
  return (
    <section id="otazky" className="relative max-w-3xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24 scroll-mt-24" aria-labelledby="nadpis-otazky">
      <h2 id="nadpis-otazky" className="text-2xl sm:text-3xl font-bold tracking-tight text-[#16181A]">Časté otázky</h2>
      <div className="ld-faq mt-6 lgx rounded-[2rem] px-5 sm:px-8 py-2">
        {FAQ.map(f => (
          <details key={f.q} className="group border-t border-black/[0.07] first:border-t-0">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3 py-4 text-sm sm:text-base font-semibold text-[#16181A] tap-target">
              {f.q}
              <span className="ld-faq-ikona grid h-7 w-7 shrink-0 place-items-center rounded-full bg-black/[0.04] text-black/50">
                <Icon name="chevron" size={15} className="transition-transform duration-300 group-open:rotate-180" aria-hidden />
              </span>
            </summary>
            <p className="pb-5 pr-10 text-sm text-black/60 leading-relaxed text-pretty">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
