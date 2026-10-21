import type { Metadata } from 'next';
import PravniStranka from '@/components/pravni/PravniStranka';

// Veřejná stránka bez přihlášení (App Store a Google Play ji vyžadují). Text v lib/pravni/dokumenty (viz docs/PRAVNI.md).
export const metadata: Metadata = { title: 'Support · Managero', alternates: { canonical: '/en/podpora' } };

export default function Stranka() {
  return <PravniStranka klic="podpora" jazyk="en" />;
}
