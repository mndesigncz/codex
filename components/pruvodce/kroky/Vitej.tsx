'use client';

import { Icon } from '@/components/Icons';
import { useT } from '@/lib/i18n/client';

// Uvítání: žádná otázka, jen co se bude dít. Tři řádky říkají, co člověk
// dostane na konci — a čtvrtý, že nic z dosavadního nastavení se nepřepíše.
export default function Vitej() {
  const t = useT('pruvodce');
  const SLIBY: { ikona: string; titul: string; veta: string }[] = [
    { ikona: 'clock', titul: t('Otevírací doba a směny'), veta: t('Podle doby se odvodí typy směn, které si pak jen upravíš.') },
    { ikona: 'box', titul: t('Sklad a postupy'), veta: t('Kategorie a otevírání či zavírání podle druhu podniku.') },
    { ikona: 'overview', titul: t('Přehled podle toho, co sleduješ'), veta: t('Poskládáme ho z widgetů, které odpovídají tvým cílům.') },
  ];
  return (
    <div>
      <ul className="list stagger" aria-label={t('Co se nastaví')}>
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
      <p className="note note-info mt-4 text-[13px]">{t('Nic ti nepřepíšeme ani nesmažeme, jen přidáme. Kdykoli můžeš přerušit a vrátit se později.')}</p>
    </div>
  );
}
