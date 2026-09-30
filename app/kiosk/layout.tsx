import type { Metadata } from 'next';

// Tablet za barem je za přihlášením a do vyhledávače nepatří.
export const metadata: Metadata = { title: 'Tablet · Managero', robots: { index: false, follow: false } };

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return children;
}
