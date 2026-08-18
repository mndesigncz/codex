'use client';

import { CurrencyProvider } from '../CurrencyProvider';
import { PlanProvider } from '../Pro';
import EmployeeLayout from './EmployeeLayout';

export default function EmployeeApp({ user }: { user: any }) {
  return (
    <CurrencyProvider>
      <PlanProvider>
      <EmployeeLayout user={user} />
      </PlanProvider>
    </CurrencyProvider>
  );
}
