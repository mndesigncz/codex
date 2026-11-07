'use client';

// Drobnosti, které sdílí otevřená karta, U kasy a Domů: tlačítko ukázky načtení (jen /client/demo) a popisek zasunutých karet („a Čajovna Pangea“).

import { Icon } from '../../../Icons';
import { useT } from '@/lib/i18n/client';
import { useJeDemo } from '../cesty';

type T = (cs: string, p?: any) => string;

/** Jen v ukázce: „Ukázat načtení u kasy“ — podvržená čtečka připíše razítko a body. */
export function UkazkaNacteni({ slug, prebalene = [], className = '' }: { slug: string; prebalene?: number[]; className?: string }) {
  const t = useT('klient-host');
  const demo = useJeDemo();
  if (!demo || !slug) return null;
  return (
    <button type="button" className={`hp-btn lgx hp-btn-sklo hp-btn-blok ${className}`}
      onClick={() => { (window as any).__hostDemoNacteni?.(slug, prebalene); }}>
      <Icon name="sparkle" size={17} strokeWidth={1.6} aria-hidden /> {t('Ukázat načtení u kasy (ukázka)')}
    </button>
  );
}

/** Pod jménem nejbližší zasunuté karty: její popis (dvě karty), „a Čajovna Pangea“, „a 3 další karty“. */
export function popisZasunutych(ostatni: { nazev: string; popis: string }[], t: T): string {
  if (ostatni.length <= 1) return ostatni[0]?.popis ?? '';
  if (ostatni.length === 2) return t('a {podnik}', { podnik: ostatni[1].nazev });
  return t('a {n, plural, one {# další karta} few {# další karty} other {# dalších karet}}', { n: ostatni.length - 1 });
}
