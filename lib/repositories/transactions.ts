// Extend the data layer with finance domain models.
import { getDb } from '@/lib/db/mongo';
import { v4 as uuid } from 'uuid';

export interface Transaction {
  id: string;
  organizationId: string;
  date: string; // ISO yyyy-mm-dd
  description: string;
  vendor: string;
  category: string;
  amount: number; // signed: + revenue, - expense
  currency: string;
  recurring?: boolean;
  source?: 'csv' | 'manual' | 'seed';
  createdAt: Date;
}

const txCol = async () => (await getDb()).collection<Transaction>('transactions');

export const transactionsRepo = {
  async listByOrg(orgId: string) {
    return (await txCol()).find({ organizationId: orgId }).sort({ date: -1 }).toArray();
  },
  async insertMany(txs: Omit<Transaction, 'id' | 'createdAt'>[]) {
    if (!txs.length) return 0;
    const docs: Transaction[] = txs.map(t => ({ ...t, id: uuid(), createdAt: new Date() }));
    await (await txCol()).insertMany(docs as any);
    return docs.length;
  },
  async countByOrg(orgId: string) {
    return (await txCol()).countDocuments({ organizationId: orgId });
  },
  async deleteByOrg(orgId: string) {
    await (await txCol()).deleteMany({ organizationId: orgId });
  },
};
