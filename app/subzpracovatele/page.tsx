import type { Metadata } from 'next';
import { alternatesDokumentu } from '@/lib/pravni/odkazy';
import PravniStranka from '@/components/pravni/PravniStranka';

// Veřejná právní stránka bez přihlášení; text v lib/pravni/dokumenty (viz docs/PRAVNI.md).
export const metadata: Metadata = {
  title: 'Subzpracovatelé · Managero',
  description: 'Seznam poskytovatelů, kteří pro Managero zpracovávají osobní údaje.',
  alternates: alternatesDokumentu('subzpracovatele', 'cs'),
};

export default function Stranka() {
  return <PravniStranka klic="subzpracovatele" jazyk="cs" />;
}
