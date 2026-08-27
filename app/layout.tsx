import type { Metadata } from 'next';
import './globals.css';
import { SessionProvider } from './providers';

export const metadata: Metadata = {
  title: 'Managero',
  description: 'Systém pro správu podniku',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Managero', statusBarStyle: 'default' },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#C8F542' },
    { media: '(prefers-color-scheme: dark)', color: '#0C0D0F' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('managero-theme')||localStorage.getItem('pangea-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}`,
          }}
        />
      </head>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
