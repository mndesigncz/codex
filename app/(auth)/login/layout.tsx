import type { Metadata } from 'next';
import { Slovniky } from '@/lib/i18n/server';

// Přihlášení nemá hodnotu jako výsledek hledání; vyhledávač má vést na úvodní stránku.
export const metadata: Metadata = { title: 'Přihlášení · Managero', robots: { index: false, follow: true } };

// Slovník přihlašovacích obrazovek jde v prvním HTML, ať se formulář nepřekreslí česky.
// Metadata (titulek, popis pro vyhledávač) zůstávají česky: registrace je prodejní vstup
// a její cizojazyčná podoba přijde s prodejní stránkou (plán vícejazyčnosti §9 bod 4).
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <><Slovniky sekce={['auth']} />{children}</>;
}
