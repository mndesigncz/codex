import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import EmployerApp from '@/components/employer/EmployerApp';

export default async function EmployerOverviewPage() {
  const session = await getServerSession(authOptions);
  const user = {
    name: session?.user?.name,
    email: session?.user?.email,
    id: (session?.user as any)?.id,
    role: (session?.user as any)?.role,
    avatar: (session?.user as any)?.avatar,
  };
  return <EmployerApp user={user} />;
}
