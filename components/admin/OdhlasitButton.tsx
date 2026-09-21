'use client';
import { signOut } from 'next-auth/react';

export default function OdhlasitButton() {
  return (
    <button type="button" className="btn btn-secondary" onClick={() => signOut({ callbackUrl: '/login' })}>
      Odhlásit se
    </button>
  );
}
