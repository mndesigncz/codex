import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import EmployeeApp from '@/components/employee/EmployeeApp';

export default async function EmployeeShiftsPage() {
  const session = await getServerSession(authOptions);
  const user = {
    name: session?.user?.name,
    email: session?.user?.email,
    id: (session?.user as any)?.id,
    role: (session?.user as any)?.role,
    avatar: (session?.user as any)?.avatar,
    jobTitle: (session?.user as any)?.jobTitle,
  };
  return <EmployeeApp user={user} />;
}
