import Podnik from '@/components/admin/Podnik';
export default function AdminTeamPage({ params }: { params: { id: string } }) {
  return <Podnik id={Number(params.id)} />;
}
