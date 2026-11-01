import type { Metadata } from 'next';
import { alternatesDokumentu } from '@/lib/pravni/odkazy';
import PravniStranka from '@/components/pravni/PravniStranka';

// Veřejná právní stránka bez přihlášení; text v lib/pravni/dokumenty (viz docs/PRAVNI.md).
export const metadata: Metadata = {
  title: 'Zrušení předplatného a vrácení peněz · Managero',
  description: 'Jak zrušit předplatné Managero a kdy vracíme peníze.',
  alternates: alternatesDokumentu('zruseni-predplatneho', 'cs'),
};

export default function Stranka() {
  return <PravniStranka klic="zruseni-predplatneho" jazyk="cs" />;
}
