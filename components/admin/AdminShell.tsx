'use client';

// Rám správy platformy. Stejný jazyk jako aplikace (sklo nahoře, karty
// dole), ale schválně jiná barva pásu: správce musí na první pohled vidět,
// že je NAD podniky, ne v jednom z nich — tady každé kliknutí zasáhne
// cizí provoz.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoMark, Icon } from '@/components/Icons';

const NAV = [
  { href: '/admin', label: 'Podniky', icon: 'users' },
  { href: '/admin/audit', label: 'Historie zásahů', icon: 'archive' },
];

export default function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const cesta = usePathname();
  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-40 glass-strong border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/admin" className="flex items-center gap-2.5 min-w-0 tap-target-sm" aria-label="Správa platformy — přehled">
            <LogoMark size={28} />
            <span className="t-card truncate">Správa platformy</span>
          </Link>
          <span className="chip chip-ink chip-sm hidden sm:inline-flex">superadmin</span>
          <nav className="ml-auto flex items-center gap-1" aria-label="Sekce správy">
            {NAV.map(n => {
              const on = n.href === '/admin' ? cesta === '/admin' || cesta.startsWith('/admin/teams') : cesta.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={on ? 'page' : undefined}
                  className={`tap-target inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition ${on ? 'seg-on' : 'seg-off'}`}>
                  <Icon name={n.icon} size={15} aria-hidden /><span className="hidden sm:inline">{n.label}</span>
                </Link>
              );
            })}
            <Link href="/" className="tap-target inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium seg-off" title={email}>
              <Icon name="logout" size={15} aria-hidden /><span className="hidden sm:inline">Do aplikace</span>
            </Link>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
    </div>
  );
}
