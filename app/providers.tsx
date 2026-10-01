'use client';

import { usePathname } from 'next/navigation';
import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import PushManager from '@/components/PushManager';
import ServiceWorker from '@/components/ServiceWorker';
import NativeBridgeLoader from '@/components/NativeBridgeLoader';
import UlozeniHlaska from '@/components/UlozeniHlaska';
import NastaveniSync from '@/components/NastaveniSync';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ProcedureProvider } from '@/components/procedures/ProcedureProvider';
import FloatingRunner from '@/components/procedures/FloatingRunner';
import { jeCestaDema } from '@/lib/demo/cesta';
import { I18nProvider } from '@/lib/i18n/client';
import type { Jazyk } from '@/lib/i18n/config';
import type { Slovnik } from '@/lib/i18n/core';

export function SessionProvider({ children, jazyk, slovniky }: { children: React.ReactNode; jazyk: Jazyk; slovniky?: Partial<Record<Jazyk, Slovnik>> }) {
  // Veřejná ukázka /demo běží proti mock serveru v prohlížeči a nesmí
  // registrovat service worker ani push: worker by cachoval ukázku pod
  // skutečným původem aplikace a push by žádal o oprávnění za vymyšlený podnik.
  const demo = jeCestaDema(usePathname());
  return (
    <NextAuthSessionProvider>
      {/* Jazyk nad motivem: motiv ani postupy ho nepotřebují, ale všechno pod
          nimi ano. Počáteční jazyk a první slovníky posílá server (layout). */}
      <I18nProvider jazyk={jazyk} slovniky={slovniky}>
        <ThemeProvider>
          <ProcedureProvider>
            {!demo && <ServiceWorker />}
            {!demo && <PushManager />}
            {/* Nativní obal (ManageroApp/, ManageroClient/): push, sken, sdílení. Na webu se nic nestáhne. */}
            {!demo && <NativeBridgeLoader />}
            <UlozeniHlaska />
            {/* Jazyk, motiv a osobní formáty z účtu na zařízení, které je ještě nemá (components/NastaveniSync.tsx). */}
            <NastaveniSync />
            {children}
            <FloatingRunner />
          </ProcedureProvider>
        </ThemeProvider>
      </I18nProvider>
    </NextAuthSessionProvider>
  );
}
