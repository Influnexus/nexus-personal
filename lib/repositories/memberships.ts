import { getDb } from '@/lib/db/mongo';
import { MembershipDoc, Role } from '@/lib/db/models';
import { v4 as uuid } from 'uuid';

const col = async () => (await getDb()).collection<MembershipDoc>('memberships');

export const membershipsRepo = {
  async create(data: { userId: string; organizationId: string; role: Role }) {
    const doc: MembershipDoc = { id: uuid(), ...data, createdAt: new Date() };
    await (await col()).insertOne(doc as any);
    return doc;
  },
  async find(userId: string, organizationId: string) {
    return (await col()).findOne({ userId, organizationId });
  },
  async listByUser(userId: string) {
    return (await col()).find({ userId }).toArray();
  },
  async listByOrg(organizationId: string) {
    return (await col()).find({ organizationId }).toArray();
  },
  async updateRole(id: string, role: Role) {
    await (await col()).updateOne({ id }, { $set: { role } });
  },
  async remove(id: string) {
    await (await col()).deleteOne({ id });
  },
  async removeByOrg(organizationId: string) {
    await (await col()).deleteMany({ organizationId });
  },
};
