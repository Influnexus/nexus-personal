'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Users, Mail, Copy } from 'lucide-react';
import Link from 'next/link';

const fetcher = (u: string) => fetch(u).then(r => r.json());

export default function TeamPage() {
  const { data: session } = useSession();
  const orgId = session?.user?.activeOrgId;
  const { data: m, mutate: mm } = useSWR(orgId ? `/api/organizations/${orgId}/members` : null, fetcher);
  const { data: inv, mutate: mi } = useSWR(orgId ? `/api/organizations/${orgId}/invitations` : null, fetcher);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [loading, setLoading] = useState(false);

  if (!orgId) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center">
        <Users className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="mt-3 text-xl font-semibold">No active organization</h2>
        <p className="mt-1 text-sm text-muted-foreground">Create an organization to invite team members.</p>
        <Link href="/organization" className="mt-4 inline-block"><Button>Go to organization</Button></Link>
      </div>
    );
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/invitations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role }) });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Could not invite'); return; }
      toast.success('Invitation created');
      setEmail('');
      mi();
    } finally { setLoading(false); }
  }

  function copyInviteLink(token: string) {
    const url = `${window.location.origin}/invitations/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Invite link copied');
  }

  async function removeMember(mid: string) {
    await fetch(`/api/organizations/${orgId}/members/${mid}`, { method: 'DELETE' });
    toast.success('Member removed');
    mm();
  }

  const members = m?.members || [];
  const invitations = (inv?.invitations || []).filter((i: any) => i.status === 'PENDING');

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Team</h1>
        <p className="text-sm text-muted-foreground">Invite teammates and manage roles.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite a teammate</CardTitle>
          <CardDescription>They’ll receive an invite link to join your workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={invite} className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="em">Email</Label>
              <Input id="em" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
            </div>
            <div className="w-full space-y-1.5 md:w-40">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="VIEWER">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send invite</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Members</CardTitle><CardDescription>{members.length} member{members.length === 1 ? '' : 's'}</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {members.map((mem: any) => {
                const initials = (mem.name || mem.email || '?').split(' ').map((s: string) => s[0]).join('').slice(0,2).toUpperCase();
                return (
                  <TableRow key={mem.membershipId}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-7 w-7"><AvatarFallback>{initials}</AvatarFallback></Avatar>
                        <span className="font-medium">{mem.name || '—'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{mem.email}</TableCell>
                    <TableCell><Badge variant="secondary">{mem.role}</Badge></TableCell>
                    <TableCell className="text-right">
                      {mem.role !== 'OWNER' && (
                        <Button variant="ghost" size="sm" onClick={() => removeMember(mem.membershipId)}>Remove</Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Pending invitations</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y">
              {invitations.map((i: any) => (
                <li key={i.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted"><Mail className="h-4 w-4 text-muted-foreground" /></div>
                    <div>
                      <p className="text-sm font-medium">{i.email}</p>
                      <p className="text-xs text-muted-foreground">{i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => copyInviteLink(i.token)}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link</Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
