'use client';

import EmployeeLayout from './EmployeeLayout';

export default function EmployeeApp({ user }: { user: any }) {
  return <EmployeeLayout user={user} />;
}
