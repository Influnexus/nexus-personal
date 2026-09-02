'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, IndianRupee } from 'lucide-react';

declare global {
  interface Window { Razorpay: any }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

interface Props {
  plan: 'starter' | 'growth';
  interval: 'monthly' | 'yearly';
  label?: string;
  onVerified?: () => void;
  customerEmail?: string;
  customerName?: string;
}

export function RazorpayPayButton({ plan, interval, label = 'Pay now with Razorpay', onVerified, customerEmail, customerName }: Props) {
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    setLoading(true);
    try {
      const orderRes = await fetch('/api/billing/razorpay/order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, interval }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) { toast.error(order.error || 'Could not start checkout'); setLoading(false); return; }

      const scriptOk = await loadRazorpayScript();
      if (!scriptOk) { toast.error('Could not load Razorpay checkout. Check your connection and try again.'); setLoading(false); return; }

      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: 'NexusAI',
        description: `NexusAI ${plan} (${interval})`,
        prefill: { email: customerEmail, name: customerName },
        theme: { color: '#111111' },
        modal: {
          ondismiss: () => {
            toast.info('Checkout closed — no payment was made.');
            setLoading(false);
          },
        },
        handler: async (response: any) => {
          try {
            const verifyRes = await fetch('/api/billing/razorpay/verify', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verify = await verifyRes.json();
            if (!verifyRes.ok || !verify.verified) {
              toast.error(verify.error || 'Payment verification failed. If you were charged, contact support.');
              return;
            }
            toast.success(`Payment verified — you're now on ${plan}!`);
            onVerified?.();
          } catch {
            toast.error('Could not verify payment. If you were charged, contact support.');
          } finally {
            setLoading(false);
          }
        },
      });

      rzp.on('payment.failed', (resp: any) => {
        toast.error(resp?.error?.description || 'Payment failed. Please try again.');
        setLoading(false);
      });

      rzp.open();
    } catch (e: any) {
      toast.error(e?.message || 'Could not start checkout');
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" className="w-full" onClick={handlePay} disabled={loading}>
      {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <IndianRupee className="mr-1.5 h-3.5 w-3.5" />}
      {loading ? 'Opening checkout…' : label}
    </Button>
  );
}
