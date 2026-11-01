import type { Metadata } from 'next';
import { alternatesDokumentu } from '@/lib/pravni/odkazy';
import PravniStranka from '@/components/pravni/PravniStranka';

// Veřejná stránka bez přihlášení (App Store a Google Play ji vyžadují). Text v lib/pravni/dokumenty (viz docs/PRAVNI.md).
export const metadata: Metadata = { title: 'Podpora · Managero', alternates: alternatesDokumentu('podpora', 'cs') };

export default function Stranka() {
  return <PravniStranka klic="podpora" jazyk="cs" />;
}
