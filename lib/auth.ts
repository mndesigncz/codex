import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';
import { db } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';
import { generateJoinCode } from './team';

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

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Heslo', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await db.query.users.findFirst({
          where: eq(users.email, credentials.email),
        });
        if (!user) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        let teamId: number | null = user.teamId ?? null;
        if (user.role === 'employer') {
          teamId = await ensureEmployerTeam(user.id, user.name, teamId);
        }
        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar ?? '👤',
          jobTitle: user.jobTitle ?? 'Barista',
          teamId,
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
      }
      // Allow client-side session.update() to refresh profile fields
      if (trigger === 'update' && session?.user) {
        if (session.user.name) token.name = session.user.name;
        if ((session.user as any).avatar) token.avatar = (session.user as any).avatar;
        if ((session.user as any).teamId !== undefined) token.teamId = (session.user as any).teamId;
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
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
