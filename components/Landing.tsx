import Pricing from './Pricing';
import ForceLight from './landing/ForceLight';
import LandingHeader from './landing/LandingHeader';
import Jeviste from './landing/sekce/Jeviste';
import DenSPodnikem from './landing/sekce/DenSPodnikem';
import MistoCeho from './landing/sekce/MistoCeho';
import JakZacit from './landing/sekce/JakZacit';
import Jistoty from './landing/sekce/Jistoty';
import Faq from './landing/sekce/Faq';
import ZaverecneCta from './landing/sekce/ZaverecneCta';
import Paticka from './landing/sekce/Paticka';
import { jsonLdRetezec } from './landing/seo';
import { getT } from '@/lib/i18n/server';
import './landing/landing.css';

// Prodejní stránka pro nepřihlášené: co Managero je, co umí a co stojí.
// Přihlášení ji nikdy nevidí (jdou rovnou do aplikace).
//
// „Živé jeviště": stránka je inkoustová scéna a jediné, co na ní svítí, je
// skutečná aplikace. Žádné fotky, skvrny ani sklo; produkt nese stránku sám.
// Ukázka v hero jede při scrollu s návštěvníkem a funkce ji přepínají
// (sekce/Jeviste), den běží v nahrávkách téže aplikace.
//
// Pořadí sekcí kopíruje otázky návštěvníka: co to je a můžu si to zkusit →
// pro koho → co umí → jak vypadá den s ním → co z provozu zmizí → zvládnu to
// → jistoty → kolik to stojí → co když → jdu do toho.
//
// ForceLight: aplikace v ukázce i tokeny tlačítek zůstávají ve světlém motivu;
// tma stránky je jeviště z landing.css, ne tmavý motiv aplikace.
export default async function Landing() {
  // Jazyk stránky: přepínač (cookie), jinak země návštěvníka (lib/i18n/jazykPozadavku.ts).
  const t = await getT(['landing']);
  return (
    <div lang={t.jazyk} className="ld-root">
      <ForceLight />
      {/* Přeskočit: klávesnice nemá projít hlavičku, ukázku a funkce, aby se dostala k ceně. */}
      <a href="#ukazka-okno" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 ld-btn ld-btn-sm ld-btn-svetle">{t('Přeskočit na ukázku')}</a>
      <a href="#cenik" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 ld-btn ld-btn-sm ld-btn-svetle">{t('Přeskočit na ceník')}</a>

      <LandingHeader />

      <main>
        <Jeviste />
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
