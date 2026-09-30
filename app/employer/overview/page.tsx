import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { infoOBrane, maJitDoPruvodce } from '@/lib/pruvodce/brana';
import EmployerApp from '@/components/employer/EmployerApp';

export default async function EmployerOverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getServerSession(authOptions);
  const user = {
    name: session?.user?.name,
    email: session?.user?.email,
    id: (session?.user as any)?.id,
    role: (session?.user as any)?.role,
    superadmin: (session?.user as any)?.superadmin === true,
    avatar: (session?.user as any)?.avatar,
  };
  // Nový vlastník začíná průvodcem nastavení. Jen stav `nove`: kdo průvodce
  // přeskočil nebo rozdělal, už se rozhodl, že chce do aplikace, a podniky
  // z doby před průvodcem (bez záznamu) se nedotknou vůbec. Hluboký odkaz
  // (?view=, ?mode=) má přednost — člověk sem přišel za něčím konkrétním.
  // Podnik se čte z databáze a při její chybě se brána otevře (aplikace jede jako dřív).
  const q = await searchParams;
  if (user.id && user.role === 'employer' && !q.view && !q.mode) {
    if (maJitDoPruvodce(await infoOBrane(Number(user.id)))) redirect('/employer/start');
  }
  return <EmployerApp user={user} />;
}
