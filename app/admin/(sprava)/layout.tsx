// Brána do obrazovek správy platformy.
//
// Pustí jen požadavek na hostu správy s platnou relací správy (cookie z přihlášení
// heslem + kódem z autentizační aplikace) a účtem, který je podle databáze správce
// (spravceZPozadavku → jeSpravcePodleDb → isSuperadminId). Bez relace na přihlášení;
// mimo host správy 404 (middleware sem z www nikoho nepustí, tohle je druhá vrstva).
// Každý zásah pak ještě zvlášť ověří brána API (lib/superadminGate.ts).
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { jeAdminHost } from '@/lib/spravaHost';
import { spravceZPozadavku, hostPozadavku } from '@/lib/spravaServer';
import AdminShell from '@/components/admin/AdminShell';

export default async function SpravaLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const host = hostPozadavku(h);
  if (!jeAdminHost(host)) notFound();
  const spravce = await spravceZPozadavku({ cookie: h.get('cookie'), host });
  if (!spravce) redirect('/prihlaseni');
  return <AdminShell email={spravce.email}>{children}</AdminShell>;
}
