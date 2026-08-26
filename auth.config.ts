import type { NextAuthConfig } from 'next-auth';

export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt' },
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  pages: { signIn: '/login' },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const protectedPaths = ['/dashboard','/organization','/team','/profile','/settings','/billing','/notifications','/personal'];
      const isProtected = protectedPaths.some(p => nextUrl.pathname.startsWith(p));
      if (isProtected) return isLoggedIn;
      if ((nextUrl.pathname === '/login' || nextUrl.pathname === '/register') && isLoggedIn) {
        return Response.redirect(new URL('/dashboard', nextUrl));
      }
      return true;
    },
  },
};
