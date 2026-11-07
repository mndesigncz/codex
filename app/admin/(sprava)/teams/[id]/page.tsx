import Podnik from '@/components/admin/Podnik';
export default async function AdminTeamPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <Podnik id={Number(params.id)} />;
}
