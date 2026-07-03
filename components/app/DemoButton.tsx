'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DemoButtonProps {
  className?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  label?: string;
}

export function DemoButton({ className, size = 'lg', variant = 'outline', label = 'Try live demo — no signup' }: DemoButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleClick = async () => {
    setLoading(true);
    try {
      // Fetch CSRF token first (required for NextAuth v5 Credentials provider)
      const csrfRes = await fetch('/api/auth/csrf');
      const { csrfToken } = await csrfRes.json();
      
      const res = await signIn('demo', { redirect: false, csrfToken });
      if (!res || res.error) {
        toast.error('Could not start the demo. Please try again.');
        setLoading(false);
        return;
      }
      router.push('/dashboard?demo=welcome');
    } catch (e) {
      toast.error('Could not start the demo. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Button size={size} variant={variant} className={cn('rounded-full', className)} onClick={handleClick} disabled={loading}>
      {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
      {loading ? 'Spinning up your demo…' : label}
    </Button>
  );
}
