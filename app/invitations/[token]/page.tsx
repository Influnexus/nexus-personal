'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { toast } from 'sonner';

export default function AcceptInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setLoading(true);
    try {
      const res = await fetch(`/api/invitations/${token}/accept`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) { setError(d.error); toast.error(d.error); return; }
      await update({ activeOrgId: d.organizationId });
      toast.success('Invitation accepted');
      router.push('/dashboard');
    } finally { setLoading(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>You’re invited</CardTitle><CardDescription>Join the workspace on NexusAI.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {status === 'unauthenticated' ? (
            <>
              <p className="text-sm text-muted-foreground">Please sign in or create an account to accept this invitation.</p>
              <div className="flex gap-2">
                <Link className="flex-1" href={`/login?callbackUrl=/invitations/${token}`}><Button className="w-full">Sign in</Button></Link>
                <Link className="flex-1" href={`/register?callbackUrl=/invitations/${token}`}><Button variant="outline" className="w-full">Create account</Button></Link>
              </div>
            </>
          ) : (
            <Button onClick={accept} disabled={loading} className="w-full">{loading ? 'Accepting…' : 'Accept invitation'}</Button>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
