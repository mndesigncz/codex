// Doplní do fixtur vazbu návod ↔ skladová položka, ať má sonda co měřit.
import { readFileSync, writeFileSync } from 'node:fs';
const D = new URL('./fixtury/', import.meta.url).pathname;

// Návod č. 2 připneme k položce „Domácí limonáda" (id 4, madeInHouse).
const g = JSON.parse(readFileSync(D + 'guides.json', 'utf8'));
for (const x of g.guides) x.itemId = x.id === 2 ? 4 : null;
g.guides.find(x => x.id === 2).title = 'Domácí limonáda — postup';
writeFileSync(D + 'guides.json', JSON.stringify(g, null, 1));

// Detail návodu pro čtečku.
writeFileSync(D + 'guides_2.json', JSON.stringify({
  guide: {
    id: 2, title: 'Domácí limonáda — postup',
    content: 'Dělá se ráno, vydrží tři dny.',
    checklist: [
      { text: 'Nakrájet citrony' },
      { text: 'Svařit sirup s vodou' },
      { text: 'Nechat vychladnout a stočit' },
    ],
    categoryId: 2, updatedAt: '2026-09-12T14:02:00Z', createdAt: '2026-09-01T08:00:00Z',
    author: 'Martin', productId: null, productName: null,
    itemId: 4, itemName: 'Domácí limonáda', itemMadeInHouse: true,
  },
}, null, 1));

// Výrobní receptura položky 4 — s připnutým návodem.
writeFileSync(D + 'inventory_4_production.json', JSON.stringify({
  itemId: 4, name: 'Domácí limonáda', unit: 'l', madeInHouse: true, batchYield: 5,
  batchSteps: 'Starý text, co nikdo neudržuje',
  productionLabel: '', taskTitle: 'Vyrobit Domácí limonáda',
  status: 'low', batches: 2, ingredients: [],
  guideId: 2, guideTitle: 'Domácí limonáda — postup', guideSteps: 3, guideApproved: true,
}, null, 1));

// Výrobní úkol, který na návod odkazuje.
writeFileSync(D + 'tasks.json', JSON.stringify([{
  id: 91, title: 'Vyrobit Domácí limonáda',
  description: '2× dávka po 5 l.', priority: 'high', status: 'pending',
  dueDate: '2026-09-22', teamTask: true, source: 'production',
  sourceMeta: { itemId: 4, batches: 2, guideId: 2, guideTitle: 'Domácí limonáda — postup' },
  checklist: [
    { text: 'Nakrájet citrony', done: false },
    { text: 'Svařit sirup s vodou', done: false },
    { text: 'Nechat vychladnout a stočit', done: false },
  ],
}], null, 1));

console.log('fixtury doplněny: guides.json, guides_2.json, inventory_4_production.json, tasks.json');
