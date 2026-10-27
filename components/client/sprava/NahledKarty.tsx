'use client';

// Náhled karty hosta ve správě (Věrnost, Stránka a vzhled, čtečka): TATÁŽ komponenta, jakou vidí
// host (components/client/karta). Po sloučení kola 92 je tu jen re-export — co podnik nastaví,
// to host uvidí, žádná kopie, která by se rozešla. Navíc jen rám telefonu kolem náhledu.

export { default as KartaPodniku, LogoPodniku, barvyKarty } from '../karta/KartaPodniku';
export type { KartaPodnikuProps } from '../karta/KartaPodniku';
export { default as RazitkaMrizka } from '../karta/RazitkaMrizka';
export type { RazitkaMrizkaProps } from '../karta/RazitkaMrizka';
import { useT } from '@/lib/i18n/client';

/** Rám telefonu kolem náhledu (Věrnost, Vzhled): jen tvar, ne skutečné zařízení. */
export function RamTelefonu({ children, popisek }: { children: React.ReactNode; popisek?: string }) {
  const t = useT('sprava');
  return (
    <div className="mx-auto w-full max-w-[19rem] rounded-[2.25rem] bg-[#16181A] p-2.5 shadow-[shadow:var(--shadow-float)]" role="group" aria-label={popisek ?? t('Náhled v telefonu hosta')}>
      <div className="rounded-[1.75rem] bg-[#F6F7F3] overflow-hidden min-h-[30rem] text-[#16181A]">{children}</div>
    </div>
  );
}
