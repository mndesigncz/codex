import { Slovniky } from '@/lib/i18n/server';

// Slovník přihlašovacích obrazovek v prvním HTML, ať se stránka nepřekreslí česky.
export default function ZalozitPodnikLayout({ children }: { children: React.ReactNode }) {
  return <><Slovniky sekce={['auth']} />{children}</>;
}
