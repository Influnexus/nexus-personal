import { getDb } from '@/lib/db/mongo';
import { v4 as uuid } from 'uuid';

export interface InvoiceLineItem { description: string; quantity?: number; unitPrice?: number; amount: number }

export interface Invoice {
  id: string;
  organizationId: string;
  vendor: string;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  amount: number;
  currency: string;
  tax?: number | null;
  lineItems?: InvoiceLineItem[];
  status: 'draft' | 'open' | 'paid' | 'overdue' | 'void';
  direction: 'receivable' | 'payable';
  source: 'upload' | 'manual' | 'seed';
  originalFileUrl?: string;
  fileMime?: string;
  notes?: string;
  anomalies?: string[];
  createdAt: Date;
  uploadedBy?: string;
}

const col = async () => (await getDb()).collection<Invoice>('invoices');

export const invoicesRepo = {
  async listByOrg(orgId: string) {
    return (await col()).find({ organizationId: orgId }).sort({ createdAt: -1 }).toArray();
  },
  async create(data: Omit<Invoice, 'id' | 'createdAt'>) {
    const doc: Invoice = { id: uuid(), createdAt: new Date(), ...data };
    await (await col()).insertOne(doc as any);
    return doc;
  },
  async findByVendorAndNumber(orgId: string, vendor: string, num: string) {
    return (await col()).findOne({ organizationId: orgId, vendor, invoiceNumber: num });
  },
  async countByOrg(orgId: string) {
    return (await col()).countDocuments({ organizationId: orgId });
  },
  async deleteByOrg(orgId: string) {
    await (await col()).deleteMany({ organizationId: orgId });
  },
};
