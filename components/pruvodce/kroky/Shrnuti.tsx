'use client';

import { Chip, ListRow, SwitchRow } from '@/components/ui';
import { Icon } from '@/components/Icons';
import { czCount, DEN, type CzNoun } from '@/lib/czech';
import { currencySymbol } from '@/lib/money';
import { radkyShrnuti } from '@/lib/pruvodce/plan';
import { sestavPrehled } from '@/lib/pruvodce/widgety';
import { NAZEV_ZEME, type KlicPolozky } from '@/lib/pruvodce/typy';
import type { KrokProps } from './spolecne';

// Shrnutí: co se doopravdy založí, jako seznam přepínačů v jedné kartě.
// Zapnuto = vytvoří se, vypnuto = ne. Nahoře to, co plyne přímo z odpovědí
// (název, doba, kasa); pod tím předvolby podle typu a cílů, které jde
// jednotlivě vypnout. Nic se nepřepisuje ani nemaže, jen přidává.

const WIDGET: CzNoun = { one: 'widget', few: 'widgety', many: 'widgetů' };

export default function Shrnuti({ odp, zmen, info }: KrokProps) {
  const radky = radkyShrnuti(odp);
  const zapnuto = (k: KlicPolozky) => odp.polozky?.[k] !== false;
  const prepni = (k: KlicPolozky, v: boolean) => zmen({ polozky: { ...odp.polozky, [k]: v } });
  const cile = odp.cile ?? [];
  const pocetWidgetu = cile.length > 0
    ? sestavPrehled({ cile, velikostTymu: odp.tym?.velikost, pokladna: odp.pokladna, tarif: info.plan }).length
    : 0;
  const otevreno = odp.doba ? Object.values(odp.doba).filter(d => !d.closed).length : 0;
  const mena = odp.mena ?? info.currency;

  const pevne: { id: string; ikona: string; titul: string; popis: string }[] = [];
  if (odp.nazev || odp.adresa || odp.zeme) {
    const cast = [odp.nazev, odp.zeme ? NAZEV_ZEME[odp.zeme] : null, odp.mena ?? null].filter(Boolean);
    pevne.push({ id: 'podnik', ikona: 'settings', titul: 'Nastavení podniku', popis: cast.join(' · ') });
  }
  if (odp.doba) pevne.push({ id: 'doba', ikona: 'clock', titul: 'Otevírací doba', popis: `Otevřeno ${czCount(otevreno, DEN)} v týdnu` });
  if (cile.includes('uzaverky') && odp.hotovostVKase) {
    pevne.push({ id: 'kasa', ikona: 'coins', titul: 'Hotovost v kase', popis: `${odp.hotovostVKase} ${currencySymbol(mena, odp.formatCisel ?? info.locale)}` });
  }
  const nic = pevne.length === 0 && radky.length === 0 && pocetWidgetu === 0;

  return (
    <div>
      {nic ? (
        <p className="note note-info text-[13px]">Přeskočil jsi všechny otázky, takže není co zakládat. Podnik zůstane, jak je, a nastavení doladíš v aplikaci.</p>
      ) : (
        <ul className="list" aria-label="Co se nastaví">
          {pevne.map(p => (
            <ListRow key={p.id} lead={<span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-black/[0.05] text-[#16181A]"><Icon name={p.ikona} size={18} /></span>}
              title={p.titul} meta={p.popis} aside={<Chip tone="muted" size="sm">Z odpovědí</Chip>} />
          ))}
          {radky.filter(r => r.klic !== 'prehled').map(r => (
            <SwitchRow key={r.klic} title={r.nazev} hint={r.popis} checked={zapnuto(r.klic)} onChange={v => prepni(r.klic, v)} />
          ))}
          {pocetWidgetu > 0 && (
            <SwitchRow title="Přehled podle tvých cílů" hint={`${czCount(pocetWidgetu, WIDGET)} na úvodní obrazovce. Kdykoli ho přestavíš podržením.`}
              checked={zapnuto('prehled')} onChange={v => prepni('prehled', v)} />
          )}
        </ul>
      )}
      <p className="note note-info mt-4 text-[13px]">Nic neruší tvoje dosavadní nastavení, jen přidává.</p>
    </div>
  );
}
