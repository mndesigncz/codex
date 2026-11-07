// Správa platformy — společný rám pro přihlášení i obrazovky správy.
//
// Tyhle stránky se servírují jen na hostu správy (admin.managero.app): middleware
// tam přepisuje `/`, `/teams/1`… na app/admin/… a na každém jiném hostu vrací pro
// `/admin` 404 (lib/spravaHost.ts). Brána je o patro níž: app/admin/(sprava)/layout.tsx.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Správa platformy · Managero',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};
export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
