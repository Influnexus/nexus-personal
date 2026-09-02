import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      activeOrgId?: string | null;
      role?: string | null;
      isDemo?: boolean;
      demoExpiresAt?: string | null;
      workspaceKind?: 'business' | 'personal';
    };
  }
  interface User {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    isDemo?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    activeOrgId?: string | null;
    role?: string | null;
    isDemo?: boolean;
    demoExpiresAt?: string | null;
    workspaceKind?: 'business' | 'personal';
  }
}
