import type { Metadata } from 'next';
import PravniStranka from '@/components/pravni/PravniStranka';

// Veřejná stránka bez přihlášení (App Store a Google Play ji vyžadují). Text v lib/pravni/dokumenty (viz docs/PRAVNI.md).
export const metadata: Metadata = { title: 'Podmínky užívání · Managero', alternates: { canonical: '/podminky' } };

export default function Stranka() {
  return <PravniStranka klic="podminky" jazyk="cs" />;
}
