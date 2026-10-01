'use client';

import React, { useEffect, useRef } from 'react';
import { Icon } from '../Icons';
import { Badge } from './Badge';
import { useT } from '@/lib/i18n/client';

// Spodní dok na telefonu — jeden pro administraci, zaměstnance i Managero
// client (kolo 69, balík B8; jediný nový soubor v zamčeném components/ui).
//
// Dřív byly tři ručně opsané kopie: administrace s `dock-strong`, zaměstnanec
// s `glass-strong` (jiná neprůhlednost pod stejným prstem) a klient bez
// odznaků — nová objednávka od stolu ani rezervace k potvrzení na navigaci
// nebyly vidět, ačkoli DESIGN říká „odznak patří na navigaci". Teď jedna
// podoba: položky s ikonou a krátkým popiskem, odznak (Badge) u položky,
// poslední „Více" otevírá list. Zvednutí a „pop" ikony u aktivní položky
// zůstávají, jen jsou na jednom místě.
//
// `title` na tlačítku zůstává kvůli sondám i kvůli dlouhému stisku na
// počítači; odečítač čte popisek a odznak (Badge nese vlastní `label`).

export interface DockItem {
  id: string;
  label: string;
  icon: string;
  /** Počet k vyřízení; 0 nebo nic = bez odznaku. */
  badge?: number;
  /** Jak odznak přečíst („2 nové objednávky") — bez něj jen číslo. */
  badgeLabel?: string;
}

export function Dock({ items, activeId, onSelect, more, label }: {
  items: DockItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** Tlačítko „Více" na konci; `active` = je otevřené nebo je vybraná položka z listu. */
  more?: { onClick: () => void; active: boolean };
  /** Název navigace pro odečítač. */
  label: string;
}) {
  const t = useT();
  const nav = useRef<HTMLElement>(null);
  // Dok zapisuje na :root `--dok-vyska` (vzdálenost své horní hrany od spodku okna + 8 px). Toast si z ní bere
  // spodní odsazení (`.toast-misto` v globals.css): dřív seděl 16 px nad hranou a celé tři vteřiny zakrýval
  // položky dolní navigace, takže se na ně nedalo klepnout. Od md je dok skrytý a proměnná se odstraní.
  useEffect(() => {
    const el = nav.current;
    if (!el) return;
    const root = document.documentElement;
    const zapis = () => {
      const r = el.getBoundingClientRect();
      if (r.height === 0) root.style.removeProperty('--dok-vyska');
      else root.style.setProperty('--dok-vyska', `${Math.round(window.innerHeight - r.top + 8)}px`);
    };
    zapis();
    window.addEventListener('resize', zapis);
    return () => { window.removeEventListener('resize', zapis); root.style.removeProperty('--dok-vyska'); };
  }, []);
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
      <nav ref={nav} className="dock-strong mx-auto max-w-md rounded-3xl px-2 py-2 flex items-center justify-around shadow-[0_10px_34px_rgba(25,35,15,0.16)]" aria-label={label}>
        {items.map(item => {
          const on = item.id === activeId;
          return (
            <button key={item.id} type="button" onClick={() => onSelect(item.id)} title={item.label}
              aria-current={on ? 'page' : undefined}
              className={`relative flex flex-col items-center gap-1 rounded-2xl px-3 py-1.5 transition duration-[var(--dur-2)] ease-[var(--ease-out-soft)] ${
                on ? 'text-[#16181A] -translate-y-0.5' : 'text-black/40'}`}>
              <Icon key={on ? 'on' : 'off'} name={item.icon} size={22} strokeWidth={on ? 2 : 1.7}
                className="i-lead" motion={on ? 'pop' : undefined} />
              {!!item.badge && !on && (
                <Badge count={item.badge} label={item.badgeLabel} className="absolute top-0 right-1" />
              )}
              <span className={`text-[11px] leading-none font-medium ${on ? 'text-[#16181A]' : 'text-black/40'}`}>{item.label}</span>
            </button>
          );
        })}
        {more && (
          <button type="button" onClick={more.onClick} title={t('Více')}
            className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-1.5 transition duration-[var(--dur-2)] ease-[var(--ease-out-soft)] ${more.active ? 'text-[#16181A]' : 'text-black/40'}`}>
            <Icon name="menu" size={22} />
            <span className="text-[11px] leading-none font-medium">{t('Více')}</span>
          </button>
        )}
      </nav>
    </div>
  );
}

export default Dock;
