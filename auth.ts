import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from '@/auth.config';
import { authService } from '@/lib/services/auth.service';
import { membershipsRepo } from '@/lib/repositories/memberships';
import { orgsRepo } from '@/lib/repositories/organizations';
import { demoService } from '@/lib/services/demo.service';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { trackServer } from '@/lib/analytics/track-server';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: 'credentials',
      credentials: { email: {}, password: {} },
      async authorize(credentials, request) {
        const email = String(credentials?.email || '');
        const password = String(credentials?.password || '');
        if (!email || !password) return null;
        const ip = getClientIp(request as unknown as Request);
        // Brute-force guard: limit by IP+email combo so one bad actor can't hammer many accounts,
        // and a single account can't be hammered from one IP either.
        const rl = rateLimit(`login:${ip}:${email.toLowerCase()}`, 10, 10 * 60_000);
        if (!rl.allowed) throw new Error('Too many login attempts. Please try again in a few minutes.');
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
      async authorize(_credentials, request) {
        const ip = getClientIp(request as unknown as Request);
        const rl = rateLimit(`demo:${ip}`, 10, 15 * 60_000); // 10 demo workspaces / 15min / IP
        if (!rl.allowed) throw new Error('Too many demo workspaces created — please try again later.');
        const isPersonal = (_credentials as any)?.product === 'personal';
        const demoUser = isPersonal
          ? await demoService.createPersonalDemoWorkspace()
          : await demoService.createDemoWorkspace();
        trackServer(isPersonal ? 'personal_demo_started' : 'demo_started', { userId: demoUser.id, isDemo: true });
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
          const org = await orgsRepo.findById(memberships[0].organizationId);
          token.workspaceKind = org?.kind === 'personal' ? 'personal' : 'business';
          if (token.isDemo) {
            token.demoExpiresAt = org?.demoExpiresAt ? new Date(org.demoExpiresAt).toISOString() : null;
          }
        }
      }
      if (trigger === 'update') {
        if (session?.activeOrgId) {
          token.activeOrgId = session.activeOrgId;
          const m = await membershipsRepo.find(token.id as string, session.activeOrgId);
          token.role = m?.role ?? null;
          const org = await orgsRepo.findById(session.activeOrgId);
          token.workspaceKind = org?.kind === 'personal' ? 'personal' : 'business';
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
        session.user.workspaceKind = (token.workspaceKind as 'business' | 'personal') ?? 'business';
      }
      return session;
    },
  },
});
