import type { Metadata } from 'next';
import PravniStranka from '@/components/pravni/PravniStranka';

// Veřejná právní stránka bez přihlášení; text v lib/pravni/dokumenty (viz docs/PRAVNI.md).
export const metadata: Metadata = {
  title: 'Information for staff · Managero',
  description: 'Template for businesses: what Managero processes about team members.',
  alternates: { canonical: '/en/informace-pro-zamestnance', languages: { cs: '/informace-pro-zamestnance', en: '/en/informace-pro-zamestnance' } },
};

export default function Stranka() {
  return <PravniStranka klic="informace-pro-zamestnance" jazyk="en" />;
}
