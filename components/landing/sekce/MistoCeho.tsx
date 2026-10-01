'use client';

import { Icon } from '@/components/Icons';
import { useT } from '@/lib/i18n/client';
import { MISTO, MISTO_NADPIS, MISTO_PATA } from '../obsah';

// Excel, WhatsApp a sešit vs Managero: nejpoctivější prodejní argument, jaký
// stránka má. Nevyjmenovává funkce, ukazuje, co z provozu zmizí.
//
// Jediná limetková plocha na celé stránce. Po dlouhém inkoustovém jevišti je to
// přestávka, která říká „tohle je jiný druh sdělení" dřív, než se čte. Dnešek je
// přeškrtnutý jen tenkou linkou přes text, ne přes celou buňku: má se dát dočíst.
//
// Je to skutečná tabulka (role="table"), odečítač oznámí sloupce. Na telefonu se
// sloupce skládají pod sebe a každá buňka nese svůj štítek.
export default function MistoCeho() {
  const t = useT('landing');
  return (
    <section id="misto" className="ld-sekce" aria-labelledby="nadpis-misto">
      <div className="ld-limetka py-[clamp(4.5rem,9vw,8.5rem)]">
        <div className="ld-obsah">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-x-16 gap-y-6 items-end">
            <h2 id="nadpis-misto" className="ld-h2">{t(MISTO_NADPIS.nadpis)}</h2>
            <p className="text-[clamp(1.0625rem,1.5vw,1.375rem)] leading-snug text-[rgba(22,24,26,0.78)] max-w-[40ch] text-pretty">{t(MISTO_NADPIS.perex)}</p>
          </div>

          <div role="table" aria-label={t(MISTO_NADPIS.tabulka)} className="mt-14">
            <div role="row" className="sr-only md:not-sr-only md:grid md:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-x-10 pb-4">
              <div role="columnheader" className="text-sm font-semibold text-[rgba(22,24,26,0.72)]">{t(MISTO_NADPIS.oblast)}</div>
              <div role="columnheader" className="text-sm font-semibold text-[rgba(22,24,26,0.72)]">{t(MISTO_NADPIS.dnes)}</div>
              <div role="columnheader" className="text-sm font-semibold">{t(MISTO_NADPIS.sManagerem)}</div>
            </div>
            {MISTO.map(m => (
              <div role="row" key={m.tema} className="ld-srov-radek py-6 md:grid md:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-x-10">
                <div role="rowheader" className="text-lg font-bold tracking-tight">{t(m.tema)}</div>
                <div role="cell" className="ld-srov-dnes mt-2 md:mt-0 text-[0.9375rem] leading-relaxed text-pretty">
                  <span className="md:hidden font-semibold">{t(MISTO_NADPIS.dnesKratce)} </span><span className="ld-skrt">{t(m.dnes)}</span>
                </div>
                <div role="cell" className="mt-2 md:mt-0 flex items-start gap-2.5 text-[1.0625rem] leading-snug font-semibold text-pretty">
                  <Icon name="check" size={18} className="mt-0.5 shrink-0" aria-hidden />
                  <span><span className="md:hidden">{t(MISTO_NADPIS.sManageremKratce)} </span>{t(m.managero)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-x-16 gap-y-3">
            <p className="text-lg font-bold tracking-tight text-pretty lg:col-start-2">{t(MISTO_PATA.hlavni)}</p>
            <p className="text-[0.9375rem] text-[rgba(22,24,26,0.74)] text-pretty lg:col-start-2">{t(MISTO_PATA.vedlejsi)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
