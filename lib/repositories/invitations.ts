import { getDb } from '@/lib/db/mongo';
import { InvitationDoc, Role } from '@/lib/db/models';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';

const col = async () => (await getDb()).collection<InvitationDoc>('invitations');

export const invitationsRepo = {
  async create(data: { organizationId: string; email: string; role: Role; invitedBy: string }) {
    const doc: InvitationDoc = {
      id: uuid(),
      organizationId: data.organizationId,
      email: data.email.toLowerCase(),
      role: data.role,
      token: crypto.randomBytes(24).toString('hex'),
      status: 'PENDING',
      invitedBy: data.invitedBy,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      createdAt: new Date(),
    };
    await (await col()).insertOne(doc as any);
    return doc;
  },
  async findByToken(token: string) { return (await col()).findOne({ token }); },
  async listByOrg(organizationId: string) {
    return (await col()).find({ organizationId }).sort({ createdAt: -1 }).toArray();
  },
  async updateStatus(id: string, status: InvitationDoc['status']) {
    await (await col()).updateOne({ id }, { $set: { status } });
  },
  async remove(id: string) { await (await col()).deleteOne({ id }); },
};
