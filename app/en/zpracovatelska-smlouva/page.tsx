import type { Metadata } from 'next';
import PravniStranka from '@/components/pravni/PravniStranka';

// Veřejná právní stránka bez přihlášení; text v lib/pravni/dokumenty (viz docs/PRAVNI.md).
export const metadata: Metadata = {
  title: 'Data processing agreement · Managero',
  description: 'Data processing agreement under Article 28 GDPR between a business and Managero.',
  alternates: { canonical: '/en/zpracovatelska-smlouva', languages: { cs: '/zpracovatelska-smlouva', en: '/en/zpracovatelska-smlouva' } },
};

export default function Stranka() {
  return <PravniStranka klic="zpracovatelska-smlouva" jazyk="en" />;
}
