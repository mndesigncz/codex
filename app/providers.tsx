'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import PushManager from '@/components/PushManager';
import { ThemeProvider } from '@/components/ThemeProvider';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <ThemeProvider>
        <PushManager />
        {children}
      </ThemeProvider>
    </NextAuthSessionProvider>
  );
}
