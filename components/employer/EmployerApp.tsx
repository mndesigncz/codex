'use client';

import { CurrencyProvider } from '../CurrencyProvider';
import EmployerLayout from './EmployerLayout';

export default function EmployerApp({ user }: { user: any }) {
  return (
    <CurrencyProvider>
      <EmployerLayout user={user} />
    </CurrencyProvider>
  );
}
