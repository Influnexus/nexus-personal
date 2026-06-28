import Link from 'next/link';
import { Logo } from '@/components/app/Logo';
import { ThemeToggle } from '@/components/app/ThemeToggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 grid-fade opacity-[0.25] dark:opacity-10" />
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <div className="flex items-center gap-2"><ThemeToggle /><Link href="/" className="text-sm text-muted-foreground hover:text-foreground">Home</Link></div>
      </header>
      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-80px)] max-w-md items-center justify-center px-6 pb-16">
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
