import Zkusit from '../Zkusit';
import Ukazka from '../ukazka/Ukazka';
import { HERO } from '../obsah';

// Hero: co to je, pro koho a že si to jde vyzkoušet hned. Pod textem leží živá
// ukázka (skutečná aplikace v rámu zařízení), ne fotka: návštěvník, který si
// aplikaci naklikal, ví víc než ten, kdo si ji prohlédl.
//
// Text je obyčejné HTML bez animace vstupu, protože je to LCP: nadpis se má
// ukázat s prvním vykreslením, ne po dojetí animace.
export default function Hero() {
  return (
    <section id="ukazka" className="relative" aria-labelledby="nadpis-hero">
      <div className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-10 sm:pt-14 pb-8 sm:pb-10">
        <div className="max-w-3xl">
          <h1 id="nadpis-hero" className="text-[2.4rem] leading-[1.04] sm:text-5xl lg:text-[3.5rem] font-bold tracking-[-0.03em] text-[#16181A] text-balance">
            {HERO.h1}
          </h1>
          <p className="mt-5 text-base sm:text-lg text-black/60 leading-relaxed max-w-[58ch] text-pretty">{HERO.podtitulek}</p>
          <div className="mt-7 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Zkusit />
            <a href="#ukazka-okno" className="pressable w-full sm:w-auto btn btn-secondary btn-lg active:scale-[0.97] inline-flex items-center justify-center">
              {HERO.druhe}
            </a>
          </div>
          <p className="mt-4 text-sm text-black/55 text-pretty">{HERO.mikro}</p>
        </div>
      </div>
      <Ukazka />
    </section>
  );
}
