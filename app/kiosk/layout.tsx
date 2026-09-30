import type { Metadata } from 'next';
import { Slovniky } from '@/lib/i18n/server';

// Tablet za barem je za přihlášením a do vyhledávače nepatří.
export const metadata: Metadata = { title: 'Tablet · Managero', robots: { index: false, follow: false } };

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  // Úkoly a čip „před uzávěrkou" na tabletu patří do sekce rozvrh; bez ní by se první vykreslení ukázalo česky.
  return <><Slovniky sekce={['rozvrh', 'sklad']} />{children}</>;
}
