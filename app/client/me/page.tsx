import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import MyPage from '@/components/client/MyPage';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u?.id || u.role !== 'customer') redirect('/client/login?next=/client/me');
  return <MyPage />;
}
