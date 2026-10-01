'use client';

import { useT } from '@/lib/i18n/client';

// Nastavení → Klávesové zkratky: přehled toho, co klávesnice v aplikaci opravdu umí.
// Seznam je ručně vedený a odpovídá kódu (useModal, usePopover, SearchField, ChatView,
// PlochaWidgetu, ScheduleBuilder); nová zkratka se sem dopisuje spolu s ní. Jen přehled,
// nic se tu nenastavuje.

interface Zkratka { klavesy: string[]; co: string }
interface Skupina { nazev: string; zkratky: Zkratka[] }

export default function SekceZkratky() {
  const t = useT('spolecne');
  const skupiny: Skupina[] = [
    { nazev: t('Obecné'), zkratky: [
      { klavesy: ['Esc'], co: t('Zavře okno nebo otevřené menu.') },
      { klavesy: ['Tab', 'Shift + Tab'], co: t('Přechází mezi prvky; v otevřeném okně zůstává fokus uvnitř okna.') },
      { klavesy: ['↑', '↓', 'Home', 'End'], co: t('V menu se pohybuje po položkách.') },
      { klavesy: ['Enter'], co: t('V jednořádkových polích s tlačítkem Přidat potvrdí přidání.') },
    ] },
    { nazev: t('Hledání'), zkratky: [
      { klavesy: ['↑', '↓'], co: t('Vybírá návrh pod polem.') },
      { klavesy: ['Enter'], co: t('Použije vybraný návrh.') },
      { klavesy: ['Esc'], co: t('Zavře návrhy; druhé stisknutí vyčistí pole.') },
    ] },
    { nazev: t('Chat'), zkratky: [
      { klavesy: ['Enter'], co: t('Odešle zprávu.') },
      { klavesy: ['Shift + Enter'], co: t('Vloží nový řádek.') },
    ] },
    { nazev: t('Úpravy stránky'), zkratky: [
      { klavesy: ['Ctrl + Z', '⌘ + Z'], co: t('Vrátí poslední změnu rozložení.') },
      { klavesy: ['Esc'], co: t('Ukončí úpravy stránky, při tažení widgetu tažení zruší.') },
      { klavesy: ['←', '→', '↑', '↓'], co: t('Přesune vybraný widget o jedno místo.') },
      { klavesy: ['Home', 'End'], co: t('Přesune vybraný widget na začátek nebo na konec.') },
      { klavesy: ['Enter', t('Mezerník')], co: t('Otevře nabídku vybraného widgetu.') },
      { klavesy: ['Delete'], co: t('Odebere vybraný widget.') },
    ] },
    { nazev: t('Rozvrh'), zkratky: [
      { klavesy: ['Esc'], co: t('Sbalí rozbalený výběr typu směny, okno dne zůstane otevřené.') },
    ] },
  ];

  return (
    <section className="card p-6 space-y-5" aria-labelledby="nast-zkratky-t">
      <div>
        <h2 id="nast-zkratky-t" className="t-card">{t('Klávesové zkratky')}</h2>
        <p className="t-meta mt-1">{t('Přehled zkratek, které aplikace opravdu zná. Na telefonu a tabletu se hodí s připojenou klávesnicí.')}</p>
      </div>
      {skupiny.map(s => (
        <div key={s.nazev} className="space-y-1">
          <h3 className="t-label">{s.nazev}</h3>
          <ul className="list">
            {s.zkratky.map((z, i) => (
              <li key={i} className="flex items-start justify-between gap-4 py-2.5">
                <span className="min-w-0 text-sm text-[#16181A] text-pretty">{z.co}</span>
                <span className="flex flex-wrap justify-end gap-1.5 shrink-0 max-w-[50%]">
                  {z.klavesy.map(k => <kbd key={k} className="rounded-lg border border-black/15 bg-black/[0.04] px-2 py-0.5 text-xs font-semibold tabular-nums text-[#16181A] whitespace-nowrap">{k}</kbd>)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
