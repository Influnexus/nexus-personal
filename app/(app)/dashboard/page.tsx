'use client';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpRight, Users, Building2, Activity, TrendingUp } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const fetcher = (url: string) => fetch(url).then(r => r.json());

const chartData = Array.from({ length: 14 }).map((_, i) => ({
  d: `Day ${i + 1}`,
  v: Math.round(2400 + Math.sin(i / 2) * 800 + i * 110 + Math.random() * 200),
}));

export default function DashboardPage() {
  const { data: session } = useSession();
  const { data, isLoading } = useSWR('/api/organizations', fetcher);
  const orgs = data?.organizations || [];
  const firstName = (session?.user?.name || '').split(' ')[0] || 'there';

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Welcome back, {firstName}.</h1>
        <p className="text-sm text-muted-foreground">Here’s what’s happening across your workspace today.</p>
      </div>

      {!isLoading && orgs.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-start gap-3 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Create your organization</p>
              <p className="text-sm text-muted-foreground">Set up your workspace to invite teammates and start collaborating.</p>
            </div>
            <Link href="/organization"><Button>Create organization <ArrowUpRight className="ml-1.5 h-4 w-4" /></Button></Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Organizations', value: isLoading ? null : orgs.length, icon: Building2, sub: '+0 this week' },
          { label: 'Team members', value: '1', icon: Users, sub: 'Invite to grow' },
          { label: 'Active sessions', value: '1', icon: Activity, sub: 'Last 24h' },
          { label: 'Growth', value: '+24%', icon: TrendingUp, sub: 'vs last month' },
        ].map((s) => (
          <Card key={s.label} className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tracking-tight">{s.value ?? <Skeleton className="h-7 w-12" />}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Workspace activity</CardTitle>
            <CardDescription>Last 14 days · placeholder data</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="v" stroke="hsl(var(--foreground))" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick actions</CardTitle>
            <CardDescription>Get started in seconds</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/organization" className="block"><Button variant="outline" className="w-full justify-between">Create organization <ArrowUpRight className="h-4 w-4" /></Button></Link>
            <Link href="/team" className="block"><Button variant="outline" className="w-full justify-between">Invite team <ArrowUpRight className="h-4 w-4" /></Button></Link>
            <Link href="/profile" className="block"><Button variant="outline" className="w-full justify-between">Complete profile <ArrowUpRight className="h-4 w-4" /></Button></Link>
            <Link href="/settings" className="block"><Button variant="outline" className="w-full justify-between">Workspace settings <ArrowUpRight className="h-4 w-4" /></Button></Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
