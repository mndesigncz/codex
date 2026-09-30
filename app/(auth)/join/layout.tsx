import type { Metadata } from 'next';

// Připojení kódem k podniku je soukromý krok — kód dostal člověk od vedení.
export const metadata: Metadata = { title: 'Připojit se k podniku · Managero', robots: { index: false, follow: false } };

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
