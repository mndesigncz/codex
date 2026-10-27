'use client';

// „Ohodnotit směnu" — vstupní místo hodnocení směny jako celku (lib/hodnoceniSmeny.ts) z každé funkce,
// která má kontext dne nebo směny: detail dne, Dnešní směny, uzávěrka, docházka, úkol, postup, kalendář
// hodnocení, okno hodnocení člověka. Tlačítko si okno kreslí samo (líně), takže funguje i uvnitř jiného
// okna nebo na stránce bez plochy widgetů; okno se otevře nad tím, odkud se klepnulo.
//
// Ukáže se jen tomu, kdo smí hodnotit (hodnoceni.hodnotit) — přísně až po načtení oprávnění, ať tlačítko
// zaměstnanci neproblikne. Sdílený tablet nikdy.
import { Suspense, lazy, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, type ButtonProps } from '../ui';
import { useT } from '@/lib/i18n/client';
import { useOpravneni } from '../role/useOpravneni';
import { jeDen, jeKlic, UDALOST_HODNOTIT_SMENU, type DetailHodnoceniSmeny } from '@/lib/hodnoceniSmeny';

const HodnoceniSmenyOkno = lazy(() => import('./HodnoceniSmenyOkno'));

/** Smí přihlášený hodnotit směny? (Přísně: před načtením oprávnění ne.) */
export function useSmiHodnotitSmenu(): boolean {
  const { nacteno, ma, role } = useOpravneni();
  return nacteno && role?.typ !== 'kiosk' && ma('hodnoceni.hodnotit');
}

export function TlacitkoHodnotitSmenu({ den, klic, clovek, onUlozeno, variant = 'secondary', size = 'sm', label, className = '', block }: {
  den: string;
  klic?: string | null;
  clovek?: number | null;
  onUlozeno?: () => void;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  label?: string;
  className?: string;
  block?: boolean;
}) {
  const t = useT('sprava');
  const smi = useSmiHodnotitSmenu();
  const [otevreno, setOtevreno] = useState(false);
  if (!smi || !jeDen(den)) return null;
  return (
    <>
      <Button variant={variant} size={size} icon="star" className={className} block={block} data-hodnotit-smenu={den}
        onClick={e => { e.stopPropagation(); setOtevreno(true); }}>
        {label ?? t('Ohodnotit směnu')}
      </Button>
      {otevreno && (
        <Suspense fallback={null}>
          <HodnoceniSmenyOkno den={den} klic={klic} clovek={clovek} onClose={() => setOtevreno(false)} onUlozeno={onUlozeno} />
        </Suspense>
      )}
    </>
  );
}

/**
 * Hostitel okna pro odkaz z oznámení (`?hodnotitSmenu=RRRR-MM-DD&smena=HH:MM-HH:MM`) a pro událost
 * `otevriHodnoceniSmeny(...)` odkudkoli z plochy. Sedí na ploše vedle DenHost.
 */
export function HodnoceniSmenyHost() {
  const q = useSearchParams();
  const smi = useSmiHodnotitSmenu();
  const [otevreno, setOtevreno] = useState<DetailHodnoceniSmeny | null>(null);
  const zAdresy = q?.get('hodnotitSmenu') ?? null;
  const smenaZAdresy = q?.get('smena') ?? null;
  useEffect(() => {
    if (jeDen(zAdresy)) setOtevreno({ den: zAdresy, klic: jeKlic(smenaZAdresy) ? smenaZAdresy : null });
  }, [zAdresy, smenaZAdresy]);
  useEffect(() => {
    const poslech = (e: Event) => {
      const d = (e as CustomEvent<DetailHodnoceniSmeny>).detail;
      if (d && jeDen(d.den)) setOtevreno(d);
    };
    window.addEventListener(UDALOST_HODNOTIT_SMENU, poslech);
    return () => window.removeEventListener(UDALOST_HODNOTIT_SMENU, poslech);
  }, []);
  if (!otevreno || !smi) return null;
  return (
    <Suspense fallback={null}>
      <HodnoceniSmenyOkno den={otevreno.den} klic={otevreno.klic} clovek={otevreno.clovek} onClose={() => setOtevreno(null)} />
    </Suspense>
  );
}
