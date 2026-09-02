import { getDb } from '@/lib/db/mongo';
import { v4 as uuid } from 'uuid';

export interface ConvMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  tool_calls?: any;
  tool_call_id?: string;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  organizationId: string;
  userId: string;
  title: string;
  messages: ConvMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const col = async () => (await getDb()).collection<Conversation>('conversations');

export const conversationsRepo = {
  async listByUser(orgId: string, userId: string) {
    return (await col()).find({ organizationId: orgId, userId }).sort({ updatedAt: -1 }).limit(30).toArray();
  },
  async findById(id: string) { return (await col()).findOne({ id }); },
  async create(data: { organizationId: string; userId: string; title: string }) {
    const now = new Date();
    const doc: Conversation = { id: uuid(), ...data, messages: [], createdAt: now, updatedAt: now };
    await (await col()).insertOne(doc as any);
    return doc;
  },
  async appendMessages(id: string, msgs: ConvMessage[]) {
    await (await col()).updateOne({ id }, { $push: { messages: { $each: msgs } as any }, $set: { updatedAt: new Date() } });
  },
  async deleteByOrg(orgId: string) {
    await (await col()).deleteMany({ organizationId: orgId });
  },
};
