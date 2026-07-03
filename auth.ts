import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from '@/auth.config';
import { authService } from '@/lib/services/auth.service';
import { membershipsRepo } from '@/lib/repositories/memberships';
import { orgsRepo } from '@/lib/repositories/organizations';
import { demoService } from '@/lib/services/demo.service';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: 'credentials',
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
    // Instant, no-signup demo workspace. Creates an ephemeral user + org + seeded data
    // and signs them in through the normal NextAuth JWT flow (see docs/demo-mode).
    Credentials({
      id: 'demo',
      name: 'Demo',
      credentials: {},
      async authorize() {
        const demoUser = await demoService.createDemoWorkspace();
        return { id: demoUser.id, email: demoUser.email, name: demoUser.name, isDemo: true } as any;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = (user as any).id;
        if ((user as any).isDemo) token.isDemo = true;
        const memberships = await membershipsRepo.listByUser(token.id as string);
        if (memberships[0]) {
          token.activeOrgId = memberships[0].organizationId;
          token.role = memberships[0].role;
          if (token.isDemo) {
            const org = await orgsRepo.findById(memberships[0].organizationId);
            token.demoExpiresAt = org?.demoExpiresAt ? new Date(org.demoExpiresAt).toISOString() : null;
          }
        }
      }
      if (trigger === 'update') {
        if (session?.activeOrgId) {
          token.activeOrgId = session.activeOrgId;
          const m = await membershipsRepo.find(token.id as string, session.activeOrgId);
          token.role = m?.role ?? null;
        }
        if (session?.refreshDemo === false) {
          token.isDemo = false;
          token.demoExpiresAt = null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.activeOrgId = (token.activeOrgId as string) ?? null;
        session.user.role = (token.role as string) ?? null;
        session.user.isDemo = !!token.isDemo;
        session.user.demoExpiresAt = (token.demoExpiresAt as string) ?? null;
      }
      return session;
    },
  },
});
