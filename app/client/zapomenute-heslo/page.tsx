import type { Metadata } from 'next';
import { ZapomenuteHesloForm } from '@/components/auth/ObnoveniHesla';

export const metadata: Metadata = { title: 'Zapomenuté heslo · Managero client', robots: { index: false, follow: true } };

export default function Stranka() {
  return <ZapomenuteHesloForm klient />;
}
