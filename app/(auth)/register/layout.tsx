import type { Metadata } from 'next';
import { OG_ZAKLAD } from '@/lib/web';

// Registrace je vstup z prodejní stránky a smí být ve vyhledávači.
export const metadata: Metadata = {
  title: 'Založit podnik v Managero — zdarma',
  description: 'Založte si podnik v Managero a rozjeďte rozvrh směn, uzávěrky a sklad. Tým do 3 lidí zdarma.',
  alternates: { canonical: '/register' },
  openGraph: {
    ...OG_ZAKLAD,
    url: '/register',
    title: 'Založit podnik v Managero — zdarma',
    description: 'Založte si podnik v Managero a rozjeďte rozvrh směn, uzávěrky a sklad. Tým do 3 lidí zdarma.',
  },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
