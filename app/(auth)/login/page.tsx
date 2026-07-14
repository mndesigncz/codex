import { Suspense } from 'react';
import LoginForm from '@/components/LoginForm';

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center">
        <div className="text-[#8E8E93] text-sm">Načítání...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
