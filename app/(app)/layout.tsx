import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AppSidebar } from '@/components/app/AppSidebar';
import { TopNav } from '@/components/app/TopNav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden md:block"><AppSidebar /></div>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
