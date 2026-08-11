import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AppSidebar } from '@/components/app/AppSidebar';
import { TopNav } from '@/components/app/TopNav';
import { DemoBanner } from '@/components/app/DemoBanner';
import { FeedbackWidget } from '@/components/app/FeedbackWidget';
import { isFounderEmail } from '@/lib/analytics/founder';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const founder = isFounderEmail(session.user.email);
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden md:block"><AppSidebar isFounder={founder} /></div>
      <div className="flex min-w-0 flex-1 flex-col">
        <DemoBanner />
        <TopNav />
        <main className="flex-1">{children}</main>
      </div>
      <FeedbackWidget />
    </div>
  );
}
