// Nexus Personal shell (Sprint P2) — deliberately calm and minimal: no enterprise sidebar,
// no dense analytics chrome. Distinct product experience per P2.8.
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { PersonalSignOut } from '@/components/personal/PersonalSignOut';
import { Badge } from '@/components/ui/badge';

export default async function PersonalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const isDemo = !!session.user.isDemo;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-4 px-4">
          <Link href="/personal" className="flex items-center gap-2" data-testid="personal-wordmark">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background"><Wallet className="h-3.5 w-3.5" /></span>
            <span className="text-sm font-semibold tracking-tight">Nexus <span className="text-muted-foreground font-normal">Personal</span></span>
          </Link>
          <nav className="ml-2 flex items-center gap-1 text-sm">
            <Link href="/personal" className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">Overview</Link>
            <Link href="/personal/forecast" className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">Forecast</Link>
            <Link href="/personal/alerts" className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">Alerts</Link>
            <Link href="/personal/transactions" className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">Transactions</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {isDemo && <Badge variant="secondary" className="text-[10px]" data-testid="personal-demo-pill">Demo — fictional data</Badge>}
            {!isDemo && <Link href="/dashboard" className="text-xs text-muted-foreground hover:text-foreground hover:underline">Business →</Link>}
            <PersonalSignOut />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 pb-16">{children}</main>
    </div>
  );
}
