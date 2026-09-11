import { Suspense } from 'react';
import type { Metadata } from 'next';
import { RegisterForm } from '@/components/client/AuthForms';
export const metadata: Metadata = { title: 'Založit účet · Managero client' };
export default function Page() { return <Suspense><RegisterForm /></Suspense>; }
