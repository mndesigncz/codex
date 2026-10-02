// Tečka značky Managero: „a tečka" = hotovo, sedí, nic se neřeší.
// Objeví se jen tam, kde je opravdu hotovo (kasa sedí po odeslané uzávěrce),
// nikdy jako ozdoba a nikdy dvakrát na obrazovce. Je dekorativní —
// význam nese text vedle ní, proto aria-hidden. Při mountu jednou cvakne
// (globals.css .tecka, jen pod prefers-reduced-motion: no-preference).
export function Tecka({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`tecka ${className}`.trim()} />;
}
