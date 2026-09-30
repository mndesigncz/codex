import type { Metadata } from 'next';
import PravniStranka from '@/components/pravni/PravniStranka';

// Veřejná stránka bez přihlášení (App Store a Google Play ji vyžadují). Text schvaluje právník.
export const metadata: Metadata = { title: 'Privacy policy · Managero', alternates: { canonical: '/en/soukromi' } };

export default function Stranka() {
  return <PravniStranka klic="soukromi" jazyk="en" />;
}
