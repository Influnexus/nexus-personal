import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Logo({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20 L20 4" />
          <path d="M4 4 L20 20" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </span>
      <span className="text-[15px]">NexusAI</span>
    </Link>
  );
}
