import type { Metadata } from 'next';
import { Slovniky } from '@/lib/i18n/server';

// Tablet za barem je za přihlášením a do vyhledávače nepatří.
export const metadata: Metadata = { title: 'Tablet · Managero', robots: { index: false, follow: false } };

// Slovníky návodů a postupů: běží tu plovoucí běžec postupu, připomínky a návody u kroků.
export default function KioskLayout({ children }: { children: React.ReactNode }) {
  // Tablet sdílí s portálem zaměstnance uzávěrku, inventuru a chat, s vedením návody a postupy a úkoly (sekce rozvrh); slovníky jdou v prvním HTML.
  return <><Slovniky sekce={['kiosk', 'zamestnanec', 'chat', 'navody', 'postupy', 'rozvrh', 'sklad', 'widgety']} />{children}</>;
}
