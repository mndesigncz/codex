// Pozadí hosta (korekce 2026-10-27, „naše barvy a glass + blur efekty a pozadí“): tytéž skvrny,
// na kterých stála skleněná prodejní stránka (`.lg-blob-*` v globals.css) — limetka a krém, nic jiného.
// Leží pod `.h-plocha` (kořen ClientShell) fixně k oknu; v rámu náhledu ve správě (`ram`) absolutně
// a menší, ať náhled vypadá jako telefon hosta.

/** Skvrny pod sklem (jako prodejní stránka): limetka vpravo nahoře, krém vlevo, slabší limetka dole
 *  pod dokem. Statické, za obsahem, rozmazané 70 px; v tmavém tlumené, při „méně průhlednosti“ pryč. */
export default function PozadiHosta({ ram = false }: { ram?: boolean }) {
  return (
    <div className={`h-pozadi ${ram ? 'h-pozadi-ram' : ''}`} aria-hidden>
      <div className={`lg-blob lg-blob-lime ${ram ? 'w-56 h-56 -top-16 -right-20' : 'w-[34rem] h-[34rem] -top-44 -right-52 md:w-[46rem] md:h-[46rem] md:-top-48 md:-right-40'}`} />
      <div className={`lg-blob lg-blob-cream ${ram ? 'w-52 h-52 top-[38%] -left-24' : 'w-[28rem] h-[28rem] top-[30%] -left-56 md:w-[34rem] md:h-[34rem] md:top-[38%] md:-left-52'}`} />
      <div className={`lg-blob lg-blob-lime-2 ${ram ? 'w-48 h-48 -bottom-16 -right-12' : 'w-[26rem] h-[26rem] top-[60%] -right-44 md:w-[30rem] md:h-[30rem] md:top-[30%] md:left-[40%] md:right-auto'}`} />
    </div>
  );
}
