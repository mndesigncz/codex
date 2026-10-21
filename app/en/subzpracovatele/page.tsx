import type { Metadata } from 'next';
import PravniStranka from '@/components/pravni/PravniStranka';

// Veřejná právní stránka bez přihlášení; text v lib/pravni/dokumenty (viz docs/PRAVNI.md).
export const metadata: Metadata = {
  title: 'Subprocessors · Managero',
  description: 'List of providers processing personal data for Managero.',
  alternates: { canonical: '/en/subzpracovatele', languages: { cs: '/subzpracovatele', en: '/en/subzpracovatele' } },
};

export default function Stranka() {
  return <PravniStranka klic="subzpracovatele" jazyk="en" />;
}
