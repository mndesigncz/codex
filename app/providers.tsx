'use client';

import { usePathname } from 'next/navigation';
import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import PushManager from '@/components/PushManager';
import ServiceWorker from '@/components/ServiceWorker';
import NativeBridge from '@/components/NativeBridge';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ProcedureProvider } from '@/components/procedures/ProcedureProvider';
import FloatingRunner from '@/components/procedures/FloatingRunner';
import { jeCestaDema } from '@/lib/demo/cesta';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // Veřejná ukázka /demo běží proti mock serveru v prohlížeči a nesmí
  // registrovat service worker ani push: worker by cachoval ukázku pod
  // skutečným původem aplikace a push by žádal o oprávnění za vymyšlený podnik.
  const demo = jeCestaDema(usePathname());
  return (
    <NextAuthSessionProvider>
      <ThemeProvider>
        <ProcedureProvider>
          {!demo && <ServiceWorker />}
          {!demo && <PushManager />}
          {!demo && <NativeBridge />}
          {children}
          <FloatingRunner />
        </ProcedureProvider>
      </ThemeProvider>
    </NextAuthSessionProvider>
  );
}
