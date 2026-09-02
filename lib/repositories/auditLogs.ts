import { getDb } from '@/lib/db/mongo';
import { AuditLogDoc } from '@/lib/db/models';
import { v4 as uuid } from 'uuid';

const col = async () => (await getDb()).collection<AuditLogDoc>('audit_logs');

export const auditRepo = {
  async log(entry: Omit<AuditLogDoc, 'id' | 'createdAt'>) {
    const doc: AuditLogDoc = { id: uuid(), createdAt: new Date(), ...entry };
    await (await col()).insertOne(doc as any);
  },
  async list(organizationId: string, limit = 50) {
    return (await col()).find({ organizationId }).sort({ createdAt: -1 }).limit(limit).toArray();
  },
};
