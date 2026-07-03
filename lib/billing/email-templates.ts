// Email templates — content/HTML generation only. No email provider (SendGrid/SES/etc.) is
// configured yet, so nothing is actually sent; these functions return {subject, html} ready to
// hand to a mailer once one is wired up. Keeping templates here (not scattered in routes) means
// wiring a real mailer later is a one-line change per call site.
import { PlanDef } from './plans';

function shell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><body style="font-family: system-ui, sans-serif; background:#f6f6f7; padding:32px;">
    <div style="max-width:520px; margin:0 auto; background:#fff; border-radius:16px; padding:32px; border:1px solid #eee;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:24px;">
        <div style="width:32px; height:32px; border-radius:8px; background:#111; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700;">N</div>
        <strong>NexusAI</strong>
      </div>
      <h2 style="margin-top:0;">${title}</h2>
      ${bodyHtml}
      <p style="margin-top:32px; color:#999; font-size:12px;">NexusAI, Inc. · This is an automated message.</p>
    </div>
  </body></html>`;
}

export const emailTemplates = {
  trialStarted(orgName: string, plan: PlanDef, trialEndsAt: Date) {
    return {
      subject: `Your ${plan.name} trial has started`,
      html: shell('Your 14-day trial has started 🎉', `
        <p>Hi ${orgName},</p>
        <p>You're now on the <strong>${plan.name}</strong> trial. No payment required until it ends on <strong>${trialEndsAt.toLocaleDateString()}</strong>.</p>
        <p>Explore the AI CFO — chat, invoice OCR, forecasting and more are all unlocked.</p>`),
    };
  },
  trialEndingSoon(orgName: string, plan: PlanDef, daysLeft: number) {
    return {
      subject: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your NexusAI trial`,
      html: shell('Your trial is ending soon', `
        <p>Hi ${orgName},</p>
        <p>Your <strong>${plan.name}</strong> trial ends in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong>. Add a payment method to keep your AI CFO running without interruption.</p>`),
    };
  },
  paymentFailed(orgName: string) {
    return {
      subject: 'Payment failed — action needed',
      html: shell('We couldn\u2019t process your payment', `
        <p>Hi ${orgName},</p>
        <p>Your latest subscription payment didn\u2019t go through. Please update your payment method to avoid losing access.</p>`),
    };
  },
  subscriptionConfirmed(orgName: string, plan: PlanDef) {
    return {
      subject: `You're subscribed to ${plan.name}`,
      html: shell('Subscription confirmed', `
        <p>Hi ${orgName},</p>
        <p>Thanks for subscribing to <strong>${plan.name}</strong>. Your receipt and invoices are always available in Billing → Invoice history.</p>`),
    };
  },
  invoiceReceipt(orgName: string, amount: number, currency: string) {
    return {
      subject: `Receipt: ${currency} ${amount.toFixed(2)}`,
      html: shell('Payment receipt', `
        <p>Hi ${orgName},</p>
        <p>We\u2019ve charged <strong>${currency} ${amount.toFixed(2)}</strong> for your NexusAI subscription. View the full tax invoice anytime in Billing.</p>`),
    };
  },
};
