// Doplní do fixtur: krok postupu s návodem, návod připnutý k uzávěrce,
// a seznam „kdo četl" pro povinné čtení.
import { readFileSync, writeFileSync } from 'node:fs';
const D = new URL('./fixtury/', import.meta.url).pathname;

// Krok „Zapnout kávovar" dostane návod č. 1.
const pr = JSON.parse(readFileSync(D + 'procedures.json', 'utf8'));
pr.procedures[0].items[0] = { text: 'Zapnout kávovar a nechat nahřát', emoji: '☕', guideId: 1 };
writeFileSync(D + 'procedures.json', JSON.stringify(pr, null, 1));

// Návod č. 3 připneme k uzávěrce; č. 1 zůstává povinné čtení.
const g = JSON.parse(readFileSync(D + 'guides.json', 'utf8'));
for (const x of g.guides) x.forClosing = x.id === 3;
const tri = g.guides.find(x => x.id === 3);
if (tri) tri.title = 'Když kasa nesedí';
writeFileSync(D + 'guides.json', JSON.stringify(g, null, 1));

// Kdo četl návod č. 1.
writeFileSync(D + 'guides_1_reads.json', JSON.stringify({
  read: [{ id: 5, name: 'Eva Testová', avatar: '🙂', jobTitle: 'Barista', readAt: '2026-09-18T08:00:00Z' }],
  unread: [
    { id: 6, name: 'Jakub Horák', avatar: '🧔', jobTitle: 'Barista', readAt: null },
    { id: 7, name: 'Tereza Malá', avatar: '👩', jobTitle: 'Servírka', readAt: null },
  ],
}, null, 1));

console.log('fixtury k53 doplněny');
