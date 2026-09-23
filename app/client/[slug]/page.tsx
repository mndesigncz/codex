import BusinessPage from '@/components/client/BusinessPage';
export const dynamic = 'force-dynamic';
export default async function Page(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  return <BusinessPage slug={params.slug} />;
}
