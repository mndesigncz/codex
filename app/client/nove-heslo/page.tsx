import type { Metadata } from 'next';
import { NoveHesloForm } from '@/components/auth/ObnoveniHesla';
import NeplatnyOdkazHesla from '@/components/client/host/ucet/NeplatnyOdkazHesla';
import { vypadaJakoToken } from '@/lib/jednorazovyToken';

export const metadata: Metadata = { title: 'Nové heslo · Managero client', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function Stranka({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!vypadaJakoToken(token)) return <NeplatnyOdkazHesla />;
  return <NoveHesloForm klient token={token} />;
}
