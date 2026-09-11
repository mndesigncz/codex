import type { Metadata } from 'next';
import ClientHome from '@/components/client/ClientHome';

export const metadata: Metadata = { title: 'Managero client', description: 'Rezervace, věrnostní karta a objednávka od stolu pro podniky, kam chodíš.' };

export default function ClientHomePage() {
  return <ClientHome />;
}
