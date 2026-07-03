export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface UserDoc {
  id: string;
  email: string;
  name?: string;
  image?: string;
  passwordHash: string;
  emailVerified?: Date | null;
  isDemo?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationDoc {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  logoUrl?: string;
  plan?: 'free' | 'pro' | 'enterprise';
  isDemo?: boolean;
  demoExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MembershipDoc {
  id: string;
  userId: string;
  organizationId: string;
  role: Role;
  createdAt: Date;
}

export interface InvitationDoc {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  token: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  invitedBy: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AuditLogDoc {
  id: string;
  organizationId?: string;
  userId: string;
  action: string;
  resource?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}
