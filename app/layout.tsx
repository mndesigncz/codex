import type { Metadata } from 'next';
import './globals.css';
import { SessionProvider } from './providers';

export const metadata: Metadata = {
  title: 'Čajovna Zelená',
  description: 'Správa čajovny',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
