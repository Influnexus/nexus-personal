'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Users, Building2, Bell, Settings, CreditCard, User, Sparkles, MessageSquare, FileText, Receipt, BarChart3, Sliders, Brain, LineChart } from 'lucide-react';
import { OrgSwitcher } from './OrgSwitcher';

const aiCfo = [
  { href: '/dashboard', label: 'Executive Overview', icon: LayoutDashboard },
  { href: '/cfo/chat', label: 'Ask the CFO', icon: MessageSquare, badge: 'AI' },
  { href: '/cfo/invoices', label: 'Invoices', icon: Receipt },
  { href: '/cfo/transactions', label: 'Transactions', icon: BarChart3 },
  { href: '/cfo/reports', label: 'Reports', icon: FileText },
  { href: '/cfo/scenario', label: 'Scenario Simulator', icon: Sliders },
  { href: '/memory', label: 'Executive Memory', icon: Brain },
];
const workspace = [
  { href: '/team', label: 'Team', icon: Users },
  { href: '/organization', label: 'Organization', icon: Building2 },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/notifications', label: 'Notifications', icon: Bell },
];
const account = [
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppSidebar({ onNavigate, isFounder = false }: { onNavigate?: () => void; isFounder?: boolean }) {
  const pathname = usePathname();
  const Item = ({ href, label, icon: Icon, badge }: any) => {
    const active = pathname === href || pathname?.startsWith(href + '/');
    return (
      <Link href={href} onClick={onNavigate}
        className={cn('group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
          active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground')}>
        <Icon className={cn('h-4 w-4', active ? '' : 'text-sidebar-foreground/50 group-hover:text-sidebar-accent-foreground')} />
        <span className="flex-1">{label}</span>
        {badge && <span className="rounded-full bg-foreground/90 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-background">{badge}</span>}
        {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-r bg-foreground" />}
      </Link>
    );
  };
  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center px-3"><OrgSwitcher /></div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <p className="px-2.5 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">AI CFO</p>
        <nav className="space-y-0.5">{aiCfo.map(i => <Item key={i.href} {...i} />)}</nav>
        <p className="mt-5 px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">Workspace</p>
        <nav className="space-y-0.5">{workspace.map(i => <Item key={i.href} {...i} />)}</nav>
        <p className="mt-5 px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">Account</p>
        <nav className="space-y-0.5">{account.map(i => <Item key={i.href} {...i} />)}</nav>
        {isFounder && (
          <>
            <p className="mt-5 px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">Founder</p>
            <nav className="space-y-0.5"><Item href="/admin/analytics" label="Analytics" icon={LineChart} badge="PRIVATE" /></nav>
          </>
        )}
      </div>
      <div className="p-3">
        <div className="relative overflow-hidden rounded-xl border border-sidebar-border bg-gradient-to-br from-sidebar-accent/60 to-sidebar-accent/20 p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/80"><Sparkles className="h-3.5 w-3.5" /> AI Workforce</div>
          <p className="mt-1.5 text-xs text-sidebar-foreground/60">CFO is live. HR, Sales and Legal agents are next.</p>
        </div>
      </div>
    </div>
  );
}
