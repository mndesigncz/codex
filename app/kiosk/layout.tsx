import type { Metadata } from 'next';
import { Slovniky } from '@/lib/i18n/server';

// Tablet za barem je za přihlášením a do vyhledávače nepatří.
export const metadata: Metadata = { title: 'Tablet · Managero', robots: { index: false, follow: false } };

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  // Tablet sdílí s portálem zaměstnance uzávěrku, inventuru a chat; slovníky jdou v prvním HTML.
  return <><Slovniky sekce={['kiosk', 'zamestnanec', 'chat']} />{children}</>;
}
