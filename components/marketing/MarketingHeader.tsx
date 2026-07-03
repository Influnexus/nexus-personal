'use client';
import Link from 'next/link';
import { Logo } from '@/components/app/Logo';
import { ThemeToggle } from '@/components/app/ThemeToggle';
import { Button } from '@/components/ui/button';
import { DemoButton } from '@/components/app/DemoButton';

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground transition">Features</a>
          <a href="#platform" className="hover:text-foreground transition">Platform</a>
          <a href="#pricing" className="hover:text-foreground transition">Pricing</a>
          <a href="#customers" className="hover:text-foreground transition">Customers</a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
          <DemoButton size="sm" variant="secondary" label="Try demo" className="hidden sm:inline-flex" />
          <Link href="/register"><Button size="sm" className="rounded-full">Get started</Button></Link>
        </div>
      </div>
    </header>
  );
}
