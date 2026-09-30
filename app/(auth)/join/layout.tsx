import type { Metadata } from 'next';
import { Slovniky } from '@/lib/i18n/server';

// Připojení kódem k podniku je soukromý krok — kód dostal člověk od vedení.
export const metadata: Metadata = { title: 'Připojit se k podniku · Managero', robots: { index: false, follow: false } };

// Slovník přihlašovacích obrazovek jde v prvním HTML, ať se formulář nepřekreslí česky.
// Metadata (titulek, popis pro vyhledávač) zůstávají česky: registrace je prodejní vstup
// a její cizojazyčná podoba přijde s prodejní stránkou (plán vícejazyčnosti §9 bod 4).
export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return <><Slovniky sekce={['auth']} />{children}</>;
}
