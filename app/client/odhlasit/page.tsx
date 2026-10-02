import type { Metadata } from 'next';
import OdhlasitNovinky from '@/components/client/OdhlasitNovinky';

export const metadata: Metadata = { title: 'Odhlášení z e-mailů · Managero client', robots: { index: false, follow: false }, referrer: 'no-referrer' };

// Neplatný nebo chybějící odkaz řeší komponenta (API ho odmítne): nic o tom, komu patří, se neprozrazuje.
export default async function Stranka({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return <OdhlasitNovinky token={String(t ?? '')} />;
}
