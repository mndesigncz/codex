'use client';

// App-wide "click a name → open the employee profile" support.
//
// The provider is mounted once in the employer layout; PersonLink then wraps
// any name/avatar anywhere in the tree. Outside the provider (employee app,
// kiosk) PersonLink renders its children untouched, so shared components can
// use it freely without leaking employer-only UI.

import { createContext, useContext, useState } from 'react';
import EmployeeProfile from './EmployeeProfile';

const Ctx = createContext<((id: number) => void) | null>(null);

export function ProfileLinkProvider({ children }: { children: React.ReactNode }) {
  const [profileId, setProfileId] = useState<number | null>(null);
  return (
    <Ctx.Provider value={setProfileId}>
      {children}
      {profileId != null && <EmployeeProfile employeeId={profileId} onClose={() => setProfileId(null)} />}
    </Ctx.Provider>
  );
}

export function usePersonProfile() {
  return useContext(Ctx);
}

// A span (not a button) so it stays valid inside clickable cards/buttons;
// stopPropagation keeps the outer element's own action from firing.
export function PersonLink({ id, children, className = '' }: {
  id?: number | null;
  children: React.ReactNode;
  className?: string;
}) {
  const open = useContext(Ctx);
  if (!open || id == null) {
    return className ? <span className={className}>{children}</span> : <>{children}</>;
  }
  return (
    <span
      role="button"
      tabIndex={0}
      title="Zobrazit profil"
      onClick={e => { e.stopPropagation(); e.preventDefault(); open(id); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); open(id); } }}
      className={`tap-target-sm tap-target cursor-pointer hover:underline decoration-black/25 underline-offset-2 ${className}`}
    >
      {children}
    </span>
  );
}
