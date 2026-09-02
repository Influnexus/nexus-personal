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

// Sprint P2 — minimal personal financial profile captured at onboarding (no bank credentials,
// no unnecessary PII). Stored on the personal organization document.
export interface PersonalProfile {
  monthlyIncome: number;
  essentialMonthly: number;
  discretionaryMonthly: number;
  cash: number;
  investments: number;
  totalDebt: number;
  monthlyDebtPayment: number;
  sipMonthly?: number;
  goal?: string | null;
  currency: string;
  updatedAt: Date;
}

export interface OrganizationDoc {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  logoUrl?: string;
  plan?: 'free' | 'pro' | 'enterprise';
  // Sprint P1: workspace kind. ABSENT = 'business' (all pre-existing orgs behave exactly as
  // before — no migration required). 'personal' marks a Nexus Personal workspace.
  kind?: 'business' | 'personal';
  personalProfile?: PersonalProfile;
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

// ---------------------------------------------------------------------------------------------
// Billing — provider-agnostic (Stripe + Razorpay). Never store raw card data; only provider
// references (customer/subscription/payment-method IDs) and metadata.
// ---------------------------------------------------------------------------------------------
export type PlanId = 'starter' | 'growth' | 'enterprise';
export type BillingInterval = 'monthly' | 'yearly';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'trial_expired' | 'incomplete';
export type BillingProviderId = 'stripe' | 'razorpay' | 'manual';

export interface SubscriptionDoc {
  id: string;
  organizationId: string;
  plan: PlanId;
  interval: BillingInterval;
  status: SubscriptionStatus;
  provider: BillingProviderId | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  trialStartedAt?: Date | null;
  trialEndsAt?: Date | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | null;
  region?: 'IN' | 'INTL';
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingInvoiceDoc {
  id: string;
  organizationId: string;
  subscriptionId: string;
  provider: BillingProviderId;
  providerInvoiceId?: string | null;
  amount: number;
  currency: string;
  taxAmount?: number;
  status: 'paid' | 'open' | 'void' | 'uncollectible';
  periodStart?: Date | null;
  periodEnd?: Date | null;
  pdfUrl?: string | null;
  issuedAt: Date;
  createdAt: Date;
}

export type UsageMetric = 'ai_messages' | 'invoices_processed' | 'csv_imports';

export interface UsageRecordDoc {
  id: string;
  organizationId: string;
  period: string; // YYYY-MM
  metric: UsageMetric;
  count: number;
  updatedAt: Date;
}

export interface PaymentMethodDoc {
  id: string;
  organizationId: string;
  provider: BillingProviderId;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  isDefault: boolean;
  createdAt: Date;
}

export interface WebhookEventDoc {
  id: string;
  provider: BillingProviderId;
  eventId: string; // provider's event id, for idempotency
  type: string;
  payload: any;
  status: 'received' | 'processed' | 'failed';
  error?: string | null;
  createdAt: Date;
  processedAt?: Date | null;
}
