// Monogram podniku na krému (36 px v hlavičce karty, 28 na lístku, 56 pod obálkou). S logem podniku
// ukáže logo v odstínech inkoustu (grayscale + multiply na krému): barva značky do aplikace hosta nepatří.

import { monogram, tvarPodniku } from './monogram';

export interface MonogramProps {
  nazev: string;
  /** Klíč tváře (slug podniku); bez něj název. */
  klic?: string | null;
  logoUrl?: string | null;
  /** Velikost v px (výchozí 36). */
  velikost?: number;
  className?: string;
}

export default function Monogram({ nazev, klic, logoUrl, velikost = 36, className = '' }: MonogramProps) {
  const tvar = tvarPodniku(klic || nazev);
  return (
    <span aria-hidden className={`hp-mono hp-mono-${tvar} ${logoUrl ? 'hp-mono-logo' : ''} ${className}`} style={{ ['--s' as string]: `${velikost}px` }}>
      {logoUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={logoUrl} alt="" loading="lazy" decoding="async" />
        : monogram(nazev)}
    </span>
  );
}
