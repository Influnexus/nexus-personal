// Repository for the Executive Memory System. STRICTLY organization-scoped — every query filters
// by organizationId so memories never leak across tenants.
import { getDb } from '@/lib/db/mongo';
import { MemoryDoc, MemoryCategory } from '@/lib/db/models';
import { v4 as uuid } from 'uuid';

const col = async () => (await getDb()).collection<MemoryDoc>('memories');

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const memoriesRepo = {
  async listByOrg(organizationId: string, category?: MemoryCategory) {
    const q: any = { organizationId };
    if (category) q.category = category;
    return (await col()).find(q).sort({ updatedAt: -1 }).toArray();
  },
  async findById(id: string, organizationId: string) {
    // organizationId included in the lookup itself — defense in depth against cross-tenant access.
    return (await col()).findOne({ id, organizationId });
  },
  async create(data: { organizationId: string; category: MemoryCategory; label: string; value: string; source: 'user' | 'ai_extracted' | 'system'; agent: string; sourceConversationId?: string | null }) {
    const now = new Date();
    const doc: MemoryDoc = { id: uuid(), ...data, sourceConversationId: data.sourceConversationId ?? null, createdAt: now, updatedAt: now };
    await (await col()).insertOne(doc as any);
    return doc;
  },
  async update(id: string, organizationId: string, patch: Partial<Pick<MemoryDoc, 'label' | 'value' | 'category'>>) {
    const c = await col();
    await c.updateOne({ id, organizationId }, { $set: { ...patch, updatedAt: new Date() } });
    return c.findOne({ id, organizationId });
  },
  async remove(id: string, organizationId: string) {
    const r = await (await col()).deleteOne({ id, organizationId });
    return r.deletedCount > 0;
  },
  async removeAllByOrg(organizationId: string, category?: MemoryCategory) {
    const q: any = { organizationId };
    if (category) q.category = category;
    const r = await (await col()).deleteMany(q);
    return r.deletedCount;
  },
  // Simple de-dupe hook for AI-extracted memories: find an existing near-duplicate by category+label
  // (case-insensitive) so repeated mentions update the same memory instead of piling up duplicates.
  async findSimilar(organizationId: string, category: MemoryCategory, label: string) {
    const c = await col();
    return c.findOne({ organizationId, category, label: { $regex: `^${escapeRegex(label)}$`, $options: 'i' } });
  },
};
