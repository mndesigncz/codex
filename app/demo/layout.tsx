import type { Metadata } from 'next';

// Ukázka je veřejná (bez přihlášení), ale ne pro vyhledávače: je to vložená
// součást prodejní stránky s vymyšlenými daty, ne samostatný obsah.
export const metadata: Metadata = {
  title: 'Ukázka Managero',
  description: 'Ukázková aplikace s vymyšlenými daty. Nic se neukládá.',
  robots: { index: false, follow: false, nocache: true },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
