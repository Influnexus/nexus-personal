'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/app/Logo';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Users, Building2, Bell, Settings, CreditCard, User, FileText } from 'lucide-react';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/organization', label: 'Organization', icon: Building2 },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/billing', label: 'Billing', icon: CreditCard },
];

const secondary = [
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const Item = ({ href, label, icon: Icon }: any) => {
    const active = pathname === href || pathname?.startsWith(href + '/');
    return (
      <Link href={href}
        className={cn('group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
          active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground')}>
        <Icon className={cn('h-4 w-4', active ? '' : 'text-sidebar-foreground/60 group-hover:text-sidebar-accent-foreground')} />
        {label}
      </Link>
    );
  };
  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-14 items-center px-5"><Logo href="/dashboard" /></div>
      <div className="px-3 pb-2 pt-1">
        <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">Workspace</p>
        <nav className="space-y-0.5">{nav.map((i) => <Item key={i.href} {...i} />)}</nav>
      </div>
      <div className="mt-2 px-3">
        <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">Account</p>
        <nav className="space-y-0.5">{secondary.map((i) => <Item key={i.href} {...i} />)}</nav>
      </div>
      <div className="mt-auto p-4">
        <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3 text-xs text-sidebar-foreground/80">
          <p className="font-medium text-sidebar-foreground">Sprint 2 preview</p>
          <p className="mt-0.5 text-sidebar-foreground/60">AI CFO, Agents and Insights coming soon.</p>
        </div>
      </div>
    </aside>
  );
}
