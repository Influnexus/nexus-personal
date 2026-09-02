'use client';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';

const fetcher = (u: string) => fetch(u).then(r => r.json());

export default function ProfilePage() {
  const { data, mutate } = useSWR('/api/user/profile', fetcher);
  const user = data?.user;
  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  useEffect(() => { if (user) { setName(user.name || ''); setImage(user.image || ''); } }, [user]);

  async function save() {
    const res = await fetch('/api/user/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, image }) });
    if (res.ok) { toast.success('Profile updated'); mutate(); } else { toast.error('Could not save'); }
  }

  const initials = (name || user?.email || '?').split(' ').map((s: string) => s[0]).join('').slice(0,2).toUpperCase();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Profile</h1>
        <p className="text-sm text-muted-foreground">Update your personal information.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Personal information</CardTitle><CardDescription>This information is visible to your team.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14"><AvatarImage src={image || undefined} /><AvatarFallback>{initials}</AvatarFallback></Avatar>
            <div className="flex-1">
              <Label htmlFor="image">Avatar URL</Label>
              <Input id="image" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user?.email || ''} disabled />
          </div>
          <div className="flex justify-end"><Button onClick={save}>Save changes</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}
