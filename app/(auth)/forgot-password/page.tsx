'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    if (res.ok) { setSent(true); toast.success('Check your email for reset instructions'); }
  }

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">We’ll send a reset link to your email.</p>
      </div>
      {sent ? (
        <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">If an account exists for <span className="text-foreground">{email}</span>, a reset link has been sent.</div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          </div>
          <Button className="w-full" type="submit">Send reset link</Button>
        </form>
      )}
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Remembered it? <Link href="/login" className="text-foreground hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
