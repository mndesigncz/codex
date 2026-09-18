'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import PushManager from '@/components/PushManager';
import ServiceWorker from '@/components/ServiceWorker';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ProcedureProvider } from '@/components/procedures/ProcedureProvider';
import FloatingRunner from '@/components/procedures/FloatingRunner';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <ThemeProvider>
        <ProcedureProvider>
          <ServiceWorker />
          <PushManager />
          {children}
          <FloatingRunner />
        </ProcedureProvider>
      </ThemeProvider>
    </NextAuthSessionProvider>
  );
}
