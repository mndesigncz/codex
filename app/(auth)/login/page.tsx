import { Suspense } from 'react';
import LoginForm from '@/components/LoginForm';

export default function LoginPage() {
  return (
    <Suspense fallback={
      // Stejné pozadí a barvy jako přihlášení samotné (tokeny, ne tvrdá černá):
      // jinak při pomalém načtení problikla černá obrazovka a skočilo se do světlé.
      <div className="min-h-[100dvh] flex items-center justify-center">
        <p role="status" className="t-meta">Načítání…</p>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
