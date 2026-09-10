'use client';

import { CurrencyProvider } from '../CurrencyProvider';
import { PlanProvider } from '../Pro';
import PosTick from '../PosTick';
import EmployerLayout from './EmployerLayout';
import MigrationOnLoad from './MigrationOnLoad';

export default function EmployerApp({ user }: { user: any }) {
  return (
    <CurrencyProvider>
      <PlanProvider>
      <MigrationOnLoad />
      <PosTick />
      <EmployerLayout user={user} />
      </PlanProvider>
    </CurrencyProvider>
  );
}
