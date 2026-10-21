'use client';

// Kdo Managero provozuje (§ 435 OZ: jméno, IČO, sídlo, zápis, DPH) jednou větou a odkazy na právní
// stránky — pro Nastavení → O aplikaci (Managero) a Moje → Účet a soukromí (Managero client).
// Webové patičky mají vlastní PravniPaticka (serverová, s údaji z prostředí).
//
// Údaje jsou výchozí hodnoty z lib/firma.ts (`firma({})`): komponenta běží i v prohlížeči, kde
// proměnné FIRMA_* nejsou, a server i prohlížeč tak vykreslí stejný text (bez nesouladu hydratace).
// Změna provozovatele = změnit výchozí hodnoty v lib/firma.ts (viz docs/PRAVNI.md).

import { firma, identifikace } from '@/lib/firma';
import { useJazyk } from '@/lib/i18n/client';
import type { KlicOdkazu } from '@/lib/pravni/odkazy';
import PravniOdkazy from './PravniOdkazy';

export default function ProvozovatelInfo({ jen, className = '' }: {
  /** Které právní odkazy ukázat (výchozí: zásady, podmínky, podpora, smazání účtu). */
  jen?: KlicOdkazu[];
  className?: string;
}) {
  const jazyk = useJazyk().jazyk === 'cs' ? 'cs' : 'en';
  const f = firma({});
  return (
    <div className={`grid gap-1.5 ${className}`} data-provozovatel>
      {/* Kontakt (e-mail, telefon) je za odkazem Podpora — samotný e-mail v textu by byl dotykový cíl pod 44 px. */}
      <p className="t-meta text-pretty">{identifikace(f, jazyk)}</p>
      <PravniOdkazy jazyk={jazyk} jen={jen} vysoke />
    </div>
  );
}
