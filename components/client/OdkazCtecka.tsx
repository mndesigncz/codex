'use client';

import Link from 'next/link';
import { Icon } from '../Icons';
import { useOpravneni } from '../role/useOpravneni';

/** Odkaz na čtečku z Kartičky hosta a z Věrnosti; vedení a zaměstnanec mají každý svou trasu. */
export default function OdkazCtecka({ className = '' }: { className?: string }) {
  const { role } = useOpravneni();
  return (
    <Link href={role?.typ === 'zamestnanec' || role?.typ === 'kiosk' ? '/employee/ctecka' : '/employer/ctecka'} className={`tap-target-sm inline-flex items-center gap-1.5 text-sm font-semibold text-black/60 hover:text-black ${className}`}>
      <Icon name="card" size={15} />Režim čtečky
    </Link>
  );
}
