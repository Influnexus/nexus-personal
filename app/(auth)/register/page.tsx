'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }
  | { kind: 'success' };

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const loading = status.kind === 'submitting';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    // Client-side guards so the user always gets feedback.
    if (name.trim().length < 2) return setStatus({ kind: 'error', message: 'Please enter your full name.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setStatus({ kind: 'error', message: 'Please enter a valid email address.' });
    if (password.length < 8) return setStatus({ kind: 'error', message: 'Password must be at least 8 characters.' });

    setStatus({ kind: 'submitting' });
    console.log('[register] submitting', email);

    let registerOk = false;
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json().catch(() => ({} as any));
      console.log('[register] /api/register status', res.status, data);
      if (!res.ok) {
        const msg = data?.error || `Registration failed (HTTP ${res.status})`;
        setStatus({ kind: 'error', message: msg });
        toast.error(msg);
        return;
      }
      registerOk = true;
    } catch (err: any) {
      console.error('[register] network error', err);
      const msg = `Network error: ${err?.message || 'could not reach server'}. Please retry.`;
      setStatus({ kind: 'error', message: msg });
      toast.error(msg);
      return;
    }

    // Auto sign-in. If it fails for any reason, the user is still created — fall back to /login.
    try {
      const signinRes = await signIn('credentials', { email: email.trim().toLowerCase(), password, redirect: false });
      console.log('[register] signIn result', signinRes);
      if (signinRes?.error) {
        toast.success('Account created. Please sign in.');
        router.push('/login?registered=1');
        return;
      }
    } catch (err) {
      console.error('[register] signIn threw', err);
      router.push('/login?registered=1');
      return;
    }

    setStatus({ kind: 'success' });
    toast.success('Welcome to NexusAI \u2014 your workspace is ready.');
    // Try Next router first; fall back to a hard navigation so the user can never get stuck.
    // Sprint P2: if the user arrived via the "For you" chooser (?product=personal), continue
    // into the Personal onboarding instead of the business org setup. Default flow unchanged.
    const isPersonal = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('product') === 'personal';
    try { router.push(isPersonal ? '/personal/onboarding' : '/organization'); router.refresh(); } catch { /* ignore */ }
    setTimeout(() => {
      if (typeof window !== 'undefined' && window.location.pathname.startsWith('/register')) {
        window.location.href = '/organization';
      }
    }, 800);
  }

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Start your NexusAI workspace in seconds.</p>
      </div>
      <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        {status.kind === 'error' && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{status.message}</span>
          </div>
        )}
        {status.kind === 'success' && (
          <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Account created. Redirecting you to your workspace…</span>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        </div>
        <Button type="submit" disabled={loading} className="w-full" aria-busy={loading}>
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account…</> : 'Create account'}
        </Button>
        <p className="text-center text-xs text-muted-foreground">By signing up you agree to our Terms and Privacy Policy.</p>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Already have an account? <Link href="/login" className="text-foreground hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
