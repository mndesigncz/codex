import type { Metadata } from 'next';
import PravniStranka from '@/components/pravni/PravniStranka';

// Veřejná právní stránka bez přihlášení; text v lib/pravni/dokumenty (viz docs/PRAVNI.md).
export const metadata: Metadata = {
  title: 'Obchodní podmínky pro podniky · Managero',
  description: 'Obchodní podmínky předplatného Managero pro podniky: tarify, platby, zrušení, odpovědnost a data po ukončení.',
  alternates: { canonical: '/obchodni-podminky', languages: { cs: '/obchodni-podminky', en: '/en/obchodni-podminky' } },
};

export default function Stranka() {
  return <PravniStranka klic="obchodni-podminky" jazyk="cs" />;
}
