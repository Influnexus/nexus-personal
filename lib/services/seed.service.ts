// Seed realistic demo data so a fresh org instantly demonstrates AI CFO value.
import { transactionsRepo } from '@/lib/repositories/transactions';
import { invoicesRepo } from '@/lib/repositories/invoices';

interface Pattern { vendor: string; category: string; amountRange: [number, number]; cadenceDays: number; sign: 1 | -1 }

const PATTERNS: Pattern[] = [
  { vendor: 'Stripe Payouts', category: 'Revenue', amountRange: [8000, 18000], cadenceDays: 7, sign: 1 },
  { vendor: 'Acme Corp', category: 'Revenue', amountRange: [12000, 22000], cadenceDays: 30, sign: 1 },
  { vendor: 'Globex Inc', category: 'Revenue', amountRange: [5000, 9000], cadenceDays: 30, sign: 1 },
  { vendor: 'AWS', category: 'Infrastructure', amountRange: [1800, 2400], cadenceDays: 30, sign: -1 },
  { vendor: 'Vercel', category: 'Infrastructure', amountRange: [380, 480], cadenceDays: 30, sign: -1 },
  { vendor: 'Datadog', category: 'Infrastructure', amountRange: [600, 720], cadenceDays: 30, sign: -1 },
  { vendor: 'Notion', category: 'SaaS', amountRange: [180, 220], cadenceDays: 30, sign: -1 },
  { vendor: 'Figma', category: 'SaaS', amountRange: [120, 180], cadenceDays: 30, sign: -1 },
  { vendor: 'Slack', category: 'SaaS', amountRange: [240, 320], cadenceDays: 30, sign: -1 },
  { vendor: 'Google Workspace', category: 'SaaS', amountRange: [180, 240], cadenceDays: 30, sign: -1 },
  { vendor: 'Linear', category: 'SaaS', amountRange: [80, 120], cadenceDays: 30, sign: -1 },
  { vendor: 'Stripe Fees', category: 'Payment fees', amountRange: [120, 380], cadenceDays: 7, sign: -1 },
  { vendor: 'Brex', category: 'Travel & Meals', amountRange: [40, 380], cadenceDays: 4, sign: -1 },
  { vendor: 'Uber', category: 'Travel & Meals', amountRange: [12, 95], cadenceDays: 5, sign: -1 },
  { vendor: 'WeWork', category: 'Office', amountRange: [4800, 5200], cadenceDays: 30, sign: -1 },
  { vendor: 'Payroll', category: 'Payroll', amountRange: [48000, 55000], cadenceDays: 30, sign: -1 },
  { vendor: 'Meta Ads', category: 'Marketing', amountRange: [800, 2400], cadenceDays: 14, sign: -1 },
  { vendor: 'Google Ads', category: 'Marketing', amountRange: [1200, 3200], cadenceDays: 14, sign: -1 },
  { vendor: 'LinkedIn Ads', category: 'Marketing', amountRange: [400, 1200], cadenceDays: 14, sign: -1 },
];

function rand(a: number, b: number) { return a + Math.random() * (b - a); }

export const seedService = {
  async seedOrg(orgId: string) {
    const existing = await transactionsRepo.countByOrg(orgId);
    if (existing > 0) return { transactions: 0, invoices: 0, alreadySeeded: true };

    const today = new Date();
    const txs: any[] = [];
    for (const p of PATTERNS) {
      let d = new Date(today); d.setDate(d.getDate() - 180);
      while (d <= today) {
        const amount = Math.round(rand(p.amountRange[0], p.amountRange[1])) * p.sign;
        txs.push({
          organizationId: orgId,
          date: d.toISOString().slice(0, 10),
          description: `${p.vendor} ${p.sign > 0 ? 'payment received' : 'charge'}`,
          vendor: p.vendor,
          category: p.category,
          amount,
          currency: 'USD',
          recurring: true,
          source: 'seed' as const,
        });
        d = new Date(d); d.setDate(d.getDate() + p.cadenceDays);
      }
    }
    // Inject anomaly: an unusually large AWS charge ~10 days ago
    const anomalyDate = new Date(today); anomalyDate.setDate(anomalyDate.getDate() - 10);
    txs.push({ organizationId: orgId, date: anomalyDate.toISOString().slice(0, 10), description: 'AWS charge', vendor: 'AWS', category: 'Infrastructure', amount: -11800, currency: 'USD', source: 'seed' as const });
    // Inject one-off legal expense
    const legalDate = new Date(today); legalDate.setDate(legalDate.getDate() - 18);
    txs.push({ organizationId: orgId, date: legalDate.toISOString().slice(0, 10), description: 'Legal counsel retainer', vendor: 'Pillar Legal', category: 'Professional Services', amount: -8500, currency: 'USD', source: 'seed' as const });

    await transactionsRepo.insertMany(txs);

    // Seed invoices: a couple overdue, a couple open
    const dueA = new Date(today); dueA.setDate(dueA.getDate() - 12);
    const dueB = new Date(today); dueB.setDate(dueB.getDate() - 3);
    const dueC = new Date(today); dueC.setDate(dueC.getDate() + 7);
    const dueD = new Date(today); dueD.setDate(dueD.getDate() + 21);
    const issued = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const invSeeds = [
      { vendor: 'Client A — Apex Logistics', invoiceNumber: 'INV-2026-0117', invoiceDate: issued(42), dueDate: dueA.toISOString().slice(0, 10), amount: 18500, currency: 'USD', status: 'overdue', direction: 'receivable', source: 'seed' as const },
      { vendor: 'Client B — Vandelay Industries', invoiceNumber: 'INV-2026-0122', invoiceDate: issued(33), dueDate: dueB.toISOString().slice(0, 10), amount: 9200, currency: 'USD', status: 'overdue', direction: 'receivable', source: 'seed' as const },
      { vendor: 'Client C — Hooli Inc', invoiceNumber: 'INV-2026-0128', invoiceDate: issued(15), dueDate: dueC.toISOString().slice(0, 10), amount: 12400, currency: 'USD', status: 'open', direction: 'receivable', source: 'seed' as const },
      { vendor: 'Vendor — Pillar Legal', invoiceNumber: 'PL-9241', invoiceDate: issued(5), dueDate: dueD.toISOString().slice(0, 10), amount: 8500, currency: 'USD', status: 'open', direction: 'payable', source: 'seed' as const },
    ];
    for (const inv of invSeeds) await invoicesRepo.create({ ...inv, organizationId: orgId } as any);

    return { transactions: txs.length, invoices: invSeeds.length, alreadySeeded: false };
  },
};
