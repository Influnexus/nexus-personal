'use client';
// Sprint P2 — starts a Nexus PERSONAL demo session (kind='personal' workspace, fictional ₹ data).
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function PersonalDemoButton({ className, label = 'Try the Personal demo' }: { className?: string; label?: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleClick = async () => {
    setLoading(true);
    try {
      const csrfRes = await fetch('/api/auth/csrf');
      const { csrfToken } = await csrfRes.json();
      const res = await signIn('demo', { redirect: false, csrfToken, product: 'personal' });
      if (!res || res.error) {
        toast.error('Could not start the demo. Please try again.');
        setLoading(false);
        return;
      }
      router.push('/personal');
    } catch {
      toast.error('Could not start the demo. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Button size="lg" variant="outline" className={cn('rounded-full', className)} onClick={handleClick} disabled={loading} data-testid="personal-demo-button">
      {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wallet className="mr-1.5 h-4 w-4" />}
      {loading ? 'Preparing your demo…' : label}
    </Button>
  );
}
