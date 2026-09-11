import BusinessPage from '@/components/client/BusinessPage';
export const dynamic = 'force-dynamic';
export default function Page({ params }: { params: { slug: string } }) {
  return <BusinessPage slug={params.slug} />;
}
