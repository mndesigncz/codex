'use client';

// Úvod a přihlášení hosta (předloha A 06): stejný balíček karet jako předmět, ne ilustrace. Tři inkoustové karty
// natočené do vějíře, přední s monogramem, tenkým „7 / 10“ a lištou razítek. Vymyšlená ukázka bez
// dat (nikdo není přihlášený), celá skrytá odečítači — význam nese titulek pod ní. Rozměry s „!“:
// .hp-karta má šířku 100 % a polohu relative, natočená karta by jinak na 320 px přečnívala.

import { InkoustovaKarta } from '../../penezenka';

const ZADNI = '!absolute !left-[6%] !w-[88%] h-[176px] min-[400px]:h-[186px] md:h-[236px]';

export default function BalicekVstup({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden className={`relative mx-auto w-full max-w-[340px] md:max-w-[440px] h-[236px] min-[400px]:h-[250px] md:h-[318px] ${className}`}>
      <span className={`hp-karta !p-0 ${ZADNI} top-[4px] -rotate-[7deg]`}><span className="hp-tex hp-tex-tecky" /></span>
      <span className={`hp-karta !p-0 ${ZADNI} top-[26px] md:top-[32px] -rotate-2`}><span className="hp-tex hp-tex-koleje" /></span>
      <InkoustovaKarta
        varianta="predni"
        nazev="Managero client" // i18n-ok: název produktu (stejný hrdina na úvodu i na přihlášení)
        klic="managero-client"
        cislo={7}
        z="/ 10"
        razitka={{ pocet: 7, cil: 10, popis: '7 / 10' }}
        className={`${ZADNI} !min-h-0 !p-[18px] md:!p-[22px] top-[54px] md:top-[70px] rotate-[4deg] [&_.hp-cislo]:!text-[54px] md:[&_.hp-cislo]:!text-[72px] [&_.hp-karta-stred]:!pt-2`}
      />
    </div>
  );
}
