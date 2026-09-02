import { getDb } from '@/lib/db/mongo';
import { OrganizationDoc } from '@/lib/db/models';
import { v4 as uuid } from 'uuid';

const col = async () => (await getDb()).collection<OrganizationDoc>('organizations');

export const orgsRepo = {
  async findById(id: string) { return (await col()).findOne({ id }); },
  async findBySlug(slug: string) { return (await col()).findOne({ slug }); },
  async create(data: { name: string; slug: string; ownerId: string; isDemo?: boolean; demoExpiresAt?: Date | null; kind?: 'business' | 'personal' }) {
    const now = new Date();
    const doc: OrganizationDoc = {
      id: uuid(), name: data.name, slug: data.slug,
      ownerId: data.ownerId, plan: 'free', kind: data.kind ?? 'business', isDemo: data.isDemo, demoExpiresAt: data.demoExpiresAt,
      createdAt: now, updatedAt: now,
    };
    await (await col()).insertOne(doc as any);
    return doc;
  },
  async update(id: string, patch: Partial<OrganizationDoc>) {
    const c = await col();
    await c.updateOne({ id }, { $set: { ...patch, updatedAt: new Date() } });
    return c.findOne({ id });
  },
  async listByIds(ids: string[]) {
    return (await col()).find({ id: { $in: ids } }).toArray();
  },
  async listExpiredDemo(now: Date) {
    return (await col()).find({ isDemo: true, demoExpiresAt: { $lt: now } }).toArray();
  },
  async remove(id: string) {
    await (await col()).deleteOne({ id });
  },
};
