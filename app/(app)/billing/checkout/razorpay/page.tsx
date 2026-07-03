'use client';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

declare global {
  interface Window { Razorpay: any }
}

// Mounts Razorpay's Checkout for a given subscription_id. Only reachable once RAZORPAY_KEY_ID /
// RAZORPAY_KEY_SECRET are configured (Phase 4B) — the checkout API route never returns this URL
// while the provider is unconfigured.
export default function RazorpayCheckoutPage() {
  const params = useSearchParams();
  const subscriptionId = params.get('subscription_id');

  useEffect(() => {
    if (!subscriptionId) return;
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => {
      const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!key || !window.Razorpay) return;
      const rzp = new window.Razorpay({
        key,
        subscription_id: subscriptionId,
        name: 'NexusAI',
        description: 'Subscription',
        callback_url: `${window.location.origin}/billing?checkout=success`,
        theme: { color: '#111111' },
      });
      rzp.open();
    };
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, [subscriptionId]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <Card><CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm text-muted-foreground">Opening secure checkout…</p>
      </CardContent></Card>
    </div>
  );
}
