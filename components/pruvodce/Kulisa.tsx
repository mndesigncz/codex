'use client';

import type { ReactNode, RefObject } from 'react';
import { Button, Card } from '@/components/ui';
import { LogoMark } from '@/components/Icons';

// Rám průvodce: hlavička s postupem, vizuál (fotka nebo živá ukázka) a karta
// s otázkou. Je to jediná nová „věc" průvodce — kroky se skládají ze
// stavebních kamenů aplikace (Card, Field, Segmented, Chip, SwitchRow…).
//
// Rozvržení: na počítači vlevo lepkavý vizuál (5/12) a vpravo karta (7/12),
// na telefonu vizuál jako pruh nahoře a karta pod ním. Patička s tlačítky je
// na telefonu lepkavá u spodního okraje karty. Krok se vykresluje jako
// <form>, takže Enter v poli = „Pokračovat" (tlačítko je navázané přes
// `form`, leží v patičce mimo formulář).
//
// Přístupnost: právě jeden h1 (nadpis kroku), po přechodu na něj přeskočí
// fokus (tabIndex -1), „Krok X z Y" je aria-live a postup má role progressbar.

export const ID_FORMULARE = 'pv-formular';

export default function Kulisa({
  cislo, celkem, nadpis, podnadpis, nadpisRef, smer, klic, vizual, ukazkaTelefon, children, paticka, pozdeji, pozdejiBezi, naOdeslani,
}: {
  cislo: number;
  celkem: number;
  nadpis: ReactNode;
  podnadpis?: ReactNode;
  nadpisRef: RefObject<HTMLHeadingElement | null>;
  /** Směr posledního přechodu: obsah karty vjede zprava (vpřed) nebo zleva (vzad). */
  smer: 1 | -1;
  /** Klíč kroku: nový klíč = nový přechod. */
  klic: string;
  /** Vizuál v levém sloupci (na telefonu nad kartou). */
  vizual: ReactNode;
  /** Jen telefon: živá ukázka uvnitř karty (na počítači stojí vlevo). */
  ukazkaTelefon?: ReactNode;
  children: ReactNode;
  paticka: ReactNode;
  pozdeji: () => void;
  pozdejiBezi?: boolean;
  /** Enter v poli nebo tlačítko „Pokračovat" (submit formuláře kroku). */
  naOdeslani: () => void;
}) {
  return (
    <div className="min-h-[100dvh] pb-6" data-pruvodce data-krok={klic}>
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-4 pb-3 pt-4 sm:gap-4">
        <span className="shrink-0"><LogoMark size={32} /></span>
        <div className="min-w-0 flex-1">
          <p className="t-label" aria-live="polite" data-krok-x-z-y>Krok {cislo} z {celkem}</p>
          <div className="pv-postup mt-1.5" role="progressbar" aria-label="Postup nastavením" aria-valuemin={0} aria-valuemax={celkem} aria-valuenow={cislo}
            style={{ ['--podil' as string]: cislo / celkem }}>
            <span />
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={pozdeji} loading={pozdejiBezi}>Dokončit později</Button>
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 px-4 lg:grid-cols-12 lg:gap-10">
        <div className="min-w-0 lg:col-span-5">
          <div className="lg:sticky lg:top-6">{vizual}</div>
        </div>

        <main className="min-w-0 lg:col-span-7">
          <Card pad="lg" as="div" className="pv-karta">
            <div key={klic} className={smer === 1 ? 'pv-vpred' : 'pv-vzad'}>
              <h1 ref={nadpisRef} tabIndex={-1} className="t-page text-balance outline-none">{nadpis}</h1>
              {podnadpis && <p className="t-meta mt-2 text-pretty">{podnadpis}</p>}
              {ukazkaTelefon}
              <form id={ID_FORMULARE} className="mt-5" onSubmit={e => { e.preventDefault(); naOdeslani(); }} noValidate>
                {children}
              </form>
            </div>
            {/* Lepkavá patička: na telefonu u spodního okraje, pod klávesnicí se pole nepřekryje. */}
            <div className="pv-paticka sticky bottom-0 -mx-6 mt-6 flex items-center gap-2 border-t border-black/[0.07] bg-[var(--surface)] px-6 pt-3 sm:-mx-7 sm:px-7 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0">
              {paticka}
            </div>
          </Card>
        </main>
      </div>
    </div>
  );
}
