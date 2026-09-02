'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Building2, Loader2 } from 'lucide-react';

const fetcher = (u: string) => fetch(u).then(r => r.json());

export default function OrganizationPage() {
  const router = useRouter();
  const { update } = useSession();
  const { data, mutate, isLoading } = useSWR('/api/organizations', fetcher);
  const orgs = data?.organizations || [];
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function onName(v: string) {
    setName(v);
    setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/organizations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, slug }) });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Could not create organization'); return; }
      toast.success('Organization created');
      await update({ activeOrgId: d.organization.id });
      await mutate();
      setName(''); setSlug('');
      router.push('/team');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Organization</h1>
        <p className="text-sm text-muted-foreground">Manage and switch between your workspaces.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create organization</CardTitle>
          <CardDescription>Workspaces are isolated environments for your team.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" required value={name} onChange={(e) => onName(e.target.value)} placeholder="Acme Inc." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" required value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme" />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={submitting || !name || !slug}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create organization
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your organizations</CardTitle>
          <CardDescription>{orgs.length} workspace{orgs.length === 1 ? '' : 's'}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
            orgs.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
                <Building2 className="h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">No organizations yet</p>
                <p className="text-sm text-muted-foreground">Create your first workspace above.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {orgs.map((o: any) => (
                  <li key={o.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium">{o.name}</p>
                      <p className="text-xs text-muted-foreground">/{o.slug}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{o.role}</Badge>
                      <Button size="sm" variant="outline" onClick={async () => { await update({ activeOrgId: o.id }); toast.success(`Switched to ${o.name}`); router.refresh(); }}>Switch</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
