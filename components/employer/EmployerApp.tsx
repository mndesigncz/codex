'use client';

import { CurrencyProvider } from '../CurrencyProvider';
import { PlanProvider } from '../Pro';
import EmployerLayout from './EmployerLayout';
import MigrationOnLoad from './MigrationOnLoad';

export default function EmployerApp({ user }: { user: any }) {
  return (
    <CurrencyProvider>
      <PlanProvider>
      <MigrationOnLoad />
      <EmployerLayout user={user} />
      </PlanProvider>
    </CurrencyProvider>
  );
}
