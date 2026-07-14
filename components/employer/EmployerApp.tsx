'use client';

import { useSession } from 'next-auth/react';
import EmployerLayout from './EmployerLayout';

export default function EmployerApp({ user }: { user: any }) {
  return <EmployerLayout user={user} />;
}
