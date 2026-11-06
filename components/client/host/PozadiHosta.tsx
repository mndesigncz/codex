// Pozadí hosta (směr A „Peněženka“, 2026-11; původně korekce 2026-10-27): skvrny prodejní stránky
// (`.lg-blob-*` v globals.css) — limetka vpravo nahoře, krém vlevo, slabší limetka vpravo dole pod
// dokem — rozmazané 70 px, statické, za obsahem. V tmavém režimu tlumené a pod nimi vlastní
// inkoustová atmosféra (`.hp-atmosfera`: dva měkké světlejší inkousty, žádná cizí barva).
// Leží pod `.h-plocha` (kořen ClientShell) fixně k oknu; v rámu náhledu ve správě (`ram`) absolutně
// a menší, ať náhled vypadá jako telefon hosta. Při „méně průhlednosti“ skvrny zmizí (globals.css).

/** Skvrny pod sklem + tmavá atmosféra. Statické, za obsahem. */
export default function PozadiHosta({ ram = false }: { ram?: boolean }) {
  return (
    <div className={`h-pozadi ${ram ? 'h-pozadi-ram' : ''}`} aria-hidden>
      <div className="hp-atmosfera" />
      <div className={`lg-blob lg-blob-lime ${ram ? 'w-56 h-56 -top-16 -right-20' : 'w-[24rem] h-[24rem] -top-36 -right-44 md:w-[46rem] md:h-[46rem] md:-top-48 md:-right-40'}`} />
      <div className={`lg-blob lg-blob-cream ${ram ? 'w-52 h-52 top-[38%] -left-24' : 'w-[26rem] h-[26rem] top-[36%] -left-56 md:w-[34rem] md:h-[34rem] md:top-[38%] md:-left-52'}`} />
      <div className={`lg-blob lg-blob-lime-2 ${ram ? 'w-48 h-48 -bottom-16 -right-12' : 'w-[19rem] h-[19rem] -bottom-16 -right-32 md:w-[30rem] md:h-[30rem] md:top-[30%] md:bottom-auto md:left-[40%] md:right-auto'}`} />
    </div>
  );
}
