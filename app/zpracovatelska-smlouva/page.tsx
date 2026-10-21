import type { Metadata } from 'next';
import PravniStranka from '@/components/pravni/PravniStranka';

// Veřejná právní stránka bez přihlášení; text v lib/pravni/dokumenty (viz docs/PRAVNI.md).
export const metadata: Metadata = {
  title: 'Zpracovatelská smlouva · Managero',
  description: 'Smlouva o zpracování osobních údajů podle čl. 28 GDPR mezi podnikem a Managerem.',
  alternates: { canonical: '/zpracovatelska-smlouva', languages: { cs: '/zpracovatelska-smlouva', en: '/en/zpracovatelska-smlouva' } },
};

export default function Stranka() {
  return <PravniStranka klic="zpracovatelska-smlouva" jazyk="cs" />;
}
