// Menu podniku „Kavárna U Lípy" a receptury (co se z jakého produktu odepíše
// ze skladu). Sdílí je Finance (tržby po položkách, marže) i Receptury a Sklad
// (kde se surovina používá), takže čísla v ukázce drží pohromadě.
//
// `itemId` míří na zásoby v lib/demo/stav.ts (id 1–16), `amount` je v jednotce
// skladu (kg, l, ks). Bagel se šunkou recepturu schválně nemá: ukázka tak
// ukáže i frontu „prodává se bez receptury", ne jen samé hotové řádky.

export interface PolozkaMenu { productId: string; name: string; category: string; price: number; podil: number }

export const MENU: PolozkaMenu[] = [
  { productId: 'p1', name: 'Flat white', category: 'Káva', price: 79, podil: 0.22 },
  { productId: 'p2', name: 'Cappuccino', category: 'Káva', price: 69, podil: 0.17 },
  { productId: 'p3', name: 'Espresso', category: 'Káva', price: 55, podil: 0.09 },
  { productId: 'p4', name: 'Latte s příchutí', category: 'Káva', price: 85, podil: 0.12 },
  { productId: 'p5', name: 'Croissant máslový', category: 'Pečivo', price: 49, podil: 0.13 },
  { productId: 'p6', name: 'Domácí koláč', category: 'Pečivo', price: 59, podil: 0.11 },
  { productId: 'p7', name: 'Domácí limonáda', category: 'Nápoje', price: 59, podil: 0.09 },
  { productId: 'p8', name: 'Bagel se šunkou', category: 'Jídlo', price: 95, podil: 0.07 },
];

export const RECEPTURY_DEMA: Record<string, { itemId: number; amount: number }[]> = {
  p1: [{ itemId: 1, amount: 0.018 }, { itemId: 3, amount: 0.16 }],
  p2: [{ itemId: 1, amount: 0.018 }, { itemId: 3, amount: 0.12 }],
  p3: [{ itemId: 1, amount: 0.009 }],
  p4: [{ itemId: 1, amount: 0.018 }, { itemId: 3, amount: 0.2 }, { itemId: 7, amount: 0.04 }],
  p5: [{ itemId: 9, amount: 1 }],
  p6: [{ itemId: 10, amount: 1 }],
  p7: [{ itemId: 11, amount: 0.3 }],
};
