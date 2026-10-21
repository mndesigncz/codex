import type { Metadata } from 'next';
import HostDemo from '@/components/client/host/HostDemo';

// Ukázka hosta bez databáze: stejné obrazovky jako skutečná aplikace, API odpovídá z paměti
// prohlížeče (lib/klient/demo). Pro prodej, sondy a snímky. Nic se neukládá na server.
export const metadata: Metadata = { title: 'Ukázka · Managero client', robots: { index: false, follow: false } };

export default async function Page(props: { params: Promise<{ cesta?: string[] }> }) {
  const { cesta = [] } = await props.params;
  return <HostDemo cesta={cesta.map(x => decodeURIComponent(x)).slice(0, 3)} />;
}
