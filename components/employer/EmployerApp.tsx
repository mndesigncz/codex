'use client';

import { CurrencyProvider } from '../CurrencyProvider';
import { PlanProvider } from '../Pro';
import EmployerLayout from './EmployerLayout';

export default function EmployerApp({ user }: { user: any }) {
  return (
    <CurrencyProvider>
      <PlanProvider>
      <EmployerLayout user={user} />
      </PlanProvider>
    </CurrencyProvider>
  );
}
