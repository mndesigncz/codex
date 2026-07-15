import type { Metadata } from 'next';
import './globals.css';
import { SessionProvider } from './providers';

export const metadata: Metadata = {
  title: 'Pangea',
  description: 'Systém pro správu podniku',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Pangea', statusBarStyle: 'default' },
};

export const viewport = {
  themeColor: '#C8F542',
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
