import type { Metadata } from 'next';
import { alternatesDokumentu } from '@/lib/pravni/odkazy';
import PravniStranka from '@/components/pravni/PravniStranka';

// Veřejná právní stránka bez přihlášení; text v lib/pravni/dokumenty (viz docs/PRAVNI.md).
export const metadata: Metadata = {
  title: 'Subprocessors · Managero',
  description: 'List of providers processing personal data for Managero.',
  alternates: alternatesDokumentu('subzpracovatele', 'en'),
};

export default function Stranka() {
  return <PravniStranka klic="subzpracovatele" jazyk="en" />;
}
