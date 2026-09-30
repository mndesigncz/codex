'use client';
import { odhlasit } from '@/lib/odhlaseni';

export default function OdhlasitButton() {
  return (
    <button type="button" className="btn btn-secondary" onClick={() => odhlasit({ callbackUrl: '/login' })}>
      Odhlásit se
    </button>
  );
}
