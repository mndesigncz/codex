import { FAQ } from '../obsah';

// Časté otázky: nativní <details>, funguje bez skriptu i s klávesnicí. Nadpis
// vlevo stojí, otázky vpravo jedou; jedna vlasová linka mezi nimi, žádné karty.
// Rozbalení je plynulé tam, kde prohlížeč umí animovat výšku na auto.
export default function Faq() {
  return (
    <section id="otazky" className="ld-sekce" aria-labelledby="nadpis-otazky">
      <div className="ld-obsah grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-x-16 gap-y-10">
        <div>
          <div className="lg:sticky lg:top-28">
            <h2 id="nadpis-otazky" className="ld-h2">Časté otázky</h2>
            <p className="ld-text mt-5 max-w-[34ch]">Krátké odpovědi na to, co se řeší před založením podniku.</p>
          </div>
        </div>
        <div>
          {FAQ.map(f => (
            <details key={f.q} className="ld-otazka group">
              <summary className="flex min-h-[4.25rem] items-center justify-between gap-6 py-5 text-[1.0625rem] font-semibold tracking-tight">
                {f.q}
                <span className="ld-plus text-[color:var(--ld-text-2)]" aria-hidden />
              </summary>
              <p className="ld-text pb-7 pr-10 max-w-[62ch]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
