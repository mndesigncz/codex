import type { Metadata } from 'next';
import CteckaStranka from '@/components/client/CteckaStranka';

export const metadata: Metadata = { title: 'Čtečka u kasy', robots: { index: false, follow: false } };

// Přihlášení a typ účtu hlídá layout; oprávnění (vernost.karta a spol.) hlídají API routy.
export default function Page() {
  return <CteckaStranka />;
}
