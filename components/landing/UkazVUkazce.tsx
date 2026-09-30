'use client';

import type { IdSceny } from './ukazka/scenare';

// Tlačítko „Ukaž v ukázce": přepne živou ukázku v hero na danou scénu a
// odroluje k ní. Mluví s ní událostí, ne sdíleným stavem, takže sekce
// stránky zůstávají serverové a ukázka se nemusí nikam importovat.
export default function UkazVUkazce({ scena, children, className = '' }: {
  scena: IdSceny;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button type="button" className={className}
      onClick={() => window.dispatchEvent(new CustomEvent('managero:ukazka', { detail: { scena } }))}>
      {children}
    </button>
  );
}
