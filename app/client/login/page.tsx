import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/client/AuthForms';
export const metadata: Metadata = { title: 'Přihlásit se · Managero client' };
export default function Page() { return <Suspense><LoginForm /></Suspense>; }
