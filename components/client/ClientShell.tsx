'use client';

// Obal zákaznické části. Bez týmového chrome — host vidí jen značku, svoje
// podniky a svůj účet. Stejné tokeny jako zbytek aplikace, ať host i tým
// poznají jednu aplikaci.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useState } from 'react';
import { Icon, LogoMark } from '../Icons';

export interface ClientUser { id: number; name: string; email: string }

export function Initials({ name, size = 36 }: { name: string; size?: number }) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const txt = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '·';
  return (
    <span className="inline-grid place-items-center rounded-full bg-[#16181A] text-[#C8F542] font-bold shrink-0" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden>
      {txt}
    </span>
  );
}

export default function ClientShell({ me, children }: { me: ClientUser | null; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (p: string) => path === p || (p !== '/client' && path?.startsWith(p));
  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: '#F1F3ED', color: '#16181A' }}>
      <header className="sticky top-0 z-30 chrome-edge">
        <div className="glass-strong border-b border-black/[0.06]">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 h-16 flex items-center gap-3">
            <Link href="/client" className="flex items-center gap-2.5 shrink-0">
              <LogoMark size={32} />
              <span className="font-bold tracking-tight leading-none">Managero <span className="text-black/45 font-semibold">client</span></span>
            </Link>
            <nav className="ml-auto flex items-center gap-1" aria-label="Zákaznická navigace">
              <Link href="/client" aria-current={active('/client') && path === '/client' ? 'page' : undefined}
                className={`tap-target-sm rounded-full px-3.5 py-2 text-sm font-medium transition ${path === '/client' ? 'bg-[#16181A] text-white' : 'text-black/60 hover:text-black hover:bg-black/[0.05]'}`}>Podniky</Link>
              {me && (
                <Link href="/client/me" aria-current={active('/client/me') ? 'page' : undefined}
                  className={`tap-target-sm rounded-full px-3.5 py-2 text-sm font-medium transition ${active('/client/me') ? 'bg-[#16181A] text-white' : 'text-black/60 hover:text-black hover:bg-black/[0.05]'}`}>Moje</Link>
              )}
              {me ? (
                <div className="relative ml-1">
                  <button onClick={() => setOpen(v => !v)} aria-haspopup="menu" aria-expanded={open} title={me.name}
                    className="tap-target flex items-center gap-2 rounded-full pl-1 pr-2.5 py-1 hover:bg-black/[0.05] transition">
                    <Initials name={me.name} size={30} />
                    <Icon name="chevron" size={14} className={`text-black/45 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && (
                    <div role="menu" className="absolute right-0 mt-2 w-56 glass-strong rounded-2xl border border-black/[0.08] p-1.5 shadow-lg">
                      <div className="px-3 py-2">
                        <p className="text-sm font-semibold truncate">{me.name}</p>
                        <p className="text-xs text-black/50 truncate">{me.email}</p>
                      </div>
                      <button role="menuitem" onClick={() => signOut({ callbackUrl: '/client' })}
                        className="w-full text-left rounded-xl px-3 py-2 text-sm text-red-700 hover:bg-red-500/10 transition flex items-center gap-2">
                        <Icon name="logout" size={16} /> Odhlásit se
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link href="/client/login" className="tap-target-sm ml-1 rounded-full bg-[#C8F542] text-[#16181A] px-4 py-2 text-sm font-semibold hover:brightness-105 active:scale-[0.98] transition">Přihlásit</Link>
              )}
            </nav>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10">{children}</main>
      <footer className="mx-auto max-w-5xl w-full px-4 sm:px-6 py-8 text-xs text-black/45 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>Managero client</span>
        <span>Rezervace, věrnost a objednávky pro podniky, kam chodíš.</span>
        <Link href="/" className="ml-auto hover:text-black">Jsem podnik</Link>
      </footer>
    </div>
  );
}
