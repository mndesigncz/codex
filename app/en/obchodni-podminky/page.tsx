import type { Metadata } from 'next';
import { alternatesDokumentu } from '@/lib/pravni/odkazy';
import PravniStranka from '@/components/pravni/PravniStranka';

// Veřejná právní stránka bez přihlášení; text v lib/pravni/dokumenty (viz docs/PRAVNI.md).
export const metadata: Metadata = {
  title: 'Business terms · Managero',
  description: 'Managero subscription terms for businesses: plans, payments, cancellation, liability and data after termination.',
  alternates: alternatesDokumentu('obchodni-podminky', 'en'),
};

export default function Stranka() {
  return <PravniStranka klic="obchodni-podminky" jazyk="en" />;
}
