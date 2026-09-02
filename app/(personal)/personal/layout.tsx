// Nexus Personal shell (Sprint P2) — deliberately calm and minimal: no enterprise sidebar,
// no dense analytics chrome. Distinct product experience per P2.8.
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { PersonalNav } from '@/components/personal/PersonalNav';

export default async function PersonalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const isDemo = !!session.user.isDemo;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-4 px-4">
          <Link href="/personal" className="flex items-center gap-2 shrink-0" data-testid="personal-wordmark">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background"><Wallet className="h-3.5 w-3.5" /></span>
            <span className="text-sm font-semibold tracking-tight">Nexus <span className="text-muted-foreground font-normal">Personal</span></span>
          </Link>
          <PersonalNav isDemo={isDemo} />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 pb-16">{children}</main>
    </div>
  );
}
