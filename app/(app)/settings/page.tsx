'use client';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { signOut } from 'next-auth/react';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account and workspace preferences.</p>
      </div>
      <Tabs defaultValue="appearance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        <TabsContent value="appearance">
          <Card>
            <CardHeader><CardTitle className="text-base">Theme</CardTitle><CardDescription>Choose how NexusAI looks to you.</CardDescription></CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {['light','dark','system'].map(t => (
                  <Button key={t} variant={theme === t ? 'default' : 'outline'} size="sm" onClick={() => setTheme(t)} className="capitalize">{t}</Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="notifications">
          <Card>
            <CardHeader><CardTitle className="text-base">Email notifications</CardTitle><CardDescription>What we email you about.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {['Product updates','Security alerts','Weekly digest'].map(label => (
                <div key={label} className="flex items-center justify-between rounded-lg border p-3">
                  <Label className="text-sm font-normal">{label}</Label>
                  <Switch defaultChecked />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="security">
          <Card>
            <CardHeader><CardTitle className="text-base">Sessions</CardTitle><CardDescription>Sign out of this device.</CardDescription></CardHeader>
            <CardContent><Button variant="destructive" onClick={() => signOut({ callbackUrl: '/' })}>Sign out</Button></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
