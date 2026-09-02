import { orgsRepo } from '@/lib/repositories/organizations';
import { membershipsRepo } from '@/lib/repositories/memberships';
import { auditRepo } from '@/lib/repositories/auditLogs';

export const orgService = {
  async create(userId: string, data: { name: string; slug: string }) {
    const existing = await orgsRepo.findBySlug(data.slug);
    if (existing) throw new Error('Slug already taken');
    const org = await orgsRepo.create({ ...data, ownerId: userId });
    await membershipsRepo.create({ userId, organizationId: org.id, role: 'OWNER' });
    await auditRepo.log({ userId, organizationId: org.id, action: 'org.create', metadata: { name: org.name } });
    return org;
  },
  async listForUser(userId: string) {
    const memberships = await membershipsRepo.listByUser(userId);
    if (memberships.length === 0) return [];
    const orgs = await orgsRepo.listByIds(memberships.map(m => m.organizationId));
    return orgs.map(o => ({ ...o, role: memberships.find(m => m.organizationId === o.id)?.role }));
  },
};
