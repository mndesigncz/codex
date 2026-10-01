import Pricing from './Pricing';
import ForceLight from './landing/ForceLight';
import LandingHeader from './landing/LandingHeader';
import HlavaMrizky from './landing/sekce/HlavaMrizky';
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
// „Rozvrh jako mřížka": stránka je rozvrh z aplikace. Papírová plocha,
// vlevo sloupec řádků (časy a názvy), vpravo dvanáct sloupců vymezených
// vlasovými linkami; všechno sedí v buňkách téže mřížky. Den stránky začíná
// v 7:30 nadpisem a končí ve 22:00 závěrečnou výzvou. Žádné fotky, skvrny ani
// sklo; produkt nese stránku sám (živá ukázka a nahrávky).
//
// Pořadí sekcí kopíruje otázky návštěvníka: co to je a můžu si to zkusit →
// pro koho → co umí → jak vypadá den s ním → co z provozu zmizí → zvládnu to
// → jistoty → kolik to stojí → co když → jdu do toho.
//
// ForceLight: aplikace v ukázce i tokeny tlačítek zůstávají ve světlém motivu;
// barvy stránky jsou svět z landing.css, ne motiv aplikace.
export default function Landing() {
  return (
    <div lang="cs" className="ld-root" data-svet="mrizka">
      <ForceLight />
      {/* Přeskočit: klávesnice nemá projít hlavičku, ukázku a funkce, aby se dostala k ceně. */}
      <a href="#ukazka-okno" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 ld-btn ld-btn-sm ld-btn-svetle">Přeskočit na ukázku</a>
      <a href="#cenik" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 ld-btn ld-btn-sm ld-btn-svetle">Přeskočit na ceník</a>

      {/* Linky mřížky rozvrhu: dvanáct sloupců přes celou výšku okna. */}
      <div className="ld-linky" aria-hidden>
        <div className="ld-linky-sit">{Array.from({ length: 12 }, (_, i) => <span key={i} />)}</div>
      </div>

      <LandingHeader />

      <main>
        <HlavaMrizky />
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
