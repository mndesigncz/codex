import Pricing from './Pricing';
import Pas from './landing/Pas';
import ForceLight from './landing/ForceLight';
import LandingHeader from './landing/LandingHeader';
import Hero from './landing/sekce/Hero';
import PasFunkci from './landing/sekce/PasFunkci';
import DenSPodnikem from './landing/sekce/DenSPodnikem';
import MistoCeho from './landing/sekce/MistoCeho';
import JakZacit from './landing/sekce/JakZacit';
import Jistoty from './landing/sekce/Jistoty';
import Faq from './landing/sekce/Faq';
import ZaverecneCta from './landing/sekce/ZaverecneCta';
import Paticka from './landing/sekce/Paticka';
import { jsonLdRetezec } from './landing/seo';
import './landing/landing.css';

// Prodejní stránka pro nepřihlášené: co Managero je, co umí a co stojí.
// Přihlášení ji nikdy nevidí (jdou rovnou do aplikace).
//
// Stránka je postavená na produktu, ne na obrázcích: v hero si návštěvník
// aplikaci sám naklikne (živá ukázka v rámu zařízení), dál vidí nahrávky jejího
// ovládání ze skutečné aplikace. Fotografie podniků jsou doplněk, který říká
// „je to pro mě?", ne důkaz, že to funguje.
//
// Pořadí sekcí kopíruje otázky návštěvníka: co to je a můžu si to zkusit →
// co umí → jak vypadá den s ním → co z provozu zmizí → zvládnu to → kolik to
// stojí → co když → jdu do toho. Světlý ostrov (viz DESIGN.md): ForceLight.
export default function Landing() {
  return (
    <div className="relative min-h-[100dvh] overflow-x-clip">
      <ForceLight />
      {/* Přeskočit: klávesnice nemá projít hlavičku, ukázku a funkce, aby se dostala k ceně. */}
      <a href="#ukazka-okno" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 btn btn-primary btn-sm">Přeskočit na ukázku</a>
      <a href="#cenik" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 btn btn-primary btn-sm">Přeskočit na ceník</a>

      {/* Barevné skvrny pod sklem: celá stránka stojí na jedné vrstvě pozadí. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[130vh] overflow-hidden" aria-hidden>
        <div className="lg-blob lg-blob-lime w-[46rem] h-[46rem] -top-40 -right-40" />
        <div className="lg-blob lg-blob-cream w-[34rem] h-[34rem] top-[38rem] -left-52" />
        <div className="lg-blob lg-blob-lime-2 w-[30rem] h-[30rem] top-[16rem] left-[38%]" />
      </div>

      <LandingHeader />

      <main>
        <Hero />

        {/* Pás podniků: fotky jsou doplněk. Jede přes celou šířku okna, proto stojí mimo mřížku. */}
        <section className="relative pb-14 sm:pb-20" aria-labelledby="pas-nadpis">
          <h2 id="pas-nadpis" className="sr-only">Pro jaké podniky je Managero</h2>
          <Pas />
        </section>

        <PasFunkci />
        <DenSPodnikem />
        <MistoCeho />
        <JakZacit />
        <Jistoty />
        <Pricing />
        <Faq />
        <ZaverecneCta />
      </main>

      <Paticka />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdRetezec() }} />
    </div>
  );
}
