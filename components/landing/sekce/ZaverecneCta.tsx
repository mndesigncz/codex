import Zkusit from '../Zkusit';
import { HERO } from '../obsah';

// Závěrečná výzva: stejné jeviště jako nahoře, jen bez aplikace, ta už byla
// vidět. Velká věta, jedno limetkové tlačítko a pod ním, co to stojí na začátku.
export default function ZaverecneCta() {
  return (
    <section className="ld-sekce pb-[var(--ld-rytmus)]" aria-labelledby="nadpis-cta">
      <div className="ld-obsah relative text-center">
        <div className="ld-svetlo !top-[-10%]" aria-hidden />
        <h2 id="nadpis-cta" className="ld-h1 mx-auto max-w-[13em]">Zítřejší směna už může viset v aplikaci.</h2>
        <p className="ld-perex mx-auto mt-6 max-w-[42ch]">Tým se připojí jedním kódem a hned vidí, kdy jde do práce.</p>
        <div className="mt-10 flex justify-center">
          <Zkusit />
        </div>
        <p className="ld-meta mx-auto mt-5 max-w-[46ch]">{HERO.mikro}</p>
      </div>
    </section>
  );
}
