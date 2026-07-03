// InvoiceService — billing invoice history & tax invoice generation. In Phase 4A there are no
// real charges yet (trials are free), so this genuinely returns an empty list rather than fake
// data. Phase 4B populates this from provider webhooks (invoice.paid / invoice.payment_failed).
import { billingInvoicesRepo } from './repo';
import { BillingInvoiceDoc } from '@/lib/db/models';

export const invoiceService = {
  async listForOrg(organizationId: string): Promise<BillingInvoiceDoc[]> {
    return billingInvoicesRepo.listByOrg(organizationId);
  },

  async recordInvoice(data: Omit<BillingInvoiceDoc, 'id' | 'createdAt'>) {
    return billingInvoicesRepo.create(data);
  },

  /** Renders a simple tax-invoice HTML document for a given billing invoice — used for the
   *  "Tax invoice UI" (print/PDF via browser print dialog, consistent with the existing CFO
   *  reports export pattern). */
  renderTaxInvoiceHtml(invoice: BillingInvoiceDoc, orgName: string): string {
    const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `
      <div style="font-family: system-ui, sans-serif; max-width: 640px; margin: 0 auto; padding: 32px;">
        <h2 style="margin-bottom:4px;">Tax Invoice</h2>
        <p style="color:#666; margin-top:0;">NexusAI, Inc.</p>
        <hr />
        <p><strong>Billed to:</strong> ${orgName}</p>
        <p><strong>Invoice date:</strong> ${new Date(invoice.issuedAt).toLocaleDateString()}</p>
        <p><strong>Invoice ID:</strong> ${invoice.id}</p>
        <table style="width:100%; margin-top:16px; border-collapse: collapse;">
          <tr style="border-bottom:1px solid #ddd;"><td style="padding:8px 0;">Subscription charge</td><td style="text-align:right;">${invoice.currency} ${fmt(invoice.amount)}</td></tr>
          ${invoice.taxAmount ? `<tr><td style="padding:8px 0;">Tax</td><td style="text-align:right;">${invoice.currency} ${fmt(invoice.taxAmount)}</td></tr>` : ''}
          <tr style="border-top:2px solid #222; font-weight:600;"><td style="padding:8px 0;">Total</td><td style="text-align:right;">${invoice.currency} ${fmt(invoice.amount + (invoice.taxAmount || 0))}</td></tr>
        </table>
        <p style="margin-top:24px; color:#666; font-size:12px;">Status: ${invoice.status.toUpperCase()} · Provider: ${invoice.provider}</p>
      </div>`;
  },
};
