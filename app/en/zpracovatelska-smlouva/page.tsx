import type { Metadata } from 'next';
import { alternatesDokumentu } from '@/lib/pravni/odkazy';
import PravniStranka from '@/components/pravni/PravniStranka';

// Veřejná právní stránka bez přihlášení; text v lib/pravni/dokumenty (viz docs/PRAVNI.md).
export const metadata: Metadata = {
  title: 'Data processing agreement · Managero',
  description: 'Data processing agreement under Article 28 GDPR between a business and Managero.',
  alternates: alternatesDokumentu('zpracovatelska-smlouva', 'en'),
};

export default function Stranka() {
  return <PravniStranka klic="zpracovatelska-smlouva" jazyk="en" />;
}
