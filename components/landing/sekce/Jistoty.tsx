import { JISTOTY } from '../obsah';

// Jistoty: věci, na které se majitel ptá dřív než na cenu. Šest položek na
// vlasové mřížce, bez ikonových dlaždic a bez karet: nadpis a věta, nic, co by
// hrálo důležitější roli než text. Sudý počet: ve dvou ani třech sloupcích
// nezůstane osiřelá buňka.
export default function Jistoty() {
  return (
    <section id="jistoty" className="ld-sekce" aria-labelledby="nadpis-jistoty">
      <div className="ld-obsah">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-x-16 gap-y-6 items-end">
          <h2 id="nadpis-jistoty" className="ld-h2">Než se zeptáš na cenu</h2>
          <p className="ld-perex max-w-[40ch]">Věci, kvůli kterým podniky software mění a kvůli kterým ho zase opouštějí.</p>
        </div>
        <ul className="mt-14 sm:mt-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 list-none">
          {JISTOTY.map(j => (
            <li key={j.title} className="border-t border-[color:var(--ld-linka-2)] pt-7 pb-12">
              <h3 className="text-xl font-semibold tracking-tight">{j.title}</h3>
              <p className="ld-text mt-3 max-w-[38ch]">{j.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
