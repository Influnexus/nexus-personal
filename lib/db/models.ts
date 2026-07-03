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

// ---------------------------------------------------------------------------------------------
// Executive Memory System — agent-agnostic structured memory shared by every future AI employee
// (CFO today; HR/Sales/Legal/Ops/Marketing later). Strictly isolated per organization.
// ---------------------------------------------------------------------------------------------
export type MemoryCategory = 'business' | 'financial' | 'goal' | 'decision' | 'preference';

export interface MemoryDoc {
  id: string;
  organizationId: string;
  category: MemoryCategory;
  label: string;         // short human-readable title, e.g. "Industry" or "Reduce AWS spend"
  value: string;          // the fact/goal/decision content
  source: 'user' | 'ai_extracted' | 'system';
  agent: string;          // which AI employee this came from/is relevant to, e.g. 'cfo' (future: 'hr', 'sales')
  sourceConversationId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
