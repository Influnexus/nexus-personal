// Repository layer for billing — strictly organization-scoped, mirrors the pattern used across
// the rest of the app (lib/repositories/*).
import { getDb } from '@/lib/db/mongo';
import { SubscriptionDoc, BillingInvoiceDoc, UsageRecordDoc, PaymentMethodDoc, WebhookEventDoc, UsageMetric } from '@/lib/db/models';
import { v4 as uuid } from 'uuid';

const subsCol = async () => (await getDb()).collection<SubscriptionDoc>('subscriptions');
const invoicesCol = async () => (await getDb()).collection<BillingInvoiceDoc>('billing_invoices');
const usageCol = async () => (await getDb()).collection<UsageRecordDoc>('usage_records');
const paymentMethodsCol = async () => (await getDb()).collection<PaymentMethodDoc>('payment_methods');
const webhooksCol = async () => (await getDb()).collection<WebhookEventDoc>('webhook_events');

export const subscriptionsRepo = {
  async findByOrg(organizationId: string) {
    return (await subsCol()).findOne({ organizationId });
  },
  async create(doc: Omit<SubscriptionDoc, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date();
    const full: SubscriptionDoc = { id: uuid(), ...doc, createdAt: now, updatedAt: now };
    await (await subsCol()).insertOne(full as any);
    return full;
  },
  async update(organizationId: string, patch: Partial<SubscriptionDoc>) {
    const c = await subsCol();
    await c.updateOne({ organizationId }, { $set: { ...patch, updatedAt: new Date() } });
    return c.findOne({ organizationId });
  },
  async findByProviderSubscriptionId(provider: string, providerSubscriptionId: string) {
    return (await subsCol()).findOne({ provider, providerSubscriptionId });
  },
};

export const billingInvoicesRepo = {
  async listByOrg(organizationId: string) {
    return (await invoicesCol()).find({ organizationId }).sort({ issuedAt: -1 }).toArray();
  },
  async create(doc: Omit<BillingInvoiceDoc, 'id' | 'createdAt'>) {
    const full: BillingInvoiceDoc = { id: uuid(), ...doc, createdAt: new Date() };
    await (await invoicesCol()).insertOne(full as any);
    return full;
  },
};

export const usageRepo = {
  async increment(organizationId: string, metric: UsageMetric, period: string, by = 1) {
    const c = await usageCol();
    await c.updateOne(
      { organizationId, metric, period },
      { $inc: { count: by }, $set: { updatedAt: new Date() }, $setOnInsert: { id: uuid() } },
      { upsert: true },
    );
  },
  async get(organizationId: string, metric: UsageMetric, period: string) {
    const row = await (await usageCol()).findOne({ organizationId, metric, period });
    return row?.count ?? 0;
  },
  async getAllForPeriod(organizationId: string, period: string) {
    return (await usageCol()).find({ organizationId, period }).toArray();
  },
};

export const paymentMethodsRepo = {
  async listByOrg(organizationId: string) {
    return (await paymentMethodsCol()).find({ organizationId }).sort({ isDefault: -1, createdAt: -1 }).toArray();
  },
  async create(doc: Omit<PaymentMethodDoc, 'id' | 'createdAt'>) {
    const full: PaymentMethodDoc = { id: uuid(), ...doc, createdAt: new Date() };
    await (await paymentMethodsCol()).insertOne(full as any);
    return full;
  },
  async remove(id: string, organizationId: string) {
    await (await paymentMethodsCol()).deleteOne({ id, organizationId });
  },
};

export const webhookEventsRepo = {
  async findByEventId(provider: string, eventId: string) {
    return (await webhooksCol()).findOne({ provider, eventId });
  },
  async create(doc: Omit<WebhookEventDoc, 'id' | 'createdAt'>) {
    const full: WebhookEventDoc = { id: uuid(), ...doc, createdAt: new Date() };
    await (await webhooksCol()).insertOne(full as any);
    return full;
  },
  async markProcessed(id: string, status: 'processed' | 'failed', error?: string) {
    await (await webhooksCol()).updateOne({ id }, { $set: { status, error: error || null, processedAt: new Date() } });
  },
};

export function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
