'use client';

import { CurrencyProvider } from '../CurrencyProvider';
import EmployeeLayout from './EmployeeLayout';

export default function EmployeeApp({ user }: { user: any }) {
  return (
    <CurrencyProvider>
      <EmployeeLayout user={user} />
    </CurrencyProvider>
  );
}
