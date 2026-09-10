'use client';

import { CurrencyProvider } from '../CurrencyProvider';
import { PlanProvider } from '../Pro';
import PosTick from '../PosTick';
import EmployeeLayout from './EmployeeLayout';

export default function EmployeeApp({ user }: { user: any }) {
  return (
    <CurrencyProvider>
      <PlanProvider>
      <PosTick />
      <EmployeeLayout user={user} />
      </PlanProvider>
    </CurrencyProvider>
  );
}
