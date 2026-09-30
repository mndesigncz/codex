import { Icon } from '@/components/Icons';
import Reveal from '../Reveal';
import { MISTO, MISTO_PATA } from '../obsah';

// Excel a WhatsApp vs Managero: nejpoctivější prodejní argument, jaký stránka
// má. Nevyjmenovává funkce, ukazuje, co konkrétně z provozu zmizí. Pruh přes
// celou šířku v tónu limetky říká, že je to jiný druh sdělení než seznam funkcí.
//
// Tabulka je skutečná tabulka (role="table"), ne mřížka bez významu: odečítač
// oznámí sloupce. Na telefonu se sloupce skládají pod sebe a každá buňka nese
// svůj štítek, protože tři sloupce v 390 px by nikdo nepřečetl.
export default function MistoCeho() {
  return (
    <section id="misto" className="relative pb-16 sm:pb-24" aria-labelledby="nadpis-misto">
      <div className="bg-[#C8F542]/15 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="max-w-xl">
            <h2 id="nadpis-misto" className="text-2xl sm:text-4xl font-bold tracking-tight text-[#16181A]">Excel, WhatsApp a sešit, nebo Managero</h2>
            <p className="mt-3 text-base text-black/60 text-pretty">Managero se neměří tím, kolik toho umí, ale tím, co po jeho zapnutí z provozu zmizí.</p>
          </div>

          <Reveal>
            <div role="table" aria-label="Dnešní řešení a Managero" className="ld-srov mt-10">
              <div role="row" className="sr-only sm:not-sr-only sm:grid sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)] sm:gap-x-8 pb-3 border-b border-black/[0.12]">
                <div role="columnheader" className="t-label text-black/50">Oblast</div>
                <div role="columnheader" className="t-label text-black/50">Dnes: Excel, WhatsApp, sešit</div>
                <div role="columnheader" className="t-label text-[#3E5406]">S Managerem</div>
              </div>
              {MISTO.map(m => (
                <div role="row" key={m.tema} className="py-5 sm:grid sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)] sm:gap-x-8 border-b border-black/[0.08]">
                  <div role="rowheader" className="text-base font-bold tracking-tight text-[#16181A]">{m.tema}</div>
                  <div role="cell" className="mt-2 sm:mt-0 flex items-start gap-2.5 text-sm text-black/55">
                    <Icon name="close" size={15} className="mt-0.5 shrink-0 text-black/35" aria-hidden />
                    <span><span className="sm:hidden font-semibold text-black/45">Dnes: </span>{m.dnes}</span>
                  </div>
                  <div role="cell" className="mt-2 sm:mt-0 flex items-start gap-2.5 text-base font-semibold text-[#16181A]">
                    <Icon name="check" size={17} className="mt-0.5 shrink-0 text-[#5B7A08]" aria-hidden />
                    <span><span className="sm:hidden font-semibold text-[#3E5406]">S Managerem: </span>{m.managero}</span>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          <div className="mt-8 max-w-2xl">
            <p className="text-base font-semibold text-[#16181A] text-pretty">{MISTO_PATA.hlavni}</p>
            <p className="mt-2 text-sm text-black/55 text-pretty">{MISTO_PATA.vedlejsi}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
