import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { klientIp } from './klientIp';
import { neon } from '@neondatabase/serverless';
import { hit, clear } from './rateLimit';
import { db } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';
import { generateJoinCode } from './team';
import { jeSpravcePodleDb } from './superadminDb';
import { zajistiClenstvi } from './tenant';

// Self-heal: an employer must always have a team. If theirs is missing
// (e.g. after a DB issue), recreate/relink it on login so the app never
// lands in a broken "employer without a team" state.
async function ensureEmployerTeam(userId: number, name: string, currentTeamId: number | null): Promise<number | null> {
  if (currentTeamId) return currentTeamId;
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const existing = await sql`SELECT id FROM teams WHERE owner_id = ${userId} LIMIT 1`;
    let teamId: number;
    if (existing.length > 0) {
      teamId = existing[0].id as number;
    } else {
      let code = generateJoinCode();
      for (let i = 0; i < 5; i++) {
        const clash = await sql`SELECT id FROM teams WHERE join_code = ${code}`;
        if (clash.length === 0) break;
        code = generateJoinCode();
      }
      const [team] = await sql`
        INSERT INTO teams (name, owner_id, join_code)
        VALUES (${'Podnik ' + name}, ${userId}, ${code}) RETURNING id`;
      teamId = team.id as number;
      try { await sql`INSERT INTO conversations (team_id, type, name) VALUES (${teamId}, 'team', 'Týmový chat')`; } catch {}
    }
    await sql`UPDATE users SET team_id = ${teamId} WHERE id = ${userId}`;
    return teamId;
  } catch {
    return currentTeamId;
  }
}

// Stav uživatele z databáze pro token. Krátká mezipaměť v isolátu: jedna
// stránka čte relaci i několikrát za sebou a pět vteřin zpoždění po změně
// role je proti třiceti dnům zanedbatelné. update() ji obchází.
const STAV_TTL_MS = 5_000;
const stavCache = new Map<number, { at: number; v: { role: string; teamId: number | null } | 'smazan' }>();
async function stavUzivatele(id: number, cerstve: boolean): Promise<{ role: string; teamId: number | null } | 'smazan' | null> {
  if (!Number.isFinite(id)) return 'smazan';
  const c = stavCache.get(id);
  if (!cerstve && c && Date.now() - c.at < STAV_TTL_MS) return c.v;
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const [u] = await sql`SELECT team_id, role FROM users WHERE id = ${id}`;
    const v = u ? { role: String(u.role), teamId: u.team_id == null ? null : Number(u.team_id) } : 'smazan' as const;
    if (stavCache.size > 5000) stavCache.clear();
    stavCache.set(id, { at: Date.now(), v });
    return v;
  } catch {
    return null;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Heslo', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        // Limit na e-mail nestačí: kdo zkouší jedno uniklé heslo proti
        // tisícům e-mailů (credential stuffing), trefí každý účet jen jednou.
        // Třicet pokusů z jedné adresy za čtvrt hodinu podnik s tabletem
        // a pár telefony nevyčerpá, skript ano. Počítá se i úspěch — jinak
        // by si útočník počítadlo nulovat přihlášením do vlastního účtu.
        const ipGate = await hit(`login-ip:${klientIp(req?.headers)}`, 30, 15 * 60, { failClosed: true });
        if (!ipGate.ok) return null;
        // Deset neúspěchů na e-mail za čtvrt hodiny. Bez tohohle šlo heslo
        // hádat donekonečna — bcrypt sice zdržuje, ale útočníka neodradí.
        const email = String(credentials.email).trim().toLowerCase();
        const gate = await hit(`login:${email}`, 10, 15 * 60, { failClosed: true });
        if (!gate.ok) {
          // Stejná odpověď jako u špatného hesla: ať se nedá zjistit, které
          // e-maily v aplikaci existují.
          return null;
        }
        const user = await db.query.users.findFirst({
          where: eq(users.email, credentials.email),
        });
        if (!user) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        await clear(`login:${email}`);
        let teamId: number | null = user.teamId ?? null;
        if (user.role === 'employer') {
          teamId = await ensureEmployerTeam(user.id, user.name, teamId);
        }
        // Členství v podniku (kolo 55): kdo má tým z doby před migrací, dostane
        // řádek v team_members — přepínač podniků ho jinak nevidí.
        await zajistiClenstvi(user.id, teamId, user.role);
        // Správce platformy se rozhodne tady, podle databáze, a jede v tokenu.
        // Klient si token nepřepíše; obnovuje se jen z databáze (níž).
        const superadmin = await jeSpravcePodleDb(user.id);
        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar ?? '👤',
          jobTitle: user.jobTitle ?? 'Barista',
          teamId,
          superadmin,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = (user as any).role;
        token.avatar = (user as any).avatar;
        token.jobTitle = (user as any).jobTitle;
        token.teamId = (user as any).teamId;
        token.superadmin = (user as any).superadmin === true;
      }
      // session.update() volá PROHLÍŽEČ. Smí proto obnovit jen to, co je
      // kosmetické — jméno a avatar. Příslušnost k týmu odsud přijímat nelze:
      // kdo si ji nastaví sám, čte cizí podnik. Aktuální tým se bere z
      // databáze při každém požadavku (viz níže), takže tady chybět může.
      if (trigger === 'update' && session?.user) {
        if (session.user.name) token.name = session.user.name;
        if ((session.user as any).avatar) token.avatar = (session.user as any).avatar;
      }
      // Role a tým se berou z databáze při KAŽDÉM čtení relace, ne jen když
      // prohlížeč sám zavolá update(). Token platí 30 dní a asi 68 rout čte
      // roli z něj: degradovaný manažer si dřív nechal práva vedení až do
      // vypršení tokenu, a kdo se přepnul do podniku, kde je jen zaměstnanec,
      // a update() schválně nezavolal, měl tam práva vedení z podniku, odkud
      // přišel. Teď token nese vždy to, co je v databázi.
      if (token.sub && !user) {
        const id = parseInt(String(token.sub));
        const u = await stavUzivatele(id, trigger === 'update');
        if (u === 'smazan') {
          // Účet zmizel: relace nese prázdnou roli a žádná routa ji nepustí.
          token.role = null; token.teamId = null; token.superadmin = false;
        } else if (u) {
          token.teamId = u.teamId; token.role = u.role;
          // Správce se ověřuje znovu jen u toho, kdo jím je, nebo při update():
          // ostatní za to neplatí dotazem navíc.
          if (token.superadmin === true || trigger === 'update') {
            try { token.superadmin = await jeSpravcePodleDb(id); } catch { /* zůstane */ }
          }
        }
        // u === null: databáze nejde — token zůstane, jaký byl, ať výpadek
        // neodhlásí celý podnik uprostřed směny.
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).avatar = token.avatar;
        (session.user as any).jobTitle = token.jobTitle;
        (session.user as any).teamId = token.teamId;
        (session.user as any).id = token.sub;
        // Správce platformy z tokenu — rozhodl se při přihlášení podle databáze
        // (role vedení, e-mail ze seznamu, bez dvojníka). Klient ho nezmění.
        (session.user as any).superadmin = token.superadmin === true;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
