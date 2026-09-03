'use client';
// Nexus Personal responsive header navigation.
// Desktop (md+): inline links + actions — visually unchanged from the original header.
// Mobile (< md): links + actions collapse into an accessible dropdown menu (Radix handles
// open/close, Escape, click-outside and focus management), so the header always fits the
// viewport with no horizontal overflow (verified 320/360/390/430px).
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { Menu, LogOut, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PersonalSignOut } from '@/components/personal/PersonalSignOut';
import { LanguageSelector } from '@/components/personal/LanguageSelector';
import { useT } from '@/components/personal/i18n-provider';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const NAV_LINKS = [
  { href: '/personal', key: 'nav.overview' },
  { href: '/personal/forecast', key: 'nav.forecast' },
  { href: '/personal/financial-freedom', key: 'nav.freedom' },
  { href: '/personal/scenarios', key: 'nav.scenarios' },
  { href: '/personal/chat', key: 'nav.ask' },
  { href: '/personal/alerts', key: 'nav.alerts' },
];

export function PersonalNav({ isDemo }: { isDemo: boolean }) {
  const t = useT();
  return (
    <>
      {/* Desktop navigation — unchanged appearance */}
      <nav className="ml-2 hidden items-center gap-1 text-sm md:flex">
        {NAV_LINKS.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {t(l.key)}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {/* Language selector — desktop */}
        <div className="hidden md:block">
          <LanguageSelector />
        </div>
        {/* Desktop actions — unchanged appearance */}
        {isDemo && (
          <Badge variant="secondary" className="hidden text-[10px] md:inline-flex" data-testid="personal-demo-pill">
            {t('nav.demo')}
          </Badge>
        )}
        {!isDemo && (
          <Link href="/dashboard" className="hidden text-xs text-muted-foreground hover:text-foreground hover:underline md:inline-flex">
            {t('nav.business')} →
          </Link>
        )}
        <div className="hidden md:block">
          <PersonalSignOut />
        </div>

        {/* Language selector — mobile (always visible, compact) */}
        <div className="md:hidden">
          <LanguageSelector compact />
        </div>

        {/* Mobile menu — collapses nav + actions to fit any viewport */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring md:hidden"
            aria-label={t('nav.menu')}
            data-testid="personal-mobile-menu"
          >
            <Menu className="h-5 w-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {isDemo && (
              <>
                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground" data-testid="personal-demo-pill-mobile">
                  {t('nav.demo')}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
            {NAV_LINKS.map(l => (
              <DropdownMenuItem key={l.href} asChild>
                <Link href={l.href} className="cursor-pointer">{t(l.key)}</Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {!isDemo && (
              <DropdownMenuItem asChild>
                <Link href="/dashboard" className="cursor-pointer">
                  {t('nav.business')} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="cursor-pointer text-muted-foreground"
              onSelect={() => signOut({ callbackUrl: '/' })}
              data-testid="personal-signout-mobile"
            >
              <LogOut className="mr-2 h-3.5 w-3.5" /> {t('nav.signout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
