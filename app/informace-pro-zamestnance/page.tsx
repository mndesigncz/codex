import type { Metadata } from 'next';
import { alternatesDokumentu } from '@/lib/pravni/odkazy';
import PravniStranka from '@/components/pravni/PravniStranka';

// Veřejná právní stránka bez přihlášení; text v lib/pravni/dokumenty (viz docs/PRAVNI.md).
export const metadata: Metadata = {
  title: 'Informace pro zaměstnance · Managero',
  description: 'Šablona pro podniky: co Managero o lidech v týmu zpracovává.',
  alternates: alternatesDokumentu('informace-pro-zamestnance', 'cs'),
};

export default function Stranka() {
  return <PravniStranka klic="informace-pro-zamestnance" jazyk="cs" />;
}
