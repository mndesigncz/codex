import type { Metadata } from 'next';
import PravniStranka from '@/components/pravni/PravniStranka';

// Veřejná právní stránka bez přihlášení; text v lib/pravni/dokumenty (viz docs/PRAVNI.md).
export const metadata: Metadata = {
  title: 'Cancellation and refunds · Managero',
  description: 'How to cancel a Managero subscription and when we refund.',
  alternates: { canonical: '/en/zruseni-predplatneho', languages: { cs: '/zruseni-predplatneho', en: '/en/zruseni-predplatneho' } },
};

export default function Stranka() {
  return <PravniStranka klic="zruseni-predplatneho" jazyk="en" />;
}
