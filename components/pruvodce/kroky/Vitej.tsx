'use client';

import { Icon } from '@/components/Icons';

// Uvítání: žádná otázka, jen co se bude dít. Tři řádky říkají, co člověk
// dostane na konci — a čtvrtý, že nic z dosavadního nastavení se nepřepíše.
const SLIBY: { ikona: string; titul: string; veta: string }[] = [
  { ikona: 'clock', titul: 'Otevírací doba a směny', veta: 'Podle doby se odvodí typy směn, které si pak jen upravíš.' },
  { ikona: 'box', titul: 'Sklad a postupy', veta: 'Kategorie a otevírání či zavírání podle druhu podniku.' },
  { ikona: 'overview', titul: 'Přehled podle toho, co sleduješ', veta: 'Poskládáme ho z widgetů, které odpovídají tvým cílům.' },
];

export default function Vitej() {
  return (
    <div>
      <ul className="list stagger" aria-label="Co se nastaví">
        {SLIBY.map(s => (
          <li key={s.titul} className="list-row">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/[0.05] text-[#16181A]"><Icon name={s.ikona} size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-snug text-[#16181A]">{s.titul}</span>
              <span className="block text-[13px] leading-snug text-black/55 mt-0.5 text-pretty">{s.veta}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="note note-info mt-4 text-[13px]">Nic ti nepřepíšeme ani nesmažeme, jen přidáme. Kdykoli můžeš přerušit a vrátit se později.</p>
    </div>
  );
}
