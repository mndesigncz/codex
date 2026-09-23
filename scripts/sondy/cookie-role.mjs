// Vyrazí NextAuth session cookie pro danou roli (employer|employee|kiosk|customer).
import { encode } from 'next-auth/jwt';
const role = process.argv[2] ?? 'employer';
const ids = { employer: '15', employee: '16', kiosk: '17', customer: '18' };
const names = { employer: 'Martin Nemeškal', employee: 'Eva Testová', kiosk: 'iPad na baru', customer: 'Klára Vojtíšková' };
const token = await encode({
  token: { sub: ids[role] ?? '15', name: names[role] ?? 'Test', email: `${role}@test.cz`, role: role === 'customer' ? 'customer' : role, avatar: '🧑', jobTitle: 'Test', teamId: 1 },
  secret: process.env.NEXTAUTH_SECRET,
});
console.log(token);
