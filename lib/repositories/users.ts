import { getDb } from '@/lib/db/mongo';
import { UserDoc } from '@/lib/db/models';
import { v4 as uuid } from 'uuid';

const col = async () => (await getDb()).collection<UserDoc>('users');

export const usersRepo = {
  async findByEmail(email: string) {
    return (await col()).findOne({ email: email.toLowerCase() });
  },
  async findById(id: string) {
    return (await col()).findOne({ id });
  },
  async create(data: { email: string; name?: string; passwordHash: string; isDemo?: boolean }) {
    const now = new Date();
    const doc: UserDoc = {
      id: uuid(),
      email: data.email.toLowerCase(),
      name: data.name,
      passwordHash: data.passwordHash,
      isDemo: data.isDemo,
      createdAt: now,
      updatedAt: now,
    };
    await (await col()).insertOne(doc as any);
    return doc;
  },
  async update(id: string, patch: Partial<UserDoc>) {
    const c = await col();
    await c.updateOne({ id }, { $set: { ...patch, updatedAt: new Date() } });
    return c.findOne({ id });
  },
  async remove(id: string) {
    await (await col()).deleteOne({ id });
  },
};
