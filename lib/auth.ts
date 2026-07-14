import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { db } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';

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
        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar ?? '👤',
          jobTitle: user.jobTitle ?? 'Barista',
          teamId: user.teamId ?? null,
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
