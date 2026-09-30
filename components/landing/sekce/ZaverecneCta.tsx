import Foto from '../Foto';
import Reveal from '../Reveal';
import Zkusit from '../Zkusit';

// Závěrečná výzva: tmavý blok s fotkou týmu. Jediné místo na stránce, kde je
// text na fotce, proto je pod ním plné ztmavení a kontrast se měří sondou cta.
export default function ZaverecneCta() {
  return (
    <section className="relative max-w-6xl mx-auto px-5 sm:px-8 pb-20" aria-labelledby="nadpis-cta">
      <Reveal>
        <div className="relative rounded-[2rem] overflow-hidden">
          <Foto id="tym" pomer="aspect-[4/5] sm:aspect-[21/9]" sizes="(max-width: 1280px) 92vw, 72rem" paralax={false} prekryv="scrim" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-5 sm:px-12 py-10">
            <h2 id="nadpis-cta" className="text-2xl sm:text-4xl font-bold tracking-tight text-white text-balance">Zítřejší směna už může viset v aplikaci.</h2>
            <p className="mt-3 text-base text-white/80 max-w-md text-pretty">Registrace bez karty. Tým se připojí jedním kódem a hned vidí, kdy jde do práce.</p>
            <div className="mt-7 w-full sm:w-auto flex justify-center">
              <Zkusit />
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
