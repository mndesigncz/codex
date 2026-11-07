// Přihlášení do správy platformy — na hostu správy je to `/prihlaseni`.
// Kdo už relaci má, jde rovnou na přehled.
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { jeAdminHost } from '@/lib/spravaHost';
import { spravceZPozadavku, hostPozadavku } from '@/lib/spravaServer';
import PrihlaseniSpravy from '@/components/admin/PrihlaseniSpravy';

export default async function PrihlaseniSpravyPage() {
  const h = await headers();
  const host = hostPozadavku(h);
  if (!jeAdminHost(host)) notFound();
  if (await spravceZPozadavku({ cookie: h.get('cookie'), host })) redirect('/');
  return <PrihlaseniSpravy />;
}
