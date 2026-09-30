import { Suspense } from 'react';
import LoginForm from '@/components/LoginForm';
import { getT } from '@/lib/i18n/server';

export default async function LoginPage() {
  const t = await getT(['auth']);
  return (
    <Suspense fallback={
      // Stejné pozadí a barvy jako přihlášení samotné (tokeny, ne tvrdá černá):
      // jinak při pomalém načtení problikla černá obrazovka a skočilo se do světlé.
      <div className="min-h-[100dvh] flex items-center justify-center">
        <p role="status" className="t-meta">{t('Načítání…')}</p>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
