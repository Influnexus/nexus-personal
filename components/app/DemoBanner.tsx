'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, Clock } from 'lucide-react';
import { toast } from 'sonner';

function useCountdown(expiresAt?: string | null) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!expiresAt) { setLabel(''); return; }
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setLabel('expiring…'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setLabel(`${h}h ${m}m`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return label;
}

export function DemoBanner() {
  const { data: session, update } = useSession();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const isDemo = !!session?.user?.isDemo;
  const countdown = useCountdown(isDemo ? (session?.user as any)?.demoExpiresAt : null);

  if (!isDemo) return null;

  const submit = async () => {
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/demo/convert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not create account'); setSaving(false); return; }
      await update({ refreshDemo: false });
      toast.success('Account created — your demo workspace is now permanently saved!');
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm md:px-6">
        <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
          <Sparkles className="h-4 w-4" /> Demo Mode
          {countdown && (
            <span className="hidden items-center gap-1 text-xs font-normal text-amber-700/80 dark:text-amber-400/70 sm:inline-flex">
              <Clock className="h-3 w-3" /> resets in {countdown}
            </span>
          )}
        </div>
        <Button size="sm" className="rounded-full" onClick={() => setOpen(true)}>Create free account to save your work</Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save your demo workspace</DialogTitle>
            <DialogDescription>Create a free account and keep everything you've explored — invoices, transactions, chats and reports. Nothing is lost.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" /></div>
            <div className="space-y-1.5"><Label>Password</Label><Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Not now</Button>
            <Button onClick={submit} disabled={saving || !form.name || !form.email || form.password.length < 8}>{saving ? 'Saving…' : 'Create account & keep my data'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
