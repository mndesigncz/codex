import type { Metadata } from 'next';
import { Slovniky } from '@/lib/i18n/server';
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

// Slovník přihlašovacích obrazovek jde v prvním HTML, ať se formulář nepřekreslí česky.
// Metadata (titulek, popis pro vyhledávač) zůstávají česky: registrace je prodejní vstup
// a její cizojazyčná podoba přijde s prodejní stránkou (plán vícejazyčnosti §9 bod 4).
export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <><Slovniky sekce={['auth']} />{children}</>;
}
