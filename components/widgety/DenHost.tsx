'use client';

// Hostitel detailu dne: poslouchá `otevriDen(...)` (lib/denUdalost) a ukáže DenDetail. Sedí jednou na každé ploše,
// takže rozklik dne funguje na každé stránce s plochou — widget, seznam i kalendář jen zavolají `otevriDen`
// a nemusí nic vědět o tom, kde se detail nakreslí. Detail se načte líně, až když ho někdo otevře.
import { Suspense, lazy, useEffect, useState } from 'react';
import { UDALOST_OTEVRI_DEN, jeDen, type DetailOtevreniDne } from '@/lib/denUdalost';

const DenDetail = lazy(() => import('../employer/DenDetail'));

export function DenHost() {
  const [otevreno, setOtevreno] = useState<DetailOtevreniDne | null>(null);
  useEffect(() => {
    const poslech = (e: Event) => {
      const d = (e as CustomEvent<DetailOtevreniDne>).detail;
      if (d && jeDen(d.den)) setOtevreno({ den: d.den, zdroj: d.zdroj ?? 'obecne' });
    };
    window.addEventListener(UDALOST_OTEVRI_DEN, poslech);
    return () => window.removeEventListener(UDALOST_OTEVRI_DEN, poslech);
  }, []);
  if (!otevreno) return null;
  return (
    <Suspense fallback={null}>
      <DenDetail den={otevreno.den} zdroj={otevreno.zdroj} onDen={den => setOtevreno(o => (o ? { ...o, den } : o))} onClose={() => setOtevreno(null)} />
    </Suspense>
  );
}
