'use client';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ArrowUpRight, Users, Building2, Activity, TrendingUp, Sparkles, Bot, Workflow, FileText, Clock } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const fetcher = (url: string) => fetch(url).then(r => r.json());

const chartData = Array.from({ length: 14 }).map((_, i) => ({
  d: `D${i + 1}`,
  v: Math.round(2400 + Math.sin(i / 2) * 800 + i * 110 + (i % 3) * 90),
}));

const actionLabels: Record<string, string> = {
  'user.register': 'created account',
  'org.create': 'created the workspace',
  'team.invite': 'invited a teammate',
  'team.invitation.accepted': 'accepted an invitation',
  'team.member.removed': 'removed a member',
  'team.member.role_updated': 'updated a member role',
};

function timeAgo(d: string | Date) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const orgId = session?.user?.activeOrgId;
  const { data: orgsData, isLoading: orgsLoading } = useSWR('/api/organizations', fetcher);
  const { data: membersData } = useSWR(orgId ? `/api/organizations/${orgId}/members` : null, fetcher);
  const { data: auditData } = useSWR(orgId ? `/api/organizations/${orgId}/audit` : null, fetcher);

  const orgs = orgsData?.organizations || [];
  const members = membersData?.members || [];
  const logs = auditData?.logs || [];
  const firstName = (session?.user?.name || '').split(' ')[0] || 'there';
  const activeOrg = orgs.find((o: any) => o.id === orgId) || orgs[0];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">Welcome back, {firstName}.</h1>
        <p className="text-sm text-muted-foreground">Here’s what’s happening across {activeOrg?.name || 'your workspace'} today.</p>
      </div>

      {!orgsLoading && orgs.length === 0 && (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="flex flex-col items-start gap-3 p-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground text-background"><Building2 className="h-5 w-5" /></div>
              <div>
                <p className="font-medium">Create your first organization</p>
                <p className="text-sm text-muted-foreground">Set up your workspace to invite teammates and start collaborating.</p>
              </div>
            </div>
            <Link href="/organization"><Button>Get started <ArrowUpRight className="ml-1.5 h-4 w-4" /></Button></Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Organizations', value: orgsLoading ? null : orgs.length, icon: Building2, delta: '+0', positive: true, hint: 'this week' },
          { label: 'Team members', value: members.length || 1, icon: Users, delta: '+0', positive: true, hint: 'this month' },
          { label: 'Active sessions', value: 1, icon: Activity, delta: 'live', positive: true, hint: 'last 24h' },
          { label: 'Workspace health', value: '99.9%', icon: TrendingUp, delta: '↑ 0.2', positive: true, hint: 'uptime' },
        ].map((s) => (
          <Card key={s.label} className="transition-all hover:shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{s.label}</CardTitle>
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted"><s.icon className="h-3.5 w-3.5 text-muted-foreground" /></div>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-semibold tracking-tight tabular-nums">{s.value ?? <Skeleton className="h-7 w-12" />}</div>
                <span className={`text-[11px] font-medium ${s.positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>{s.delta}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">Workspace activity</CardTitle>
              <CardDescription>Last 14 days · placeholder data</CardDescription>
            </div>
            <Badge variant="secondary" className="text-[10px]">Live</Badge>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12, color: 'hsl(var(--popover-foreground))' }} />
                <Area type="monotone" dataKey="v" stroke="hsl(var(--foreground))" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-foreground/20 bg-gradient-to-br from-foreground to-foreground/85 text-background">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-background/10 blur-3xl" />
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <Badge className="border-background/30 bg-background/15 text-background hover:bg-background/20">Sprint 2</Badge>
            </div>
            <CardTitle className="mt-3 text-lg text-background">Your AI workforce is almost here.</CardTitle>
            <CardDescription className="text-background/70">Autonomous CFO, agents, and AI-powered insights are coming to your workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { icon: Bot, label: 'AI CFO', sub: 'Financial analysis on autopilot' },
              { icon: Workflow, label: 'AI Agents', sub: 'Delegate work to autonomous agents' },
              { icon: FileText, label: 'Invoice Analysis', sub: 'Parse and reconcile in seconds' },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex items-center gap-3 rounded-lg bg-background/10 px-3 py-2.5 ring-1 ring-inset ring-background/10">
                <Icon className="h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{label}</p>
                  <p className="truncate text-[11px] text-background/60">{sub}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>Audit-logged events in this workspace</CardDescription>
          </CardHeader>
          <CardContent>
            {!orgId ? (
              <EmptyRow icon={Activity} title="No workspace selected" desc="Create or switch to an organization to see activity." />
            ) : logs.length === 0 ? (
              <EmptyRow icon={Clock} title="Nothing here yet" desc="Activity in your workspace will appear here." />
            ) : (
              <ul className="-mx-1 space-y-1">
                {logs.slice(0, 8).map((l: any) => {
                  const member = members.find((m: any) => m.userId === l.userId);
                  const name = member?.name || member?.email || 'A teammate';
                  const initials = name.split(' ').map((s: string) => s[0]).join('').slice(0,2).toUpperCase();
                  return (
                    <li key={l.id} className="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-muted/50">
                      <Avatar className="h-7 w-7"><AvatarFallback className="text-[10px]">{initials}</AvatarFallback></Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm"><span className="font-medium">{name}</span> <span className="text-muted-foreground">{actionLabels[l.action] || l.action}</span></p>
                      </div>
                      <span className="text-xs text-muted-foreground">{timeAgo(l.createdAt)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Quick actions</CardTitle><CardDescription>Get started in seconds</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <Link href="/organization" className="block"><Button variant="outline" className="w-full justify-between font-normal">Create organization <ArrowUpRight className="h-4 w-4 text-muted-foreground" /></Button></Link>
            <Link href="/team" className="block"><Button variant="outline" className="w-full justify-between font-normal">Invite teammates <ArrowUpRight className="h-4 w-4 text-muted-foreground" /></Button></Link>
            <Link href="/profile" className="block"><Button variant="outline" className="w-full justify-between font-normal">Complete profile <ArrowUpRight className="h-4 w-4 text-muted-foreground" /></Button></Link>
            <Link href="/settings" className="block"><Button variant="outline" className="w-full justify-between font-normal">Workspace settings <ArrowUpRight className="h-4 w-4 text-muted-foreground" /></Button></Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyRow({ icon: Icon, title, desc }: any) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center">
      <Icon className="h-7 w-7 text-muted-foreground" />
      <p className="mt-2.5 text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}
