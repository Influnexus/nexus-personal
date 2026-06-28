import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from '@/auth.config';
import { authService } from '@/lib/services/auth.service';
import { membershipsRepo } from '@/lib/repositories/memberships';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = String(credentials?.email || '');
        const password = String(credentials?.password || '');
        if (!email || !password) return null;
        const user = await authService.verifyCredentials(email, password);
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image } as any;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = (user as any).id;
        const memberships = await membershipsRepo.listByUser(token.id as string);
        if (memberships[0]) {
          token.activeOrgId = memberships[0].organizationId;
          token.role = memberships[0].role;
        }
      }
      if (trigger === 'update' && session?.activeOrgId) {
        token.activeOrgId = session.activeOrgId;
        const m = await membershipsRepo.find(token.id as string, session.activeOrgId);
        token.role = m?.role ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.activeOrgId = (token.activeOrgId as string) ?? null;
        session.user.role = (token.role as string) ?? null;
      }
      return session;
    },
  },
});
