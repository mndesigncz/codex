import type { Metadata } from 'next';

// Přihlášení nemá hodnotu jako výsledek hledání; vyhledávač má vést na úvodní stránku.
export const metadata: Metadata = { title: 'Přihlášení · Managero', robots: { index: false, follow: true } };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
