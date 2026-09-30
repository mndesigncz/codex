import { Icon } from '@/components/Icons';
import { FAQ } from '../obsah';

// Časté otázky: nativní <details>, funguje bez skriptu i s klávesnicí.
export default function Faq() {
  return (
    <section id="otazky" className="relative max-w-3xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24 scroll-mt-24" aria-labelledby="nadpis-otazky">
      <h2 id="nadpis-otazky" className="text-2xl sm:text-3xl font-bold tracking-tight text-[#16181A]">Časté otázky</h2>
      <div className="mt-6 space-y-3">
        {FAQ.map(f => (
          <details key={f.q} className="lgx rounded-3xl px-6 py-4 group">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-sm sm:text-base font-semibold text-[#16181A] tap-target">
              {f.q}
              <Icon name="chevron" size={16} className="text-black/40 transition-transform group-open:rotate-180 shrink-0" aria-hidden />
            </summary>
            <p className="mt-3 text-sm text-black/60 leading-relaxed text-pretty">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
