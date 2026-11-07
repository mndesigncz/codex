'use client';

// Rám správy platformy. Stejný jazyk jako aplikace (sklo nahoře, karty
// dole), ale schválně jiná barva pásu: správce musí na první pohled vidět,
// že je NAD podniky, ne v jednom z nich — tady každé kliknutí zasáhne
// cizí provoz.
//
// Správa běží na vlastním hostu (admin.managero.app, lib/spravaHost.ts), takže
// adresy jsou bez předpony: `/`, `/teams/1`, `/nahlaseni`… — middleware je
// interně přepíše na app/admin/…

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoMark, Icon } from '@/components/Icons';

const NAV = [
  { href: '/', label: 'Podniky', icon: 'users' },
  { href: '/nahlaseni', label: 'Nahlášené', icon: 'warning' },
  { href: '/audit', label: 'Historie zásahů', icon: 'archive' },
  { href: '/retence', label: 'Retence', icon: 'clock' },
];

export default function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const cesta = usePathname();
  const [odhlasuje, setOdhlasuje] = useState(false);
  const odhlasit = async () => {
    if (odhlasuje) return;
    setOdhlasuje(true);
    try { await fetch('/api/sprava/odhlaseni', { method: 'POST' }); } catch { /* cookie smaže i vypršení */ }
    window.location.assign('/prihlaseni');
  };
  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-40 glass-strong border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 min-w-0 tap-target-sm" aria-label="Správa platformy — přehled">
            <LogoMark size={28} />
            <span className="t-card truncate">Správa platformy</span>
          </Link>
          <span className="chip chip-ink chip-sm hidden sm:inline-flex">superadmin</span>
          <nav className="ml-auto flex items-center gap-1" aria-label="Sekce správy">
            {NAV.map(n => {
              const on = n.href === '/' ? cesta === '/' || cesta.startsWith('/teams') : cesta.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={on ? 'page' : undefined}
                  className={`tap-target inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition ${on ? 'seg-on' : 'seg-off'}`}>
                  <Icon name={n.icon} size={15} aria-hidden /><span className="hidden sm:inline">{n.label}</span>
                </Link>
              );
            })}
            <button type="button" onClick={odhlasit} disabled={odhlasuje} title={email ? `Odhlásit ${email}` : 'Odhlásit'}
              className="tap-target inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium seg-off">
              <Icon name="logout" size={15} aria-hidden /><span className="hidden sm:inline">Odhlásit</span>
            </button>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
    </div>
  );
}
